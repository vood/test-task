import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/plain; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

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
  const file = await readFile(absolutePath);
  return new NextResponse(file, {
    headers: {
      "content-disposition": `inline; filename="${path.basename(safePath).replaceAll('"', "")}"`,
      "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    },
  });
}

function normalizeSourcePath(input: string) {
  const normalized = path.posix.normalize(input.replaceAll("\\", "/"));
  if (!normalized.startsWith("data/") || normalized.includes("../")) {
    return null;
  }
  return normalized;
}
