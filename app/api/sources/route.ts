import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";

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

  if (!isText) {
    return NextResponse.json({
      path: safePath,
      type: "binary",
      metadata: fileMetadata(info, extension),
      content: "",
    });
  }

  const content = await readFile(absolutePath, "utf8");
  return NextResponse.json({
    path: safePath,
    type: "text",
    metadata: fileMetadata(info, extension),
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

function fileMetadata(info: { size: number; birthtime: Date; mtime: Date }, extension: string) {
  return {
    extension: extension || "none",
    sizeBytes: info.size,
    createdAt: info.birthtime.toISOString(),
    modifiedAt: info.mtime.toISOString(),
  };
}
