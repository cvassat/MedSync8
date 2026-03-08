import React, { useState } from "react";

const isErrorMessage = (content) => content.startsWith("\u26A0");

export default React.memo(function MessageBubble({ role, content, streaming, onSave, onExport, onCopy, onRetry }) {
  const isUser = role === "user";
  const isError = !isUser && isErrorMessage(content);
  const [hover, setHover] = useState(false);

  return (
    <div
      role="listitem"
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 18,
        animation: "fadeIn 0.35s ease",
      }}
    >
      {!isUser && (
        <div
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            flexShrink: 0,
            background: "linear-gradient(135deg, #1E4D73, #0D2D47)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            marginRight: 10,
            marginTop: 4,
            border: "1px solid rgba(91,155,213,0.3)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
          }}
        >
          {"\u2695\uFE0F"}
        </div>
      )}
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ maxWidth: "80%", position: "relative" }}>
        <div
          style={{
            background: isUser
              ? "linear-gradient(135deg, #2C5F8A, #1A3D5C)"
              : isError
                ? "rgba(52,20,20,0.8)"
                : "rgba(20,35,52,0.8)",
            border: isUser
              ? "none"
              : isError
                ? "1px solid rgba(213,91,91,0.25)"
                : "1px solid rgba(91,155,213,0.15)",
            borderRadius: isUser ? "16px 16px 3px 16px" : "3px 16px 16px 16px",
            padding: "11px 15px",
            color: isUser ? "#EAF2FB" : isError ? "#E0A0A0" : "#C8DCF0",
            fontSize: 13.5,
            lineHeight: 1.75,
            fontFamily: "Georgia,serif",
            whiteSpace: "pre-wrap",
            boxShadow: isUser ? "0 4px 20px rgba(44,95,138,0.3)" : "0 2px 12px rgba(0,0,0,0.2)",
          }}
        >
          {content}
          {streaming && (
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: "1em",
                background: "#5B9BD5",
                marginLeft: 2,
                verticalAlign: "text-bottom",
                animation: "blink 1s step-end infinite",
              }}
            />
          )}
        </div>

        {/* Retry button for error messages */}
        {isError && onRetry && (
          <button
            onClick={onRetry}
            style={{
              marginTop: 8,
              padding: "5px 14px",
              borderRadius: 8,
              background: "rgba(138,44,44,0.2)",
              border: "1px solid rgba(213,91,91,0.3)",
              color: "#D89090",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "system-ui",
              transition: "all 0.2s",
            }}
          >
            {"\u21BB"} Retry
          </button>
        )}

        {/* Action buttons on hover */}
        {!isUser && !isError && hover && !streaming && (
          <div
            style={{
              position: "absolute",
              bottom: -30,
              left: 0,
              display: "flex",
              gap: 6,
              zIndex: 10,
              animation: "fadeIn 0.15s",
            }}
          >
            {[
              ["\uD83D\uDCBE Save", onSave],
              ["\uD83D\uDDA8 Export PDF", onExport],
              ["\uD83D\uDCCB Copy", onCopy],
            ].map(([label, fn]) => (
              <button
                key={label}
                onClick={fn}
                aria-label={label}
                style={{
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: "rgba(20,35,52,0.95)",
                  border: "1px solid rgba(91,155,213,0.3)",
                  color: "#7AB8D8",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "system-ui",
                  backdropFilter: "blur(8px)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
