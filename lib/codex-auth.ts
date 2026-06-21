import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createCodexHome() {
  const authJson = readCodexAuthJson();
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
  const authJson = readCodexAuthJson();
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

function readCodexAuthJson() {
  return process.env.CODEX_AUTH_JSON_B64
    ? Buffer.from(process.env.CODEX_AUTH_JSON_B64, "base64")
    : null;
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
