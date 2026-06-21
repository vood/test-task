import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, setSessionCookie, verifyLogin } from "@/lib/auth/session";

export const runtime = "nodejs";

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = LoginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!verifyLogin(parsed.data.username, parsed.data.password)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, username: parsed.data.username });
  setSessionCookie(response, createSessionToken(parsed.data.username));
  return response;
}

