import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "../../lib/ai_agent/useAgentStore";
import { useAgentStream } from "../../lib/ai_agent/useAgentStream";
import { sendMessage } from "../../lib/ai_agent/api";
import { buildSystemPrompt, buildLiveContext } from "../../lib/ai_agent/buildContext";
import { AIMessage } from "./AIMessage";

const SUGGESTIONS = [
  "Lis-moi le setup GEX du jour et identifie les niveaux clés.",
  "Analyse le flow options : sentiment dominant ?",
  "Quels sont les risques sur mes positions actuelles ?",
  "Quels événements éco vont impacter ma session ?",
];

export function AIChat() {
  useAgentStream();
  const bubbles = useAgentStore((s) => s.bubbles);
  const pending = useAgentStore((s) => s.pendingRequestId);
  const inputDraft = useAgentStore((s) => s.inputDraft);
  const setInputDraft = useAgentStore((s) => s.setInputDraft);
  const appendUser = useAgentStore((s) => s.appendUser);
  const appendStub = useAgentStore((s) => s.appendAssistantStub);
  const buildMessages = useAgentStore((s) => s.buildMessages);
  const clearConversation = useAgentStore((s) => s.clearConversation);

  const [showContext, setShowContext] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [bubbles]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    // 1) Add user bubble (returns id we reuse for the assistant request).
    appendUser(content);
    // 2) Build messages payload AFTER user is added so the latest turn
    //    is included.
    const messages = buildMessages();
    // 3) Generate a new id for the assistant request and stub.
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `req-${Date.now()}`;
    appendStub(requestId);
    try {
      await sendMessage({
        requestId,
        system: buildSystemPrompt(),
        messages,
      });
    } catch (err) {
      useAgentStore
        .getState()
        .failAssistant(requestId, String(err));
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(inputDraft);
    }
  };

  const isEmpty = bubbles.length === 0;
  const contextPreview = showContext ? buildLiveContext() : null;

  return (
    <div className="ai-chat">
      <div className="ai-chat-toolbar">
        <button
          type="button"
          className={`ai-context-toggle ${showContext ? "ai-context-toggle-active" : ""}`}
          onClick={() => setShowContext((v) => !v)}
        >
          {showContext ? "Hide context" : "View live context"}
        </button>
        <button
          type="button"
          className="ai-toolbar-btn"
          onClick={clearConversation}
          disabled={bubbles.length === 0}
        >
          New conversation
        </button>
      </div>

      {showContext && contextPreview && (
        <pre className="ai-context-preview">{contextPreview}</pre>
      )}

      <div className="ai-chat-stream" ref={scrollRef}>
        {isEmpty ? (
          <div className="ai-empty">
            <div className="ai-empty-title">What do you want to look at?</div>
            <div className="ai-empty-sub">
              The agent has read-only access to your live GEX, Option Flow,
              Account, and News state.
            </div>
            <div className="ai-empty-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ai-suggestion"
                  onClick={() => void send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          bubbles.map((b) => <AIMessage key={b.id} bubble={b} />)
        )}
      </div>

      <form
        className="ai-input-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(inputDraft);
        }}
      >
        <textarea
          value={inputDraft}
          onChange={(e) => setInputDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            pending
              ? "Generating reply…"
              : "Ask anything about your current setup. ⇧↵ for newline."
          }
          rows={2}
          disabled={!!pending}
          className="ai-input"
        />
        <button
          type="submit"
          className="ai-send-btn"
          disabled={!!pending || inputDraft.trim().length === 0}
        >
          {pending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
