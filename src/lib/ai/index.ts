import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider } from "./openai-provider";
import { DemoAIProvider } from "./demo-provider";
import type { AIProvider } from "./types";

export type { AIProvider } from "./types";
export * from "./types";
export { DemoAIProvider } from "./demo-provider";

let cached: AIProvider | undefined;

/**
 * Resolves the AIProvider implementation from AI_PROVIDER ("demo" |
 * "anthropic" | "openai", default "demo"). See ARCHITECTURE.md §3 —
 * swapping vendors never touches page/component or pipeline code, only
 * this factory. "demo" (DemoAIProvider) is a real rule-based
 * implementation that requires no API key; the email intelligence
 * pipeline (src/lib/pipeline/) calls this same factory.
 */
export function getAIProvider(): AIProvider {
  if (!cached) {
    switch (process.env.AI_PROVIDER) {
      case "openai":
        cached = new OpenAIProvider();
        break;
      case "anthropic":
        cached = new AnthropicProvider();
        break;
      default:
        cached = new DemoAIProvider();
    }
  }
  return cached;
}
