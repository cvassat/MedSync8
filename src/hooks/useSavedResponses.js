import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "psychiatry-workbench-saved";

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function useSavedResponses() {
  const [responses, setResponses] = useState(loadFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
    } catch {
      // Storage full or unavailable — fail silently
    }
  }, [responses]);

  const saveResponse = useCallback((content, toolId, toolLabel) => {
    const entry = {
      id: Date.now(),
      tool: toolId,
      toolLabel,
      content,
      savedAt: new Date().toISOString(),
      title: content.slice(0, 60).replace(/\n/g, " ") + "\u2026",
    };
    setResponses((prev) => [entry, ...prev]);
    return entry;
  }, []);

  const deleteResponse = useCallback((id) => {
    setResponses((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { responses, saveResponse, deleteResponse };
}
