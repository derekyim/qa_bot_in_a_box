/**
 * Integration test: SemanticRunner replays Format B test cases using Stagehand act().
 * Stagehand is mocked to avoid real LLM calls.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import { mkdtemp, rm, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import { TestCaseStore } from '../TestCaseStore.js';
import { RunStore } from '../RunStore.js';
import type { TestCase } from '../types.js';
import { PNG } from 'pngjs';

// Produce a consistent small screenshot buffer for tests
function makeScreenshot(): Buffer {
  const png = new PNG({ width: 10, height: 10 });
  for (let i = 0; i < 10 * 10; i++) {
    png.data[i * 4 + 0] = 200;
    png.data[i * 4 + 1] = 200;
    png.data[i * 4 + 2] = 200;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

const SCREENSHOT_BUF = makeScreenshot();

// Mock Stagehand
const mockActResult = { success: true, message: 'ok', actionDescription: 'clicked', actions: [] };
const mockAct = vi.fn().mockResolvedValue(mockActResult);
const mockGoto = vi.fn().mockResolvedValue(undefined);
const mockUrl = vi.fn().mockReturnValue('http://127.0.0.1/');
const mockScreenshot = vi.fn().mockResolvedValue(SCREENSHOT_BUF);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockActivePage = vi.fn().mockReturnValue({
  goto: mockGoto,
  url: mockUrl,
  screenshot: mockScreenshot,
});

vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: vi.fn().mockImplementation(() => ({
    init: mockInit,
    act: mockAct,
    close: mockClose,
    context: { activePage: mockActivePage },
  })),
}));

import { SemanticRunner } from '../SemanticRunner.js';

const PAGES: Record<string, string> = {
  '/': `<!DOCTYPE html><html><body><h1>Home</h1><a href="/about">About</a></body></html>`,
  '/about': `<!DOCTYPE html><html><body><h1>About</h1></body></html>`,
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

describe('SemanticRunner integration', () => {
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
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-semantic-'));
    testCaseStore = new TestCaseStore(tmpDir);
    runStore = new RunStore(tmpDir);
    vi.clearAllMocks();
    mockAct.mockResolvedValue(mockActResult);
    mockGoto.mockResolvedValue(undefined);
    mockScreenshot.mockResolvedValue(SCREENSHOT_BUF);
    mockUrl.mockReturnValue(`${baseUrl}/`);
    mockActivePage.mockReturnValue({ goto: mockGoto, url: mockUrl, screenshot: mockScreenshot });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupFormatBTestCase(id: string): Promise<TestCase> {
    const tc: TestCase = {
      id,
      url: `${baseUrl}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'navigate', url: `${baseUrl}/` }],
      formatBSteps: [
        { intent: 'click the About link', selector: 'a[href="/about"]', url: `${baseUrl}/` },
      ],
    };
    await testCaseStore.save(tc);
    // Write a baseline screenshot that matches our mock
    const { writeFile } = await import('fs/promises');
    await writeFile(join(testCaseStore.getBaselineDir(id), 'step-000.png'), SCREENSHOT_BUF);
    return tc;
  }

  it('runs a Format B test case and produces a RunResult', async () => {
    const tc = await setupFormatBTestCase('tc-sem-1');
    const runner = new SemanticRunner(testCaseStore, runStore, {}, { apiKey: 'test-key' });
    const result = await runner.run(tc.id);

    expect(result).toBeDefined();
    expect(result.testCaseId).toBe(tc.id);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('saves the run result to disk', async () => {
    const tc = await setupFormatBTestCase('tc-sem-2');
    const runner = new SemanticRunner(testCaseStore, runStore, {}, { apiKey: 'test-key' });
    const result = await runner.run(tc.id);

    const loaded = await runStore.load(result.runId);
    expect(loaded).toBeDefined();
    expect(loaded?.runId).toBe(result.runId);
  });

  it('captures screenshots and saves them in the run directory', async () => {
    const tc = await setupFormatBTestCase('tc-sem-3');
    const runner = new SemanticRunner(testCaseStore, runStore, {}, { apiKey: 'test-key' });
    const result = await runner.run(tc.id);

    const runDir = runStore.getRunDir(result.runId);
    const files = await readdir(runDir);
    const screenshots = files.filter((f) => f.endsWith('.png') && !f.includes('diff'));
    expect(screenshots.length).toBeGreaterThan(0);
  });

  it('calls stagehand.act() for each Format B step with intent and selector', async () => {
    const tc = await setupFormatBTestCase('tc-sem-4');
    const runner = new SemanticRunner(testCaseStore, runStore, {}, { apiKey: 'test-key' });
    await runner.run(tc.id);

    expect(mockAct).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'click the About link',
        selector: 'a[href="/about"]',
      }),
    );
  });

  it('initialises and closes stagehand once per run', async () => {
    const tc = await setupFormatBTestCase('tc-sem-5');
    const runner = new SemanticRunner(testCaseStore, runStore, {}, { apiKey: 'test-key' });
    await runner.run(tc.id);

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('throws if test case has no formatBSteps', async () => {
    const tc: TestCase = {
      id: 'tc-sem-6',
      url: `${baseUrl}/`,
      createdAt: new Date().toISOString(),
      steps: [{ type: 'navigate', url: `${baseUrl}/` }],
      // no formatBSteps
    };
    await testCaseStore.save(tc);
    const runner = new SemanticRunner(testCaseStore, runStore, {}, { apiKey: 'test-key' });
    await expect(runner.run(tc.id)).rejects.toThrow();
  });

  it('returns 0% diff when screenshot matches baseline', async () => {
    const tc = await setupFormatBTestCase('tc-sem-7');
    const runner = new SemanticRunner(testCaseStore, runStore, {}, { apiKey: 'test-key' });
    const result = await runner.run(tc.id);

    expect(result.steps[0].diffPercentage).toBe(0);
    expect(result.passed).toBe(true);
  });
}, 30_000);
