/* Weryfikacja, ze ZACIEMNIONY bundle (dist/margonem-ulepy.min.user.js)
 * dziala IDENTYCZNIE jak czytelne zrodlo - laduje caly, prawdziwy plik
 * (nie pojedyncze moduly jak harness.mjs) do izolowanego kontekstu vm z
 * minimalnymi atrapami (document/window/indexedDB), zeby samowykonujacy
 * sie na koncu bundla boot() nie eksplodowal, po czym odpala PODZBIOR
 * tych samych asercji co glowny test/run.mjs, tym razem przeciw MU
 * pochodzacemu z zaciemnionego kodu - jesli terser cokolwiek subtelnie
 * popsul (np. przez bledne mangle'owanie nazwy w domknieciu), te same
 * liczbowe przyklady z poradnika (juz zweryfikowane w test/run.mjs) tu
 * tez musza sie zgadzac. */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, assert, near } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const minPath = join(here, '..', 'dist', 'margonem-ulepy.min.user.js');
const code = readFileSync(minPath, 'utf8');

const storage = new Map();
const noop = () => {};
const sandbox = {
  console,
  Math, Date, JSON, Set, Map, Promise, Object, Array, String, Number,
  isFinite, parseInt, parseFloat, NaN, Infinity, setInterval, clearInterval, setTimeout, clearTimeout,
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  /* Atrapy DOM/sieci - wystarczajaco duzo, zeby samowykonujacy sie na
   * koncu bundla boot()/MU.sniffer.install() nie rzucil wyjatkiem
   * synchronicznie przy LADOWANIU pliku (asynchroniczne .then() dalej w
   * lancuchu moga po cichu sie nie powiesc - nas interesuje wylacznie to,
   * ze MU.* (cfg/util/stats/normalize/upgrade/aggregate) sa POPRAWNIE
   * zdefiniowane i dzialaja, nie ze cala petla startowa dodatku wstaje
   * w Node bez przegladarki). */
  document: {
    body: null,
    head: { appendChild: noop },
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, classList: { add: noop, remove: noop, toggle: () => false, contains: () => false } }),
  },
  location: { href: 'https://test.margonem.pl/', hostname: 'test.margonem.pl' },
  navigator: { userAgent: 'node-vm-test' },
  history: { pushState: noop, replaceState: noop },
  XMLHttpRequest: undefined,
  fetch: undefined,
  indexedDB: undefined,
  MutationObserver: function () { this.observe = noop; this.disconnect = noop; },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

let loadError = null;
try {
  vm.runInContext(code, ctx, { filename: 'margonem-ulepy.min.user.js' });
} catch (e) {
  loadError = e;
}

const s = suite('verify-min (zaciemniony bundle)');

s.test('zaciemniony bundle laduje sie bez bledu i eksponuje window.MU z pelnym zestawem modulow', () => {
  assert(!loadError, 'blad przy ladowaniu bundla: ' + (loadError && loadError.stack));
  const MU = sandbox.MU;
  assert(MU, 'window.MU musi istniec po zaladowaniu');
  for (const mod of ['cfg', 'util', 'stats', 'normalize', 'upgrade', 'aggregate', 'store', 'sniffer', 'lifecycle', 'ui']) {
    assert(typeof MU[mod] === 'object' && MU[mod] !== null, 'MU.' + mod + ' musi istniec i byc obiektem');
  }
});

const MU = sandbox.MU;
if (MU) MU.cfg.load();

s.test('formatowanie zlota dziala identycznie po minifikacji (k/m/mld)', () => {
  assert(MU.util.gold(25000) === '25k');
  assert(MU.util.gold(1000000) === '1m');
  assert(MU.util.gold(2500000000) === '2.5mld');
});

s.test('rzadkosc "zwykly" i "legenda" nadal wykluczone po minifikacji', () => {
  const NOW = Date.now();
  assert(MU.normalize.normalizeExact({ id: '1', name: 'Zwykly kij', lvl: 10, itemType: 't-norm', buyout: 1000 }, { now: NOW }) === null);
  assert(MU.normalize.normalizeExact({ id: '1', name: 'Legendarny kij', lvl: 10, itemType: 't-leg', buyout: 1000 }, { now: NOW }) === null);
  assert(MU.normalize.normalizeExact({ id: '1', name: 'Niezwykly kij', lvl: 10, itemType: 't-uni', buyout: 1000 }, { now: NOW }) !== null);
});

s.test('poprawka SL (bez ASCII fallbacku) dziala identycznie po minifikacji', () => {
  const r = MU.normalize.parseGoldText('2025SŁ');
  assert(r.hasPremium === true, 'oferta czysto za SL musi byc oznaczona jako premium rowniez w zaciemnionym kodzie');
});

s.test('wzory ulepszenia (formulaBase/totalPointsCost/finalizeGoldCost) daja te same liczby co w poradniku', () => {
  near(MU.upgrade.totalPointsCost(63, 'heroik', 0, 5), 170100, 1);
  near(MU.upgrade.finalizeGoldCost(63, 'heroik'), 3647700, 1);
  near(MU.upgrade.finalizeEssenceCost(63), 49, 0.01);
});

s.test('sacrificeYield i bonusy addytywne dzialaja identycznie', () => {
  const fodder = { lvl: 50, rarity: 'heroik', group: 'bronie', upgrade: 0, baseName: 'x' };
  const target = { rarity: 'heroik', group: 'bronie', baseName: 'x' };
  const pts = MU.upgrade.sacrificeYield(fodder, target);
  const base = MU.upgrade.basePoints(50, 'heroik');
  near(pts, Math.floor(base * 4), 1, 'bonus 300% (mult=4x) musi dzialac identycznie po zaciemnieniu');
});

s.test('buildCoarseTable nadal zawsze zwraca pelna siatke po minifikacji', () => {
  const cfg = MU.cfg.get();
  const index = MU.aggregate.buildIndex([], cfg, Date.now());
  const rows = MU.aggregate.buildCoarseTable(index, { group: 'bronie', rarity: 'unikat' });
  assert(rows.length === cfg.brackets.length);
  assert(rows.every((r) => r.empty === true));
});

const bad = s.done();
process.exit(bad > 0 ? 1 : 0);
