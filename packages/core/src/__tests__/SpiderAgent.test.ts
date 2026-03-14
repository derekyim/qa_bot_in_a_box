import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import { SpiderAgent } from '../SpiderAgent.js';
import { TestCaseStore } from '../TestCaseStore.js';

// Static HTML fixture app with two pages linked together
const PAGES: Record<string, string> = {
  '/': `<!DOCTYPE html><html><body>
    <h1>Home</h1>
    <a href="/about">About</a>
    <a href="https://external.example.com">External</a>
  </body></html>`,
  '/about': `<!DOCTYPE html><html><body>
    <h1>About</h1>
    <a href="/">Home</a>
  </body></html>`,
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

describe('SpiderAgent integration', () => {
  let server: Server;
  let baseUrl: string;
  let tmpDir: string;
  let store: TestCaseStore;

  beforeAll(async () => {
    ({ server, baseUrl } = await startFixtureServer());
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-spider-'));
    store = new TestCaseStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('crawls the fixture app and produces at least one test case on disk', async () => {
    const spider = new SpiderAgent(store);
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    expect(testCases.length).toBeGreaterThanOrEqual(1);
  });

  it('each test case has a navigate step for its URL', async () => {
    const spider = new SpiderAgent(store);
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    for (const tc of testCases) {
      const navigateStep = tc.steps.find((s) => s.type === 'navigate');
      expect(navigateStep).toBeDefined();
    }
  });

  it('does not follow external links (same-origin only)', async () => {
    const spider = new SpiderAgent(store);
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    for (const tc of testCases) {
      expect(tc.url).toMatch(new RegExp(`^${baseUrl}`));
    }
  });

  it('discovers internal pages (home and about)', async () => {
    const spider = new SpiderAgent(store);
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    const urls = testCases.map((tc) => tc.url);
    expect(urls).toContain(baseUrl + '/');
    expect(urls.some((u) => u.endsWith('/about'))).toBe(true);
  });
}, 30_000);
