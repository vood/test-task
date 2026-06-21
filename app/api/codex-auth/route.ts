import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { hasCodexAuth, saveCodexAuth } from "@/lib/codex-auth";

export const runtime = "nodejs";

const SaveSchema = z.object({
  auth: z.string().min(20),
});

export async function GET() {
  const { response } = await requireUser();
  if (response) {
    return response;
  }

  return NextResponse.json({ configured: await hasCodexAuth() });
}

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) {
    return response;
  }

  const parsed = SaveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await saveCodexAuth(parsed.data.auth);
    return NextResponse.json({ ok: true, configured: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message.replace(/Codex auth JSON/g, "Access file") : "Invalid access file" },
      { status: 400 },
    );
  }
}
