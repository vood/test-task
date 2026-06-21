import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, list, put } from "@vercel/blob";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  metadata?: unknown;
};

export type Chat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type ChatSummary = Pick<Chat, "id" | "title" | "createdAt" | "updatedAt"> & {
  messageCount: number;
};

const BLOB_CHAT_PREFIX = "chats/";

export async function listChats() {
  if (usesBlobStore()) {
    return listBlobChats();
  }
  return listFileChats();
}

export async function createChat(title = "New chat") {
  const now = new Date().toISOString();
  const chat: Chat = {
    id: randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await writeChat(chat);
  return chat;
}

export async function readChat(chatId: string) {
  assertValidChatId(chatId);
  if (usesBlobStore()) {
    const blob = await get(blobChatPath(chatId), { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200) {
      throw new Error("Chat not found");
    }
    return JSON.parse(await streamToText(blob.stream)) as Chat;
  }

  const raw = await readFile(fileChatPath(chatId), "utf8");
  return JSON.parse(raw) as Chat;
}

export async function appendMessage(chatId: string, message: Omit<ChatMessage, "id" | "createdAt">) {
  const chat = await readChat(chatId);
  const now = new Date().toISOString();
  const fullMessage: ChatMessage = {
    id: randomUUID(),
    createdAt: now,
    ...message,
  };
  chat.messages.push(fullMessage);
  chat.updatedAt = now;
  if (chat.title === "New chat" && message.role === "user") {
    chat.title = message.content.slice(0, 56) || "New chat";
  }
  await writeChat(chat);
  return fullMessage;
}

async function listBlobChats() {
  const summaries: ChatSummary[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: BLOB_CHAT_PREFIX, cursor, limit: 100 });
    cursor = page.cursor;
    const pageSummaries = await Promise.all(
      page.blobs
        .filter((blob) => blob.pathname.endsWith(".json"))
        .map(async (blob) => {
          const chatId = path.basename(blob.pathname, ".json");
          const chat = await readChat(chatId);
          return toChatSummary(chat);
        }),
    );
    summaries.push(...pageSummaries);
  } while (cursor);

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function listFileChats() {
  const dir = chatsDir();
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true });
  const chats = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const chat = await readChat(entry.name.replace(/\.json$/, ""));
        return toChatSummary(chat);
      }),
  );
  return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function writeChat(chat: Chat) {
  if (usesBlobStore()) {
    await put(blobChatPath(chat.id), `${JSON.stringify(chat, null, 2)}\n`, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
    return;
  }

  await mkdir(chatsDir(), { recursive: true });
  await writeFile(fileChatPath(chat.id), `${JSON.stringify(chat, null, 2)}\n`, "utf8");
}

function chatsDir() {
  return path.join(dataRoot(), "chats");
}

function fileChatPath(chatId: string) {
  assertValidChatId(chatId);
  return path.join(chatsDir(), `${chatId}.json`);
}

function blobChatPath(chatId: string) {
  assertValidChatId(chatId);
  return `${BLOB_CHAT_PREFIX}${chatId}.json`;
}

function assertValidChatId(chatId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(chatId)) {
    throw new Error("Invalid chat id");
  }
}

function dataRoot() {
  return process.env.DATA_DIR ?? path.join(process.cwd(), ".internal");
}

function usesBlobStore() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function toChatSummary(chat: Chat): ChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: chat.messages.length,
  };
}

async function streamToText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    text += decoder.decode(value, { stream: true });
  }
}
