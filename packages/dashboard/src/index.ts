import express from 'express';
import { TestCaseStore, RunStore } from '@qa-bot/core';

export const DASHBOARD_VERSION = '0.1.0';
export const DASHBOARD_PORT = 3010;

export function createDashboardServer(dataDir: string): ReturnType<typeof express> {
  const app = express();
  const testCaseStore = new TestCaseStore(dataDir);
  const runStore = new RunStore(dataDir);

  app.use(express.json());

  // GET /api/test-cases — list all test cases with last run status
  app.get('/api/test-cases', async (_req, res) => {
    try {
      const cases = await testCaseStore.list();
      const result = await Promise.all(
        cases.map(async (tc) => {
          const runs = await runStore.listForTestCase(tc.id);
          const lastRun = runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
          return {
            id: tc.id,
            url: tc.url,
            createdAt: tc.createdAt,
            lastRunAt: lastRun?.startedAt ?? null,
            lastRunStatus: lastRun ? (lastRun.passed ? 'pass' : 'fail') : 'never',
          };
        }),
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/runs — list all runs (optionally filtered by testCaseId query param)
  app.get('/api/runs', async (req, res) => {
    try {
      const { testCaseId } = req.query;
      const runs = testCaseId
        ? await runStore.listForTestCase(String(testCaseId))
        : await runStore.listAll();
      res.json(runs);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/runs/:id — get a specific run
  app.get('/api/runs/:id', async (req, res) => {
    try {
      const run = await runStore.load(req.params['id']!);
      if (!run) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      res.json(run);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}
