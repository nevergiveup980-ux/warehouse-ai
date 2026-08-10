const OPENAI_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `你叫“老伙计”，是 Runlu Warehouse AI 的语音工作伙伴。
你协助加拿大一家地面材料仓库的仓库主管完成日常工作。
规则：
1. 必须使用用户当前消息的主要语言回答：中文问就用中文，英文问就用英文；中英混合时按内容占比更高的语言回答。不要因为历史对话、产品名或“嘿、Hi、Hello”等短开场词改变主要语言判断。
2. 回答简短、自然，通常不超过三句，适合手机朗读。
3. 不知道真实库存时绝不猜测；明确说明尚未连接真实库存工具。
4. 产品别名知识：绿色地垫通常指 Heather Choice；绿色袋通常指 Platinum；紫色袋通常指 Spill Blocker。
5. 用户说“老伙计，开工”时，回答“我在。开始今天的工作。”
6. 当前 Warehouse Voice 仍是只读语音助手，不执行收货、移库、删除或其他数据写入。系统可能提供 warehouseContext；只能基于它回答，不得假装执行任何操作。
7. 如果 warehouseContext.authoritativeLocalAnswer 存在，它来自实时 Warehouse OS 的确定性本地查询，是本轮库存数量、位置等事实的最高优先级来源。不得与它矛盾；可以把它改写得更自然，但不能改变事实。
8. warehouseContext.aiPolicy 仅用于说明调用模式，不改变只读安全规则。`;

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

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function normalizedUsage(payload) {
  const u = payload && payload.usage && typeof payload.usage === "object" ? payload.usage : {};
  const input_tokens = Number(u.input_tokens || 0);
  const output_tokens = Number(u.output_tokens || 0);
  const total_tokens = Number(u.total_tokens || input_tokens + output_tokens || 0);
  return { input_tokens, output_tokens, total_tokens };
}

function estimatedCostUsd(usage, env, kind) {
  // Optional estimates only. Configure rates as Worker secrets/vars in USD per 1M tokens.
  const prefix = kind === "scan" ? "OPENAI_VISION" : "OPENAI";
  const inputRate = Number(env[`${prefix}_INPUT_USD_PER_1M`] || env.OPENAI_INPUT_USD_PER_1M || "");
  const outputRate = Number(env[`${prefix}_OUTPUT_USD_PER_1M`] || env.OPENAI_OUTPUT_USD_PER_1M || "");
  if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate)) return null;
  return (Number(usage.input_tokens || 0) * inputRate + Number(usage.output_tokens || 0) * outputRate) / 1000000;
}


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

function parseJsonObject(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {}
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(cleaned.slice(a, b + 1)); } catch {}
  }
  return null;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN || "*");

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET") return json({ ok: true, service: "Runlu Voice + Scan GPT Gateway", version: "0.4.0-usage-ledger" }, 200, headers);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);
    if (!env.OPENAI_API_KEY) return json({ error: "Worker 尚未设置 OPENAI_API_KEY。" }, 500, headers);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "请求格式不是有效 JSON。" }, 400, headers);
    }

    if (body.task === "scan") {
      const image = String(body.image || "");
      if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(image)) return json({ error: "Scan image is missing or unsupported." }, 400, headers);
      if (image.length > 9000000) return json({ error: "Scan image is too large. Please use a smaller review image." }, 413, headers);
      const documentType = String(body.documentType || "auto").slice(0, 100);
      const knownProducts = Array.isArray(body.knownProducts) ? body.knownProducts.slice(0, 500) : [];
      const productHint = knownProducts.length ? `\nKnown warehouse products (matching aid only): ${JSON.stringify(knownProducts).slice(0, 30000)}` : "";
      try {
        const openaiResponse = await fetch(OPENAI_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: env.OPENAI_VISION_MODEL || env.OPENAI_MODEL || "gpt-5-mini",
            instructions: SCAN_SYSTEM_PROMPT,
            input: [{ role: "user", content: [
              { type: "input_text", text: `Document type selected by user: ${documentType}.${productHint}` },
              { type: "input_image", image_url: image, detail: "auto" }
            ]}],
            store: false,
            max_output_tokens: 700,
          }),
        });
        const payload = await openaiResponse.json();
        if (!openaiResponse.ok) return json({ error: payload?.error?.message || `OpenAI Vision request failed (${openaiResponse.status})` }, openaiResponse.status, headers);
        const raw = extractOutputText(payload);
        const scan = parseJsonObject(raw);
        if (!scan) return json({ error: "GPT Vision returned an unreadable structured result." }, 502, headers);
        const usage = normalizedUsage(payload);
        const estimated_cost_usd = estimatedCostUsd(usage, env, "scan");
        return json({ ok: true, task: "scan", scan, usage, estimated_cost_usd, model: payload.model || env.OPENAI_VISION_MODEL || env.OPENAI_MODEL || "gpt-5-mini", version: "0.4.0-usage-ledger" }, 200, headers);
      } catch (error) {
        return json({ error: `GPT Vision connection failed: ${error.message || "unknown error"}` }, 502, headers);
      }
    }

    const message = String(body.message || "").trim();
    const language = ["auto", "zh-CN", "en-CA"].includes(body.language) ? body.language : "auto";
    if (!message) return json({ error: "消息不能为空。" }, 400, headers);
    if (message.length > 1500) return json({ error: "消息太长，请缩短后重试。" }, 400, headers);

    const history = Array.isArray(body.history)
      ? body.history.slice(-8).filter(x => x && ["user", "assistant"].includes(x.role) && typeof x.content === "string")
      : [];

    const warehouseContext = body.warehouseContext && typeof body.warehouseContext === "object" ? body.warehouseContext : null;
    const contextText = warehouseContext ? `\n\nREAD-ONLY WAREHOUSE CONTEXT (current browser data, use only if relevant):\n${JSON.stringify(warehouseContext).slice(0, 12000)}` : "";

    const input = [
      ...history.map(x => ({ role: x.role, content: x.content.slice(0, 1500) })),
      { role: "user", content: message + contextText },
    ];

    try {
      const openaiResponse = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5-mini",
          instructions: SYSTEM_PROMPT + (language === "zh-CN" ? "\n本轮用户已明确选择中文，请只用中文回答。" : language === "en-CA" ? "\nThe user explicitly selected English for this turn. Reply only in English." : ""),
          input,
          store: false,
          max_output_tokens: 220,
        }),
      });

      const payload = await openaiResponse.json();
      if (!openaiResponse.ok) {
        const detail = payload?.error?.message || `OpenAI 请求失败（${openaiResponse.status}）`;
        return json({ error: detail }, openaiResponse.status, headers);
      }

      const reply = extractOutputText(payload);
      if (!reply) return json({ error: "GPT 没有返回可朗读的文字。" }, 502, headers);
      const usage = normalizedUsage(payload);
      const estimated_cost_usd = estimatedCostUsd(usage, env, "voice");
      return json({ reply, usage, estimated_cost_usd, model: payload.model || env.OPENAI_MODEL || "gpt-5-mini", version: "0.4.0-usage-ledger" }, 200, headers);
    } catch (error) {
      return json({ error: `连接 GPT 失败：${error.message || "unknown error"}` }, 502, headers);
    }
  },
};
