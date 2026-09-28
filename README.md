# tokencost

**Offline cost estimator for LLM / AI inference.** Zero dependencies.

Know what a prompt — or a batch of a million calls — will cost *before* you hit the API.

Most teams discover their LLM bill after the invoice lands. `tokencost` lets you price
a call, a batch, or a whole agent loop up front, and pick the cheapest model that still
does the job.

```console
$ tokencost cost --model gpt-4o-mini --text "Summarize this customer email..."
model       gpt-4o-mini
input       12 tok  @ $0.1500/M  = $0.0000018
output      0 tok  @ $0.6000/M  = $0.00
TOTAL       $0.000002
```

## Why

- **No API key, no network, no account.** Pure local math. Safe to run in CI and air-gapped.
- **No dependencies.** One `bin` + two small modules. Nothing to audit, nothing to break.
- **Budget the whole job.** `budget` tells you how many runs fit in a dollar amount; `batch`
  prices N runs; `compare` ranks models by cost for the same call.
- **Honest about uncertainty.** Token counts are an explicit, calibrated *estimate* (it leans
  high, never low). For exact numbers, tokenize with your provider's library and pass the
  real counts to `--input` / `--output`.

## Install

Requires Node.js >= 18. No `npm install` needed — there are zero dependencies.

```bash
git clone https://github.com/zpt-master/tokencost.git
cd tokencost
node bin/tokencost.js --help

# optional: make it a global command
npm link          # then just: tokencost --help
```

## Usage

### Estimate tokens in a string

```bash
tokencost tokens "the quick brown fox jumps over the lazy dog"
echo "piped text works too" | tokencost tokens -
```

### Price a single call

```bash
tokencost cost --model gpt-4o --input 1500 --output 500
tokencost cost --model claude-sonnet-4 --text "Write a haiku about tokens"
```

### Price a batch (e.g. 10k documents)

```bash
tokencost batch --model gpt-4o-mini --input 2000 --output 200 --runs 10000
```

### Find how many runs fit your budget

```bash
tokencost budget --model gpt-4o-mini --input 1000 --output 200 --usd 20
```

### Compare models for the same call

```bash
tokencost compare --models gpt-4o,gpt-4o-mini,claude-3-5-haiku,gemini-2.0-flash \
  --input 1000 --output 300
```

### List known models

```bash
tokencost models
```

### Machine-readable output

Every command accepts `--json`:

```bash
tokencost cost --model gpt-4o-mini --input 1000 --output 300 --json
```

## Use it as a library

```js
import { estimateTokens, costOf, runsForBudget, compare } from "tokencost";

const inputTokens = estimateTokens(prompt);
const price = costOf({ inputTokens, outputTokens: 256, model: "gpt-4o-mini" });
console.log(price.totalCost); // e.g. 0.00033

// cap an agent loop by budget
const { runs } = runsForBudget({ budgetUsd: 5, inputTokens, outputTokens: 256, model: "gpt-4o-mini" });
console.log(`at most ${runs} calls for $5`);
```

## Custom / updated prices

Providers change prices constantly. Options, in order of preference:

1. **Override the table at runtime** with a JSON file that mirrors the built-in one:

   ```json
   {
     "gpt-4o-mini": { "input": 0.15, "output": 0.6 },
     "my-self-hosted-model": { "input": 0, "output": 0 }
   }
   ```

   ```bash
   tokencost cost --model my-self-hosted-model --input 5000 --table my-prices.json
   ```

2. **Edit `src/pricing.js`** — it is a single, plainly commented object.

> The built-in table is a convenience snapshot, not financial advice. Always confirm rates
> on your provider's pricing page. Units are **USD per 1,000,000 tokens**.

## How token estimation works

`estimateTokens()` is a heuristic, not a tokenizer: roughly 4 characters per token for
prose, more for long identifiers, hashes, URLs and punctuation runs. It deliberately rounds
up. Expect it to be within ~10–20% for typical English, and *conservative* (slightly high)
in almost all cases. If you need exactness, use your provider's tokenizer and pass counts
directly.

## Development

```bash
npm test      # 17 unit tests, node:test, no dependencies
```

## License

MIT — see [LICENSE](./LICENSE).

## Support this project

If `tokencost` saved you from a surprise bill, you can support its development:

- GitHub Sponsors: <https://github.com/sponsors/zpt-master>
- Star the repo and open an issue with your use case — that genuinely helps.

## Author

Built and maintained by [zpt-master](https://github.com/zpt-master).
