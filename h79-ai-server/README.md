# h79-ai-server

Internal generator for HuymasterGold79 weekday boards. It is not a public chat widget and it does not update the website.

Two tasks:

- `macro` — Phần B tin vĩ mô (about 06:37 Vietnam time, weekdays)
- `domestic` — Phần C vàng trong nước (about 08:43 Vietnam time, weekdays)

The service fetches a small set of public HTTPS pages, then asks Gemini to write from those facts and URLs only. Gemini Search grounding is not enabled.

Generation only. This process has no GitHub token and does not commit or deploy site content.

## Render

Use a separate Web Service with root directory left as the repo root:

- Build command: `cd h79-ai-server && npm install`
- Start command: `cd h79-ai-server && npm start`

The process listens on `0.0.0.0` and `PORT` (default `10000`).

Turn **auto-deploy OFF**. This repository also receives daily content commits for the public site. Those commits must not rebuild or restart this AI service. Deploy manually when files under `h79-ai-server/` change.

## Environment

Set these only in the host environment. Do not commit them.

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes | Sent as the `x-goog-api-key` header. Never placed in the URL. |
| `GEMINI_MODEL` | no | Default `gemini-3.5-flash-lite`. |
| `H79_SYSTEM_PROMPT` | yes | Full approved writing prompt, read only at runtime. |
| `H79_RUN_TOKEN` | yes | `Authorization: Bearer` secret for every `POST`. |
| `PORT` | no | Default `10000`. |

If `GEMINI_API_KEY` or `H79_SYSTEM_PROMPT` is missing or blank, `POST /api/boards` returns 503. A missing or wrong run token returns 401.

`POST /api/boards` is rate-limited to 20 requests per 10 minutes per IP. JSON bodies are limited to 256 KB.

## Endpoints

`GET /health`

```bash
curl -sS "https://<h79-ai-service>.onrender.com/health"
```

`POST /api/boards`

```bash
curl -sS -X POST "https://<h79-ai-service>.onrender.com/api/boards" \
  -H "Authorization: Bearer $H79_RUN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task":"macro","datetime_vn":"2026-11-10 06:37"}'
```

`task` is `macro` or `domestic`. `datetime_vn` is optional; when omitted, the service uses the current Vietnam time. Domestic requests return 422 when no real public price quote was collected.

## Tests

```bash
cd h79-ai-server && npm test
```

Tests mock outbound HTTP. They do not call Gemini.
