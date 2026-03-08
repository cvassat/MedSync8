import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "psychiatry-workbench-conversations";
const EMPTY = { policy: [], supervision: [], lecture: [], chat: [] };

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return EMPTY;
    const parsed = JSON.parse(stored);
    for (const key of Object.keys(EMPTY)) {
      if (!Array.isArray(parsed[key])) return EMPTY;
    }
    return parsed;
  } catch {
    return EMPTY;
  }
}

export function useConversations() {
  const [conversations, setConversations] = useState(loadFromStorage);

  // Debounced save — avoids hammering localStorage during streaming
  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      } catch {
        // Storage full — fail silently
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [conversations]);

  const clearConversation = useCallback((tool) => {
    setConversations((prev) => ({ ...prev, [tool]: [] }));
  }, []);

  const clearAll = useCallback(() => {
    setConversations(EMPTY);
  }, []);

  return { conversations, setConversations, clearConversation, clearAll };
}
