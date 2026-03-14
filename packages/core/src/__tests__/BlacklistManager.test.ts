import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { BlacklistManager } from '../BlacklistManager.js';

describe('BlacklistManager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'qa-bot-blacklist-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeBlacklist(data: object): Promise<void> {
    await writeFile(join(tmpDir, 'blacklist.json'), JSON.stringify(data));
  }

  // URL pattern matching — glob
  it('returns false when blacklist.json does not exist', async () => {
    const mgr = new BlacklistManager(tmpDir);
    expect(await mgr.isUrlBlacklisted('http://example.com/admin')).toBe(false);
  });

  it('matches a simple glob URL pattern', async () => {
    await writeBlacklist({ urlPatterns: ['/admin/*'], perPageRules: [] });
    const mgr = new BlacklistManager(tmpDir);
    expect(await mgr.isUrlBlacklisted('http://example.com/admin/users')).toBe(true);
    expect(await mgr.isUrlBlacklisted('http://example.com/home')).toBe(false);
  });

  it('matches a glob with double wildcard', async () => {
    await writeBlacklist({ urlPatterns: ['/admin/**'], perPageRules: [] });
    const mgr = new BlacklistManager(tmpDir);
    expect(await mgr.isUrlBlacklisted('http://example.com/admin/users/123')).toBe(true);
    expect(await mgr.isUrlBlacklisted('http://example.com/public/page')).toBe(false);
  });

  it('matches a regex URL pattern (delimited with /)', async () => {
    await writeBlacklist({ urlPatterns: ['/\\/admin\\/.*/'], perPageRules: [] });
    const mgr = new BlacklistManager(tmpDir);
    expect(await mgr.isUrlBlacklisted('http://example.com/admin/users')).toBe(true);
    expect(await mgr.isUrlBlacklisted('http://example.com/home')).toBe(false);
  });

  it('does not blacklist URL when urlPatterns is empty', async () => {
    await writeBlacklist({ urlPatterns: [], perPageRules: [] });
    const mgr = new BlacklistManager(tmpDir);
    expect(await mgr.isUrlBlacklisted('http://example.com/admin')).toBe(false);
  });

  // Per-page rules
  it('returns empty selectors when no per-page rules match the URL', async () => {
    await writeBlacklist({
      urlPatterns: [],
      perPageRules: [{ urlPattern: '/admin/*', selectors: ['#delete-btn'] }],
    });
    const mgr = new BlacklistManager(tmpDir);
    expect(await mgr.getBlacklistedSelectors('http://example.com/home')).toEqual([]);
  });

  it('returns selectors when per-page rule URL pattern matches', async () => {
    await writeBlacklist({
      urlPatterns: [],
      perPageRules: [
        { urlPattern: '/admin/*', selectors: ['#delete-btn', '.remove-user'] },
      ],
    });
    const mgr = new BlacklistManager(tmpDir);
    const selectors = await mgr.getBlacklistedSelectors('http://example.com/admin/users');
    expect(selectors).toContain('#delete-btn');
    expect(selectors).toContain('.remove-user');
  });

  it('merges selectors from multiple matching per-page rules', async () => {
    await writeBlacklist({
      urlPatterns: [],
      perPageRules: [
        { urlPattern: '/admin/*', selectors: ['#delete-btn'] },
        { urlPattern: '/admin/users*', selectors: ['.remove-user'] },
      ],
    });
    const mgr = new BlacklistManager(tmpDir);
    const selectors = await mgr.getBlacklistedSelectors('http://example.com/admin/users');
    expect(selectors).toContain('#delete-btn');
    expect(selectors).toContain('.remove-user');
  });

  it('returns empty selectors when blacklist.json does not exist', async () => {
    const mgr = new BlacklistManager(tmpDir);
    expect(await mgr.getBlacklistedSelectors('http://example.com/admin')).toEqual([]);
  });
});
