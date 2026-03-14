import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { TestCaseStore } from './TestCaseStore.js';
import type { RunStore } from './RunStore.js';
import type { RunResult, RunStep } from './types.js';
import { VisualDiffEngine } from './VisualDiffEngine.js';
import type { StagehandModelConfig } from './SpiderAgent.js';

export interface SemanticRunnerOptions {
  /** Max allowed diff percentage before a step is marked failed. Default: 0 */
  diffThreshold?: number;
}

export class SemanticRunner {
  private readonly diffEngine = new VisualDiffEngine();
  private readonly diffThreshold: number;

  constructor(
    private readonly testCaseStore: TestCaseStore,
    private readonly runStore: RunStore,
    options: SemanticRunnerOptions = {},
    private readonly stagehandModelConfig: StagehandModelConfig,
  ) {
    this.diffThreshold = options.diffThreshold ?? 0;
  }

  async run(testCaseId: string): Promise<RunResult> {
    const tc = await this.testCaseStore.load(testCaseId);
    if (!tc) {
      throw new Error(`Test case not found: ${testCaseId}`);
    }
    if (!tc.formatBSteps || tc.formatBSteps.length === 0) {
      throw new Error(`Test case ${testCaseId} has no Format B steps`);
    }

    const runId = `${Date.now()}-${testCaseId}`;
    const startedAt = new Date().toISOString();
    const runDir = this.runStore.getRunDir(runId);
    await mkdir(runDir, { recursive: true });

    const { Stagehand } = await import('@browserbasehq/stagehand');
    const stagehand = new Stagehand({
      env: 'LOCAL',
      model: {
        modelName: this.stagehandModelConfig.modelName ?? 'anthropic/claude-haiku-4-5-20251001',
        apiKey: this.stagehandModelConfig.apiKey,
      },
      verbose: 0,
      disablePino: true,
    });
    await stagehand.init();

    const steps: RunStep[] = [];

    try {
      const stagehandPage = stagehand.context.activePage();
      if (stagehandPage) {
        await stagehandPage.goto(tc.url, { waitUntil: 'domcontentloaded' });
      }

      for (let i = 0; i < tc.formatBSteps.length; i++) {
        const step = tc.formatBSteps[i];
        const stepLabel = `step-${String(i).padStart(3, '0')}`;

        // Execute the step using Stagehand act() — selector is a hint; if it misses,
        // Stagehand's LLM automatically locates the element from the description.
        await stagehand.act({ description: step.intent, selector: step.selector });

        const currentPage = stagehand.context.activePage();
        const currentScreenshot = currentPage
          ? await currentPage.screenshot()
          : Buffer.alloc(0);

        const screenshotFilename = `${stepLabel}.png`;
        const diffFilename = `${stepLabel}-diff.png`;

        const baselinePath = join(this.testCaseStore.getBaselineDir(testCaseId), screenshotFilename);
        let baseline: Buffer;
        try {
          baseline = await readFile(baselinePath);
        } catch {
          baseline = currentScreenshot;
        }

        const diffResult = await this.diffEngine.diff(baseline, currentScreenshot);

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
      await stagehand.close();
    }

    const passed = steps.every((s) => s.passed);
    const result: RunResult = {
      runId,
      testCaseId,
      runnerType: 'semantic',
      startedAt,
      finishedAt: new Date().toISOString(),
      passed,
      steps,
    };

    await this.runStore.save(result);
    return result;
  }
}
