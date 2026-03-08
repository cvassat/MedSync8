import { useState } from "react";

export default function SetupBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("setup-banner-dismissed") === "true";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("setup-banner-dismissed", "true");
    } catch {}
  };

  return (
    <div
      style={{
        margin: "0 16px",
        padding: "14px 18px",
        background: "rgba(130, 90, 30, 0.12)",
        border: "1px solid rgba(232, 170, 90, 0.3)",
        borderRadius: 12,
        fontFamily: "system-ui",
        animation: "fadeIn 0.3s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#E8AA5A", marginBottom: 10 }}>
          API Key Required
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss setup banner"
          style={{
            background: "none",
            border: "none",
            color: "#5B7A96",
            cursor: "pointer",
            fontSize: 16,
            padding: "0 4px",
          }}
        >
          {"\u2715"}
        </button>
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, color: "#9DAAB8", fontSize: 13, lineHeight: 2 }}>
        <li>
          Copy <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>.env.example</code> to{" "}
          <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>.env</code>
        </li>
        <li>
          Get your API key from{" "}
          <span style={{ color: "#7AB8D8" }}>console.anthropic.com</span>
        </li>
        <li>
          Set{" "}
          <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>
            ANTHROPIC_API_KEY=sk-ant-...
          </code>{" "}
          in <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>.env</code>
        </li>
        <li>
          Restart the server{" "}
          <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>npm run dev</code>
        </li>
      </ol>
    </div>
  );
}
