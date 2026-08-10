const OPENAI_URL = "https://api.openai.com/v1/responses";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_PROMPT = `你叫“老伙计”，是 Runlu Warehouse AI 的语音工作伙伴。
你协助加拿大一家地面材料仓库的仓库主管完成日常工作。
规则：
1. 必须使用用户当前消息的主要语言回答：中文问就用中文，英文问就用英文；中英混合时按内容占比更高的语言回答。
2. 回答简短、自然，通常不超过三句，适合手机朗读。
3. 不知道真实库存时绝不猜测。
4. 产品别名知识：绿色地垫通常指 Heather Choice；绿色袋通常指 Platinum；紫色袋通常指 Spill Blocker。
5. 用户说“老伙计，开工”时，回答“我在。开始今天的工作。”
6. Warehouse Voice 是只读语音助手，不执行收货、移库、删除或其他数据写入。
7. warehouseContext.authoritativeLocalAnswer 来自实时 Warehouse OS 的确定性本地查询，是本轮事实最高优先级来源，不得与它矛盾。
8. warehouseContext.aiPolicy 仅说明调用模式，不改变只读安全规则。`;

const SCAN_SYSTEM_PROMPT = `You are the vision extraction engine for RUNLU Warehouse AI Scan.
Analyze one warehouse label, order, receiving sheet, cutting sheet, product/carton label, or inventory count photo.
Return ONLY valid JSON with these keys: rawText, documentType, product, color, sku, quantity, unit, pailSize, lot, po, location, customer, notes, confidence.
Rules:
- Never invent warehouse facts that are not visible in the image. Use empty strings for unknown text fields and 0 for unknown quantity.
- confidence is an integer 0-100 for the overall extraction.
- unit should be one of Box, Carton, Pail, Bucket, Tube, Roll, Pallet, Piece, Foot, Approx. when confidently visible.
- pailSize should be 1 gal, 3 gal, or 4 gal only when clearly visible.
- If knownProducts are supplied, use them only to resolve a visible product name/SKU/color; do not force a match.
- Preserve visible PO, lot, location and customer exactly when readable.
- This is read-only extraction. Never claim inventory was changed.`;

function corsHeaders(origin, allowedOrigin) {
  const allowed = !allowedOrigin || allowedOrigin === "*" || origin === allowedOrigin;
  return {
    "Access-Control-Allow-Origin": allowed ? (origin || "*") : allowedOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}
function json(data, status, headers) { return new Response(JSON.stringify(data), { status, headers }); }
function parseJsonObject(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {}
  const a = cleaned.indexOf("{"); const b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch {} }
  return null;
}
function extractOpenAIText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts = [];
  for (const item of payload?.output || []) for (const content of item.content || []) if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
  return parts.join("\n").trim();
}
function openAIUsage(payload) {
  const u = payload?.usage || {};
  const input_tokens = Number(u.input_tokens || 0), output_tokens = Number(u.output_tokens || 0);
  return { input_tokens, output_tokens, total_tokens: Number(u.total_tokens || input_tokens + output_tokens || 0) };
}
function extractGeminiText(payload) {
  const parts = [];
  for (const c of payload?.candidates || []) for (const p of c?.content?.parts || []) if (typeof p.text === "string") parts.push(p.text);
  return parts.join("\n").trim();
}
function geminiUsage(payload) {
  const u = payload?.usageMetadata || {};
  const input_tokens = Number(u.promptTokenCount || 0), output_tokens = Number(u.candidatesTokenCount || 0);
  return { input_tokens, output_tokens, total_tokens: Number(u.totalTokenCount || input_tokens + output_tokens || 0) };
}
function estimatedCostUsd(usage, env, provider, kind) {
  const p = String(provider || "").toUpperCase();
  const k = kind === "scan" ? "VISION" : "VOICE";
  const inputRate = Number(env[`${p}_${k}_INPUT_USD_PER_1M`] || env[`${p}_INPUT_USD_PER_1M`] || "");
  const outputRate = Number(env[`${p}_${k}_OUTPUT_USD_PER_1M`] || env[`${p}_OUTPUT_USD_PER_1M`] || "");
  if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate)) return null;
  return (Number(usage.input_tokens || 0) * inputRate + Number(usage.output_tokens || 0) * outputRate) / 1_000_000;
}
function configuredProviders(env) {
  return { openai: !!env.OPENAI_API_KEY, gemini: !!env.GEMINI_API_KEY, deepseek: false, kimi: false, grok: false };
}
function chooseProvider(requested, env) {
  const available = configuredProviders(env);
  const p = ["auto","openai","gemini"].includes(String(requested || "auto")) ? String(requested || "auto") : "auto";
  if (p === "openai") { if (!available.openai) throw new Error("OPENAI_API_KEY is not configured in the Worker."); return "openai"; }
  if (p === "gemini") { if (!available.gemini) throw new Error("GEMINI_API_KEY is not configured in the Worker."); return "gemini"; }
  if (available.gemini) return "gemini";
  if (available.openai) return "openai";
  throw new Error("No cloud AI provider is configured. Add GEMINI_API_KEY or OPENAI_API_KEY to Worker Secrets.");
}
function dataUrlParts(image) {
  const m = String(image || "").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!m) return null;
  return { mimeType: m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase(), data: m[2] };
}
async function openAIScan(body, env) {
  const image = String(body.image || "");
  const documentType = String(body.documentType || "auto").slice(0,100);
  const knownProducts = Array.isArray(body.knownProducts) ? body.knownProducts.slice(0,500) : [];
  const productHint = knownProducts.length ? `\nKnown warehouse products (matching aid only): ${JSON.stringify(knownProducts).slice(0,30000)}` : "";
  const r = await fetch(OPENAI_URL,{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_VISION_MODEL||env.OPENAI_MODEL||"gpt-5-mini",instructions:SCAN_SYSTEM_PROMPT,input:[{role:"user",content:[{type:"input_text",text:`Document type selected by user: ${documentType}.${productHint}`},{type:"input_image",image_url:image,detail:"auto"}]}],store:false,max_output_tokens:700})});
  const payload = await r.json();
  if (!r.ok) throw new Error(payload?.error?.message || `OpenAI Vision request failed (${r.status})`);
  const scan = parseJsonObject(extractOpenAIText(payload)); if (!scan) throw new Error("OpenAI Vision returned an unreadable structured result.");
  return { scan, usage:openAIUsage(payload), model:payload.model||env.OPENAI_VISION_MODEL||env.OPENAI_MODEL||"gpt-5-mini" };
}
async function geminiScan(body, env) {
  const parts = dataUrlParts(body.image); if (!parts) throw new Error("Scan image is missing or unsupported.");
  const documentType = String(body.documentType || "auto").slice(0,100);
  const knownProducts = Array.isArray(body.knownProducts) ? body.knownProducts.slice(0,500) : [];
  const productHint = knownProducts.length ? `\nKnown warehouse products (matching aid only): ${JSON.stringify(knownProducts).slice(0,30000)}` : "";
  const model = env.GEMINI_VISION_MODEL || env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system_instruction:{parts:[{text:SCAN_SYSTEM_PROMPT}]},contents:[{role:"user",parts:[{text:`Document type selected by user: ${documentType}.${productHint}`},{inline_data:{mime_type:parts.mimeType,data:parts.data}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:700}})});
  const payload = await r.json();
  if (!r.ok) throw new Error(payload?.error?.message || `Gemini Vision request failed (${r.status})`);
  const scan = parseJsonObject(extractGeminiText(payload)); if (!scan) throw new Error("Gemini Vision returned an unreadable structured result.");
  return { scan, usage:geminiUsage(payload), model };
}
async function openAIVoice(body, env) {
  const message=String(body.message||"").trim(), language=["auto","zh-CN","en-CA"].includes(body.language)?body.language:"auto";
  const history=Array.isArray(body.history)?body.history.slice(-8).filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string"):[];
  const warehouseContext=body.warehouseContext&&typeof body.warehouseContext==="object"?body.warehouseContext:null;
  const contextText=warehouseContext?`\n\nREAD-ONLY WAREHOUSE CONTEXT (current browser data, use only if relevant):\n${JSON.stringify(warehouseContext).slice(0,12000)}`:"";
  const input=[...history.map(x=>({role:x.role,content:x.content.slice(0,1500)})),{role:"user",content:message+contextText}];
  const r=await fetch(OPENAI_URL,{method:"POST",headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-5-mini",instructions:SYSTEM_PROMPT+(language==="zh-CN"?"\n本轮用户已明确选择中文，请只用中文回答。":language==="en-CA"?"\nThe user explicitly selected English for this turn. Reply only in English.":""),input,store:false,max_output_tokens:220})});
  const payload=await r.json(); if(!r.ok)throw new Error(payload?.error?.message||`OpenAI request failed (${r.status})`);
  const reply=extractOpenAIText(payload); if(!reply)throw new Error("OpenAI returned no readable reply.");
  return {reply,usage:openAIUsage(payload),model:payload.model||env.OPENAI_MODEL||"gpt-5-mini"};
}
async function geminiVoice(body, env) {
  const message=String(body.message||"").trim(), language=["auto","zh-CN","en-CA"].includes(body.language)?body.language:"auto";
  const warehouseContext=body.warehouseContext&&typeof body.warehouseContext==="object"?body.warehouseContext:null;
  const contextText=warehouseContext?`\n\nREAD-ONLY WAREHOUSE CONTEXT (current browser data, use only if relevant):\n${JSON.stringify(warehouseContext).slice(0,12000)}`:"";
  const model=env.GEMINI_MODEL||"gemini-2.5-flash";
  const url=`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const history=Array.isArray(body.history)?body.history.slice(-8).filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string"):[];
  const contents=[...history.map(x=>({role:x.role==="assistant"?"model":"user",parts:[{text:x.content.slice(0,1500)}]})),{role:"user",parts:[{text:message+contextText}]}];
  const system=SYSTEM_PROMPT+(language==="zh-CN"?"\n本轮用户已明确选择中文，请只用中文回答。":language==="en-CA"?"\nThe user explicitly selected English for this turn. Reply only in English.":"");
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system_instruction:{parts:[{text:system}]},contents,generationConfig:{temperature:.25,maxOutputTokens:220}})});
  const payload=await r.json(); if(!r.ok)throw new Error(payload?.error?.message||`Gemini request failed (${r.status})`);
  const reply=extractGeminiText(payload); if(!reply)throw new Error("Gemini returned no readable reply.");
  return {reply,usage:geminiUsage(payload),model};
}

export default {
  async fetch(request, env) {
    const origin=request.headers.get("Origin")||"", headers=corsHeaders(origin,env.ALLOWED_ORIGIN||"*");
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    if(request.method==="GET")return json({ok:true,service:"RUNLU Multi-AI Gateway",version:"0.5.0-multi-ai",providers:configuredProviders(env),autoPriority:["gemini","openai"],reserved:["deepseek","kimi","grok"]},200,headers);
    if(request.method!=="POST")return json({error:"Method not allowed"},405,headers);
    let body; try{body=await request.json()}catch{return json({error:"Request body is not valid JSON."},400,headers)}
    let provider; try{provider=chooseProvider(body.provider,env)}catch(e){return json({error:e.message},503,headers)}
    if(body.task==="scan"){
      const image=String(body.image||""); if(!dataUrlParts(image))return json({error:"Scan image is missing or unsupported."},400,headers); if(image.length>9000000)return json({error:"Scan image is too large. Please use a smaller review image."},413,headers);
      try{const result=provider==="gemini"?await geminiScan(body,env):await openAIScan(body,env);const estimated_cost_usd=estimatedCostUsd(result.usage,env,provider,"scan");return json({ok:true,task:"scan",provider,...result,estimated_cost_usd,version:"0.5.0-multi-ai"},200,headers)}catch(e){return json({error:`${provider} vision connection failed: ${e.message||"unknown error"}`,provider},502,headers)}
    }
    const message=String(body.message||"").trim(); if(!message)return json({error:"Message is empty."},400,headers); if(message.length>1500)return json({error:"Message is too long."},400,headers);
    try{const result=provider==="gemini"?await geminiVoice(body,env):await openAIVoice(body,env);const estimated_cost_usd=estimatedCostUsd(result.usage,env,provider,"voice");return json({ok:true,provider,...result,estimated_cost_usd,version:"0.5.0-multi-ai"},200,headers)}catch(e){return json({error:`${provider} connection failed: ${e.message||"unknown error"}`,provider},502,headers)}
  }
};
