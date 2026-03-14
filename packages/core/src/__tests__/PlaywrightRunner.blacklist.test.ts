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
  '/': `<!DOCTYPE html><html><body><h1>Home</h1></body></html>`,
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

  it('skips a click step whose selector is blacklisted for the current URL', async () => {
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
}, 30_000);
