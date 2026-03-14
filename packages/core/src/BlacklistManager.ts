import { readFile } from 'fs/promises';
import { join } from 'path';

interface BlacklistConfig {
  urlPatterns: string[];
  perPageRules: Array<{ urlPattern: string; selectors: string[] }>;
}

/**
 * Manages URL and per-page interaction blacklists loaded from
 * {dataDir}/blacklist.json.
 *
 * URL patterns support two formats:
 *   - Glob: e.g. /admin/*  (matched against URL pathname)
 *   - Regex: e.g. /\/admin\/.*\/  (forward-slash delimited, matched against full URL)
 */
export class BlacklistManager {
  private config: BlacklistConfig | null = null;
  private loaded = false;

  constructor(private readonly dataDir: string) {}

  private async getConfig(): Promise<BlacklistConfig> {
    if (this.loaded) return this.config!;
    this.loaded = true;
    try {
      const raw = await readFile(join(this.dataDir, 'blacklist.json'), 'utf-8');
      this.config = JSON.parse(raw) as BlacklistConfig;
    } catch {
      this.config = { urlPatterns: [], perPageRules: [] };
    }
    return this.config!;
  }

  /** Returns true if the given URL matches any blacklisted URL pattern. */
  async isUrlBlacklisted(url: string): Promise<boolean> {
    const config = await this.getConfig();
    for (const pattern of config.urlPatterns) {
      if (this.matchesPattern(url, pattern)) return true;
    }
    return false;
  }

  /**
   * Returns CSS selectors that should not be interacted with on the given URL,
   * aggregated from all matching per-page rules.
   */
  async getBlacklistedSelectors(url: string): Promise<string[]> {
    const config = await this.getConfig();
    const selectors: string[] = [];
    for (const rule of config.perPageRules) {
      if (this.matchesPattern(url, rule.urlPattern)) {
        selectors.push(...rule.selectors);
      }
    }
    return selectors;
  }

  private matchesPattern(url: string, pattern: string): boolean {
    if (this.isRegexPattern(pattern)) {
      // Strip leading/trailing slashes and treat as a JS regex
      const inner = pattern.slice(1, -1);
      try {
        return new RegExp(inner).test(url);
      } catch {
        return false;
      }
    }
    // Glob — match against pathname
    const pathname = this.safePathname(url);
    return this.globMatch(pattern, pathname);
  }

  /** A pattern is a regex if it starts and ends with '/' and contains at least one char inside. */
  private isRegexPattern(pattern: string): boolean {
    return pattern.length >= 3 && pattern.startsWith('/') && pattern.endsWith('/');
  }

  private safePathname(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  /**
   * Minimal glob matching for pathname patterns.
   * Supports `*` (any char except `/`) and `**` (any chars including `/`).
   */
  private globMatch(pattern: string, value: string): boolean {
    const regex = this.globToRegex(pattern);
    return regex.test(value);
  }

  private globToRegex(pattern: string): RegExp {
    // Escape all regex special chars first, then restore glob wildcards
    let escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    // Replace ** before * so we don't double-replace
    escaped = escaped.replace(/\*\*/g, '\u0000'); // placeholder
    escaped = escaped.replace(/\*/g, '[^/]*');
    escaped = escaped.replace(/\u0000/g, '.*');
    return new RegExp(`^${escaped}$`);
  }
}
