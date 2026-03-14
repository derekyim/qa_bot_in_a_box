#!/usr/bin/env node
import { program } from 'commander';
import { resolve } from 'path';
import { SpiderAgent, TestCaseStore, RunStore, PlaywrightRunner, BlacklistManager } from '@qa-bot/core';

export const CLI_VERSION = '0.1.0';

const DATA_DIR = resolve(process.env['QA_DATA_DIR'] ?? './qa-data');

program
  .name('qa-bot')
  .description('QA Bot in a Box — automated visual regression testing')
  .version(CLI_VERSION);

program
  .command('crawl <url>')
  .description('Crawl a URL and record test cases')
  .action(async (url: string) => {
    const store = new TestCaseStore(DATA_DIR);
    const blacklist = new BlacklistManager(DATA_DIR);
    const spider = new SpiderAgent(store, undefined, blacklist);
    console.log(`Crawling ${url} ...`);
    await spider.crawl(url);
    const cases = await store.list();
    console.log(`Done. Recorded ${cases.length} test case(s).`);
  });

program
  .command('list')
  .description('List all stored test cases with last run status')
  .action(async () => {
    const store = new TestCaseStore(DATA_DIR);
    const runStore = new RunStore(DATA_DIR);
    const cases = await store.list();
    if (cases.length === 0) {
      console.log('No test cases found. Run `qa-bot crawl <url>` first.');
      return;
    }
    for (const tc of cases) {
      const runs = await runStore.listForTestCase(tc.id);
      const lastRun = runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      const status = lastRun ? (lastRun.passed ? 'pass' : 'fail') : 'never run';
      console.log(`${tc.id}  ${tc.url}  status: ${status}  (created: ${tc.createdAt})`);
    }
  });

program
  .command('run')
  .description('Run Format A test cases via Playwright')
  .option('--test <id>', 'Run only the specified test case ID')
  .option('--runner <type>', 'Runner type (only "a" supported currently)', 'a')
  .action(async (opts: { test?: string; runner: string }) => {
    if (opts.runner !== 'a') {
      console.error(`Unsupported runner: ${opts.runner}. Only "a" is supported.`);
      process.exit(1);
    }

    const testCaseStore = new TestCaseStore(DATA_DIR);
    const runStore = new RunStore(DATA_DIR);
    const blacklist = new BlacklistManager(DATA_DIR);
    const nlApiKey = process.env['ANTHROPIC_API_KEY'];
    const runner = new PlaywrightRunner(testCaseStore, runStore, {}, blacklist, nlApiKey);

    let ids: string[];
    if (opts.test) {
      ids = [opts.test];
    } else {
      const cases = await testCaseStore.list();
      ids = cases.map((tc) => tc.id);
    }

    if (ids.length === 0) {
      console.log('No test cases to run. Use `qa-bot crawl <url>` first.');
      process.exit(0);
    }

    let anyFailed = false;
    for (const id of ids) {
      console.log(`Running test case: ${id}`);
      try {
        const result = await runner.run(id);
        const status = result.passed ? 'PASS' : 'FAIL';
        console.log(`  [${status}] ${id} — ${result.steps.length} step(s)`);
        if (!result.passed) {
          anyFailed = true;
          for (const step of result.steps) {
            if (!step.passed) {
              console.log(`    Step ${step.stepIndex}: diff=${step.diffPercentage.toFixed(2)}%`);
            }
          }
        }
      } catch (err) {
        console.error(`  [ERROR] ${id}: ${(err as Error).message}`);
        anyFailed = true;
      }
    }

    if (anyFailed) {
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start the dashboard server on port 3010')
  .option('--port <port>', 'Port to listen on', '3010')
  .action(async (opts: { port: string }) => {
    const { createDashboardServer } = await import('@qa-bot/dashboard');
    const port = parseInt(opts.port, 10);
    const server = createDashboardServer(DATA_DIR);
    server.listen(port, () => {
      console.log(`Dashboard running at http://localhost:${port}`);
    });
  });

program.parse();
