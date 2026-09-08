/* Sklejenie modulow w jeden plik userscriptu.
 * Margonem przyjmuje dodatki jako pojedynczy plik JS, wiec bundlowanie
 * jest wymogiem, a nie wygoda. Bez zaleznosci - czysty node. */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, 'src');
const outDir = join(here, 'dist');

const files = readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
const parts = files.map((f) => {
  const body = readFileSync(join(srcDir, f), 'utf8');
  return `/* ===== ${f} ===== */\n${body}`;
});

mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'margonem-ulepy.user.js');
writeFileSync(out, parts.join('\n'), 'utf8');

const bytes = Buffer.byteLength(parts.join('\n'));
console.log(`zbudowano ${out}`);
console.log(`  moduly: ${files.length}  rozmiar: ${(bytes / 1024).toFixed(1)} kB`);
