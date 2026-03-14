import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { mkdtemp, rm, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import { PlaywrightRunner } from '../PlaywrightRunner.js';
import { TestCaseStore } from '../TestCaseStore.js';
import { RunStore } from '../RunStore.js';
import type { TestCase } from '../types.js';

const PAGES: Record<string, string> = {
  '/': `<!DOCTYPE html><html><body><h1>Home</h1><a href="/about">About</a></body></html>`,
  '/about': `<!DOCTYPE html><html><body><h1>About</h1><a href="/">Home</a></body></html>`,
};

function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url ?? '/';
      const body = PAGES[path] ?? '<html><body>Not Found</body></html>';
      const status = PAGES[path] ? 200 : 404;
      res.writeHead(status, { 'Content-Type': 'text/html' });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe('PlaywrightRunner integration', () => {
  let server: Server;
  let baseUrl: string;
  let tmpDir: string;
  let testCaseStore: TestCaseStore;
  let runStore: RunStore;

  beforeAll(async () => {
    ({ server, baseUrl } = await startFixtureServer());
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-runner-'));
    testCaseStore = new TestCaseStore(tmpDir);
    runStore = new RunStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupTestCase(id: string, url: string): Promise<TestCase> {
    const tc: TestCase = {
      id,
      url,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'navigate', url }],
    };
    await testCaseStore.save(tc);
    // Place a baseline screenshot
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url);
    const baseline = await page.screenshot();
    await browser.close();
    const { writeFile } = await import('fs/promises');
    await writeFile(join(testCaseStore.getBaselineDir(id), 'step-000.png'), baseline);
    return tc;
  }

  it('runs a Format A test case and produces a RunResult', async () => {
    const tc = await setupTestCase('tc-run-1', `${baseUrl}/`);
    const runner = new PlaywrightRunner(testCaseStore, runStore);
    const result = await runner.run(tc.id);

    expect(result).toBeDefined();
    expect(result.testCaseId).toBe(tc.id);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.runnerType).toBe('playwright');
  });

  it('saves the run result to disk', async () => {
    const tc = await setupTestCase('tc-run-2', `${baseUrl}/`);
    const runner = new PlaywrightRunner(testCaseStore, runStore);
    const result = await runner.run(tc.id);

    const loaded = await runStore.load(result.runId);
    expect(loaded).toBeDefined();
    expect(loaded?.runId).toBe(result.runId);
  });

  it('captures screenshots and saves them in the run directory', async () => {
    const tc = await setupTestCase('tc-run-3', `${baseUrl}/`);
    const runner = new PlaywrightRunner(testCaseStore, runStore);
    const result = await runner.run(tc.id);

    const runDir = runStore.getRunDir(result.runId);
    const files = await readdir(runDir);
    const screenshots = files.filter((f) => f.endsWith('.png') && !f.includes('diff'));
    expect(screenshots.length).toBeGreaterThan(0);
  });

  it('returns 0% diff when re-running the same test against identical baseline', async () => {
    const tc = await setupTestCase('tc-run-4', `${baseUrl}/`);
    const runner = new PlaywrightRunner(testCaseStore, runStore);
    const result = await runner.run(tc.id);

    expect(result.steps[0].diffPercentage).toBe(0);
    expect(result.passed).toBe(true);
  });

  it('marks run as failed when diff exceeds threshold', async () => {
    const tc: TestCase = {
      id: 'tc-run-5',
      url: `${baseUrl}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'navigate', url: `${baseUrl}/` }],
    };
    await testCaseStore.save(tc);

    // Write a completely different baseline (solid red 10x10)
    const { PNG } = await import('pngjs');
    const png = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < 10 * 10; i++) {
      png.data[i * 4 + 0] = 255;
      png.data[i * 4 + 1] = 0;
      png.data[i * 4 + 2] = 0;
      png.data[i * 4 + 3] = 255;
    }
    const { writeFile } = await import('fs/promises');
    await writeFile(join(testCaseStore.getBaselineDir('tc-run-5'), 'step-000.png'), PNG.sync.write(png));

    const runner = new PlaywrightRunner(testCaseStore, runStore, { diffThreshold: 0 });
    const result = await runner.run(tc.id);

    expect(result.passed).toBe(false);
    expect(result.steps[0].passed).toBe(false);
  });
}, 60_000);
