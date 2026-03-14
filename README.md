# qa_bot_in_a_box

**Issue #2 (Slice 1 — Monorepo Scaffold):** Set up the TypeScript monorepo foundation using pnpm workspaces with four packages (`core`, `cli`, `dashboard`, `openclaw-adapter`), each with a stub `index.ts`, shared TypeScript/ESLint/Prettier config, Vitest for `packages/core`, and a `.env.example` documenting all required environment variables. `pnpm build` and `pnpm test` both succeed.

**Issue #3 (Slice 2 — SpiderAgent + TestCaseStore):** Added `TestCaseStore` (file-based persistence of test cases as `manifest.json` under `./qa-data/test-cases/<id>/`) and `SpiderAgent` (Playwright-powered recursive crawler that records Format A steps and captures baseline screenshots while respecting same-origin policy). CLI commands `qa-bot crawl <url>` and `qa-bot list` are now functional, backed by 11 passing unit and integration tests.
