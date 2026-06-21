import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { sandboxCodexAuthFiles } from "./codex-auth";

type SandboxFile = {
  path: string;
  content: Buffer;
};

type WorkspaceFile = SandboxFile & {
  metadata: SourceMetadata;
};

type SourceMetadata = {
  path: string;
  extension: string;
  sizeBytes: number;
  createdAt: string;
  modifiedAt: string;
};

export async function runCodexInVercelSandbox(prompt: string, workspaceDir: string) {
  const sandbox = await Sandbox.create({
    runtime: "node24",
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
    },
  });

  const workspaceFiles = await collectWorkspaceFiles(workspaceDir);
  const files = [...workspaceFiles, sourceMetadataFile(workspaceFiles), ...(await sandboxCodexAuthFiles())];
  await sandbox.writeFiles(files);
  await sandbox.runCommand("mkdir", ["-p", "/vercel/sandbox/.codex"]);

  await sandbox.runCommand("npm", ["install", "-g", "@openai/codex"]);

  const result = await sandbox.runCommand({
    cmd: "codex",
    args: [
      "exec",
      "--cd",
      "/vercel/sandbox",
      "--sandbox",
      "danger-full-access",
      "--skip-git-repo-check",
      "--output-last-message",
      "/tmp/answer.txt",
      prompt,
    ],
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
      CODEX_HOME: "/vercel/sandbox/.codex",
    },
  });

  const stdout = await result.stdout();
  const stderr = await result.stderr();
  const answerBuffer = await sandbox.readFileToBuffer({ path: "/tmp/answer.txt" });

  return {
    code: result.exitCode,
    stdout,
    stderr,
    lastMessage: answerBuffer?.toString("utf8") ?? stdout,
  };
}

async function collectWorkspaceFiles(root: string): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [];
  await walk(root, root, files);
  return files;
}

async function walk(root: string, current: string, files: WorkspaceFile[]) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute);
    if (!isAgentWorkspacePath(relative)) {
      continue;
    }

    const info = await stat(absolute);
    if (info.isDirectory()) {
      await walk(root, absolute, files);
      continue;
    }
    if (!info.isFile()) {
      continue;
    }

    files.push({
      path: relative,
      content: await readFile(absolute),
      metadata: {
        path: relative,
        extension: path.extname(entry.name).toLowerCase() || "none",
        sizeBytes: info.size,
        createdAt: info.birthtime.toISOString(),
        modifiedAt: info.mtime.toISOString(),
      },
    });
  }
}

function isAgentWorkspacePath(relativePath: string) {
  return relativePath === "AGENTS.md" || relativePath === "data" || relativePath.startsWith(`data${path.sep}`);
}

function sourceMetadataFile(files: WorkspaceFile[]): SandboxFile {
  const dataFiles = files
    .map((file) => file.metadata)
    .filter((metadata) => metadata.path === "AGENTS.md" || metadata.path.startsWith("data/"))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    path: ".internal/source-metadata.json",
    content: Buffer.from(JSON.stringify({ generatedAt: new Date().toISOString(), files: dataFiles }, null, 2), "utf8"),
  };
}
