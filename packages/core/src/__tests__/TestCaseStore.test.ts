import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TestCaseStore } from '../TestCaseStore.js';
import type { TestCase } from '../types.js';

describe('TestCaseStore', () => {
  let tmpDir: string;
  let store: TestCaseStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-test-'));
    store = new TestCaseStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('saves a test case and retrieves it by id', async () => {
    const tc: TestCase = {
      id: 'test-001',
      url: 'http://localhost:3000',
      createdAt: '2024-01-01T00:00:00.000Z',
      steps: [{ type: 'navigate', url: 'http://localhost:3000' }],
    };

    await store.save(tc);
    const loaded = await store.load('test-001');

    expect(loaded).toEqual(tc);
  });

  it('lists all saved test cases', async () => {
    const tc1: TestCase = {
      id: 'tc-a',
      url: 'http://localhost:3000',
      createdAt: '2024-01-01T00:00:00.000Z',
      steps: [],
    };
    const tc2: TestCase = {
      id: 'tc-b',
      url: 'http://localhost:3000/about',
      createdAt: '2024-01-01T00:00:00.000Z',
      steps: [],
    };

    await store.save(tc1);
    await store.save(tc2);

    const list = await store.list();
    expect(list).toHaveLength(2);
    const ids = list.map((tc) => tc.id).sort();
    expect(ids).toEqual(['tc-a', 'tc-b']);
  });

  it('returns empty array when no test cases exist', async () => {
    const list = await store.list();
    expect(list).toEqual([]);
  });

  it('saves manifest.json with steps inside the test case directory', async () => {
    const tc: TestCase = {
      id: 'tc-steps',
      url: 'http://localhost:3000',
      createdAt: '2024-01-01T00:00:00.000Z',
      steps: [
        { type: 'navigate', url: 'http://localhost:3000' },
        { type: 'click', selector: '#btn' },
        { type: 'fill', selector: '#input', value: 'hello' },
      ],
    };

    await store.save(tc);
    const loaded = await store.load('tc-steps');

    expect(loaded?.steps).toHaveLength(3);
    expect(loaded?.steps[0]).toEqual({ type: 'navigate', url: 'http://localhost:3000' });
    expect(loaded?.steps[1]).toEqual({ type: 'click', selector: '#btn' });
    expect(loaded?.steps[2]).toEqual({ type: 'fill', selector: '#input', value: 'hello' });
  });

  it('returns null when loading a non-existent test case', async () => {
    const result = await store.load('does-not-exist');
    expect(result).toBeNull();
  });
});
