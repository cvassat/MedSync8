import { useState, useRef, useEffect } from "react";
import { TOOLS, TOOL_COLORS, SYSTEM_PROMPTS, QUICK_PROMPTS, TEMPLATE_LIBRARY } from "./prompts";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";


// ── API ─────────────────────────────────────────────────────────────────────
// Talks to the FastAPI backend (see backend/server.py) instead of calling
// Anthropic directly. The backend hides the API key and adds RAG retrieval.
async function callBackend(tool, messages) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, messages, use_rag: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? `Backend request failed (${res.status})`);
  }

  // { reply: string, citations: [{index, doc_id, chunk_id, score}], model }
  return res.json();
}

// ── PDF EXPORT ──────────────────────────────────────────────────────────────
function exportToPDF(title, content) {
  const escaped = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      body { font-family: Georgia, serif; max-width: 820px; margin: 40px auto; padding: 0 32px; color: #1a1a2e; line-height: 1.8; }
      h1 { font-size: 22px; border-bottom: 2px solid #2C5F8A; padding-bottom: 10px; color: #1A3D5C; }
      .meta { font-size: 12px; color: #666; margin-bottom: 24px; font-family: system-ui; }
      pre { white-space: pre-wrap; font-family: Georgia, serif; font-size: 14px; }
      @media print { body { margin: 20px; } }
    </style>
    </head><body>
    <h1>${title}</h1>
    <div class="meta">Generated: ${new Date().toLocaleDateString()} &middot; Nuestra Esperanza Health &middot; AI-assisted draft &mdash; clinical review required</div>
    <pre>${escaped}</pre>
    </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ── COMPONENTS ──────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0", animation: "fadeIn 0.3s" }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%",
        border: "2px solid rgba(91,155,213,0.2)", borderTopColor: "#5B9BD5",
        animation: "spin 0.8s linear infinite",
      }} />
      <span style={{ color: "#5B7A96", fontStyle: "italic", fontSize: 13, fontFamily: "Georgia,serif" }}>
        Generating response...
      </span>
    </div>
  );
}

function MessageBubble({ role, content, citations, onSave, onExport }) {
  const isUser = role === "user";
  const [hover, setHover] = useState(false);
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 18, animation: "fadeIn 0.35s ease" }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #1E4D73, #0D2D47)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, marginRight: 10, marginTop: 4,
          border: "1px solid rgba(91,155,213,0.3)", boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
        }}>{"\u2695\uFE0F"}</div>
      )}
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ maxWidth: "80%", position: "relative" }}>
        <div style={{
          background: isUser ? "linear-gradient(135deg, #2C5F8A, #1A3D5C)" : "rgba(20,35,52,0.8)",
          border: isUser ? "none" : "1px solid rgba(91,155,213,0.15)",
          borderRadius: isUser ? "16px 16px 3px 16px" : "3px 16px 16px 16px",
          padding: "11px 15px", color: isUser ? "#EAF2FB" : "#C8DCF0",
          fontSize: 13.5, lineHeight: 1.75, fontFamily: "Georgia,serif", whiteSpace: "pre-wrap",
          boxShadow: isUser ? "0 4px 20px rgba(44,95,138,0.3)" : "0 2px 12px rgba(0,0,0,0.2)",
        }}>
          {content}
          {!isUser && <Citations citations={citations} />}
        </div>
        {!isUser && hover && (
          <div style={{ position: "absolute", bottom: -30, left: 0, display: "flex", gap: 6, zIndex: 10, animation: "fadeIn 0.15s" }}>
            {[["\u{1F4BE} Save", onSave], ["\u{1F5A8} Export PDF", onExport]].map(([label, fn]) => (
              <button key={label} onClick={fn} style={{
                padding: "3px 10px", borderRadius: 20,
                background: "rgba(20,35,52,0.95)", border: "1px solid rgba(91,155,213,0.3)",
                color: "#7AB8D8", fontSize: 11, cursor: "pointer", fontFamily: "system-ui",
                backdropFilter: "blur(8px)",
              }}>{label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Citations({ citations }) {
  if (!citations?.length) return null;
  return (
    <div style={{
      marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(91,155,213,0.15)",
      fontFamily: "system-ui", fontSize: 11, color: "#5B7A96",
    }}>
      <div style={{ marginBottom: 4, color: "#3D6080", letterSpacing: 0.4, textTransform: "uppercase" }}>
        Sources
      </div>
      {citations.map((c) => (
        <div key={c.index} style={{ marginBottom: 2 }}>
          <span style={{ color: "#9DCAF0" }}>[{c.index}]</span>{" "}
          <span style={{ fontFamily: "monospace" }}>{c.doc_id}</span>
          <span style={{ color: "#3D6080" }}> · chunk {c.chunk_id} · {(c.score * 100).toFixed(0)}% match</span>
        </div>
      ))}
    </div>
  );
}

// ── MAIN APP ────────────────────────────────────────────────────────────────
export default function PsychiatryWorkbench() {
  const [activeTool, setActiveTool] = useState("policy");
  const [activePanel, setActivePanel] = useState("chat");
  const [conversations, setConversations] = useState({ policy: [], supervision: [], lecture: [], chat: [] });
  const [savedResponses, setSavedResponses] = useState(() => {
    try { return JSON.parse(localStorage.getItem("saved_responses") ?? "[]"); } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [templateFilter, setTemplateFilter] = useState("all");
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conversations, loading]);
  useEffect(() => { localStorage.setItem("saved_responses", JSON.stringify(savedResponses)); }, [savedResponses]);

  const currentConvo = conversations[activeTool];
  const tool = TOOLS.find((t) => t.id === activeTool);

  function showToast(msg, color = "#5B9BD5") {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2500);
  }

  async function sendMessage(text) {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text };
    const updated = [...currentConvo, userMsg];
    setConversations((p) => ({ ...p, [activeTool]: updated }));
    setInput("");
    setLoading(true);
    setActivePanel("chat");
    try {
      const { reply, citations } = await callBackend(activeTool, updated);
      setConversations((p) => ({
        ...p,
        [activeTool]: [...updated, { role: "assistant", content: reply, citations }],
      }));
    } catch (e) {
      setConversations((p) => ({
        ...p,
        [activeTool]: [...updated, { role: "assistant", content: `\u26A0\uFE0F Error: ${e.message}` }],
      }));
    } finally {
      setLoading(false);
    }
  }

  function saveResponse(content, toolId) {
    const entry = {
      id: Date.now(), tool: toolId,
      toolLabel: TOOLS.find((t) => t.id === toolId)?.label,
      content, savedAt: new Date().toLocaleString(),
      title: content.slice(0, 60).replace(/\n/g, " ") + "\u2026",
    };
    setSavedResponses((p) => [entry, ...p]);
    showToast("\u2713 Response saved", "#5BC98A");
  }

  function deleteSaved(id) {
    setSavedResponses((p) => p.filter((r) => r.id !== id));
    showToast("Deleted", "#E08A8A");
  }

  const filteredTemplates = templateFilter === "all"
    ? TEMPLATE_LIBRARY
    : TEMPLATE_LIBRARY.filter((t) => t.category === templateFilter);

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "linear-gradient(160deg, #080F18 0%, #0E1C2D 60%, #0A1520 100%)",
      color: "#C8DCF0", fontFamily: "Georgia, serif", overflow: "hidden",
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes toastIn { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        ::-webkit-scrollbar { width:5px } ::-webkit-scrollbar-thumb { background:rgba(91,155,213,0.25); border-radius:3px }
        .tab-btn:hover { background: rgba(255,255,255,0.06) !important; }
        .panel-btn:hover { opacity: 0.85; }
        .qbtn:hover { background: rgba(44,95,138,0.25) !important; border-color: rgba(91,155,213,0.4) !important; }
        .tbtn:hover { background: rgba(44,95,138,0.2) !important; }
        .send:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
        textarea { caret-color: #5B9BD5; }
        textarea:focus { outline: none !important; }
        .saved-card:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(8,15,24,0.8)", backdropFilter: "blur(16px)", flexShrink: 0,
        flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #1E4D73, #0A2A40)",
            border: "1px solid rgba(91,155,213,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>{"\u2695"}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#EAF2FB", letterSpacing: "-0.2px" }}>
              Psychiatry AI Workbench
            </div>
            <div style={{ fontSize: 11, color: "#3D6080", fontFamily: "system-ui", marginTop: 1 }}>
              Nuestra Esperanza Health &middot; AI-assisted clinical tools
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>

          <button className="panel-btn" onClick={() => setActivePanel((p) => (p === "saved" ? "chat" : "saved"))} style={{
            padding: "6px 12px", borderRadius: 8,
            background: activePanel === "saved" ? "rgba(91,155,213,0.2)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${activePanel === "saved" ? "rgba(91,155,213,0.4)" : "rgba(255,255,255,0.07)"}`,
            color: activePanel === "saved" ? "#9DCAF0" : "#5B7A96",
            fontSize: 12, cursor: "pointer", fontFamily: "system-ui", transition: "all 0.2s",
          }}>{"\u{1F4BE}"} {savedResponses.length} Saved</button>
        </div>
      </div>

      {/* ── TOOL TABS ── */}
      <div style={{
        display: "flex", padding: "8px 16px 0", gap: 4,
        background: "rgba(8,15,24,0.6)", flexShrink: 0, overflowX: "auto",
      }}>
        {TOOLS.map((t) => {
          const active = activeTool === t.id;
          const color = TOOL_COLORS[t.id];
          return (
            <button key={t.id} className="tab-btn" onClick={() => { setActiveTool(t.id); setActivePanel("chat"); }} style={{
              padding: "8px 16px", borderRadius: "8px 8px 0 0",
              border: "1px solid transparent",
              borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
              background: active ? `${color}22` : "transparent",
              color: active ? "#EAF2FB" : "#3D6080",
              cursor: "pointer", fontSize: 13, fontFamily: "system-ui", fontWeight: active ? 600 : 400,
              display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s", whiteSpace: "nowrap",
            }}>
              {t.icon} {t.label}
              {conversations[t.id].length > 0 && (
                <span style={{ background: `${color}22`, color, borderRadius: 20, padding: "0 6px", fontSize: 10 }}>
                  {Math.ceil(conversations[t.id].length / 2)}
                </span>
              )}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button className="tab-btn" onClick={() => setActivePanel((p) => (p === "templates" ? "chat" : "templates"))} style={{
            padding: "8px 14px", borderRadius: "8px 8px 0 0",
            border: "1px solid transparent",
            borderBottom: activePanel === "templates" ? "2px solid #E8AA5A" : "2px solid transparent",
            background: activePanel === "templates" ? "rgba(130,90,30,0.2)" : "transparent",
            color: activePanel === "templates" ? "#EAF2FB" : "#3D6080",
            cursor: "pointer", fontSize: 12, fontFamily: "system-ui", transition: "all 0.2s",
          }}>{"\u{1F4DA}"} Templates</button>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "0 16px 16px" }}>

        {/* TEMPLATES PANEL */}
        {activePanel === "templates" && (
          <div style={{ flex: 1, overflow: "auto", paddingTop: 16, animation: "fadeIn 0.3s" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {["all", "policy", "supervision", "lecture", "chat"].map((f) => (
                <button key={f} onClick={() => setTemplateFilter(f)} className="tbtn" style={{
                  padding: "5px 14px", borderRadius: 20,
                  background: templateFilter === f ? "rgba(44,95,138,0.35)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${templateFilter === f ? "rgba(91,155,213,0.5)" : "rgba(255,255,255,0.07)"}`,
                  color: templateFilter === f ? "#9DCAF0" : "#5B7A96",
                  fontSize: 12, cursor: "pointer", fontFamily: "system-ui", transition: "all 0.2s",
                  textTransform: "capitalize",
                }}>{f}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {filteredTemplates.map((tmpl) => {
                const color = TOOL_COLORS[tmpl.category];
                return (
                  <div key={tmpl.id} style={{
                    background: "rgba(14,28,45,0.7)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 12, padding: 16, cursor: "pointer", transition: "all 0.2s", animation: "fadeIn 0.3s",
                  }}
                    onClick={() => { setActiveTool(tmpl.category); setActivePanel("chat"); sendMessage(tmpl.prompt); }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}44`; e.currentTarget.style.background = "rgba(20,38,58,0.9)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.background = "rgba(14,28,45,0.7)"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color, fontFamily: "system-ui", textTransform: "uppercase", letterSpacing: 1 }}>
                        {TOOLS.find((t) => t.id === tmpl.category)?.icon} {tmpl.category}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, color: "#C8DCF0", fontWeight: 600, marginBottom: 6 }}>{tmpl.label}</div>
                    <div style={{ fontSize: 12, color: "#4A6880", lineHeight: 1.6, fontFamily: "system-ui" }}>
                      {tmpl.prompt.slice(0, 90)}{"\u2026"}
                    </div>
                    <div style={{
                      marginTop: 12, padding: "5px 12px", borderRadius: 6, display: "inline-block",
                      background: `${color}18`, border: `1px solid ${color}33`, color, fontSize: 11, fontFamily: "system-ui",
                    }}>Use template {"\u2192"}</div>
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
                <div style={{ fontSize: 40, marginBottom: 12 }}>{"\u{1F4BE}"}</div>
                <div style={{ fontFamily: "system-ui", fontSize: 14 }}>No saved responses yet.</div>
                <div style={{ fontFamily: "system-ui", fontSize: 12, marginTop: 6 }}>Hover over any AI response to save it.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {savedResponses.map((r) => (
                  <div key={r.id} className="saved-card" style={{
                    background: "rgba(14,28,45,0.7)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 12, padding: 16, transition: "all 0.2s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <span style={{
                          fontSize: 10, color: TOOL_COLORS[r.tool], fontFamily: "system-ui",
                          textTransform: "uppercase", letterSpacing: 1, marginRight: 8,
                        }}>{TOOLS.find((t) => t.id === r.tool)?.icon} {r.toolLabel}</span>
                        <span style={{ fontSize: 11, color: "#2E4A60", fontFamily: "system-ui" }}>{r.savedAt}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => exportToPDF(r.title, r.content)} style={{
                          padding: "3px 10px", borderRadius: 6, background: "rgba(44,95,138,0.2)",
                          border: "1px solid rgba(91,155,213,0.3)", color: "#7AB8D8",
                          fontSize: 11, cursor: "pointer", fontFamily: "system-ui",
                        }}>{"\u{1F5A8}"} PDF</button>
                        <button onClick={() => { navigator.clipboard.writeText(r.content); showToast("Copied!"); }} style={{
                          padding: "3px 10px", borderRadius: 6, background: "rgba(44,95,138,0.2)",
                          border: "1px solid rgba(91,155,213,0.3)", color: "#7AB8D8",
                          fontSize: 11, cursor: "pointer", fontFamily: "system-ui",
                        }}>{"\u{1F4CB}"} Copy</button>
                        <button onClick={() => deleteSaved(r.id)} style={{
                          padding: "3px 10px", borderRadius: 6, background: "rgba(138,44,44,0.15)",
                          border: "1px solid rgba(213,91,91,0.2)", color: "#C08080",
                          fontSize: 11, cursor: "pointer", fontFamily: "system-ui",
                        }}>{"\u2715"}</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "#7A9DB8", fontFamily: "system-ui", marginBottom: 8 }}>{r.title}</div>
                    <div style={{
                      maxHeight: 120, overflow: "hidden", position: "relative",
                      fontSize: 13, color: "#4A6880", lineHeight: 1.7, fontFamily: "Georgia,serif",
                    }}>
                      {r.content.slice(0, 300)}{"\u2026"}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: "linear-gradient(transparent, rgba(14,28,45,0.95))" }} />
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
            <div style={{ flex: 1, overflow: "auto", paddingTop: 16, paddingBottom: 4 }}>
              {currentConvo.length === 0 ? (
                <div style={{ animation: "fadeIn 0.4s" }}>
                  <div style={{ fontSize: 12, color: "#2E4A60", fontFamily: "system-ui", marginBottom: 12 }}>
                    Quick prompts for {tool.label}:
                  </div>
                  {QUICK_PROMPTS[activeTool].map((p, i) => (
                    <button key={i} className="qbtn" onClick={() => sendMessage(p)} style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 14px", marginBottom: 8,
                      background: "rgba(14,28,45,0.6)", border: "1px solid rgba(91,155,213,0.12)",
                      borderRadius: 10, color: "#7AB8D8", cursor: "pointer",
                      fontSize: 13, fontFamily: "Georgia,serif", lineHeight: 1.5, transition: "all 0.2s",
                    }}>
                      <span style={{ color: TOOL_COLORS[activeTool], marginRight: 8 }}>{"\u2192"}</span>{p}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {currentConvo.map((msg, i) => (
                    <MessageBubble key={i} {...msg}
                      onSave={() => saveResponse(msg.content, activeTool)}
                      onExport={() => exportToPDF(`${tool.label} \u2014 ${new Date().toLocaleDateString()}`, msg.content)}
                    />
                  ))}
                  {loading && <Spinner />}
                  <div ref={bottomRef} style={{ height: 40 }} />
                </>
              )}
            </div>

            {/* Input bar */}
            <div style={{
              flexShrink: 0,
              background: "rgba(14,28,45,0.85)", border: "1px solid rgba(91,155,213,0.15)",
              borderRadius: 14, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-end",
              backdropFilter: "blur(12px)",
            }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder={`${tool.icon} ${tool.desc} \u2014 describe what you need\u2026`}
                rows={2}
                style={{
                  flex: 1, background: "transparent", border: "none",
                  color: "#C8DCF0", fontFamily: "Georgia,serif", fontSize: 14,
                  lineHeight: 1.6, resize: "none",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {currentConvo.length > 0 && (
                  <button onClick={() => setConversations((p) => ({ ...p, [activeTool]: [] }))} style={{
                    padding: "4px 8px", borderRadius: 6, background: "transparent",
                    border: "1px solid rgba(255,255,255,0.06)", color: "#2E4A60",
                    fontSize: 11, cursor: "pointer", fontFamily: "system-ui",
                  }}>Clear</button>
                )}
                <button className="send" onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{
                  padding: "9px 16px", borderRadius: 10, fontSize: 18,
                  background: !input.trim() || loading
                    ? "rgba(44,95,138,0.15)"
                    : `linear-gradient(135deg, ${TOOL_COLORS[activeTool]}, #1A3D5C)`,
                  border: "none",
                  color: !input.trim() || loading ? "#2E4A60" : "#EAF2FB",
                  cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  boxShadow: !input.trim() || loading ? "none" : "0 4px 16px rgba(44,95,138,0.35)",
                }}>{"\u2191"}</button>
              </div>
            </div>
            <div style={{ textAlign: "center", fontSize: 10, color: "#1E3348", fontFamily: "system-ui", marginTop: 6 }}>
              Enter to send &middot; Shift+Enter for new line &middot; AI-generated &mdash; apply clinical judgment before use
            </div>
          </>
        )}
      </div>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "rgba(14,28,45,0.97)", border: `1px solid ${toast.color}44`,
          borderRadius: 10, padding: "10px 20px", color: toast.color,
          fontFamily: "system-ui", fontSize: 13, zIndex: 1000,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "toastIn 0.25s ease",
          backdropFilter: "blur(16px)",
        }}>{toast.msg}</div>
      )}
    </div>
  );
}
