import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { TOOLS, TOOL_COLORS, QUICK_PROMPTS, TEMPLATE_LIBRARY, TOOL_MAP, ERROR_PREFIX } from "./constants.js";
import { callClaudeStream } from "./api.js";
import { useSavedResponses } from "./hooks/useSavedResponses.js";
import { useConversations } from "./hooks/useConversations.js";
import { useConnectionStatus } from "./hooks/useConnectionStatus.js";
import MessageBubble from "./components/MessageBubble.jsx";
import Spinner from "./components/Spinner.jsx";
import SetupBanner from "./components/SetupBanner.jsx";

// XSS-safe: uses textContent, never innerHTML
function exportToPDF(title, content) {
  const win = window.open("", "_blank");
  if (!win) return;

  const doc = win.document;
  doc.title = title;

  const style = doc.createElement("style");
  style.textContent = `
    body { font-family: Georgia, serif; max-width: 820px; margin: 40px auto; padding: 0 32px; color: #1a1a2e; line-height: 1.8; }
    h1 { font-size: 22px; border-bottom: 2px solid #2C5F8A; padding-bottom: 10px; color: #1A3D5C; }
    .meta { font-size: 12px; color: #666; margin-bottom: 24px; font-family: system-ui; }
    pre { white-space: pre-wrap; font-family: Georgia, serif; font-size: 14px; }
    @media print { body { margin: 20px; } }
  `;
  doc.head.appendChild(style);

  const h1 = doc.createElement("h1");
  h1.textContent = title;
  doc.body.appendChild(h1);

  const meta = doc.createElement("div");
  meta.className = "meta";
  meta.textContent = `Generated: ${new Date().toLocaleDateString()} \u00B7 Nuestra Esperanza Health \u00B7 AI-assisted draft \u2014 clinical review required`;
  doc.body.appendChild(meta);

  const pre = doc.createElement("pre");
  pre.textContent = content;
  doc.body.appendChild(pre);

  doc.close();
  setTimeout(() => win.print(), 500);
}

// ── Toast Hook ──────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, color = "#5B9BD5") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2500);
  }, []);
  return { toast, showToast: show };
}

// ── Status Dot ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  checking: { color: "#5B7A96", label: "Checking..." },
  connected: { color: "#5BC98A", label: "Connected" },
  disconnected: { color: "#D85B5B", label: "Server offline" },
  "no-api-key": { color: "#E8AA5A", label: "No API key" },
};

function StatusDot({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.checking;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: cfg.color,
          boxShadow: `0 0 6px ${cfg.color}66`,
        }}
      />
      <span style={{ fontSize: 10, color: cfg.color, fontFamily: "system-ui" }}>{cfg.label}</span>
    </div>
  );
}

const GLOBAL_STYLES = `
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
  @keyframes spin { to { transform:rotate(360deg) } }
  @keyframes toastIn { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
  @keyframes blink { 50% { opacity:0 } }
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width:5px } ::-webkit-scrollbar-thumb { background:rgba(91,155,213,0.25); border-radius:3px }
  .tab-btn:hover { background: rgba(255,255,255,0.06) !important; }
  .panel-btn:hover { opacity: 0.85; }
  .qbtn:hover { background: rgba(44,95,138,0.25) !important; border-color: rgba(91,155,213,0.4) !important; }
  .tbtn:hover { background: rgba(44,95,138,0.2) !important; }
  .send:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
  textarea { caret-color: #5B9BD5; }
  textarea:focus { outline: none; box-shadow: 0 0 0 1px rgba(91,155,213,0.3); border-radius: 4px; }
  .saved-card:hover { background: rgba(255,255,255,0.05) !important; }
  @media (max-width: 600px) {
    .tab-btn { padding: 6px 10px !important; font-size: 12px !important; }
    .tab-label { display: none; }
  }
`;

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTool, setActiveTool] = useState("policy");
  const [activePanel, setActivePanel] = useState("chat");
  const { conversations, setConversations, clearConversation } = useConversations();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [templateFilter, setTemplateFilter] = useState("all");
  const { responses: savedResponses, saveResponse, deleteResponse } = useSavedResponses();
  const { toast, showToast } = useToast();
  const { status: connectionStatus } = useConnectionStatus();
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, loading]);

  const currentConvo = conversations[activeTool];
  const tool = TOOLS.find((t) => t.id === activeTool);
  const canSend = connectionStatus === "connected";
  const sendDisabled = !input.trim() || loading || !canSend;

  const sendMessage = useCallback(
    async (text, targetTool) => {
      if (!text.trim() || loading) return;
      const userMsg = { role: "user", content: text.trim() };
      const toolId = targetTool || activeTool;

      let updated;
      setConversations((p) => {
        updated = [...p[toolId], userMsg];
        return { ...p, [toolId]: [...updated, { role: "assistant", content: "", streaming: true }] };
      });
      setInput("");
      setLoading(true);
      setActivePanel("chat");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await callClaudeStream(
          updated,
          toolId,
          (chunk) => {
            setConversations((prev) => {
              const convo = [...prev[toolId]];
              const last = convo[convo.length - 1];
              convo[convo.length - 1] = { ...last, content: last.content + chunk };
              return { ...prev, [toolId]: convo };
            });
          },
          controller.signal
        );

        setConversations((prev) => {
          const convo = [...prev[toolId]];
          const last = convo[convo.length - 1];
          convo[convo.length - 1] = { ...last, streaming: false };
          return { ...prev, [toolId]: convo };
        });
      } catch (e) {
        if (e.name === "AbortError") return;
        setConversations((prev) => {
          const convo = [...prev[toolId]];
          const last = convo[convo.length - 1];
          const partial = last.content;
          const errorMsg = partial
            ? `${partial}\n\n${ERROR_PREFIX} Stream interrupted: ${e.message}`
            : `${ERROR_PREFIX} Error: ${e.message}`;
          convo[convo.length - 1] = { role: "assistant", content: errorMsg, streaming: false };
          return { ...prev, [toolId]: convo };
        });
      } finally {
        setLoading(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [activeTool, loading, setConversations]
  );

  const retryLast = useCallback(() => {
    let textToRetry;
    setConversations((prev) => {
      const convo = prev[activeTool];
      if (convo.length < 2) return prev;
      const userMsg = convo[convo.length - 2];
      if (userMsg.role !== "user") return prev;
      textToRetry = userMsg.content;
      return { ...prev, [activeTool]: convo.slice(0, -1) };
    });
    if (textToRetry) requestAnimationFrame(() => sendMessage(textToRetry));
  }, [activeTool, setConversations, sendMessage]);

  const handleSave = useCallback(
    (content) => {
      saveResponse(content, activeTool, TOOL_MAP[activeTool]?.label);
      showToast("\u2713 Response saved", "#5BC98A");
    },
    [activeTool, saveResponse, showToast]
  );

  const handleCopy = useCallback(
    (content) => {
      navigator.clipboard.writeText(content);
      showToast("Copied to clipboard!");
    },
    [showToast]
  );

  const handleDelete = useCallback(
    (id) => {
      deleteResponse(id);
      showToast("Deleted", "#E08A8A");
    },
    [deleteResponse, showToast]
  );

  const filteredTemplates = useMemo(
    () => templateFilter === "all" ? TEMPLATE_LIBRARY : TEMPLATE_LIBRARY.filter((t) => t.category === templateFilter),
    [templateFilter]
  );

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(160deg, #080F18 0%, #0E1C2D 60%, #0A1520 100%)",
        color: "#C8DCF0",
        fontFamily: "Georgia, serif",
        overflow: "hidden",
      }}
    >
      <style>{GLOBAL_STYLES}</style>

      {/* ── HEADER ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(8,15,24,0.8)",
          backdropFilter: "blur(16px)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg, #1E4D73, #0A2A40)",
              border: "1px solid rgba(91,155,213,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            {"\u2695"}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#EAF2FB", letterSpacing: "-0.2px" }}>Psychiatry AI Workbench</span>
              <StatusDot status={connectionStatus} />
            </div>
            <div style={{ fontSize: 11, color: "#3D6080", fontFamily: "system-ui", marginTop: 1 }}>
              Nuestra Esperanza Health {"\u00B7"} AI-assisted clinical tools
            </div>
          </div>
        </div>
        <button
          className="panel-btn"
          onClick={() => setActivePanel((p) => (p === "saved" ? "chat" : "saved"))}
          aria-label="Saved responses"
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            background: activePanel === "saved" ? "rgba(91,155,213,0.2)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${activePanel === "saved" ? "rgba(91,155,213,0.4)" : "rgba(255,255,255,0.07)"}`,
            color: activePanel === "saved" ? "#9DCAF0" : "#5B7A96",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "system-ui",
            transition: "all 0.2s",
          }}
        >
          {"\uD83D\uDCBE"} {savedResponses.length} Saved
        </button>
      </header>

      {/* ── SETUP BANNER (when no API key) ── */}
      {connectionStatus === "no-api-key" && <SetupBanner />}

      {/* ── TOOL TABS ── */}
      <nav
        role="tablist"
        aria-label="Workbench tools"
        style={{
          display: "flex",
          padding: "8px 16px 0",
          gap: 4,
          background: "rgba(8,15,24,0.6)",
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        {TOOLS.map((t) => {
          const active = activeTool === t.id;
          const color = TOOL_COLORS[t.id];
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              className="tab-btn"
              onClick={() => {
                if (abortRef.current) abortRef.current.abort();
                setActiveTool(t.id);
                setActivePanel("chat");
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px 8px 0 0",
                border: "1px solid transparent",
                borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
                background: active ? `${color}1A` : "transparent",
                color: active ? "#EAF2FB" : "#3D6080",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "system-ui",
                fontWeight: active ? 600 : 400,
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {t.icon} <span className="tab-label">{t.label}</span>
              {conversations[t.id].length > 0 && (
                <span style={{ background: `${color}22`, color, borderRadius: 20, padding: "0 6px", fontSize: 10 }}>
                  {Math.ceil(conversations[t.id].length / 2)}
                </span>
              )}
            </button>
          );
        })}
        <button
          className="tab-btn"
          onClick={() => setActivePanel((p) => (p === "templates" ? "chat" : "templates"))}
          style={{
            marginLeft: "auto",
            padding: "8px 14px",
            borderRadius: "8px 8px 0 0",
            border: "1px solid transparent",
            borderBottom: activePanel === "templates" ? "2px solid #E8AA5A" : "2px solid transparent",
            background: activePanel === "templates" ? "rgba(130,90,30,0.2)" : "transparent",
            color: activePanel === "templates" ? "#EAF2FB" : "#3D6080",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "system-ui",
            transition: "all 0.2s",
          }}
        >
          {"\uD83D\uDCDA"} Templates
        </button>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "0 16px 16px" }}>
        {/* TEMPLATES PANEL */}
        {activePanel === "templates" && (
          <div style={{ flex: 1, overflow: "auto", paddingTop: 16, animation: "fadeIn 0.3s" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {["all", "policy", "supervision", "lecture", "chat"].map((f) => (
                <button
                  key={f}
                  onClick={() => setTemplateFilter(f)}
                  className="tbtn"
                  style={{
                    padding: "5px 14px",
                    borderRadius: 20,
                    background: templateFilter === f ? "rgba(44,95,138,0.35)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${templateFilter === f ? "rgba(91,155,213,0.5)" : "rgba(255,255,255,0.07)"}`,
                    color: templateFilter === f ? "#9DCAF0" : "#5B7A96",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "system-ui",
                    transition: "all 0.2s",
                    textTransform: "capitalize",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {filteredTemplates.map((tmpl) => {
                const color = TOOL_COLORS[tmpl.category];
                const useTemplate = () => {
                  setActiveTool(tmpl.category);
                  setActivePanel("chat");
                  sendMessage(tmpl.prompt, tmpl.category);
                };
                return (
                  <div
                    key={tmpl.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Use template: ${tmpl.label}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") useTemplate();
                    }}
                    style={{
                      background: "rgba(14,28,45,0.7)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 12,
                      padding: 16,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      animation: "fadeIn 0.3s",
                    }}
                    onClick={useTemplate}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = `${color}44`;
                      e.currentTarget.style.background = "rgba(20,38,58,0.9)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                      e.currentTarget.style.background = "rgba(14,28,45,0.7)";
                    }}
                  >
                    <span style={{ fontSize: 10, color, fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>
                      {TOOL_MAP[tmpl.category]?.icon} {tmpl.category}
                    </span>
                    <div style={{ fontSize: 14, color: "#C8DCF0", fontWeight: 600, marginBottom: 6 }}>{tmpl.label}</div>
                    <div style={{ fontSize: 12, color: "#4A6880", lineHeight: 1.6, fontFamily: "system-ui" }}>{tmpl.prompt.slice(0, 90)}{"\u2026"}</div>
                    <div
                      style={{
                        marginTop: 12,
                        padding: "5px 12px",
                        borderRadius: 6,
                        display: "inline-block",
                        background: `${color}18`,
                        border: `1px solid ${color}33`,
                        color,
                        fontSize: 11,
                        fontFamily: "system-ui",
                      }}
                    >
                      Use template {"\u2192"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SAVED RESPONSES PANEL */}
        {activePanel === "saved" && (
          <div style={{ flex: 1, overflow: "auto", paddingTop: 16, animation: "fadeIn 0.3s" }}>
            {savedResponses.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#2E4A60" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>{"\uD83D\uDCBE"}</div>
                <div style={{ fontFamily: "system-ui", fontSize: 14 }}>No saved responses yet.</div>
                <div style={{ fontFamily: "system-ui", fontSize: 12, marginTop: 6 }}>Hover over any AI response to save it.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {savedResponses.map((r) => (
                  <div
                    key={r.id}
                    className="saved-card"
                    style={{
                      background: "rgba(14,28,45,0.7)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 12,
                      padding: 16,
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <span
                          style={{
                            fontSize: 10,
                            color: TOOL_COLORS[r.tool],
                            fontFamily: "system-ui",
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            marginRight: 8,
                          }}
                        >
                          {TOOL_MAP[r.tool]?.icon} {r.toolLabel}
                        </span>
                        <span style={{ fontSize: 11, color: "#2E4A60", fontFamily: "system-ui" }}>{r.savedAt}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => exportToPDF(r.title, r.content)}
                          aria-label="Export as PDF"
                          style={{
                            padding: "3px 10px",
                            borderRadius: 6,
                            background: "rgba(44,95,138,0.2)",
                            border: "1px solid rgba(91,155,213,0.3)",
                            color: "#7AB8D8",
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "system-ui",
                          }}
                        >
                          {"\uD83D\uDDA8"} PDF
                        </button>
                        <button
                          onClick={() => handleCopy(r.content)}
                          aria-label="Copy to clipboard"
                          style={{
                            padding: "3px 10px",
                            borderRadius: 6,
                            background: "rgba(44,95,138,0.2)",
                            border: "1px solid rgba(91,155,213,0.3)",
                            color: "#7AB8D8",
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "system-ui",
                          }}
                        >
                          {"\uD83D\uDCCB"} Copy
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          aria-label="Delete saved response"
                          style={{
                            padding: "3px 10px",
                            borderRadius: 6,
                            background: "rgba(138,44,44,0.15)",
                            border: "1px solid rgba(213,91,91,0.2)",
                            color: "#C08080",
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "system-ui",
                          }}
                        >
                          {"\u2715"}
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "#7A9DB8", fontFamily: "system-ui", marginBottom: 8 }}>{r.title}</div>
                    <div
                      style={{
                        maxHeight: 120,
                        overflow: "hidden",
                        position: "relative",
                        fontSize: 13,
                        color: "#4A6880",
                        lineHeight: 1.7,
                        fontFamily: "Georgia,serif",
                      }}
                    >
                      {r.content.slice(0, 300)}{"\u2026"}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: 40,
                          background: "linear-gradient(transparent, rgba(14,28,45,0.95))",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHAT PANEL */}
        {activePanel === "chat" && (
          <>
            <div role="log" aria-live="polite" aria-label="Conversation" style={{ flex: 1, overflow: "auto", paddingTop: 16, paddingBottom: 4 }}>
              {currentConvo.length === 0 ? (
                <div style={{ animation: "fadeIn 0.4s" }}>
                  <div style={{ fontSize: 12, color: "#2E4A60", fontFamily: "system-ui", marginBottom: 12 }}>
                    Quick prompts for {tool.label}:
                  </div>
                  {QUICK_PROMPTS[activeTool].map((p, i) => (
                    <button
                      key={i}
                      className="qbtn"
                      onClick={() => sendMessage(p)}
                      disabled={!canSend}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 14px",
                        marginBottom: 8,
                        background: "rgba(14,28,45,0.6)",
                        border: "1px solid rgba(91,155,213,0.12)",
                        borderRadius: 10,
                        color: canSend ? "#7AB8D8" : "#2E4A60",
                        cursor: canSend ? "pointer" : "not-allowed",
                        fontSize: 13,
                        fontFamily: "Georgia,serif",
                        lineHeight: 1.5,
                        transition: "all 0.2s",
                      }}
                    >
                      <span style={{ color: TOOL_COLORS[activeTool], marginRight: 8 }}>{"\u2192"}</span>
                      {p}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {currentConvo.map((msg, i) => (
                    <MessageBubble
                      key={i}
                      role={msg.role}
                      content={msg.content}
                      streaming={msg.streaming}
                      onSave={() => handleSave(msg.content)}
                      onExport={() => exportToPDF(`${tool.label} \u2014 ${new Date().toLocaleDateString()}`, msg.content)}
                      onCopy={() => handleCopy(msg.content)}
                      onRetry={
                        i === currentConvo.length - 1 && msg.role === "assistant" && msg.content.startsWith(ERROR_PREFIX)
                          ? retryLast
                          : undefined
                      }
                    />
                  ))}
                  <div ref={bottomRef} style={{ height: 40 }} />
                </>
              )}
            </div>

            {/* Input bar */}
            <div
              style={{
                flexShrink: 0,
                background: "rgba(14,28,45,0.85)",
                border: "1px solid rgba(91,155,213,0.15)",
                borderRadius: 14,
                padding: "10px 12px",
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                backdropFilter: "blur(12px)",
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) sendMessage(input);
                  }
                }}
                placeholder={
                  canSend
                    ? `${tool.icon} ${tool.desc} \u2014 describe what you need\u2026`
                    : connectionStatus === "no-api-key"
                      ? "Set up your API key to get started..."
                      : "Waiting for server connection..."
                }
                aria-label="Message input"
                rows={2}
                disabled={!canSend}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "#C8DCF0",
                  fontFamily: "Georgia,serif",
                  fontSize: 14,
                  lineHeight: 1.6,
                  resize: "none",
                  opacity: canSend ? 1 : 0.5,
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {currentConvo.length > 0 && (
                  <button
                    onClick={() => {
                      if (abortRef.current) abortRef.current.abort();
                      clearConversation(activeTool);
                      setLoading(false);
                    }}
                    aria-label="Clear conversation"
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "#2E4A60",
                      fontSize: 11,
                      cursor: "pointer",
                      fontFamily: "system-ui",
                    }}
                  >
                    Clear
                  </button>
                )}
                <button
                  className="send"
                  onClick={() => sendMessage(input)}
                  disabled={sendDisabled}
                  aria-label="Send message"
                  style={{
                    padding: "9px 16px",
                    borderRadius: 10,
                    fontSize: 18,
                    background: sendDisabled
                      ? "rgba(44,95,138,0.15)"
                      : `linear-gradient(135deg, ${TOOL_COLORS[activeTool]}, #1A3D5C)`,
                    border: "none",
                    color: sendDisabled ? "#2E4A60" : "#EAF2FB",
                    cursor: sendDisabled ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    boxShadow: sendDisabled ? "none" : "0 4px 16px rgba(44,95,138,0.35)",
                  }}
                >
                  {"\u2191"}
                </button>
              </div>
            </div>
            <div style={{ textAlign: "center", fontSize: 10, color: "#1E3348", fontFamily: "system-ui", marginTop: 6 }}>
              Enter to send {"\u00B7"} Shift+Enter for new line {"\u00B7"} AI-generated {"\u2014"} apply clinical judgment before use
            </div>
          </>
        )}
      </main>

      {/* ── TOAST ── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(14,28,45,0.97)",
            border: `1px solid ${toast.color}44`,
            borderRadius: 10,
            padding: "10px 20px",
            color: toast.color,
            fontFamily: "system-ui",
            fontSize: 13,
            zIndex: 1000,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            animation: "toastIn 0.25s ease",
            backdropFilter: "blur(16px)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
