import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { buildSourceMetadata } from "@/lib/source-metadata";

export const runtime = "nodejs";

const TEXT_EXTENSIONS = new Set([".html", ".json", ".jsonl", ".md", ".txt"]);

export async function GET(request: NextRequest) {
  const { response } = await requireUser();
  if (response) {
    return response;
  }

  const requestedPath = request.nextUrl.searchParams.get("path") ?? "";
  const safePath = normalizeSourcePath(requestedPath);
  if (!safePath) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const absolutePath = path.join(process.cwd(), "data", safePath.replace(/^data\//, ""));
  const info = await stat(absolutePath).catch(() => null);
  if (!info?.isFile()) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const extension = path.extname(safePath).toLowerCase();
  const isText = TEXT_EXTENSIONS.has(extension);

  const raw = await readFile(absolutePath);
  const content = isText ? raw.toString("utf8") : "";
  const metadata = buildSourceMetadata({
    path: safePath,
    content,
    sizeBytes: info.size,
    birthtime: info.birthtime,
    mtime: info.mtime,
  });

  if (!isText) {
    return NextResponse.json({
      path: safePath,
      type: "binary",
      metadata,
      content: "",
    });
  }

  return NextResponse.json({
    path: safePath,
    type: "text",
    metadata,
    content,
  });
}

function normalizeSourcePath(input: string) {
  const normalized = path.posix.normalize(input.replaceAll("\\", "/"));
  if (!normalized.startsWith("data/") || normalized.includes("../")) {
    return null;
  }
  return normalized;
}
