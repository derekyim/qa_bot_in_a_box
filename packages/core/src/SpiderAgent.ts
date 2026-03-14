import { chromium } from 'playwright';
import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { TestCase, FormatAStep } from './types.js';
import type { TestCaseStore } from './TestCaseStore.js';

export class SpiderAgent {
  constructor(private readonly store: TestCaseStore) {}

  async crawl(rootUrl: string): Promise<void> {
    const origin = new URL(rootUrl).origin;
    const visited = new Set<string>();
    const queue: string[] = [this.normalizeUrl(rootUrl)];

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    try {
      while (queue.length > 0) {
        const url = queue.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);

        const page = await context.newPage();
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });

          const steps: FormatAStep[] = [{ type: 'navigate', url }];
          const id = randomUUID();
          const tc: TestCase = { id, url, createdAt: new Date().toISOString(), steps };

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
    }
  }

  private normalizeUrl(url: string): string {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.toString();
  }
}
