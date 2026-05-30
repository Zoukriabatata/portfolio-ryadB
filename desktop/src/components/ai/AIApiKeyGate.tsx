import { useState } from "react";
import { saveApiKey } from "../../lib/ai_agent/api";

export function AIApiKeyGate({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveApiKey(value.trim());
      onSaved();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <div className="ai-route">
      <div className="ai-key-card">
        <div className="ai-key-icon">◌</div>
        <h2 className="ai-key-title">Anthropic API key required</h2>
        <p className="ai-key-sub">
          Paste your Anthropic key (starts with <code>sk-ant-</code>). Stored
          in your OS keychain — never written to disk or sent anywhere except
          api.anthropic.com.
        </p>
        <form onSubmit={submit} className="ai-key-form">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-ant-…"
            className="ai-key-input"
            autoFocus
          />
          <button
            type="submit"
            disabled={saving || value.trim().length < 8}
            className="ai-key-submit"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        </form>
        {error && <div className="ai-key-error">{error}</div>}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noreferrer"
          className="ai-key-link"
        >
          Get a key on console.anthropic.com →
        </a>
      </div>
    </div>
  );
}
