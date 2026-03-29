/**
 * Calls the backend proxy which forwards to Claude API.
 * API key is stored server-side only — never exposed to the browser.
 */

function classifyError(res, data) {
  if (res.status === 429) throw new Error("Rate limited. Please wait a moment before sending another message.");
  if (data?.error?.includes("API key")) throw new Error("API key is missing or invalid. Check server configuration.");
  throw new Error(data?.error || `Request failed (${res.status})`);
}

export async function callClaude(messages, tool) {
  let res;
  try {
    res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, tool, maxTokens: 4096 }),
    });
  } catch {
    throw new Error("Can't reach server. Check your connection.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) classifyError(res, data);
  return data.text;
}

/**
 * Streaming version — calls SSE endpoint, invokes onChunk for each text delta.
 * Returns a promise that resolves when streaming is complete.
 * Pass an AbortSignal to cancel mid-stream.
 */
export async function callClaudeStream(messages, tool, onChunk, signal) {
  let res;
  try {
    res = await fetch("/api/claude/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, tool, maxTokens: 4096 }),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") return;
    throw new Error("Can't reach server. Check your connection.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    classifyError(res, data);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop(); // keep incomplete frame

    for (const frame of frames) {
      const match = frame.match(/^data: (.+)$/m);
      if (!match) continue;
      if (match[1] === "[DONE]") return;

      try {
        const payload = JSON.parse(match[1]);
        if (payload.error) throw new Error(payload.error);
        if (payload.text) onChunk(payload.text);
      } catch (e) {
        if (e.message && e.message !== "Unexpected end of JSON input") throw e;
        // Skip malformed frames — partial data from network split
      }
    }
  }
}
