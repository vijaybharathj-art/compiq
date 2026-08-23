import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider } from "./openai-provider";
import type { AIProvider } from "./types";

export type { AIProvider } from "./types";
export * from "./types";

let cached: AIProvider | undefined;

/**
 * Resolves the AIProvider implementation from AI_PROVIDER ("anthropic" |
 * "openai", default "anthropic"). See ARCHITECTURE.md §3 — swapping
 * vendors never touches page/component code, only this factory.
 */
export function getAIProvider(): AIProvider {
  if (!cached) {
    cached = process.env.AI_PROVIDER === "openai" ? new OpenAIProvider() : new AnthropicProvider();
  }
  return cached;
}
