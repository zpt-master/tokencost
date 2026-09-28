// src/pricing.js
//
// Default price table. Prices are in USD per 1,000,000 tokens (per-million),
// which is how model providers publish them.
//
// Providers change prices. Override any entry with --table <file.json>
// or via the library API (see core.js). Defaults are a snapshot and are
// intentionally easy to replace.

export const DEFAULT_PRICING = {
  _meta: {
    currency: "USD",
    unit: "per 1M tokens",
    note: "Snapshot defaults. Verify against your provider's current pricing page. Override with --table.",
  },

  // OpenAI
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "o4-mini": { input: 1.1, output: 4.4 },

  // Anthropic
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku": { input: 0.8, output: 4.0 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },

  // Google
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },

  // Mistral
  "mistral-large": { input: 2.0, output: 6.0 },
  "mistral-small": { input: 0.2, output: 0.6 },

  // Meta (hosted reference)
  "llama-3.1-70b": { input: 0.5, output: 0.7 },
  "llama-3.1-8b": { input: 0.05, output: 0.08 },
};

export function listModels(table = DEFAULT_PRICING) {
  return Object.keys(table).filter((k) => k !== "_meta").sort();
}

// exact -> case-insensitive exact -> longest prefix match (tolerates dated suffixes)
export function resolvePrice(model, table = DEFAULT_PRICING) {
  if (!model) throw new Error("model name is required");
  if (table[model]) return { key: model, ...table[model] };

  const lower = String(model).toLowerCase();
  const keys = listModels(table);

  const ci = keys.find((k) => k.toLowerCase() === lower);
  if (ci) return { key: ci, ...table[ci] };

  const prefix = keys
    .filter((k) => lower.startsWith(k.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix) return { key: prefix, ...table[prefix] };

  throw new Error(
    `unknown model: "${model}". Run "tokencost models" to see known models, ` +
      `or pass --table <file.json>.`
  );
}
