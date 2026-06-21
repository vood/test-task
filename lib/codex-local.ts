import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { codexAuthEnv, createCodexHome } from "./codex-auth";

export async function runCodexLocal(prompt: string, cwd: string) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "helixpay-codex-"));
  const outputFile = path.join(tempDir, "answer.txt");
  const codexHome = await createCodexHome();

  try {
    const args = [
      "exec",
      "--cd",
      cwd,
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--output-last-message",
      outputFile,
      prompt,
    ];

    const { stdout, stderr, code } = await run("codex", args, cwd, codexHome);
    let lastMessage = stdout;
    try {
      lastMessage = await readFile(outputFile, "utf8");
    } catch {
      // Codex may fail before writing the output file. Return stdout/stderr in that case.
    }

    return { code, stdout, stderr, lastMessage };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    if (codexHome) {
      await rm(codexHome, { recursive: true, force: true });
    }
  }
}

function run(command: string, args: string[], cwd: string, codexHome: string | null) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
    const child = spawn(command, args, {
      cwd,
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
