/**
 * Integration test: SpiderAgent Format B recording using Stagehand observe().
 * Stagehand is mocked to avoid real LLM calls.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import { TestCaseStore } from '../TestCaseStore.js';

// Mock Stagehand before importing SpiderAgent
const mockObserve = vi.fn().mockResolvedValue([
  { selector: 'a[href="/about"]', description: 'click About link' },
  { selector: 'button#submit', description: 'click submit button' },
]);
const mockGoto = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockActivePage = vi.fn().mockReturnValue({ goto: mockGoto });

vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: vi.fn().mockImplementation(() => ({
    init: mockInit,
    observe: mockObserve,
    close: mockClose,
    context: { activePage: mockActivePage },
  })),
}));

import { SpiderAgent } from '../SpiderAgent.js';

const PAGES: Record<string, string> = {
  '/': `<!DOCTYPE html><html><body>
    <h1>Home</h1>
    <a href="/about">About</a>
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

describe('SpiderAgent Format B recording', () => {
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
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-formatb-'));
    store = new TestCaseStore(tmpDir);
    vi.clearAllMocks();
    mockObserve.mockResolvedValue([
      { selector: 'a[href="/about"]', description: 'click About link' },
    ]);
    mockGoto.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('records formatBSteps on each test case when stagehand config is provided', async () => {
    const spider = new SpiderAgent(store, undefined, undefined, { apiKey: 'test-key' });
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    expect(testCases.length).toBeGreaterThanOrEqual(1);
    for (const tc of testCases) {
      expect(tc.formatBSteps).toBeDefined();
      expect(Array.isArray(tc.formatBSteps)).toBe(true);
    }
  });

  it('formatBSteps contain intent, selector, and url fields', async () => {
    const spider = new SpiderAgent(store, undefined, undefined, { apiKey: 'test-key' });
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    const stepsWithActions = testCases.flatMap((tc) => tc.formatBSteps ?? []);
    expect(stepsWithActions.length).toBeGreaterThan(0);
    for (const step of stepsWithActions) {
      expect(step).toHaveProperty('intent');
      expect(step).toHaveProperty('selector');
      expect(step).toHaveProperty('url');
      expect(typeof step.intent).toBe('string');
      expect(typeof step.selector).toBe('string');
      expect(typeof step.url).toBe('string');
    }
  });

  it('does not record formatBSteps when no stagehand config is provided', async () => {
    const spider = new SpiderAgent(store); // no stagehand config
    await spider.crawl(baseUrl);

    const testCases = await store.list();
    expect(testCases.length).toBeGreaterThanOrEqual(1);
    // formatBSteps should be absent or empty when no stagehand config
    for (const tc of testCases) {
      expect(tc.formatBSteps == null || tc.formatBSteps.length === 0).toBe(true);
    }
  });

  it('initialises and closes stagehand exactly once per crawl', async () => {
    const spider = new SpiderAgent(store, undefined, undefined, { apiKey: 'test-key' });
    await spider.crawl(baseUrl);

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
}, 30_000);
