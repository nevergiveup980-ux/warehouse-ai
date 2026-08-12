# Voice Gateway update for V6.1.0

The Warehouse OS can answer exact warehouse queries locally without an API call. For complex questions it can optionally use the Cloudflare Worker.

If you already deployed the Beta 0.2.1 Worker, replace its code with `voice_worker/worker.js` and keep the same `OPENAI_API_KEY` Worker Secret. You may keep using the same Worker URL in Warehouse OS.

The browser sends only a compact read-only warehouse context relevant to the question. V6.1.0 does not allow voice commands to write, delete, receive, ship, transfer, archive, or otherwise change inventory.
