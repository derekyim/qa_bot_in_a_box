import type { QaBotCore } from '@qa-bot/core';

/**
 * Adapter interface for future OpenClaw plugin integration.
 * Core implements this interface; the adapter package has no OpenClaw runtime dependency.
 */
export interface QaBotAdapter {
  crawl(url: string): Promise<void>;
  run(testId?: string, runner?: 'a' | 'b'): Promise<void>;
  listTestCases(): Promise<unknown[]>;
  getRunHistory(testId?: string): Promise<unknown[]>;
}

export const ADAPTER_VERSION = '0.1.0';

// Stub — implemented in future slices
export function createAdapter(_core: QaBotCore): QaBotAdapter {
  return {
    async crawl(_url) {
      throw new Error('Not implemented');
    },
    async run(_testId, _runner) {
      throw new Error('Not implemented');
    },
    async listTestCases() {
      return [];
    },
    async getRunHistory(_testId) {
      return [];
    },
  };
}
