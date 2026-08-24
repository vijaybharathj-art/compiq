import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider } from "./openai-provider";
import { DemoExtractionProvider } from "./demo-provider";
import type { AIProvider } from "./types";

export type { AIProvider } from "./types";
export * from "./types";
export { DemoExtractionProvider } from "./demo-provider";

let cached: AIProvider | undefined;

/**
 * Resolves the AIProvider implementation from AI_PROVIDER ("demo" |
 * "anthropic" | "openai", default "demo"). See ARCHITECTURE.md §3 —
 * swapping vendors never touches page/component code, only this factory.
 * "demo" (DemoExtractionProvider) is a real rule-based implementation used
 * by prisma/seed.ts and requires no API key.
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
        cached = new DemoExtractionProvider();
    }
  }
  return cached;
}
