const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildImages } = require('./build-images');
const { buildHtml } = require('./build-html');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function clean() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  fs.mkdirSync(DIST, { recursive: true });
}

function copyStaticAssets() {
  console.log('Copying static assets...\n');

  // Copy CSS
  copyDir(path.join(ROOT, 'assets', 'css'), path.join(DIST, 'assets', 'css'));
  console.log('  Copied assets/css/');

  // Copy fonts
  copyDir(path.join(ROOT, 'assets', 'fonts'), path.join(DIST, 'assets', 'fonts'));
  console.log('  Copied assets/fonts/');

  // Copy SVG images with content hashes (PNGs are handled by build-images)
  const imgSrc = path.join(ROOT, 'assets', 'images');
  const imgDest = path.join(DIST, 'assets', 'images');
  fs.mkdirSync(imgDest, { recursive: true });

  const svgManifest = {};
  for (const file of fs.readdirSync(imgSrc)) {
    if (file.endsWith('.svg')) {
      const content = fs.readFileSync(path.join(imgSrc, file));
      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
      const baseName = path.parse(file).name;
      const hashedName = `${baseName}.${hash}.svg`;
      fs.copyFileSync(path.join(imgSrc, file), path.join(imgDest, hashedName));
      svgManifest[file] = hashedName;
    }
  }

  // Merge SVG manifest into the image manifest
  const manifestPath = path.join(DIST, 'image-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  manifest._svg = svgManifest;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`  Hashed ${Object.keys(svgManifest).length} SVG images`);
}

async function build() {
  console.log('=== 801 Nutrition Build ===\n');

  // Step 1: Clean dist/
  console.log('Cleaning dist/...\n');
  clean();

  // Step 2: Optimize images
  await buildImages();
  console.log('');

  // Step 3: Copy static assets
  copyStaticAssets();
  console.log('');

  // Step 4: Build HTML
  buildHtml();

  console.log('\n=== Build complete ===\n');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
