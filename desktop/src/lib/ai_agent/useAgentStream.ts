import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAgentStore } from "./useAgentStore";
import type { DeltaEvent, DoneEvent, ErrorEvent } from "./api";

/** Hook : subscribes to Tauri events for the AI Agent stream, routes
 *  them to the store. Mount this once near the top of the AI route. */
export function useAgentStream() {
  const appendDelta = useAgentStore((s) => s.appendDelta);
  const finishAssistant = useAgentStore((s) => s.finishAssistant);
  const failAssistant = useAgentStore((s) => s.failAssistant);

  useEffect(() => {
    let unlistens: UnlistenFn[] = [];
    let cancelled = false;
    void (async () => {
      const u1 = await listen<DeltaEvent>("ai_agent:delta", (e) => {
        appendDelta(e.payload.requestId, e.payload.text);
      });
      const u2 = await listen<DoneEvent>("ai_agent:done", (e) => {
        finishAssistant(e.payload.requestId, {
          inputTokens: e.payload.inputTokens,
          outputTokens: e.payload.outputTokens,
        });
      });
      const u3 = await listen<ErrorEvent>("ai_agent:error", (e) => {
        failAssistant(e.payload.requestId, e.payload.message);
      });
      if (cancelled) {
        u1();
        u2();
        u3();
      } else {
        unlistens = [u1, u2, u3];
      }
    })();
    return () => {
      cancelled = true;
      for (const u of unlistens) u();
    };
  }, [appendDelta, finishAssistant, failAssistant]);
}
