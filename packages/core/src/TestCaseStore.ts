import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { TestCase } from './types.js';

export class TestCaseStore {
  constructor(private readonly dataDir: string) {}

  getTestCaseDir(id: string): string {
    return join(this.dataDir, 'test-cases', id);
  }

  getBaselineDir(id: string): string {
    return join(this.getTestCaseDir(id), 'baseline');
  }

  async save(testCase: TestCase): Promise<void> {
    const dir = this.getTestCaseDir(testCase.id);
    await mkdir(join(dir, 'baseline'), { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(testCase, null, 2), 'utf-8');
  }

  async load(id: string): Promise<TestCase | null> {
    try {
      const raw = await readFile(join(this.getTestCaseDir(id), 'manifest.json'), 'utf-8');
      return JSON.parse(raw) as TestCase;
    } catch {
      return null;
    }
  }

  async list(): Promise<TestCase[]> {
    const baseDir = join(this.dataDir, 'test-cases');
    let entries: string[];
    try {
      entries = await readdir(baseDir);
    } catch {
      return [];
    }

    const results: TestCase[] = [];
    for (const entry of entries) {
      const tc = await this.load(entry);
      if (tc) results.push(tc);
    }
    return results;
  }
}
