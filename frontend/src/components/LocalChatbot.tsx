import React, { useState, useRef, useEffect } from "react";
import { api } from "../lib/api";
import type { ChatContextLink, Workspace } from "../lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: "local-engine" | "local-ollama";
  links?: ChatContextLink[];
  suggestions?: string[];
  timestamp: string;
}

interface Props {
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  isSystemAdmin: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onNavigateLink: (link: ChatContextLink) => void;
}

function renderFormattedText(text: string) {
  return text.split("\n").map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
    return (
      <div key={lineIdx} style={{ minHeight: line.trim() ? undefined : 6, lineHeight: 1.5 }}>
        {parts.map((part, pIdx) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={pIdx} style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith("`") && part.endsWith("`")) {
            return (
              <code
                key={pIdx}
                style={{
                  background: "var(--bg-base)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontSize: 11.5,
                  color: "var(--accent)",
                }}
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return <em key={pIdx}>{part.slice(1, -1)}</em>;
          }
          return <span key={pIdx}>{part}</span>;
        })}
      </div>
    );
  });
}

export default function LocalChatbot({
  workspaces,
  activeWorkspaceId,
  isSystemAdmin,
  isOpen,
  onToggle,
  onNavigateLink,
}: Props) {
  const [scopeWsId, setScopeWsId] = useState<string>(activeWorkspaceId || "");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      mode: "local-engine",
      content:
        "Hi! I'm the **TechSters Local Assistant**. Ask me about your **Project Health Pulse**, **open silent blockers**, **pending handoffs**, **Task Memory Capsules**, or **how to assign/delete projects** — all strictly scoped to your permissions.",
      suggestions: [
        "Project health summary",
        "Show open blockers",
        "My pending handoffs",
        "What tasks are assigned to me?",
        ...(isSystemAdmin ? ["Member activation status"] : []),
      ],
      timestamp: new Date().toISOString(),
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeWorkspaceId) setScopeWsId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const historyPayload = nextMessages
        .filter((m) => m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await api.chat.ask({
        message: trimmed,
        workspaceId: scopeWsId || undefined,
        history: historyPayload,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.reply,
          mode: res.mode,
          links: res.contextLinks,
          suggestions: res.suggestedPrompts,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          mode: "local-engine",
          content: err instanceof Error ? `Error: ${err.message}` : "Could not process query.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendPrompt(input);
  };

  const lastSuggestions =
    [...messages].reverse().find((m) => m.role === "assistant" && m.suggestions?.length)?.suggestions || [];

  return (
    <>
      {/* Floating launcher when closed */}
      {!isOpen && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open Local Chatbot Assistant"
          style={{
            position: "fixed",
            bottom: 22,
            right: 22,
            zIndex: 45,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #161b22 0%, #1c2333 100%)",
            border: "1px solid var(--accent)",
            color: "var(--text-primary)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 8px var(--accent)",
            }}
          />
          <span>Local Assistant</span>
        </button>
      )}

      {/* Assistant Drawer */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="TechSters Local Chatbot"
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            width: 390,
            maxWidth: "calc(100vw - 24px)",
            height: 540,
            maxHeight: "calc(100dvh - 84px)",
            zIndex: 60,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "0 20px 60px rgba(0,0,0,0.65)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 14px",
              background: "var(--bg-surface)",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                ◈ TechSters Local Assistant
              </div>
              <div style={{ fontSize: 11, color: "var(--accent-green)" }}>
                Zero-Key Local Engine · RBAC &amp; Privacy Scoped
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setMessages((prev) => prev.slice(0, 1))
                }
                title="Clear conversation"
              >
                Clear
              </button>
              <button type="button" className="modal-close" onClick={onToggle} aria-label="Close assistant">
                ×
              </button>
            </div>
          </div>

          {/* Workspace Scope Selector */}
          {workspaces.length > 0 && (
            <div
              style={{
                padding: "8px 14px",
                background: "var(--bg-surface)",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                Scope:
              </span>
              <select
                className="input sm"
                style={{ padding: "4px 8px", fontSize: 12 }}
                value={scopeWsId}
                onChange={(e) => setScopeWsId(e.target.value)}
              >
                <option value="">All My Authorized Projects ({workspaces.length})</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Message Feed */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "90%",
                  background: m.role === "user" ? "rgba(88,166,255,0.14)" : "var(--bg-surface)",
                  border:
                    m.role === "user"
                      ? "1px solid rgba(88,166,255,0.35)"
                      : "1px solid var(--border-subtle)",
                  borderRadius: 10,
                  padding: "9px 12px",
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                }}
              >
                {renderFormattedText(m.content)}

                {m.links && m.links.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {m.links.map((lnk, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="badge badge-blue"
                        style={{ cursor: "pointer" }}
                        onClick={() => onNavigateLink(lnk)}
                      >
                        {lnk.label} →
                      </button>
                    ))}
                  </div>
                )}

                {m.role === "assistant" && m.mode && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                    {m.mode === "local-ollama" ? "Local Ollama (DB Grounded)" : "Local Context Engine"}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div
                style={{
                  alignSelf: "flex-start",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  padding: "4px 8px",
                }}
              >
                Querying live workspace context...
              </div>
            )}
          </div>

          {/* Quick Prompt Chips */}
          {lastSuggestions.length > 0 && (
            <div
              style={{
                padding: "6px 12px",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                gap: 6,
                overflowX: "auto",
              }}
            >
              {lastSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={sending}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 11, padding: "3px 8px", flexShrink: 0 }}
                  onClick={() => void sendPrompt(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input Bar */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: "10px 12px",
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--bg-surface)",
              display: "flex",
              gap: 8,
            }}
          >
            <input
              className="input sm"
              placeholder="Ask about health, blockers, handoffs, tasks..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !input.trim()} className="btn btn-primary btn-sm">
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
