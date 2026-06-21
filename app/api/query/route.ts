import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { appendMessage, createChat, readChat } from "@/lib/chat/store";
import { runCodexInVercelSandbox } from "@/lib/codex-sandbox";
import { buildCodexPrompt } from "@/lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

const QuerySchema = z.object({
  question: z.string().min(1),
  chatId: z.string().optional(),
  mode: z.enum(["brief", "deep", "json"]).default("brief"),
});

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) {
    return response;
  }

  const parsed = QuerySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const chatId = parsed.data.chatId ?? (await createChat(parsed.data.question.slice(0, 56))).id;
  const existingChat = parsed.data.chatId ? await readChat(chatId).catch(() => null) : null;
  const priorConversation =
    existingChat?.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })) ?? [];

  await appendMessage(chatId, {
    role: "user",
    content: parsed.data.question,
  });

  const workspaceDir = path.join(process.cwd());
  const prompt = buildCodexPrompt(parsed.data.question, parsed.data.mode, priorConversation);

  try {
    const result = await runCodexInVercelSandbox(prompt, workspaceDir);

    const assistantContent = normalizeAssistantText(answerFromCodexResult(result));
    await appendMessage(chatId, {
      role: "assistant",
      content: assistantContent,
      metadata: { ok: result.code === 0 },
    });

    return NextResponse.json({
      ok: result.code === 0,
      chatId,
      answer: parseJsonOrText(assistantContent),
      raw: assistantContent,
    });
  } catch (error) {
    const message = "I could not answer that right now. Please try again later.";
    console.error(error);
    await appendMessage(chatId, {
      role: "assistant",
      content: message,
      metadata: { ok: false },
    });
    return NextResponse.json(
      {
        ok: false,
        chatId,
        error: message,
      },
      { status: 500 },
    );
  }
}

function parseJsonOrText(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { answer: text.trim() };
  }
}

function answerFromCodexResult(result: { lastMessage: string; stdout: string; stderr: string }) {
  const combined = [result.lastMessage, result.stdout, result.stderr].join("\n");
  if (/401 Unauthorized|Missing bearer|authentication/i.test(combined)) {
    return "I cannot answer right now because the AI service is not available. Please try again later.";
  }

  return (
    result.lastMessage.trim() ||
    result.stdout.trim() ||
    result.stderr.trim() ||
    "The assistant did not return an answer."
  );
}

function normalizeAssistantText(text: string) {
  try {
    const parsed = JSON.parse(text) as { answer?: unknown };
    if (typeof parsed.answer === "string") {
      return parsed.answer.trim();
    }
  } catch {
    // The normal response is plain text.
  }
  return text.trim();
}
