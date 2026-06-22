"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";

type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Chat = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messages: ChatMessage[];
};

type SourceFile = {
  path: string;
  type: "text" | "binary";
  metadata: {
    extension: string;
    sizeBytes: number;
    documentDate?: string | null;
    dateSource?: string;
    filesystemCreatedAt?: string;
    filesystemModifiedAt?: string;
    createdAt: string;
    modifiedAt: string;
  };
  content: string;
};

export function ChatApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loginError, setLoginError] = useState("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState<SourceFile | null>(null);
  const [sourceError, setSourceError] = useState("");

  useEffect(() => {
    void refreshChats();
  }, []);

  const sortedMessages = useMemo(() => activeChat?.messages ?? [], [activeChat]);

  async function refreshChats() {
    const response = await fetch("/api/chats");
    if (response.status === 401) {
      setAuthenticated(false);
      return;
    }
    const payload = (await response.json()) as { chats: ChatSummary[] };
    setAuthenticated(true);
    setChats(payload.chats);
    if (!activeChat && payload.chats[0]) {
      await openChat(payload.chats[0].id);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
      }),
    });
    if (!response.ok) {
      setLoginError("Invalid username or password");
      return;
    }
    setAuthenticated(true);
    await refreshChats();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setActiveChat(null);
    setChats([]);
  }

  async function createNewChat() {
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "New chat" }),
    });
    const payload = (await response.json()) as { chat: Chat };
    setChats((current) => [
      {
        id: payload.chat.id,
        title: payload.chat.title,
        updatedAt: payload.chat.updatedAt ?? new Date().toISOString(),
        messageCount: 0,
      },
      ...current,
    ]);
    setActiveChat(payload.chat);
    setSidebarOpen(false);
  }

  async function openChat(chatId: string) {
    const response = await fetch(`/api/chats/${chatId}/messages`);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { chat: Chat };
    setActiveChat(payload.chat);
    setSidebarOpen(false);
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || loading) {
      return;
    }
    setQuestion("");
    setLoading(true);

    const chatId = activeChat?.id;
    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setActiveChat((chat) =>
      chat
        ? { ...chat, messages: [...chat.messages, optimisticUser] }
        : { id: "", title: text, messages: [optimisticUser] },
    );

    const response = await fetch("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chatId,
        question: text,
      }),
    });
    const payload = (await response.json()) as { chatId?: string; raw?: string; error?: string };
    const nextChatId = payload.chatId ?? chatId;
    const assistantContent = response.ok ? payload.raw : friendlyError(payload.error ?? payload.raw);
    setActiveChat((chat) =>
      chat
        ? {
            ...chat,
            id: nextChatId ?? chat.id,
            messages: [
              ...chat.messages,
              {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                content: assistantContent || "I could not answer that. Please try again.",
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : chat,
    );
    await refreshChats();
    setLoading(false);
  }

  async function openSource(path: string) {
    setSourceError("");
    setSourceFile(null);
    const response = await fetch(`/api/sources?path=${encodeURIComponent(path)}`);
    const payload = (await response.json()) as SourceFile | { error?: string };
    if (!response.ok || "error" in payload) {
      setSourceError("error" in payload ? payload.error ?? "Could not open source" : "Could not open source");
      return;
    }
    if (!isSourceFile(payload)) {
      setSourceError("Could not open source");
      return;
    }
    setSourceFile(payload);
  }

  if (authenticated === null) {
    return <main className="screen center">Loading...</main>;
  }

  if (!authenticated) {
    return (
      <main className="loginScreen">
        <form className="loginPanel" onSubmit={login}>
          <div>
            <p className="eyebrow">HelixPay</p>
            <h1>Company Assistant</h1>
          </div>
          <label>
            Username
            <input name="username" autoComplete="username" defaultValue="demo" />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" defaultValue="demo" />
          </label>
          {loginError ? <p className="error">{loginError}</p> : null}
          <button type="submit">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="chatShell">
      {sidebarOpen ? <button className="menuScrim" type="button" aria-label="Close chats" onClick={() => setSidebarOpen(false)} /> : null}

      <ChatSidebar
        activeChatId={activeChat?.id}
        chats={chats}
        onCreateChat={() => void createNewChat()}
        onLogout={() => void logout()}
        onOpenChat={(chatId) => void openChat(chatId)}
        open={sidebarOpen}
      />

      <ConversationPanel
        activeTitle={activeChat?.title || "New chat"}
        loading={loading}
        messages={sortedMessages}
        onMenuOpen={() => setSidebarOpen(true)}
        onOpenSource={(sourcePath) => void openSource(sourcePath)}
        onQuestionChange={setQuestion}
        onSubmit={(event) => void submitQuestion(event)}
        question={question}
      />

      <SourceDialog
        error={sourceError}
        file={sourceFile}
        onClose={() => {
          setSourceFile(null);
          setSourceError("");
        }}
      />
    </main>
  );
}

function ChatSidebar({
  activeChatId,
  chats,
  onCreateChat,
  onLogout,
  onOpenChat,
  open,
}: {
  activeChatId?: string;
  chats: ChatSummary[];
  onCreateChat: () => void;
  onLogout: () => void;
  onOpenChat: (chatId: string) => void;
  open: boolean;
}) {
  return (
    <aside className={open ? "sidebar open" : "sidebar"} aria-label="Chats and settings">
      <div className="sidebarHeader">
        <div>
          <p className="eyebrow">HelixPay</p>
          <h1>Company Assistant</h1>
        </div>
        <button className="secondary" onClick={onLogout} type="button">
          Sign out
        </button>
      </div>

      <button className="newChat" onClick={onCreateChat} type="button">
        New chat
      </button>

      <ChatList activeChatId={activeChatId} chats={chats} onOpenChat={onOpenChat} />
    </aside>
  );
}

function ChatList({
  activeChatId,
  chats,
  onOpenChat,
}: {
  activeChatId?: string;
  chats: ChatSummary[];
  onOpenChat: (chatId: string) => void;
}) {
  return (
    <nav className="chatList" aria-label="Saved chats">
      {chats.map((chat) => (
        <button
          key={chat.id}
          className={chat.id === activeChatId ? "chatItem active" : "chatItem"}
          onClick={() => onOpenChat(chat.id)}
          type="button"
        >
          <span>{chat.title}</span>
          <small>{chat.messageCount} messages</small>
        </button>
      ))}
    </nav>
  );
}

function ConversationPanel({
  activeTitle,
  loading,
  messages,
  onMenuOpen,
  onOpenSource,
  onQuestionChange,
  onSubmit,
  question,
}: {
  activeTitle: string;
  loading: boolean;
  messages: ChatMessage[];
  onMenuOpen: () => void;
  onOpenSource: (sourcePath: string) => void;
  onQuestionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  question: string;
}) {
  return (
    <section className="conversation">
      <AppHeader activeTitle={activeTitle} onMenuOpen={onMenuOpen} />
      <MessageList loading={loading} messages={messages} onOpenSource={onOpenSource} />
      <ChatComposer loading={loading} onQuestionChange={onQuestionChange} onSubmit={onSubmit} question={question} />
    </section>
  );
}

function AppHeader({ activeTitle, onMenuOpen }: { activeTitle: string; onMenuOpen: () => void }) {
  return (
    <header className="conversationHeader">
      <button className="menuButton secondary" type="button" onClick={onMenuOpen}>
        Chats
      </button>
      <div className="conversationTitle">
        <p className="eyebrow">Conversation</p>
        <h2>{activeTitle}</h2>
      </div>
    </header>
  );
}

function MessageList({
  loading,
  messages,
  onOpenSource,
}: {
  loading: boolean;
  messages: ChatMessage[];
  onOpenSource: (sourcePath: string) => void;
}) {
  return (
    <div className="messages">
      {messages.length === 0 ? (
        <div className="empty">
          <h3>Ask about HelixPay</h3>
          <p>Ask about company updates, customer feedback, sales pipeline, or open decisions.</p>
        </div>
      ) : (
        messages.map((message) => <MessageBubble key={message.id} message={message} onOpenSource={onOpenSource} />)
      )}
      {loading ? <div className="thinking">Looking through company files...</div> : null}
    </div>
  );
}

function MessageBubble({ message, onOpenSource }: { message: ChatMessage; onOpenSource: (sourcePath: string) => void }) {
  const label = message.role === "user" ? "You" : "Assistant";
  const sourcePaths = message.role === "assistant" ? extractSourcePaths(message.content) : [];
  const displayText =
    message.role === "assistant"
      ? withBracketReferences(stripReferencesBlock(cleanDisplayText(message.content)), sourcePaths)
      : cleanDisplayText(message.content);
  return (
    <article className={`message ${message.role}`}>
      <strong>{label}</strong>
      {message.role === "assistant" ? (
        <MessageResponse className="messageText">{displayText}</MessageResponse>
      ) : (
        <p className="messageText">{displayText}</p>
      )}
      {message.role === "assistant" ? <SourceReferences paths={sourcePaths} onOpen={onOpenSource} /> : null}
    </article>
  );
}

function ChatComposer({
  loading,
  onQuestionChange,
  onSubmit,
  question,
}: {
  loading: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  question: string;
}) {
  return (
    <form className="composer" onSubmit={onSubmit}>
      <textarea
        value={question}
        onChange={(event) => onQuestionChange(event.target.value)}
        placeholder="Ask a question about the company..."
        rows={3}
      />
      <button type="submit" disabled={loading || !question.trim()}>
        Send
      </button>
    </form>
  );
}

function SourceDialog({ error, file, onClose }: { error: string; file: SourceFile | null; onClose: () => void }) {
  if (!file && !error) {
    return null;
  }

  return (
    <div className="sourceOverlay" role="dialog" aria-modal="true" aria-label="Source file">
      <section className="sourcePanel">
        <header className="sourceHeader">
          <div>
            <p className="eyebrow">Source</p>
            <h2>{file?.path ?? "Source unavailable"}</h2>
          </div>
          <button className="secondary" type="button" onClick={onClose}>
            Close
          </button>
        </header>
        {file ? <SourceViewer file={file} /> : <p className="error">{error}</p>}
      </section>
    </div>
  );
}

function SourceViewer({ file }: { file: SourceFile }) {
  return (
    <>
      <dl className="sourceMeta">
        <div>
          <dt>Document date</dt>
          <dd>{file.metadata.documentDate ? formatDate(file.metadata.documentDate) : "Unknown"}</dd>
        </div>
        <div>
          <dt>Date source</dt>
          <dd>{file.metadata.dateSource ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{file.metadata.extension}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(file.metadata.sizeBytes)}</dd>
        </div>
      </dl>
      {file.type === "text" && file.metadata.extension === ".md" ? (
        <MessageResponse className="sourceMarkdown">{file.content}</MessageResponse>
      ) : file.type === "text" ? (
        <pre className="sourceContent">{file.content}</pre>
      ) : (
        <div className="sourceNotice">
          <p>This source opens as a separate file.</p>
          <a href={`/api/sources/raw?path=${encodeURIComponent(file.path)}`} target="_blank" rel="noreferrer">
            Open file
          </a>
        </div>
      )}
    </>
  );
}

function SourceReferences({ paths, onOpen }: { paths: string[]; onOpen: (path: string) => void }) {
  if (paths.length === 0) {
    return null;
  }

  return (
    <div className="sourceReferences" aria-label="Referenced files">
      <strong>References</strong>
      {paths.map((path, index) => (
        <button className="sourceButton" key={path} type="button" onClick={() => onOpen(path)}>
          [{index + 1}] {sourceLabel(path)}
        </button>
      ))}
    </div>
  );
}

function isSourceFile(value: SourceFile | { error?: string }): value is SourceFile {
  return "path" in value && "metadata" in value && "content" in value;
}

function friendlyError(error?: string) {
  if (!error) {
    return "I could not answer that. Please try again.";
  }
  if (error.toLowerCase().includes("credentials") || error.toLowerCase().includes("auth")) {
    return "I cannot answer right now because the AI service is not available. Please try again later.";
  }
  return `I could not answer that yet. ${error}`;
}

function cleanDisplayText(content: string) {
  return content
    .replace(/OpenAI Codex/gi, "Assistant")
    .replace(/Codex/gi, "Assistant")
    .replace(/AGENTS\.md/g, "assistant instructions")
    .replace(/local filesystem/gi, "company records")
    .replace(/filesystem/gi, "company records")
    .replace(/workspace-write/gi, "ready")
    .replace(/workspace/gi, "company records")
    .replace(/sandbox/gi, "secure environment")
    .replace(/source of truth/gi, "company record")
    .replace(/^-?\s*Direct answer first\.?$/gim, "")
    .replace(/\*\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSourcePaths(content: string) {
  const matches = content.match(/data\/[A-Za-z0-9._/@ -]+\.(?:md|html|jsonl?|txt|pdf|jpe?g|png)/g) ?? [];
  return Array.from(new Set(matches.map((match) => match.trim().replace(/[),.;:]+$/, "")))).filter(
    (path) => !path.startsWith("data/normalized/"),
  );
}

function withBracketReferences(content: string, paths: string[]) {
  return paths.reduce((text, path, index) => {
    return text.replaceAll(path, `[${index + 1}]`);
  }, content);
}

function stripReferencesBlock(content: string) {
  return content.replace(/\n?References:\s*(?:\n\s*\[\d+\]\s*data\/[^\n]+)+\s*$/i, "").trim();
}

function sourceLabel(path: string) {
  return path.split("/").pop() ?? path;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
