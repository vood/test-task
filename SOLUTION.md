# Solution

## Problem

The homework is intentionally ambiguous. I interpreted it as a small company-context product, not just a document chatbot.

The core problems are:

1. Company knowledge is scattered across interviews, updates, dashboards, org notes, emails, and files.
2. Retrieval alone is not enough. The difficult cases are entity resolution, stale claims, conflicting sources, regional scope, aliases, and causal chains.
3. Answers need provenance. A business user should see which original documents support the answer.
4. The system should stay generic. Company-specific interpretation should live in data and pipeline outputs, not in a constantly edited prompt.
5. Users need continuity through multi-turn chat, persisted history, and durable clarifications.

## Non-Goals

This version is not a full enterprise data platform, permission system, connector suite, custom vector database, or production credential broker.

The goal is the smallest working slice that proves the architecture:

- authenticated chat UI
- persisted conversations
- hosted isolated agent execution
- filesystem-shaped company workspace
- normalized records for entity/freshness/conflict reasoning
- original-document citations
- source preview
- regression checks for ambiguous company questions

## Production Architecture

There are three main product areas.

### 1. Chat Experience

Chat is mostly a solved problem. A production product should reuse off-the-shelf components for message rendering, streaming, history, auth, attachments, and mobile behavior.

This implementation follows that direction for the highest-risk part of the UI: assistant answers and markdown source previews are rendered through a Streamdown/AI Elements-style renderer instead of custom markdown parsing. The remaining custom UI is the thin product shell: chat list, composer, authentication screen, source preview, and reference buttons. In production I would continue replacing those shell pieces with off-the-shelf chat/auth components where they do not carry product-specific behavior.

### 2. Data Sync And Permissions

This is one of the hard parts. The system needs connectors, file sync, source metadata, freshness tracking, deletion handling, access control, and audit logs.

The core storage contract should be filesystem-shaped:

```text
/workspace/customer-id/
  AGENTS.md
  data/
    raw/
    normalized/
    pipeline-artifacts/
```

Blob storage, mounted filesystems, POSIX-compatible APIs, and tools such as `rclone` are well understood and scalable. By keeping the agent contract as "inspect this workspace", sync and storage can evolve without changing the query layer.

Filesystem permissions are also a natural future control plane: read/write access can be scoped by workspace, folder, source, or generated-artifact area.

### 3. Indexing, Search, And Reasoning

Classic RAG is useful, but it should be a layer inside the system, not the whole system.

Plain vector retrieval can find semantically similar text, but it often fails on:

- similar people or teams
- stale but relevant documents
- regional metrics that should not be generalized
- aliases for projects, products, or customers
- causal chains spread across records
- conflicts between dashboards, interviews, and updates

A production system should use layered retrieval:

1. Metadata search: path, source system, owner, created time, modified time, extension, permissions.
2. Keyword and structured search: exact names, aliases, dates, metrics, customer IDs, product names.
3. Vector search: semantic recall over extracted text and chunks.
4. Normalized records: entities, aliases, facts, conflicts, causal chains, unresolved ambiguity records.
5. Agentic search: inspect files, run helper code, compare evidence, and decide whether more search is needed.

## This Implementation

This implementation focuses on the agentic and normalized-data layers because the fixture is small and the main risk is wrong synthesis, not raw recall.

The runtime uses an existing agent harness over a POSIX-style workspace. We could build the agent loop from scratch, but in a short take-home that would spend time on already-solved primitives: file inspection, planning, tool execution, command execution, retries, and structured output. Reusing a state-of-the-art harness lets the implementation focus on product-specific problems: data shape, entity resolution, provenance, citations, persistence, and UX.

The query path is:

```text
Next.js chat UI
  -> authenticated API
  -> Vercel Sandbox
  -> agent runtime over local workspace files
  -> answer with original-document references
```

`AGENTS.md` contains generic operating rules: inspect local company records, resolve entities before answering, prefer normalized records for interpretation, cite original documents only, ask for clarification when ambiguity matters, and keep answers readable for business users.

`scripts/normalize-data.ts` generates `data/normalized/`. The current pipeline is intentionally simple: it parses interview metadata for ambiguous people, applies deterministic normalization rules for known products/initiatives/facts/causal chains, validates every `source_ref`, and writes JSONL records. The normalized layer is preferred for aliases, entity identities, stale facts, conflicts, and causal chains, but it is not cited in final answers. Final references point to original files under `data/`.

## Why Vercel

The stack choice is pragmatic. It reflects familiarity with the author's platform and fits the execution model: create an isolated environment, copy workspace files, run the agent, and return the result.

Cloudflare Workers alone cannot run this exact shape because Workers do not support normal child processes. Cloudflare Containers or other container platforms could work if they preserve the same contract: isolated execution over a permissioned filesystem-shaped workspace.

## Persistence

Local chat history is stored under:

```text
.internal/chats/
```

On Vercel, chat history uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is configured. This lets users create chats, return to previous chats, and keep history across redeploys.

In production, chat history, clarifications, feedback, and audit events should be durable workspace or database records, not hidden model memory.

## Ambiguity Handling

Entity resolution is not only retrieval. Company data has repeated names, nicknames, stale org charts, duplicated customers, and conflicting metrics.

The policy is:

```text
if evidence clearly resolves the entity:
  answer and cite the original evidence
else if ambiguity affects the answer:
  ask the user for clarification
else:
  answer with a caveat and list the uncertainty
```

When a user clarifies an ambiguity, the clarification should be persisted as normalized workspace data so future answers can use it.

## Remaining Production Work

- real source connectors and sync
- robust permission model and audit logs
- richer generated normalization pipeline with OCR/PDF/table extraction and confidence review
- vector and keyword indexes as acceleration layers
- clarification review UI
- persistent agent sessions or MCP-based sessions
- prebuilt sandbox image to reduce cold start
- per-customer credential handling

## Verification

Implemented checks cover:

- production build
- hosted login
- greeting behavior
- sourced CRM answer
- multi-turn follow-up
- persisted chat history
- source preview
- entity-resolution evals for ambiguous names, stale claims, regional metrics, product distinctions, and citation rules
