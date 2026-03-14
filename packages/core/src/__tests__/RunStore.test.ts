import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { RunStore } from '../RunStore.js';
import type { RunResult } from '../types.js';

describe('RunStore', () => {
  let tmpDir: string;
  let store: RunStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-run-'));
    store = new RunStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('saves a run result and retrieves it by runId', async () => {
    const run: RunResult = {
      runId: 'run-001',
      testCaseId: 'tc-abc',
      startedAt: '2024-01-01T00:00:00.000Z',
      finishedAt: '2024-01-01T00:00:01.000Z',
      passed: true,
      steps: [
        {
          stepIndex: 0,
          screenshotPath: 'step-000.png',
          diffImagePath: 'step-000-diff.png',
          diffPercentage: 0,
          passed: true,
        },
      ],
    };

    await store.save(run);
    const loaded = await store.load('run-001');

    expect(loaded).toEqual(run);
  });

  it('lists all runs for a given test case', async () => {
    const run1: RunResult = {
      runId: 'run-001',
      testCaseId: 'tc-abc',
      startedAt: '2024-01-01T00:00:00.000Z',
      finishedAt: '2024-01-01T00:00:01.000Z',
      passed: true,
      steps: [],
    };
    const run2: RunResult = {
      runId: 'run-002',
      testCaseId: 'tc-abc',
      startedAt: '2024-01-02T00:00:00.000Z',
      finishedAt: '2024-01-02T00:00:01.000Z',
      passed: false,
      steps: [],
    };

    await store.save(run1);
    await store.save(run2);

    const runs = await store.listForTestCase('tc-abc');
    expect(runs).toHaveLength(2);
    const ids = runs.map((r) => r.runId).sort();
    expect(ids).toEqual(['run-001', 'run-002']);
  });

  it('returns null when loading a non-existent run', async () => {
    const result = await store.load('does-not-exist');
    expect(result).toBeNull();
  });

  it('returns empty array when no runs exist for a test case', async () => {
    const runs = await store.listForTestCase('no-test-case');
    expect(runs).toEqual([]);
  });

  it('getRunDir returns the run directory path', () => {
    const dir = store.getRunDir('run-xyz');
    expect(dir).toContain('run-xyz');
  });
});
