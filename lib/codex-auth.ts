import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import path from "node:path";

const STORED_AUTH_PATH = [".internal", "credentials", "codex-auth.json"];

export async function createCodexHome() {
  const authJson = await readCodexAuthJson();
  if (!authJson) {
    return null;
  }

  const codexHome = await mkdtemp(path.join(tmpdir(), "helixpay-codex-home-"));
  await mkdir(codexHome, { recursive: true });
  await writeFile(path.join(codexHome, "auth.json"), authJson, {
    mode: 0o600,
  });
  await writeFile(
    path.join(codexHome, "config.toml"),
    'preferred_auth_method = "chatgpt"\n',
    "utf8",
  );
  return codexHome;
}

export async function sandboxCodexAuthFiles() {
  const authJson = await readCodexAuthJson();
  const config = {
    path: ".codex/config.toml",
    content: Buffer.from(
      `preferred_auth_method = "${process.env.OPENAI_API_KEY ? "apikey" : "chatgpt"}"\n`,
      "utf8",
    ),
  };
  if (!authJson) {
    return [config];
  }

  return [
    {
      path: ".codex/auth.json",
      content: authJson,
    },
    config,
  ];
}

export async function hasCodexAuth() {
  return Boolean(await readCodexAuthJson());
}

export async function saveCodexAuth(input: string) {
  const trimmed = input.trim();
  const json = parseAuthInput(trimmed);
  const parsed = JSON.parse(json.toString("utf8")) as {
    token?: string;
    refreshToken?: string;
    tokens?: {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
    };
    OPENAI_API_KEY?: unknown;
  };
  if (
    !parsed.token &&
    !parsed.refreshToken &&
    !parsed.tokens?.access_token &&
    !parsed.tokens?.refresh_token &&
    !parsed.tokens?.id_token &&
    !parsed.OPENAI_API_KEY
  ) {
    throw new Error("Access file must include valid assistant credentials");
  }

  const file = storedAuthFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, json, { mode: 0o600 });
}

export async function importLocalCodexAuth() {
  const localAuth = await readFile(path.join(homedir(), ".codex", "auth.json"), "utf8");
  await saveCodexAuth(localAuth);
}

async function readCodexAuthJson() {
  if (process.env.CODEX_AUTH_JSON_B64) {
    return Buffer.from(process.env.CODEX_AUTH_JSON_B64, "base64");
  }

  try {
    return await readFile(storedAuthFile());
  } catch {
    return null;
  }
}

function parseAuthInput(input: string) {
  if (input.startsWith("{")) {
    JSON.parse(input);
    return Buffer.from(input, "utf8");
  }

  const decoded = Buffer.from(input, "base64");
  JSON.parse(decoded.toString("utf8"));
  return decoded;
}

function storedAuthFile() {
  return path.join(dataRoot(), "credentials", "codex-auth.json");
}

function dataRoot() {
  return process.env.DATA_DIR ?? (process.env.VERCEL ? "/tmp/helixpay-context-agent" : path.join(process.cwd(), ".internal"));
}

export function codexAuthEnv(codexHome: string | null) {
  return codexHome
    ? {
        CODEX_HOME: codexHome,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
      }
    : {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
      };
}
