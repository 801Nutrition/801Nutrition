const fs = require('fs');
const path = require('path');

const SRC_HTML = path.join(__dirname, '..', 'index.html');
const MANIFEST_PATH = path.join(__dirname, '..', 'dist', 'image-manifest.json');
const OUT_HTML = path.join(__dirname, '..', 'dist', 'index.html');

function buildHtml() {
  console.log('Building HTML...\n');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  let html = fs.readFileSync(SRC_HTML, 'utf-8');

  // Replace <img> tags referencing PNGs with <picture> elements.
  // Uses [^>] instead of [\s\S] to stay within tag boundaries (< ... />).
  // [^>] matches newlines, so multi-line <img> tags are handled correctly.
  html = html.replace(
    /^( *)<img\b([^>]*?\bsrc="assets\/images\/([^"]+\.png)"[^>]*?)\/>/gm,
    (match, indent, innerAttrs, filename) => {
      const entry = manifest[filename];
      if (!entry) return match; // Not in manifest, leave unchanged

      // Remove the PNG src attribute and normalize whitespace for remaining attrs
      const otherAttrs = innerAttrs
        .replace(/\bsrc="assets\/images\/[^"]+\.png"/, '')
        .replace(/\s+/g, ' ')
        .trim();

      return [
        `${indent}<picture>`,
        `${indent}  <source srcset="assets/images/${entry.avif}" type="image/avif" />`,
        `${indent}  <source srcset="assets/images/${entry.webp}" type="image/webp" />`,
        `${indent}  <img src="assets/images/${entry.png}" ${otherAttrs} width="${entry.width}" height="${entry.height}" />`,
        `${indent}</picture>`,
      ].join('\n');
    }
  );

  // Replace SVG src references with hashed filenames
  const svgMap = manifest._svg || {};
  let svgCount = 0;
  html = html.replace(
    /src="assets\/images\/([^"]+\.svg)"/g,
    (match, filename) => {
      const hashed = svgMap[filename];
      if (!hashed) return match;
      svgCount++;
      return `src="assets/images/${hashed}"`;
    }
  );

  fs.writeFileSync(OUT_HTML, html);
  console.log(`  Written dist/index.html`);

  const pictureCount = (html.match(/<picture>/g) || []).length;
  console.log(`  Replaced ${pictureCount} <img> tags with <picture> elements`);
  console.log(`  Hashed ${svgCount} SVG references`);
}

module.exports = { buildHtml };

if (require.main === module) {
  buildHtml();
}
