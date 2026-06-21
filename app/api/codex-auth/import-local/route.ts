import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { importLocalCodexAuth } from "@/lib/codex-auth";

export const runtime = "nodejs";

export async function POST() {
  const { response } = await requireUser();
  if (response) {
    return response;
  }

  try {
    await importLocalCodexAuth();
    return NextResponse.json({ ok: true, configured: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not use this computer's access",
      },
      { status: 400 },
    );
  }
}
