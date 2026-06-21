import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type QueryResponse = {
  ok?: boolean;
  chatId?: string;
  raw?: string;
  error?: string;
};

type SourceResponse = {
  path?: string;
  type?: "text" | "binary";
  metadata?: {
    sizeBytes?: number;
    createdAt?: string;
    modifiedAt?: string;
  };
  content?: string;
};

type ChatsResponse = {
  chats?: Array<{
    id: string;
    title: string;
    messageCount: number;
  }>;
};

type ChatMessagesResponse = {
  chat?: {
    id: string;
    title: string;
    messages: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
  };
};

type TestCase = {
  name: string;
  question: string;
  chatId?: string;
  mustInclude: string[];
  mustNotInclude: string[];
};

const deployment = process.env.VERCEL_DEPLOYMENT;
const baseUrl = process.env.BASE_URL;
const username = process.env.APP_USERNAME ?? "demo";
const password = process.env.APP_PASSWORD ?? "demo";
const vercelHome = process.env.VERCEL_HOME ?? "/private/tmp/vercel-login-home";

const cases: TestCase[] = [
  {
    name: "Greeting is natural and non-technical",
    question: "Hello",
    mustInclude: [],
    mustNotInclude: [
      "Sources",
      "Freshness",
      "Conflicts",
      "AGENTS.md",
      "Codex",
      "sandbox",
      "filesystem",
      "workspace",
      "Direct answer first",
      "source of truth",
    ],
  },
  {
    name: "CRM migration answer is sourced",
    question: "What is the CRM migration status?",
    mustInclude: ["CRM", "HubSpot", "Pipedrive", "data/"],
    mustNotInclude: [
      "not configured",
      "Unauthorized",
      "bwrap:",
      "AGENTS.md",
      "Codex",
      "sandbox",
      "filesystem",
      "workspace",
      "Direct answer first",
      "source of truth",
      "no `data/`",
    ],
  },
  {
    name: "Follow-up resolves against prior turn",
    question: "What about Brazil specifically?",
    mustInclude: ["Brazil", "Pipedrive", "data/"],
    mustNotInclude: [
      "not configured",
      "Unauthorized",
      "AGENTS.md",
      "Codex",
      "sandbox",
      "filesystem",
      "workspace",
      "Direct answer first",
      "source of truth",
    ],
  },
];

async function main() {
  if (!deployment && !baseUrl) {
    throw new Error("Set VERCEL_DEPLOYMENT for protected Vercel previews or BASE_URL for public/local testing.");
  }

  const cookieJar = path.join(mkdtempSync(path.join(tmpdir(), "helixpay-smoke-")), "cookies.txt");
  try {
    log("Target", deployment ?? baseUrl ?? "");
    const login = await request("/api/auth/login", {
      method: "POST",
      cookieJar,
      body: { username, password },
    });
    assert(login.ok === true, "login should return ok=true");
    log("Login", "ok");

    let conversationChatId = "";
    for (const testCase of cases) {
      log("Question", testCase.question);
      const chatId = testCase.chatId ?? (conversationChatId ? conversationChatId : undefined);
      const response = (await request("/api/query", {
        method: "POST",
        cookieJar,
        body: { question: testCase.question, chatId },
      })) as QueryResponse;

      assert(response.ok === true, `${testCase.name}: query should return ok=true`);
      assert(Boolean(response.chatId), `${testCase.name}: query should return chatId`);
      assert(Boolean(response.raw?.trim()), `${testCase.name}: query should return assistant text`);

      const raw = response.raw ?? "";
      if (testCase.name === "CRM migration answer is sourced") {
        conversationChatId = response.chatId ?? "";
      }
      assert(!raw.trim().startsWith("{"), `${testCase.name}: answer should not be raw JSON`);
      for (const expected of testCase.mustInclude) {
        assert(raw.includes(expected), `${testCase.name}: answer should include "${expected}"`);
      }
      for (const forbidden of testCase.mustNotInclude) {
        assert(!raw.includes(forbidden), `${testCase.name}: answer should not include "${forbidden}"`);
      }

      log("Answer preview", raw.slice(0, 500).replace(/\s+/g, " "));
    }

    assert(Boolean(conversationChatId), "conversation chat id should be captured");
    const chats = (await request("/api/chats", { method: "GET", cookieJar })) as ChatsResponse;
    const savedChat = chats.chats?.find((chat) => chat.id === conversationChatId);
    assert(Boolean(savedChat), "chat list should include the active conversation");
    assert((savedChat?.messageCount ?? 0) >= 4, "chat list should show persisted user and assistant messages");
    log("Saved chat", `${savedChat?.title} (${savedChat?.messageCount} messages)`);

    const messages = (await request(`/api/chats/${conversationChatId}/messages`, {
      method: "GET",
      cookieJar,
    })) as ChatMessagesResponse;
    assert(messages.chat?.id === conversationChatId, "messages API should return the active conversation");
    assert(
      Boolean(messages.chat.messages.find((message) => message.role === "user" && message.content.includes("Brazil"))),
      "messages API should return the follow-up user message",
    );
    assert(
      Boolean(messages.chat.messages.find((message) => message.role === "assistant" && message.content.includes("Pipedrive"))),
      "messages API should return the sourced assistant response",
    );
    log("Reloaded chat", `${messages.chat.messages.length} messages`);

    const source = (await request("/api/sources?path=data%2Fweekly-review-2026-04-21.md", {
      method: "GET",
      cookieJar,
    })) as SourceResponse;
    assert(source.path === "data/weekly-review-2026-04-21.md", "source API should return requested path");
    assert(source.type === "text", "source API should return text source type");
    assert(Boolean(source.content?.includes("CRM")), "source API should return file content");
    assert(Boolean(source.metadata?.createdAt), "source API should return createdAt metadata");
    assert(Boolean(source.metadata?.modifiedAt), "source API should return modifiedAt metadata");
    assert(Boolean(source.metadata?.sizeBytes), "source API should return size metadata");
    log("Source", `${source.path} (${source.metadata?.sizeBytes} bytes)`);
  } finally {
    rmSync(path.dirname(cookieJar), { recursive: true, force: true });
  }

  log("Result", "Vercel smoke tests passed");
}

async function request(
  apiPath: string,
  options: { method: "GET" | "POST"; cookieJar: string; body?: unknown },
) {
  if (deployment) {
    return requestViaVercelCurl(apiPath, options);
  }
  return requestViaFetch(apiPath, options);
}

function requestViaVercelCurl(
  apiPath: string,
  options: { method: "GET" | "POST"; cookieJar: string; body?: unknown },
) {
  const curlArgs = [
    "vercel@54.14.5",
    "curl",
    apiPath,
    "--deployment",
    deployment!,
    "--",
    "--silent",
    "--show-error",
    "--request",
    options.method,
    "--cookie",
    options.cookieJar,
    "--cookie-jar",
    options.cookieJar,
  ];

  if (options.body !== undefined) {
    curlArgs.push("--header", "content-type: application/json", "--data", JSON.stringify(options.body));
  }

  const output = execFileSync("npx", curlArgs, {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: vercelHome,
      VERCEL_NO_UPDATE_NOTIFIER: "1",
      NO_COLOR: "1",
      CI: "1",
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? "/private/tmp/vercel-cache",
      npm_config_cache: process.env.npm_config_cache ?? "/private/tmp/npm-cache-homework",
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? "/private/tmp/npm-cache-homework",
    },
    timeout: 300_000,
  });
  return parseJsonFromCli(output);
}

async function requestViaFetch(
  apiPath: string,
  options: { method: "GET" | "POST"; cookieJar: string; body?: unknown },
) {
  const cookieFile = options.cookieJar;
  const cookie = readCookie(cookieFile);
  const response = await fetch(new URL(apiPath, baseUrl), {
    method: options.method,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    writeFileSync(cookieFile, setCookie.split(";")[0], "utf8");
  }
  return response.json();
}

function parseJsonFromCli(output: string) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in output:\n${output}`);
  }
  return JSON.parse(output.slice(start, end + 1));
}

function readCookie(cookieFile: string) {
  try {
    return readFileSync(cookieFile, "utf8");
  } catch {
    return "";
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function log(label: string, value: string) {
  console.log(`[${label}] ${value}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
