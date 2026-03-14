import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import { SpiderAgent } from '../SpiderAgent.js';
import { TestCaseStore } from '../TestCaseStore.js';
import { BlacklistManager } from '../BlacklistManager.js';

// Fixture app: home page links to /about and /admin page
const PAGES: Record<string, string> = {
  '/': `<!DOCTYPE html><html><body>
    <h1>Home</h1>
    <a href="/about">About</a>
    <a href="/admin/users">Admin</a>
  </body></html>`,
  '/about': `<!DOCTYPE html><html><body>
    <h1>About</h1>
    <a href="/">Home</a>
  </body></html>`,
  '/admin/users': `<!DOCTYPE html><html><body>
    <h1>Admin Users</h1>
    <button id="delete-btn">Delete All</button>
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

describe('SpiderAgent blacklist integration', () => {
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
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-bl-spider-'));
    store = new TestCaseStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('skips URLs matching a blacklisted URL pattern', async () => {
    await writeFile(
      join(tmpDir, 'blacklist.json'),
      JSON.stringify({ urlPatterns: ['/admin/*'], perPageRules: [] }),
    );
    const blacklist = new BlacklistManager(tmpDir);
    const spider = new SpiderAgent(store, undefined, blacklist);
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    const urls = testCases.map((tc) => tc.url);
    expect(urls.some((u) => u.includes('/admin'))).toBe(false);
    expect(urls.some((u) => u.endsWith('/about'))).toBe(true);
  });

  it('crawls all pages when no blacklist rules are set', async () => {
    await writeFile(
      join(tmpDir, 'blacklist.json'),
      JSON.stringify({ urlPatterns: [], perPageRules: [] }),
    );
    const blacklist = new BlacklistManager(tmpDir);
    const spider = new SpiderAgent(store, undefined, blacklist);
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    const urls = testCases.map((tc) => tc.url);
    expect(urls.some((u) => u.includes('/admin'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/about'))).toBe(true);
  });
}, 30_000);
