import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { hasCodexAuth } from "@/lib/codex-auth";

export const runtime = "nodejs";

export async function GET() {
  const { response } = await requireUser();
  if (response) {
    return response;
  }

  const codexAuth = await hasCodexAuth();
  return NextResponse.json({
    codexAuth,
    openaiApiKey: Boolean(process.env.OPENAI_API_KEY),
    preferred: codexAuth ? "chatgpt" : "apikey",
  });
}
