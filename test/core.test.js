import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokens, costOf, runsForBudget, compare, resolvePrice, listModels,
  formatUsd, DEFAULT_PRICING,
} from "../src/core.js";

test("estimateTokens: empty and null", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(undefined), 0);
});
test("estimateTokens: short text a few tokens", () => {
  const n = estimateTokens("hello world");
  assert.ok(n >= 2 && n <= 6, `got ${n}`);
});
test("estimateTokens: grows with length", () => {
  assert.ok(estimateTokens("one two three four five six seven eight nine ten") > estimateTokens("one two three"));
});
test("estimateTokens: long identifiers cost more", () => {
  const hash = "a".repeat(64);
  assert.ok(estimateTokens(hash) >= 16);
  assert.ok(estimateTokens("the quick brown fox jumps over lazy dog") < estimateTokens(hash));
});
test("resolvePrice: exact/case-insensitive/dated", () => {
  assert.equal(resolvePrice("gpt-4o").key, "gpt-4o");
  assert.equal(resolvePrice("GPT-4O").key, "gpt-4o");
  assert.equal(resolvePrice("gpt-4o-2024-08-06").key, "gpt-4o");
  assert.equal(resolvePrice("claude-3-5-sonnet-20241022").key, "claude-3-5-sonnet");
});
test("resolvePrice: longest prefix wins", () => {
  assert.equal(resolvePrice("gpt-4o-mini-2024-07-18").key, "gpt-4o-mini");
});
test("resolvePrice: unknown throws", () => {
  assert.throws(() => resolvePrice("definitely-not-a-model"));
});
test("costOf: arithmetic", () => {
  const r = costOf({ inputTokens: 1_000_000, outputTokens: 1_000_000, model: "gpt-4o" });
  assert.equal(r.inputCost, 2.5);
  assert.equal(r.outputCost, 10);
  assert.equal(r.totalCost, 12.5);
});
test("costOf: zero is free", () => {
  assert.equal(costOf({ inputTokens: 0, outputTokens: 0, model: "gpt-4o" }).totalCost, 0);
});
test("costOf: explicit rate object", () => {
  assert.equal(costOf({ inputTokens: 1_000_000, outputTokens: 0, model: { input: 1, output: 2 } }).totalCost, 1);
});
test("runsForBudget: 10x budget -> 10 runs", () => {
  const one = costOf({ inputTokens: 1000, outputTokens: 100, model: "gpt-4o-mini" });
  const r = runsForBudget({ budgetUsd: one.totalCost * 10, inputTokens: 1000, outputTokens: 100, model: "gpt-4o-mini" });
  assert.equal(r.runs, 10);
});
test("runsForBudget: free -> infinite", () => {
  assert.equal(runsForBudget({ budgetUsd: 1, inputTokens: 0, outputTokens: 0, model: "gpt-4o" }).runs, Infinity);
});
test("compare: sorted ascending", () => {
  const rows = compare({ inputTokens: 1000, outputTokens: 300, models: ["gpt-4o", "gpt-4o-mini", "claude-3-5-haiku"] });
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].totalCost >= rows[i - 1].totalCost);
  assert.equal(rows[0].model, "gpt-4o-mini");
});
test("compare: unknown model -> error row", () => {
  const rows = compare({ inputTokens: 10, models: ["nope-not-real", "gpt-4o"] });
  assert.ok(rows.find((r) => r.model === "nope-not-real").error);
});
test("listModels excludes _meta", () => {
  assert.ok(!listModels().includes("_meta"));
  assert.ok(listModels().includes("gpt-4o"));
});
test("formatUsd precision", () => {
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(12.5), "$12.50");
  assert.equal(formatUsd(0.5), "$0.5000");
  assert.equal(formatUsd(0.00005), "$0.000050");
  assert.equal(formatUsd(Infinity), "∞");
});
test("default table well-formed", () => {
  for (const [k, v] of Object.entries(DEFAULT_PRICING)) {
    if (k === "_meta") continue;
    assert.equal(typeof v.input, "number", `${k}.input`);
    assert.equal(typeof v.output, "number", `${k}.output`);
    assert.ok(v.input >= 0 && v.output >= 0, `${k} non-negative`);
  }
});
