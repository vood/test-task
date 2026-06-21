# Vercel Test Plan

This plan verifies the hosted Company Assistant from a business-user perspective and from the operational requirements of the agent-on-Vercel architecture.

## Release Gates

A preview is shippable only when all gates pass:

1. `npm run build` passes locally.
2. The app deploys to Vercel Preview with status `READY`.
3. `APP_USERNAME`, `APP_PASSWORD`, `AUTH_SECRET`, and either `CODEX_AUTH_JSON_B64` or `OPENAI_API_KEY` are configured for the target Vercel environment.
4. `npm run test:vercel` passes against the preview URL.
5. A browser smoke check confirms a business user can sign in, ask a company question, and read a sourced answer without seeing raw JSON, local/sandbox controls, or Codex logs.

## Automated Vercel Smoke Test

For protected Vercel previews:

```bash
VERCEL_DEPLOYMENT=https://your-preview.vercel.app npm run test:vercel
```

For public or local URLs:

```bash
BASE_URL=http://localhost:3000 npm run test:vercel
```

The smoke test:

- signs in with `APP_USERNAME` / `APP_PASSWORD`;
- submits a greeting and verifies it stays short and non-technical;
- submits a real chat question: `What is the CRM migration status?`;
- requires the response to be an AI-generated answer, not a hardcoded greeting;
- requires the answer to include company evidence such as `HubSpot`, `Pipedrive`, and `data/`;
- fails on known broken states, including missing credentials, OpenAI 401s, runtime errors, missing company records, raw setup text, or internal implementation wording.

## Entity Disambiguation Evals

Run the adversarial entity eval suite against a protected Vercel Preview:

```bash
VERCEL_DEPLOYMENT=https://your-preview.vercel.app npm run test:entities
```

Run the same suite against a public or local URL:

```bash
BASE_URL=http://localhost:3000 npm run test:entities
```

The entity eval suite checks that the assistant:

- prefers `data/normalized/` as the interpretation layer while backing claims with raw source references;
- distinguishes similar people, including Maria Silva vs Maria Santos, Sara Wijaya vs Sarah Ng, and Aisha Yusof vs Aisha Mahmud;
- resolves aliases such as Brasil/Brazil/HPB, CRM/HubSpot/Pipedrive migration, and POS Self-Service/Self-Serve/POS SS;
- prefers newer records for stale facts such as Confluence timing and NPS framing;
- does not collapse multi-cause issues like Brazil Tap underperformance, Açaí Express, Cosmos Hotels, or Brazil CS capacity into a single unsupported cause;
- uses bracket citations like `[1]` and includes data-file references for substantive answers.

## Manual Business-User Test

Use the latest Vercel Preview URL in a browser.

### Sign In

Expected:

- Login screen says `HelixPay` and `Company Assistant`.
- The configured credentials work.
- Error copy is plain language if credentials are wrong.

### First Chat

Ask:

```text
Hello
```

Expected:

- The assistant responds naturally and briefly.
- The answer does not include sources, freshness notes, internal file names, or implementation details.

Ask:

```text
What is the CRM migration status?
```

Expected:

- The user message appears immediately.
- Loading text says `Looking through company files...`.
- The assistant returns a readable answer, not JSON.
- Assistant text is rendered through the AI Elements message renderer, so markdown formatting should display cleanly.
- The answer mentions that SEA is mostly on HubSpot and Brazil still uses Pipedrive.
- The answer cites source paths under `data/`.
- No user-facing controls mention `local`, `sandbox`, `workspace-write`, `Codex`, or implementation details.

### Follow-Up Chat

Ask:

```text
What changed since the all-hands?
```

Expected:

- The assistant uses prior chat context only as conversation context, not as hidden source truth.
- The answer still cites files.
- Conflicts or stale claims are explained in clear language.

### New Chat

Expected:

- `New chat` starts a separate conversation.
- Existing chats remain visible in the left rail for the current runtime store.
- On mobile, the `Chats` button opens and closes the chat list.

### Ambiguity

Ask:

```text
What did Maria say?
```

Expected:

- The assistant does not silently merge Maria Silva and Maria Santos.
- It asks for clarification or explains the ambiguity.

### Credentials Missing

Temporarily test a preview without model credentials, or remove the env var in a throwaway environment.

Expected:

- The UI does not go blank.
- The assistant message explains that model access is not configured.
- Raw OpenAI 401 logs are not shown to the business user.

## Mobile Checks

Viewport widths:

- 390 x 844
- 430 x 932
- 768 x 1024

Expected:

- The chat input is reachable without horizontal scrolling.
- Messages wrap and remain readable.
- The chat list is hidden by default and opens via `Chats`.
- The sign-in form fits the viewport.

## Deployment Checks

Use:

```bash
vercel inspect <preview-url> --scope writingmate
```

Expected:

- Deployment status is `READY`.
- Build uses Next.js successfully.
- `AGENTS.md` and `data/**` are included through `outputFileTracingIncludes`.
- Preview environment includes `CODEX_AUTH_JSON_B64` or `OPENAI_API_KEY`.

## Known Limitations

- Chat history is durable on Vercel when a Blob store is attached through `BLOB_READ_WRITE_TOKEN`. Local development still uses `.internal/chats/`.
- The sandbox installs the agent CLI at runtime. Production should use a prebuilt Vercel Sandbox snapshot.
- Shared model credentials are acceptable for this take-home preview, but production should use per-workspace credential brokering and audit controls.
