const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC_DIR = path.join(__dirname, '..', 'assets', 'images');
const OUT_DIR = path.join(__dirname, '..', 'dist', 'assets', 'images');

// Resize config per image based on actual display dimensions
// Card images: displayed at ~350px wide, keep at 400w
// Seed top images: displayed at 158-164px wide, resize to 320w (2x retina)
// Seed bottom images: displayed at 88px height, resize to 176h (2x retina)
const RESIZE_CONFIG = {
  'columns_1.png': { width: 400 },
  'column_2.png': { width: 400 },
  'column_3.png': { width: 400 },
  'seeds_left_top.png': { width: 320 },
  'seeds_right_top.png': { width: 320 },
  'seeds_left_bottom.png': { height: 176 },
  'seeds_right_bottom.png': { height: 176 },
};

function contentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 10);
}

async function optimizeImage(filename) {
  const srcPath = path.join(SRC_DIR, filename);
  const baseName = path.parse(filename).name;
  const resizeOpts = RESIZE_CONFIG[filename];

  if (!resizeOpts) return null;

  const pipeline = sharp(srcPath).resize(resizeOpts);

  // Generate all three formats in parallel
  const [avifBuf, webpBuf, pngBuf] = await Promise.all([
    pipeline.clone().avif({ quality: 65 }).toBuffer(),
    pipeline.clone().webp({ quality: 80 }).toBuffer(),
    pipeline.clone().png({ compressionLevel: 9, palette: true }).toBuffer(),
  ]);

  // Get dimensions from the resized output
  const metadata = await pipeline.clone().png().toBuffer().then(b => sharp(b).metadata());

  const avifHash = contentHash(avifBuf);
  const webpHash = contentHash(webpBuf);
  const pngHash = contentHash(pngBuf);

  const avifName = `${baseName}.${avifHash}.avif`;
  const webpName = `${baseName}.${webpHash}.webp`;
  const pngName = `${baseName}.${pngHash}.png`;

  // Write files
  await Promise.all([
    fs.promises.writeFile(path.join(OUT_DIR, avifName), avifBuf),
    fs.promises.writeFile(path.join(OUT_DIR, webpName), webpBuf),
    fs.promises.writeFile(path.join(OUT_DIR, pngName), pngBuf),
  ]);

  const entry = {
    avif: avifName,
    webp: webpName,
    png: pngName,
    width: metadata.width,
    height: metadata.height,
    savings: {
      original: fs.statSync(srcPath).size,
      avif: avifBuf.length,
      webp: webpBuf.length,
      png: pngBuf.length,
    },
  };

  console.log(
    `  ${filename}: ${formatBytes(entry.savings.original)} → AVIF ${formatBytes(entry.savings.avif)}, WebP ${formatBytes(entry.savings.webp)}, PNG ${formatBytes(entry.savings.png)}`
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
