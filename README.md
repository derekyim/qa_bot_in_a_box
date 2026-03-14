# qa_bot_in_a_box

**Issue #2 (Slice 1 — Monorepo Scaffold):** Set up the TypeScript monorepo foundation using pnpm workspaces with four packages (`core`, `cli`, `dashboard`, `openclaw-adapter`), each with a stub `index.ts`, shared TypeScript/ESLint/Prettier config, Vitest for `packages/core`, and a `.env.example` documenting all required environment variables. `pnpm build` and `pnpm test` both succeed.

**Issue #3 (Slice 2 — SpiderAgent + TestCaseStore):** Added `TestCaseStore` (file-based persistence of test cases as `manifest.json` under `./qa-data/test-cases/<id>/`) and `SpiderAgent` (Playwright-powered recursive crawler that records Format A steps and captures baseline screenshots while respecting same-origin policy). CLI commands `qa-bot crawl <url>` and `qa-bot list` are now functional, backed by 11 passing unit and integration tests.

**Issue #4 (Slice 3 — Format A Runner + Visual Diff + Dashboard API):** Added `VisualDiffEngine` (pixelmatch-based pixel-level screenshot comparison), `RunStore` (persists run results as JSON under `./qa-data/runs/<runId>/`), and `PlaywrightRunner` (replays Format A test cases, captures per-step screenshots, computes diffs against baselines, and marks steps pass/fail). CLI gained `qa-bot run [--test <id>] --runner a` (exits code 1 on any failure) and `qa-bot serve` (Express dashboard on port 3010 with `/api/test-cases` and `/api/runs` REST endpoints). 25 tests passing.

**Issue #5 (Slice 4 — LLM Judge + Configurable Model):** Added `LLMJudge` to `@qa-bot/core` that sends baseline/current screenshots and diff data to the Anthropic API and returns `{ verdict: 'pass'|'fail', confidence: number, reasoning: string }`. The `LLMVerdict` type is now optional on `RunStep`, persisted alongside diff data. Default model is `claude-haiku-4-5-20251001`, overridable via `LLM_MODEL` in `.env`; API key read from `ANTHROPIC_API_KEY`. Includes 3 unit tests (mocked SDK) and a slow integration test that skips automatically when `ANTHROPIC_API_KEY` is absent.

**Issue #6 (Slice 5 — Authenticated Crawl + CredentialManager):** Added `CredentialManager` that reads `LOGIN_URL`, `LOGIN_USERNAME`, `LOGIN_PASSWORD`, `LOGIN_USERNAME_SELECTOR`, `LOGIN_PASSWORD_SELECTOR`, and `LOGIN_SUBMIT_SELECTOR` from `process.env` and returns a typed credentials object (or `null` when unconfigured). Extended `SpiderAgent` to accept an optional `CredentialManager`; when credentials are present the agent performs a Playwright login flow (navigate → fill username/password → click submit) in the shared browser context before spidering, so authenticated pages behind a login wall are discovered and recorded as test cases. Crawl proceeds unauthenticated when no credentials are configured, preserving backward compatibility. Covered by 5 new tests (unit + integration with a local login-wall fixture server), bringing the total to 33 passing tests.

**Issue #7 (Slice 6 — Blacklist Manager):** Added `BlacklistManager` that reads `./qa-data/blacklist.json` (`{ urlPatterns, perPageRules }`) and supports both glob (e.g. `/admin/*`) and regex (e.g. `/\/admin\/.*/`) URL patterns. `SpiderAgent` now skips URLs matching any blacklisted pattern; `PlaywrightRunner` skips `click`/`fill` steps whose selector appears in a matching per-page rule for the current URL. Both `qa-bot crawl` and `qa-bot run` enforce the blacklist automatically. Covered by 12 new tests (9 unit tests for pattern matching + 3 integration tests), bringing the total to 45 passing tests.

**Issue #8 (Slice 7 — Format B Recording + SemanticRunner):** Added `FormatBStep` type (`{ intent, selector, url }`) and optional `formatBSteps` field to `TestCase`. `SpiderAgent` now accepts an optional `StagehandModelConfig`; when provided, it creates a single Stagehand (`env: LOCAL`) instance per crawl and calls `observe()` on each visited page to discover interactable elements, storing them as Format B steps alongside Format A steps. `SemanticRunner` replays Format B test cases using `stagehand.act({ description: intent, selector })` — Stagehand tries the stored CSS selector first and automatically uses LLM-assisted element location when the selector no longer matches, making tests resilient to minor UI restructuring. `qa-bot run --runner b` now invokes the SemanticRunner (requires `ANTHROPIC_API_KEY`). Covered by 12 new tests (Stagehand mocked to avoid live LLM calls), bringing the total to 57 passing tests.

**Issue #9 (Slice 8 — Run History + Dashboard History View):** Added `runnerType: 'playwright' | 'semantic'` field to `RunResult` so every stored run records which runner produced it. Both `PlaywrightRunner` and `SemanticRunner` now set this field. Fixed the dashboard `GET /api/runs` endpoint to filter by `testId` query parameter (per acceptance criteria) and return results in reverse chronological order (`startedAt` descending). Added Vitest + supertest tests for the dashboard API, bringing the total to 60 passing tests.

**Issue #10 (Slice 9 — OpenClaw Adapter + Comprehensive README):** Added `QaBotCoreAdapter` class to `@qa-bot/core` that implements the `QaBotAdapter` interface (crawl, run, listTestCases, getRunHistory), providing a clean extension point for future OpenClaw plugin integration with zero OpenClaw runtime dependency. Also published the `QaBotAdapter` interface type from `@qa-bot/core` for downstream consumers. Covered by 3 new tests (adapter shape + file-based list/history), bringing the total to 63 passing tests. Full usage guide added below.

---

## Usage Guide

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 8 (`npm install -g pnpm`)
- **Playwright browsers** (installed automatically on first run, or via `npx playwright install`)

### Installation

```bash
git clone https://github.com/derekyim/qa_bot_in_a_box.git
cd qa_bot_in_a_box
pnpm install
pnpm build
```

### Quick Start

```bash
# 1. Copy and fill in the environment file
cp .env.example .env
# At minimum set ANTHROPIC_API_KEY for LLM judge and Format B runner

# 2. Crawl a site and record test cases
pnpm qa-bot crawl https://example.com

# 3. List recorded test cases
pnpm qa-bot list

# 4. Run tests (Format A — deterministic visual diff)
pnpm qa-bot run

# 5. Open the dashboard
pnpm qa-bot serve
# Then visit http://localhost:3010
```

---

### Environment Variables (`.env` reference)

Copy `.env.example` to `.env` — never commit `.env` to git.

| Variable | Type | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | string | _(none)_ | Required for LLM judge and Format B (semantic) runner |
| `LLM_MODEL` | string | `claude-haiku-4-5-20251001` | Anthropic model used for LLM judge verdicts and Stagehand observations |
| `LOGIN_URL` | string | _(none)_ | Full URL of the login page (leave blank to skip auth) |
| `LOGIN_USERNAME` | string | _(none)_ | Username/email for the login form |
| `LOGIN_PASSWORD` | string | _(none)_ | Password for the login form |
| `LOGIN_USERNAME_SELECTOR` | string | `#username` | CSS selector for the username input field |
| `LOGIN_PASSWORD_SELECTOR` | string | `#password` | CSS selector for the password input field |
| `LOGIN_SUBMIT_SELECTOR` | string | `button[type="submit"]` | CSS selector for the login submit button |
| `DASHBOARD_PORT` | number | `3010` | Port for the local dashboard server |
| `QA_DATA_DIR` | string | `./qa-data` | Root directory for all persisted test data |

---

### CLI Commands

All commands are available via `pnpm qa-bot <command>` (after `pnpm build`) or `npx qa-bot <command>` if installed globally.

#### `qa-bot crawl <url>`

Launches a headless Playwright browser, recursively crawls all same-origin pages starting from `<url>`, records Format A steps (navigate / click / fill) and captures baseline screenshots. Enforces the blacklist automatically.

```bash
qa-bot crawl https://myapp.com
# Done. Recorded 12 test case(s).
```

- Exit code `0` on success.
- Creates test case directories under `$QA_DATA_DIR/test-cases/<id>/`.

#### `qa-bot list`

Lists all stored test cases with their URL, creation timestamp, and last run status.

```bash
qa-bot list
# tc-abc123  https://myapp.com/    status: pass  (created: 2025-01-01T00:00:00.000Z)
# tc-def456  https://myapp.com/about  status: fail  (created: 2025-01-01T00:00:00.000Z)
```

- Prints `No test cases found.` if none exist.

#### `qa-bot run [--test <id>] [--runner <a|b>]`

Replays test cases and reports pass/fail per step.

| Flag | Default | Description |
|---|---|---|
| `--test <id>` | _(all)_ | Run a single test case by ID |
| `--runner <a\|b>` | `a` | Runner type: `a` = Playwright visual diff, `b` = Stagehand semantic |

```bash
# Run all test cases with Format A runner
qa-bot run

# Run a single test case
qa-bot run --test tc-abc123

# Run all test cases with Format B semantic runner
qa-bot run --runner b

# Run a specific test case with Format B
qa-bot run --test tc-abc123 --runner b
```

- Prints `[PASS]` / `[FAIL]` per test case; prints failing step diffs on failure.
- **Exit code `1`** if any test case fails or errors; `0` if all pass.
- Runner `b` requires `ANTHROPIC_API_KEY`.

#### `qa-bot serve [--port <port>]`

Starts the local Express dashboard server.

```bash
qa-bot serve
# Dashboard running at http://localhost:3010

qa-bot serve --port 8080
```

---

### Dashboard Walkthrough

Navigate to `http://localhost:3010` after running `qa-bot serve`.

**Test Case List** (`GET /api/test-cases`)
- Shows all recorded test cases: ID, URL, creation date, last run timestamp, and last run status (`pass` / `fail` / `never`).

**Run History** (`GET /api/runs?testId=<id>`)
- Lists all runs for a given test case in reverse chronological order (newest first).
- Each entry includes: `runId`, `runnerType` (`playwright` | `semantic`), `startedAt`, `finishedAt`, `passed`.

**Step Drill-Down** (`GET /api/runs/:runId`)
- Returns the full `RunResult` including per-step detail: `stepIndex`, `diffPercentage`, `passed`, and optional `llmVerdict` (`{ verdict, confidence, reasoning }`).

---

### Blacklist (`blacklist.json`)

Create `$QA_DATA_DIR/blacklist.json` to skip URLs during crawl and skip selectors during test runs.

```json
{
  "urlPatterns": [
    "/admin/*",
    "/logout",
    "/\\/api\\/.*/",
    "https://external-cdn.com/*"
  ],
  "perPageRules": [
    {
      "urlPattern": "/dashboard*",
      "selectors": ["button.delete", "#dangerous-action"]
    }
  ]
}
```

- **`urlPatterns`**: glob strings (e.g. `/admin/*`) or regex strings wrapped in `/…/` (e.g. `/\/api\/.*/`). The spider skips matching URLs; the runner skips navigating to them.
- **`perPageRules`**: per-URL selector exclusions. When the current page URL matches `urlPattern`, the runner skips any `click` or `fill` step whose selector (or matching DOM element) is listed in `selectors`. Supports CSS selector string matching and DOM-based comparison via Playwright.

---

### Runner Types

**Format A — Deterministic (Playwright)**

The default runner (`--runner a`). Replays recorded steps exactly, captures a screenshot after each step, and computes a pixel-level diff against the stored baseline using [pixelmatch](https://github.com/mapbox/pixelmatch).

- Deterministic and fast — no LLM calls required (LLM judge is optional).
- Best for: stable UIs where visual regression is the primary concern.
- Diff threshold is `0%` by default (any pixel change = fail).

**Format B — Semantic (Stagehand)**

The semantic runner (`--runner b`). Replays recorded intents via [Stagehand](https://github.com/browserbase/stagehand)'s `act()` API, which uses LLM-assisted element location. If a stored CSS selector no longer matches, Stagehand finds the element by semantic intent.

- Resilient to minor UI restructuring and selector churn.
- Best for: dynamic apps where markup changes frequently.
- Requires `ANTHROPIC_API_KEY`.

---

### LLM Judge

After each Format A step, an optional LLM judge (`LLMJudge`) sends the baseline screenshot, current screenshot, and diff percentage to the Anthropic API and returns:

```json
{ "verdict": "pass", "confidence": 0.92, "reasoning": "Minor font rendering difference, not a regression." }
```

- **Default model**: `claude-haiku-4-5-20251001` (fast and low-cost).
- **Override**: set `LLM_MODEL` in `.env` (e.g. `claude-sonnet-4-6` for higher accuracy).
- **Cost**: Haiku costs ~$0.001–$0.005 per run step depending on screenshot size. Use Haiku for CI, Sonnet/Opus for final review.
- The `llmVerdict` field is stored on each `RunStep` and visible in the dashboard step drill-down.
- The judge runs automatically when `ANTHROPIC_API_KEY` is set; skipped otherwise.

---

### Authenticated Sites

To crawl and test pages behind a login wall, configure the login credentials in `.env`:

```bash
LOGIN_URL=https://myapp.com/login
LOGIN_USERNAME=testuser@example.com
LOGIN_PASSWORD=s3cr3t
LOGIN_USERNAME_SELECTOR=#email
LOGIN_PASSWORD_SELECTOR=#password
LOGIN_SUBMIT_SELECTOR=button[type="submit"]
```

When these variables are present, the spider performs a Playwright login flow (navigate → fill username → fill password → click submit) in the shared browser context before crawling. Leave `LOGIN_URL` blank to skip authentication.

---

### OpenClaw Adapter

`packages/openclaw-adapter` defines the `QaBotAdapter` interface — the extension point for future [OpenClaw](https://openclaw.dev) plugin integration. The package has **zero runtime dependency on OpenClaw**.

**Interface definition** (also re-exported from `@qa-bot/core`):

```typescript
interface QaBotAdapter {
  crawl(url: string): Promise<void>;
  run(testId?: string, runner?: 'a' | 'b'): Promise<void>;
  listTestCases(): Promise<unknown[]>;
  getRunHistory(testId?: string): Promise<unknown[]>;
}
```

`@qa-bot/core` exports `QaBotCoreAdapter`, the reference implementation:

```typescript
import { QaBotCoreAdapter } from '@qa-bot/core';

const adapter = new QaBotCoreAdapter('./qa-data');
await adapter.crawl('https://example.com');
const cases = await adapter.listTestCases();
await adapter.run(undefined, 'a');
const history = await adapter.getRunHistory();
```

To wire up a future OpenClaw plugin, implement `QaBotAdapter` from `@qa-bot/openclaw-adapter` and pass your implementation to the OpenClaw runtime — no changes to `@qa-bot/core` required.

---

### Contributing & Local Dev

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Type-check all packages
pnpm typecheck

# Lint
pnpm lint
```

**Package layout:**

| Package | Description |
|---|---|
| `packages/core` | Core logic: spider, runners, stores, LLM judge, adapter |
| `packages/cli` | Commander-based CLI (`qa-bot` binary) |
| `packages/dashboard` | Express REST API for the local dashboard |
| `packages/openclaw-adapter` | `QaBotAdapter` interface + adapter version export |

Tests live in `packages/core/src/__tests__/`. Each test file corresponds to a single module and uses Vitest. Integration tests spin up real Playwright browsers and local HTTP fixture servers — no mocking of Playwright or the filesystem.
