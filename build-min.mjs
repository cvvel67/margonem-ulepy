/* Zaciemniona (zminifikowana) wersja gotowa do publikacji.
 *
 * Naglowek Tampermonkey (`// ==UserScript== ... ==/UserScript==`) MUSI
 * zostac w formie zwyklego, czytelnego komentarza - to na jego podstawie
 * Tampermonkey rejestruje skrypt (nazwa, @match, @grant...). Dlatego
 * NIE wrzucamy calego pliku do minifikatora naraz - wycinamy naglowek,
 * minifikujemy WYLACZNIE kod za nim (przez terser, prawdziwy silnik AST -
 * bezpiecznie skraca nazwy zmiennych/funkcji z uwzglednieniem zasiegu,
 * w odroznieniu od naiwnego podejscia regexem, ktore latwo cicho psuje
 * dzialanie kodu), a na koncu sklejamy z powrotem: naglowek + zminifikowany
 * kod. Wymaga `npx terser` (pobierany na zadanie, nie jest stala
 * zaleznoscia projektu - build.mjs nadal dziala bez niczego). */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, 'dist', 'margonem-ulepy.user.js');
const outPath = join(here, 'dist', 'margonem-ulepy.min.user.js');

const full = readFileSync(srcPath, 'utf8');

const headerStart = full.indexOf('// ==UserScript==');
const headerEnd = full.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length;
if (headerStart < 0 || headerEnd < 0) {
  throw new Error('Nie znaleziono bloku ==UserScript== - sprawdz dist/margonem-ulepy.user.js');
}
const header = full.slice(headerStart, headerEnd);
const code = full.slice(headerEnd);

const tmpIn = join(here, 'dist', '.min-input.js');
writeFileSync(tmpIn, code, 'utf8');

/* shell:true jest tu wymagany na Windows (npx to plik .cmd, execFileSync
 * bez powloki nie umie go uruchomic) - bezpieczne mimo ostrzezenia
 * Node o nieescapowanych argumentach, bo WSZYSTKIE argumenty ponizej sa
 * stalymi literalami wpisanymi tutaj wprost, nigdy danymi od uzytkownika
 * ani z zewnetrznego wejscia - nie ma czego wstrzyknac. */
const minified = execFileSync(
  'npx',
  ['--yes', 'terser', tmpIn,
    '--compress', 'passes=2',
    '--mangle',
    '--format', 'comments=false',
  ],
  { encoding: 'utf8', maxBuffer: 1024 * 1024 * 32, shell: true }
);

const out = header + '\n' + minified;
writeFileSync(outPath, out, 'utf8');
unlinkSync(tmpIn);

const beforeKb = (Buffer.byteLength(code) / 1024).toFixed(1);
const afterKb = (Buffer.byteLength(minified) / 1024).toFixed(1);
console.log(`zaciemniono -> ${outPath}`);
console.log(`  kod: ${beforeKb} kB -> ${afterKb} kB`);
