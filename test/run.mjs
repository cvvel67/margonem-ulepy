import { loadCore, suite, assert, near } from './harness.mjs';

const MU = loadCore();
const s = suite('ulepy');
const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 7, 12, 0, 0);

/* ---------------- statystyka ---------------- */

s.test('mediana i kwantyle', () => {
  near(MU.stats.median([1, 2, 3, 4, 5]), 3);
  near(MU.stats.median([1, 2, 3, 4]), 2.5);
  near(MU.stats.quantileSorted([10, 20, 30, 40], 0.25), 17.5);
});

s.test('MAD odrzuca prane zloto, srednia ucinana nie wystarcza', () => {
  /* Realny wzorzec: 12 uczciwych ofert ~2kk i jedna aukcja na 500kk,
   * ktora sluzy do przerzucenia zlota miedzy kontami. */
  const honest = [1.9e6, 2.0e6, 2.1e6, 1.95e6, 2.05e6, 2.2e6, 1.85e6,
                  2.0e6, 2.15e6, 1.9e6, 2.1e6, 2.0e6];
  const dirty = honest.concat([500e6]);
  const logs = dirty.map(Math.log);
  const mask = MU.stats.madMask(logs, 3.5);
  assert(mask[mask.length - 1] === false, 'anomalia powinna zostac odrzucona');
  assert(mask.slice(0, -1).every(Boolean), 'uczciwe oferty maja zostac');

  /* Srednia ucinana 10/10 przy n=13 ucina po floor(1.3)=1 z kazdej strony,
   * wiec akurat tu tez usunie anomalie - ale juz przy DWOCH takich
   * aukcjach przestaje wystarczac, a MAD dalej dziala. */
  const dirtier = honest.concat([500e6, 480e6]);
  const trimmed = MU.stats.trimmedMean(dirtier, 0.10);
  assert(trimmed > 30e6, 'srednia ucinana ma tu zawiesc (przepuszcza anomalie)');
  const mask2 = MU.stats.madMask(dirtier.map(Math.log), 3.5);
  const kept = dirtier.filter((_, i) => mask2[i]);
  assert(Math.max(...kept) < 10e6, 'MAD ma odrzucic obie anomalie');
});

s.test('srednia ucinana 10/10 dziala jak w pierwotnej specyfikacji', () => {
  const v = [];
  for (let i = 1; i <= 10; i++) v.push(i * 100);
  /* n=10, floor(1)=1 z kazdej strony -> zostaje 200..900, srednia 550 */
  near(MU.stats.trimmedMean(v, 0.10), 550);
});

s.test('waga czasowa: swiezsze ceny wazniejsze', () => {
  near(MU.stats.timeWeight(0, 7), 1);
  near(MU.stats.timeWeight(7, 7), 0.5);
  near(MU.stats.timeWeight(14, 7), 0.25);
});

s.test('summarize przesuwa mediane ku swiezym danym', () => {
  const stare = [];
  for (let i = 0; i < 10; i++) stare.push({ price: 1e6, ts: NOW - 25 * DAY, weight: 1 });
  const swieze = [];
  for (let i = 0; i < 10; i++) swieze.push({ price: 3e6, ts: NOW - 1 * DAY, weight: 1 });
  const r = MU.stats.summarize(stare.concat(swieze), { halfLifeDays: 7, now: NOW });
  assert(r.median > 2.4e6, 'przy polokresie 7 dni dane sprzed 25 dni maja wazyc znikomo, mediana=' + r.median);
  const plaskie = MU.stats.summarize(stare.concat(swieze), { halfLifeDays: 9999, now: NOW });
  assert(plaskie.median < r.median, 'bez wag czasowych mediana ma byc nizsza');
});

s.test('Theil-Sen wykrywa trend wzrostowy', () => {
  const pts = [];
  for (let d = 0; d < 20; d++) pts.push({ x: -d, y: Math.log(1e6) - d * 0.01 });
  const slope = MU.stats.theilSen(pts, 1);
  near(slope, 0.01, 1e-6, 'nachylenie na dzien');
});

s.test('trend odporny na pojedyncza anomalie', () => {
  const obs = [];
  for (let d = 0; d < 20; d++) {
    obs.push({ price: 1e6 * Math.exp(-d * 0.02), ts: NOW - d * DAY, weight: 1 });
  }
  obs.push({ price: 900e6, ts: NOW - 10 * DAY, weight: 1 });
  const r = MU.stats.summarize(obs, { halfLifeDays: 30, now: NOW });
  assert(r.trendPerWeek > 0.10 && r.trendPerWeek < 0.20,
    'oczekiwano ~+15%/tydz., otrzymano ' + r.trendPerWeek);
});

s.test('skurcz ciagnie male probki ku grupie', () => {
  /* 1 obserwacja mowiaca 10kk przy grupie 1kk nie moze dac 10kk. */
  const maly = MU.stats.shrink(10e6, 1, 1e6, 8);
  assert(maly < 2e6, 'skurcz zbyt slaby: ' + maly);
  /* 100 obserwacji juz obroni swoja wartosc. */
  const duzy = MU.stats.shrink(10e6, 100, 1e6, 8);
  assert(duzy > 8e6, 'skurcz zbyt silny: ' + duzy);
});

s.test('pewnosc rosnie z liczba obserwacji', () => {
  const mk = (n) => Array.from({ length: n }, () => ({ price: 1e6, ts: NOW, weight: 1 }));
  const a = MU.stats.summarize(mk(3), { now: NOW, minSamples: 5 });
  const b = MU.stats.summarize(mk(40), { now: NOW, minSamples: 5 });
  assert(b.confidence > a.confidence, 'wiecej danych = wieksza pewnosc');
  assert(b.confidence <= 1 && a.confidence >= 0);
});

/* ---------------- format realnego klienta gry (potwierdzone na zywo) --- */

s.test('parsowanie ceny w formacie klienta: k/m/mld, nie kk', () => {
  near(MU.normalize.parseGoldText('25k').gold, 25000, 1);
  near(MU.normalize.parseGoldText('2.5m').gold, 2.5e6, 1);
  near(MU.normalize.parseGoldText('150m').gold, 150e6, 1);
  near(MU.normalize.parseGoldText('500').gold, 500, 1);
  near(MU.normalize.parseGoldText('1.98m').gold, 1.98e6, 1e-6 * 1.98e6);
});

s.test('aukcje z waluta premium (SL) sa oznaczone i odrzucane', () => {
  const a = MU.normalize.parseGoldText('500m + 2100SŁ');
  assert(a.hasPremium === true);
  const b = MU.normalize.parseGoldText('500 + 2700SŁ');
  assert(b.hasPremium === true);
  near(b.gold, 500, 1, 'czesc zlota ma byc odczytana mimo oznaczenia premium');
  const c = MU.normalize.parseGoldText('3m');
  assert(!c.hasPremium);
  /* Przypadek BEZ "+" - oferta wystawiona WYLACZNIE za SL (nie mieszana
   * zloto+premium) - to realny format z zywego DOM (np. "2025SŁ"), bez
   * ktorego wczesniejsza wersja regexa (`/(SL|SŁ)\b/i`) w ogole nie
   * wykrywala premium: `\b` nigdy nie dopasowuje sie po polskiej literze
   * "Ł" (nie jest to znak \w w JS bez flagi /u), wiec ta galaz zawsze
   * zwracala false dla PRAWDZIWEGO formatu klienta gry - przepuszczajac
   * oferty za SL jako zwykle zlotowe. */
  const d = MU.normalize.parseGoldText('2025SŁ');
  assert(d.hasPremium === true, 'oferta czysto za SL musi byc oznaczona jako premium');
});

s.test('smieciowa etykieta ceny nie wywraca parsera (zwraca liczbe, filtr MAD zrobi reszte)', () => {
  const g = MU.normalize.parseGoldText('1g');
  assert(g && g.gold === 1, 'oczekiwano bezpiecznego sparsowania do 1: ' + JSON.stringify(g));
});

s.test('parsowanie pozostalego czasu aukcji: d/h/m/s', () => {
  assert(MU.normalize.parseRemainingToSeconds('9d 16h') === 9 * 86400 + 16 * 3600);
  assert(MU.normalize.parseRemainingToSeconds('1h 29m') === 3600 + 29 * 60);
  assert(MU.normalize.parseRemainingToSeconds('43m 51s') === 43 * 60 + 51);
  assert(MU.normalize.parseRemainingToSeconds('2m 5s') === 125);
  assert(MU.normalize.parseRemainingToSeconds('brak') === null);
});

s.test('rzadkosc z data-item-type - zrodlo pewniejsze niz nazwa', () => {
  assert(MU.normalize.detectRarity({ itemType: 't-norm' }, {}, 'Cos unikatowego') === 'zwykly');
  /* t-uniupg to zwykly unikat, nie osobna rzadkosc - kazdy zaobserwowany na
   * zywo przedmiot unikatowy mial ten kod, nigdy plain "t-uni". */
  assert(MU.normalize.detectRarity({ itemType: 't-uniupg' }, {}, 'Zwykly kubek') === 'unikat');
  assert(MU.normalize.detectRarity({ itemType: 't-uni' }, {}, '') === 'unikat');
  assert(MU.normalize.detectRarity({ itemType: 't-her' }, {}, '') === 'heroik');
});

s.test('kategoria z data-cl potwierdzonym na zywo: 8=pancerz, 9=helm', () => {
  assert(MU.normalize.detectCategory({ cl: '8' }, {}, 'Cos', MU.cfg.get()) === 'pancerz');
  assert(MU.normalize.detectCategory({ cl: '9' }, {}, 'Cos', MU.cfg.get()) === 'helm');
  assert(MU.normalize.detectCategory({ cl: 'weapon' }, {}, 'Cos', MU.cfg.get()) === 'bron');
});

s.test('normalizeExact buduje obserwacje wprost z rekordu scrapera tabeli', () => {
  const o = MU.normalize.normalizeExact({
    id: '1135131333', name: 'Cylinder arystokraty +2', lvl: 182, cl: '9',
    itemType: 't-uniupg', buyout: 2.5e6, endSeconds: 108,
  }, { now: NOW });
  assert(o, 'oczekiwano poprawnej obserwacji');
  assert(o.aid === '1135131333');
  near(o.price, 2.5e6, 1);
  assert(o.category === 'helm');
  assert(o.rarity === 'unikat');
  assert(o.upgrade === 2);
  assert(o.bracket === '181-190', 'przedzial dla lvl 182: ' + o.bracket);
  near(o.endTs, NOW + 108000, 1);
});

s.test('normalizeExact odrzuca rekord bez ceny', () => {
  assert(MU.normalize.normalizeExact({ id: '1', name: 'Cos', lvl: 10 }, { now: NOW }) === null);
});

s.test('rzadkosc "zwykly" jest calkowicie wykluczona (exact i heuristic)', () => {
  assert(MU.normalize.normalizeExact(
    { id: '1', name: 'Zwykly kij', lvl: 10, itemType: 't-norm', buyout: 1000 }, { now: NOW }) === null);
  assert(MU.normalize.normalizeRow(
    { id: 1, name: 'Zwykly kij', lvl: 10, price: 1000, rarity: 'zwykly' }, { now: NOW }) === null);
  /* kontrola: ten sam rekord z inna rzadkoscia MA przejsc. */
  assert(MU.normalize.normalizeExact(
    { id: '1', name: 'Niezwykly kij', lvl: 10, itemType: 't-uni', buyout: 1000 }, { now: NOW }) !== null);
});

s.test('rzadkosc "legenda" jest calkowicie wykluczona (exact i heuristic)', () => {
  assert(MU.normalize.normalizeExact(
    { id: '1', name: 'Legendarny kij', lvl: 10, itemType: 't-leg', buyout: 1000 }, { now: NOW }) === null);
  assert(MU.normalize.normalizeRow(
    { id: 1, name: 'Legendarny kij', lvl: 10, price: 1000, rarity: 'legenda' }, { now: NOW }) === null);
});

s.test('normalizeExact odrzuca oferty WYLACZNIE na licytacje (bez Kup teraz)', () => {
  /* sciezka "exact" ma prawdziwe, odrebne pola buyout/bid z DOM - brak
   * buyout = przedmiot jest tylko licytowany, ma byc odrzucony w calosci,
   * NIE liczony po cenie stawki. */
  assert(MU.normalize.normalizeExact(
    { id: '1', name: 'Cos', lvl: 10, itemType: 't-uni', bid: 500000 }, { now: NOW }) === null);
  const o = MU.normalize.normalizeExact(
    { id: '1', name: 'Cos', lvl: 10, itemType: 't-uni', bid: 500000, buyout: 900000 }, { now: NOW });
  near(o.price, 900000, 1, 'przy obu polach nadal wygrywa buyout');
});

/* ---------------- normalizacja ---------------- */

s.test('rozpoznanie rekordu aukcji mimo roznych nazw pol', () => {
  const wariantA = { id: 12, name: 'Kolczuga zbojcy', lvl: 25, price: 1500000, end: 1800, rarity: 'unikat' };
  const wariantB = { aid: 12, nazwa: 'Kolczuga zbojcy', poziom: 25, kwota: 1500000, rarity: 'unikat' };
  const wariantC = { auction_id: 12, item_name: 'Kolczuga zbojcy', item_lvl: 25, buyout: 1500000, rarity: 'unikat' };
  for (const [i, w] of [wariantA, wariantB, wariantC].entries()) {
    const o = MU.normalize.normalizeRow(w, { now: NOW });
    assert(o, 'wariant ' + i + ' nierozpoznany');
    near(o.price, 1500000, 1, 'wariant ' + i + ' cena');
    assert(o.lvl === 25, 'wariant ' + i + ' lvl');
    assert(o.category === 'pancerz', 'wariant ' + i + ' kategoria: ' + o.category);
    assert(o.bracket === '21-30', 'wariant ' + i + ' przedzial: ' + o.bracket);
  }
});

s.test('preferencja ceny kup-teraz nad biezaca stawka', () => {
  const o = MU.normalize.normalizeRow(
    { id: 1, name: 'Buty poslanca', lvl: 25, bid: 1000, buyout: 2000000, rarity: 'unikat' }, { now: NOW });
  near(o.price, 2000000, 1);
  near(o.bid, 1000, 1);
});

s.test('poziom ulepszenia z nazwy i rzadkosc ze statystyk', () => {
  const o = MU.normalize.normalizeRow(
    { id: 2, name: 'Miecz krwi +3', lvl: 62, price: 5e6, stat: 'rarity=heroic;lvl=62' },
    { now: NOW });
  assert(o.upgrade === 3, 'ulepszenie: ' + o.upgrade);
  assert(o.rarity === 'heroik', 'rzadkosc: ' + o.rarity);
  assert(o.category === 'bron', 'kategoria: ' + o.category);
  assert(o.baseName === 'miecz krwi', 'nazwa bazowa: ' + o.baseName);
});

s.test('normalizacja czasu konca: ms, s i czas pozostaly', () => {
  near(MU.normalize.normalizeEndTs(NOW, NOW), NOW);
  near(MU.normalize.normalizeEndTs(Math.floor(NOW / 1000), NOW), Math.floor(NOW / 1000) * 1000);
  near(MU.normalize.normalizeEndTs(3600, NOW), NOW + 3600000);
});

s.test('smieci nie sa brane za aukcje', () => {
  assert(MU.normalize.normalizeRow({ x: 1, y: 2 }, { now: NOW }) === null);
  assert(MU.normalize.normalizeRow({ msg: 'czesc', from: 'gracz' }, { now: NOW }) === null);
  assert(MU.normalize.arrayScore([{ hp: 10, mp: 5 }, { hp: 12, mp: 6 }]) < 0.55);
});

/* ---------------- cykl zycia aukcji ---------------- */

function obsRow(aid, price, endTs) {
  return MU.normalize.normalizeRow(
    { id: aid, name: 'Buty poslanca', lvl: 25, buyout: price, end: endTs, rarity: 'unikat' },
    { now: NOW });
}

s.test('znikniecie przed koncem = sprzedaz', () => {
  const rec = { aid: 'a1', scope: 'S', firstSeen: NOW - 2 * DAY, lastSeen: NOW - 3600e3,
    price: 2e6, buyout: 2e6, endTs: NOW + 5 * 3600e3, bidRaised: false };
  const r = MU.lifecycle.classifyDisappearance(rec, NOW);
  assert(r.kind === 'sale', 'oczekiwano sale, jest ' + r.kind);
  near(r.price, 2e6, 1);
});

s.test('dotrwanie do konca bez podbic = wygasniecie', () => {
  const rec = { aid: 'a2', scope: 'S', firstSeen: NOW - 3 * DAY, lastSeen: NOW - 60e3,
    price: 9e6, buyout: 9e6, endTs: NOW - 30 * 60e3, bidRaised: false };
  const r = MU.lifecycle.classifyDisappearance(rec, NOW);
  assert(r.kind === 'expired', 'oczekiwano expired, jest ' + r.kind);
});

s.test('dotrwanie do konca z podbiciami = sprzedaz za stawke', () => {
  const rec = { aid: 'a3', scope: 'S', firstSeen: NOW - 3 * DAY, lastSeen: NOW - 60e3,
    price: 3e6, bid: 3e6, endTs: NOW - 30 * 60e3, bidRaised: true };
  const r = MU.lifecycle.classifyDisappearance(rec, NOW);
  assert(r.kind === 'sale', 'oczekiwano sale, jest ' + r.kind);
  near(r.price, 3e6, 1);
});

s.test('brak czasu konca = niejednoznaczne, z mniejsza waga', () => {
  const rec = { aid: 'a4', scope: 'S', firstSeen: NOW - DAY, lastSeen: NOW - 60e3,
    price: 4e6, buyout: 4e6, endTs: null };
  const r = MU.lifecycle.classifyDisappearance(rec, NOW);
  assert(r.kind === 'ambiguous', 'oczekiwano ambiguous, jest ' + r.kind);
});

s.test('nowo widziana oferta zapisuje sie od razu jako "ask" (bez czekania)', () => {
  const res = MU.lifecycle.processSnapshot(
    [obsRow(77, 3e6, NOW + 7200e3)],
    { scope: 'SCOPE_X', complete: false }, {}, NOW);
  assert(res.write.length === 1, 'oczekiwano natychmiastowego zapisu biezacej oferty');
  assert(res.write[0].kind === 'ask', 'kind: ' + res.write[0].kind);
  near(res.write[0].price, 3e6, 1);
});

s.test('inny zakres wyszukiwania nie generuje falszywej sprzedazy starego wpisu', () => {
  /* Gracz przefiltrowal liste na inna kategorie. Stary przedmiot znikl z
   * widoku, ale NIE zostal sprzedany - to najgrozniejszy blad w tej klasie
   * narzedzi. Nowa oferta w innym zakresie nadal zapisuje sie jako "ask" -
   * to juz nie jest gated przez dopasowanie zakresu. */
  MU.lifecycle.state.lastScopeSeen['SCOPE_A'] = NOW - 60e3;
  const live = { a9: { aid: 'a9', scope: 'SCOPE_A', firstSeen: NOW - DAY, lastSeen: NOW - 60e3,
    baseName: 'buty poslanca', name: 'Buty poslanca', lvl: 25, bracket: '21-30',
    category: 'buty', rarity: 'zwykly', upgrade: 0, price: 2e6, buyout: 2e6,
    endTs: NOW + 5 * 3600e3 } };
  const res = MU.lifecycle.processSnapshot(
    [obsRow(77, 3e6, NOW + 7200e3)],
    { scope: 'SCOPE_B', complete: true }, live, NOW);
  assert(res.write.length === 1 && res.write[0].kind === 'ask',
    'nowa oferta w SCOPE_B ma zapisac sie jako ask');
  assert(res.del.length === 0, 'nie wolno przestac sledzic aukcji a9 z innego zakresu');
});

s.test('niepelna migawka (DOM) nie wnioskuje o sprzedazy starego wpisu', () => {
  MU.lifecycle.state.lastScopeSeen['dom'] = NOW - 60e3;
  const live = { a10: { aid: 'a10', scope: 'dom', firstSeen: NOW - DAY, lastSeen: NOW - 60e3,
    baseName: 'buty poslanca', name: 'Buty poslanca', lvl: 25, bracket: '21-30',
    category: 'buty', rarity: 'zwykly', upgrade: 0, price: 2e6, buyout: 2e6,
    endTs: NOW + 5 * 3600e3 } };
  const res = MU.lifecycle.processSnapshot(
    [obsRow(78, 3e6, NOW + 7200e3)],
    { scope: 'dom', complete: false }, live, NOW);
  assert(res.write.length === 1 && res.write[0].kind === 'ask',
    'nowa oferta ma zapisac sie jako ask niezaleznie od completeness');
  assert(res.del.length === 0, 'zrzut z DOM widzi tylko czesc listy - nie moze orzekac o sprzedazy a10');
});

s.test('pelna migawka po znikniecu starego wpisu dopisuje sprzedaz OBOK nowego ask', () => {
  MU.lifecycle.state.lastScopeSeen['SCOPE_C'] = NOW - 60e3;
  const live = { a11: { aid: 'a11', scope: 'SCOPE_C', firstSeen: NOW - 2 * DAY, lastSeen: NOW - 60e3,
    baseName: 'buty poslanca', name: 'Buty poslanca', lvl: 25, bracket: '21-30',
    category: 'buty', rarity: 'zwykly', upgrade: 0, price: 2e6, buyout: 2e6,
    endTs: NOW + 5 * 3600e3 } };
  const res = MU.lifecycle.processSnapshot(
    [obsRow(79, 3e6, NOW + 7200e3)],
    { scope: 'SCOPE_C', complete: true }, live, NOW);
  assert(res.write.length === 2, 'oczekiwano ask (nowa oferta) + sale (zniknieta a11), jest ' + res.write.length);
  const sale = res.write.find((w) => w.kind === 'sale');
  const ask = res.write.find((w) => w.kind === 'ask');
  assert(sale, 'brak zapisu sprzedazy dla a11');
  assert(ask, 'brak zapisu biezacej oferty dla nowego wpisu');
  near(sale.daysListed, 2, 0.01);
  assert(res.del.indexOf('a11') >= 0, 'sprzedana aukcja ma przestac byc sledzona');
});

/* ---------------- realny mechanizm Rzemiosla (MU.upgrade) --------------
 * Kazda wartosc ponizej zweryfikowana wprost przeciw przykladom liczbowym
 * z forum.margonem.pl, watek "Wiedza o Rzemiosle" (id=511370, pkt 10). */

s.test('punkty z poswiecenia: przyklad nr 2 z poradnika (bez mnoznikow)', () => {
  near(MU.upgrade.basePoints(271, 'zwykly'), 45, 0, 'lvl271 zwykly -> 45');
  near(MU.upgrade.basePoints(30, 'heroik'), 2100, 0, 'lvl30 heroik -> 2100');
});

s.test('bonus +25% za ta sama grupe (przyklad z poradnika)', () => {
  const fodder = { lvl: 30, rarity: 'heroik', group: 'pancerz', upgrade: 0, baseName: 'x' };
  const target = { rarity: 'zwykly', group: 'pancerz', baseName: 'y' };
  near(MU.upgrade.sacrificeYield(fodder, target), 2625, 0, '2100 * 1.25 = 2625');
});

s.test('bonusy sa addytywne: grupa + rzadkosc + ten sam przedmiot = +300% (4x)', () => {
  const fodder = { lvl: 100, rarity: 'unikat', group: 'pancerz', upgrade: 0, baseName: 'tarcza x' };
  const target = { rarity: 'unikat', group: 'pancerz', baseName: 'tarcza x' };
  const base = MU.upgrade.basePoints(100, 'unikat');
  near(MU.upgrade.sacrificeYield(fodder, target), Math.floor(base * 4), 0);
});

s.test('brak bonusow, jesli skladnik jest juz ulepszony', () => {
  const fodder = { lvl: 100, rarity: 'unikat', group: 'pancerz', upgrade: 2, baseName: 'tarcza x' };
  const target = { rarity: 'unikat', group: 'pancerz', baseName: 'tarcza x' };
  const base = MU.upgrade.basePoints(100, 'unikat');
  near(MU.upgrade.sacrificeYield(fodder, target), base, 0,
    'skladnik +2 ma dawac tylko baze, bez zadnych bonusow');
});

s.test('brak celu = brak bonusow (widok bazowy)', () => {
  const fodder = { lvl: 30, rarity: 'heroik', group: 'pancerz', upgrade: 0, baseName: 'x' };
  near(MU.upgrade.sacrificeYield(fodder, null), MU.upgrade.basePoints(30, 'heroik'), 0);
});

s.test('koszt calkowity ulepszenia +0->+5, lvl63 heroik (przyklad z poradnika)', () => {
  near(MU.upgrade.totalPointsCost(63, 'heroik', 0, 5), 170100, 0.01);
});

s.test('koszt calkowity ulepszenia +0->+3, lvl40 legenda (przyklad z poradnika)', () => {
  near(MU.upgrade.totalPointsCost(40, 'legenda', 0, 3), 748000, 0.01);
});

s.test('zloto przy finalizacji +5: lvl63 heroik (przyklad z poradnika)', () => {
  near(MU.upgrade.finalizeGoldCost(63, 'heroik'), 3647700, 0.01);
});

s.test('esencja przy finalizacji +5: lvl63 (przyklad z poradnika, zaokraglenie na koncu)', () => {
  near(MU.upgrade.finalizeEssenceCost(63), 49, 0, '16.3*300%=48.9 -> 49, nie round(16.3)*3=48');
});

s.test('wartosc esencjalna (rozbicie): przyklady z poradnika', () => {
  near(MU.upgrade.essenceValue(55, 0), 16, 0, '15.5 -> 16');
  near(MU.upgrade.essenceValue(225, 3), 52, 0, '32.5*1.6=52');
  near(MU.upgrade.essenceValue(85, 0), 19, 0, '18.5 -> 19');
});

s.test('koszt za punkt: tansza oferta przy tych samych punktach wygrywa', () => {
  const fodder = { lvl: 23, rarity: 'zwykly', group: 'pancerz', upgrade: 0, baseName: 'buty' };
  const tania = MU.upgrade.costPerPoint(10e6, fodder, null);
  const droga = MU.upgrade.costPerPoint(12e6, fodder, null);
  assert(tania < droga, 'tansza oferta ma miec nizszy koszt za punkt');
});

/* ---------------- agregacja: ranking koszt-za-punkt --------------------- */

function mkObs(over) {
  const base = {
    ts: NOW - DAY, price: 1e6, kind: 'sale', weight: 1,
    baseName: 'buty poslanca', name: 'Buty poslanca', lvl: 25, bracket: '21-30',
    category: 'buty', rarity: 'zwykly', upgrade: 0, daysListed: 1,
  };
  const o = Object.assign({}, base, over);
  o.itemKey = [o.baseName, o.rarity, '+' + o.upgrade].join('|');
  o.gkey = [o.category, o.bracket, o.rarity, '+' + o.upgrade].join('|');
  o.ckey = [o.category, o.bracket, o.rarity].join('|');
  return o;
}

s.test('indeks grupuje po przedmiocie i po kategorii', () => {
  const obs = [];
  for (let i = 0; i < 10; i++) obs.push(mkObs({ price: 1e6 + i * 10000 }));
  for (let i = 0; i < 10; i++) obs.push(mkObs({ price: 2e6, upgrade: 1 }));
  const idx = MU.aggregate.buildIndex(obs, MU.cfg.get(), NOW);
  assert(idx.nObs === 20, 'obserwacji: ' + idx.nObs);
  assert(idx.itemStats.size === 2, 'grup przedmiotowych: ' + idx.itemStats.size);
  assert(idx.groupStats.has('buty|21-30|zwykly|+0'));
  assert(idx.groupStats.has('buty|21-30|zwykly|+1'));
});

s.test('wygasle oferty nie licza sie do ceny, ale licza do plynnosci', () => {
  const obs = [];
  for (let i = 0; i < 8; i++) obs.push(mkObs({ price: 1e6, kind: 'sale' }));
  for (let i = 0; i < 8; i++) obs.push(mkObs({ price: 50e6, kind: 'expired' }));
  const idx = MU.aggregate.buildIndex(obs, MU.cfg.get(), NOW);
  const g = idx.groupStats.get('buty|21-30|zwykly|+0');
  near(g.stats.median, 1e6, 1e4, 'cena nie moze byc skazona wygaslymi ofertami');
  near(g.liq.sellThrough, 0.5, 1e-9, 'polowa wystawien konczy sie sprzedaza');
});

s.test('buildTable liczy koszt za punkt i sortuje rosnaco', () => {
  const obs = [];
  for (let i = 0; i < 12; i++) obs.push(mkObs({ price: 10e6, category: 'buty', bracket: '21-30', lvl: 23 }));
  for (let i = 0; i < 12; i++) obs.push(mkObs({ price: 12e6, category: 'helm', bracket: '21-30', lvl: 23,
    baseName: 'helm x', name: 'Helm x' }));
  const idx = MU.aggregate.buildIndex(obs, MU.cfg.get(), NOW);
  const rows = MU.aggregate.buildTable(idx, { brackets: ['21-30'], rarities: ['zwykly'] });
  assert(rows.length === 2, 'wierszy: ' + rows.length);
  /* Ten sam poziom, ta sama rzadkosc -> te same punkty bazowe, wiec tansza
   * oferta (buty, 10m) ma wygrac ranking (byc pierwsza po sortowaniu). */
  assert(rows[0].category === 'buty', 'najtansze za punkt powinny byc buty, jest: ' + rows[0].category);
  assert(rows[0].costPerPoint < rows[1].costPerPoint);
  near(rows[0].points, rows[1].points, 0, 'ten sam lvl i rzadkosc -> te same punkty bazowe');
});

s.test('buildTable pomija skladniki juz ulepszone (+1 i wyzej)', () => {
  const obs = [];
  for (let i = 0; i < 12; i++) obs.push(mkObs({ price: 1e6, upgrade: 1 }));
  const idx = MU.aggregate.buildIndex(obs, MU.cfg.get(), NOW);
  const rows = MU.aggregate.buildTable(idx, { brackets: ['21-30'], categories: ['buty'], rarities: ['zwykly'] });
  assert(rows.length === 0, 'skladniki +1 nie powinny trafic do tabeli (brak bonusu, gorszy wybor)');
});

s.test('buildCoarseTable grupuje wg nadrzednej grupy zasobu, nie drobiazgowej kategorii', () => {
  const obs = [];
  /* buty i helm naleza obie do grupy "pancerz" - maja sie polaczyc w JEDEN wpis. */
  for (let i = 0; i < 6; i++) obs.push(mkObs({ price: 10e6, category: 'buty', rarity: 'unikat' }));
  for (let i = 0; i < 6; i++) obs.push(mkObs({ price: 14e6, category: 'helm', rarity: 'unikat',
    baseName: 'helm x', name: 'Helm x' }));
  /* bron nalezy do grupy "bronie" - ma zostac osobno, nie wliczac sie do "pancerz". */
  for (let i = 0; i < 6; i++) obs.push(mkObs({ price: 999e6, category: 'bron', rarity: 'unikat',
    baseName: 'miecz x', name: 'Miecz x' }));
  const idx = MU.aggregate.buildIndex(obs, MU.cfg.get(), NOW);
  const rows = MU.aggregate.buildCoarseTable(idx, { group: 'pancerz', rarity: 'unikat', brackets: ['21-30'] });
  assert(rows.length === 1, 'jeden przedzial = jeden wiersz: ' + rows.length);
  assert(!rows[0].empty, 'wiersz ma miec dane (12 obserwacji z buty+helm razem)');
  near(rows[0].n, 12, 0, 'buty (6) + helm (6) maja sie polaczyc w jedna grupe "pancerz"');
  assert(rows[0].price < 999e6, 'cena bronie (999m) nie moze wplynac na grupe pancerz');
});

s.test('buildCoarseTable pokazuje KAZDY przedzial z pelnej siatki, nawet bez danych', () => {
  const obs = [mkObs({ price: 10e6, category: 'buty', rarity: 'heroik', bracket: '21-30', lvl: 23 })];
  const idx = MU.aggregate.buildIndex(obs, MU.cfg.get(), NOW);
  const rows = MU.aggregate.buildCoarseTable(idx, { group: 'pancerz', rarity: 'heroik' });
  const allBrackets = MU.cfg.get().brackets.map(function (b) { return b[0] + '-' + b[1]; });
  assert(rows.length === allBrackets.length,
    'ma zwrocic wiersz dla KAZDEGO przedzialu z siatki: ' + rows.length + ' vs ' + allBrackets.length);
  const filled = rows.filter(function (r) { return !r.empty; });
  const empty = rows.filter(function (r) { return r.empty; });
  assert(filled.length === 1, 'tylko przedzial 21-30 ma dane: ' + filled.length);
  assert(empty.length === allBrackets.length - 1, 'reszta ma byc oznaczona empty:true');
});

s.test('cel ulepszania podnosi punkty (a wiec obniza koszt za punkt) dla dopasowanej rzadkosci', () => {
  const obs = [];
  for (let i = 0; i < 12; i++) obs.push(mkObs({ price: 10e6, rarity: 'heroik' }));
  const idx = MU.aggregate.buildIndex(obs, MU.cfg.get(), NOW);
  const bez = MU.aggregate.buildTable(idx, { brackets: ['21-30'], categories: ['buty'], rarities: ['heroik'] });
  const zCelem = MU.aggregate.buildTable(idx, {
    brackets: ['21-30'], categories: ['buty'], rarities: ['heroik'],
    target: { rarity: 'heroik', group: 'pancerz' },
  });
  assert(bez.length === 1 && zCelem.length === 1);
  assert(zCelem[0].points > bez[0].points, 'z dopasowanym celem punkty maja byc wyzsze');
  assert(zCelem[0].costPerPoint < bez[0].costPerPoint, 'a koszt za punkt nizszy');
  assert(zCelem[0].bonusApplied === true);
});

s.test('buildItemTable pokazuje pojedyncze przedmioty posortowane po koszcie za punkt', () => {
  const obs = [];
  for (let i = 0; i < 5; i++) obs.push(mkObs({ price: 10e6, baseName: 'buty a', name: 'Buty A' }));
  for (let i = 0; i < 5; i++) obs.push(mkObs({ price: 5e6, baseName: 'buty b', name: 'Buty B' }));
  const idx = MU.aggregate.buildIndex(obs, MU.cfg.get(), NOW);
  const rows = MU.aggregate.buildItemTable(idx, {});
  assert(rows.length === 2);
  assert(rows[0].name === 'Buty B', 'tansze przy tych samych punktach ma byc pierwsze');
});

s.test('buildLiveTable: jeden wiersz na oferte, bez usredniania, sortowane po koszcie/pkt', () => {
  const a = MU.normalize.normalizeExact(
    { id: '1', name: 'Buty A', lvl: 30, cl: '10', itemType: 't-uni', buyout: 10e6 }, { now: NOW });
  const b = MU.normalize.normalizeExact(
    { id: '2', name: 'Buty B', lvl: 30, cl: '10', itemType: 't-uni', buyout: 5e6 }, { now: NOW });
  const rows = MU.aggregate.buildLiveTable([a, b], {});
  assert(rows.length === 2, 'kazda oferta to osobny wiersz, bez grupowania');
  assert(rows[0].aid === '2', 'tansza oferta przy tych samych punktach ma byc pierwsza');
});

s.test('buildLiveTable filtruje po kategorii i rzadkosci skladnika', () => {
  const buty = MU.normalize.normalizeExact(
    { id: '1', name: 'Buty A', lvl: 30, cl: '10', itemType: 't-uni', buyout: 10e6 }, { now: NOW });
  const rekawice = MU.normalize.normalizeExact(
    { id: '2', name: 'Rekawice A', lvl: 30, cl: '11', itemType: 't-her', buyout: 5e6 }, { now: NOW });
  const rows = MU.aggregate.buildLiveTable([buty, rekawice], { categories: ['buty'] });
  assert(rows.length === 1 && rows[0].category === 'buty', 'filtr kategorii ma zostawic tylko buty');
});

s.test('bootstrap zwraca sensowne prawdopodobienstwo zysku', () => {
  const kupno = [1e6, 1.1e6, 0.9e6, 1.05e6, 0.95e6];
  const sprzedaz = [4e6, 4.2e6, 3.8e6, 4.1e6, 3.9e6];
  const p = MU.stats.profitProbability(kupno, sprzedaz, 25000, 0, 500, 1);
  near(p, 1, 1e-9, 'przy takiej marzy zysk jest pewny');
  const pZly = MU.stats.profitProbability(sprzedaz, kupno, 25000, 0, 500, 1);
  near(pZly, 0, 1e-9, 'odwrocone ceny = zysk niemozliwy');
});

s.test('powtorzenie daje ten sam wynik (deterministyczny bootstrap)', () => {
  const a = MU.stats.profitProbability([1e6, 2e6, 3e6], [2e6, 3e6, 4e6], 1e5, 0.05, 300, 9);
  const b = MU.stats.profitProbability([1e6, 2e6, 3e6], [2e6, 3e6, 4e6], 1e5, 0.05, 300, 9);
  near(a, b, 1e-12, 'wynik ma byc powtarzalny');
});

process.exit(s.done() === 0 ? 0 : 1);
