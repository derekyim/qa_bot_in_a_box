import { describe, it, expect } from 'vitest';
import { VERSION, createQaBotCore } from '../index.js';

describe('packages/core public interface', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('exports a createQaBotCore factory that returns an object', () => {
    const core = createQaBotCore();
    expect(core).toBeDefined();
    expect(typeof core).toBe('object');
  });
});
