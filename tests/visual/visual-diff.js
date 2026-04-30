import fs from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import sharp from "sharp";

const referencePath = process.argv[2];
const testPath = process.argv[3];
const diffPath = process.argv[4] ?? "diff.png";

if (!referencePath || !testPath) {
  console.error("Usage: node visual-diff.js reference.png test.png [diff.png]");
  process.exit(2);
}

// Mask the clock band in the top panel. In our nested gnome-shell layout
// the clock renders centered (~x=555-645 at 1200px wide), so we mask a
// generous strip around that, full panel height. The GLCounter indicators
// on the right stay visible — they're what we're checking.
const CLOCK_MASK_X_MIN = 350;
const CLOCK_MASK_X_MAX = 850;
const CLOCK_MASK_Y_MIN = 0;
const CLOCK_MASK_Y_MAX = 40;

// Pipeline gate: a per-version diff above this ratio fails the build.
const MAX_MISMATCH_RATIO = 0.02;

async function loadPng(path) {
  const buffer = await sharp(path).ensureAlpha().png().toBuffer();
  return PNG.sync.read(buffer);
}

function maskClock(png) {
  const { width, height, data } = png;

  const startX = Math.max(0, CLOCK_MASK_X_MIN);
  const endX = Math.min(width, CLOCK_MASK_X_MAX);
  const startY = Math.max(0, CLOCK_MASK_Y_MIN);
  const endY = Math.min(height, CLOCK_MASK_Y_MAX);

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const idx = (width * y + x) << 2;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }
}

const reference = await loadPng(referencePath);
const test = await loadPng(testPath);

if (reference.width !== test.width || reference.height !== test.height) {
  console.error(
    `Image sizes differ: reference=${reference.width}x${reference.height}, test=${test.width}x${test.height}`
  );
  process.exit(1);
}

maskClock(reference);
maskClock(test);

const diff = new PNG({
  width: reference.width,
  height: reference.height,
});

const mismatchedPixels = pixelmatch(
  reference.data,
  test.data,
  diff.data,
  reference.width,
  reference.height,
  {
    threshold: 0.1,
  }
);

fs.writeFileSync(diffPath, PNG.sync.write(diff));

const totalPixels = reference.width * reference.height;
const mismatchRatio = mismatchedPixels / totalPixels;

console.log(JSON.stringify({
  reference: referencePath,
  test: testPath,
  diff: diffPath,
  mismatchedPixels,
  mismatchRatio,
  threshold: MAX_MISMATCH_RATIO,
}));

if (mismatchRatio > MAX_MISMATCH_RATIO) {
  process.exit(1);
}
