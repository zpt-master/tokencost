#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import {
  DEFAULT_PRICING, estimateTokens, costOf, runsForBudget, compare, listModels, formatUsd,
} from "../src/core.js";

const HELP = `tokencost — offline cost estimator for LLM / AI inference

USAGE
  tokencost tokens <text|->            Estimate token count (- reads stdin)
  tokencost cost --model M [opts]      Cost of a single call
  tokencost batch --runs N [opts]      Cost of N runs of a call
  tokencost budget --usd X [opts]      How many runs fit in a budget
  tokencost compare --models a,b,c     Compare models for the same call
  tokencost models                     List known models and rates
  tokencost --help

COMMON OPTIONS
  --text "..."   Prompt text (input tokens estimated from it)
  --input N      Explicit input token count (overrides --text)
  --output N     Expected output tokens (default 0)
  --model M      Model name (e.g. gpt-4o-mini)
  --runs N       Number of runs (batch)
  --usd X        Budget in USD (budget)
  --models a,b,c Comma-separated models (compare)
  --table FILE   JSON file overriding the default price table
  --json         Machine-readable output

EXAMPLES
  tokencost cost --model gpt-4o-mini --text "Summarize this email..."
  echo "hello world" | tokencost tokens -
  tokencost batch --model claude-sonnet-4 --input 2000 --output 500 --runs 1000
  tokencost budget --model gpt-4o-mini --input 1000 --output 200 --usd 5
  tokencost compare --models gpt-4o,gpt-4o-mini,claude-3-5-haiku --input 1000 --output 300
`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}
function loadTable(args) {
  if (!args.table) return DEFAULT_PRICING;
  return JSON.parse(fs.readFileSync(args.table, "utf8"));
}
function numberArg(args, key, fallback = 0) {
  if (args[key] === undefined || args[key] === true) return fallback;
  const n = Number(args[key]);
  if (Number.isNaN(n)) throw new Error(`--${key} must be a number`);
  return n;
}
async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}
function fail(msg, code = 1) { console.error(`error: ${msg}`); process.exit(code); }

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  const table = loadTable(args);
  const json = Boolean(args.json);

  if (cmd === "models") {
    const models = listModels(table);
    if (json) { console.log(JSON.stringify(models.map((m) => ({ model: m, ...table[m] })), null, 2)); return; }
    console.log("Known models (USD per 1M tokens):\n");
    for (const m of models) {
      const p = table[m];
      console.log(`  ${m.padEnd(24)} in ${String(p.input).padStart(8)}   out ${String(p.output).padStart(8)}`);
    }
    console.log("\nOverride prices with --table <file.json>.");
    return;
  }

  if (cmd === "tokens") {
    const src = args._[0];
    if (!src) fail("usage: tokencost tokens <text|->");
    const text = src === "-" ? await readStdin() : src;
    const n = estimateTokens(text);
    if (json) console.log(JSON.stringify({ tokens: n, chars: text.length }));
    else console.log(`${n} tokens (${text.length} chars, ~${(text.length / Math.max(1, n)).toFixed(1)} chars/token)`);
    return;
  }

  if (cmd === "cost") {
    const model = args.model;
    if (!model) fail("--model is required");
    const inputTokens = args.input != null ? numberArg(args, "input") : estimateTokens(args.text || "");
    const outputTokens = numberArg(args, "output");
    const r = costOf({ inputTokens, outputTokens, model, table });
    if (json) return console.log(JSON.stringify(r, null, 2));
    console.log(`model       ${r.model}`);
    console.log(`input       ${inputTokens} tok  @ ${formatUsd(r.inputRate)}/M  = ${formatUsd(r.inputCost)}`);
    console.log(`output      ${outputTokens} tok  @ ${formatUsd(r.outputRate)}/M  = ${formatUsd(r.outputCost)}`);
    console.log(`TOTAL       ${formatUsd(r.totalCost)}`);
    return;
  }

  if (cmd === "batch") {
    const model = args.model;
    if (!model) fail("--model is required");
    const runs = numberArg(args, "runs", 1);
    const inputTokens = args.input != null ? numberArg(args, "input") : estimateTokens(args.text || "");
    const outputTokens = numberArg(args, "output");
    const one = costOf({ inputTokens, outputTokens, model, table });
    const total = one.totalCost * runs;
    if (json) return console.log(JSON.stringify({ ...one, runs, totalCost: total }, null, 2));
    console.log(`${runs} runs  x  ${formatUsd(one.totalCost)}/run  =  ${formatUsd(total)}`);
    return;
  }

  if (cmd === "budget") {
    const model = args.model;
    if (!model) fail("--model is required");
    const budgetUsd = numberArg(args, "usd");
    if (!budgetUsd) fail("--usd is required");
    const inputTokens = args.input != null ? numberArg(args, "input") : estimateTokens(args.text || "");
    const outputTokens = numberArg(args, "output");
    const r = runsForBudget({ budgetUsd, inputTokens, outputTokens, model, table });
    if (json) return console.log(JSON.stringify(r, null, 2));
    console.log(`budget      ${formatUsd(r.budgetUsd)}`);
    console.log(`cost/run    ${formatUsd((r.spentUsd || 0) / (r.runs || 1))}`);
    console.log(`runs        ${r.runs === Infinity ? "∞ (free)" : r.runs}`);
    console.log(`spent       ${formatUsd(r.spentUsd)}   remaining ${formatUsd(r.remainingUsd)}`);
    return;
  }

  if (cmd === "compare") {
    const models = String(args.models || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!models.length) fail("--models a,b,c is required");
    const inputTokens = args.input != null ? numberArg(args, "input") : estimateTokens(args.text || "");
    const outputTokens = numberArg(args, "output");
    const rows = compare({ inputTokens, outputTokens, models, table });
    if (json) return console.log(JSON.stringify(rows, null, 2));
    console.log(`input ${inputTokens} tok, output ${outputTokens} tok\n`);
    for (const r of rows) {
      if (r.error) console.log(`  ${r.model.padEnd(24)} ${r.error}`);
      else console.log(`  ${r.model.padEnd(24)} ${formatUsd(r.totalCost)}`);
    }
    return;
  }

  fail(`unknown command: ${cmd}. Run "tokencost --help".`);
}
main().catch((err) => fail(err.message));
