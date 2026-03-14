import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { RunResult } from './types.js';

export class RunStore {
  constructor(private readonly dataDir: string) {}

  getRunDir(runId: string): string {
    return join(this.dataDir, 'runs', runId);
  }

  async save(run: RunResult): Promise<void> {
    const dir = this.getRunDir(run.runId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'result.json'), JSON.stringify(run, null, 2), 'utf-8');
  }

  async load(runId: string): Promise<RunResult | null> {
    try {
      const raw = await readFile(join(this.getRunDir(runId), 'result.json'), 'utf-8');
      return JSON.parse(raw) as RunResult;
    } catch {
      return null;
    }
  }

  async listForTestCase(testCaseId: string): Promise<RunResult[]> {
    const runsDir = join(this.dataDir, 'runs');
    let entries: string[];
    try {
      entries = await readdir(runsDir);
    } catch {
      return [];
    }

    const results: RunResult[] = [];
    for (const entry of entries) {
      const run = await this.load(entry);
      if (run && run.testCaseId === testCaseId) {
        results.push(run);
      }
    }
    return results;
  }

  async listAll(): Promise<RunResult[]> {
    const runsDir = join(this.dataDir, 'runs');
    let entries: string[];
    try {
      entries = await readdir(runsDir);
    } catch {
      return [];
    }

    const results: RunResult[] = [];
    for (const entry of entries) {
      const run = await this.load(entry);
      if (run) results.push(run);
    }
    return results;
  }
}
