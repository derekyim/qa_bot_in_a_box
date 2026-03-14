import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface DiffResult {
  diffPercentage: number;
  diffImage: Buffer;
}

export class VisualDiffEngine {
  async diff(baseline: Buffer, current: Buffer): Promise<DiffResult> {
    const img1 = PNG.sync.read(baseline);
    const img2 = PNG.sync.read(current);

    // If dimensions differ, treat as 100% diff — no meaningful pixel comparison possible
    if (img1.width !== img2.width || img1.height !== img2.height) {
      const diffPng = new PNG({ width: img1.width, height: img1.height });
      return { diffPercentage: 100, diffImage: PNG.sync.write(diffPng) };
    }

    const { width, height } = img1;
    const diffPng = new PNG({ width, height });

    const numDiffPixels = pixelmatch(img1.data, img2.data, diffPng.data, width, height, {
      threshold: 0.1,
    });

    const totalPixels = width * height;
    const diffPercentage = totalPixels === 0 ? 0 : (numDiffPixels / totalPixels) * 100;
    const diffImage = PNG.sync.write(diffPng);

    return { diffPercentage, diffImage };
  }
}
