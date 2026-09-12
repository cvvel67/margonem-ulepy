/* Lokalny podglad UI dodatku bez gry: `node dev/serve.mjs` -> http://localhost:8766
 *   /          atrapa klienta gry z trybem demo (?demo=kalk | ?demo=zbieranie)
 *   /sim.html  symulator okna aukcji (ladowanie stron, wznawianie)
 * Serwuje TYLKO te pliki (lista ponizej) i zawsze aktualny
 * dist/margonem-ulepy.user.js - po zmianach wystarczy `node build.mjs`
 * i odswiezenie strony. Nasluchuje wylacznie na 127.0.0.1. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8766;
const FILES = {
  '/': join(here, 'index.html'),
  '/index.html': join(here, 'index.html'),
  '/sim.html': join(here, 'sim.html'),
  '/margonem-ulepy.user.js': join(here, '..', 'dist', 'margonem-ulepy.user.js'),
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

createServer(async (req, res) => {
  const path = FILES[new URL(req.url, 'http://localhost').pathname];
  if (!path) { res.writeHead(404); res.end('404'); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)], 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end('Brak pliku - uruchom najpierw `node build.mjs`.\n' + e.message);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log('Podglad UI: http://localhost:' + PORT + '   symulator aukcji: http://localhost:' + PORT + '/sim.html');
});
