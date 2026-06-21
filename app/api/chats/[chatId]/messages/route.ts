import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { readChat } from "@/lib/chat/store";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  const { response } = await requireUser();
  if (response) {
    return response;
  }

  const { chatId } = await context.params;
  try {
    const chat = await readChat(chatId);
    return NextResponse.json({ chat });
  } catch {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
}

