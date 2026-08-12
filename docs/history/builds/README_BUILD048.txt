RUNLU Warehouse OS V6.4.7 Build048 — Multi-AI Gateway
======================================================

WHAT CHANGED
- Warehouse Voice and AI Scan now have an AI Provider selector.
- Active providers: Auto, Google Gemini, OpenAI GPT.
- Auto routing: Gemini first when GEMINI_API_KEY is configured; otherwise OpenAI.
- Reserved provider slots: DeepSeek, Kimi K3, Grok.
- API keys are never stored in index.html or browser localStorage.
- AI Usage & Cost ledger now accepts provider/model/token data from the gateway.
- Local OCR, barcode, warehouse lookup and Smart Hybrid behavior remain available.

GITHUB PAGES
1. Replace the published Warehouse OS index.html with RUNLU_Warehouse_V6.4.7_Build048_index.html (rename it to index.html when publishing).
2. Publish version.json beside index.html.
3. Keep the existing qrcode.js, tesseract files, carpet_seed.js, images and other repository assets unchanged.

CLOUDFLARE WORKER
Replace the current Worker code with RUNLU_Warehouse_V6.4.7_Build048_worker.js.

Worker Secrets (server side only):
- OPENAI_API_KEY       optional, needed for OpenAI provider
- GEMINI_API_KEY       optional, needed for Gemini provider

Optional Worker variables:
- OPENAI_MODEL         default: gpt-5-mini
- OPENAI_VISION_MODEL  default: OPENAI_MODEL / gpt-5-mini
- GEMINI_MODEL         default: gemini-2.5-flash
- GEMINI_VISION_MODEL  default: GEMINI_MODEL / gemini-2.5-flash
- ALLOWED_ORIGIN       recommended: your Warehouse OS origin

Optional cost-estimate variables, USD per 1M tokens:
- OPENAI_INPUT_USD_PER_1M / OPENAI_OUTPUT_USD_PER_1M
- OPENAI_VISION_INPUT_USD_PER_1M / OPENAI_VISION_OUTPUT_USD_PER_1M
- GEMINI_INPUT_USD_PER_1M / GEMINI_OUTPUT_USD_PER_1M
- GEMINI_VISION_INPUT_USD_PER_1M / GEMINI_VISION_OUTPUT_USD_PER_1M

FIRST TEST
- Worker GET health check should report version 0.5.0-multi-ai and configured providers.
- In Warehouse Voice: Cloud AI ON -> choose Gemini -> Save & Test.
- In AI Scan: Cloud Vision ON -> choose Gemini -> Smart Hybrid or Cloud Vision -> analyze one known order photo.
- Then switch provider to OpenAI and repeat with the same photo for A/B comparison.

SAFETY
- Never put API keys in GitHub Pages, index.html, JavaScript variables, screenshots, or browser settings.
- AI Scan remains review-before-save and does not change inventory by itself.
