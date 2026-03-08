/**
 * Calls the backend proxy which forwards to Claude API.
 * API key is stored server-side only — never exposed to the browser.
 */
export async function callClaude(messages, tool) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, tool, maxTokens: 4096 }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data.text;
}
