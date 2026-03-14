import { chromium } from 'playwright';
import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { TestCase, FormatAStep, FormatBStep } from './types.js';
import type { TestCaseStore } from './TestCaseStore.js';
import type { CredentialManager } from './CredentialManager.js';
import type { BlacklistManager } from './BlacklistManager.js';

export interface StagehandModelConfig {
  apiKey: string;
  modelName?: string;
}

export class SpiderAgent {
  constructor(
    private readonly store: TestCaseStore,
    private readonly credentialManager?: CredentialManager,
    private readonly blacklistManager?: BlacklistManager,
    private readonly stagehandModelConfig?: StagehandModelConfig,
  ) {}

  async crawl(rootUrl: string): Promise<void> {
    const origin = new URL(rootUrl).origin;
    const visited = new Set<string>();
    const queue: string[] = [this.normalizeUrl(rootUrl)];

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    // Optionally initialise Stagehand for Format B step discovery
    let stagehand: import('@browserbasehq/stagehand').Stagehand | null = null;
    if (this.stagehandModelConfig) {
      const { Stagehand } = await import('@browserbasehq/stagehand');
      stagehand = new Stagehand({
        env: 'LOCAL',
        model: {
          modelName: this.stagehandModelConfig.modelName ?? 'anthropic/claude-haiku-4-5-20251001',
          apiKey: this.stagehandModelConfig.apiKey,
        },
        verbose: 0,
        disablePino: true,
      });
      await stagehand.init();
    }

    try {
      const credentials = this.credentialManager?.getCredentials() ?? null;
      if (credentials) {
        const loginPage = await context.newPage();
        try {
          await loginPage.goto(credentials.loginUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
          await loginPage.fill(credentials.usernameSelector, credentials.username);
          await loginPage.fill(credentials.passwordSelector, credentials.password);
          await loginPage.click(credentials.submitSelector);
          await loginPage.waitForLoadState('domcontentloaded');
        } finally {
          await loginPage.close();
        }
      }

      while (queue.length > 0) {
        const url = queue.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);

        if (this.blacklistManager && await this.blacklistManager.isUrlBlacklisted(url)) continue;

        const page = await context.newPage();
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });

          // If redirected away from origin (e.g. to login), skip this URL
          const finalUrl = page.url();
          if (new URL(finalUrl).origin !== origin) continue;

          const steps: FormatAStep[] = [{ type: 'navigate', url }];

          // Discover Format B steps via Stagehand observe()
          let formatBSteps: FormatBStep[] = [];
          if (stagehand) {
            try {
              const stagehandPage = stagehand.context.activePage();
              if (stagehandPage) {
                await stagehandPage.goto(url, { waitUntil: 'domcontentloaded' });
              }
              const actions = await stagehand.observe();
              formatBSteps = actions.map((a) => ({
                intent: a.description,
                selector: a.selector,
                url,
              }));
            } catch {
              // observe failed — continue without Format B steps for this page
            }
          }

          const id = randomUUID();
          const tc: TestCase = {
            id,
            url,
            createdAt: new Date().toISOString(),
            steps,
            formatBSteps: formatBSteps.length > 0 ? formatBSteps : undefined,
          };

          await this.store.save(tc);

          const baselineDir = this.store.getBaselineDir(id);
          await writeFile(join(baselineDir, 'step-000.png'), await page.screenshot());

          const links = await page.$$eval('a[href]', (anchors) =>
            anchors.map((a) => (a as HTMLAnchorElement).href),
          );

          for (const link of links) {
            try {
              const linkUrl = new URL(link);
              if (linkUrl.origin === origin) {
                const normalized = this.normalizeUrl(link);
                if (!visited.has(normalized) && !queue.includes(normalized)) {
                  queue.push(normalized);
                }
              }
            } catch {
              // ignore invalid URLs
            }
          }
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
      await browser.close();
      if (stagehand) await stagehand.close();
    }
  }

  private normalizeUrl(url: string): string {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.toString();
  }
}
