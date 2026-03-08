import { useState, useEffect, useCallback } from "react";

export function useConnectionStatus() {
  const [status, setStatus] = useState("checking"); // checking | connected | disconnected | no-api-key

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) {
        setStatus("disconnected");
        return;
      }
      const data = await res.json();
      setStatus(data.hasApiKey ? "connected" : "no-api-key");
    } catch {
      setStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  // Re-check every 30s when not connected
  useEffect(() => {
    if (status === "connected") return;
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [status, check]);

  return { status, recheckConnection: check };
}
