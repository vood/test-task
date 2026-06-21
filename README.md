# HelixPay Codex Context Agent

This is a minimal hosted company-context agent for the Codos take-home.

The implementation intentionally keeps the agent harness as the runtime:

- `AGENTS.md` defines generic source resolution rules.
- `data/normalized/` is the preferred interpretation layer for entities, aliases, conflicts, and causal chains.
- Original documents under `data/` remain the user-facing citation and audit layer.
- `POST /api/query` runs Codex against that filesystem.
- Production uses Vercel Sandbox so the Codex harness runs in an isolated Linux environment.
- Codex runs with workspace write access and may create helper artifacts under `.internal/agent-artifacts/`.
- Local development can run the same prompt through `codex exec` directly.

## Run Locally

Install dependencies:

```bash
npm install
```

Set an OpenAI API key:

```bash
cp .env.example .env.local
```

Alternatively, use shared Codex ChatGPT auth so evaluators do not need their own API keys. Set it through env:

```bash
codex login
base64 -i ~/.codex/auth.json | tr -d '\n'
```

Paste that value into `CODEX_AUTH_JSON_B64`. When an env-provided Codex auth file is present, the app creates an isolated temporary `CODEX_HOME` for each Codex run and prefers ChatGPT auth. `OPENAI_API_KEY` remains a fallback.

The UI uses simple username/password auth. Defaults are `demo` / `demo`; override them with `APP_USERNAME`, `APP_PASSWORD`, and `AUTH_SECRET`.

Run the local Codex path:

```bash
npm run query:local -- "What is the current status of Project Confluence?"
```

Run the web app:

```bash
npm run dev
```

Then call:

```bash
curl -X POST http://localhost:3000/api/query \
  -H 'content-type: application/json' \
  -d '{"runtime":"local","question":"Which all-hands claims are stale?"}'
```

## Production

Deploy to Vercel with `OPENAI_API_KEY` configured. The default API runtime is Vercel Sandbox:

```bash
curl -X POST https://your-app.vercel.app/api/query \
  -H 'content-type: application/json' \
  -d '{"question":"What should the board worry about before May 12?"}'
```

Chat history is persisted as JSON files under `.internal/chats/` locally. On Vercel, set `BLOB_READ_WRITE_TOKEN` by attaching a Vercel Blob store so conversation history survives function restarts and redeploys.

## Vercel Verification

Run the hosted smoke test against a protected Vercel Preview:

```bash
VERCEL_DEPLOYMENT=https://your-preview.vercel.app npm run test:vercel
```

Run the same test against a public or local URL:

```bash
BASE_URL=http://localhost:3000 npm run test:vercel
```

The full release checklist and business-user manual QA plan are in `TEST_PLAN.md`.
