# Solution

## Problem Framing

The assignment is intentionally ambiguous. I treated it less as "build a chatbot over documents" and more as a small version of a company-context system: a business user should be able to ask a question, get a useful answer, understand where the answer came from, and not need to know how the underlying agent works.

The core problem statements are:

1. **Company knowledge is scattered.** Facts live across interviews, updates, dashboards, org notes, and documents with different dates and levels of authority.
2. **Retrieval alone is not enough.** The hard cases are entity resolution, stale claims, contradictory sources, regional scope, aliases, and causal chains.
3. **Answers need provenance.** A useful answer must cite original documents so the user can inspect evidence and audit the reasoning.
4. **The system must stay generic.** The agent rules should not be rewritten for every company or fixture. Company-specific interpretation should live in data and normalization outputs.
5. **Users need continuity.** Multi-turn chat, persisted history, and durable clarifications matter because business questions rarely fit into one prompt.

## Non-Goals And Scope

This take-home is not trying to build:

- a full enterprise data platform
- a complete permissions and audit product
- a custom vector database or ranking engine
- a finished ingestion pipeline for every file type
- a production-grade multi-tenant credential broker
- a replacement for the agent harness

The scope is the smallest working product slice that proves the architecture:

- authenticated chat UI
- persisted conversations
- agent execution in an isolated hosted environment
- filesystem-shaped company workspace
- normalized records for entity/freshness/conflict reasoning
- original-document citations
- source preview
- regression checks for ambiguous company questions

## How This Solution Addresses It

The solution keeps the runtime generic and moves company-specific interpretation into data.

`AGENTS.md` defines reusable operating rules: inspect company records, resolve entities before answering, prefer normalized records for interpretation, cite original documents only, ask for clarification when ambiguity matters, and keep answers readable for business users.

`data/normalized/` represents the output of a future normalization pipeline. It is the preferred layer for aliases, entity identities, conflicts, stale facts, and causal chains. It guides reasoning, but it does not appear as a user-facing source. The final answer cites original records under `data/`.

The query path uses the existing agent harness over a POSIX-style workspace instead of rebuilding retrieval, planning, source inspection, and code execution in application code. That makes the system simple now and lets it improve as the underlying models and harness improve.

## Ideal Production System

The production version should look like this:

```text
Customer sources
  -> connectors and file sync
  -> remote POSIX-compatible workspace
  -> ingestion and normalization pipelines
  -> original records + normalized interpretation records + provenance graph
  -> isolated agent session with scoped filesystem permissions
  -> sourced business answer
  -> durable chat, clarification, audit, and feedback records
```

Key production components:

- **Remote workspace:** a POSIX-compatible mount backed by object storage or a remote filesystem. Users and connectors can add files without redeploying the app.
- **Ingestion pipeline:** extracts text from PDFs, docs, email exports, spreadsheets, dashboards, and OCR sources while preserving metadata such as created time, modified time, owner, source system, and permissions.
- **Normalization pipeline:** writes durable records for entities, aliases, relationships, freshness, conflicts, causal chains, and unresolved ambiguities.
- **Provenance graph:** every normalized record points back to original documents and extraction spans where possible.
- **Scoped execution:** each agent run gets only the workspace and permissions it needs. Generated artifacts go to a writable scratch area, not source data.
- **Clarification loop:** when the evidence is ambiguous, the user can clarify; accepted clarifications are persisted as workspace records instead of hidden chat memory.
- **Evaluation loop:** regression questions test entity ambiguity, stale data, conflicting metrics, source citations, and non-technical answer quality.
- **Controls:** authentication, workspace-level authorization, audit logs, retention, rate limits, and per-customer credential handling.

The important design point is that the query interface stays filesystem-native. The storage backend, normalization quality, permissions, and source connectors can mature independently without changing how the agent inspects and reasons over a workspace.

## Open Questions

- Which source systems are first-class: Drive, Slack, email, CRM, BI dashboards, ticketing, or manual uploads?
- Should clarifications be applied automatically, or reviewed before they become durable company knowledge?
- What is the permission model for mixed-sensitivity workspaces and generated artifacts?
- How should stale normalized records be detected and regenerated?
- What confidence thresholds require asking the user instead of answering with a caveat?
- Should production use persistent agent sessions through MCP, one-shot executions, or a hybrid?
- What is the expected latency budget for business users versus deeper research workflows?

## How To Run

```bash
npm install
npm run query:local -- "What is the current status of Project Confluence?"
```

For the hosted version, deploy to Vercel and set `OPENAI_API_KEY`. The production endpoint is:

```http
POST /api/query
```

Example body:

```json
{
  "question": "Which all-hands claims are stale?",
  "mode": "json"
}
```

## Architecture

This solution treats the existing agent harness as the core runtime instead of rebuilding retrieval, planning, code execution, and workspace inspection from scratch.

```text
Client
  -> authenticated Next.js chat UI
  -> chat history store
  -> Next.js query API route
  -> Vercel Sandbox
  -> Codex CLI headless execution with workspace-write permissions
  -> POSIX workspace: generic AGENTS.md + data/raw-style documents + data/normalized/
  -> sourced business answer
```

The important design choice is to keep the runtime generic and put workspace-specific interpretation into data. `AGENTS.md` defines generic operating rules: prefer normalized records for entity/freshness/conflict resolution, back claims with original documents, ask for clarification when ambiguity matters, and never expose internals. It does not contain HelixPay-specific facts.

The normalized layer is produced by a pipeline and lives in `data/normalized/`. It is the preferred interpretation layer for aliases, entities, relationships, conflicts, and causal chains. User-facing citations still point to original documents only; normalized records guide reasoning but do not appear as sources in answers.

The reason to rely on the existing agent harness is compounding quality. The harness already gives us filesystem-native inspection, tool use, command execution, code-writing inside a VM, and model-mediated search. As models and the harness improve, the system benefits without us rebuilding those capabilities in application code.

Codex is allowed to write helper code inside the workspace while answering. Generated scripts, extracted tables, notes, and scratch reports should go under `.internal/agent-artifacts/`; source files under `data/` should not be modified.

## UI And Persistence

The app includes a small chat interface behind username/password authentication. The local take-home storage layer is intentionally simple:

```text
.internal/chats/
  <chat-id>.json
```

On Vercel, chat history is stored in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is attached. Users can create new chats, return to previous chats across redeploys, and continue asking questions. Each user message and answer is appended to the chat record.

For a production version, chat history should be stored in the same remote workspace model or a database keyed to that workspace. The important product property is that history and user clarifications are durable and auditable, not hidden in ephemeral model memory.

## Remote Filesystem Model

The bundled `data/` directory is the take-home fixture, not the final storage architecture.

The intended production architecture is a POSIX-compatible mounted workspace backed by a remote store. Users can dump files into that remote store directly. At query time, Codex sees the same shape it expects locally:

```text
/workspace/customer-id/
  AGENTS.md
  data/
    raw/
    normalized/
    pipeline-artifacts/
```

This preserves the agent harness contract while allowing the backing storage to evolve. The simplest production interface is still a filesystem: users and ingestion jobs can sync files into the remote store, and the agent sees a normal POSIX workspace.

Filesystem permissions are also a strong boundary for future controls. Read/write permissions can be scoped by workspace, folder, or generated-artifact area. This take-home does not implement full permission management, but the architecture is compatible with it because the main contract is filesystem access rather than bespoke app-level retrieval APIs.

Pipelines can run inside or beside the store to extract OCR/PDF text, normalize aliases, disambiguate entities, generate causal chains, detect conflicts, and write derived files under `data/normalized/` without changing the query interface.

The normalized records are preferred but not user-facing evidence. They should include provenance to original documents:

```json
{
  "id": "chain.customer_loss",
  "claim": "Customer loss causal summary",
  "chain_steps": ["step one", "step two"],
  "confidence": 0.96,
  "source_refs": ["data/email/example.md", "data/dashboards/example.html"]
}
```

At answer time, the agent should inspect normalized records first, then cite the original documents from `source_refs`.

## Ambiguity Handling

Entity resolution is not just a retrieval problem. Company data often contains repeated names, recycled emails, nicknames, stale org records, and aliases that cannot be resolved confidently from local evidence.

The agent policy is:

```text
if evidence clearly resolves the entity:
  answer and cite the evidence
else if ambiguity affects the answer:
  ask the user for clarification
else:
  answer with a caveat and list the unresolved ambiguity
```

When a user clarifies an ambiguity, the clarification should be written back into the POSIX workspace as durable normalized data, for example:

```text
clarifications/
  resolved.jsonl
  rules.md

data/normalized/
  entities.jsonl
  aliases.jsonl
  unresolved.jsonl
  clarifications.jsonl
```

This keeps the system auditable and prevents hidden chat memory from becoming the only place where company truth lives. The agent can inspect clarification records as preferred interpretation data, while user-facing citations should still point to original documents when possible.

## Why Codex Harness

The assignment asks for an agent-friendly interface over scattered company context. The existing harness already provides the useful primitives for this small version:

- filesystem-native source inspection
- workspace rules through `AGENTS.md`
- command/search loop inside an isolated workspace
- ability to write and run helper code in a VM when search or parsing needs more than simple text matching
- non-interactive execution via `codex exec`
- future MCP compatibility through `codex mcp`

The hosted API is intentionally thin. It brokers isolated Codex runs and enforces a structured response contract, but it does not reimplement Codex retrieval or reasoning.

## Model Credentials

The preview supports two server-side credential modes:

1. `CODEX_AUTH_JSON_B64`: env-provided shared Codex ChatGPT-plan authentication. This is generated from a machine that already ran `codex login`, then base64-encoded from `~/.codex/auth.json`.
2. `OPENAI_API_KEY`: usage-based API key fallback.

Each Codex run receives a temporary isolated `CODEX_HOME` containing the env-provided auth file and `preferred_auth_method = "chatgpt"` when Codex auth is configured. The UI does not expose credential management. For a real multi-tenant product, shared credentials should be replaced with per-workspace credential brokering or managed service credentials with audit controls.

## Why Vercel Sandbox

Codex needs a real filesystem and subprocess execution. Vercel Sandbox provides an isolated Linux runtime where the API can install/run Codex, copy or mount the workspace, and execute a workspace-write task inside the sandbox boundary.

Cloudflare Workers alone cannot run this exact shape because Workers do not support functional child processes. Cloudflare Containers could work, but Vercel Sandbox maps more directly to this assignment: create environment, write files, run command, return result.

## Technical Challenges And Decisions

- **Storage model:** use a filesystem-shaped workspace as the core interface. It is simple to sync into, easy to inspect, and maps directly to agent capabilities. A remote POSIX-compatible mount can replace bundled files later without changing the agent contract.
- **Harness choice:** rely on the state-of-the-art agent harness instead of rebuilding retrieval and tool orchestration. This makes the system organically improve as models and harness capabilities improve.
- **Normalized data:** prefer `data/normalized/` for entity resolution, conflicts, freshness, and causal chains. Keep original raw documents as the citation layer and audit trail.
- **Agent autonomy:** allow code execution in the VM so the agent can help itself with search, parsing, table extraction, and consistency checks.
- **Controls:** filesystem permissions are the natural future control plane for workspace, folder, and artifact access. Full permission management is not implemented in this take-home.

The main remaining product challenges are:

- **Data sourcing and synchronization:** keeping remote files, extracted text, normalized records, and permissions in sync as customers add and update data.
- **Entity resolution:** building reliable normalization pipelines for aliases, similar people, stale org records, duplicated customers, and conflicting metrics.
- **Controls:** enforcing read/write permissions, audit logs, provenance, retention, and user-visible trust boundaries.

I used `codex exec` instead of `codex mcp` for the primary path because headless execution is the simplest reliable interface. `codex mcp` is the natural next step for persistent multi-turn sessions.

The current production path installs Codex in the sandbox at runtime for portability. A production version should bake the Codex binary into a sandbox snapshot to reduce cold-start time.

## Future Work

- Remote POSIX mount backed by object storage, so customers upload files without redeploying.
- Pipeline-written `normalized/` and `pipeline-artifacts/` directories for OCR, PDF extraction, alias maps, and disambiguation notes.
- User clarification flow for ambiguous entities, with resolved clarifications persisted back into the workspace.
- Persistent sessions using `codex mcp` and stored response IDs.
- Prebuilt sandbox snapshot with Codex already installed.
- Auth, rate limiting, audit logs, and per-customer workspaces.
- Regression evals with expected answers for questions about Confluence, NPS, CRM, Brazil performance, and org-chart ambiguity.
