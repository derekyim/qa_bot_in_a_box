import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { VisualDiffEngine } from '../VisualDiffEngine.js';

function createSolidPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4 + 0] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe('VisualDiffEngine', () => {
  it('returns 0% diff for two identical images', async () => {
    const engine = new VisualDiffEngine();
    const img = createSolidPng(10, 10, 255, 0, 0);
    const result = await engine.diff(img, img);
    expect(result.diffPercentage).toBe(0);
  });

  it('returns >0% diff for two different images', async () => {
    const engine = new VisualDiffEngine();
    const red = createSolidPng(10, 10, 255, 0, 0);
    const blue = createSolidPng(10, 10, 0, 0, 255);
    const result = await engine.diff(red, blue);
    expect(result.diffPercentage).toBeGreaterThan(0);
  });

  it('returns a diff image buffer', async () => {
    const engine = new VisualDiffEngine();
    const red = createSolidPng(10, 10, 255, 0, 0);
    const blue = createSolidPng(10, 10, 0, 0, 255);
    const result = await engine.diff(red, blue);
    expect(result.diffImage).toBeInstanceOf(Buffer);
    expect(result.diffImage.length).toBeGreaterThan(0);
  });

  it('returns 100% diff when all pixels differ', async () => {
    const engine = new VisualDiffEngine();
    const red = createSolidPng(4, 4, 255, 0, 0);
    const blue = createSolidPng(4, 4, 0, 0, 255);
    const result = await engine.diff(red, blue);
    expect(result.diffPercentage).toBe(100);
  });
});
