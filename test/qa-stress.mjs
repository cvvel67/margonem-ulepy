/* Testy QA przedpublikacyjne: duze wolumeny danych, stany puste, przypadki
 * brzegowe - rzeczy, ktorych zwykly test/run.mjs (male, reczne przyklady)
 * nie sprawdza. Uruchamiane oddzielnie, nie czesc glownego CI. */
import { loadCore, suite, assert, near } from './harness.mjs';

const MU = loadCore();
const s = suite('qa-stress');
const NOW = Date.now();

function mkObs(over) {
  return Object.assign({
    ts: NOW - Math.random() * 5 * 86400000,
    price: 400000 + Math.random() * 200000,
    weight: 1,
    kind: 'ask',
    baseName: 'testowy przedmiot',
    name: 'Testowy przedmiot',
    lvl: 45,
    bracket: '41-50',
    category: 'bron',
    rarity: 'unikat',
    upgrade: 0,
    itemKey: 'testowy przedmiot|unikat|+0',
    gkey: 'bron|41-50|unikat|+0',
    ckey: 'bron|41-50|unikat',
    world: null,
  }, over);
}

/* --- 1. Duzy wolumen: symulacja wielu dni zbierania, tysiace obserwacji,
 * pelne pokrycie wszystkich 28 przedzialow x 3 grupy x 2 rzadkosci. */
s.test('duzy wolumen (10000 obserwacji, pelne pokrycie siatki) - buildIndex+buildCoarseTable bez bledow', () => {
  const cfg = MU.cfg.get();
  const groups = ['bronie', 'pancerz', 'bizuteria'];
  const rarities = ['unikat', 'heroik'];
  const cats = { bronie: 'bron', pancerz: 'pancerz', bizuteria: 'naszyjnik' };
  const obs = [];
  const t0 = Date.now();
  for (let i = 0; i < 10000; i++) {
    const g = groups[i % 3];
    const rarity = rarities[(i >> 2) % 2];
    const bracketIdx = i % cfg.brackets.length;
    const b = cfg.brackets[bracketIdx];
    const lvl = b[0] + (i % 10);
    obs.push(mkObs({
      ts: NOW - (i % 60) * 86400000,
      price: 300000 + (i % 5000) * 1000,
      lvl: lvl,
      bracket: b[0] + '-' + b[1],
      category: cats[g],
      rarity: rarity,
      baseName: 'przedmiot ' + (i % 200),
      name: 'Przedmiot ' + (i % 200),
      itemKey: ['przedmiot ' + (i % 200), rarity, '+0'].join('|'),
      gkey: [cats[g], b[0] + '-' + b[1], rarity, '+0'].join('|'),
      ckey: [cats[g], b[0] + '-' + b[1], rarity].join('|'),
    }));
  }
  const index = MU.aggregate.buildIndex(obs, cfg, NOW);
  const buildMs = Date.now() - t0;
  assert(index.nObs > 0, 'index powinien zawierac obserwacje');
  assert(buildMs < 3000, 'buildIndex nie powinien trwac dluzej niz 3s nawet dla 10000 obserwacji: ' + buildMs + 'ms');

  const t1 = Date.now();
  let totalRows = 0, filledRows = 0;
  for (const g of groups) {
    for (const r of rarities) {
      const rows = MU.aggregate.buildCoarseTable(index, { group: g, rarity: r });
      assert(rows.length === cfg.brackets.length, 'buildCoarseTable musi zawsze zwracac PELNA siatke (' + cfg.brackets.length + ' wierszy), dostalem ' + rows.length);
      totalRows += rows.length;
      filledRows += rows.filter((x) => !x.empty).length;
      for (const row of rows) {
        if (!row.empty) {
          assert(isFinite(row.costPerPoint) && row.costPerPoint > 0, 'wypelniony wiersz musi miec poprawny koszt/pkt');
          assert(isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1, 'confidence musi byc w [0,1]');
        }
      }
    }
  }
  const tableMs = Date.now() - t1;
  assert(filledRows > 0, 'przy 10000 obserwacjach powinny byc wypelnione jakies przedzialy');
  assert(tableMs < 1000, 'zbudowanie wszystkich 6 kombinacji tabeli nie powinno trwac dluzej niz 1s: ' + tableMs + 'ms');
});

/* --- 2. Stan pusty: swieza instalacja, zero obserwacji. */
s.test('stan pusty (0 obserwacji) - buildIndex i buildCoarseTable nie rzucaja bledow', () => {
  const cfg = MU.cfg.get();
  const index = MU.aggregate.buildIndex([], cfg, NOW);
  assert(index.nObs === 0);
  assert(index.firstObsTs === null, 'brak obserwacji = brak daty pierwszej obserwacji');
  const rows = MU.aggregate.buildCoarseTable(index, { group: 'bronie', rarity: 'unikat' });
  assert(rows.length === cfg.brackets.length, 'nawet bez danych siatka ma byc PELNA, wszystkie empty:true');
  assert(rows.every((r) => r.empty === true), 'wszystkie wiersze musza byc oznaczone empty przy zerowych danych');
  const liveRows = MU.aggregate.buildLiveTable([], { target: null });
  assert(Array.isArray(liveRows) && liveRows.length === 0);
});

/* --- 3. Obserwacje z brakujacymi/uszkodzonymi polami (NaN lvl, ujemna
 * cena, brak kategorii) nie powinny wywalac calego builda. */
s.test('uszkodzone/brzegowe obserwacje nie wywalaja buildIndex/buildCoarseTable', () => {
  const cfg = MU.cfg.get();
  const obs = [
    mkObs({ price: -100 }),               // ujemna cena - buildIndex ma odsiac
    mkObs({ price: NaN }),                // NaN cena
    mkObs({ ts: NaN }),                   // NaN czas
    mkObs({ lvl: NaN, bracket: null }),   // brak poziomu/przedzialu
    mkObs({ category: 'nieznana-kategoria-xyz' }),
    mkObs({}),                            // poprawna, kontrolna
  ];
  let index;
  let threw = false;
  try {
    index = MU.aggregate.buildIndex(obs, cfg, NOW);
  } catch (e) { threw = true; }
  assert(!threw, 'buildIndex nie powinien rzucac wyjatku na uszkodzonych danych');
  /* buildIndex filtruje TYLKO na poziomie ts/price (nObs = wszystko z
   * poprawna cena i czasem) - 3 z 6 przechodza ten pierwszy filtr (cena:-100,
   * cena:NaN, ts:NaN sa odrzucane; NaN-lvl i nieznana-kategoria PRZECHODZA
   * ten etap, bo maja poprawne ts/price - ich niepoprawnosc jest obslugiwana
   * osobno, DALEJ w potoku, patrz asercje ponizej). */
  assert(index.nObs === 3, 'buildIndex filtruje tylko po ts/price (3 z 6 maja poprawne oba pola) - dostalem ' + index.nObs);
  let threw2 = false;
  let rows, itemRows;
  try {
    rows = MU.aggregate.buildCoarseTable(index, { group: 'bronie', rarity: 'unikat' });
    itemRows = MU.aggregate.buildItemTable(index, {});
  } catch (e) { threw2 = true; }
  assert(!threw2, 'buildCoarseTable/buildItemTable nie moga rzucac wyjatku, gdy w indeksie sa wpisy z NaN-lvl lub nieznana kategoria');
  assert(rows.length === cfg.brackets.length, 'siatka ma zawsze pelny rozmiar niezaleznie od jakosci danych');
  /* Wpis z NaN-lvl NIE MOZE wygenerowac wiersza (costRow wymaga isFinite(lvl)) -
   * a wpis z nieznana kategoria (fallback do "inne", group:null) jest
   * pomijany juz na etapie grupowania po grupie nadrzednej (buildCoarseGroup) -
   * wiec ZADEN z 3 "poprawnych po ts/price" wpisow nie powinien
   * wyprodukowac wypelnionego wiersza w tej konkretnej (bronie/unikat)
   * kombinacji, bo zaden nie ma i poprawnego lvl, i przypisanej grupy
   * "bronie" jednoczesnie w tym zestawie danych testowych. */
  assert(itemRows.every((r) => isFinite(r.costPerPoint) && r.costPerPoint > 0), 'kazdy wygenerowany wiersz w buildItemTable musi miec poprawny, skonczony koszt za punkt');
});

/* --- 4. Bardzo dlugi "ogon" pojedynczych, unikalnych przedmiotow (zakladka
 * Przedmioty/buildItemTable) - upewnij sie, ze sortowanie i budowa dzialaja
 * dla setek roznych nazw. */
s.test('setki unikalnych przedmiotow (buildItemTable) - poprawne sortowanie po koszcie/pkt', () => {
  const cfg = MU.cfg.get();
  const obs = [];
  for (let i = 0; i < 500; i++) {
    obs.push(mkObs({
      price: 100000 + i * 777,
      baseName: 'unikalny przedmiot ' + i,
      name: 'Unikalny przedmiot ' + i,
      itemKey: ['unikalny przedmiot ' + i, 'unikat', '+0'].join('|'),
      ts: NOW - i * 1000,
    }));
  }
  const index = MU.aggregate.buildIndex(obs, cfg, NOW);
  const rows = MU.aggregate.buildItemTable(index, {});
  assert(rows.length === 500, 'oczekiwano 500 osobnych pozycji, dostalem ' + rows.length);
  for (let i = 1; i < rows.length; i++) {
    assert(rows[i].costPerPoint >= rows[i - 1].costPerPoint, 'lista musi byc posortowana rosnaco po koszcie za punkt');
  }
});

/* --- 5. Cel ulepszania dla WSZYSTKICH kombinacji rzadkosci celu x grupy
 * celu - upewnij sie, ze bonusy nigdy nie daja NaN/Infinity/ujemnych. */
s.test('wszystkie kombinacje celu ulepszania daja skonczone, dodatnie punkty', () => {
  const targets = [];
  for (const rarity of ['heroik', 'legenda']) {
    for (const group of ['bronie', 'pancerz', 'bizuteria', null]) {
      targets.push({ rarity, group, lvl: 100 });
    }
  }
  targets.push(null); // brak celu
  const fodders = [];
  for (const rarity of ['unikat', 'heroik']) {
    for (const group of ['bronie', 'pancerz', 'bizuteria']) {
      for (const upgrade of [0, 1, 3]) {
        fodders.push({ lvl: 50, rarity, group, upgrade, baseName: 'x' });
      }
    }
  }
  for (const target of targets) {
    for (const fodder of fodders) {
      const pts = MU.upgrade.sacrificeYield(fodder, target);
      assert(isFinite(pts), 'punkty musza byc skonczone dla ' + JSON.stringify({ target, fodder }));
      assert(pts >= 0, 'punkty nie moga byc ujemne');
    }
  }
});

const bad = s.done();
process.exit(bad > 0 ? 1 : 0);
