import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const buildDir = join(root, 'standalone-build');
const htmlPath = join(buildDir, 'index.html');
const outputPath = join(root, 'play.html');

let html = await readFile(htmlPath, 'utf8');

const cssMatch = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);
const jsMatch = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);

if (!cssMatch || !jsMatch) {
  throw new Error('Could not find generated CSS/JS assets in standalone-build/index.html');
}

const css = await readFile(join(buildDir, cssMatch[1]), 'utf8');
const js = await readFile(join(buildDir, jsMatch[1]), 'utf8');

html = html
  .replace(cssMatch[0], () => `<style>\n${css}\n</style>`)
  .replace(jsMatch[0], () => `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);

await writeFile(outputPath, html);
console.log(`Created ${outputPath}`);
