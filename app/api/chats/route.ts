import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createChat, listChats } from "@/lib/chat/store";

export const runtime = "nodejs";

export async function GET() {
  const { response } = await requireUser();
  if (response) {
    return response;
  }
  return NextResponse.json({ chats: await listChats() });
}

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) {
    return response;
  }

  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const chat = await createChat(body.title);
  return NextResponse.json({ chat });
}

