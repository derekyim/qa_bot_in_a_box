#!/usr/bin/env node
import { program } from 'commander';
import { resolve } from 'path';
import { SpiderAgent, TestCaseStore } from '@qa-bot/core';

export const CLI_VERSION = '0.1.0';

const DATA_DIR = resolve(process.env['QA_DATA_DIR'] ?? './qa-data');

program
  .name('qa-bot')
  .description('QA Bot in a Box — automated visual regression testing')
  .version(CLI_VERSION);

program
  .command('crawl <url>')
  .description('Crawl a URL and record test cases')
  .action(async (url: string) => {
    const store = new TestCaseStore(DATA_DIR);
    const spider = new SpiderAgent(store);
    console.log(`Crawling ${url} ...`);
    await spider.crawl(url);
    const cases = await store.list();
    console.log(`Done. Recorded ${cases.length} test case(s).`);
  });

program
  .command('list')
  .description('List all stored test cases')
  .action(async () => {
    const store = new TestCaseStore(DATA_DIR);
    const cases = await store.list();
    if (cases.length === 0) {
      console.log('No test cases found. Run `qa-bot crawl <url>` first.');
      return;
    }
    for (const tc of cases) {
      console.log(`${tc.id}  ${tc.url}  (created: ${tc.createdAt})`);
    }
  });

program.parse();
