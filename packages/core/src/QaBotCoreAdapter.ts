import { TestCaseStore } from './TestCaseStore.js';
import { RunStore } from './RunStore.js';
import { SpiderAgent } from './SpiderAgent.js';
import { PlaywrightRunner } from './PlaywrightRunner.js';
import { SemanticRunner } from './SemanticRunner.js';
import { BlacklistManager } from './BlacklistManager.js';

/**
 * QaBotAdapter interface — the extension point for future OpenClaw plugin integration.
 * Defined here so packages/core satisfies the contract published in packages/openclaw-adapter.
 */
export interface QaBotAdapter {
  crawl(url: string): Promise<void>;
  run(testId?: string, runner?: 'a' | 'b'): Promise<void>;
  listTestCases(): Promise<unknown[]>;
  getRunHistory(testId?: string): Promise<unknown[]>;
}

/**
 * Core implementation of QaBotAdapter.
 * Wraps the file-based stores and Playwright/Stagehand runners.
 */
export class QaBotCoreAdapter implements QaBotAdapter {
  private readonly testCaseStore: TestCaseStore;
  private readonly runStore: RunStore;

  constructor(private readonly dataDir: string) {
    this.testCaseStore = new TestCaseStore(dataDir);
    this.runStore = new RunStore(dataDir);
  }

  async crawl(url: string): Promise<void> {
    const blacklist = new BlacklistManager(this.dataDir);
    const spider = new SpiderAgent(this.testCaseStore, undefined, blacklist);
    await spider.crawl(url);
  }

  async run(testId?: string, runner: 'a' | 'b' = 'a'): Promise<void> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];

    if (runner === 'b') {
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for runner b');
      const semantic = new SemanticRunner(this.testCaseStore, this.runStore, {}, {
        apiKey,
        modelName: process.env['LLM_MODEL'],
      });
      if (testId) {
        await semantic.run(testId);
      } else {
        const cases = await this.testCaseStore.list();
        for (const tc of cases) await semantic.run(tc.id);
      }
    } else {
      const playwright = new PlaywrightRunner(this.testCaseStore, this.runStore, {}, undefined, apiKey);
      if (testId) {
        await playwright.run(testId);
      } else {
        const cases = await this.testCaseStore.list();
        for (const tc of cases) await playwright.run(tc.id);
      }
    }
  }

  async listTestCases(): Promise<unknown[]> {
    return this.testCaseStore.list();
  }

  async getRunHistory(testId?: string): Promise<unknown[]> {
    if (testId) {
      return this.runStore.listForTestCase(testId);
    }
    return this.runStore.listAll();
  }
}
