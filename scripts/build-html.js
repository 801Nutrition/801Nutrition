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

      // Build srcset if multiple sizes exist, otherwise single source
      let avifSrcset, webpSrcset, pngSrcset;
      if (entry.srcset) {
        avifSrcset = entry.srcset.map(v => `assets/images/${v.avif} ${v.width}w`).join(', ');
        webpSrcset = entry.srcset.map(v => `assets/images/${v.webp} ${v.width}w`).join(', ');
        pngSrcset = entry.srcset.map(v => `assets/images/${v.png} ${v.width}w`).join(', ');
      } else {
        avifSrcset = `assets/images/${entry.avif}`;
        webpSrcset = `assets/images/${entry.webp}`;
        pngSrcset = null;
      }

      const sizesAttr = entry.sizes ? ` sizes="${entry.sizes}"` : '';
      const lines = [
        `${indent}<picture>`,
        `${indent}  <source srcset="${avifSrcset}"${sizesAttr} type="image/avif" />`,
        `${indent}  <source srcset="${webpSrcset}"${sizesAttr} type="image/webp" />`,
      ];
      if (pngSrcset) {
        // Multi-size: use srcset on the <img> fallback too
        lines.push(`${indent}  <img srcset="${pngSrcset}"${sizesAttr} src="assets/images/${entry.png}" ${otherAttrs} width="${entry.width}" height="${entry.height}" />`);
      } else {
        lines.push(`${indent}  <img src="assets/images/${entry.png}" ${otherAttrs} width="${entry.width}" height="${entry.height}" />`);
      }
      lines.push(`${indent}</picture>`);

      return lines.join('\n');
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
