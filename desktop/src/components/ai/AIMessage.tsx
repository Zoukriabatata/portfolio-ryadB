import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatBubble } from "../../lib/ai_agent/useAgentStore";

export function AIMessage({ bubble }: { bubble: ChatBubble }) {
  const isUser = bubble.role === "user";
  return (
    <div className={`ai-msg ai-msg-${bubble.role}`}>
      <div className="ai-msg-bubble">
        {isUser ? (
          <div className="ai-msg-text">{bubble.content}</div>
        ) : (
          <div className="ai-msg-markdown">
            {bubble.content.length === 0 && bubble.streaming ? (
              <span className="ai-msg-typing">
                <span /> <span /> <span />
              </span>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {bubble.content}
              </ReactMarkdown>
            )}
          </div>
        )}
        {bubble.error && (
          <div className="ai-msg-error">⚠ {bubble.error}</div>
        )}
        {!isUser && !bubble.streaming && bubble.outputTokens !== undefined && (
          <div className="ai-msg-footer">
            {bubble.inputTokens ?? 0} in · {bubble.outputTokens} out tokens
          </div>
        )}
      </div>
    </div>
  );
}
