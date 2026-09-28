// src/core.js
//
// Pure, dependency-free core logic: token estimation, cost math, budgeting,
// and comparison. Deterministic and unit-testable.

import { DEFAULT_PRICING, resolvePrice, listModels } from "./pricing.js";

export { DEFAULT_PRICING, resolvePrice, listModels };

/**
 * Estimate the number of tokens in a string.
 *
 * A calibrated heuristic, NOT a tokenizer. Deliberately conservative (rounds
 * up and leans slightly high) so estimates are more often "over" than "under"
 * — the safe direction when budgeting. If you need exact counts, tokenize with
 * your provider's library and pass real numbers to costOf().
 *
 * @param {string} text
 * @returns {number} estimated tokens (integer >= 0)
 */
export function estimateTokens(text) {
  if (text == null) return 0;
  const s = String(text);
  if (s.length === 0) return 0;

  let estimate = 0;
  const words = s.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (w.length <= 6) estimate += 1;
    else estimate += Math.ceil(w.length / 4);
  }
  const punct = (s.match(/[^\p{L}\p{N}\s]/gu) || []).length;
  estimate += Math.ceil(punct / 8);

  return Math.max(1, Math.ceil(estimate));
}

/**
 * Cost of a single call, in USD.
 * @returns {{model:string,inputTokens:number,outputTokens:number,inputCost:number,
 *            outputCost:number,totalCost:number,inputRate:number,outputRate:number}}
 */
export function costOf({ inputTokens = 0, outputTokens = 0, model, table } = {}) {
  const rates =
    model && typeof model === "object"
      ? model
      : resolvePrice(model, table || DEFAULT_PRICING);

  const inRate = Number(rates.input) || 0;
  const outRate = Number(rates.output) || 0;

  const inputCost = (inputTokens / 1_000_000) * inRate;
  const outputCost = (outputTokens / 1_000_000) * outRate;

  return {
    model: rates.key || (typeof model === "string" ? model : "custom"),
    inputTokens,
    outputTokens,
    inputRate: inRate,
    outputRate: outRate,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/** How many runs of `call` fit inside `budgetUsd`? */
export function runsForBudget({ budgetUsd, ...call }, table) {
  const one = costOf({ ...call, table });
  if (one.totalCost <= 0) {
    return { budgetUsd, runs: Infinity, spentUsd: 0, remainingUsd: budgetUsd };
  }
  const runs = Math.floor(budgetUsd / one.totalCost + 1e-9);
  const spent = runs * one.totalCost;
  return { budgetUsd, runs, spentUsd: spent, remainingUsd: budgetUsd - spent };
}

/** Compare one prompt across several models; sorted ascending by cost. */
export function compare({ text, inputTokens, outputTokens = 0, models, table } = {}) {
  const inTok = inputTokens != null ? inputTokens : estimateTokens(text);
  const rows = [];
  for (const m of models) {
    let row;
    try {
      row = costOf({ inputTokens: inTok, outputTokens, model: m, table });
    } catch (err) {
      rows.push({ model: m, error: err.message, totalCost: Infinity });
      continue;
    }
    rows.push(row);
  }
  return rows.sort((a, b) => a.totalCost - b.totalCost);
}

/** Format USD with sensible precision for small amounts. */
export function formatUsd(usd) {
  if (!isFinite(usd)) return "∞";
  if (usd === 0) return "$0.00";
  const abs = Math.abs(usd);
  if (abs < 0.001) return `$${usd.toFixed(6)}`;
  if (abs < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
