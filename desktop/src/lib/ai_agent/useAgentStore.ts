import { create } from "zustand";
import type { ChatMessage } from "./api";

export type ChatBubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Set on the assistant bubble while streaming, then cleared. */
  streaming?: boolean;
  /** Tokens info, filled when streaming completes. */
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
};

type AgentStoreState = {
  bubbles: ChatBubble[];
  /** Request id of the in-flight assistant message, if any. */
  pendingRequestId: string | null;
  inputDraft: string;

  setInputDraft: (s: string) => void;
  appendUser: (content: string) => string; // returns bubble id (= request id)
  appendAssistantStub: (requestId: string) => void;
  appendDelta: (requestId: string, text: string) => void;
  finishAssistant: (
    requestId: string,
    info: { inputTokens: number; outputTokens: number },
  ) => void;
  failAssistant: (requestId: string, message: string) => void;
  clearConversation: () => void;
  /** Build the messages payload for the next API call. */
  buildMessages: () => ChatMessage[];
};

export const useAgentStore = create<AgentStoreState>()((set, get) => ({
  bubbles: [],
  pendingRequestId: null,
  inputDraft: "",

  setInputDraft: (s) => set({ inputDraft: s }),

  appendUser: (content) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({
      bubbles: [
        ...s.bubbles,
        { id, role: "user", content },
      ],
      inputDraft: "",
    }));
    return id;
  },

  appendAssistantStub: (requestId) =>
    set((s) => ({
      pendingRequestId: requestId,
      bubbles: [
        ...s.bubbles,
        {
          id: requestId,
          role: "assistant",
          content: "",
          streaming: true,
        },
      ],
    })),

  appendDelta: (requestId, text) =>
    set((s) => ({
      bubbles: s.bubbles.map((b) =>
        b.id === requestId ? { ...b, content: b.content + text } : b,
      ),
    })),

  finishAssistant: (requestId, info) =>
    set((s) => ({
      pendingRequestId:
        s.pendingRequestId === requestId ? null : s.pendingRequestId,
      bubbles: s.bubbles.map((b) =>
        b.id === requestId
          ? {
              ...b,
              streaming: false,
              inputTokens: info.inputTokens,
              outputTokens: info.outputTokens,
            }
          : b,
      ),
    })),

  failAssistant: (requestId, message) =>
    set((s) => ({
      pendingRequestId:
        s.pendingRequestId === requestId ? null : s.pendingRequestId,
      bubbles: s.bubbles.map((b) =>
        b.id === requestId
          ? { ...b, streaming: false, error: message }
          : b,
      ),
    })),

  clearConversation: () =>
    set({ bubbles: [], pendingRequestId: null, inputDraft: "" }),

  buildMessages: (): ChatMessage[] => {
    // Translate user/assistant bubbles to Anthropic-compatible turns.
    // Skip empty assistant stubs (still streaming) and bubbles with errors.
    return get()
      .bubbles.filter((b) => b.content.trim().length > 0 && !b.error)
      .map((b) => ({ role: b.role, content: b.content }));
  },
}));
