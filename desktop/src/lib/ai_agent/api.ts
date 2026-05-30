import { invoke } from "@tauri-apps/api/core";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type SendArgs = {
  requestId: string;
  system: string;
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
};

/** Fire the streaming request. The response comes back via Tauri events
 *  (`ai_agent:delta`, `ai_agent:done`, `ai_agent:error`) tagged with
 *  the same `requestId`. */
export async function sendMessage(args: SendArgs): Promise<void> {
  return invoke<void>("ai_agent_send", { args });
}

export async function saveApiKey(apiKey: string): Promise<void> {
  return invoke<void>("ai_agent_save_api_key", { args: { apiKey } });
}

export async function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("ai_agent_has_api_key");
}

export async function deleteApiKey(): Promise<void> {
  return invoke<void>("ai_agent_delete_api_key");
}

export type DeltaEvent = { requestId: string; text: string };
export type DoneEvent = {
  requestId: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
};
export type ErrorEvent = { requestId: string; message: string };
