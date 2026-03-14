import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { QaBotCoreAdapter } from '../QaBotCoreAdapter.js';
import { TestCaseStore } from '../TestCaseStore.js';
import { RunStore } from '../RunStore.js';
import type { TestCase, RunResult } from '../types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'qa-adapter-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('QaBotCoreAdapter.listTestCases()', () => {
  it('returns empty array when no test cases exist', async () => {
    const adapter = new QaBotCoreAdapter(tmpDir);
    const cases = await adapter.listTestCases();
    expect(cases).toEqual([]);
  });

  it('returns stored test cases', async () => {
    const store = new TestCaseStore(tmpDir);
    const tc: TestCase = {
      id: 'tc-1',
      url: 'https://example.com',
      createdAt: new Date().toISOString(),
      steps: [{ type: 'navigate', url: 'https://example.com' }],
    };
    await store.save(tc);

    const adapter = new QaBotCoreAdapter(tmpDir);
    const cases = await adapter.listTestCases();
    expect(cases).toHaveLength(1);
    expect((cases[0] as TestCase).id).toBe('tc-1');
  });
});

describe('QaBotCoreAdapter.getRunHistory()', () => {
  it('returns empty array when no runs exist', async () => {
    const adapter = new QaBotCoreAdapter(tmpDir);
    const history = await adapter.getRunHistory();
    expect(history).toEqual([]);
  });

  it('returns all runs when no testId filter', async () => {
    const runStore = new RunStore(tmpDir);
    const run1: RunResult = {
      runId: 'run-1',
      testCaseId: 'tc-a',
      runnerType: 'playwright',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      passed: true,
      steps: [],
    };
    const run2: RunResult = {
      runId: 'run-2',
      testCaseId: 'tc-b',
      runnerType: 'playwright',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      passed: false,
      steps: [],
    };
    await runStore.save(run1);
    await runStore.save(run2);

    const store = new TestCaseStore(tmpDir);
    const tc1: TestCase = { id: 'tc-a', url: 'https://a.com', createdAt: new Date().toISOString(), steps: [] };
    const tc2: TestCase = { id: 'tc-b', url: 'https://b.com', createdAt: new Date().toISOString(), steps: [] };
    await store.save(tc1);
    await store.save(tc2);

    const adapter = new QaBotCoreAdapter(tmpDir);
    const history = await adapter.getRunHistory();
    expect(history).toHaveLength(2);
  });

  it('filters runs by testId when provided', async () => {
    const runStore = new RunStore(tmpDir);
    const store = new TestCaseStore(tmpDir);

    const tc: TestCase = { id: 'tc-a', url: 'https://a.com', createdAt: new Date().toISOString(), steps: [] };
    await store.save(tc);

    const run1: RunResult = {
      runId: 'run-1',
      testCaseId: 'tc-a',
      runnerType: 'playwright',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      passed: true,
      steps: [],
    };
    const run2: RunResult = {
      runId: 'run-2',
      testCaseId: 'tc-b',
      runnerType: 'playwright',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      passed: false,
      steps: [],
    };
    await runStore.save(run1);
    await runStore.save(run2);

    const adapter = new QaBotCoreAdapter(tmpDir);
    const history = await adapter.getRunHistory('tc-a');
    expect(history).toHaveLength(1);
    expect((history[0] as RunResult).testCaseId).toBe('tc-a');
  });
});

describe('QaBotCoreAdapter satisfies QaBotAdapter interface', () => {
  it('exposes crawl, run, listTestCases, getRunHistory methods', () => {
    const adapter = new QaBotCoreAdapter(tmpDir);
    expect(typeof adapter.crawl).toBe('function');
    expect(typeof adapter.run).toBe('function');
    expect(typeof adapter.listTestCases).toBe('function');
    expect(typeof adapter.getRunHistory).toBe('function');
  });
});
