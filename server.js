import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: { error: "Too many requests. Please wait a moment." },
});

// ── System Prompts (server-side only) ───────────────────────────────────────
const SYSTEM_PROMPTS = {
  policy: `You are a board-certified psychiatrist and healthcare compliance expert specializing in telepsychiatry policy development. Create rigorous, legally defensible clinical policies and procedures. Format policies with: PURPOSE, SCOPE, POLICY STATEMENT, PROCEDURES (numbered), DEFINITIONS, REGULATORY REFERENCES, REVIEW DATE. Cite DEA rules, state medical board regulations, and PDMP requirements where applicable.`,
  supervision: `You are a supervising psychiatrist creating structured NP/PA supervision tools for psychiatric practice. Generate supervision checklists, feedback forms, competency assessments, and collaborative practice review frameworks. Include measurable competency criteria, prescribing safety checks, documentation quality indicators, and actionable feedback language. Use clear sections with checkboxes and rating scales.`,
  lecture: `You are a psychiatric educator creating CME-accredited educational content. Build lecture outlines, case presentations, and slide-by-slide content. Always include: LEARNING OBJECTIVES (3-5), KEY TEACHING POINTS, CLINICAL PEARLS (boxed), CASE VIGNETTES with discussion questions, EVIDENCE-BASED REFERENCES. Structure for adult learners with clear headers.`,
  chat: `You are a board-certified psychiatrist providing expert clinical consultation, regulatory guidance, and practice management support. You have deep expertise in telepsychiatry, controlled substance prescribing (DEA/PDMP), collaborative practice agreements, forensic documentation, ERISA/LTD evaluations, and multi-state licensure. Provide nuanced, clinically grounded responses.`,
};

const VALID_TOOLS = new Set(Object.keys(SYSTEM_PROMPTS));
const VALID_TOOLS_LIST = [...VALID_TOOLS].join(", ");

// ── Anthropic Client ────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Shared validation ────────────────────────────────────────────────────────
function validateRequest(body) {
  const { messages, tool, maxTokens } = body;

  if (!tool || !VALID_TOOLS.has(tool)) {
    return { error: `Invalid tool. Must be one of: ${VALID_TOOLS_LIST}`, status: 400 };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: "Messages must be a non-empty array.", status: 400 };
  }

  const sanitizedMessages = messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: String(m.content).slice(0, 50_000),
  }));

  const tokens = Math.min(Math.max(Number(maxTokens) || 4096, 256), 8192);

  return { sanitizedMessages, tokens, tool };
}

function handleApiError(err, res) {
  console.error("Claude API error:", err.message);
  if (err.status === 429) {
    return res.status(429).json({ error: "Rate limited by Anthropic. Please wait and try again." });
  }
  if (err.status === 401) {
    return res.status(500).json({ error: "Invalid API key. Check your ANTHROPIC_API_KEY." });
  }
  res.status(500).json({ error: "Failed to get response. Please try again." });
}

// ── Routes ──────────────────────────────────────────────────────────────────
app.post("/api/claude", apiLimiter, async (req, res) => {
  try {
    const result = validateRequest(req.body);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { sanitizedMessages, tokens, tool } = result;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: tokens,
      system: SYSTEM_PROMPTS[tool],
      messages: sanitizedMessages,
    });

    const text = response.content?.find((b) => b.type === "text")?.text ?? "No response received.";
    res.json({ text });
  } catch (err) {
    handleApiError(err, res);
  }
});

// ── Streaming endpoint (SSE) ────────────────────────────────────────────────
app.post("/api/claude/stream", apiLimiter, async (req, res) => {
  const result = validateRequest(req.body);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const { sanitizedMessages, tokens, tool } = result;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  let aborted = false;

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: tokens,
      system: SYSTEM_PROMPTS[tool],
      messages: sanitizedMessages,
    });

    req.on("close", () => {
      aborted = true;
      stream.abort();
    });

    stream.on("text", (text) => {
      if (!aborted) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    });

    await stream.finalMessage();

    if (!aborted) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (err) {
    console.error("Stream error:", err.message);
    if (!aborted) {
      const msg =
        err.status === 429
          ? "Rate limited by Anthropic. Please wait and try again."
          : err.status === 401
            ? "Invalid API key. Check your ANTHROPIC_API_KEY."
            : "Stream interrupted. Please try again.";
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
});

// ── Health check ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", hasApiKey: !!process.env.ANTHROPIC_API_KEY });
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️  ANTHROPIC_API_KEY not set — API calls will fail.");
  }
});
