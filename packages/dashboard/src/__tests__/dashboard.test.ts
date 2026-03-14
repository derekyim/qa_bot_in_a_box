import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { RunStore } from '@qa-bot/core';
import { createDashboardServer } from '../index.js';
import type { RunResult } from '@qa-bot/core';

describe('Dashboard API /api/runs', () => {
  let tmpDir: string;
  let runStore: RunStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-dash-'));
    runStore = new RunStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeRun(overrides: Partial<RunResult>): RunResult {
    return {
      runId: 'run-default',
      testCaseId: 'tc-1',
      runnerType: 'playwright',
      startedAt: '2024-01-01T00:00:00.000Z',
      finishedAt: '2024-01-01T00:00:01.000Z',
      passed: true,
      steps: [],
      ...overrides,
    };
  }

  it('GET /api/runs?testId=<id> returns runs for that test case in reverse chronological order', async () => {
    await runStore.save(makeRun({ runId: 'run-old', testCaseId: 'tc-1', startedAt: '2024-01-01T00:00:00.000Z' }));
    await runStore.save(makeRun({ runId: 'run-new', testCaseId: 'tc-1', startedAt: '2024-01-03T00:00:00.000Z' }));
    await runStore.save(makeRun({ runId: 'run-mid', testCaseId: 'tc-1', startedAt: '2024-01-02T00:00:00.000Z' }));
    await runStore.save(makeRun({ runId: 'run-other', testCaseId: 'tc-2', startedAt: '2024-01-04T00:00:00.000Z' }));

    const app = createDashboardServer(tmpDir);
    const res = await request(app).get('/api/runs?testId=tc-1');

    expect(res.status).toBe(200);
    const ids = (res.body as RunResult[]).map((r) => r.runId);
    expect(ids).toEqual(['run-new', 'run-mid', 'run-old']);
  });

  it('GET /api/runs returns all runs in reverse chronological order', async () => {
    await runStore.save(makeRun({ runId: 'run-a', testCaseId: 'tc-1', startedAt: '2024-01-01T00:00:00.000Z' }));
    await runStore.save(makeRun({ runId: 'run-b', testCaseId: 'tc-2', startedAt: '2024-01-02T00:00:00.000Z' }));

    const app = createDashboardServer(tmpDir);
    const res = await request(app).get('/api/runs');

    expect(res.status).toBe(200);
    const ids = (res.body as RunResult[]).map((r) => r.runId);
    expect(ids).toEqual(['run-b', 'run-a']);
  });

  it('GET /api/runs/:id returns the run with runnerType', async () => {
    await runStore.save(makeRun({ runId: 'run-x', runnerType: 'semantic' }));

    const app = createDashboardServer(tmpDir);
    const res = await request(app).get('/api/runs/run-x');

    expect(res.status).toBe(200);
    expect((res.body as RunResult).runnerType).toBe('semantic');
  });
});
