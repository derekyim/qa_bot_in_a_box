import { chromium } from 'playwright';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { TestCaseStore } from './TestCaseStore.js';
import type { RunStore } from './RunStore.js';
import type { RunResult, RunStep } from './types.js';
import { VisualDiffEngine } from './VisualDiffEngine.js';
import type { BlacklistManager } from './BlacklistManager.js';

export interface PlaywrightRunnerOptions {
  /** Max allowed diff percentage before a step is marked failed. Default: 0 (any diff = fail) */
  diffThreshold?: number;
}

export class PlaywrightRunner {
  private readonly diffEngine = new VisualDiffEngine();
  private readonly diffThreshold: number;

  constructor(
    private readonly testCaseStore: TestCaseStore,
    private readonly runStore: RunStore,
    options: PlaywrightRunnerOptions = {},
    private readonly blacklistManager?: BlacklistManager,
  ) {
    this.diffThreshold = options.diffThreshold ?? 0;
  }

  async run(testCaseId: string): Promise<RunResult> {
    const tc = await this.testCaseStore.load(testCaseId);
    if (!tc) {
      throw new Error(`Test case not found: ${testCaseId}`);
    }

    const runId = `${Date.now()}-${testCaseId}`;
    const startedAt = new Date().toISOString();
    const runDir = this.runStore.getRunDir(runId);

    await mkdir(runDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const steps: RunStep[] = [];

    try {
      for (let i = 0; i < tc.steps.length; i++) {
        const step = tc.steps[i];
        const stepLabel = `step-${String(i).padStart(3, '0')}`;

        if (step.type === 'navigate') {
          await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        } else if (step.type === 'click') {
          const currentUrl = page.url();
          const blacklisted = this.blacklistManager
            ? await this.blacklistManager.getBlacklistedSelectors(currentUrl)
            : [];
          if (!(await this.isSelectorBlacklisted(page, step.selector, blacklisted))) {
            await page.click(step.selector);
          }
        } else if (step.type === 'fill') {
          const currentUrl = page.url();
          const blacklisted = this.blacklistManager
            ? await this.blacklistManager.getBlacklistedSelectors(currentUrl)
            : [];
          if (!(await this.isSelectorBlacklisted(page, step.selector, blacklisted))) {
            await page.fill(step.selector, step.value);
          }
        }

        const currentScreenshot = await page.screenshot();
        const screenshotFilename = `${stepLabel}.png`;
        const diffFilename = `${stepLabel}-diff.png`;

        // Load baseline
        const baselinePath = join(this.testCaseStore.getBaselineDir(testCaseId), screenshotFilename);
        let baseline: Buffer;
        try {
          baseline = await readFile(baselinePath);
        } catch {
          // No baseline exists yet — treat as 0% diff, write the screenshot as baseline
          baseline = currentScreenshot;
        }

        const diffResult = await this.diffEngine.diff(baseline, currentScreenshot);

        // Save screenshots and diff into the run directory
        const screenshotPath = join(runDir, screenshotFilename);
        const diffImagePath = join(runDir, diffFilename);
        await writeFile(screenshotPath, currentScreenshot);
        await writeFile(diffImagePath, diffResult.diffImage);

        const passed = diffResult.diffPercentage <= this.diffThreshold;
        steps.push({
          stepIndex: i,
          screenshotPath: screenshotFilename,
          diffImagePath: diffFilename,
          diffPercentage: diffResult.diffPercentage,
          passed,
        });
      }
    } finally {
      await context.close();
      await browser.close();
    }

    const passed = steps.every((s) => s.passed);
    const result: RunResult = {
      runId,
      testCaseId,
      startedAt,
      finishedAt: new Date().toISOString(),
      passed,
      steps,
    };

    await this.runStore.save(result);
    return result;
  }

  /**
   * Returns true if the step's selector should be blocked.
   * Resolution order:
   *  1. Direct string equality match.
   *  2. CSS DOM comparison: both selectors evaluated on the live page; blocked if they
   *     resolve to the same element (handles different selectors targeting the same node).
   *  (LLM-assisted resolution for NL selectors is not yet implemented.)
   */
  private async isSelectorBlacklisted(
    page: import('playwright').Page,
    stepSelector: string,
    blacklistedSelectors: string[],
  ): Promise<boolean> {
    for (const bl of blacklistedSelectors) {
      if (bl === stepSelector) return true;
      // CSS DOM comparison
      try {
        const sameElement = await page.evaluate(
          ([s1, s2]: [string, string]) => {
            const el1 = document.querySelector(s1);
            const el2 = document.querySelector(s2);
            return el1 !== null && el2 !== null && el1 === el2;
          },
          [bl, stepSelector] as [string, string],
        );
        if (sameElement) return true;
      } catch {
        // bl is not a valid CSS selector (e.g. NL description) — CSS match failed
      }
    }
    return false;
  }
}
