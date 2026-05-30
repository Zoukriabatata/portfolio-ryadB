import { useEffect, useState } from "react";
import { hasApiKey } from "../lib/ai_agent/api";
import { AIApiKeyGate } from "../components/ai/AIApiKeyGate";
import { AIChat } from "../components/ai/AIChat";
import "../components/ai/ai.css";

export function AIRoute() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void hasApiKey()
      .then(setConfigured)
      .catch(() => setConfigured(false));
  }, []);

  if (configured === null) {
    return (
      <div className="ai-route">
        <div className="ai-empty">
          <div className="ai-empty-title">Loading…</div>
        </div>
      </div>
    );
  }

  if (!configured) {
    return <AIApiKeyGate onSaved={() => setConfigured(true)} />;
  }

  return (
    <div className="ai-route">
      <AIChat />
    </div>
  );
}
