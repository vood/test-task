import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { codexAuthEnv, createCodexHome } from "../lib/codex-auth";

type JsonRecord = Record<string, unknown> & {
  id: string;
  source_refs: string[];
};

type NormalizedOutput = {
  entities: JsonRecord[];
  facts: JsonRecord[];
  causal_chains: JsonRecord[];
};

const normalizedDir = path.join(process.cwd(), "data", "normalized");

async function main() {
  const dataFiles = await listDataFiles();
  const output = await runLlmNormalization(dataFiles);

  try {
    validateRecords(output);
  } catch (error) {
    await writeFile("/tmp/helixpay-normalization-debug.json", JSON.stringify(output, null, 2), "utf8");
    throw error;
  }
  await mkdir(normalizedDir, { recursive: true });
  await writeJsonl("entities.jsonl", output.entities);
  await writeJsonl("facts.jsonl", output.facts);
  await writeJsonl("causal_chains.jsonl", output.causal_chains);
  await writeReadme();

  console.log(
    `Wrote ${output.entities.length} entities, ${output.facts.length} facts, ${output.causal_chains.length} causal chains from LLM normalization.`,
  );
}

async function runLlmNormalization(dataFiles: string[]): Promise<NormalizedOutput> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "helixpay-normalize-"));
  const outputFile = path.join(tempDir, "normalization.json");
  const codexHome = await createCodexHome();

  try {
    const prompt = [
      "You are building the generated normalization layer for a company-context assistant.",
      "",
      "Inspect the source files under data/ and infer the normalized interpretation layer. Do not only parse metadata; resolve entities, aliases, stale facts, conflicts, and causal chains from the documents.",
      "",
      "You must use the filesystem and shell tools to read, search, and compare the source files before answering. Prefer original files under data/ as evidence. Do not read or reuse data/normalized as input.",
      "",
      "Do not return placeholder, error, or unavailable records. If a required detail is hard to resolve, inspect more original files and return the best supported normalized interpretation with confidence.",
      "",
      "Return only records supported by original documents. Every record must include source_refs pointing to original files under data/. Never cite data/normalized files.",
      "",
      "Normalize these categories:",
      "- entities: organizations, products, initiatives, and ambiguous people that need disambiguation.",
      "- facts: important current/stale/conflicting business facts that the assistant should prefer when answering.",
      "- causal_chains: concise explanations of why important outcomes happened, with supporting source_refs.",
      "",
      "Keep the output focused: prefer the smallest set of high-value records that covers the required ambiguities and facts. Do not attempt to build a complete ontology for every person or document.",
      "",
      "Required ambiguity coverage: Maria Silva vs Maria Santos, Aisha Yusof vs Aisha Mahmud, Sara Wijaya vs Sarah Ng, POS vs POS Self-Service, CRM migration status, Confluence timeline, NPS scope, Brazil pipeline quality, Tap underperformance, Açaí Express, Cosmos Hotels, and Brazil CS capacity.",
      "",
      "Use stable IDs such as entity.person.maria_silva. Include aliases, distinct_from, reports_to, owner, confidence, claim, chain_steps, or other useful fields when supported.",
      "",
      "Final response format: return only valid JSON with exactly these top-level keys: entities, facts, causal_chains. Do not wrap it in markdown.",
      "",
      "Files available under data/:",
      dataFiles.map((file) => `- ${file}`).join("\n"),
    ].join("\n");

    const result = await runCodex(prompt, outputFile, codexHome);
    if (result.code !== 0) {
      throw new Error(`LLM normalization failed.\n${result.stderr || result.stdout}`);
    }

    const raw = await readFile(outputFile, "utf8");
    return parseNormalization(raw);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    if (codexHome) {
      await rm(codexHome, { recursive: true, force: true });
    }
  }
}

function runCodex(prompt: string, outputFile: string, codexHome: string | null) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const args = [
      "exec",
      "--cd",
      process.cwd(),
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--output-last-message",
      outputFile,
      prompt,
    ];

    if (process.env.NORMALIZE_MODEL) {
      args.splice(1, 0, "--model", process.env.NORMALIZE_MODEL);
    }

    const child = spawn("codex", args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...codexAuthEnv(codexHome),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.on("error", (error) => {
      resolve({ stdout, stderr: `${stderr}\n${error.message}`, code: 1 });
    });
  });
}

async function listDataFiles() {
  const files = await listFiles(path.join(process.cwd(), "data"));
  return files
    .map((file) => path.relative(process.cwd(), file))
    .filter((file) => !file.startsWith(`data${path.sep}normalized${path.sep}`))
    .sort();
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(absolute) : [absolute];
    }),
  );
  return files.flat();
}

function parseNormalization(raw: string): NormalizedOutput {
  const json = raw.trim();
  const parsed = JSON.parse(json) as NormalizedOutput;
  return {
    entities: parsed.entities ?? [],
    facts: parsed.facts ?? [],
    causal_chains: parsed.causal_chains ?? [],
  };
}

function validateRecords(output: NormalizedOutput) {
  validateRecordSet("entities", output.entities);
  validateRecordSet("facts", output.facts);
  validateRecordSet("causal_chains", output.causal_chains);
  validateRequiredCoverage(output);
}

function validateRecordSet(name: string, records: JsonRecord[]) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`${name} must contain at least one record`);
  }

  const ids = new Set<string>();
  for (const record of records) {
    if (!record.id || ids.has(record.id)) {
      throw new Error(`${name} contains a missing or duplicate id: ${record.id}`);
    }
    ids.add(record.id);

    if (!Array.isArray(record.source_refs) || record.source_refs.length === 0) {
      throw new Error(`${record.id} must include source_refs`);
    }
    for (const sourceRef of record.source_refs) {
      if (!sourceRef.startsWith("data/") || sourceRef.startsWith("data/normalized/")) {
        throw new Error(`${record.id} has invalid source_ref ${sourceRef}`);
      }
      if (sourceRef.endsWith("/")) {
        throw new Error(`${record.id} source_ref must point to a file, not a directory: ${sourceRef}`);
      }
      if (!existsSync(path.join(process.cwd(), sourceRef))) {
        throw new Error(`${record.id} references missing source ${sourceRef}`);
      }
    }
  }
}

function validateRequiredCoverage(output: NormalizedOutput) {
  const serialized = JSON.stringify(output).toLowerCase();
  const requiredTerms = [
    ["maria_silva", "maria silva"],
    ["maria_santos", "maria santos"],
    ["aisha_yusof", "aisha yusof"],
    ["aisha_mahmud", "aisha mahmud"],
    ["sara_wijaya", "sara wijaya"],
    ["sarah_ng", "sarah ng"],
    ["pos_self_service", "pos self-service", "pos self service"],
    ["crm"],
    ["confluence"],
    ["nps"],
    ["tap"],
    ["cosmos"],
  ];

  for (const terms of requiredTerms) {
    if (!terms.some((term) => serialized.includes(term))) {
      throw new Error(`LLM normalization missed required coverage: ${terms[0]}`);
    }
  }
}

async function writeJsonl(fileName: string, records: JsonRecord[]) {
  const content = records.map((record) => JSON.stringify(stripNulls(record))).join("\n") + "\n";
  await writeFile(path.join(normalizedDir, fileName), content, "utf8");
}

function stripNulls(record: JsonRecord) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null));
}

async function writeReadme() {
  await writeFile(
    path.join(normalizedDir, "README.md"),
    [
      "# Normalized Knowledge Layer",
      "",
      "This directory is generated by `npm run normalize` using an LLM resolution pass over the original `data/` files.",
      "",
      "The script uses Codex CLI to inspect the source corpus and infer entities, aliases, relationships, freshness, conflicts, and causal chains. Deterministic code validates the returned records and source references before writing JSONL.",
      "",
      "The assistant should prefer these records for interpretation, then use original files in `data/` as provenance and fallback evidence.",
      "",
      "Normalized files guide reasoning but should not be cited as user-facing sources.",
      "",
    ].join("\n"),
    "utf8",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
