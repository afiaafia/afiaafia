const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const GIFEncoder = require('gif-encoder-2');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..');

const SVG_PATH = path.join(ROOT, 'assets', 'github-stats.svg');

const GIF_PATH = path.join(ROOT, 'assets', 'github-stats.gif');

const WIDTH = 1000;
const HEIGHT = 690;

const FRAME_WIDTH = WIDTH;
const FRAME_HEIGHT = HEIGHT;

const FRAME_DELAY = 80;
const HOLD_DELAY = 900;

const PROGRESS_VALUES = [
  0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 0.9, 0.8, 0.7, 0.6,
  0.5, 0.4, 0.3, 0.2, 0.1,
];

function createAnimatedSvg(baseSvg, progress) {
  const highlightX = 70 + progress * 860;

  const pulse = 0.12 + Math.sin(progress * Math.PI) * 0.18;

  const glow = 0.2 + Math.sin(progress * Math.PI) * 0.35;

  const overlay = `
    <defs>
      <linearGradient
        id="movingHighlight"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
      >
        <stop
          offset="0%"
          stop-color="#58A6FF"
          stop-opacity="0"
        />

        <stop
          offset="50%"
          stop-color="#58A6FF"
          stop-opacity="0.8"
        />

        <stop
          offset="100%"
          stop-color="#58A6FF"
          stop-opacity="0"
        />
      </linearGradient>

      <radialGradient id="movingGlow">
        <stop
          offset="0%"
          stop-color="#58A6FF"
          stop-opacity="0.6"
        />

        <stop
          offset="100%"
          stop-color="#58A6FF"
          stop-opacity="0"
        />
      </radialGradient>
    </defs>

    <!-- Moving highlight -->
    <rect
      x="${highlightX - 100}"
      y="108"
      width="200"
      height="4"
      rx="2"
      fill="url(#movingHighlight)"
      opacity="${glow}"
    />

    <!-- Moving glow -->
    <circle
      cx="${highlightX}"
      cy="110"
      r="24"
      fill="url(#movingGlow)"
      opacity="${glow}"
    />

    <!-- Subtle border pulse -->
    <rect
      x="40"
      y="150"
      width="920"
      height="500"
      rx="16"
      fill="none"
      stroke="#58A6FF"
      stroke-width="1"
      stroke-opacity="${pulse}"
    />
  `;

  return baseSvg.replace('</svg>', `${overlay}</svg>`);
}

async function renderSvgToCanvas(svgText) {
  const pngBuffer = await sharp(Buffer.from(svgText))
    .resize(FRAME_WIDTH, FRAME_HEIGHT)
    .png()
    .toBuffer();

  const image = await loadImage(pngBuffer);

  const canvas = createCanvas(FRAME_WIDTH, FRAME_HEIGHT);

  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);

  ctx.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);

  return ctx;
}

async function main() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error(`SVG file not found: ${SVG_PATH}`);
  }

  console.log('Reading GitHub stats SVG...');

  const baseSvg = fs.readFileSync(SVG_PATH, 'utf8');

  const encoder = new GIFEncoder(
    FRAME_WIDTH,
    FRAME_HEIGHT,
    'octree',
    true,
    PROGRESS_VALUES.length
  );

  encoder.setRepeat(0);
  encoder.setQuality(10);

  encoder.start();

  console.log(`Generating ${PROGRESS_VALUES.length} GIF frames...`);

  for (let index = 0; index < PROGRESS_VALUES.length; index += 1) {
    const progress = PROGRESS_VALUES[index];

    const animatedSvg = createAnimatedSvg(baseSvg, progress);

    const ctx = await renderSvgToCanvas(animatedSvg);

    if (index >= PROGRESS_VALUES.length - 3) {
      encoder.setDelay(HOLD_DELAY);
    } else {
      encoder.setDelay(FRAME_DELAY);
    }

    encoder.addFrame(ctx);

    console.log(`Frame ${index + 1}/${PROGRESS_VALUES.length}`);
  }

  encoder.finish();

  const gifBuffer = encoder.out.getData();

  fs.writeFileSync(GIF_PATH, gifBuffer);

  console.log('');
  console.log('Animated GitHub stats GIF generated successfully.');
  console.log(`Output: ${GIF_PATH}`);
}

main().catch((error) => {
  console.error('');
  console.error('Failed to generate animated GitHub stats GIF.');
  console.error(error);
  process.exit(1);
});
