const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'images');
const OUT_DIR = path.join(__dirname, '..', 'dist', 'assets', 'images');

// Card images: generate multiple widths for srcset
// Desktop 1x: ~335px, Desktop 2x: ~670px, Mobile 1x: ~640px, Mobile 2x: ~1280px
const CARD_WIDTHS = [400, 800, 1200];

// Seed images: single size (one display size, hidden on mobile)
// Seed top: displayed at 158-164px wide, resize to 320w (2x retina)
// Seed bottom: displayed at 88px height, resize to 176h (2x retina)
const RESIZE_CONFIG = {
  'column_1.png': { widths: CARD_WIDTHS },
  'column_2.png': { widths: CARD_WIDTHS },
  'column_3.png': { widths: CARD_WIDTHS },
  'seeds_left_top.png': { width: 320 },
  'seeds_right_top.png': { width: 320 },
  'seeds_left_bottom.png': { height: 176 },
  'seeds_right_bottom.png': { height: 176 },
};

function contentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 10);
}

async function generateVariant(srcPath, baseName, resizeOpts) {
  const pipeline = sharp(srcPath).resize(resizeOpts);

  const [avifBuf, webpBuf, pngBuf] = await Promise.all([
    pipeline.clone().avif({ quality: 65 }).toBuffer(),
    pipeline.clone().webp({ quality: 80 }).toBuffer(),
    pipeline.clone().png({ compressionLevel: 9, palette: true }).toBuffer(),
  ]);

  const metadata = await sharp(pngBuf).metadata();
  const sizeTag = `${metadata.width}x${metadata.height}`;

  const avifName = `${baseName}.${sizeTag}.${contentHash(avifBuf)}.avif`;
  const webpName = `${baseName}.${sizeTag}.${contentHash(webpBuf)}.webp`;
  const pngName = `${baseName}.${sizeTag}.${contentHash(pngBuf)}.png`;

  await Promise.all([
    fs.promises.writeFile(path.join(OUT_DIR, avifName), avifBuf),
    fs.promises.writeFile(path.join(OUT_DIR, webpName), webpBuf),
    fs.promises.writeFile(path.join(OUT_DIR, pngName), pngBuf),
  ]);

  return {
    avif: avifName, webp: webpName, png: pngName,
    width: metadata.width, height: metadata.height,
    sizes: { avif: avifBuf.length, webp: webpBuf.length, png: pngBuf.length },
  };
}

async function optimizeImage(filename) {
  const srcPath = path.join(SRC_DIR, filename);
  const baseName = path.parse(filename).name;
  const config = RESIZE_CONFIG[filename];

  if (!config) return null;

  const originalSize = fs.statSync(srcPath).size;

  // Multi-size images (card images with srcset)
  if (config.widths) {
    const variants = await Promise.all(
      config.widths.map(w => generateVariant(srcPath, baseName, { width: w }))
    );

    // Largest variant is the fallback
    const fallback = variants[variants.length - 1];

    const entry = {
      avif: fallback.avif,
      webp: fallback.webp,
      png: fallback.png,
      width: fallback.width,
      height: fallback.height,
      srcset: variants.map(v => ({
        avif: v.avif, webp: v.webp, png: v.png, width: v.width,
      })),
      sizes: '(max-width: 680px) calc(100vw - 40px), 335px',
    };

    console.log(
      `  ${filename}: ${formatBytes(originalSize)} → ${config.widths.length} sizes (${config.widths.join('w, ')}w), largest WebP ${formatBytes(fallback.sizes.webp)}`
    );

    return { filename, entry };
  }

  // Single-size images (seed images)
  const variant = await generateVariant(srcPath, baseName, config);

  const entry = {
    avif: variant.avif, webp: variant.webp, png: variant.png,
    width: variant.width, height: variant.height,
  };

  console.log(
    `  ${filename}: ${formatBytes(originalSize)} → AVIF ${formatBytes(variant.sizes.avif)}, WebP ${formatBytes(variant.sizes.webp)}, PNG ${formatBytes(variant.sizes.png)}`
  );

  return { filename, entry };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function buildImages() {
  console.log('Optimizing images...\n');

  // Ensure output directory exists
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pngFiles = Object.keys(RESIZE_CONFIG);
  const results = await Promise.all(pngFiles.map(optimizeImage));

  // Build manifest
  const manifest = {};
  for (const result of results) {
    if (result) {
      manifest[result.filename] = result.entry;
    }
  }

  // Write manifest
  const manifestPath = path.join(__dirname, '..', 'dist', 'image-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\nManifest written to dist/image-manifest.json`);
  console.log(`Optimized ${Object.keys(manifest).length} images`);

  return manifest;
}

module.exports = { buildImages };

if (require.main === module) {
  buildImages().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
