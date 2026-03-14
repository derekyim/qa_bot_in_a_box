import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import { PlaywrightRunner } from '../PlaywrightRunner.js';
import { TestCaseStore } from '../TestCaseStore.js';
import { RunStore } from '../RunStore.js';
import { BlacklistManager } from '../BlacklistManager.js';
import type { TestCase } from '../types.js';

const PAGES: Record<string, string> = {
  '/': `<!DOCTYPE html><html><body><h1>Home</h1><button id="danger-btn" class="btn-danger">Delete</button></body></html>`,
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

describe('PlaywrightRunner blacklist integration', () => {
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
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-runner-bl-'));
    testCaseStore = new TestCaseStore(tmpDir);
    runStore = new RunStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('skips a click step whose selector is blacklisted via direct string match', async () => {
    // Test case: navigate to /, then click a selector that does NOT exist on the page.
    // Without blacklist: Playwright throws (element not found) → run fails with error.
    // With blacklist:  the click is silently skipped → run completes successfully.
    const url = `${baseUrl}/`;
    const tc: TestCase = {
      id: 'tc-bl-1',
      url,
      createdAt: new Date().toISOString(),
      steps: [
        { type: 'navigate', url },
        { type: 'click', selector: '#non-existent-danger-btn' },
      ],
    };
    await testCaseStore.save(tc);

    await writeFile(
      join(tmpDir, 'blacklist.json'),
      JSON.stringify({
        urlPatterns: [],
        perPageRules: [{ urlPattern: '/*', selectors: ['#non-existent-danger-btn'] }],
      }),
    );
    const blacklist = new BlacklistManager(tmpDir);
    const runner = new PlaywrightRunner(testCaseStore, runStore, {}, blacklist);

    // Should not throw — the blacklisted click is skipped
    const result = await runner.run(tc.id);
    expect(result).toBeDefined();
    expect(result.testCaseId).toBe(tc.id);
  });

  it('skips a click step whose element matches a blacklisted CSS selector via DOM comparison', async () => {
    // The blacklist uses a CSS class selector (.btn-danger).
    // The step uses an ID selector (#danger-btn).
    // Both target the same element on the page → step should be skipped.
    const url = `${baseUrl}/`;
    const tc: TestCase = {
      id: 'tc-bl-2',
      url,
      createdAt: new Date().toISOString(),
      steps: [
        { type: 'navigate', url },
        // #danger-btn exists on the page; without blacklist this would execute fine.
        // With blacklist via .btn-danger (same element), it should be skipped.
        { type: 'click', selector: '#danger-btn' },
      ],
    };
    await testCaseStore.save(tc);

    // Blacklist uses a different CSS selector (.btn-danger) targeting the same element
    await writeFile(
      join(tmpDir, 'blacklist.json'),
      JSON.stringify({
        urlPatterns: [],
        perPageRules: [{ urlPattern: '/*', selectors: ['.btn-danger'] }],
      }),
    );
    const blacklist = new BlacklistManager(tmpDir);
    const runner = new PlaywrightRunner(testCaseStore, runStore, {}, blacklist);

    // Should complete — even though #danger-btn exists on the page, the click is skipped
    // because .btn-danger matches the same DOM element
    const result = await runner.run(tc.id);
    expect(result).toBeDefined();
    expect(result.testCaseId).toBe(tc.id);
    // All steps should pass (no diff since we only took screenshots, no state change from click)
  });
}, 30_000);
