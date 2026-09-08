/* Ladowanie modulow dodatku do izolowanego kontekstu node.
 * Moduly sa pisane pod przegladarke (dopisuja sie do wspoldzielonego MU),
 * wiec podstawiamy minimalne atrapy globali i odpalamy je w vm. */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');

/* Moduly czysto obliczeniowe - bez DOM, IndexedDB i sieci. */
const CORE = [
  '01-config.js', '02-util.js', '03-stats.js',
  '05-normalize.js', '07-lifecycle.js', '08-upgrade.js', '09-aggregate.js',
];

export function loadCore() {
  const storage = new Map();
  const sandbox = {
    MU: { version: 'test' },
    console,
    Math, Date, JSON, Set, Map, Promise, Object, Array, String, Number,
    isFinite, parseInt, parseFloat, NaN, Infinity,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  for (const f of CORE) {
    const code = readFileSync(join(srcDir, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  sandbox.MU.cfg.load();
  return sandbox.MU;
}

/* Prosty runner - bez zaleznosci, zeby projekt nie ciagnal node_modules. */
export function suite(name) {
  const results = [];
  const api = {
    test(label, fn) {
      try {
        fn();
        results.push({ ok: true, label });
      } catch (e) {
        results.push({ ok: false, label, err: e });
      }
      return api;
    },
    done() {
      const bad = results.filter((r) => !r.ok);
      console.log(`\n${name}: ${results.length - bad.length}/${results.length} przeszlo`);
      for (const r of results) {
        console.log(`  ${r.ok ? 'ok  ' : 'BLAD'} ${r.label}`);
        if (!r.ok) console.log(`       ${r.err && r.err.message}`);
      }
      return bad.length;
    },
  };
  return api;
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'oczekiwano wartosci prawdziwej');
}

export function near(a, b, tol, msg) {
  const t = tol === undefined ? 1e-6 : tol;
  if (!(Math.abs(a - b) <= t)) {
    throw new Error((msg || 'roznica poza tolerancja') + `: ${a} vs ${b} (tol ${t})`);
  }
}
