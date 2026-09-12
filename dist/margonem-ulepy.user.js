/* ===== 00-banner.js ===== */
// ==UserScript==
// @name         ulepa kalkulator
// @namespace    https://github.com/cvvel67/margonem-ulepy
// @version      1.2.1
// @author       Terry A. Davis
// @match        *://*.margonem.pl/*
// @match        *://*.margonem.com/*
// @updateURL    https://raw.githubusercontent.com/cvvel67/margonem-ulepy/main/dist/margonem-ulepy.min.user.js
// @downloadURL  https://raw.githubusercontent.com/cvvel67/margonem-ulepy/main/dist/margonem-ulepy.min.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

/*
 * Struktura:
 *   MU.cfg        - konfiguracja (przedziały lvl, mnożniki kosztu, parametry statystyk)
 *   MU.util       - drobiazgi
 *   MU.store      - trwałe składowanie obserwacji (IndexedDB, fallback localStorage)
 *   MU.sniffer    - przechwytywanie danych aukcyjnych z klienta gry
 *   MU.normalize  - surowy payload -> znormalizowana obserwacja
 *   MU.lifecycle  - śledzenie aukcji w czasie -> wykrywanie faktycznej sprzedaży
 *   MU.stats      - odporne statystyki (log-space, MAD, EWMA, Theil-Sen, bootstrap)
 *   MU.aggregate  - hierarchiczna agregacja ze skurczem (shrinkage)
 *   MU.upgrade    - model kosztu ulepszania i opłacalności
 *   MU.ui         - panel wynikowy
 */
;(function () {
'use strict';
const MU = { version: '1.2.1' };

/* ===== 01-config.js ===== */
/* ------------------------------------------------------------------ *
 * MU.cfg - konfiguracja domyslna.
 * Wszystko tutaj jest edytowalne z panelu (zakladka "Ustawienia") i
 * zapisywane w localStorage.
 * ------------------------------------------------------------------ */
MU.cfg = (function () {

  /* v8: bump po zmianie koloru rzadkosci "heroik" z pomaranczowego na
   * niebieski (w obu listach: rarities i targetRarities). deepMerge dla
   * tablic podstawia zapisana wartosc w calosci, wiec bez bumpa stary
   * kolor zostalby na zawsze u kogos z juz zapisanym localStorage. */
  /* v9: bump po usunieciu "talizman" ze slow kluczowych naszyjnika
   * (talizmany to zakladka "Inne" gry, calkowicie wykluczona - patrz
   * MU.normalize). Lista kategorii zapisuje sie w localStorage w calosci,
   * wiec bez bumpa stara lista slow kluczowych zostalaby u kazdego. */
  /* v10: strzaly (cl 29) dopisane do kategorii "bron" - ta sama przyczyna
   * bumpa co wyzej (u kogos z v1.1.0 zostalaby lista bez strzal). */
  /* v11: polskie znaki w etykietach kategorii (Broń, Hełm...) - ta sama
   * przyczyna bumpa co wyzej. */
  const LS_KEY = 'MU_CFG_v11';

  /* Przedzialy poziomowe: pelna, rowna siatka co 10 lvl, 21-30 .. 291-300.
   * Przedmioty ponizej 21 lub powyzej 300 trafiaja do wspolnego "?" -
   * poza zakresem zainteresowania (patrz MU.cfg.bracketOf). */
  const defaultBrackets = (function () {
    const out = [];
    for (let lo = 21; lo <= 291; lo += 10) out.push([lo, lo + 9]);
    return out;
  })();

  /* Kategorie przedmiotow.
   * group - "grupa zasobu" uzywana przez realny mechanizm Rzemiosla przy
   *         liczeniu bonusu +25% za poswiecenie przedmiotu tej samej grupy
   *         co ulepszany cel. Gra rozroznia tylko TRZY grupy: bronie,
   *         pancerz, bizuteria (patrz MU.upgrade.sacrificeYield) - to
   *         grubszy podzial niz kategorie ponizej (np. helm/buty/tarcza
   *         wszystkie naleza do grupy "pancerz").
   * kw    - slowa kluczowe do rozpoznania kategorii po nazwie przedmiotu
   *         (fallback, gdy klient nie poda pola `cl`).
   * cl    - kody klas przedmiotu z danych klienta. Potwierdzone na zywo
   *         (NI, wrzesien 2026): "8" = zbroje, "9" = helmy, "weapon" =
   *         zbiorczy widok Bron bez wyboru podtypu. Pozostale kategorie
   *         nie zostaly zmapowane numerycznie - dzialaja na slowach
   *         kluczowych z nazwy, dopoki ktos nie potwierdzi ich kodow
   *         (zakladka Diagnostyka). */
  /* Kody `cl` ponizej sa zweryfikowane WPROST na zywym DOM (wrzesien
   * 2026): kazdy filtr rzadkosci/typu w lewym panelu okna aukcji
   * (tip-id na elementach filtra) mapuje sie na inny numeryczny `data-cl`
   * na wynikowych przedmiotach. Dla "Bron" filtr rozbija sie na 8
   * podtypow, z ktorych trzy dziela literalna wartosc `data-cl="weapon"`
   * (siekiery/maczugi, halabardy/kije, miecze), jeden to luki/kusze
   * (`data-cl="4"`), jeden to kostury/rozdzki (`data-cl="magic"`), a
   * DWA POZOSTALE sa bronia do DRUGIEJ REKI: `data-cl="7"` (przedmioty
   * bez charakterystycznych slow w nazwie - kolejny filtr po
   * kosturach/rozdzkach, wiec to prawie na pewno Orb, magiczny
   * odpowiednik tarczy) i `data-cl="5"` (sztylety/pazury - Bron
   * pomocnicza, dual-wield). Osmy podtyp (`data-cl="29"`) to strzaly/
   * kolczan - LICZA SIE JAKO BRON (potwierdzone przez uzytkownika), wiec
   * naleza do kategorii "bron", NIE do wykluczonej zakladki "Inne". */
  const defaultCategories = [
    { id: 'bron', label: 'Broń', group: 'bronie', cl: ['weapon', '4', 'magic', '29'], kw: [
      'miecz', 'topor', 'topór', 'mlot', 'młot', 'sztylet', 'kostur',
      'rozdzka', 'różdżka', 'luk', 'łuk', 'kusza',
      'wlocznia', 'włócznia', 'kosa', 'bulawa', 'buława',
      'szpada', 'pika', 'laska', 'berlo', 'berło', 'ostrze', 'katana',
      'glewia', 'halabarda', 'maczuga', 'noz', 'nóż', 'palka',
      'pałka', 'cep', 'obuch', 'strzaly', 'strzały', 'strzala', 'strzała',
      'kolczan', 'kołczan'] },
    /* Orb (`cl:'7'`) i Bron pomocnicza (`cl:'5'`) to bron do drugiej
     * reki - kw ponizej to tylko awaryjny fallback, bo real nazwy
     * przedmiotow tych typow rzadko zawieraja te slowa wprost (dzieli
     * je od bron glownej wylacznie slot/cl, nie nazwa). */
    { id: 'orb', label: 'Orb', group: 'bronie', cl: ['7'], kw: [
      'orb', 'kula magiczna', 'sfera'] },
    { id: 'bron_pomocnicza', label: 'Broń pomocnicza', group: 'bronie', cl: ['5'], kw: [
      'bron pomocnicza', 'broń pomocnicza', 'sztylet pomocniczy'] },
    { id: 'pancerz', label: 'Pancerz', group: 'pancerz', cl: ['8'], kw: [
      'pancerz', 'zbroja', 'kolczuga', 'napiersnik', 'napierśnik',
      'kirys', 'szata', 'tunika', 'kaftan', 'plaszcz', 'płaszcz',
      'karacena', 'brygantyna', 'bluza', 'koszula', 'suknia', 'kubrak'] },
    { id: 'helm', label: 'Hełm', group: 'pancerz', cl: ['9'], kw: [
      'helm', 'hełm', 'kaptur', 'czapka', 'korona', 'diadem',
      'przylbica', 'przyłbica', 'kapelusz', 'opaska', 'maska',
      'czepiec', 'misiurka', 'szyszak'] },
    { id: 'buty', label: 'Buty', group: 'pancerz', cl: ['10'], kw: [
      'buty', 'trzewiki', 'sandaly', 'sandały', 'cizmy', 'ciżmy',
      'obuwie', 'kalosze', 'sabaty', 'nagolenniki', 'onuce', 'botki'] },
    { id: 'rekawice', label: 'Rękawice', group: 'pancerz', cl: ['11'], kw: [
      'rekawice', 'rękawice', 'rekawiczki', 'rękawiczki',
      'karwasze', 'nareczaki', 'naręczaki'] },
    { id: 'tarcza', label: 'Tarcza', group: 'pancerz', cl: ['14'], kw: [
      'tarcza', 'puklerz', 'pawez', 'pawęż'] },
    { id: 'pierscien', label: 'Pierścień', group: 'bizuteria', cl: ['12'], kw: [
      'pierscien', 'pierścien', 'pierścień', 'sygnet',
      'obraczka', 'obrączka'] },
    { id: 'naszyjnik', label: 'Naszyjnik', group: 'bizuteria', cl: ['13'], kw: [
      'naszyjnik', 'amulet', 'wisior', 'medalion', 'lancuch',
      'łańcuch'] },
    { id: 'inne', label: 'Inne', group: null, cl: [], kw: [] },
  ];

  /* Rzadkosci widoczne w domyslnych filtrach/tabeli. "Ulepszony" nie
   * istnieje jako osobna rzadkosc - data-item-type="t-uniupg" to zwykly
   * unikat (poprawka po weryfikacji z uzytkownikiem). Liczy sie
   * praktycznie tylko unikat i heroik, wiec tylko te dwa sa domyslnie
   * na liscie - zwykly/legenda nadal sa poprawnie rozpoznawane (patrz
   * MU.normalize), po prostu nie zasmiecaja domyslnego widoku tabeli. */
  const defaultRarities = [
    { id: 'unikat', label: 'Unikat', color: '#3fa34d' },
    { id: 'heroik', label: 'Heroik', color: '#4a90d9' },
  ];

  /* Rzadkosci wyboru CELU ulepszania ("Ulepszam rzadkosc" w pasku
   * filtrow) - swiadomie INNA lista niz defaultRarities powyzej.
   * defaultRarities to rzadkosci SKLADNIKOW (co warto kupic - unikat i
   * heroik), a to ponizej to rzadkosci przedmiotow, KTORE SIE FAKTYCZNIE
   * ULEPSZA (heroik i legenda) - unikatu jako celu nie ma sensu tu
   * pokazywac. Wzor na punkty z poswiecenia (MU.upgrade.basePoints) i tak
   * zawsze liczy sie z rzadkosci SAMEGO SKLADNIKA (unikat e=10, heroik
   * e=100) - rzadkosc celu wplywa TYLKO na bonus +200% za trafienie w te
   * sama rzadkosc co cel (patrz MU.upgrade.sacrificeYield), wiec
   * skladnik unikat/heroik feedowany w cel legenda i tak dostaje pelne,
   * poprawne punkty za wlasna rzadkosc - po prostu bez tego konkretnego
   * bonusu (bo unikat/heroik != legenda). */
  const defaultTargetRarities = [
    { id: 'heroik', label: 'Heroik', color: '#4a90d9' },
    { id: 'legenda', label: 'Legenda', color: '#c0562e' },
  ];

  /* Parametry statystyczne - sedno metodologii. */
  const defaultStats = {
    logSpace: true,        // licz w przestrzeni logarytmicznej (ceny sa log-normalne)
    madThreshold: 3.5,     // prog zmodyfikowanego Z-score (Iglewicz & Hoaglin)
    trimFraction: 0.10,    // klasyczna srednia ucinana 10/10 - do porownania
    halfLifeDays: 7,       // polokres wagi czasowej w EWMA
    retentionDays: 60,     // po ilu dniach obserwacja jest kasowana z bazy
    minSamples: 5,         // ponizej tego n wynik oznaczamy jako niepewny
    shrinkageK: 8,         // sila skurczu ku sredniej grupowej (empiryczny Bayes)
    /* Dodatek liczy sredni z AKTUALNIE WYSTAWIONYCH ofert (kup teraz) -
     * nie czeka na potwierdzona sprzedaz. Dlatego "ask" (biezaca oferta)
     * jest domyslnym, pelnoprawnym zrodlem ceny, na rowni ze sprzedaza. */
    askWeight: 1.0,        // waga biezacej oferty - glowne zrodlo danych
    ambiguousWeight: 0.6,  // waga zniknieca aukcji bez pewnosci sprzedazy
    saleWeight: 1.0,       // waga potwierdzonej sprzedazy (jesli kiedys zaobserwowana)
    includeAsks: true,     // wliczaj biezace oferty do ceny bazowej (domyslnie tak)
  };

  /* Domyslny "cel ulepszania" - rzadkosc/grupa przedmiotu, dla ktorego
   * szukamy najtanszych skladnikow. null = brak celu (widok bazowy,
   * bez bonusow za dopasowanie - patrz MU.upgrade.sacrificeYield). */
  const defaultTarget = { rarity: null, group: null };

  const defaults = {
    brackets: defaultBrackets,
    categories: defaultCategories,
    rarities: defaultRarities,
    targetRarities: defaultTargetRarities,
    stats: defaultStats,
    target: defaultTarget,
    collectDays: 14,       // deklarowane okno zbierania danych
    diagnostics: false,    // tryb podgladu surowych payloadow
    world: null,           // auto-wykryty swiat; dane trzymamy per swiat
  };

  function deepMerge(base, over) {
    if (over === null || over === undefined) return base;
    if (Array.isArray(base) || typeof base !== 'object' || base === null) return over;
    const out = Object.assign({}, base);
    for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
    return out;
  }

  let current = JSON.parse(JSON.stringify(defaults));

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) current = deepMerge(defaults, JSON.parse(raw));
    } catch (e) { /* brak dostepu do localStorage - zostaja domyslne */ }
    return current;
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(current)); } catch (e) {}
    return current;
  }

  function get() { return current; }

  function reset() {
    current = JSON.parse(JSON.stringify(defaults));
    save();
    return current;
  }

  /* Nazwa przedzialu dla danego poziomu przedmiotu. */
  function bracketOf(lvl, brackets) {
    const bs = brackets || current.brackets;
    const n = Number(lvl);
    if (!isFinite(n)) return null;
    for (const b of bs) if (n >= b[0] && n <= b[1]) return b[0] + '-' + b[1];
    return null;
  }

  function bracketOrder(name) {
    const lo = parseInt(String(name).split('-')[0], 10);
    return isFinite(lo) ? lo : 1e9;
  }

  function categoryById(id) {
    return current.categories.find(function (c) { return c.id === id; }) ||
           current.categories[current.categories.length - 1];
  }

  /* Szuka w obu listach (skladnikow i celow) - "legenda" np. jest tylko
   * w targetRarities, ale musi sie poprawnie wyswietlic (kolor/etykieta)
   * tam, gdzie wystepuje jako rzadkosc celu. Gdy id nie pasuje do zadnej
   * listy (np. "zwykly" - poprawnie rozpoznawany, ale nie na liscie
   * filtrow), budujemy neutralny wpis zamiast po cichu podstawiac
   * rarities[0] i myląco go etykietowac. */
  function rarityById(id) {
    const found = current.rarities.find(function (r) { return r.id === id; }) ||
      current.targetRarities.find(function (r) { return r.id === id; });
    if (found) return found;
    const label = id ? String(id).charAt(0).toUpperCase() + String(id).slice(1) : 'Nieznana';
    return { id: id || 'nieznana', label: label, color: '#7a7a7a' };
  }

  return {
    defaults: defaults, load: load, save: save, get: get, reset: reset,
    bracketOf: bracketOf, bracketOrder: bracketOrder,
    categoryById: categoryById, rarityById: rarityById,
    deepMerge: deepMerge, LS_KEY: LS_KEY,
  };
})();

/* ===== 02-util.js ===== */
/* ------------------------------------------------------------------ *
 * MU.util - drobiazgi wspoldzielone przez reszte modulow.
 * ------------------------------------------------------------------ */
MU.util = (function () {

  const DAY_MS = 86400000;

  /* Formatowanie zlota w konwencji KLIENTA GRY: 1 000 000 -> "1m", 25 000 -> "25k",
   * 2 000 000 000 -> "2g" (sufiks "g" potwierdzony przez uzytkownika - tak
   * zapisuje gra i gracze; wczesniej dodatek pisal "mld"). NIE potoczne "kk"
   * z czatu. Spojnosc z tym, co gracz widzi na aukcji, jest wazniejsza niz
   * slangowa konwencja. Parser (MU.normalize.parseGoldText) przyjmuje oba. */
  function gold(n) {
    if (n === null || n === undefined || !isFinite(n)) return '-';
    const neg = n < 0;
    const a = Math.abs(n);
    let s;
    if (a >= 1e9) s = round(a / 1e9, 2) + 'g';
    else if (a >= 1e6) s = round(a / 1e6, 2) + 'm';
    else if (a >= 1e3) s = round(a / 1e3, 1) + 'k';
    else s = String(Math.round(a));
    return (neg ? '-' : '') + s;
  }

  function round(n, d) {
    const f = Math.pow(10, d || 0);
    return Math.round(n * f) / f;
  }

  function pct(x, d) {
    if (!isFinite(x)) return '-';
    return (x >= 0 ? '+' : '') + round(x * 100, d === undefined ? 1 : d) + '%';
  }

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(
      /[&<>"']/g,
      function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      }
    );
  }

  /* Deterministyczny PRNG - bootstrap ma dawac ten sam wynik przy tych
   * samych danych, inaczej liczby skacza przy kazdym przerysowaniu tabeli. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    let h = 2166136261 >>> 0;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* Normalizacja nazwy przedmiotu do klucza grupujacego:
   * usuwa sufiks ulepszenia (+3), liczbe sztuk, ogonki i wielkosc liter. */
  function normName(name) {
    return String(name || '')
      .replace(/\s*\+\s*\d+\s*$/, '')
      .replace(/\s*\(\d+\)\s*$/, '')
      .toLowerCase()
      .replace(/[ą]/g, 'a').replace(/[ć]/g, 'c').replace(/[ę]/g, 'e')
      .replace(/[ł]/g, 'l').replace(/[ń]/g, 'n').replace(/[ó]/g, 'o')
      .replace(/[ś]/g, 's').replace(/[źż]/g, 'z')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Wyciaga poziom ulepszenia z nazwy ("Miecz +3" -> 3). */
  function upgradeFromName(name) {
    const m = /\+\s*(\d+)\s*$/.exec(String(name || '').trim());
    return m ? parseInt(m[1], 10) : 0;
  }

  function daysBetween(a, b) { return (b - a) / DAY_MS; }

  /* Czas wzgledny "X temu" - do pokazania, jak swiezo widziana byla dana
   * oferta (np. w zakladce Przedmioty, przy filtrze "widziane ostatnio"). */
  function ago(ts, now) {
    if (!isFinite(ts)) return '-';
    const ms = Math.max(0, (now || Date.now()) - ts);
    const min = ms / 60000;
    if (min < 1) return 'przed chwila';
    if (min < 60) return Math.round(min) + 'min temu';
    const h = min / 60;
    if (h < 24) return Math.round(h) + 'g temu';
    return Math.round(h / 24) + 'd temu';
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* Bezpieczne, plytkie przeszukiwanie obiektu w poszukiwaniu tablic
   * obiektow - uzywane przez sniffer do znalezienia listy aukcji
   * w nieznanej strukturze odpowiedzi. */
  function findArraysOfObjects(root, maxDepth) {
    const out = [];
    const seen = new Set();
    (function walk(node, depth, path) {
      if (!node || typeof node !== 'object' || depth > (maxDepth || 5)) return;
      if (seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        if (node.length && node.every(function (x) { return x && typeof x === 'object' && !Array.isArray(x); })) {
          out.push({ path: path, rows: node });
        }
        for (let i = 0; i < Math.min(node.length, 20); i++) walk(node[i], depth + 1, path + '[' + i + ']');
        return;
      }
      const keys = Object.keys(node);
      /* Obiekt-mapa id -> rekord tez traktujemy jak liste. */
      if (keys.length > 1 && keys.every(function (k) { return /^\d+$/.test(k); })) {
        const rows = keys.map(function (k) {
          const v = node[k];
          return (v && typeof v === 'object') ? Object.assign({ _key: k }, v) : null;
        }).filter(Boolean);
        if (rows.length) out.push({ path: path, rows: rows });
      }
      for (const k of keys) walk(node[k], depth + 1, path ? path + '.' + k : k);
    })(root, 0, '');
    return out;
  }

  function tryJson(text) {
    if (typeof text !== 'string') return null;
    const t = text.trim();
    if (!t || (t[0] !== '{' && t[0] !== '[')) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  return {
    DAY_MS: DAY_MS, gold: gold, round: round, pct: pct, clamp: clamp,
    escapeHtml: escapeHtml, mulberry32: mulberry32, hashString: hashString,
    normName: normName, upgradeFromName: upgradeFromName,
    daysBetween: daysBetween, debounce: debounce, ago: ago,
    findArraysOfObjects: findArraysOfObjects, tryJson: tryJson,
  };
})();

/* ===== 03-stats.js ===== */
/* ------------------------------------------------------------------ *
 * MU.stats - odporne statystyki cenowe.
 *
 * Zalozenia metodologiczne (uzasadnienie w METODOLOGIA.md):
 *  1. Ceny sa log-normalne, nie normalne. Rozrzut 1kk wokol ceny 2kk to
 *     co innego niz 1kk wokol 200kk. Dlatego wszystko liczymy na
 *     logarytmach i wracamy przez exp() - srednia staje sie geometryczna.
 *  2. Zanieczyszczenie danych jest ASYMETRYCZNE (pranie zlota, aukcje
 *     miedzy znajomymi, wyprzedaze). Symetryczne ucinanie 10/10 albo
 *     tnie za malo, albo wyrzuca dobre dane. Filtr MAD dopasowuje sie
 *     do faktycznego rozrzutu.
 *  3. Jedna srednia z 14 dni gubi trend. Wagi wykladnicze (EWMA)
 *     + odporny trend Theila-Sena pokazuja, gdzie cena idzie.
 * ------------------------------------------------------------------ */
MU.stats = (function () {

  const U = MU.util;

  /* --- podstawy ---------------------------------------------------- */

  function quantileSorted(sorted, q) {
    const n = sorted.length;
    if (!n) return NaN;
    if (n === 1) return sorted[0];
    const pos = (n - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function median(values) {
    if (!values.length) return NaN;
    return quantileSorted(values.slice().sort(function (a, b) { return a - b; }), 0.5);
  }

  /* Kwantyl wazony - potrzebny, bo obserwacje maja rozne wagi
   * (swiezosc + pewnosc, ze doszlo do sprzedazy). */
  function weightedQuantile(pairs, q) {
    if (!pairs.length) return NaN;
    const arr = pairs.slice().sort(function (a, b) { return a.v - b.v; });
    const total = arr.reduce(function (s, p) { return s + p.w; }, 0);
    if (total <= 0) return NaN;
    const target = q * total;
    let cum = 0;
    for (let i = 0; i < arr.length; i++) {
      const prev = cum;
      cum += arr[i].w;
      if (cum >= target) {
        if (i === 0 || cum === prev) return arr[i].v;
        const frac = (target - prev) / (cum - prev);
        const lo = arr[i - 1] ? arr[i - 1].v : arr[i].v;
        return lo + (arr[i].v - lo) * frac;
      }
    }
    return arr[arr.length - 1].v;
  }

  function weightedMean(pairs) {
    let sw = 0, sv = 0;
    for (const p of pairs) { sw += p.w; sv += p.w * p.v; }
    return sw > 0 ? sv / sw : NaN;
  }

  /* Znormalizowane MAD - odporny odpowiednik odchylenia standardowego.
   * Stala 1.4826 sprawia, ze dla rozkladu normalnego MADn ~= sigma. */
  function madn(values, med) {
    if (!values.length) return 0;
    const m = med === undefined ? median(values) : med;
    const dev = values.map(function (v) { return Math.abs(v - m); });
    return 1.4826 * median(dev);
  }

  /* --- odsiewanie anomalii ----------------------------------------- */

  /* Filtr MAD (zmodyfikowany Z-score, Iglewicz & Hoaglin 1993).
   * Zwraca maske: true = obserwacja zostaje.
   * Gdy MAD wychodzi 0 (wiele identycznych cen - typowe dla przedmiotow
   * z ustabilizowana cena), przechodzimy na plotki Tukeya na IQR,
   * bo inaczej kazde odchylenie od mediany bylo by odrzucone. */
  function madMask(values, threshold) {
    const n = values.length;
    if (n < 4) return values.map(function () { return true; });
    const med = median(values);
    const s = madn(values, med);
    if (s > 0) {
      /* Zmodyfikowany Z-score = 0.6745*(x-med)/MAD. Poniewaz s = 1.4826*MAD,
       * a 1/1.4826 = 0.6745, redukuje sie to do (x-med)/s. */
      return values.map(function (v) { return Math.abs((v - med) / s) <= threshold; });
    }
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const q1 = quantileSorted(sorted, 0.25), q3 = quantileSorted(sorted, 0.75);
    const iqr = q3 - q1;
    if (iqr <= 0) return values.map(function () { return true; });
    const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
    return values.map(function (v) { return v >= lo && v <= hi; });
  }

  /* Klasyczna srednia ucinana p/p - Twoja pierwotna metoda.
   * Zostaje w kodzie jako kolumna porownawcza, zeby bylo widac,
   * kiedy metody sie rozjezdzaja (czyli kiedy dane sa podejrzane). */
  function trimmedMean(values, frac) {
    const n = values.length;
    if (!n) return NaN;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const k = Math.floor(n * frac);
    const kept = (n - 2 * k) > 0 ? sorted.slice(k, n - k) : sorted;
    return kept.reduce(function (a, b) { return a + b; }, 0) / kept.length;
  }

  /* --- waga czasowa ------------------------------------------------- */

  /* Waga wykladnicza: obserwacja sprzed jednego polokresu wazy 0.5.
   * Miekkie starzenie zamiast twardego okna N dni - cena sprzed 15 dni
   * nadal cos mowi, tylko mniej niz wczorajsza. */
  function timeWeight(ageDays, halfLifeDays) {
    if (!(halfLifeDays > 0)) return 1;
    return Math.pow(0.5, ageDays / halfLifeDays);
  }

  /* --- trend --------------------------------------------------------- */

  /* Nachylenie Theila-Sena: mediana nachylen wszystkich par punktow.
   * Odporne na wartosci odstajace, w przeciwienstwie do regresji MNK.
   * Przy duzym n losujemy pary deterministycznie, zeby nie robic O(n^2). */
  function theilSen(points, seed) {
    const n = points.length;
    if (n < 3) return 0;
    const slopes = [];
    if (n <= 60) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = points[j].x - points[i].x;
          if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx);
        }
      }
    } else {
      const rnd = U.mulberry32(seed || 12345);
      for (let k = 0; k < 2000; k++) {
        const i = Math.floor(rnd() * n), j = Math.floor(rnd() * n);
        if (i === j) continue;
        const dx = points[j].x - points[i].x;
        if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx);
      }
    }
    return slopes.length ? median(slopes) : 0;
  }

  /* --- glowne podsumowanie ------------------------------------------ */

  /* obs: [{ price, ts, weight }]  (weight = pewnosc, ze to faktyczna sprzedaz)
   * Zwraca komplet miar + diagnostyke odrzuconych rekordow. */
  function summarize(obs, opts) {
    const o = opts || {};
    const halfLife = o.halfLifeDays === undefined ? 7 : o.halfLifeDays;
    const thr = o.madThreshold === undefined ? 3.5 : o.madThreshold;
    const trimFrac = o.trimFraction === undefined ? 0.10 : o.trimFraction;
    const now = o.now === undefined ? Date.now() : o.now;
    const logSpace = o.logSpace !== false;

    const clean = (obs || []).filter(function (x) {
      return x && isFinite(x.price) && x.price > 0 && isFinite(x.ts);
    });

    const empty = {
      n: 0, nRaw: (obs || []).length, nDropped: 0, effN: 0,
      median: NaN, mean: NaN, p25: NaN, p75: NaN,
      trimmedMean: NaN, volatility: NaN, trendPerWeek: NaN,
      confidence: 0, dropped: [], kept: [],
    };
    if (!clean.length) return empty;

    const tx = logSpace
      ? function (p) { return Math.log(p); }
      : function (p) { return p; };
    const inv = logSpace
      ? function (v) { return Math.exp(v); }
      : function (v) { return v; };

    const vals = clean.map(function (x) { return tx(x.price); });
    const mask = madMask(vals, thr);

    const kept = [], dropped = [];
    for (let i = 0; i < clean.length; i++) {
      (mask[i] ? kept : dropped).push(clean[i]);
    }
    /* Zabezpieczenie: filtr nie moze zjesc calego zbioru. */
    const use = kept.length >= Math.max(3, Math.ceil(clean.length * 0.4)) ? kept : clean;

    const pairs = use.map(function (x) {
      const age = Math.max(0, (now - x.ts) / U.DAY_MS);
      const w = (x.weight === undefined ? 1 : x.weight) * timeWeight(age, halfLife);
      return { v: tx(x.price), w: w, ts: x.ts, price: x.price };
    }).filter(function (p) { return p.w > 1e-9; });

    if (!pairs.length) return Object.assign({}, empty, { nRaw: clean.length });

    const medV = weightedQuantile(pairs, 0.5);
    const meanV = weightedMean(pairs);
    const p25V = weightedQuantile(pairs, 0.25);
    const p75V = weightedQuantile(pairs, 0.75);

    /* Efektywna liczba obserwacji (Kish) - n=30 gdzie 29 rekordow jest
     * przestarzalych to faktycznie n bliskie 1. */
    let sw = 0, sw2 = 0;
    for (const p of pairs) { sw += p.w; sw2 += p.w * p.w; }
    const effN = sw2 > 0 ? (sw * sw) / sw2 : 0;

    /* Zmiennosc: MADn na logach ~= wzgledne odchylenie standardowe.
     * 0.30 czytamy jako "typowe odchylenie okolo +/-30% od mediany". */
    const vol = logSpace
      ? madn(pairs.map(function (p) { return p.v; }))
      : madn(pairs.map(function (p) { return p.v; })) / Math.abs(meanV || 1);

    /* Trend: nachylenie log(ceny) po czasie -> zmiana procentowa na tydzien. */
    const pts = pairs.map(function (p) {
      return { x: (p.ts - now) / U.DAY_MS, y: logSpace ? p.v : Math.log(Math.max(1, p.price)) };
    });
    const slopePerDay = theilSen(pts, 42);
    const trendPerWeek = Math.exp(slopePerDay * 7) - 1;

    /* Pewnosc wyniku: rosnie z efektywnym n, spada przy duzej zmiennosci
     * i przy duzym odsetku odrzuconych rekordow. */
    const minN = o.minSamples || 5;
    const nScore = U.clamp(Math.sqrt(effN / minN), 0, 1);
    const volScore = U.clamp(1 - (vol / 0.9), 0.15, 1);
    const dropRate = dropped.length / clean.length;
    const dropScore = U.clamp(1 - dropRate * 1.5, 0.3, 1);
    const confidence = U.clamp(nScore * volScore * dropScore, 0, 1);

    return {
      n: use.length,
      nRaw: clean.length,
      nDropped: dropped.length,
      effN: U.round(effN, 2),
      median: inv(medV),
      mean: inv(meanV),
      p25: inv(p25V),
      p75: inv(p75V),
      trimmedMean: trimmedMean(clean.map(function (x) { return x.price; }), trimFrac),
      volatility: vol,
      trendPerWeek: trendPerWeek,
      confidence: confidence,
      dropped: dropped,
      kept: use,
    };
  }

  /* Skurcz empiryczno-bayesowski ku estymacie grupowej.
   * Przy 2 obserwacjach konkretnego przedmiotu nie wierzymy im na slowo -
   * ciagniemy wynik w strone sredniej dla kategorii i przedzialu lvl.
   * k = ile obserwacji "warta" jest wiedza grupowa. */
  function shrink(sampleValue, sampleN, groupValue, k) {
    if (!isFinite(groupValue)) return sampleValue;
    if (!isFinite(sampleValue)) return groupValue;
    const kk = k === undefined ? 8 : k;
    const w = sampleN / (sampleN + kk);
    /* Skurcz w przestrzeni logarytmicznej - inaczej mala probka o cenie
     * 100x wyzszej od grupy przeciagnelaby wynik zbyt mocno. */
    if (sampleValue > 0 && groupValue > 0) {
      return Math.exp(w * Math.log(sampleValue) + (1 - w) * Math.log(groupValue));
    }
    return w * sampleValue + (1 - w) * groupValue;
  }

  /* Bootstrap: losujemy ceny kupna i sprzedazy z empirycznych rozkladow
   * i sprawdzamy, jak czesto operacja wychodzi na plus. Deterministyczny
   * seed, zeby wynik nie migotal przy kazdym przerysowaniu. */
  function profitProbability(buySamples, sellSamples, cost, feePct, iters, seed) {
    if (!buySamples.length || !sellSamples.length) return NaN;
    const rnd = U.mulberry32(seed || 7);
    const it = iters || 400;
    let wins = 0;
    for (let i = 0; i < it; i++) {
      const b = buySamples[Math.floor(rnd() * buySamples.length)];
      const s = sellSamples[Math.floor(rnd() * sellSamples.length)];
      if (s * (1 - (feePct || 0)) - b - cost > 0) wins++;
    }
    return wins / it;
  }

  return {
    quantileSorted: quantileSorted, median: median, madn: madn,
    weightedQuantile: weightedQuantile, weightedMean: weightedMean,
    madMask: madMask, trimmedMean: trimmedMean, timeWeight: timeWeight,
    theilSen: theilSen, summarize: summarize, shrink: shrink,
    profitProbability: profitProbability,
  };
})();

/* ===== 04-storage.js ===== */
/* ------------------------------------------------------------------ *
 * MU.store - trwale skladowanie obserwacji.
 *
 * IndexedDB, bo zbieranie przez 2-8 tygodni to spokojnie kilkadziesiat
 * tysiecy rekordow - localStorage (limit ~5 MB, zapis synchroniczny)
 * by tego nie udzwignal i zablokowalby watek gry. localStorage zostaje
 * jako awaryjny fallback z twardym limitem rekordow.
 *
 * Dwa magazyny:
 *   obs  - zamkniete obserwacje cenowe (to, z czego liczymy statystyki)
 *   live - aukcje aktualnie widoczne, sledzone miedzy migawkami po to,
 *          by odroznic FAKTYCZNA SPRZEDAZ od wygasniecia oferty
 * ------------------------------------------------------------------ */
MU.store = (function () {

  const DB_NAME = 'MU_ulepy';
  /* v2: dodaje indeks "scope" do object store "live". Zmierzone (throwaway
   * IndexedDB, ten sam kod cursor.openCursor()): pelny skan "live" bez
   * indeksu to 10.9ms/300 wpisow, 57ms/2000, 192ms/8000, 506ms/20000 -
   * rosnie mniej-wiecej liniowo z CALKOWITA liczba kiedykolwiek sledzonych
   * ofert (wszystkie kategorie/filtry razem), a dodatek jest pomyslany na
   * tygodnie zbierania. To byl realny wasski gardlo, WIEKSZY niz parsowanie
   * DOM: getLive() czytal caly store na KAZDYM skanie (co 8s), niezaleznie
   * od tego, ze pojedynczy skan dotyczy tylko JEDNEGO filtra/scope. Indeks
   * "scope" pozwala czytac (i pozniej przegladac w MU.lifecycle) tylko
   * wpisy z biezacego zakresu - patrz getLiveByScope. */
  const DB_VER = 2;
  const LS_OBS = 'MU_OBS_FALLBACK_v1';
  const LS_LIVE = 'MU_LIVE_FALLBACK_v1';
  const LS_MAX = 4000;

  let db = null;
  let mode = 'none';

  function init() {
    return new Promise(function (resolve) {
      if (db) return resolve(mode);
      let idb = null;
      try { idb = window.indexedDB; } catch (e) { idb = null; }
      if (!idb) { mode = 'localStorage'; return resolve(mode); }

      let req;
      try { req = idb.open(DB_NAME, DB_VER); }
      catch (e) { mode = 'localStorage'; return resolve(mode); }

      req.onupgradeneeded = function (ev) {
        const d = ev.target.result;
        const t = ev.target.transaction;
        if (!d.objectStoreNames.contains('obs')) {
          const s = d.createObjectStore('obs', { keyPath: 'oid', autoIncrement: true });
          s.createIndex('ts', 'ts');
          s.createIndex('gkey', 'gkey');
        }
        /* "live" moze juz istniec z wersji 1 - createIndex na istniejacym
         * store w trakcie onupgradeneeded automatycznie zaindeksuje
         * wszystkie juz zapisane rekordy, wiec update jest bezstratny. */
        const liveStore = d.objectStoreNames.contains('live')
          ? t.objectStore('live')
          : d.createObjectStore('live', { keyPath: 'aid' });
        if (!liveStore.indexNames.contains('scope')) {
          liveStore.createIndex('scope', 'scope');
        }
        if (!d.objectStoreNames.contains('meta')) {
          d.createObjectStore('meta', { keyPath: 'k' });
        }
      };
      req.onsuccess = function (ev) { db = ev.target.result; mode = 'indexedDB'; resolve(mode); };
      req.onerror = function () { mode = 'localStorage'; resolve(mode); };
      /* Gdy uzytkownik ma zablokowane IDB, onerror czasem nie przychodzi. */
      setTimeout(function () { if (!db && mode === 'none') { mode = 'localStorage'; resolve(mode); } }, 3000);
    });
  }

  function tx(storeName, rw) {
    return db.transaction(storeName, rw ? 'readwrite' : 'readonly').objectStore(storeName);
  }

  function lsRead(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  }
  function lsWrite(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr.slice(-LS_MAX))); } catch (e) {}
  }

  /* --- obserwacje --------------------------------------------------- */

  function addObservations(list) {
    if (!list || !list.length) return Promise.resolve(0);
    if (mode === 'indexedDB') {
      return new Promise(function (resolve, reject) {
        const t = db.transaction('obs', 'readwrite');
        const s = t.objectStore('obs');
        for (const o of list) s.add(o);
        t.oncomplete = function () { resolve(list.length); };
        t.onerror = function () { reject(t.error); };
      });
    }
    const cur = lsRead(LS_OBS);
    lsWrite(LS_OBS, cur.concat(list));
    return Promise.resolve(list.length);
  }

  /* getAll() zamiast cursor.continue() - zmierzone (throwaway IndexedDB,
   * te sama dana): przy 20000 rekordow bulk getAll() jest ~5-8x szybszy
   * niz petla po kursorze (kazdy .continue() to osobny callback JS,
   * getAll() czyta caly zakres jednym wywolaniem silnika przegladarki).
   * Fallback na cursor tylko gdyby getAll nie bylo dostepne (bardzo stare
   * silniki) - w praktyce nie powinien sie nigdy uruchomic. */
  function allObservations(sinceTs) {
    const min = sinceTs || 0;
    if (mode === 'indexedDB') {
      return new Promise(function (resolve, reject) {
        const idx = tx('obs').index('ts');
        const range = IDBKeyRange.lowerBound(min);
        if (typeof idx.getAll !== 'function') {
          const out = [];
          const req = idx.openCursor(range);
          req.onsuccess = function (ev) {
            const c = ev.target.result;
            if (c) { out.push(c.value); c.continue(); } else resolve(out);
          };
          req.onerror = function () { reject(req.error); };
          return;
        }
        const req = idx.getAll(range);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return Promise.resolve(lsRead(LS_OBS).filter(function (o) { return o.ts >= min; }));
  }

  function purgeOld(days) {
    const cutoff = Date.now() - days * MU.util.DAY_MS;
    if (mode === 'indexedDB') {
      return new Promise(function (resolve) {
        let removed = 0;
        const t = db.transaction('obs', 'readwrite');
        const req = t.objectStore('obs').index('ts').openCursor(IDBKeyRange.upperBound(cutoff));
        req.onsuccess = function (ev) {
          const c = ev.target.result;
          if (c) { c.delete(); removed++; c.continue(); }
        };
        t.oncomplete = function () { resolve(removed); };
        t.onerror = function () { resolve(removed); };
      });
    }
    const cur = lsRead(LS_OBS);
    const kept = cur.filter(function (o) { return o.ts >= cutoff; });
    lsWrite(LS_OBS, kept);
    return Promise.resolve(cur.length - kept.length);
  }

  function clearObservations() {
    if (mode === 'indexedDB') {
      return new Promise(function (resolve) {
        const t = db.transaction('obs', 'readwrite');
        t.objectStore('obs').clear();
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { resolve(false); };
      });
    }
    lsWrite(LS_OBS, []);
    return Promise.resolve(true);
  }

  /* Czysci baze "live" (sledzone/juz-widziane aukcje). Bez tego stary
   * "live" z poprzedniej wersji dodatku (lub sprzed zmiany konfiguracji)
   * potrafi zablokowac zapis nowych obserwacji: przedmiot o tym samym
   * aid jest juz "znany", wiec sniffer aktualizuje go po cichu zamiast
   * zapisac jako nowa oferte. "Wyczysc wszystko" musi kasowac OBIE bazy. */
  function clearLive() {
    if (mode === 'indexedDB') {
      return new Promise(function (resolve) {
        const t = db.transaction('live', 'readwrite');
        t.objectStore('live').clear();
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { resolve(false); };
      });
    }
    lsWrite(LS_LIVE, []);
    return Promise.resolve(true);
  }

  function clearAll() {
    return Promise.all([clearObservations(), clearLive()]).then(function () { return true; });
  }

  /* --- sledzone aukcje ---------------------------------------------- */

  function getLive() {
    if (mode === 'indexedDB') {
      return new Promise(function (resolve) {
        const store = tx('live');
        if (typeof store.getAll !== 'function') {
          const out = {};
          const req = store.openCursor();
          req.onsuccess = function (ev) {
            const c = ev.target.result;
            if (c) { out[c.value.aid] = c.value; c.continue(); } else resolve(out);
          };
          req.onerror = function () { resolve(out); };
          return;
        }
        const req = store.getAll();
        req.onsuccess = function () {
          const out = {};
          for (const v of req.result) out[v.aid] = v;
          resolve(out);
        };
        req.onerror = function () { resolve({}); };
      });
    }
    const arr = lsRead(LS_LIVE), out = {};
    for (const r of arr) out[r.aid] = r;
    return Promise.resolve(out);
  }

  /* Jak getLive(), ale czyta TYLKO wpisy danego zakresu (scope) przez
   * indeks - patrz komentarz przy DB_VER. MU.lifecycle wywoluje to przy
   * kazdym skanie DOM, wiec ma to najwiekszy wplyw na wydajnosc:
   * O(wpisy w tym zakresie), a nie O(wszystkie kiedykolwiek sledzone
   * oferty ze wszystkich kategorii/filtrow razem). getAll() na indeksie
   * zamiast petli po kursorze - zmierzone, druga (obok samego indeksu)
   * najwieksza wygrana wydajnosciowa, patrz notatka w komentarzu przy
   * DB_VER. Tryb localStorage nie ma indeksow, ale jest i tak twardo
   * ograniczony do LS_MAX rekordow, wiec zwykly skan tablicy jest tam
   * wystarczajaco tani. */
  function getLiveByScope(scope) {
    if (mode === 'indexedDB') {
      return new Promise(function (resolve) {
        let idx;
        try { idx = tx('live').index('scope'); }
        catch (e) { return getLive().then(resolve); } // baza sprzed indeksu (brak upgrade) - fallback
        const range = IDBKeyRange.only(scope);
        if (typeof idx.getAll !== 'function') {
          const out = {};
          const req = idx.openCursor(range);
          req.onsuccess = function (ev) {
            const c = ev.target.result;
            if (c) { out[c.value.aid] = c.value; c.continue(); } else resolve(out);
          };
          req.onerror = function () { resolve(out); };
          return;
        }
        const req = idx.getAll(range);
        req.onsuccess = function () {
          const out = {};
          for (const v of req.result) out[v.aid] = v;
          resolve(out);
        };
        req.onerror = function () { resolve({}); };
      });
    }
    const arr = lsRead(LS_LIVE), out = {};
    for (const r of arr) if (r.scope === scope) out[r.aid] = r;
    return Promise.resolve(out);
  }

  function putLive(records) {
    if (!records || !records.length) return Promise.resolve(0);
    if (mode === 'indexedDB') {
      return new Promise(function (resolve) {
        const t = db.transaction('live', 'readwrite');
        const s = t.objectStore('live');
        for (const r of records) s.put(r);
        t.oncomplete = function () { resolve(records.length); };
        t.onerror = function () { resolve(0); };
      });
    }
    const map = {};
    for (const r of lsRead(LS_LIVE)) map[r.aid] = r;
    for (const r of records) map[r.aid] = r;
    lsWrite(LS_LIVE, Object.keys(map).map(function (k) { return map[k]; }));
    return Promise.resolve(records.length);
  }

  function deleteLive(ids) {
    if (!ids || !ids.length) return Promise.resolve(0);
    if (mode === 'indexedDB') {
      return new Promise(function (resolve) {
        const t = db.transaction('live', 'readwrite');
        const s = t.objectStore('live');
        for (const id of ids) s.delete(id);
        t.oncomplete = function () { resolve(ids.length); };
        t.onerror = function () { resolve(0); };
      });
    }
    const drop = new Set(ids);
    lsWrite(LS_LIVE, lsRead(LS_LIVE).filter(function (r) { return !drop.has(r.aid); }));
    return Promise.resolve(ids.length);
  }

  /* --- meta / eksport ------------------------------------------------ */

  function setMeta(k, v) {
    if (mode === 'indexedDB') {
      return new Promise(function (resolve) {
        const t = db.transaction('meta', 'readwrite');
        t.objectStore('meta').put({ k: k, v: v });
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { resolve(false); };
      });
    }
    try { localStorage.setItem('MU_META_' + k, JSON.stringify(v)); } catch (e) {}
    return Promise.resolve(true);
  }

  function getMeta(k) {
    if (mode === 'indexedDB') {
      return new Promise(function (resolve) {
        const req = tx('meta').get(k);
        req.onsuccess = function () { resolve(req.result ? req.result.v : null); };
        req.onerror = function () { resolve(null); };
      });
    }
    try { return Promise.resolve(JSON.parse(localStorage.getItem('MU_META_' + k))); }
    catch (e) { return Promise.resolve(null); }
  }

  function exportAll() {
    return Promise.all([allObservations(0), getLive()]).then(function (r) {
      return {
        version: MU.version,
        exportedAt: Date.now(),
        config: MU.cfg.get(),
        observations: r[0],
        live: r[1],
      };
    });
  }

  function importAll(payload, replace) {
    const obs = (payload && payload.observations) || [];
    const p = replace ? clearObservations() : Promise.resolve();
    return p.then(function () {
      /* oid jest kluczem autoinkrementowanym - przy imporcie musi zniknac,
       * inaczej kolidowalby z istniejacymi rekordami. */
      const clean = obs.map(function (o) {
        const c = Object.assign({}, o);
        delete c.oid;
        return c;
      });
      return addObservations(clean);
    });
  }

  return {
    init: init,
    get mode() { return mode; },
    addObservations: addObservations,
    allObservations: allObservations,
    purgeOld: purgeOld,
    clearObservations: clearObservations, clearLive: clearLive, clearAll: clearAll,
    getLive: getLive, getLiveByScope: getLiveByScope, putLive: putLive, deleteLive: deleteLive,
    setMeta: setMeta, getMeta: getMeta,
    exportAll: exportAll, importAll: importAll,
  };
})();

/* ===== 05-normalize.js ===== */
/* ------------------------------------------------------------------ *
 * MU.normalize - surowy rekord z klienta -> znormalizowana obserwacja.
 *
 * Dlaczego heurystyki, a nie sztywne nazwy pol:
 * dom aukcyjny Margonem nie ma udokumentowanego publicznego API, a stary
 * (SI) i nowy (NI) klient roznia sie struktura odpowiedzi; format bywa
 * tez zmieniany przy aktualizacjach gry. Sztywne `row.price` zepsuloby
 * sie przy pierwszej zmianie. Dlatego rozpoznajemy pola po wzorcach nazw
 * i typach wartosci, a tryb diagnostyczny pozwala podejrzec, co dodatek
 * faktycznie zobaczyl, i poprawic mapowanie recznie.
 * ------------------------------------------------------------------ */
MU.normalize = (function () {

  const U = MU.util;

  /* Wzorce nazw pol. Kolejnosc ma znaczenie - pierwsze trafienie wygrywa. */
  const PAT = {
    id:      [/^(a?id|auction_?id|aukcja_?id|nr)$/i, /auction.*id/i, /^_key$/],
    name:    [/^(name|nazwa|item_?name|itemname|tytul|title)$/i, /name$/i, /nazwa/i],
    buyout:  [/^(buyout|kup_?teraz|kupteraz|buy_?now|instant|price_?now)$/i, /buyout/i, /kupteraz/i],
    bid:     [/^(bid|bet|cena|price|current_?price|kwota|stawka|gold|zloto|value)$/i, /price/i, /cena/i, /gold/i],
    lvl:     [/^(lvl|level|poziom|req_?lvl|reqlvl|item_?lvl)$/i, /lvl/i, /level/i, /poziom/i],
    endTs:   [/^(end|end_?time|endts|koniec|expires?|expire_?at|do_?konca)$/i, /end/i, /expire/i, /koniec/i],
    seller:  [/^(seller|sprzedajacy|owner|wlasciciel|nick|char|postac)$/i, /seller/i, /owner/i],
    stat:    [/^(stat|stats|statystyki|props|properties)$/i],
    cl:      [/^(cl|class|klasa|type|typ|item_?type)$/i],
    upgrade: [/^(upgrade|ulepszenie|ulep|plus|enhance|enh|level_?up)$/i],
    icon:    [/^(icon|ikona|img|image|gfx)$/i],
    qty:     [/^(qty|ilosc|count|amount|stack)$/i],
  };

  function pickField(row, patterns, predicate) {
    const keys = Object.keys(row);
    for (const pat of patterns) {
      for (const k of keys) {
        if (!pat.test(k)) continue;
        const v = row[k];
        if (predicate && !predicate(v)) continue;
        return { key: k, value: v };
      }
    }
    return null;
  }

  const isNumish = function (v) {
    if (typeof v === 'number') return isFinite(v);
    return typeof v === 'string' && /^\d[\d\s.,]*$/.test(v.trim());
  };
  const isStr = function (v) { return typeof v === 'string' && v.trim().length > 0; };

  function toNum(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    const n = parseFloat(v.replace(/[\s ]/g, '').replace(',', '.'));
    return isFinite(n) ? n : NaN;
  }

  /* Margonem opisuje statystyki przedmiotu lancuchem "klucz=wartosc"
   * rozdzielonym srednikami. Jesli takie pole jest w rekordzie,
   * jest bogatszym zrodlem niz sama nazwa. */
  function parseStatString(s) {
    const out = {};
    if (typeof s !== 'string') return out;
    for (const part of s.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
      else if (part.trim()) out[part.trim().toLowerCase()] = true;
    }
    return out;
  }

  const RARITY_ALIASES = {
    zwykly: 'zwykly', common: 'zwykly', pospolity: 'zwykly', normal: 'zwykly',
    unikat: 'unikat', unique: 'unikat', unikatowy: 'unikat', unikatowe: 'unikat',
    ulepszony: 'unikat', upgraded: 'unikat',
    heroik: 'heroik', heroic: 'heroik', heroiczny: 'heroik', heroiczne: 'heroik',
    legenda: 'legenda', legendary: 'legenda', legendarny: 'legenda',
  };

  /* Kod rzadkosci z atrybutu data-item-type w oknie aukcji (potwierdzone
   * podgladem zywego DOM). POPRAWKA: "t-uniupg" to zwykly unikat - moje
   * wczesniejsze zalozenie, ze to osobna rzadkosc "Ulepszony" z odrebnym
   * wzorem kosztu, bylo bledne (skorygowane wprost przez uzytkownika,
   * ktory zna mechanike gry). Kazdy przedmiot unikatowy zaobserwowany na
   * zywo mial ten kod, nigdy plain "t-uni" - to prawdopodobnie po prostu
   * pelna nazwa wewnetrznego typu ("unique upgradeable" czy podobnie),
   * nie osobna rzadkosc. "legenda" nie wystapila w filtrze aukcji -
   * zostaje w konfiguracji na wszelki wypadek. */
  const ITEM_TYPE_RARITY = {
    't-norm': 'zwykly', 't-common': 'zwykly', 't-pospolity': 'zwykly',
    't-uni': 'unikat', 't-unique': 'unikat', 't-uniupg': 'unikat',
    't-her': 'heroik', 't-heroic': 'heroik',
    't-leg': 'legenda', 't-legend': 'legenda', 't-legendary': 'legenda',
  };

  function detectRarity(row, stat, name) {
    const itemType = row.itemType || row.item_type || row['data-item-type'];
    if (itemType && ITEM_TYPE_RARITY[String(itemType).toLowerCase()]) {
      return ITEM_TYPE_RARITY[String(itemType).toLowerCase()];
    }
    const raw = (stat && (stat.rarity || stat.rzadkosc)) ||
                row.rarity || row.rzadkosc || row.quality || '';
    const key = String(raw).toLowerCase().trim();
    if (RARITY_ALIASES[key]) return RARITY_ALIASES[key];
    const hay = String(name || '').toLowerCase();
    for (const k of Object.keys(RARITY_ALIASES)) {
      if (hay.indexOf(k) >= 0) return RARITY_ALIASES[k];
    }
    return 'zwykly';
  }

  /* Parsowanie ceny w formacie KLIENTA GRY: sufiksy k/m/mld (nie "kk"),
   * czasem bez sufiksu dla malych kwot. Aukcje "polecane" pokazuja cene
   * mieszana zloto+waluta premium, np. "500m + 2100SL" - takiej pozycji
   * nie da sie uczciwie porownac z cena czysto zlotowa, wiec jest
   * oznaczana jako hasPremium, zeby wywolujacy mogl ja odrzucic. */
  function parseGoldText(text) {
    if (text === null || text === undefined) return null;
    const s = String(text).trim();
    if (!s) return null;
    /* POPRAWKA: `\b` (word boundary) NIGDY nie dopasowuje sie po polskiej
     * literze "Ł" - w JS bez flagi /u, `\w` to wylacznie [A-Za-z0-9_]
     * (ASCII), wiec "Ł" jest dla silnika regex znakiem NIE-slowa, tak
     * samo jak koniec stringa/spacja po niej - `\b` wymaga przejscia
     * slowo<->nie-slowo po OBU stronach, a tu obie strony sa "nie-slowem".
     * Realny klient gry pokazuje sufiks jako "SŁ" (nie ASCII "SL") - stara
     * wersja z `\b` NIGDY nie wykrywala tego prawdziwego formatu,
     * przepuszczajac oferty za walute premium jako zwykle zlotowe.
     * Zweryfikowane wprost: /(SL|SŁ)\b/i.test('2025SŁ') === false,
     * /S[LŁ]/i.test('2025SŁ') === true. Bez `\b` - dopasowanie substringu
     * jest tu bezpieczne, bo "sl"/"sł" nigdy nie wystepuje w zadnym innym
     * legalnym formacie ceny (liczby + opcjonalny sufiks k/m/mld). */
    const hasPremium = /S[LŁ]/i.test(s) || s.indexOf('+') >= 0;
    const first = s.split('+')[0].trim();
    /* "g" to miliard - klient pokazuje np. "2g" dla 2000m (potwierdzone
     * przez uzytkownika). Bez tego "2g" czytalo sie jako 2 zlota. */
    const m = /^([\d\s.,]+)\s*(mld|g|m|k)?/i.exec(first);
    if (!m) return null;
    const num = toNum(m[1]);
    if (!isFinite(num)) return null;
    const suf = (m[2] || '').toLowerCase();
    const mult = suf === 'mld' || suf === 'g' ? 1e9 : suf === 'm' ? 1e6 : suf === 'k' ? 1e3 : 1;
    return { gold: num * mult, hasPremium: hasPremium };
  }

  /* Parsowanie pozostalego czasu aukcji w formacie klienta: "9d 16h",
   * "1h 29m", "43m 51s", "2m 5s" -> liczba sekund. */
  function parseRemainingToSeconds(text) {
    if (typeof text !== 'string') return null;
    const re = /(\d+)\s*(d|h|m|s)\b/gi;
    let m, total = 0, found = false;
    while ((m = re.exec(text))) {
      found = true;
      const n = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      total += n * (unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1);
    }
    return found ? total : null;
  }

  function detectCategory(row, stat, name, cfg, strictCl) {
    const cats = cfg.categories;
    /* 1. Kod klasy przedmiotu (`data-cl` z DOM okna aukcji). */
    const clField = pickField(row, PAT.cl, function (v) { return isNumish(v) || isStr(v); });
    if (clField) {
      const cl = String(clField.value).toLowerCase();
      for (const c of cats) {
        if (c.cl && c.cl.length && c.cl.map(String).indexOf(cl) >= 0) return c.id;
      }
      /* strictCl: `cl` pochodzi z pewnego zrodla (DOM), wiec kod spoza listy
       * sprzetu to zakladka "Inne" gry (ksiazki, konsumpcyjne, neutralne,
       * talizmany, torby, leczace, waluty, teleporty). Strzaly (cl 29) to
       * bron, nie "Inne" - sa na liscie sprzetu w MU.cfg. Nie
       * zgadujemy wtedy kategorii z nazwy - "Talizman ..." trafilby przez
       * slowo kluczowe do naszyjnikow. */
      if (strictCl) return 'inne';
    }
    /* 2. Pole typu ze statystyk. */
    const st = stat && (stat.type || stat.typ);
    if (st) {
      const s = String(st).toLowerCase();
      for (const c of cats) {
        if (c.id === s) return c.id;
        for (const kw of c.kw) if (s.indexOf(kw) >= 0) return c.id;
      }
    }
    /* 3. Slowa kluczowe w nazwie - najbardziej zawodne, ale zawsze dostepne. */
    const n = U.normName(name);
    let best = null, bestLen = 0;
    for (const c of cats) {
      for (const kw of c.kw) {
        const k = U.normName(kw);
        if (k && n.indexOf(k) >= 0 && k.length > bestLen) { best = c.id; bestLen = k.length; }
      }
    }
    return best || 'inne';
  }

  /* Jak bardzo rekord wyglada na aukcje? 0..1. Sniffer odrzuca ponizej progu. */
  function rowScore(row) {
    if (!row || typeof row !== 'object') return 0;
    let s = 0;
    if (pickField(row, PAT.name, isStr)) s += 0.35;
    if (pickField(row, PAT.buyout, isNumish) || pickField(row, PAT.bid, isNumish)) s += 0.35;
    if (pickField(row, PAT.id, isNumish)) s += 0.12;
    if (pickField(row, PAT.lvl, isNumish)) s += 0.10;
    if (pickField(row, PAT.endTs, isNumish)) s += 0.08;
    return s;
  }

  function arrayScore(rows) {
    if (!rows || !rows.length) return 0;
    const sample = rows.slice(0, 12);
    let sum = 0;
    for (const r of sample) sum += rowScore(r);
    return sum / sample.length;
  }

  /* Znaczniki czasu przychodza raz w sekundach, raz w milisekundach,
   * a czasem jako "zostalo N sekund". Sprowadzamy do ms epoch. */
  function normalizeEndTs(v, now) {
    const n = toNum(v);
    if (!isFinite(n) || n <= 0) return null;
    if (n > 1e12) return n;                      // ms epoch
    if (n > 1e9) return n * 1000;                // s epoch
    if (n < 40 * 86400) return now + n * 1000;   // pozostaly czas w sekundach
    return null;
  }

  /* Glowna funkcja: rekord -> obserwacja albo null. */
  function normalizeRow(row, ctx) {
    const cfg = (ctx && ctx.cfg) || MU.cfg.get();
    const now = (ctx && ctx.now) || Date.now();
    if (rowScore(row) < 0.5) return null;

    const fName = pickField(row, PAT.name, isStr);
    const name = fName ? String(fName.value) : null;
    if (!name) return null;

    const fStat = pickField(row, PAT.stat, isStr);
    const stat = fStat ? parseStatString(fStat.value) : {};

    const fBuy = pickField(row, PAT.buyout, isNumish);
    const fBid = pickField(row, PAT.bid, isNumish);
    const buyout = fBuy ? toNum(fBuy.value) : NaN;
    const bid = fBid ? toNum(fBid.value) : NaN;
    /* Ta funkcja zgaduje nazwy pol w nieznanym payloadzie (XHR/global) -
     * nie da sie tu niezawodnie odroznic "prawdziwego buyout" od
     * pojedynczego, ogolnego pola ceny (np. "price"/"kwota" pasuja tylko
     * do wzorca PAT.bid, nie PAT.buyout, mimo ze moga byc jedynym polem
     * ceny w danym payloadzie). Filtr "tylko Kup teraz" (patrz
     * normalizeExact) jest wiec stosowany TYLKO w sciezce "exact", gdzie
     * buyout i bid to potwierdzone, odrebne pola z DOM - tu zostaje
     * fallback na bid, zeby nie odrzucac danych z powodu niepewnosci
     * dopasowania nazwy pola. */
    const price = isFinite(buyout) && buyout > 0 ? buyout : bid;
    if (!isFinite(price) || price <= 0) return null;

    const rarity = detectRarity(row, stat, name);
    /* Rzadkosci "zwykly" i "legenda" sa calkowicie wykluczone - maja nie
     * trafiac ani do widoku biezacego, ani do bazy historycznej w tle
     * (uzytkownik nie kupuje legend jako skladnikow - to poza zakresem
     * zainteresowania kalkulatora). */
    if (rarity === 'zwykly' || rarity === 'legenda') return null;

    const fLvl = pickField(row, PAT.lvl, isNumish);
    let lvl = fLvl ? toNum(fLvl.value) : NaN;
    if (!isFinite(lvl) && stat.lvl) lvl = toNum(stat.lvl);
    if (!isFinite(lvl) && stat.reqp) lvl = toNum(stat.reqp);

    const fId = pickField(row, PAT.id, isNumish) || pickField(row, PAT.id, isStr);
    const fEnd = pickField(row, PAT.endTs, isNumish);
    const fSeller = pickField(row, PAT.seller, isStr);
    const fUpg = pickField(row, PAT.upgrade, isNumish);

    const upgrade = fUpg ? Math.max(0, Math.round(toNum(fUpg.value)))
                         : U.upgradeFromName(name);
    const baseName = U.normName(name);
    const category = detectCategory(row, stat, name, cfg);
    /* Zakladka "Inne" (i wszystko, czego nie da sie rozpoznac jako sprzet)
     * nie jest w ogole zbierana - patrz detectCategory. */
    if (category === 'inne') return null;
    const bracket = MU.cfg.bracketOf(lvl, cfg.brackets);

    /* Stabilny identyfikator aukcji. Gdy klient nie poda id, sklejamy go
     * z cech oferty - wystarczy do wykrycia, ze ta sama oferta zniknela. */
    const aid = fId ? String(fId.value)
      : 'syn:' + U.hashString([baseName, upgrade, price, fSeller ? fSeller.value : '', lvl].join('|'));

    return {
      aid: aid,
      name: name,
      baseName: baseName,
      lvl: isFinite(lvl) ? lvl : null,
      bracket: bracket,
      category: category,
      rarity: rarity,
      upgrade: upgrade,
      price: price,
      buyout: isFinite(buyout) ? buyout : null,
      bid: isFinite(bid) ? bid : null,
      endTs: fEnd ? normalizeEndTs(fEnd.value, now) : null,
      seller: fSeller ? String(fSeller.value) : null,
      seenTs: now,
      fields: {
        name: fName.key,
        price: (isFinite(buyout) && buyout > 0 ? (fBuy && fBuy.key) : (fBid && fBid.key)) || null,
        lvl: fLvl ? fLvl.key : null,
        id: fId ? fId.key : null,
        end: fEnd ? fEnd.key : null,
      },
    };
  }

  /* Sciezka "exact": wejscie o znanym z gory, potwierdzonym ksztalcie
   * (patrz MU.sniffer.scrapeAuctionTable). Omija dopasowywanie wzorcow
   * nazw pol z normalizeRow - nie jest ono potrzebne, skoro znamy
   * dokladne znaczenie kazdej wartosci, a pomijanie go zmniejsza szanse
   * na falszywe dopasowanie.
   *
   * row: { id, tplId, name, lvl, cl, itemType, buyout, bid, endSeconds } */
  function normalizeExact(row, ctx) {
    const cfg = (ctx && ctx.cfg) || MU.cfg.get();
    const now = (ctx && ctx.now) || Date.now();
    if (!row || !row.name) return null;

    /* Tylko "Kup teraz" - przedmioty wystawione WYLACZNIE na licytacje
     * (bez buyout) sa odrzucane calkowicie, nie liczone po cenie stawki. */
    const price = isFinite(row.buyout) && row.buyout > 0 ? row.buyout : NaN;
    if (!isFinite(price) || price <= 0) return null;

    const rarity = detectRarity(row, {}, row.name);
    /* Rzadkosci "zwykly" i "legenda" sa calkowicie wykluczone - maja nie
     * trafiac ani do widoku biezacego, ani do bazy historycznej w tle
     * (uzytkownik nie kupuje legend jako skladnikow - to poza zakresem
     * zainteresowania kalkulatora). */
    if (rarity === 'zwykly' || rarity === 'legenda') return null;

    const upgrade = U.upgradeFromName(row.name);
    const baseName = U.normName(row.name);
    /* `cl` z DOM jest pewny - kod spoza sprzetu to zakladka "Inne" gry,
     * ktora nie jest w ogole zbierana (patrz detectCategory). */
    const category = detectCategory(row, {}, row.name, cfg, true);
    if (category === 'inne') return null;
    const lvl = isFinite(row.lvl) ? row.lvl : toNum(row.lvl);
    const bracket = MU.cfg.bracketOf(lvl, cfg.brackets);
    const endTs = isFinite(row.endSeconds) ? now + row.endSeconds * 1000 : null;

    return {
      aid: row.id !== undefined && row.id !== null ? String(row.id) : 'syn:' +
        U.hashString([baseName, upgrade, price, lvl].join('|')),
      name: row.name,
      baseName: baseName,
      lvl: isFinite(lvl) ? lvl : null,
      bracket: bracket,
      category: category,
      rarity: rarity,
      upgrade: upgrade,
      price: price,
      buyout: isFinite(row.buyout) ? row.buyout : null,
      bid: isFinite(row.bid) ? row.bid : null,
      endTs: endTs,
      seller: row.seller || null,
      seenTs: now,
      fields: { source: 'exact' },
    };
  }

  function normalizeRows(rows, ctx) {
    const out = [];
    for (const r of rows || []) {
      const n = normalizeRow(r, ctx);
      if (n) out.push(n);
    }
    return out;
  }

  /* Klucz grupujacy - najdokladniejszy poziom hierarchii (patrz MU.aggregate). */
  function itemKey(o) {
    return [o.baseName, o.rarity, '+' + o.upgrade].join('|');
  }
  function groupKey(o) {
    return [o.category, o.bracket || '?', o.rarity, '+' + o.upgrade].join('|');
  }
  function coarseKey(o) {
    return [o.category, o.bracket || '?', o.rarity].join('|');
  }

  return {
    PAT: PAT, pickField: pickField, parseStatString: parseStatString,
    rowScore: rowScore, arrayScore: arrayScore, normalizeRow: normalizeRow,
    normalizeExact: normalizeExact,
    normalizeRows: normalizeRows, normalizeEndTs: normalizeEndTs, toNum: toNum,
    parseGoldText: parseGoldText, parseRemainingToSeconds: parseRemainingToSeconds,
    detectCategory: detectCategory, detectRarity: detectRarity,
    itemKey: itemKey, groupKey: groupKey, coarseKey: coarseKey,
  };
})();

/* ===== 06-sniffer.js ===== */
/* ------------------------------------------------------------------ *
 * MU.sniffer - pozyskiwanie danych aukcyjnych z klienta gry.
 *
 * Trzy niezalezne zrodla, kazde jako zabezpieczenie poprzedniego:
 *   1. Przechwycenie ruchu sieciowego (XHR + fetch). Podstawowe zrodlo.
 *      Nie zakladamy zadnego konkretnego endpointu ani nazw pol -
 *      kazda odpowiedz JSON jest skanowana w poszukiwaniu tablicy
 *      rekordow, ktore "wygladaja jak aukcje" (MU.normalize.arrayScore).
 *   2. Odczyt globali klienta (SI: `g`, NI: `Engine`) - lista sciezek
 *      kandydatow, uzywane te, ktore faktycznie istnieja.
 *   3. Zrzut z DOM otwartego okna domu aukcyjnego - dziala nawet gdy
 *      dane przyjda kanalem, ktorego nie przechwycimy.
 *
 * W tle dodatek tylko CZYTA to, co klient i tak pobiera, i nie
 * automatyzuje zadnych akcji w grze. Jedyny wyjatek to "Zaladuj wszystkie
 * strony" (sekcja 4 nizej): po kliknieciu uzytkownika prosi gre o kolejne
 * strony tej samej listy aukcji, dokladnie tym zadaniem, ktore gra wysyla
 * sama przy przewijaniu.
 * ------------------------------------------------------------------ */
MU.sniffer = (function () {

  const U = MU.util;
  const N = MU.normalize;

  const listeners = [];
  const diag = { samples: [], hits: 0, scanned: 0, lastHitAt: null, sources: {},
    lastDom: null /* {allCount, total, complete, at} - do wglaanu w panelu */ };
  const MAX_SAMPLES = 12;
  let installed = false;

  /* Okno aukcji Margonem dzieli wyniki na STRONY (potwierdzone na zywo:
   * Engine.auctions.getAuctionPages(), 15 pozycji/strone) - to nie jest
   * doladowywanie przy scrollu, tylko prawdziwa paginacja z przyciskami.
   * Dodatek nie klika za uzytkownika (zostaje przy czystym odczycie tego,
   * co juz jest wyrenderowane), ale JESLI uzytkownik sam przegląda kolejne
   * strony tego samego filtra, warto to wykorzystac: kumulujemy unikalne
   * ID aukcji widziane w danym "scope" i uznajemy liste za pelna, gdy
   * suma pokrywa cala liczbe z licznika "Ilosc aukcji: N" w oknie gry. */
  const scopeCoverage = new Map(); // scope -> Set<aid>
  const SCOPE_COVERAGE_MAX = 64;   // ochrona przed nieograniczonym wzrostem pamieci

  /* Migawka BIEZACA - to, co jest w tej chwili wyrenderowane w tabeli
   * aukcji, CALKOWICIE NIEZALEZNA od kumulatywnej bazy historycznej
   * (MU.store). Nadpisywana w calosci przy kazdym skanie DOM (nie
   * laczona ze starym stanem), wiec automatycznie odzwierciedla zmiane
   * filtra w grze: gdy gracz przelacza z "rekawice" na "buty", stare
   * wiersze znikaja z `.auction-table`, a kolejny skan zbuduje snapshot
   * juz tylko z butow. Zakladka Przedmioty czyta WYLACZNIE stad - patrz
   * MU.ui.renderItems - baza historyczna (Tabela) jest calkiem osobnym
   * mechanizmem i pisanie do niej (MU.lifecycle) nie zalezy od tego, co
   * ta migawka akurat zawiera. */
  let liveSnapshot = { items: [], updatedAt: 0 };
  const liveListeners = [];

  function setLiveSnapshot(obs) {
    liveSnapshot = { items: obs, updatedAt: Date.now() };
    for (const fn of liveListeners) {
      try { fn(liveSnapshot); } catch (e) { console.warn('[Ulepy] live listener error', e); }
    }
  }
  function getLiveSnapshot() { return liveSnapshot; }
  function onLiveSnapshot(fn) { liveListeners.push(fn); }

  /* Migawka SESYJNA - w odroznieniu od `liveSnapshot` (nadpisywanej w
   * calosci przy kazdym skanie, patrz komentarz wyzej), ta KUMULUJE
   * kazda oferte, jaka dodatek kiedykolwiek zobaczyl od zaladowania
   * strony (aktualizujac istniejacy wpis po `aid`, jesli ten sam
   * przedmiot pojawi sie ponownie - np. z nowa cena). Dzieki temu
   * przelaczanie kategorii w oknie aukcji gry NIE gubi juz zobaczonych
   * przedmiotow z innych kategorii - zakladka Przedmioty (widok
   * "Wszystkie") czyta wylacznie stad, patrz MU.ui.renderItems. Zamierzone
   * uproszczenie "sesji" do calego czasu zycia strony (nie per otwarcie/
   * zamkniecie okna aukcji) - prostsze i w praktyce korzystniejsze dla
   * uzytkownika (widzi kumulatywnie wszystko z calej rozgrywki, a nie
   * tylko z ostatniego otwarcia okna). */
  const sessionItems = new Map();

  function addToSession(obs) {
    for (const o of obs) sessionItems.set(o.aid, o);
  }
  function getSessionItems() { return Array.from(sessionItems.values()); }

  function trackCoverage(scope, ids) {
    let set = scopeCoverage.get(scope);
    if (!set) {
      set = new Set();
      scopeCoverage.set(scope, set);
      if (scopeCoverage.size > SCOPE_COVERAGE_MAX) {
        scopeCoverage.delete(scopeCoverage.keys().next().value);
      }
    }
    for (const id of ids) if (id !== undefined) set.add(id);
    return set.size;
  }

  function onSnapshot(fn) { listeners.push(fn); }

  function emit(observations, meta) {
    if (!observations.length) return;
    diag.hits++;
    diag.lastHitAt = Date.now();
    diag.sources[meta.source] = (diag.sources[meta.source] || 0) + 1;
    for (const fn of listeners) {
      try { fn(observations, meta); } catch (e) { console.warn('[Ulepy] listener error', e); }
    }
  }

  /* Zakres zapytania. Krytyczne dla wykrywania sprzedazy: jesli gracz
   * przefiltruje aukcje na "buty", przedmioty nieobecne w odpowiedzi NIE
   * zostaly sprzedane - po prostu nie pasuja do filtra. Porownujemy wiec
   * migawki tylko w obrebie tego samego zakresu. */
  function scopeOf(url) {
    if (!url) return 'dom';
    try {
      const u = new URL(url, location.href);
      const keep = [];
      u.searchParams.forEach(function (v, k) {
        if (/^(t|task|a|action|mod|type|typ|cat|kat|search|szukaj|name|nazwa|lvl|min|max|order|sort|class|prof)$/i.test(k)) {
          keep.push(k + '=' + v);
        }
      });
      keep.sort();
      return u.pathname + '?' + keep.join('&');
    } catch (e) {
      return String(url).slice(0, 200);
    }
  }

  /* Czy warto w ogole zagladac do tej odpowiedzi. Nie filtrujemy po URL
   * ostro (nie znamy endpointu), tylko odrzucamy oczywiste smieci. */
  function urlWorthScanning(url) {
    if (!url) return true;
    if (/\.(png|jpe?g|gif|webp|svg|css|woff2?|ttf|mp3|ogg)(\?|$)/i.test(url)) return false;
    if (/margonem\.pl\/(gfx|obrazki)\//i.test(url)) return false;
    return true;
  }

  function recordSample(url, payload, best) {
    if (!MU.cfg.get().diagnostics) return;
    diag.samples.unshift({
      at: Date.now(),
      url: String(url || '').slice(0, 300),
      path: best ? best.path : null,
      score: best ? U.round(best.score, 2) : 0,
      sampleRow: best && best.rows[0] ? JSON.parse(JSON.stringify(best.rows[0])) : null,
      rowCount: best ? best.rows.length : 0,
    });
    diag.samples.length = Math.min(diag.samples.length, MAX_SAMPLES);
  }

  /* Skan pojedynczej odpowiedzi. */
  function scanPayload(text, url, source) {
    diag.scanned++;
    const json = U.tryJson(text);
    if (!json) return;
    const candidates = U.findArraysOfObjects(json, 6);
    if (!candidates.length) return;

    let best = null;
    for (const c of candidates) {
      const score = N.arrayScore(c.rows);
      if (!best || score > best.score) best = { path: c.path, rows: c.rows, score: score };
    }
    recordSample(url, json, best);
    if (!best || best.score < 0.55) return;

    const obs = N.normalizeRows(best.rows, { now: Date.now() });
    if (obs.length) {
      emit(obs, {
        source: source || 'xhr',
        url: url,
        scope: scopeOf(url),
        path: best.path,
        score: best.score,
        complete: true,   // odpowiedz sieciowa = pelna lista dla tego zakresu
      });
    }
  }

  /* --- 1. przechwycenie XHR ----------------------------------------- */

  function hookXhr() {
    const XHR = window.XMLHttpRequest;
    if (!XHR || !XHR.prototype) return;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try { this.__mu_url = url; } catch (e) {}
      return origOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      const self = this;
      try {
        this.addEventListener('load', function () {
          try {
            const url = self.__mu_url;
            if (!urlWorthScanning(url)) return;
            if (self.responseType && self.responseType !== '' && self.responseType !== 'text') {
              if (self.responseType === 'json' && self.response) {
                scanPayload(JSON.stringify(self.response), url, 'xhr');
              }
              return;
            }
            scanPayload(self.responseText, url, 'xhr');
          } catch (e) { /* nie psujemy gry z powodu bledu w dodatku */ }
        });
      } catch (e) {}
      return origSend.apply(this, arguments);
    };
  }

  /* --- 1b. przechwycenie fetch -------------------------------------- */

  function hookFetch() {
    if (typeof window.fetch !== 'function') return;
    const orig = window.fetch;
    window.fetch = function () {
      const args = arguments;
      const url = (args[0] && args[0].url) || args[0];
      return orig.apply(this, args).then(function (res) {
        try {
          if (urlWorthScanning(url) && res && res.clone) {
            res.clone().text().then(function (t) {
              try { scanPayload(t, url, 'fetch'); } catch (e) {}
            }).catch(function () {});
          }
        } catch (e) {}
        return res;
      });
    };
  }

  /* --- 2. globale klienta -------------------------------------------- */

  /* Sciezki kandydaci. Nie wiemy, ktora istnieje w danej wersji klienta,
   * wiec sprawdzamy wszystkie i uzywamy tych, ktore odpowiadaja. */
  const GLOBAL_PATHS = [
    'g.auction', 'g.auctions', 'g.market', 'g.rynek', 'g.aukcje',
    'g.auctionList', 'g.auction.list', 'g.auction.items',
    'Engine.auction', 'Engine.auctions', 'Engine.market',
    'Engine.auctionController', 'Engine.auction.list',
    'Engine.auctions.list', 'Engine.auctions.items',
    'window.auctionData', 'window.auctions',
  ];

  function resolvePath(path) {
    const parts = path.replace(/^window\./, '').split('.');
    let cur = window;
    for (const p of parts) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function pollGlobals() {
    for (const path of GLOBAL_PATHS) {
      let val;
      try { val = resolvePath(path); } catch (e) { continue; }
      if (!val || typeof val !== 'object') continue;
      const candidates = U.findArraysOfObjects(val, 4);
      for (const c of candidates) {
        if (N.arrayScore(c.rows) < 0.55) continue;
        const obs = N.normalizeRows(c.rows, { now: Date.now() });
        if (obs.length) {
          emit(obs, {
            source: 'global',
            url: path,
            scope: 'global:' + path + (c.path ? '.' + c.path : ''),
            path: path + '.' + c.path,
            score: N.arrayScore(c.rows),
            complete: true,
          });
        }
      }
    }
  }

  /* --- 3. zrzut z DOM ------------------------------------------------ */

  /* Scraper skalibrowany na zywym oknie aukcji klienta NI (wrzesien 2026).
   * Struktura potwierdzona reczna inspekcja: tabela `.auction-table`,
   * wiersze <tr> z komorkami `.item-name-td`, `.item-level-td`,
   * `.item-time-td .time-wrapper`, `.item-bid-td` (z dokladna kwota
   * w atrybucie `full-cost` inputu, gdy padla juz jakas licytacja) i
   * `.item-buy-now-td .auction-cost-label` (cena "kup teraz" w formacie
   * k/m/mld). Ikona przedmiotu niesie `data-cl` (kod kategorii) i
   * `data-item-type` (kod rzadkosci: t-norm/t-uniupg/t-her) wprost
   * w atrybutach - duzo pewniejsze zrodlo niz zgadywanie z nazwy.
   *
   * Aukcje "polecane" (`is-featured`, cena mieszana zloto+SL) sa
   * pomijane w calosci - nie da sie ich uczciwie porownac z cenami
   * czysto zlotowymi, a to jedyna waluta, w ktorej liczy sie ten dodatek.
   *
   * Okno aukcji dzieli wyniki na prawdziwe STRONY (potwierdzone na zywo:
   * ~15 pozycji/strone), nie doladowuje ich przy scrollu - jedna migawka
   * DOM prawie nigdy nie pokrywa calego "Ilosc aukcji: N". Dlatego ID
   * widziane w kolejnych migawkach TEGO SAMEGO filtra sa kumulowane
   * (patrz `trackCoverage`), a `complete: true` jest zglaszane dopiero,
   * gdy suma pokrycia dorówna N - dopiero wtedy mozna bezpiecznie
   * wnioskowac o zniknieciu aukcji (patrz MU.lifecycle). Bez tego
   * rozroznienia dodatek nigdy nie zapisalby ani jednej obserwacji, bo
   * pojedyncza strona listy prawie zawsze jest niepelna. */
  function auctionTotalCount() {
    /* Najpierw wlasny element licznika okna aukcji (klasa potwierdzona na
     * zywo), dopiero potem tekst calej strony - np. czat moglby zawierac
     * przypadkowe "Ilosc aukcji: 5". */
    const label = document.querySelector('.auction-window .amount-of-auction');
    const src = label ? label.textContent : (document.body && document.body.textContent) || '';
    const m = /Ilo[śs][ćc]\s+aukcji:\s*([\d\s]+)/i.exec(src);
    if (!m) return NaN;
    return N.toNum(m[1].replace(/\s/g, ''));
  }

  /* Cache "juz przetworzonych" wierszy: aid -> gotowa obserwacja (albo
   * `null` dla odrzuconych, np. premium/is-featured). Raz wystawiona
   * oferta praktycznie nie zmienia ceny/poziomu/rzadkosci (jedyne co
   * moze sie zmienic to stawka licytacji, ktorej i tak nie preferujemy -
   * normalizeExact bierze buyout, gdy jest dostepny), wiec ponowne pelne
   * parsowanie tego samego aid przy kazdym skanie (co 8s, a lista rosnie
   * przy recznym przewijaniu do dziesiatek/setek wierszy) to czysty koszt bez
   * korzysci - dokladnie to spowalnialo zbieranie. Dla juz znanego aid
   * caly kosztowny odczyt DOM (buyTd/bidInput/lvlTd/timeEl, ~5 dodatkowych
   * zapytan na wiersz) i parsowanie (regex ceny/czasu, normalizeExact) jest
   * pomijane w calosci - zostaje tylko jedno zapytanie (itemDiv) potrzebne
   * do odczytania id. Cache NIE jest czyszczony przy zmianie filtra w
   * grze (aid jest unikalny globalnie), tylko po przekroczeniu limitu
   * rozmiaru (ochrona przed nieograniczonym wzrostem pamieci w dlugiej
   * sesji). */
  const rowCache = new Map();
  const ROW_CACHE_MAX = 8000;

  /* Jeden wiersz tabeli aukcji -> { aid, cl, obs } albo null, gdy to nie
   * wiersz z przedmiotem. obs === null to oferta odrzucona (premium,
   * zwykly, Inne...). Wydzielone z scrapeAuctionTable, zeby "Zaladuj
   * wszystkie strony" moglo przetwarzac TYLKO nowe wiersze po kazdej
   * stronie zamiast calej, rosnacej tabeli. */
  function parseAuctionRow(tr, now) {
    const itemDiv = tr.querySelector('.item-slot-td .item');
    if (!itemDiv) return null;
    const idM = /item-id-(\d+)/.exec(itemDiv.className);
    const aid = idM ? idM[1] : null;

    if (aid && rowCache.has(aid)) {
      return { aid: aid, cl: itemDiv.getAttribute('data-cl'), obs: rowCache.get(aid) };
    }

    const nameTd = tr.querySelector('.item-name-td');
    if (!nameTd) return null;
    const name = nameTd.textContent.trim();
    if (!name) return null;
    const cl = itemDiv.getAttribute('data-cl');

    const buyTd = tr.querySelector('.item-buy-now-td');
    const featured = !!(buyTd && buyTd.classList.contains('is-featured'));
    const buyLabel = buyTd && buyTd.querySelector('.auction-cost-label');
    const buyParsed = buyLabel ? N.parseGoldText(buyLabel.textContent) : null;
    if (featured || (buyParsed && buyParsed.hasPremium)) {
      if (aid) rowCache.set(aid, null);
      return { aid: aid, cl: cl, obs: null };
    }

    const bidInput = tr.querySelector('.item-bid-td input.input-cost');
    const bidExact = bidInput ? N.toNum(bidInput.getAttribute('full-cost')) : NaN;
    const lvlTd = tr.querySelector('.item-level-td');
    const timeEl = tr.querySelector('.item-time-td .time-wrapper');

    const rec = {
      id: aid || undefined,
      name: name,
      lvl: lvlTd ? N.toNum(lvlTd.textContent) : undefined,
      cl: cl || undefined,
      itemType: itemDiv.getAttribute('data-item-type') || undefined,
      buyout: buyParsed ? buyParsed.gold : undefined,
      bid: isFinite(bidExact) ? bidExact : undefined,
      endSeconds: timeEl ? N.parseRemainingToSeconds(timeEl.textContent) : undefined,
    };
    const o = N.normalizeExact(rec, { now: now });
    if (aid) rowCache.set(aid, o || null);
    return { aid: aid, cl: cl, obs: o || null };
  }

  /* Tylko wiersze od indeksu `from` - uzywane przez "Zaladuj wszystkie
   * strony" po kazdej stronie, zamiast pelnego skanu rosnacej tabeli co 8 s
   * (przy tysiacach wierszy taki skan blokowal gre). complete:false - z czesci
   * listy nie wolno wnioskowac o sprzedazy; pelny skan idzie raz, na koncu. */
  function scrapeNewRows(from) {
    const table = document.querySelector('.auction-table');
    if (!table) return 0;
    const trs = table.rows || table.querySelectorAll('tr');
    const now = Date.now();
    const obs = [];
    for (let i = Math.max(0, from); i < trs.length; i++) {
      const r = parseAuctionRow(trs[i], now);
      if (r && r.obs) obs.push(r.obs);
    }
    if (rowCache.size > ROW_CACHE_MAX) rowCache.clear();
    if (obs.length) {
      addToSession(obs);
      emit(obs, { source: 'dom-exact', url: location.href, scope: 'dom-pager', path: '.auction-table',
        score: 1, complete: false });
    }
    return obs.length;
  }

  /* Odcisk aktywnego filtra. Gra nie zmienia URL przy zmianie kategorii/
   * zakresu cen/poziomu (caly interfejs dziala po WebSocket), wiec
   * `location.href` nie nadaje sie na klucz zakresu - zmiana filtra
   * musi zaczynac NOWY `scope`, inaczej przelaczenie kategorii wygladaloby
   * jak nagla sprzedaz wszystkich poprzednio widocznych przedmiotow. */
  function scrapeAuctionTable() {
    const table = document.querySelector('.auction-table');
    if (!table) {
      /* Okno aukcji zamkniete/zmienione - migawka biezaca nie powinna
       * dalej pokazywac ostatnio widzianych ofert jako "aktualne". */
      if (liveSnapshot.items.length) setLiveSnapshot([]);
      return false;
    }
    const trs = table.querySelectorAll('tr');
    const obs = [];
    const clSeen = new Set();
    const allIds = [];
    let allCount = 0;
    const now = Date.now();

    for (const tr of trs) {
      const r = parseAuctionRow(tr, now);
      if (!r) continue;
      allCount++;
      if (r.cl) clSeen.add(r.cl);
      if (r.aid) allIds.push(r.aid);
      if (r.obs) obs.push(r.obs);
    }
    if (rowCache.size > ROW_CACHE_MAX) rowCache.clear();
    if (!allCount) return false;

    const total = auctionTotalCount();
    const scope = 'dom-exact:' + (isFinite(total) ? total : '?') + ':' +
      Array.from(clSeen).sort().join(',');
    /* Prawdziwa paginacja (15 pozycji/strone, potwierdzone na zywo) - jedna
     * migawka prawie nigdy nie pokryje calego "total". Kumulujemy wiec
     * unikalne ID w obrebie tego samego filtra: gdy uzytkownik przegladajac
     * kolejne strony pokryje caly zbior, dopiero wtedy uznajemy go za pelny. */
    const covered = trackCoverage(scope, allIds);
    const complete = isFinite(total) && covered >= total;
    diag.lastDom = { allCount: allCount, covered: covered,
      total: isFinite(total) ? total : null, complete: complete, scope: scope, at: Date.now() };

    /* Migawka biezaca sie nadpisuje ZAWSZE (nawet gdy `obs` jest puste -
     * to poprawny sygnal "nic teraz nie pasuje", nie brak danych), zeby
     * zakladka Przedmioty nigdy nie pokazywala wierszy z poprzedniego,
     * juz nieaktualnego filtra. */
    setLiveSnapshot(obs);
    if (obs.length) {
      addToSession(obs);
      emit(obs, {
        source: 'dom-exact',
        url: location.href,
        scope: scope,
        path: '.auction-table',
        score: 1,
        complete: complete,
      });
    }
    return true;
  }

  /* Doladowywanie kolejnych stron przez SYNTETYCZNY SCROLL - zbadane i
   * odrzucone, zostaje jako udokumentowany negatywny wynik. UWAGA: wniosek
   * na koncu tego bloku ("pelnego zrzutu nie da sie osiagnac") byl zbyt
   * szeroki - dotyczy tylko podrabiania zdarzen. Dzialajaca droga (to samo
   * zadanie `_g`, ktore gra wysyla przy przewijaniu, tylko po kliknieciu
   * uzytkownika) jest opisana w sekcji 4 nizej, patrz loadAllPages.
   *
   * Wczesniejsza wersja tego modulu twierdzila (na podstawie jednej,
   * niedostatecznie zweryfikowanej obserwacji), ze programowe ustawienie
   * `scrollTop = scrollHeight` + `dispatchEvent(new Event('scroll'))` na
   * kontenerze `.scroll-pane` doklada kolejne wiersze do `.auction-table`,
   * tak jak reczny scroll uzytkownika. Rzetelny, powtorzony test na zywym
   * oknie aukcji (wielokrotne proby, rozne warianty: 'scroll', 'wheel',
   * skok od 0 i od aktualnej pozycji, ze zdarzeniem i bez) pokazal, ze to
   * bylo BLEDNE zalozenie: `scrollTop` faktycznie sie zmienia (wartosc
   * jest odczytywalna i poprawna), ale zaden syntetyczny (JS-owy) event
   * scroll/wheel NIE dokleja kolejnych wierszy. Dokladnie ten sam gest
   * wykonany jako PRAWDZIWY scroll myszy (poprzez rzeczywiste zdarzenie
   * systemowe, nie JS) dziala natychmiast (15 -> 30 wierszy).
   *
   * Przyczyna: kazdy event stworzony przez `new Event(...)`/`dispatchEvent()`
   * ma `isTrusted === false` - to gwarancja samej przegladarki (Trusted
   * Events, czesc specyfikacji DOM), ktorej ZADEN kod JS dzialajacy na
   * stronie (wlacznie z tym userscriptem) nie jest w stanie obejsc ani
   * podrobic. Jesli listener doladowywania w kliencie gry sprawdza
   * `event.isTrusted` (wprost albo posrednio, np. przez biblioteke typu
   * jScrollPane sledzaca WLASNY, wewnetrzny stan przewijania aktualizowany
   * tylko przy realnych zdarzeniach uzytkownika, a nie przy programowym
   * ustawieniu `scrollTop` kontenera-hosta) - to jest TWARDA GRANICA
   * platformy przegladarkowej, nie ograniczenie tego dodatku ani furtka
   * do obejscia lepszym kodem. Zaden Tampermonkey/userscript dzialajacy
   * jako JS na stronie nie moze wygenerowac prawdziwego zdarzenia scrolla -
   * to wymaga realnego wejscia od uzytkownika (albo automatyzacji na
   * poziomie systemu operacyjnego/przegladarki, poza zasiegiem userscriptu).
   *
   * Najblizsze mozliwe rozwiazanie: dodatek i tak zapisuje KAZDY wiersz,
   * jaki znajdzie sie w DOM w danym momencie (patrz scrapeAuctionTable,
   * wywolywane co 8s) - wiec kazde reczne przewiniecie listy przez
   * uzytkownika (choc raz, kiedykolwiek) natychmiast dopisuje nowe pozycje
   * do proby. Pelnego zrzutu WSZYSTKICH ofert danej kategorii bez
   * jakiegokolwiek udzialu uzytkownika nie da sie osiagnac.
   *
   * DALSZE ODKRYCIE (zweryfikowane na zywo, kilkukrotnie): sam `scrollTop`
   * bez zdarzenia jest NIESZKODLIWY i DZIALA jako czysta zmiana pozycji -
   * to konkretnie syntetyczny scroll/wheel EVENT jest ignorowany, nie
   * ustawienie pozycji samo w sobie. To otwiera hybryde: gdy kontener
   * jest juz USTAWIONY blisko samego dolu (programowo, przez ten
   * dodatek), NASTEPNY prawdziwy, nawet drobny "tik" kolka myszy
   * uzytkownika (ktory i tak jest prawdziwym/zaufanym zdarzeniem) od
   * razu dociera do koncowej krawedzi i wyzwala doladowanie calej
   * kolejnej partii (~15 wierszy) - zamiast tylko przesunac widok o
   * ulamek strony, jak bez tego zabiegu. Potwierdzone na zywo: 30 -> 120
   * wierszy w kilku takich cyklach.
   *
   * `keepScrolledNearBottom` wykorzystuje to, ale OSTROZNIE: dosuwa
   * kontener do samego dolu TYLKO gdy uzytkownik i tak juz jest blisko
   * dolu (>=70% wysokosci) - czyli tylko gdy juz sam scrolluje w dol z
   * wyrazna checia zobaczenia wiecej. Nie rusza pozycji, gdy uzytkownik
   * czyta cos w gornej/srodkowej czesci listy - inaczej dodatek
   * "wyrywalby" mu widok w dol podczas zwyklego przegladania, co
   * byloby irytujace, nie pomocne. */
  function keepScrolledNearBottom() {
    const table = document.querySelector('.auction-table');
    if (!table) return;
    const pane = table.closest('.scroll-pane');
    if (!pane) return;
    const bottom = pane.scrollHeight - pane.clientHeight;
    if (bottom <= 0) return;
    const margin = 24; // nie do samego zera - zostaw uzytkownikowi "ostatni tik" do zrobienia
    const nearBottomThreshold = bottom * 0.7;
    if (pane.scrollTop >= nearBottomThreshold) {
      pane.scrollTop = Math.max(0, bottom - margin);
    }
  }

  let keepScrolledTimer = null;
  function startKeepScrolledNearBottom(intervalMs) {
    if (keepScrolledTimer) return;
    keepScrolledTimer = setInterval(function () {
      try { keepScrolledNearBottom(); } catch (e) {}
    }, intervalMs || 1500);
  }
  function stopKeepScrolledNearBottom() { clearInterval(keepScrolledTimer); keepScrolledTimer = null; }

  /* Zapasowy, heurystyczny zrzut z DOM - uzywany tylko gdy skalibrowany
   * scraper powyzej nie znalazl tabeli (np. inna zakladka okna aukcji,
   * przyszla zmiana markupu). Bez zalozen co do konkretnych klas CSS -
   * lapiemy elementy, ktorych nazwy klas zawieraja "auction"/"aukcj"/
   * "market", i wyciagamy z kazdego wiersza nazwe + cene. */
  function scrapeDomFallback() {
    const roots = document.querySelectorAll(
      '[class*="auction" i],[id*="auction" i],[class*="aukcj" i],[id*="aukcj" i],[class*="market" i],[id*="market" i]'
    );
    if (!roots.length) return;

    const rows = [];
    const seen = new Set();
    for (const root of roots) {
      const items = root.querySelectorAll('tr, li, [class*="item" i], [class*="row" i], [class*="offer" i]');
      for (const el of items) {
        if (seen.has(el)) continue;
        seen.add(el);
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length < 6 || text.length > 300) continue;

        /* Cena: liczba z separatorami, opcjonalnie z sufiksem k/kk. */
        const pm = /(\d[\d\s.,]{2,})\s*(kk|k)?\b/i.exec(text);
        if (!pm) continue;
        let price = N.toNum(pm[1]);
        const suf = (pm[2] || '').toLowerCase();
        if (suf === 'k') price *= 1e3;
        else if (suf === 'kk') price *= 1e6;
        if (!isFinite(price) || price < 10) continue;

        /* Nazwa: preferujemy atrybuty tytulowe, potem pierwszy sensowny tekst. */
        const titled = el.querySelector('[title],[alt],[data-name]');
        const name = (titled && (titled.getAttribute('title') || titled.getAttribute('alt') ||
                     titled.getAttribute('data-name'))) ||
                     text.replace(/(\d[\d\s.,]{2,})\s*(kk|k)?/i, '').trim();
        if (!name || name.length < 3) continue;

        const lm = /(?:lvl|poziom)[^\d]{0,3}(\d{1,3})/i.exec(text);
        rows.push({
          name: name.slice(0, 80),
          price: price,
          lvl: lm ? parseInt(lm[1], 10) : undefined,
          id: undefined,
        });
      }
    }
    if (!rows.length) return;
    const obs = N.normalizeRows(rows, { now: Date.now() });
    if (obs.length) {
      emit(obs, {
        source: 'dom',
        url: location.href,
        scope: 'dom',
        path: 'DOM',
        score: N.arrayScore(rows),
        /* Zrzut z DOM widzi tylko biezaca strone listy, nie caly zakres -
         * nie wolno na jego podstawie wnioskowac o zniknieciu aukcji. */
        complete: false,
      });
    }
  }

  function scrapeDom() {
    try {
      if (scrapeAuctionTable()) return;
    } catch (e) { console.warn('[Ulepy] scraper skalibrowany zawiodl', e); }
    try { scrapeDomFallback(); } catch (e) {}
  }

  let domTimer = null;
  function startDomWatch(intervalMs) {
    if (domTimer) return;
    domTimer = setInterval(scrapeDom, intervalMs || 8000);
  }
  function stopDomWatch() { clearInterval(domTimer); domTimer = null; }

  let globalTimer = null;
  function startGlobalWatch(intervalMs) {
    if (globalTimer) return;
    globalTimer = setInterval(function () {
      try { pollGlobals(); } catch (e) {}
    }, intervalMs || 30000);
  }
  function stopGlobalWatch() { clearInterval(globalTimer); globalTimer = null; }

  /* --- 4. "Zaladuj wszystkie strony" - TYLKO na klikniecie ---------- *
   *
   * Poprawka wczesniejszego wniosku (blok komentarza nad
   * keepScrolledNearBottom): syntetycznego ZDARZENIA scrolla faktycznie
   * nie da sie podrobic, ale nie jest to jedyna droga. Gra doladowuje
   * kolejna strone, wolajac wlasna funkcje `_g` z zadaniem w postaci
   * (podsluchane na zywo, wrzesien 2026, swiat Luvia):
   *
   *   ah&cat=1&filter=||||||0|4|0|1|&sort=1|1    <- pierwsza strona
   *   ah&cat=1&filter=||||||0|4|0|2|&sort=1|1    <- po dojechaniu do dolu
   *
   * Czyli numer strony to 10. pole (indeks 9) w `filter=`, a odpowiedz
   * trafia do wlasnych handlerow gry i dokleja kolejne ~15 wierszy do tej
   * samej `.auction-table` (potwierdzone: 14 -> 29). Dodatek robi wiec
   * dokladnie to, co gra przy recznym przewijaniu: bierze OSTATNIE
   * zadanie `ah&...`, ktore gra sama wyslala, podmienia wylacznie numer
   * strony i przekazuje je do tej samej `_g`. Nie buduje zapytan od zera,
   * nie zna zadnych innych zadan (kupno/licytacja/wystawianie w ogole
   * nie istnieja w tym kodzie) i nie odpala sie sam - tylko po wyraznym
   * kliknieciu przycisku w zakladce Zbieranie.
   *
   * Tempo: maksymalne, na wyrazne zyczenie uzytkownika - bez sztucznej
   * przerwy (wczesniej 0,9 s). Ograniczenia, ktore zostaja: strony po kolei
   * (kolejna dopiero, gdy poprzednia dolozyla wiersze - nigdy rownolegle),
   * tempo kolejki zadan samej gry, twardy limit stron, stop przy zmianie
   * filtra/zamknieciu okna/braku odpowiedzi. */
  const AH_PAGE_FIELD = 9;
  const AH_PAGE_SIZE = 15;
  const PAGER_RESPONSE_TIMEOUT_MS = 6000;
  /* Bezpiecznik, nie realne ograniczenie: na zywo lista miala 35 778 ofert
   * (~2400 stron), a stary limit 400 ucinal ja po ~6000. */
  const PAGER_MAX_PAGES = 5000;

  let lastAhTask = null;
  let gameTaskHooked = false;
  /* Ostatnie zadanie wyslane przez sam dodatek ("Zaladuj wszystkie strony") -
   * zeby odroznic je od klikniec gracza. onAhTask powiadamia tylko o tych
   * drugich (np. gracz wrocil do przerwanej listy -> UI pokazuje "Wznow"). */
  let lastOwnAhTask = null;
  const ahTaskListeners = [];
  function onAhTask(fn) { ahTaskListeners.push(fn); }

  /* Pasywne podpiecie pod `_g`: zapamietuje ostatnie zadanie aukcji i ZAWSZE
   * oddaje wywolanie oryginalowi bez zmian. `_g` pojawia sie dopiero po
   * zaladowaniu klienta, a dodatek startuje na document-start - stad
   * ponawianie co sekunde, az funkcja bedzie dostepna. */
  function hookGameTask() {
    if (gameTaskHooked) return true;
    const orig = window._g;
    if (typeof orig !== 'function') return false;
    gameTaskHooked = true;
    window._g = function (task) {
      try {
        if (typeof task === 'string' && task.indexOf('ah&') === 0) {
          lastAhTask = task;
          if (task !== lastOwnAhTask) {
            for (const fn of ahTaskListeners) { try { fn(); } catch (e) {} }
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    return true;
  }
  function startGameTaskHook() {
    if (hookGameTask()) return;
    const t = setInterval(function () { if (hookGameTask()) clearInterval(t); }, 1000);
  }

  /* Czyste funkcje na zadaniu `ah&...` (testowane w test/verify-min.mjs).
   * Kazdy format inny niz potwierdzony na zywo -> null, a wtedy dodatek
   * po prostu nic nie wysyla. */
  function ahFilterFields(task) {
    if (typeof task !== 'string' || task.indexOf('ah&') !== 0) return null;
    const parts = task.split('&');
    let i = -1;
    for (let k = 0; k < parts.length; k++) if (parts[k].indexOf('filter=') === 0) { i = k; break; }
    if (i < 0) return null;
    const fields = parts[i].slice('filter='.length).split('|');
    if (fields.length <= AH_PAGE_FIELD || !/^\d+$/.test(fields[AH_PAGE_FIELD])) return null;
    return { parts: parts, index: i, fields: fields };
  }
  function ahTaskPage(task) {
    const f = ahFilterFields(task);
    return f ? parseInt(f.fields[AH_PAGE_FIELD], 10) : NaN;
  }
  function ahTaskWithPage(task, page) {
    const f = ahFilterFields(task);
    if (!f || !(page >= 1) || Math.floor(page) !== page) return null;
    const fields = f.fields.slice();
    fields[AH_PAGE_FIELD] = String(page);
    const parts = f.parts.slice();
    parts[f.index] = 'filter=' + fields.join('|');
    return parts.join('&');
  }
  /* Zadanie niezalezne od strony - do wykrycia, ze gracz zmienil filtr. */
  function ahTaskScope(task) { return ahTaskWithPage(task, 1); }

  function auctionRowCount() {
    const table = document.querySelector('.auction-table');
    if (!table) return -1;
    return table.querySelectorAll('.item-slot-td .item').length;
  }

  /* Szybki licznik wierszy (wszystkie <tr>, z naglowkiem) - tylko do
   * wykrywania, ze gra dolozyla strone. table.rows to natywna kolekcja, bez
   * przeszukiwania selektorem calej tabeli przy kazdym sprawdzeniu (przy
   * tysiacach wierszy to kosztowalo). -1 = brak okna aukcji. */
  function auctionRowCountFast() {
    const table = document.querySelector('.auction-table');
    if (!table) return -1;
    return (table.rows || table.querySelectorAll('tr')).length;
  }

  const pager = { running: false, status: 'idle', message: '', page: 0, pages: 0, rows: 0, total: null };
  const pagerListeners = [];
  let pagerStopRequested = false;

  function pagerUpdate(patch) {
    Object.assign(pager, patch);
    for (const fn of pagerListeners) {
      try { fn(pager); } catch (e) { console.warn('[Ulepy] pager listener error', e); }
    }
  }
  function onPager(fn) { pagerListeners.push(fn); }
  function getPager() { return pager; }
  function stopLoadAll() { pagerStopRequested = true; }

  /* Wznawianie: po przerwaniu (zamkniecie okna, Zatrzymaj, zmiana filtra,
   * brak odpowiedzi) zapamietujemy liste (zadanie bez numeru strony) i
   * ostatnia zaladowana strone. Gdy gracz otworzy te sama liste, panel
   * pokazuje "Wznow od strony X". Tylko w pamieci - do przeladowania gry. */
  let resumeState = null;
  function getResumeInfo() {
    if (!resumeState) return null;
    /* matches tylko przy OTWARTYM oknie aukcji z ta sama lista - przy
     * zamknietym oknie przycisk "Wznow" i tak by nic nie zrobil (lokalny
     * test: pokazywal sie, a klikniety tylko prosil o otwarcie okna). */
    return { page: resumeState.page, pages: resumeState.pages, total: resumeState.total,
      matches: auctionRowCountFast() >= 0 && !!lastAhTask && ahTaskScope(lastAhTask) === resumeState.scope };
  }

  /* Czeka, az gra dolozy nowe wiersze do tabeli. MutationObserver reaguje
   * natychmiast po wyrenderowaniu odpowiedzi (bez opoznienia pollingu i bez
   * zadnych dodatkowych zapytan do serwera); rzadki polling zostaje jako
   * zapas, gdyby gra przebudowala cale okno i obserwowany wezel zniknal.
   * `before` i wynik to szybki licznik (auctionRowCountFast). */
  function waitForMoreRows(before, timeoutMs) {
    return new Promise(function (resolve) {
      let done = false, observer = null, poll = null, timer = null;
      function finish() {
        if (done) return;
        done = true;
        if (observer) observer.disconnect();
        clearInterval(poll);
        clearTimeout(timer);
        resolve(auctionRowCountFast());
      }
      function check() {
        const n = auctionRowCountFast();
        if (n > before || n < 0 || pagerStopRequested) finish();
      }
      /* Tylko sama tabela i rodzic wierszy, childList BEZ subtree - reaguje
       * wylacznie na dopisanie wierszy, a nie na co-sekundowe odliczanie
       * czasu w kazdym z tysiecy wierszy (przy duzych listach to kosztowalo). */
      const table = document.querySelector('.auction-table');
      const firstCell = table && table.querySelector('.item-slot-td');
      const rowParent = firstCell && firstCell.closest('tr') ? firstCell.closest('tr').parentNode : null;
      if (typeof MutationObserver === 'function' && table) {
        observer = new MutationObserver(check);
        observer.observe(table, { childList: true });
        if (rowParent && rowParent !== table) observer.observe(rowParent, { childList: true });
      }
      poll = setInterval(check, 250);
      timer = setTimeout(finish, timeoutMs);
      check();
    });
  }

  /* Na czas ladowania wiersze tabeli aukcji gry sa ukryte (sama klasa CSS,
   * nic nie jest usuwane - gra i dodatek dalej maja wszystkie wiersze w DOM,
   * zbieranie czyta je normalnie). Na zywo kazda kolejna strona szla wolniej
   * (srednio ok. 1,8 s/strone przy ~2700 widocznych wierszach, pierwsze
   * strony wyraznie szybciej), a ukrytych wierszy przegladarka nie uklada
   * ani nie rysuje. Po zakonczeniu lista wraca. */
  function setGameListHidden(hidden) {
    const w = document.querySelector('.auction-window');
    if (w) w.classList.toggle('mu-pager-running', !!hidden);
  }

  /* --- 5. Zawezenie widoku listy w oknie aukcji (tylko wizualne) ----- *
   * Klik oferty w Przedmiotach: w oknie aukcji gry zostaja widoczne tylko
   * wiersze tego samego przedmiotu (ta sama nazwa) w dokladnie tej samej cenie -
   * np. wszystkie 15 sztuk wystawionych przez jednego gracza. Sama klasa
   * CSS na wierszach, jak przy ukrywaniu listy podczas ladowania: nic nie
   * jest wysylane do gry, filtry gry sie nie zmieniaja, lista zostaje w DOM
   * i "Pokaz wszystko" przywraca ja od razu, bez ponownego ladowania.
   * Gdy gra doklada/usuwa wiersze (nowa strona, zakup), zawezenie jest
   * nakladane ponownie (narrowTick). */
  let narrow = null;   // { name, price, count, table, rows }
  const narrowListeners = [];
  function onNarrow(fn) { narrowListeners.push(fn); }
  function getNarrow() {
    return narrow ? { name: narrow.name, price: narrow.price, count: narrow.count } : null;
  }
  function emitNarrow() {
    const s = getNarrow();
    for (const fn of narrowListeners) {
      try { fn(s); } catch (e) { console.warn('[Ulepy] narrow listener error', e); }
    }
  }

  /* Oznacza wiersze pasujace do zawezenia; wynik = liczba pasujacych ofert,
   * -1 = brak okna aukcji. */
  function applyNarrow() {
    const table = document.querySelector('.auction-table');
    if (!narrow || !table) return -1;
    const trs = table.rows || table.querySelectorAll('tr');
    const now = Date.now();
    let n = 0;
    for (let i = 0; i < trs.length; i++) {
      const r = parseAuctionRow(trs[i], now);
      /* Naglowek i inne wiersze bez przedmiotu zostaja widoczne. */
      const keep = !r || !!(r.obs && r.obs.name === narrow.name && r.obs.price === narrow.price);
      trs[i].classList.toggle('mu-keep', keep);
      if (r && keep) n++;
    }
    table.classList.add('mu-narrowed');
    narrow.table = table;
    narrow.rows = trs.length;
    narrow.count = n;
    return n;
  }

  function clearNarrow() {
    if (!narrow) return;
    if (narrow.table) narrow.table.classList.remove('mu-narrowed');
    const cur = document.querySelector('.auction-table');
    if (cur) cur.classList.remove('mu-narrowed');
    narrow = null;
    emitNarrow();
  }

  /* { ok: true, count } albo { ok: false, reason: 'no-window' | 'none' } -
   * 'none': takiej oferty nie ma teraz w oknie (inna kategoria/filtr, kupiona). */
  function setNarrow(name, price) {
    if (narrow && narrow.table) narrow.table.classList.remove('mu-narrowed');
    narrow = { name: name, price: price, count: 0, table: null, rows: -1 };
    const n = applyNarrow();
    if (n > 0) { emitNarrow(); return { ok: true, count: n }; }
    if (narrow.table) narrow.table.classList.remove('mu-narrowed');
    narrow = null;
    emitNarrow();
    return { ok: false, reason: n < 0 ? 'no-window' : 'none' };
  }

  /* Co 0,7 s: nakladanie zawezenia na nowe/zmienione wiersze (tylko gdy
   * tabela albo liczba wierszy sie zmienila), zdjecie po zamknieciu okna. */
  function narrowTick() {
    if (!narrow || pager.running) return;
    const table = document.querySelector('.auction-table');
    if (!table) { clearNarrow(); return; }
    const len = (table.rows || table.querySelectorAll('tr')).length;
    if (table === narrow.table && len === narrow.rows) return;
    const before = narrow.count;
    applyNarrow();
    if (narrow.count !== before) emitNarrow();
  }

  function loadAllPages(opts) {
    if (pager.running) return Promise.resolve(pager);
    const total = auctionRowCount() > 0 && ahFilterFields(lastAhTask) ? auctionTotalCount() : NaN;
    if (!isFinite(total)) {
      pagerUpdate({ status: 'error', message: 'Otwórz dom aukcyjny w grze i wybierz kategorię – ' +
        'dodatek doładowuje dokładnie tę listę, którą gra właśnie pokazuje.' });
      return Promise.resolve(pager);
    }
    pagerStopRequested = false;
    /* Po zaladowaniu ma byc widoczna cala lista - zawezenie z Przedmiotow znika. */
    clearNarrow();
    const scope = ahTaskScope(lastAhTask);
    const pages = Math.min(PAGER_MAX_PAGES, Math.ceil(total / AH_PAGE_SIZE));
    let page = ahTaskPage(lastAhTask);
    /* Wznowienie tej samej listy od miejsca przerwania (patrz resumeState). */
    if (opts && opts.resume && resumeState && resumeState.scope === scope) page = Math.max(page, resumeState.page);
    resumeState = null;
    let loadedPages = 0, loadedMs = 0;
    setGameListHidden(true);
    pagerUpdate({ running: true, status: 'running', message: '', page: page, pages: pages,
      rows: auctionRowCount(), total: total, lastMs: null, avgMs: null });

    function finish(status, message) {
      try { scrapeDom(); } catch (e) {}
      setGameListHidden(false);
      /* Zapamietaj miejsce przerwania - chyba ze lista jest kompletna. */
      resumeState = status === 'done' || !(page > 1) ? null
        : { scope: scope, page: page, pages: pager.pages, total: pager.total };
      const avg = loadedPages ? ' Średnio ' + (loadedMs / loadedPages / 1000).toFixed(2) + ' s/stronę.' : '';
      pagerUpdate({ running: false, status: status, message: message + avg, rows: Math.max(0, auctionRowCount()) });
      return pager;
    }

    return (async function () {
      let misses = 0;
      for (;;) {
        if (pagerStopRequested) return finish('stopped', 'Zatrzymano.');
        const rows = auctionRowCount();
        if (rows < 0) return finish('stopped', 'Okno aukcji zostało zamknięte – zatrzymano. Otwórz tę samą listę, żeby wznowić.');
        if (ahTaskScope(lastAhTask) !== scope) {
          return finish('stopped', 'Filtr w grze się zmienił – zatrzymano, żeby nie mieszać list.');
        }
        /* Gracz mogl w miedzyczasie sam przewinac - gra wtedy juz poprosila
         * o dalsza strone i nie ma sensu pytac o nia drugi raz. */
        page = Math.max(page, ahTaskPage(lastAhTask) || 0);
        /* Licznik "Ilosc aukcji" gra aktualizuje z opoznieniem (na zywo:
         * start z 2887 po poprzedniej liscie, w trakcie ladowania 505) -
         * czytamy go wiec w kazdym obrocie, nie raz na starcie. */
        const totalNow = auctionTotalCount();
        if (isFinite(totalNow) && totalNow !== pager.total) {
          pagerUpdate({ total: totalNow, pages: Math.min(PAGER_MAX_PAGES, Math.ceil(totalNow / AH_PAGE_SIZE)) });
        }
        if (rows >= pager.total) return finish('done', 'Wczytano całą otwartą listę.');
        if (page >= pager.pages) {
          /* Wczesniej przy limicie stron komunikat mowil "cala lista" - na
           * liscie 35 tys. ofert byloby to nieprawda. */
          return Math.ceil(pager.total / AH_PAGE_SIZE) > PAGER_MAX_PAGES
            ? finish('stopped', 'Osiągnięto limit ' + PAGER_MAX_PAGES + ' stron – lista może być niekompletna.')
            : finish('done', 'Wczytano wszystkie strony otwartej listy.');
        }

        const next = ahTaskWithPage(lastAhTask, page + 1);
        if (!next) return finish('error', 'Nieznany format zapytania gry – nic nie wysłano.');
        const fastBefore = auctionRowCountFast();
        const t0 = Date.now();
        lastOwnAhTask = next;
        window._g(next);
        const fastAfter = await waitForMoreRows(fastBefore, PAGER_RESPONSE_TIMEOUT_MS);
        const ms = Date.now() - t0;
        const added = Math.max(0, fastAfter - fastBefore);
        if (added > 0) {
          /* Tylko nowe wiersze - bez pelnego skanu rosnacej tabeli. */
          scrapeNewRows(fastBefore);
          misses = 0;
          page++;
          loadedPages++;
          loadedMs += ms;
        } else if (++misses >= 2) {
          return finish('error', 'Gra nie dołożyła nowych ofert – zatrzymano.');
        }
        pagerUpdate({ page: page, rows: rows + added, lastMs: ms,
          avgMs: loadedPages ? Math.round(loadedMs / loadedPages) : null });
        /* Bez sztucznej przerwy - kolejna strona idzie od razu. Tempo wyznacza
         * kolejka zadan samej gry (_g odklada zadanie, gdy poprzednie jeszcze
         * trwa), a zapytania nigdy nie ida rownolegle. */
      }
    })().catch(function (e) { return finish('error', 'Błąd: ' + (e && e.message)); });
  }

  function install() {
    if (installed) return;
    installed = true;
    hookXhr();
    hookFetch();
    startGameTaskHook();
    startGlobalWatch(30000);
    /* Pelny skan co 8 s i dosuwanie listy sa wstrzymane na czas "Zaladuj
     * wszystkie strony" - ladowanie samo przetwarza nowe wiersze po kazdej
     * stronie (scrapeNewRows), a pelny skan robi raz, na koncu. */
    domTimer = setInterval(function () { if (!pager.running) scrapeDom(); }, 8000);
    keepScrolledTimer = setInterval(function () {
      /* Przy zawezonej liscie dosuwanie do dolu tylko by przeszkadzalo. */
      if (pager.running || narrow) return;
      try { keepScrolledNearBottom(); } catch (e) {}
    }, 1500);
    setInterval(function () { try { narrowTick(); } catch (e) {} }, 700);
  }

  return {
    install: install, onSnapshot: onSnapshot, diag: diag,
    loadAllPages: loadAllPages, stopLoadAll: stopLoadAll, getPager: getPager, onPager: onPager,
    getResumeInfo: getResumeInfo, onAhTask: onAhTask,
    setNarrow: setNarrow, clearNarrow: clearNarrow, getNarrow: getNarrow, onNarrow: onNarrow,
    ahTaskPage: ahTaskPage, ahTaskWithPage: ahTaskWithPage, ahTaskScope: ahTaskScope,
    keepScrolledNearBottom: keepScrolledNearBottom,
    startKeepScrolledNearBottom: startKeepScrolledNearBottom,
    stopKeepScrolledNearBottom: stopKeepScrolledNearBottom,
    getLiveSnapshot: getLiveSnapshot, onLiveSnapshot: onLiveSnapshot,
    getSessionItems: getSessionItems,
    scanPayload: scanPayload, scrapeDom: scrapeDom,
    scrapeAuctionTable: scrapeAuctionTable, scrapeDomFallback: scrapeDomFallback,
    pollGlobals: pollGlobals,
    scopeOf: scopeOf, startDomWatch: startDomWatch, stopDomWatch: stopDomWatch,
    stopGlobalWatch: stopGlobalWatch,
  };
})();

/* ===== 07-lifecycle.js ===== */
/* ------------------------------------------------------------------ *
 * MU.lifecycle - sledzenie aukcji miedzy migawkami.
 *
 * Zgodnie z decyzja uzytkownika: dodatek liczy srednia z CENY BIEZACYCH
 * OFERT (kup teraz) na aukcji - NIE czeka, az cokolwiek sie sprzeda albo
 * wygasnie. Kazda nowo zobaczona oferta trafia do proby od razu, raz
 * (przy pierwszym zobaczeniu danego aid), a dalej dziala zwykle
 * czyszczenie odstajacych wartosci (MU.stats) na tak zebranych cenach -
 * dokladnie tak jak w pierwotnej koncepcji.
 *
 * Ten modul sledzi tez, PO CICHU I OPCJONALNIE, czy oferta ostatecznie
 * znika przed czy po swoim czasie konca (sprzedaz vs wygasniecie) - to
 * dodatkowy sygnal plynnosci (patrz MU.aggregate.liquidity), ale NIE
 * jest to warunek zapisania jakiejkolwiek ceny. Wymaga to znajomosci,
 * czy widziana migawka byla PELNA (patrz `complete` w MU.sniffer) -
 * jesli nie, po prostu nie wnioskujemy nic dodatkowego, bez wplywu na
 * glowny zbior danych. */
MU.lifecycle = (function () {

  const U = MU.util;

  const GRACE_MS = 10 * 60 * 1000;      // tolerancja na nieprecyzyjny czas konca
  const MAX_GAP_MS = 6 * 60 * 60 * 1000; // powyzej tej przerwy nie wnioskujemy o znikniecu
  const MAX_TRACK_MS = 14 * MU.util.DAY_MS;

  const state = {
    counters: { sold: 0, expired: 0, ambiguous: 0, asks: 0, tracked: 0 },
    lastScopeSeen: {},   // scope -> ts ostatniej pelnej migawki
  };

  function obsFromRecord(rec, kind, price, ts) {
    const cfg = MU.cfg.get();
    const w = kind === 'sale' ? cfg.stats.saleWeight
            : kind === 'ambiguous' ? cfg.stats.ambiguousWeight
            : cfg.stats.askWeight;
    return {
      ts: ts,
      price: price,
      kind: kind,
      weight: w,
      baseName: rec.baseName,
      name: rec.name,
      lvl: rec.lvl,
      bracket: rec.bracket,
      category: rec.category,
      rarity: rec.rarity,
      upgrade: rec.upgrade,
      /* Ile dni oferta wisiala zanim sie rozstrzygnela - podstawa
       * do szacowania plynnosci i czasu zamrozenia kapitalu. */
      daysListed: rec.firstSeen ? U.round((ts - rec.firstSeen) / U.DAY_MS, 3) : null,
      itemKey: MU.normalize.itemKey(rec),
      gkey: MU.normalize.groupKey(rec),
      ckey: MU.normalize.coarseKey(rec),
      world: MU.cfg.get().world || null,
    };
  }

  /* Klasyfikacja znikniecia aukcji. */
  function classifyDisappearance(rec, now) {
    if (rec.endTs && isFinite(rec.endTs)) {
      if (now < rec.endTs - GRACE_MS) {
        /* Zniknela wczesniej niz miala - ktos ja wykupil. */
        return { kind: 'sale', price: rec.buyout || rec.price };
      }
      /* Dobila do konca. Jesli byly podbicia, to i tak sie sprzedala
       * (za ostatnia stawke); jesli nie - po prostu wygasla. */
      if (rec.bidRaised) return { kind: 'sale', price: rec.bid || rec.price };
      return { kind: 'expired', price: rec.price };
    }
    return { kind: 'ambiguous', price: rec.buyout || rec.price };
  }

  /* Przetworzenie jednej migawki. Zwraca obserwacje do zapisania. */
  function processSnapshot(observations, meta, live, now) {
    const t = now || Date.now();
    const cfg = MU.cfg.get();
    const scope = meta.scope || 'unknown';
    const toWrite = [];
    const toPut = [];
    const toDelete = [];

    const seenNow = new Set();

    for (const o of observations) {
      seenNow.add(o.aid);
      const prev = live[o.aid];
      if (prev) {
        const bidRaised = prev.bidRaised ||
          (isFinite(o.bid) && isFinite(prev.bid) && o.bid > prev.bid);
        toPut.push(Object.assign({}, prev, {
          lastSeen: t,
          price: o.price,
          bid: o.bid,
          buyout: o.buyout,
          endTs: o.endTs || prev.endTs,
          bidRaised: bidRaised,
          hits: (prev.hits || 0) + 1,
          scope: scope,
        }));
      } else {
        state.counters.tracked++;
        toPut.push({
          aid: o.aid, scope: scope, firstSeen: t, lastSeen: t,
          name: o.name, baseName: o.baseName, lvl: o.lvl, bracket: o.bracket,
          category: o.category, rarity: o.rarity, upgrade: o.upgrade,
          price: o.price, bid: o.bid, buyout: o.buyout, endTs: o.endTs,
          seller: o.seller, bidRaised: false, hits: 1,
        });
        /* Zapis biezacej oferty - domyslnie WLACZONY. Dodatek nie czeka
         * na zakonczenie aukcji: kazda nowo zobaczona oferta od razu
         * staje sie obserwacja ceny (raz na aid, przy pierwszym
         * zobaczeniu - kolejne odswiezenia tego samego wpisu juz nie
         * dopisuja duplikatow). */
        if (cfg.stats.includeAsks) {
          state.counters.asks++;
          toWrite.push(obsFromRecord(
            { ...o, firstSeen: t }, 'ask', o.price, t
          ));
        }
      }
    }

    /* Wnioskowanie o znikniecu tylko dla PELNYCH migawek tego samego
     * zakresu i tylko gdy poprzednia migawka nie jest przestarzala. */
    const prevSeenAt = state.lastScopeSeen[scope];
    const canInferGone = meta.complete && prevSeenAt && (t - prevSeenAt) < MAX_GAP_MS;

    for (const aid of Object.keys(live)) {
      const rec = live[aid];
      if (rec.scope !== scope) continue;
      if (seenNow.has(aid)) continue;

      if (canInferGone) {
        const res = classifyDisappearance(rec, t);
        if (isFinite(res.price) && res.price > 0) {
          toWrite.push(obsFromRecord(rec, res.kind, res.price, t));
          state.counters[res.kind === 'sale' ? 'sold'
                       : res.kind === 'expired' ? 'expired' : 'ambiguous']++;
        }
        toDelete.push(aid);
      } else if (t - rec.lastSeen > MAX_TRACK_MS) {
        /* Nie umiemy juz nic o niej powiedziec - przestajemy sledzic. */
        toDelete.push(aid);
      }
    }

    if (meta.complete) state.lastScopeSeen[scope] = t;

    return { write: toWrite, put: toPut, del: toDelete };
  }

  /* Podpiecie do sniffera + zapis do bazy. */
  /* getLiveByScope zamiast getLive: kazdy skan dotyczy jednego zakresu
   * (filtra) na raz, wiec nie ma potrzeby czytac (i pozniej przegladac w
   * processSnapshot) sledzonych ofert ze WSZYSTKICH innych kategorii,
   * ktore uzytkownik kiedykolwiek przegladal - zmierzony, realny wasski
   * gardlo przy dluzszym zbieraniu (patrz komentarz w MU.store, DB_VER). */
  function attach() {
    MU.sniffer.onSnapshot(function (observations, meta) {
      MU.store.getLiveByScope(meta.scope || 'unknown').then(function (live) {
        const res = processSnapshot(observations, meta, live, Date.now());
        return Promise.all([
          res.write.length ? MU.store.addObservations(res.write) : null,
          res.put.length ? MU.store.putLive(res.put) : null,
          res.del.length ? MU.store.deleteLive(res.del) : null,
        ]).then(function () {
          if (res.write.length && MU.ui && MU.ui.notifyNewData) MU.ui.notifyNewData(res.write.length);
        });
      }).catch(function (e) { console.warn('[Ulepy] lifecycle error', e); });
    });
  }

  return {
    attach: attach, processSnapshot: processSnapshot,
    classifyDisappearance: classifyDisappearance, state: state,
    GRACE_MS: GRACE_MS, MAX_GAP_MS: MAX_GAP_MS,
  };
})();

/* ===== 08-upgrade.js ===== */
/* ------------------------------------------------------------------ *
 * MU.upgrade - realny mechanizm systemu Rzemioslo (Ulepszanie).
 *
 * Wzory ponizej NIE SA zalozeniami do kalibracji - to potwierdzony,
 * udokumentowany mechanizm gry (zrodlo: forum.margonem.pl, watek
 * "Wiedza o Rzemiosle" - https://forum.margonem.pl/?task=forum&show=posts&id=511370,
 * z odwolaniem do oficjalnej Mechaniki Walk pomoc.margonem.pl/index/view,372
 * pkt 3.3). Kazda stala zweryfikowana przeciw przykladom liczbowym z tego
 * watku (patrz test/run.mjs).
 *
 * Kluczowa konsekwencja dla tego dodatku: koszt ulepszenia NIE ZALEZY od
 * kategorii przedmiotu (bron/pancerz/etc.) - zalezy wylacznie od poziomu
 * i rzadkosci. Kategoria ("grupa": bronie/pancerz/bizuteria) wplywa na
 * co innego - na to, ILE PUNKTOW dostajemy z poswiecenia danego
 * przedmiotu jako skladnika ulepszania innego przedmiotu.
 *
 * Dlatego cel tego dodatku upraszcza sie do jednego pytania: "ktory
 * przedmiot na aukcji daje najwiecej punktow ulepszenia za zlotowke?"
 * (koszt_za_punkt = cena / efektywne_punkty). Nie ma tu zadnego "kup i
 * sprzedaj drozej" - punkty sa zuzywane przez samego gracza.
 * ------------------------------------------------------------------ */
MU.upgrade = (function () {

  /* e - wspolczynnik rzadkosci uzywany we wzorze (180+lvl)*e. */
  const RARITY_E = { zwykly: 1, unikat: 10, heroik: 100, legenda: 1000 };

  /* n - wspolczynnik rzadkosci uzywany we wzorze na zloto przy finalizacji +5. */
  const RARITY_N = { zwykly: 1, unikat: 10, heroik: 30, legenda: 60 };

  /* Mnozniki kosztu punktowego kolejnych stopni: +0->+1 = 100%, ... +4->+5 = 200%. */
  const STEP_PCT = [1.00, 1.10, 1.30, 1.60, 2.00];

  /* Bazowa "wartosc" przedmiotu w formulach systemu ulepszania: (180+lvl)*e. */
  function formulaBase(lvl, rarity) {
    const l = Number(lvl) || 0;
    const e = RARITY_E[rarity];
    return (180 + l) * (e === undefined ? 1 : e);
  }

  /* Ile punktow ulepszenia daje POSWIECENIE przedmiotu, bez zadnych
   * bonusow za dopasowanie do celu (patrz sacrificeYield). Zaokraglenie
   * w dol - potwierdzone w poradniku wprost. */
  function basePoints(lvl, rarity) {
    return Math.floor(formulaBase(lvl, rarity) * 0.1);
  }

  /* Efektywne punkty z poswiecenia KONKRETNEGO przedmiotu (fodder) jako
   * skladnika ulepszania KONKRETNEGO celu (target). Bonusy sa addytywne
   * i niezalezne - dokladnie ten sam przedmiot automatycznie spelnia
   * wszystkie trzy warunki naraz (25%+200%+75% = 300%, co zgadza sie
   * z "rownowartosc 300%" z poradnika).
   *
   * fodder / target: { lvl, rarity, group, baseName, upgrade }
   *   group    - 'bronie' | 'pancerz' | 'bizuteria' | null (patrz MU.cfg categories[].group)
   *   upgrade  - poziom ulepszenia SAMEGO skladnika (0 = nieulepszony)
   *
   * target === null|undefined -> brak bonusow (widok "ile daje samo
   * poswiecenie", uzyteczny do porownan miedzy przedmiotami bez
   * zakladania, do czego akurat sluza). */
  function sacrificeYield(fodder, target) {
    const base = basePoints(fodder.lvl, fodder.rarity);
    /* "NIE DOSTAJEMY DODATKOWYCH PUNKTOW ULEPSZENIA ZA ULEPSZANIE
     * PRZEDMIOTOW PRZEDMIOTAMI JUZ ULEPSZONYMI" - regula wprost z poradnika. */
    if (fodder.upgrade > 0) return base;
    if (!target) return base;
    let mult = 1;
    if (fodder.group && target.group && fodder.group === target.group) mult += 0.25;
    if (fodder.rarity && fodder.rarity === target.rarity) mult += 2.00;
    if (fodder.baseName && fodder.baseName === target.baseName) mult += 0.75;
    return Math.floor(base * mult);
  }

  /* Koszt (w punktach) pojedynczego stopnia ulepszenia k -> k+1 (k = 0..4)
   * DLA PRZEDMIOTU, KTORY ULEPSZAMY (nie dla skladnika). */
  function stepPointsCost(lvl, rarity, step) {
    return formulaBase(lvl, rarity) * STEP_PCT[step];
  }

  function totalPointsCost(lvl, rarity, fromStep, toStep) {
    let sum = 0;
    for (let k = fromStep; k < toStep; k++) sum += stepPointsCost(lvl, rarity, k);
    return sum;
  }

  /* Jednorazowa oplata w zlocie przy finalizacji poziomu +5. */
  function finalizeGoldCost(lvl, rarity) {
    const l = Number(lvl) || 0;
    const n = RARITY_N[rarity];
    return (10 * l + 1300) * l * (n === undefined ? 1 : n);
  }

  /* "Wartosc esencjalna" przedmiotu - osobna, zaokraglana do najblizszej
   * wartosc uzywana m.in. przy Rozbijaniu (ile esencji daje rozbicie
   * przedmiotu na danym poziomie ulepszenia). */
  function essenceValue(lvl, upgradeLevel) {
    const l = Number(lvl) || 0;
    return Math.round((l / 10 + 10) * (1 + 0.2 * (upgradeLevel || 0)));
  }

  /* Koszt esencji przy finalizacji +5 - 300% Wartosci esencjalnej DLA
   * PRZEDMIOTU NIEULEPSZONEGO. Liczone jako jedno wyrazenie z
   * zaokragleniem na samym koncu (przyklad w poradniku: 16.3*300% =
   * 48.9 -> 49, a NIE round(16.3)*3 = 48 - kolejnosc ma znaczenie). */
  function finalizeEssenceCost(lvl) {
    const l = Number(lvl) || 0;
    return Math.round((l / 10 + 10) * 3.00);
  }

  /* Koszt za punkt: cena / efektywne punkty z poswiecenia. Nizej = lepsza
   * okazja - to jest GLOWNA miara opłacalnosci w tym dodatku. */
  function costPerPoint(price, fodder, target) {
    const pts = sacrificeYield(fodder, target);
    if (!(pts > 0) || !isFinite(price)) return NaN;
    return price / pts;
  }

  /* Kalkulator budzetu: ile najwyzej mozna placic za punkt ulepszenia, zeby
   * ulepszyc przedmiot z +fromStep do +5 w ramach budzetu. Liczone WYLACZNIE
   * z punktow - bez oplaty za finalizacje +5 i bez esencji (decyzja
   * uzytkownika). groupMaxPerPoint: skladniki z tej samej grupy co
   * ulepszany przedmiot daja +25% punktow, wiec za ich punkt bazowy mozna
   * zaplacic 1.25x wiecej. null = niepoprawne dane wejsciowe. */
  function budgetPlan(lvl, rarity, fromStep, budget) {
    const l = Number(lvl), from = Number(fromStep) || 0, b = Number(budget);
    if (!(l > 0) || RARITY_E[rarity] === undefined || !(from >= 0 && from < 5) || !(b > 0)) return null;
    const points = totalPointsCost(l, rarity, from, 5);
    /* sameRarity*: skladnik tej samej rzadkosci co ulepszany przedmiot
     * (+200%, np. heroik heroikiem), razem z grupa +225%. Ma sens tylko dla
     * celu unikat/heroik (legend jako skladnikow dodatek nie zbiera). */
    return { points: points, maxPerPoint: b / points, groupMaxPerPoint: b * 1.25 / points,
      sameRarityMaxPerPoint: b * 3 / points, sameRarityGroupMaxPerPoint: b * 3.25 / points };
  }

  /* Najwyzsza cena oferty, jaka moze sie jeszcze oplacac przy danej max
   * cenie za punkt - do wpisania w pole "Max. cena" w oknie aukcji, zeby gra
   * w ogole nie wysylala drozszych ofert (mniej stron do pobrania). Liczona
   * dla skladnika dajacego najwiecej punktow: najwyzszy poziom, ta sama
   * grupa co cel (+25%) i - gdy cel to unikat/heroik - ta sama rzadkosc
   * (+200%). Bonus "ten sam przedmiot" (+75%) pominiety: wymaga kupna
   * identycznego przedmiotu co ulepszany. */
  /* fodderRarity (opcjonalnie): pulap tylko dla skladnikow tej rzadkosci.
   * W praktyce zalecany jest pulap UNIKATU - heroikow tak tanio nikt nie
   * sprzedaje (uwaga uzytkownika), a pulap liczony z heroika kazalby grze
   * wysylac wszystkie unikaty az do 10x wyzszej ceny. */
  function maxOfferPrice(maxPerPoint, targetRarity, maxLvl, fodderRarity) {
    if (!(maxPerPoint > 0)) return NaN;
    const lvl = maxLvl || 300;
    let best = 0;
    for (const r of fodderRarity ? [fodderRarity] : ['unikat', 'heroik']) {
      const pts = sacrificeYield({ lvl: lvl, rarity: r, group: 'g', upgrade: 0 },
        { rarity: targetRarity, group: 'g' });
      if (pts > best) best = pts;
    }
    return maxPerPoint * best;
  }

  return {
    budgetPlan: budgetPlan, maxOfferPrice: maxOfferPrice,
    RARITY_E: RARITY_E, RARITY_N: RARITY_N, STEP_PCT: STEP_PCT,
    formulaBase: formulaBase, basePoints: basePoints, sacrificeYield: sacrificeYield,
    stepPointsCost: stepPointsCost, totalPointsCost: totalPointsCost,
    finalizeGoldCost: finalizeGoldCost, essenceValue: essenceValue,
    finalizeEssenceCost: finalizeEssenceCost, costPerPoint: costPerPoint,
  };
})();

/* ===== 09-aggregate.js ===== */
/* ------------------------------------------------------------------ *
 * MU.aggregate - hierarchiczna agregacja obserwacji + ranking oplacalnosci.
 *
 * Cel: dla kazdego przedmiotu (i dla kazdej kategorii x przedzial lvl x
 * rzadkosc jako widok zbiorczy) policzyc KOSZT ZA PUNKT ULEPSZENIA
 * (cena / efektywne punkty z poswiecenia - patrz MU.upgrade) i uszeregowac
 * od najtanszego. To bezposrednia odpowiedz na pytanie "co warto kupic
 * na skladniki" - bez zadnego zalozenia o tym, za ile cos potem sprzedac.
 *
 * Hierarchia (od najdokladniejszej):
 *   L0  konkretny przedmiot x rzadkosc x poziom ulepszenia  <- zakladka Przedmioty
 *   L1  kategoria x przedzial lvl x rzadkosc                <- zakladka Tabela
 *
 * Estymaty cen nadal korzystaja z odpornych statystyk (MAD, wagi
 * czasowe) opisanych w MU.stats - to sie nie zmienilo. Zmienilo sie
 * tylko to, DO CZEGO ta cena jest uzywana: nie do prognozy ceny po
 * ulepszeniu, tylko wprost do liczenia kosztu za punkt.
 * ------------------------------------------------------------------ */
MU.aggregate = (function () {

  const U = MU.util;
  const S = MU.stats;

  function groupBy(list, keyFn) {
    const m = new Map();
    for (const x of list) {
      const k = keyFn(x);
      if (k === null || k === undefined) continue;
      let a = m.get(k);
      if (!a) { a = []; m.set(k, a); }
      a.push(x);
    }
    return m;
  }

  /* Obserwacje uzywane do wyceny. "expired" nie jest cena transakcyjna -
   * to dowod, ze za tyle NIKT nie kupil - wiec do sredniej nie wchodzi,
   * ale liczy sie przy plynnosci. */
  function pricingObs(list, cfg) {
    return list.filter(function (o) {
      if (o.kind === 'sale' || o.kind === 'ambiguous') return true;
      if (o.kind === 'ask') return !!cfg.stats.includeAsks;
      return false;
    });
  }

  function summarizeGroup(list, cfg, now) {
    return S.summarize(
      list.map(function (o) { return { price: o.price, ts: o.ts, weight: o.weight }; }),
      {
        halfLifeDays: cfg.stats.halfLifeDays,
        madThreshold: cfg.stats.madThreshold,
        trimFraction: cfg.stats.trimFraction,
        logSpace: cfg.stats.logSpace,
        minSamples: cfg.stats.minSamples,
        now: now,
      }
    );
  }

  /* Plynnosc: jaki odsetek wystawien konczy sie sprzedaza. Tu nie sluzy
   * do liczenia "czasu zamrozenia kapitalu" (nie sprzedajemy dalej), ale
   * nadal informuje, czy dana pozycja w ogole bywa kupowana, czy raczej
   * wisi na aukcji az wygasnie - to sygnal jakosci oferty/ceny. */
  function liquidity(list) {
    let sold = 0, expired = 0;
    for (const o of list) {
      if (o.kind === 'sale') sold++;
      else if (o.kind === 'expired') expired++;
    }
    const total = sold + expired;
    return { sold: sold, expired: expired, sellThrough: total > 0 ? sold / total : NaN };
  }

  function meanLvl(list) {
    const vals = list.map(function (o) { return o.lvl; }).filter(function (v) { return isFinite(v); });
    if (!vals.length) return NaN;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  /* Najswiezsza obserwacja w grupie - do odsiania "martwych" pozycji
   * (przedmiot widziany raz, dawno temu, ktorego oferta juz na pewno nie
   * wisi na aukcji, ale wciaz miesci sie w oknie retencji cenowej). */
  function lastSeen(list) {
    let m = 0;
    for (const o of list) if (o.ts > m) m = o.ts;
    return m || NaN;
  }

  /* Zbudowanie pelnego indeksu z surowych obserwacji. */
  function buildIndex(observations, cfg, now) {
    const c = cfg || MU.cfg.get();
    const t = now || Date.now();
    const cutoff = t - c.stats.retentionDays * U.DAY_MS;
    const obs = (observations || []).filter(function (o) {
      return o && isFinite(o.ts) && o.ts >= cutoff && isFinite(o.price) && o.price > 0;
    });

    const byItem = groupBy(obs, function (o) { return o.itemKey; });
    const byGroup = groupBy(obs, function (o) { return o.gkey; });
    /* Grupowanie wg NADRZEDNEJ grupy zasobu (Bronie/Pancerz/Bizuteria -
     * patrz MU.cfg categories[].group), nie wg drobiazgowej kategorii -
     * uzywane przez zakladke Tabela (buildCoarseTable). Przedmioty bez
     * przypisanej grupy (np. "Inne") sa pomijane - nie naleza do zadnej
     * z trzech nadrzednych kategorii. */
    const byCoarseGroup = groupBy(obs, function (o) {
      const cat = MU.cfg.categoryById(o.category);
      if (!cat.group) return null;
      return coarseGroupKeyOf(cat.group, o.bracket, o.rarity, o.upgrade);
    });

    const groupStats = new Map();
    byGroup.forEach(function (list, k) {
      groupStats.set(k, {
        key: k,
        stats: summarizeGroup(pricingObs(list, c), c, t),
        liq: liquidity(list),
        lvl: meanLvl(list),
        sample: list[0],
        raw: list,
      });
    });

    const coarseGroupStats = new Map();
    byCoarseGroup.forEach(function (list, k) {
      coarseGroupStats.set(k, {
        key: k,
        stats: summarizeGroup(pricingObs(list, c), c, t),
        liq: liquidity(list),
        lvl: meanLvl(list),
        sample: list[0],
        raw: list,
      });
    });

    const itemStats = new Map();
    byItem.forEach(function (list, k) {
      itemStats.set(k, {
        key: k,
        stats: summarizeGroup(pricingObs(list, c), c, t),
        liq: liquidity(list),
        lvl: meanLvl(list),
        lastSeenTs: lastSeen(list),
        sample: list[0],
        raw: list,
      });
    });

    return {
      builtAt: t,
      cfg: c,
      nObs: obs.length,
      byItem: byItem, byGroup: byGroup,
      itemStats: itemStats, groupStats: groupStats, coarseGroupStats: coarseGroupStats,
      firstObsTs: obs.length ? Math.min.apply(null, obs.map(function (o) { return o.ts; })) : null,
    };
  }

  function gkeyOf(category, bracket, rarity, upgrade) {
    return [category, bracket, rarity, '+' + upgrade].join('|');
  }

  /* Jak gkeyOf, ale kluczowane nadrzedna grupa zasobu (Bronie/Pancerz/
   * Bizuteria) zamiast drobiazgowej kategorii - patrz buildCoarseTable. */
  function coarseGroupKeyOf(group, bracket, rarity, upgrade) {
    return ['G:' + group, bracket, rarity, '+' + upgrade].join('|');
  }

  /* Wpis kosztu za punkt dla jednej pozycji (grupy lub konkretnego
   * przedmiotu). `target` - patrz MU.upgrade.sacrificeYield (moze byc null).
   * `groupOverride` - gdy podane, uzywane wprost jako grupa zasobu skladnika
   * zamiast wyliczania jej z `category` (przypadek buildCoarseTable, gdzie
   * "category" to juz sama nadrzedna grupa, nie drobiazgowa kategoria). */
  function costRow(entry, category, target, cfg, groupOverride) {
    if (!entry || !entry.stats.n || !isFinite(entry.lvl)) return null;
    const price = entry.stats.median;
    if (!isFinite(price) || price <= 0) return null;
    const group = groupOverride !== undefined ? groupOverride : MU.cfg.categoryById(category).group;
    const rarity = entry.sample ? entry.sample.rarity : null;
    const upgrade = entry.sample ? entry.sample.upgrade : 0;
    const fodder = { lvl: entry.lvl, rarity: rarity, group: group, upgrade: upgrade,
      baseName: entry.sample ? entry.sample.baseName : null };
    const points = MU.upgrade.sacrificeYield(fodder, target);
    if (!(points > 0)) return null;
    return {
      price: price,
      lvl: entry.lvl,
      points: points,
      costPerPoint: price / points,
      n: entry.stats.n,
      confidence: entry.stats.confidence,
      trend: entry.stats.trendPerWeek,
      volatility: entry.stats.volatility,
      sellThrough: entry.liq ? entry.liq.sellThrough : NaN,
      bonusApplied: points > MU.upgrade.basePoints(entry.lvl, rarity),
    };
  }

  /* Zbudowanie wierszy tabeli zbiorczej (L1): kategoria x przedzial lvl x
   * rzadkosc, TYLKO dla skladnikow nieulepszonych (+0) - poswiecenie
   * czegokolwiek wyzej marnuje wlozone w to ulepszenie i tak nie daje
   * bonusu (patrz MU.upgrade), wiec +0 niemal zawsze dominuje jako wybor
   * na skladnik. Posortowane rosnaco po koszcie za punkt - najlepsza
   * okazja na gorze.
   *
   * opts: { target: {rarity, group} | null, categories[], rarities[],
   *         brackets[], minConfidence } */
  function buildTable(index, opts) {
    const o = opts || {};
    const cfg = index.cfg;
    const target = o.target || null;

    const cats = o.categories && o.categories.length
      ? o.categories : cfg.categories.map(function (c) { return c.id; });
    const rars = o.rarities && o.rarities.length
      ? o.rarities : cfg.rarities.map(function (r) { return r.id; });
    const brs = o.brackets && o.brackets.length
      ? o.brackets : cfg.brackets.map(function (b) { return b[0] + '-' + b[1]; });

    const rows = [];
    for (const br of brs) {
      for (const cat of cats) {
        for (const rar of rars) {
          const entry = index.groupStats.get(gkeyOf(cat, br, rar, 0));
          const row = costRow(entry, cat, target, cfg);
          if (!row) continue;
          if (o.minConfidence && row.confidence < o.minConfidence) continue;
          rows.push(Object.assign({ bracket: br, category: cat, rarity: rar, upgrade: 0 }, row));
        }
      }
    }
    rows.sort(function (a, b) { return a.costPerPoint - b.costPerPoint; });
    return rows;
  }

  /* Zbudowanie wierszy zakladki Tabela wg NADRZEDNEJ struktury: dokladnie
   * jedna grupa zasobu (Bronie/Pancerz/Bizuteria) x dokladnie jedna
   * rzadkosc (wybrane w pasku filtrow) x PELNA siatka przedzialow
   * poziomowych. W przeciwienstwie do buildTable, KAZDY przedzial z
   * `cfg.brackets` jest zawsze zwracany, nawet bez wystarczajacych
   * danych (`empty: true`) - to celowe: uzytkownik ma widziec pelny
   * zakres 21-300, nie tylko przedzialy, ktore akurat maja dane.
   *
   * opts: { group (wymagane), rarity (wymagane), target, brackets[] } */
  function buildCoarseTable(index, opts) {
    const o = opts || {};
    const cfg = index.cfg;
    const target = o.target || null;
    const group = o.group;
    const rarity = o.rarity;
    const brs = o.brackets && o.brackets.length
      ? o.brackets : cfg.brackets.map(function (b) { return b[0] + '-' + b[1]; });

    const rows = [];
    for (const br of brs) {
      const entry = index.coarseGroupStats.get(coarseGroupKeyOf(group, br, rarity, 0));
      const row = costRow(entry, null, target, cfg, group);
      if (row) {
        rows.push(Object.assign({ bracket: br, category: group, rarity: rarity, upgrade: 0, empty: false }, row));
      } else {
        rows.push({ bracket: br, category: group, rarity: rarity, upgrade: 0, empty: true,
          price: NaN, lvl: NaN, points: NaN, costPerPoint: NaN, n: 0, confidence: 0 });
      }
    }
    return rows;
  }

  /* Zbudowanie wierszy tabeli szczegolowej (L0): konkretny przedmiot x
   * rzadkosc x poziom ulepszenia (wlacznie z ulepszonymi - pokazane, ale
   * bez bonusow, zgodnie z regula gry).
   *
   * opts.maxAgeDays - jesli podane, odsiewa pozycje, ktorych NAJSWIEZSZA
   * obserwacja jest starsza niz tyle dni. Bez tego lista rosnie w
   * nieskonczonosc martwymi wpisami: przedmiot widziany raz, dawno temu,
   * ktorego oferta na pewno juz nie wisi na aukcji, ale wciaz miesci sie
   * w 60-dniowym oknie retencji cenowej (index.cfg.stats.retentionDays)
   * uzywanym do samych statystyk. */
  function buildItemTable(index, opts) {
    const o = opts || {};
    const cfg = index.cfg;
    const target = o.target || null;
    const now = index.builtAt || Date.now();
    const cutoff = isFinite(o.maxAgeDays) ? now - o.maxAgeDays * U.DAY_MS : null;
    const rows = [];
    index.itemStats.forEach(function (entry) {
      const s = entry.sample;
      if (!s) return;
      if (o.categories && o.categories.length && o.categories.indexOf(s.category) < 0) return;
      if (o.rarities && o.rarities.length && o.rarities.indexOf(s.rarity) < 0) return;
      if (cutoff !== null && !(entry.lastSeenTs >= cutoff)) return;
      const row = costRow(entry, s.category, target, cfg);
      if (!row) return;
      if (o.minConfidence && row.confidence < o.minConfidence) return;
      rows.push(Object.assign({
        name: s.name, baseName: s.baseName, category: s.category, rarity: s.rarity,
        upgrade: s.upgrade, lastSeenTs: entry.lastSeenTs,
      }, row));
    });
    rows.sort(function (a, b) { return a.costPerPoint - b.costPerPoint; });
    return rows;
  }

  /* Tabela BIEZACA (zakladka Przedmioty): jeden wiersz = jedna KONKRETNA
   * oferta aktualnie widoczna w oknie aukcji (migawka z MU.sniffer.
   * getLiveSnapshot, nie baza historyczna) - bez usredniania, MAD-a czy
   * wag czasowych, bo to nie prognoza rynku tylko lista realnych ofert
   * do kupienia TERAZ. Celowo osobna funkcja od buildItemTable (ktora
   * czyta z historycznego `index`) - te dwa mechanizmy maja pozostac
   * niezalezne (patrz zadanie uzytkownika o rozdzieleniu zbierania w tle
   * od widoku biezacego). */
  function buildLiveTable(liveItems, opts) {
    const o = opts || {};
    const target = o.target || null;
    const rows = [];
    for (const s of (liveItems || [])) {
      if (!s || !isFinite(s.lvl) || !isFinite(s.price) || s.price <= 0) continue;
      if (o.categories && o.categories.length && o.categories.indexOf(s.category) < 0) continue;
      if (o.rarities && o.rarities.length && o.rarities.indexOf(s.rarity) < 0) continue;
      const cat = MU.cfg.categoryById(s.category);
      const fodder = { lvl: s.lvl, rarity: s.rarity, group: cat.group,
        upgrade: s.upgrade, baseName: s.baseName };
      const points = MU.upgrade.sacrificeYield(fodder, target);
      if (!(points > 0)) continue;
      rows.push({
        aid: s.aid, name: s.name, baseName: s.baseName, category: s.category,
        rarity: s.rarity, upgrade: s.upgrade, lvl: s.lvl, price: s.price,
        points: points, costPerPoint: s.price / points,
        bonusApplied: points > MU.upgrade.basePoints(s.lvl, s.rarity),
      });
    }
    rows.sort(function (a, b) { return a.costPerPoint - b.costPerPoint; });
    return rows;
  }

  return {
    buildIndex: buildIndex, buildTable: buildTable, buildCoarseTable: buildCoarseTable,
    buildItemTable: buildItemTable, buildLiveTable: buildLiveTable,
    costRow: costRow, liquidity: liquidity, summarizeGroup: summarizeGroup,
    pricingObs: pricingObs, gkeyOf: gkeyOf, coarseGroupKeyOf: coarseGroupKeyOf,
    groupBy: groupBy, meanLvl: meanLvl,
  };
})();

/* ===== 10-ui.js ===== */
/* ------------------------------------------------------------------ *
 * MU.ui - panel wynikowy.
 *
 * Jedna tabela odpowiadajaca na jedno pytanie: "co najtaniej daje punkty
 * ulepszenia?" (cena / efektywne punkty z poswiecenia - patrz MU.upgrade).
 * Zadnego "kup i sprzedaj drozej" - punkty sluza do wlasnego ulepszania,
 * wiec jedyna miara oplacalnosci to koszt za punkt. Domyslny sort:
 * rosnaco po koszcie za punkt (najlepsza okazja na gorze).
 * ------------------------------------------------------------------ */
MU.ui = (function () {

  const U = MU.util;
  let root = null, panel = null, index = null, lastRows = [], lastRowsItems = [];
  /* Domyslny sort Tabeli: rosnaco po przedziale lvl (patrz zadanie
   * uzytkownika) - NIE po koszcie za punkt jak wczesniej. Przedmioty
   * (ITEM_COLS/sortKeyItems ponizej) maja wlasny, osobny stan sortowania. */
  let sortKey = 'bracket', sortDir = 1;
  /* Pierwsza zakladka to Przedmioty - "Srednie ceny" (id 'tabela') sa na
   * koncu jako podglad rynku (uwaga uzytkownika). */
  let activeTab = 'przedmioty';

  /* Etykiety trzech nadrzednych grup zasobu (Bronie/Pancerz/Bizuteria -
   * patrz MU.cfg categories[].group) - uzywane wylacznie w zakladce
   * Tabela, ktora teraz operuje na tym nadrzednym podziale zamiast
   * drobiazgowych kategorii (patrz MU.aggregate.buildCoarseTable). */
  const GROUP_LABELS = { bronie: 'Bronie', pancerz: 'Pancerze', bizuteria: 'Biżuteria' };
  const GROUP_ORDER = ['bronie', 'pancerz', 'bizuteria'];

  /* Cel ulepszania (rzadkosc/grupa/poziom) nie jest juz tutaj - bierzemy go
   * z Kalkulatora (patrz currentTarget i `calc`), jedno miejsce zamiast dwoch. */
  const state = {
    tableGroup: 'bronie',    // zakladka Srednie ceny: dokladnie JEDNA z 3 grup zasobu
    tableRarity: 'unikat',   // zakladka Srednie ceny: dokladnie JEDNA z 2 rzadkosci (unikat/heroik)
  };

  const CSS = `
/* --- Ikona w stylu paska widgetow gry (.widget-button.green - patrz
 * top-right/top-left main-buttons-container) - zastepuje dawny wlasny
 * okragly przycisk. Stoi TUZ OBOK natywnego paska (nie wewnatrz niego -
 * gra sama zarzadza ukladem swoich .widget-button i wstawienie obcego
 * elementu do srodka ryzykowaloby, ze zostanie nadpisany przy kolejnym
 * przeliczeniu ukladu), wiec wyglada jak jego naturalna kontynuacja bez
 * ingerowania w kod gry. */
.mu-bar-icon{position:fixed;z-index:2147483000;width:44px;height:44px;border-radius:4px;
  background-image:linear-gradient(#3a5a2a,#16250f);border:1px solid #0c0d0d;
  box-shadow:0 0 0 1px #cecece inset,0 0 0 3px #0c0d0d inset;cursor:pointer;padding:0;
  display:flex;align-items:center;justify-content:center;transition:filter .12s ease}
.mu-bar-icon:hover{filter:brightness(1.18)}
.mu-bar-icon:active{filter:brightness(.92)}
.mu-bar-icon .mu-bi-glyph{font:700 17px/1 system-ui,sans-serif;color:#e8dcc0;text-shadow:0 1px 1px #000}
.mu-bar-icon .mu-dot{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;background:#c0562e;
  color:#fff;font:600 10px/16px system-ui,sans-serif;display:none;padding:0 4px;box-shadow:0 0 0 2px #1a1512}

/* --- Okno dodatku: reuzywa NATYWNYCH klas okien Margonem (c-window,
 * border-window, header-label-positioner, close-button-corner-decor,
 * cards-header-wrapper...) - naglowek, przycisk zamkniecia i wyglad
 * zakladek pochodza wprost z JUZ zaladowanego arkusza stylow gry. Wlasny
 * CSS ponizej (wnetrze: pasek filtrow, tabela, statystyki) zostal
 * zbudowany na podstawie REALNYCH tokenow kolorystycznych/typograficznych
 * zbadanych na zywo w innych oknach gry (Aukcje, paski postepu questow/
 * rzemiosla) - nie na wlasnej interpretacji "ciemnego motywu fantasy":
 *   - tlo/tekst tabeli: rgb(255,255,255) na czarnych odcieniach - dokladnie
 *     jak wiersze .auction-table w oknie Aukcji.
 *   - szary rgb(112,113,114) dla stanu "nieaktywny" - dokladnie jak
 *     .action-menu-item w lewym panelu Aukcji.
 *   - pasek postepu (.mu-progress) - te same wartosci co natywna klasa
 *     gry .interface-element-progress-bar-2 (tor/obwodka/gradient wypelnienia).
 *   - font: Arimo/Calibri/Segoe - ten sam stack, ktorego gra uzywa wszedzie.
 * Rozmiar okna: CELOWO waski (ma stac OBOK okna Aukcji na ekranie
 * rownoczesnie, nie zaslaniac go) - patrz zadanie uzytkownika. 460px
 * (nie 400px) - zweryfikowane na zywo, ze Przedmioty (7 kolumn) przy
 * 400px wymuszaja poziome przewijanie. */
.mu-window{position:fixed;display:none;z-index:2147483000;width:min(460px,calc(100vw - 24px));
  /* Natywny border-image (window-frame.png) renderuje sie nieprawidlowo
   * (blade/jasne, "biale" pasy) przy tak waskiej, niestandardowej
   * szerokosci okna - zweryfikowane na zywo. Wlasna, jednolicie ciemna
   * ramka zamiast ryzykowac jasne artefakty - naglowek/zakladki/przycisk
   * zamkniecia (osobne elementy, bez tego problemu) zostaja natywne. */
  border-image:none;border-color:#000;background:#141414;
  /* Bez tego przegladarka rysuje wlasny, JASNY domyslny suwak przewijania
   * (motyw strony nigdy nie zadeklarowal color-scheme:dark) - to on byl
   * zrodlem "bialych zaokraglonych naroznikow" w gornej/dolnej czesci
   * prawej krawedzi okna, zweryfikowane na zywo (computed color-scheme
   * bylo "normal", nie "dark"). Ponizsze ::-webkit-scrollbar to dodatkowe,
   * jawne dociemnienie - dziala nawet gdy samo color-scheme z jakiegos
   * powodu nie wystarczy. */
  color-scheme:dark}
.mu-window.mu-open{display:block}
.mu-window .content{padding:0}
.mu-body::-webkit-scrollbar{width:10px}
.mu-body::-webkit-scrollbar-track{background:#1a1a1a}
.mu-body::-webkit-scrollbar-thumb{background:#444;border-radius:5px}
.mu-body::-webkit-scrollbar-thumb:hover{background:#555}
.mu-window .header-label .text{display:flex;align-items:baseline;gap:7px;justify-content:center}
.mu-window .header-label-positioner{cursor:move}
.mu-window .cards-header-wrapper.tabs-nav .card{cursor:pointer}
.mu-window .inner-content{display:flex;flex-direction:column;
  height:min(560px,calc(100vh - 130px));min-height:260px}
/* --- Wnetrze panelu (wszystko ponizej naglowka i zakladek gry) - jeden
 * spojny zestaw tokenow zamiast recznie dobieranych kolorow w kazdej
 * regule: cienkie linie zamiast ciezkich czarnych ramek, zaokraglone
 * karty, jeden akcent (zloto) i zielen wylacznie dla "miesci sie w
 * budzecie" (uwaga uzytkownika: "cos nie siedzi", ciemna kolorystyka
 * zostaje). Naglowek/zakladki/przycisk zamkniecia nadal natywne z gry. */
.mu-window{--mu-bg:#121212;--mu-s1:#181818;--mu-s2:#1e1e1e;--mu-s3:#262626;--mu-line:#252525;--mu-line2:#343434;
  --mu-tx:#ebe7e0;--mu-tx2:#a8a29a;--mu-tx3:#77726b;--mu-gold:#e6bd6a;--mu-gold-d:#b98f45;--mu-gold-hi:#f3d28e;
  --mu-gold-bg:rgba(230,189,106,.07);--mu-gold-line:rgba(230,189,106,.26);
  --mu-green:#82d69c;--mu-green-bg:rgba(130,214,156,.07);
  --mu-blue:#93b6d8;--mu-blue-bg:rgba(147,182,216,.06);--mu-blue-line:rgba(147,182,216,.24);
  --mu-red:#e39191;--mu-r:6px}
.mu-body{flex:1;overflow:auto;padding:10px;background:var(--mu-bg);color:var(--mu-tx);
  font:12px/1.45 Arimo,Calibri,Segoe,"Segoe UI",Optima,Arial,sans-serif}
.mu-body::-webkit-scrollbar{width:8px}
.mu-body::-webkit-scrollbar-track{background:transparent}
.mu-body::-webkit-scrollbar-thumb{background:#2e2e2e;border-radius:4px}
.mu-body::-webkit-scrollbar-thumb:hover{background:#3d3d3d}
.mu-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:7px 10px;
  border-bottom:1px solid var(--mu-line);background:#151515}
.mu-bar .mu-fld{display:flex;flex-direction:column;gap:3px}
.mu-bar .mu-fld>span{font-size:10px;color:var(--mu-tx3);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.mu-bar select,.mu-bar input{background:var(--mu-s2);border:1px solid var(--mu-line2);color:var(--mu-tx);border-radius:var(--mu-r);
  padding:3px 7px;font-size:12px;height:26px;transition:border-color .12s ease}
.mu-bar select{cursor:pointer;min-width:88px}
.mu-bar select:hover,.mu-bar input:hover{border-color:#4a4a4a}
.mu-bar select:focus-visible,.mu-bar input:focus-visible,.mu-btn:focus-visible,.mu-icon-btn:focus-visible,
.mu-seg:focus-visible,.mu-link:focus-visible,table.mu-t th:focus-visible{outline:2px solid var(--mu-gold-d);outline-offset:1px}
.mu-btn{background:var(--mu-s3);border:1px solid var(--mu-line2);color:var(--mu-tx);border-radius:var(--mu-r);padding:0 12px;height:28px;
  cursor:pointer;font-size:12px;font-weight:600;transition:background .12s ease,border-color .12s ease,transform .05s ease}
.mu-btn:hover{background:#2f2f2f;border-color:#474747}
.mu-btn:active{transform:translateY(1px)}
/* Glowna akcja zakladki Zbieranie - jedyny przycisk w kolorze akcentu. */
#mu-load-all,#mu-load-resume{background:#2b2417;border-color:#5e4b27;color:#f1d59a}
#mu-load-all:hover,#mu-load-resume:hover{background:#352c1b;border-color:#7a6232}
.mu-bar-spacer{flex:1 0 4px}
.mu-goal{font-size:12px;color:var(--mu-tx3);line-height:1.4}
.mu-goal b{color:var(--mu-tx);font-weight:600}
.mu-link{background:none;border:none;border-bottom:1px dotted var(--mu-gold-d);padding:0;margin-left:4px;color:var(--mu-gold);
  cursor:pointer;font-size:12px}
.mu-link:hover{color:var(--mu-gold-hi)}
.mu-icon-btn{background:var(--mu-s3);border:1px solid var(--mu-line2);color:var(--mu-tx2);border-radius:var(--mu-r);width:26px;height:26px;
  cursor:pointer;font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;
  transition:background .12s ease,color .12s ease}
.mu-icon-btn:hover{background:#2f2f2f;color:var(--mu-tx)}
.mu-icon-btn:active{transform:translateY(1px)}
/* Przelacznik: przyciski w jednej "rynience" (ciemniejsze wglebienie),
 * aktywny jako jasniejszy klawisz - zamiast zlaczonych gradientow. */
.mu-seg-block{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mu-seg-lbl{font-size:10px;color:var(--mu-tx3);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.mu-seg-row{display:inline-flex;justify-self:start;gap:2px;padding:2px;background:rgba(0,0,0,.3);
  border:1px solid var(--mu-line);border-radius:var(--mu-r)}
.mu-seg{padding:3px 10px;font-size:12px;font-weight:600;cursor:pointer;color:var(--mu-tx3);background:transparent;
  border:none;border-radius:4px;transition:color .12s ease,background .12s ease}
.mu-seg:hover{color:var(--mu-tx);background:#202020}
.mu-seg.mu-active{color:#fff;background:#333;box-shadow:inset 0 0 0 1px #454545}
.mu-row{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px}
.mu-subtitle{font-size:11px;color:var(--mu-tx2);margin:0 0 10px;line-height:1.55}
.mu-subtitle b{color:var(--mu-gold);font-weight:600}
/* Statystyki jako male "pigulki" zamiast ciagu tekstu z linia pod spodem. */
.mu-stats-line{font-size:11px;color:var(--mu-tx3);margin:0 0 10px;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.mu-stats-line>span{background:var(--mu-s1);border:1px solid var(--mu-line);border-radius:999px;padding:2px 9px}
.mu-stats-line b{color:var(--mu-tx);font-weight:600;font-variant-numeric:tabular-nums}
.mu-stats-line b.mu-hi{color:var(--mu-gold)}
.mu-stats-line b.mu-pos{color:var(--mu-green)}
.mu-progress-wrap{display:flex;align-items:center;gap:6px;margin-left:auto;color:var(--mu-tx3)}
.mu-progress{width:56px;height:6px;background:#2a2a2a;border-radius:3px;overflow:hidden}
.mu-progress i{display:block;height:100%;background:var(--mu-gold-d)}
.mu-target{margin:0 0 10px;border:1px solid var(--mu-line);border-radius:8px;background:var(--mu-s1)}
.mu-target summary{padding:7px 10px;cursor:pointer;font-size:10px;color:var(--mu-tx2);text-transform:uppercase;
  letter-spacing:.06em;font-weight:600;list-style:none}
.mu-target summary:hover{color:var(--mu-tx)}
.mu-target summary::-webkit-details-marker{display:none}
.mu-target summary::before{content:'\\25B8\\0020';display:inline-block;color:var(--mu-tx3)}
.mu-target[open] summary::before{content:'\\25BE\\0020'}
.mu-target[open] summary{border-bottom:1px solid var(--mu-line)}
.mu-target-body{padding:8px 10px;display:flex;flex-wrap:wrap;gap:8px}
/* Tabele: bez zebry i ciezkich ramek - cienkie separatory, rowne cyfry
 * (tabular-nums), naglowek male kapitaliki. */
table.mu-t{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;font-variant-numeric:tabular-nums}
table.mu-t th{position:sticky;top:0;background:#161616;color:var(--mu-tx3);text-align:right;padding:6px 5px;
  border-bottom:1px solid var(--mu-line2);cursor:pointer;white-space:nowrap;font-weight:600;font-size:10px;
  text-transform:uppercase;letter-spacing:.04em;z-index:1;user-select:none;transition:color .12s ease}
table.mu-t th:hover{color:var(--mu-tx)}
table.mu-t th.mu-sorted{color:var(--mu-gold);box-shadow:inset 0 -2px 0 var(--mu-gold-d)}
table.mu-t th:first-child{text-align:left}
table.mu-t td{padding:5px;border-bottom:1px solid #1d1d1d;text-align:right;white-space:nowrap;color:var(--mu-tx)}
/* Pierwsza kolumna (nazwa przedmiotu / przedzial) moze sie zawijac -
 * nazwy nie maja gornego limitu dlugosci. */
table.mu-t td:first-child{text-align:left;white-space:normal;word-break:break-word;max-width:150px}
table.mu-t tbody tr:hover td{background:rgba(255,255,255,.035)}
table.mu-t td.mu-hi{color:var(--mu-gold);font-weight:700}
/* Oferta miesci sie w budzecie z Kalkulatora - zielony koszt/pkt i pasek po lewej. */
table.mu-t tbody tr.mu-ok td{background:var(--mu-green-bg)}
table.mu-t tbody tr.mu-ok:hover td{background:rgba(130,214,156,.12)}
table.mu-t tbody tr.mu-ok td:first-child{box-shadow:inset 2px 0 0 var(--mu-green)}
table.mu-t tbody tr.mu-ok td.mu-hi{color:var(--mu-green)}
table.mu-t tbody tr.mu-click{cursor:pointer}
/* Oferty, do ktorych zawezono okno aukcji - zloty pasek. */
table.mu-t tbody tr.mu-sel td{background:rgba(230,189,106,.10)}
table.mu-t tbody tr.mu-sel td:first-child{box-shadow:inset 2px 0 0 var(--mu-gold)}
.mu-narrow-note{background:var(--mu-green-bg);border:1px solid rgba(130,214,156,.3);border-radius:8px;
  padding:7px 10px;margin:0 0 10px;font-size:12px;line-height:1.5;color:var(--mu-tx)}
.mu-narrow-note b{color:var(--mu-green)}
.auction-window.mu-pager-running .auction-table tr{display:none}
/* Zawezenie listy w oknie aukcji po kliknieciu oferty w Przedmiotach -
 * tylko widok (patrz MU.sniffer.setNarrow). */
.auction-table.mu-narrowed tr:not(.mu-keep){display:none}
.auction-table.mu-narrowed{outline:2px solid rgba(130,214,156,.6);outline-offset:-1px}
/* Podpowiedz "Max. cena" - zlota karta; informacja (Srednie ceny) - ta sama
 * karta w chlodnym kolorze. Pelna, delikatna ramka zamiast grubego paska. */
.mu-callout{margin:10px 0 8px;padding:10px 12px;border:1px solid var(--mu-gold-line);border-radius:8px;
  background:var(--mu-gold-bg);color:var(--mu-tx);font-size:12px;line-height:1.5}
.mu-callout .mu-callout-lbl{display:block;font-size:10px;color:var(--mu-gold);text-transform:uppercase;
  letter-spacing:.06em;font-weight:700;margin-bottom:4px}
.mu-callout .mu-callout-val{font-size:17px;font-weight:700;color:var(--mu-gold-hi);font-variant-numeric:tabular-nums}
.mu-callout .mu-callout-sub{color:var(--mu-tx2);font-size:11px}
.mu-callout b{color:var(--mu-gold-hi)}
.mu-callout-row+.mu-callout-row{margin-top:8px}
.mu-callout-foot{margin-top:9px;padding-top:8px;border-top:1px solid var(--mu-gold-line)}
.mu-callout.mu-info{border-color:var(--mu-blue-line);background:var(--mu-blue-bg)}
.mu-callout.mu-info .mu-callout-lbl{color:var(--mu-blue)}
.mu-callout.mu-info b{color:#d3e3f2}
.mu-calc-line{font-size:11px;color:var(--mu-tx2);margin:0 0 10px;line-height:1.5}
.mu-calc-line b{color:var(--mu-tx);font-variant-numeric:tabular-nums}
/* Formularz kalkulatora jako siatka: etykiety w jednej kolumnie, przyciski
 * i pola rowno pod soba. */
.mu-calc-grid{display:grid;grid-template-columns:max-content 1fr;align-items:center;gap:7px 12px;margin:0 0 12px}
.mu-calc-inputs{display:flex;align-items:center;gap:12px}
.mu-calc-grid input{box-sizing:border-box;background:var(--mu-s2);border:1px solid var(--mu-line2);color:var(--mu-tx);
  border-radius:var(--mu-r);padding:3px 8px;font-size:12px;height:26px;font-variant-numeric:tabular-nums;
  transition:border-color .12s ease}
.mu-calc-grid input:hover{border-color:#4a4a4a}
.mu-calc-grid input:focus{border-color:var(--mu-gold-d);outline:none}
#mu-calc-lvl{width:64px}
#mu-calc-budget{width:100px}
.mu-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 4px}
.mu-tile{box-sizing:border-box;min-width:0;padding:8px 11px;background:var(--mu-s1);border:1px solid var(--mu-line);border-radius:8px}
.mu-tile-lbl{display:block;font-size:10px;color:var(--mu-tx3);text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.mu-tile-val{display:block;font-size:20px;font-weight:700;color:var(--mu-gold);line-height:1.25;font-variant-numeric:tabular-nums}
.mu-status{font-size:11px;margin:10px 0 0;line-height:1.5;color:var(--mu-tx2)}
/* Pusty przedzial: caly wiersz wygaszony, komorki poza pierwsza puste. */
tr.mu-empty-row td{color:#3d3d3d}
tr.mu-empty-row td:first-child{color:var(--mu-tx3)}
.mu-v{padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600;display:inline-block}
.mu-v-oplaca{background:#1d3a24;color:#6ee08a;border:1px solid #2f6b3d}
.mu-v-ryzykowne{background:#3a3218;color:#e0c46e;border:1px solid #6b5c2f}
.mu-v-marginalne{background:#2a2a2a;color:#b0b0b0;border:1px solid #4a4a4a}
.mu-v-nie-oplaca{background:#3a1d1d;color:#e08a8a;border:1px solid #6b2f2f}
.mu-v-za-malo-danych,.mu-v-brak-danych{background:#22252e;color:#7f8ba3;border:1px solid #39415a}
.mu-pos{color:var(--mu-green)}.mu-neg{color:var(--mu-red)}.mu-mut{color:var(--mu-tx3)}
.mu-conf{display:inline-flex;align-items:center;gap:5px;vertical-align:middle}
.mu-conf i{display:block;width:26px;height:5px;background:#2a2a2a;border-radius:3px;overflow:hidden}
.mu-conf i b{display:block;height:100%;background:#6b8f4a;transition:width .2s ease}
.mu-conf span{font-size:10px;color:var(--mu-tx3);min-width:22px}
.mu-empty{padding:30px 16px;text-align:center;color:var(--mu-tx3);line-height:1.6;font-size:12px}
.mu-empty b{color:var(--mu-tx)}
.mu-sec{margin:2px 0 10px;font-size:10px;color:var(--mu-tx3);text-transform:uppercase;letter-spacing:.08em;font-weight:700}
.mu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:14px}
.mu-f{background:var(--mu-s1);border:1px solid var(--mu-line);border-radius:8px;padding:6px 8px;transition:border-color .12s ease}
.mu-f:focus-within{border-color:#4a4a4a}
.mu-f label{display:block;font-size:10px;color:var(--mu-tx3);margin-bottom:3px;text-transform:uppercase}
.mu-f input,.mu-f select{width:100%;background:var(--mu-s2);border:1px solid var(--mu-line2);color:var(--mu-tx);
  border-radius:4px;padding:4px 6px;font-size:11px}
.mu-note{background:var(--mu-s1);border:1px solid var(--mu-line);border-radius:8px;padding:8px 10px;margin:0 0 10px;
  color:var(--mu-tx2);font-size:11px;line-height:1.5}
.mu-warn{background:rgba(230,170,90,.07);border:1px solid rgba(230,170,90,.25);border-radius:8px;padding:8px 10px;
  margin:0 0 10px;color:#dcb98a;font-size:11px;line-height:1.5}
pre.mu-raw{background:#0d0d0d;border:1px solid var(--mu-line);border-radius:8px;padding:8px;overflow:auto;max-height:180px;
  font:10px/1.4 ui-monospace,Consolas,monospace;color:#9a9a9a}
`;

  /* ---------------------------------------------------------------- */

  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  const TABS = [
    { id: 'przedmioty', label: 'Przedmioty' },
    { id: 'kalkulator', label: 'Kalkulator' },
    { id: 'zbieranie', label: 'Zbieranie' },
    { id: 'tabela', label: 'Średnie ceny' },
  ];

  /* Docelowy rodzic dla naszego okna: ten sam kontener, w ktorym gra
   * trzyma swoje wlasne okna (.c-window) - patrz zbadana na zywo
   * struktura Aukcji/Zegara. Z fallbackiem na document.body, gdyby ten
   * layer z jakiegos powodu nie istnial (np. bardzo wczesny etap
   * ladowania) - CSS naszego okna i tak dziala niezaleznie od rodzica. */
  function nativeWindowLayer() {
    return document.querySelector('.game-window-positioner .alerts-layer') ||
      document.querySelector('.game-window-positioner') || document.body;
  }

  /* Ikona-wlacznik: pozycjonowana TUZ OBOK natywnego paska widgetow gry
   * (.top-right.main-buttons-container - ten sam element, w ktorym siedza
   * "Klany"/"Globus"/"Zagadka" itd.), a NIE jako jego dziecko - gra sama
   * przelicza uklad wlasnych .widget-button (indeksy/pozycje "left"), wiec
   * wstrzykniecie obcego elementu do srodka tego kontenera ryzykowaloby
   * bycie nadpisanym/przesunietym przy nastepnym takim przeliczeniu.
   * Stojac obok, ikona wyglada jak naturalna czesc paska (ten sam styl
   * .widget-button.green), ale nigdy nie koliduje z logika gry. */
  function barIconPosition() {
    const bar = document.querySelector('.top-right.main-buttons-container') ||
      document.querySelector('.top-left.main-buttons-container');
    if (!bar) return { top: '4px', left: '4px' };
    const r = bar.getBoundingClientRect();
    const onRight = bar.classList.contains('top-right');
    return onRight
      ? { top: r.top + 'px', left: (r.left - 50) + 'px' }
      : { top: r.top + 'px', left: (r.right + 6) + 'px' };
  }

  /* Zapamietane pozycje - localStorage, oddzielnie od reszty konfiguracji
   * (MU.cfg), bo to czysto UI-owy stan bez wplywu na dane/obliczenia.
   * Dwa NIEZALEZNE klucze - okno i ikona-wlacznik przesuwaja sie
   * oddzielnie (uzytkownik moze chciec przestawic samą ikone, np. gdy
   * zasłania mu inny natywny przycisk, niezaleznie od tego, gdzie akurat
   * stoi samo okno). Zapisywane po KAZDYM przeciagnieciu (patrz
   * makeDraggable/makeIconDraggable), odczytywane raz w mount(). */
  const WINDOW_POS_KEY = 'MU_WINDOW_POS_v1';
  const ICON_POS_KEY = 'MU_ICON_POS_v1';

  function loadPos(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!isFinite(p.left) || !isFinite(p.top)) return null;
      return p;
    } catch (e) { return null; }
  }

  function savePos(key, left, top) {
    try { localStorage.setItem(key, JSON.stringify({ left: left, top: top })); } catch (e) {}
  }

  /* Utrzymuje przynajmniej 60px elementu widoczne na ekranie -
   * zabezpieczenie na wypadek zmiany rozdzielczosci miedzy sesjami
   * (pozycja zapisana na szerokim monitorze nie moze wypchnac elementu
   * calkowicie poza ekran wezszy). */
  function clampPos(left, top) {
    const maxLeft = Math.max(0, window.innerWidth - 60);
    const maxTop = Math.max(0, window.innerHeight - 60);
    return { left: Math.min(Math.max(0, left), maxLeft), top: Math.min(Math.max(0, top), maxTop) };
  }

  /* Wlasna, niezalezna od jQuery UI implementacja przeciagania za naglowek -
   * standardowe zdarzenia myszy (mousedown/mousemove/mouseup) bez zadnych
   * zewnetrznych zaleznosci ani zalozen o konkretnej wersji jQuery UI
   * dolaczonej przez klienta gry, wiec dziala niezaleznie od tego, czy i
   * jak gra go akurat laduje. */
  function makeDraggable(panelEl, handle, posKey) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = panelEl.getBoundingClientRect();
      ox = r.left; oy = r.top;
      panelEl.style.left = ox + 'px';
      panelEl.style.top = oy + 'px';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      panelEl.style.left = (ox + (e.clientX - sx)) + 'px';
      panelEl.style.top = (oy + (e.clientY - sy)) + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      savePos(posKey, parseInt(panelEl.style.left, 10), parseInt(panelEl.style.top, 10));
    });
  }

  /* Przeciaganie samej ikony-wlacznika - w odroznieniu od okna (gdzie caly
   * naglowek TO uchwyt do przeciagania, a otwieranie/zamykanie idzie przez
   * osobny przycisk zamkniecia), ikona musi obslugiwac DWIE rozne akcje na
   * tym samym elemencie: krotkie klikniecie = otworz/zamknij okno,
   * przeciagniecie = zmien pozycje ikony. Rozroznienie po przesunieciu
   * myszy miedzy mousedown a mouseup - powyzej progu 3px uznajemy to za
   * przeciagniecie (i NIE otwieramy okna), ponizej za zwykle kliknieciе. */
  function makeIconDraggable(iconEl, onClick) {
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    iconEl.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      const r = iconEl.getBoundingClientRect();
      ox = r.left; oy = r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true;
      if (moved) {
        iconEl.style.left = (ox + dx) + 'px';
        iconEl.style.top = (oy + dy) + 'px';
      }
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        savePos(ICON_POS_KEY, parseInt(iconEl.style.left, 10), parseInt(iconEl.style.top, 10));
      } else {
        onClick();
      }
    });
  }

  /* Kolko myszy nad trescia okna: zweryfikowane na zywo, ze natywny scroll
   * przegladarki NIE dziala tu sam z siebie (scrollTop zostawal 0 mimo
   * prawdziwego, zaufanego zdarzenia scroll) - najpewniej gra ma wlasny,
   * globalny listener na 'wheel' (np. do obslugi zoomu/przewijania mapy),
   * ktory wywoluje preventDefault() zanim zdarzenie dotrze do przegladarki
   * jako "przewin ten div". Zamiast polegac na domyslnej akcji przegladarki,
   * przesuwamy scrollTop RECZNIE w JS - dziala niezaleznie od tego, czy
   * cokolwiek wyzej w drzewie zdarzenie anuluje. */
  function installWheelScroll(el) {
    el.addEventListener('wheel', function (e) {
      el.scrollTop += e.deltaY;
      e.stopPropagation();
    }, { passive: true });
  }

  function mount() {
    if (root) return;
    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const icon = el('button', {
      class: 'mu-bar-icon', title: 'Ulepy – opłacalność ulepszania (przeciągnij, żeby przesunąć)',
    }, '<span class="mu-bi-glyph">U</span><span class="mu-dot"></span>');
    /* Domyslna pozycja obok natywnego paska widgetow - ALE jesli
     * uzytkownik juz kiedys przeciagnal ikone gdzie indziej, ta zapisana
     * pozycja ma pierwszenstwo (patrz makeIconDraggable). */
    const savedIconPos = loadPos(ICON_POS_KEY);
    if (savedIconPos) {
      const c = clampPos(savedIconPos.left, savedIconPos.top);
      icon.style.left = c.left + 'px';
      icon.style.top = c.top + 'px';
    } else {
      const pos = barIconPosition();
      icon.style.top = pos.top;
      icon.style.left = pos.left;
    }
    makeIconDraggable(icon, toggle);
    document.body.appendChild(icon);

    /* Struktura ponizej to WPROST skopiowany szkielet natywnego okna gry
     * (c-window/border-window/header-label-positioner/close-button-corner-decor/
     * cards-header-wrapper) - zbadany na zywo na oknach Aukcji i Zegara.
     * Dzieki tym samym klasom ramka, tekstura naglowka, przycisk zamkniecia
     * i wyglad zakladek pochodza wprost z JUZ zaladowanego arkusza stylow
     * gry, bez recznego kopiowania kolorow/grafik. */
    panel = el('div', { class: 'c-window border-window mu-window' });
    /* Domyslna pozycja (pierwsze otwarcie / brak zapisanej pozycji): pod
     * ikona-wlacznikiem, po prawej stronie ekranu - tak, zeby od razu stac
     * OBOK okna aukcji, a nie je zaslaniac. Zawsze liczona jako jawny
     * piksel `left` (NIE `right`) - okno i tak zaraz bedzie przeciagane
     * wlasna implementacja (makeDraggable), ktora rowniez operuje na
     * `left`/`top`. Jesli jest zapisana wczesniejsza pozycja (patrz
     * loadPos), uzywamy jej zamiast domyslnej. */
    const iconPos = barIconPosition();
    const defaultLeft = window.innerWidth - 460 - 40 - 10;
    const defaultTop = parseInt(iconPos.top, 10) + 50;
    const saved = loadPos(WINDOW_POS_KEY);
    const startPos = saved ? clampPos(saved.left, saved.top) : { left: defaultLeft, top: defaultTop };
    panel.style.left = startPos.left + 'px';
    panel.style.top = startPos.top + 'px';
    panel.innerHTML =
      '<div class="header-label-positioner">' +
        '<div class="draggable-window-element ui-draggable-handle"></div>' +
        '<div class="header-label">' +
          '<div class="left-decor"></div>' +
          '<div class="right-decor"></div>' +
          '<div class="text" name="Ulepy">Ulepy</div>' +
        '</div>' +
      '</div>' +
      '<div class="content">' +
        '<div class="inner-content">' +
          '<div class="cards-header-wrapper tabs-nav" id="mu-tabs">' +
            TABS.map(function (t, i) {
              return '<div class="card' + (i === 0 ? ' active' : '') + '" data-tab="' + t.id + '">' +
                '<div class="label">' + t.label + '</div>' +
                '<div class="card-notification"></div><div class="amount"></div></div>';
            }).join('') +
          '</div>' +
          '<div class="mu-bar" id="mu-bar"></div>' +
          '<div class="mu-body" id="mu-body"></div>' +
        '</div>' +
        '<div class="window-controlls"></div>' +
      '</div>' +
      '<div class="c-window__bottom-bar">' +
        '<div class="interface-element-bottom-bar-background-stretch"></div>' +
      '</div>' +
      '<div class="close-button-corner-decor">' +
        '<button type="button" class="close-button" title="Zamknij"></button>' +
      '</div>';
    nativeWindowLayer().appendChild(panel);
    root = { icon: icon, panel: panel };

    makeDraggable(panel, panel.querySelector('.draggable-window-element'), WINDOW_POS_KEY);
    installWheelScroll(panel.querySelector('#mu-body'));

    /* Wpisywanie w pola panelu (poziom, budzet "6g"...) nie moze odpalac
     * skrotow klawiszowych gry. Tylko dla pol tekstowych - klawisze przy
     * fokusie na przyciskach panelu dalej trafiaja do gry. */
    ['keydown', 'keyup', 'keypress'].forEach(function (type) {
      panel.addEventListener(type, function (e) {
        const t = e.target && e.target.tagName;
        if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') e.stopPropagation();
      });
    });

    /* Ikona i okno zawsze na ekranie - rowniez po zmianie rozmiaru okna
     * przegladarki. Na zywo: ikona zamontowana przy szerokim oknie zostala
     * na x=922 po zwezeniu okna do 337px i nie dalo sie jej kliknac. */
    function keepOnScreen() {
      [icon, panel].forEach(function (x) {
        let left = parseInt(x.style.left, 10) || 0;
        let top = parseInt(x.style.top, 10) || 0;
        /* Otwarte okno (ma wtedy wymiary) miesci sie w CALOSCI, jesli ekran
         * na to pozwala - samo "60 px widoczne" z clampPos wystarcza dla
         * ikony, ale okno zostawialo prawie calkiem poza ekranem (lokalny
         * test: lewa krawedz na 740 z 800 px). */
        if (x === panel && x.offsetWidth) {
          left = Math.min(left, Math.max(0, window.innerWidth - x.offsetWidth));
          top = Math.min(top, Math.max(0, window.innerHeight - x.offsetHeight));
        }
        const c = clampPos(left, top);
        x.style.left = c.left + 'px';
        x.style.top = c.top + 'px';
      });
    }
    keepOnScreen();
    window.addEventListener('resize', U.debounce(keepOnScreen, 150));
    root.keepOnScreen = keepOnScreen;

    panel.querySelector('.close-button').addEventListener('click', toggle);
    panel.querySelectorAll('#mu-tabs .card').forEach(function (b) {
      b.addEventListener('click', function () {
        activeTab = b.getAttribute('data-tab');
        panel.querySelectorAll('#mu-tabs .card').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        render();
      });
    });
  }

  function toggle() {
    mount();
    const open = panel.classList.toggle('mu-open');
    if (open) {
      /* Dopiero otwarte okno ma wymiary - dopasuj je do ekranu teraz. */
      if (root.keepOnScreen) root.keepOnScreen();
      root.icon.querySelector('.mu-dot').style.display = 'none';
      refresh();
    }
  }

  let pending = 0;
  function notifyNewData(n) {
    pending += n;
    if (!root) return;
    const dot = root.icon.querySelector('.mu-dot');
    if (!panel.classList.contains('mu-open')) {
      dot.textContent = pending > 99 ? '99+' : String(pending);
      dot.style.display = 'block';
    } else {
      refreshDebounced();
    }
  }

  /* Zakladka Przedmioty odswieza sie z WLASNEGO, niezaleznego sygnalu -
   * kazdej nowej migawce DOM (MU.sniffer.onLiveSnapshot) - a nie z
   * notifyNewData (ktore odpala sie tylko przy zapisie do bazy
   * historycznej). To celowe rozdzielenie: widok biezacy ma sie
   * aktualizowac nawet gdy nic nowego nie trafia do historii (np. lista
   * po prostu sie skurczyla, bo oferta zniknela), i odwrotnie - zapis do
   * historii nie zalezy od tego, czy ta zakladka jest w ogole otwarta. */
  const renderLiveDebounced = U.debounce(function () {
    if (panel && panel.classList.contains('mu-open') && activeTab === 'przedmioty') render(true);
  }, 400);
  MU.sniffer.onLiveSnapshot(renderLiveDebounced);

  /* Postep "Zaladuj wszystkie strony" (i zamiana przycisku na Zatrzymaj).
   * Throttle, nie debounce: przy stronach szybszych niz 200 ms debounce
   * odkladal render w nieskonczonosc i postep sie w ogole nie pokazywal
   * (lokalny symulator). Teraz najwyzej raz na 200 ms, zawsze z aktualnym
   * stanem - takze ostatnia aktualizacja po zakonczeniu. */
  let pagerRenderTimer = null;
  function renderPagerDebounced() {
    if (pagerRenderTimer) return;
    pagerRenderTimer = setTimeout(function () {
      pagerRenderTimer = null;
      if (panel && panel.classList.contains('mu-open') && activeTab === 'zbieranie') render(true);
    }, 200);
  }
  MU.sniffer.onPager(renderPagerDebounced);
  /* Gdy gracz otworzy/zmieni liste w oknie aukcji - odswiez Zbieranie, zeby
   * przycisk "Wznow" pojawil sie od razu po powrocie do tej samej listy. */
  MU.sniffer.onAhTask(renderPagerDebounced);
  /* Zawezenie okna aukcji (klik w Przedmiotach) - liczba pasujacych ofert
   * zmienia sie np. po zakupie, pasek w Przedmiotach ma to pokazywac. */
  if (MU.sniffer.onNarrow) MU.sniffer.onNarrow(function () {
    if (panel && panel.classList.contains('mu-open') && activeTab === 'przedmioty') render(true);
  });

  /* bodyOnly=true: wywolane w tle (nowe dane), NIE przez akcje uzytkownika -
   * pomija przebudowe paska filtrow (renderBar), zeby nie wycinac w polu
   * "poziom" wartosci, ktora uzytkownik akurat wpisuje (kazda przebudowa
   * innerHTML kasuje niezatwierdzony tekst w polu). Jawne akcje uzytkownika
   * (klik zakladki, zmiana filtra, przycisk Odswiez) zawsze wolaja refresh()/
   * render() bez argumentu - tam pelne odswiezenie paska jest oczekiwane
   * i nieszkodliwe, bo to wlasnie ten klik zmienil dany filtr. */
  function refresh(bodyOnly) {
    pending = 0;
    const cfg = MU.cfg.get();
    return MU.store.allObservations(Date.now() - cfg.stats.retentionDays * U.DAY_MS)
      .then(function (obs) {
        index = MU.aggregate.buildIndex(obs, cfg, Date.now());
        render(bodyOnly);
      });
  }
  const refreshDebounced = U.debounce(function () { refresh(true); }, 1500);

  /* ---------------------------------------------------------------- */

  function confBar(c) {
    const pctv = Math.round((c || 0) * 100);
    const color = pctv >= 60 ? '#6b8f4a' : (pctv >= 30 ? '#8f7d4a' : '#8f4a4a');
    return '<span class="mu-conf" title="Pewność danych: ' + pctv + '%">' +
      '<i><b style="width:' + pctv + '%;background:' + color + '"></b></i>' +
      '<span>' + pctv + '%</span></span>';
  }

  /* Cel ulepszania = to, co wpisane w Kalkulatorze (rzadkosc, grupa,
   * poziom). Dawniej osobna zwijana sekcja "Cel ulepszania" nad lista -
   * dublowala Kalkulator i latwo bylo policzyc bonus dwa razy (uwaga
   * uzytkownika). Teraz w pasku jest tylko linijka, dla czego liczymy. */
  function goalHtml() {
    const t = currentTarget();
    const parts = [MU.cfg.rarityById(t.rarity).label + (t.lvl ? ' lvl ' + t.lvl : '')];
    parts.push(t.group ? GROUP_LABELS[t.group] : 'grupa nie wybrana');
    return '<div class="mu-goal">Ulepszasz: <b>' + U.escapeHtml(parts.join(' · ')) + '</b> ' +
      '<button type="button" class="mu-link" id="mu-goto-calc">zmień w Kalkulatorze</button></div>';
  }

  function goTab(id) {
    const card = panel && panel.querySelector('#mu-tabs .card[data-tab="' + id + '"]');
    if (card) card.click();
  }

  /* Pasek nad lista: linijka "Ulepszasz: ..." (cel z Kalkulatora) +
   * przyciski akcji (male ikony, nie przyciski z pelnym tekstem - patrz
   * .mu-icon-btn). Filtry WLASCIWE danej zakladki (Kategoria/Rzadkosc w
   * Tabeli, Kategoria/Rzadkosc skladnika w Przedmiotach) sa teraz
   * renderowane w tresci danej zakladki (renderTable/renderItems), bo sa
   * scisle zwiazane z tym, co ta zakladka akurat pokazuje. */
  function renderBar() {
    const bar = panel.querySelector('#mu-bar');
    /* Na zakladkach bez paska (Kalkulator, Zbieranie) chowamy go calkiem -
     * pusty pasek zostawial pod zakladkami zbedny pas (uwaga uzytkownika). */
    if (activeTab !== 'tabela' && activeTab !== 'przedmioty') { bar.innerHTML = ''; bar.style.display = 'none'; return; }
    bar.style.display = '';

    bar.innerHTML = goalHtml() +
      '<div class="mu-bar-spacer"></div>' +
      '<button class="mu-icon-btn" id="mu-csv" title="Eksport CSV">&#8681;</button>' +
      '<button class="mu-icon-btn" id="mu-refresh" title="Odśwież teraz">&#8635;</button>';

    bar.querySelector('#mu-goto-calc').onclick = function () { goTab('kalkulator'); };
    bar.querySelector('#mu-csv').onclick = exportCsv;
    /* Owiniete w funkcje - onclick przekazalby MouseEvent jako pierwszy
     * argument refresh(bodyOnly), co przypadkiem wlaczyloby tryb "w tle". */
    bar.querySelector('#mu-refresh').onclick = function () { refresh(); };
  }

  /* Zawsze jest jakis cel - rzadkosc w Kalkulatorze ma wartosc domyslna. */
  function currentTarget() {
    const lvl = parseInt(calc.lvl, 10);
    return { rarity: calc.rarity, group: calc.group || null,
      lvl: isFinite(lvl) && lvl > 0 ? lvl : null };
  }

  /* Bez kolumn Kategoria/Rzadkosc - zbedne, odkad Tabela filtruje zawsze
   * do DOKLADNIE jednej grupy x jednej rzadkosci (patrz segmentowany
   * przelacznik w renderTable): kazdy wiersz i tak mialby te sama wartosc
   * w obu kolumnach, wiec pokazujemy to raz, w podtytule nad tabela
   * zamiast powtarzac w kazdym wierszu - i zwalniamy 2 z 8 kolumn na
   * waskim oknie.
   * Puste komorki (r.empty) zwracaja teraz PUSTY string zamiast myslnika -
   * caly wiersz dostaje klase mu-empty-row (patrz renderTable), ktora
   * wygasza go jednym spojnym stylem, zamiast powtarzac "-" w kazdej
   * kolumnie (szum wizualny, patrz zadanie uzytkownika o hierarchii). */
  const COLS = [
    { k: 'bracket', t: 'Przedział', f: function (r) { return U.escapeHtml(r.bracket); } },
    { k: 'lvl', t: 'Śr. lvl', f: function (r) { return r.empty ? '' : U.round(r.lvl, 0); } },
    { k: 'price', t: 'Cena', f: function (r) { return r.empty ? '' : U.gold(r.price); } },
    { k: 'points', t: 'Pkt', f: function (r) {
        if (r.empty) return '';
        return r.points + (r.bonusApplied ? '<span class="mu-pos" title="z bonusem za dopasowanie do celu">*</span>' : ''); } },
    { k: 'costPerPoint', t: 'Koszt/pkt', f: function (r) { return r.empty ? '' : U.gold(r.costPerPoint); },
      cls: function (r) { return r.empty ? '' : 'mu-hi'; } },
    { k: 'confidence', t: 'Pewność', f: function (r) { return r.empty ? '' : confBar(r.confidence); } },
  ];

  /* Zakladka "Srednie ceny" (dawniej "Tabela") to podglad rynku, nie lista
   * zakupow - stad ramka z wyjasnieniem na gorze (uwaga uzytkownika). */
  function avgInfoHtml(cfg) {
    return '<div class="mu-callout mu-info"><span class="mu-callout-lbl">Co tu jest</span>' +
      'Tu dodatek w tle zbiera <b>średnie ceny</b> z domu aukcyjnego. Z każdej oferty, którą zobaczysz ' +
      'w oknie aukcji, zapisuje cenę i trzyma ją do ' + cfg.stats.retentionDays + ' dni – świeższe liczą się ' +
      'bardziej. Dla każdego przedziału poziomów widzisz typową cenę przedmiotu i ile średnio wychodzi za punkt.' +
      '<div class="mu-callout-sub" style="margin-top:4px">To podgląd rynku, nie lista zakupów – konkretne oferty ' +
      'do kupienia są w zakładce <b>Przedmioty</b>. Jeśli ładujesz aukcje z ustawioną Max. ceną, trafiają tu ' +
      'tylko tanie oferty, więc średnie wyjdą niższe niż naprawdę.</div></div>';
  }

  function renderTable(body) {
    const cfg = MU.cfg.get();
    if (!index || !index.nObs) return renderEmpty(body);

    const rows = MU.aggregate.buildCoarseTable(index, {
      target: currentTarget(),
      group: state.tableGroup, rarity: state.tableRarity,
    });
    const filled = rows.filter(function (r) { return !r.empty; });
    /* Najtansza pozycja MUSI byc policzona PRZED sortowaniem wg wyboru
     * uzytkownika - inaczej po kliknieciu jakiejkolwiek innej kolumny
     * (np. "Sr. poziom") rows[0] przestaje byc najtanszy, a KPI ponizej
     * (i zalezny od niego szacunek calkowitego kosztu ulepszenia) zaczyna
     * pokazywac wartosc losowego wiersza podpisana jako "najtansze". */
    const cheapest = filled.length
      ? Math.min.apply(null, filled.map(function (r) { return r.costPerPoint; })) : NaN;
    rows.sort(function (a, b) {
      if (sortKey === 'bracket') {
        return sortDir * (MU.cfg.bracketOrder(a.bracket) - MU.cfg.bracketOrder(b.bracket));
      }
      /* Puste wiersze zawsze na koniec, niezaleznie od kierunku sortowania -
       * inaczej przy sortowaniu malejaco "brak danych" (NaN) wyskakiwalby
       * na gore jako pozornie "najlepszy" wynik. */
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      const x = a[sortKey], y = b[sortKey];
      const nx = isFinite(x) ? x : Infinity, ny = isFinite(y) ? y : Infinity;
      if (typeof x === 'string' && typeof y === 'string') {
        return sortDir * x.localeCompare(y);
      }
      return sortDir * (nx - ny);
    });
    lastRows = rows;

    const days = index.firstObsTs
      ? U.round((Date.now() - index.firstObsTs) / U.DAY_MS, 1) : 0;

    /* Segmentowany przelacznik Kategoria/Rzadkosc - wybor DOKLADNIE jednej
     * z 3 grup i jednej z 2 rzadkosci, od razu widoczny, bez rozwijania
     * list (patrz zadanie uzytkownika o intuicyjnosci) - zlaczony pasek
     * przyciskow w stylu natywnych kontrolek gry (patrz CSS .mu-seg). */
    let html = avgInfoHtml(cfg) + '<div class="mu-row">' +
      '<div class="mu-seg-block"><span class="mu-seg-lbl">Kategoria</span><div class="mu-seg-row" id="mu-tabgrp-pills">' +
        GROUP_ORDER.map(function (g) {
          return '<button type="button" class="mu-seg' + (state.tableGroup === g ? ' mu-active' : '') +
            '" data-g="' + g + '">' + GROUP_LABELS[g] + '</button>';
        }).join('') + '</div></div>' +
      '<div class="mu-seg-block"><span class="mu-seg-lbl">Rzadkość</span><div class="mu-seg-row" id="mu-tabrar-pills">' +
        cfg.rarities.map(function (r) {
          return '<button type="button" class="mu-seg' + (state.tableRarity === r.id ? ' mu-active' : '') +
            '" data-r="' + r.id + '">' + r.label + '</button>';
        }).join('') + '</div></div>' +
      '</div>';

    /* Pasek statystyk w jednej linii + wbudowany pasek postepu zbierania
     * danych (dni/collectDays) zamiast osobnego duzego brazowego bloku
     * tekstu - patrz CSS .mu-progress (te same wartosci co natywna klasa
     * gry .interface-element-progress-bar-2). */
    const collectPct = U.clamp(days / cfg.collectDays * 100, 0, 100);
    html += '<div class="mu-stats-line">' +
      '<span><b>' + index.nObs + '</b> obs.</span>' +
      '<span><b>' + filled.length + '/' + rows.length + '</b> przedziałów</span>' +
      '<span>najtaniej <b class="mu-hi">' + (isFinite(cheapest) ? U.gold(cheapest) : '-') + '</b>/pkt</span>' +
      '<span class="mu-progress-wrap" title="Zebrano ' + days + ' z ' + cfg.collectDays + ' zadeklarowanych dni zbierania danych">' +
        days + '/' + cfg.collectDays + ' dni<span class="mu-progress"><i style="width:' + collectPct + '%"></i></span>' +
      '</span>' +
      '</div>';

    /* Krotki, stonowany podtytul zamiast dawnego dlugiego akapitu -
     * najwazniejsza informacja (brak bonusow bez celu) w jednej linii,
     * bez pogrubien/kolorow poza jednym akcentem na nazwie sekcji. */
    const target = currentTarget();
    html += '<p class="mu-subtitle">Kolumna "Pkt" z bonusami za dopasowanie do tego, co ulepszasz ' +
      '(ustawienia z <b>Kalkulatora</b>).</p>';

    /* Calkowity koszt ulepszenia CELU (+0 -> +5) zalezy WYLACZNIE od
     * poziomu i rzadkosci tego celu (im wyzsza rzadkosc/poziom, tym wiecej
     * punktow trzeba zebrac - dla legendy to nawet 1000x wiecej niz dla
     * zwyklego przedmiotu na tym samym poziomie). Bez tego zestawienia
     * kolumna "koszt za punkt" jest tylko abstrakcyjnym wskaznikiem -
     * to pokazuje realna, calkowita kwote. */
    if (target && target.rarity && target.lvl) {
      const totalPts = MU.upgrade.totalPointsCost(target.lvl, target.rarity, 0, 5);
      const fodderGold = isFinite(cheapest) ? cheapest * totalPts : NaN;
      /* Bez oplaty za +5 i bez esencji - decyzja uzytkownika: koszt
       * ulepszenia to tylko punkty x cena za punkt. */
      html += '<p class="mu-subtitle">Całkowicie +0&rarr;+5 (' + MU.cfg.rarityById(target.rarity).label +
        ' lvl ' + target.lvl + '): <b>' + U.round(totalPts, 0) + '</b> pkt &middot; składniki ' +
        '<b>' + (isFinite(fodderGold) ? U.gold(fodderGold) : '-') + '</b>.</p>';
    }

    html += '<table class="mu-t"><thead><tr>' + COLS.map(function (c) {
      const on = sortKey === c.k;
      const mark = on ? (sortDir < 0 ? ' &#9660;' : ' &#9650;') : '';
      return '<th data-k="' + c.k + '"' + (on ? ' class="mu-sorted"' : '') + '>' + c.t + mark + '</th>';
    }).join('') + '</tr></thead><tbody>';

    /* Brak galezi "pusta tabela" - buildCoarseTable zawsze zwraca pelna
     * siatke przedzialow (patrz zadanie uzytkownika), wiec `rows` nigdy
     * nie jest pusta; brakujace dane sa widoczne per-wiersz (empty:true),
     * wygaszone jednym spojnym stylem (mu-empty-row) zamiast myslnikow
     * powtorzonych w kazdej kolumnie. */
    for (const r of rows) {
      html += '<tr' + (r.empty ? ' class="mu-empty-row"' : '') + '>' +
        COLS.map(function (c) {
          const cls = c.cls ? c.cls(r) : '';
          return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + c.f(r) + '</td>';
        }).join('') + '</tr>';
    }
    html += '</tbody></table>';
    body.innerHTML = html;

    body.querySelectorAll('#mu-tabgrp-pills .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { state.tableGroup = b.getAttribute('data-g'); render(); });
    });
    body.querySelectorAll('#mu-tabrar-pills .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { state.tableRarity = b.getAttribute('data-r'); render(); });
    });
    body.querySelectorAll('th').forEach(function (th) {
      th.addEventListener('click', function () {
        const k = th.getAttribute('data-k');
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
        render();
      });
    });
  }

  function renderEmpty(body) {
    const d = MU.sniffer.diag.lastDom;
    let hint = 'Otwórz dom aukcyjny w grze i poprzeglądaj listy – dodatek zapisuje cenę ' +
      'każdej nowo zobaczonej oferty od razu.';
    if (d) {
      hint = 'Dodatek widział dotąd <b>' + d.covered + '</b>' +
        (isFinite(d.total) ? ' z <b>' + d.total + '</b>' : '') +
        ' pasujących aukcji, ale w wybranej kategorii i rzadkości nie ma jeszcze danych.';
    }
    body.innerHTML = avgInfoHtml(MU.cfg.get()) + '<div class="mu-empty">' +
      '<b>Brak danych – jeszcze.</b><br>' + hint + '<br><br>' +
      'Całą listę pobierzesz przyciskiem <b>Załaduj wszystkie strony</b> w zakładce ' +
      '<b>Zbieranie</b>.' +
      '</div>';
  }

  /* --- zakladka: przedmioty - widok SESYJNY, nie historyczny --------- *
   * Zrodlem jest MU.sniffer.getSessionItems() (kazda oferta zaobserwowana
   * od zaladowania strony, kumulatywnie - patrz sessionItems w
   * 06-sniffer.js), a nie baza historyczna (`index`) uzywana przez
   * zakladke Tabela. Kazdy wiersz to jedna realna oferta - zero
   * usredniania. W odroznieniu od dawnego zachowania (migawka
   * nadpisywana przy kazdym skanie), przelaczanie kategorii/rzadkosci w
   * oknie aukcji gry JUZ NIE gubi wczesniej zobaczonych przedmiotow -
   * wszystko kumuluje sie w jeden plaski widok "Wszystkie", bez filtrow.
   * Zbieranie danych do zakladki Tabela (MU.lifecycle -> MU.store) dziala
   * rownolegle i NIEZALEZNIE od tego, co ten widok akurat pokazuje. */

  /* Wlasny, niezalezny stan sortowania od zakladki Tabela (COLS/sortKey/
   * sortDir powyzej) - inne kolumny, inny domyslny sort. */
  let sortKeyItems = 'costPerPoint', sortDirItems = 1;
  /* Komunikat po nieudanym zawezeniu okna aukcji (patrz renderItems). */
  let narrowMsg = '';
  function plOfert(n) {
    const d = n % 10, dd = n % 100;
    return n === 1 ? 'oferta' : (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? 'oferty' : 'ofert');
  }

  const ITEM_COLS = [
    { k: 'name', t: 'Przedmiot', f: function (r) { return U.escapeHtml(r.name); } },
    { k: 'category', t: 'Kat.', f: function (r) {
        return U.escapeHtml(MU.cfg.categoryById(r.category).label); } },
    { k: 'rarity', t: 'Rzadkość', f: function (r) {
        const x = MU.cfg.rarityById(r.rarity);
        return '<span style="color:' + x.color + '">' + U.escapeHtml(x.label) + '</span>'; } },
    { k: 'lvl', t: 'lvl', f: function (r) { return U.round(r.lvl, 0); } },
    { k: 'price', t: 'Cena', f: function (r) { return U.gold(r.price); } },
    { k: 'points', t: 'Punkty', f: function (r) {
        return r.points + (r.bonusApplied ? '<span class="mu-pos" title="z bonusem za dopasowanie do celu"> *</span>' : ''); } },
    { k: 'costPerPoint', t: 'Koszt/pkt', f: function (r) { return U.gold(r.costPerPoint); }, cls: function () { return 'mu-hi'; } },
  ];

  /* Widok "Wszystkie" - bez filtrow. Zrodlem jest MU.sniffer.getSessionItems()
   * (kazda oferta zaobserwowana od zaladowania strony, kumulatywnie -
   * patrz komentarz przy sessionItems w 06-sniffer.js), NIE
   * getLiveSnapshot() (tylko biezacy skan) - dzieki temu przelaczanie
   * kategorii w oknie aukcji gry juz nie gubi wczesniej zobaczonych
   * przedmiotow z innych kategorii. Zadnych filtrow Kategoria/Rzadkosc -
   * to jedyny, plaski widok wszystkiego naraz (patrz zadanie uzytkownika). */
  function renderItems(body) {
    const rows = MU.aggregate.buildLiveTable(MU.sniffer.getSessionItems(), { target: currentTarget() });
    rows.sort(function (a, b) {
      const x = a[sortKeyItems], y = b[sortKeyItems];
      const nx = isFinite(x) ? x : Infinity, ny = isFinite(y) ? y : Infinity;
      if (typeof x === 'string' && typeof y === 'string') {
        return sortDirItems * x.localeCompare(y);
      }
      return sortDirItems * (nx - ny);
    });
    lastRowsItems = rows;

    const SHOWN_MAX = 400;
    /* Minimum, nie rows[0] - po sortowaniu po innej kolumnie pierwszy wiersz
     * nie jest najtanszy. */
    const cheapestLive = rows.reduce(function (m, r) { return r.costPerPoint < m ? r.costPerPoint : m; }, Infinity);
    /* Budzet z Kalkulatora: oferta sie oplaca, gdy jej koszt za punkt (juz z
     * bonusami za dopasowanie do celu) nie przekracza max ceny za punkt. */
    const plan = calcPlan();
    const maxPP = plan ? Math.floor(plan.p.maxPerPoint) : NaN;
    const fits = function (r) { return r.costPerPoint <= maxPP; };
    const nFit = isFinite(maxPP) ? rows.filter(fits).length : 0;

    let html = '<div class="mu-stats-line">' +
      '<span><b>' + rows.length + '</b> ofert (sesja)</span>' +
      '<span>pokazano <b>' + Math.min(rows.length, SHOWN_MAX) + '</b></span>' +
      (isFinite(maxPP) ? '<span><b class="mu-pos">' + nFit + '</b> w budżecie</span>' : '') +
      '<span>najtaniej <b class="mu-hi">' + (isFinite(cheapestLive) ? U.gold(cheapestLive) : '-') + '</b>/pkt</span>' +
      '</div>';

    html += '<p class="mu-subtitle">' + (isFinite(maxPP)
        ? 'Na zielono oferty mieszczące się w budżecie z Kalkulatora – koszt/pkt do <b>' + calcNum(maxPP) +
          '</b> (bonusy już wliczone).'
        : 'Wpisz poziom i budżet w <b>Kalkulatorze</b>, a oferty mieszczące się w budżecie podświetlą się na zielono.') +
      ' Kliknij ofertę, a w oknie aukcji zostaną tylko takie same w tej samej cenie.' +
      ' Lista to wszystkie oferty widziane od otwarcia gry, nie historia – średnie są w zakładce <b>Średnie ceny</b>.</p>';

    /* Zawezenie okna aukcji (klik oferty) - co widac w grze i jak wrocic. */
    const nw = MU.sniffer.getNarrow ? MU.sniffer.getNarrow() : null;
    const isSel = function (r) { return !!nw && r.name === nw.name && r.price === nw.price; };
    if (nw) {
      html += '<div class="mu-narrow-note">W oknie aukcji widać tylko: <b>' + U.escapeHtml(nw.name) + '</b> za <b>' +
        U.gold(nw.price) + '</b> – ' + (nw.count ? nw.count + ' ' + plOfert(nw.count) : 'nie ma już tych ofert') +
        ' <button type="button" class="mu-link" id="mu-narrow-clear">Pokaż wszystko</button></div>';
    } else if (narrowMsg) {
      html += '<div class="mu-warn">' + narrowMsg + '</div>';
    }

    if (!rows.length) {
      html += '<div class="mu-empty">Brak jeszcze zaobserwowanych ofert. Otwórz dom aukcyjny ' +
        'w grze i poprzeglądaj kategorie – dodatek zapamięta każdą widzianą ofertę aż do ' +
        'przeładowania strony.</div>';
      body.innerHTML = html;
      return;
    }

    if (rows.length > SHOWN_MAX) {
      html += '<div class="mu-warn">Pokazano ' + SHOWN_MAX + ' z ' + rows.length + ' najtańszych – reszta ukryta.</div>';
    }

    html += '<table class="mu-t"><thead><tr>' + ITEM_COLS.map(function (c) {
      const on = sortKeyItems === c.k;
      const mark = on ? (sortDirItems < 0 ? ' &#9660;' : ' &#9650;') : '';
      return '<th data-k="' + c.k + '"' + (on ? ' class="mu-sorted"' : '') + '>' + c.t + mark + '</th>';
    }).join('') + '</tr></thead><tbody>';

    for (const r of rows.slice(0, SHOWN_MAX)) {
      const rc = ['mu-click'];
      if (fits(r)) rc.push('mu-ok');
      if (isSel(r)) rc.push('mu-sel');
      html += '<tr class="' + rc.join(' ') + '" data-aid="' + U.escapeHtml(String(r.aid)) +
        '" title="Pokaż w oknie aukcji tylko ten przedmiot w tej samej cenie">' + ITEM_COLS.map(function (c) {
        const cls = c.cls ? c.cls(r) : '';
        return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + c.f(r) + '</td>';
      }).join('') + '</tr>';
    }
    html += '</tbody></table>';
    body.innerHTML = html;

    body.querySelectorAll('th').forEach(function (th) {
      th.addEventListener('click', function () {
        const k = th.getAttribute('data-k');
        if (sortKeyItems === k) sortDirItems = -sortDirItems; else { sortKeyItems = k; sortDirItems = 1; }
        render();
      });
    });

    /* Klik oferty -> zawezenie listy w oknie aukcji do tego przedmiotu w tej
     * samej cenie; ponowny klik tej samej oferty je zdejmuje. */
    const byAid = new Map(rows.map(function (r) { return [String(r.aid), r]; }));
    body.querySelector('table.mu-t tbody').addEventListener('click', function (e) {
      const tr = e.target.closest('tr[data-aid]');
      const r = tr && byAid.get(tr.getAttribute('data-aid'));
      if (!r) return;
      const cur = MU.sniffer.getNarrow();
      if (cur && cur.name === r.name && cur.price === r.price) {
        narrowMsg = '';
        MU.sniffer.clearNarrow();
        render(true);
        return;
      }
      const res = MU.sniffer.setNarrow(r.name, r.price);
      narrowMsg = res.ok ? '' : (res.reason === 'no-window'
        ? 'Otwórz dom aukcyjny w grze – zawężana jest lista, którą gra pokazuje w oknie aukcji.'
        : 'Tej oferty nie ma teraz w oknie aukcji (inna kategoria lub filtr, albo ktoś ją już kupił). ' +
          'Nazwa skopiowana do schowka.');
      if (!res.ok && res.reason === 'none') {
        try { navigator.clipboard.writeText(r.name).catch(function () {}); } catch (err) {}
      }
      render(true);
    });
    const clr = body.querySelector('#mu-narrow-clear');
    if (clr) clr.onclick = function () { narrowMsg = ''; MU.sniffer.clearNarrow(); render(true); };
  }

  /* --- zakladka: zbieranie -------------------------------------------- */

  /* Czy zwijana sekcja "Dane" jest rozwinieta - zapamietane poza renderem,
   * bo zakladka przerysowuje sie przy kazdej stronie ladowania (inaczej
   * sekcja zwijalaby sie sama co chwile). */
  let collectDataOpen = false;

  function renderCollect(body) {
    const cfg = MU.cfg.get();
    const d = MU.sniffer.diag;

    /* Uklad (uwaga uzytkownika o czytelnosci): najpierw to, czego sie uzywa -
     * doladowanie listy. Techniczne liczniki (sprzedane/wygasle, trafienia,
     * magazyn) usuniete - nieprzydatne dla gracza (uwaga uzytkownika). */
    body.innerHTML =
      (d.hits === 0 ? '<div class="mu-warn">Dodatek nie zobaczył jeszcze żadnych danych ' +
        'aukcyjnych. Otwórz dom aukcyjny w grze i wybierz kategorię.</div>' : '') +
      '<h4 class="mu-sec">Doładowanie listy</h4>' +
      (function () {
        /* Jedyne miejsce, z ktorego dodatek cokolwiek wysyla do gry - i to
         * tylko po kliknieciu, patrz MU.sniffer.loadAllPages. */
        const p = MU.sniffer.getPager();
        const esc = function (s) {
          return String(s).replace(/[&<>"]/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
          });
        };
        let line = '';
        if (p.running) {
          line = '<span class="mu-mut">Ładuję stronę <b>' + (p.page + 1) + '</b> z <b>' + p.pages +
            '</b> – w oknie gry <b>' + p.rows + '</b> z <b>' + p.total + '</b> ofert' +
            (p.avgMs ? ', średnio <b>' + (p.avgMs / 1000).toFixed(2) + ' s</b>/stronę (ostatnia ' +
              (p.lastMs / 1000).toFixed(2) + ' s)' : '') +
            '. Lista w oknie gry jest na ten czas ukryta.</span>';
        } else if (p.message) {
          line = '<span class="' + (p.status === 'done' ? 'mu-pos' : 'mu-mut') + '">' +
            esc(p.message) + '</span>';
        }
        /* Wznawianie: po przerwaniu (zamkniecie okna, Zatrzymaj...) i powrocie
         * do tej samej listy - "Wznow od strony X" zamiast ladowania od nowa. */
        const resume = MU.sniffer.getResumeInfo();
        let buttons = '<button class="mu-btn" id="mu-load-all">Załaduj wszystkie strony</button>';
        if (p.running) buttons = '<button class="mu-btn" id="mu-load-stop">Zatrzymaj</button>';
        else if (resume && resume.matches) {
          buttons = '<button class="mu-btn" id="mu-load-resume">Wznów od strony ' + (resume.page + 1) +
            ' z ' + resume.pages + '</button> <button class="mu-btn" id="mu-load-all">Od początku</button>';
        }
        const resumeHint = !p.running && resume && !resume.matches
          ? '<p class="mu-status mu-mut">Przerwane ładowanie (strona ' + resume.page + ' z ' + resume.pages +
            '). Otwórz w oknie aukcji tę samą listę (te same filtry i kategoria), żeby wznowić.</p>'
          : '';
        /* Ramka z Max. cena jest tylko w Kalkulatorze - tu byla ta sama (uwaga
         * uzytkownika). Opis mowi wprost, CO sie wczytuje: otwarta lista z
         * filtrami z gry, nie caly dom aukcyjny. */
        return buttons +
          (line ? '<p class="mu-status">' + line + '</p>' : '') + resumeHint +
          '<p class="mu-subtitle" style="margin-top:8px">Wczytuje wszystkie strony listy otwartej teraz w oknie ' +
          'aukcji – z filtrami ustawionymi w grze, więc najpierw wpisz tam Max. cenę z <b>Kalkulatora</b>. ' +
          'Nic nie kupuje i nie licytuje.</p>';
      })() +
      (d.lastDom ? (function () {
        const status = d.lastDom.complete
          ? '<span class="mu-pos">Pobrano komplet listy dla tego filtra.</span>'
          : '<span class="mu-mut">To jeszcze nie komplet.</span>';
        return '<p class="mu-subtitle">W oknie gry <b>' + d.lastDom.allCount + '</b> wierszy, zobaczonych ' +
          'dotąd <b>' + d.lastDom.covered + '</b>' +
          (d.lastDom.total === null ? '' : ' z <b>' + d.lastDom.total + '</b>') +
          ' pasujących aukcji (' + new Date(d.lastDom.at).toLocaleTimeString() + '). ' + status + '</p>';
      })() : '') +
      /* Dane (eksport/import/czyszczenie) tez zwiniete - uzywane rzadko
       * (uwaga uzytkownika). */
      '<details class="mu-target" id="mu-data-details"' + (collectDataOpen ? ' open' : '') + '>' +
        '<summary>Dane</summary>' +
        '<div style="padding:8px;display:flex;flex-wrap:wrap;gap:6px">' +
          '<button class="mu-btn" id="mu-exp">Eksport JSON</button>' +
          '<button class="mu-btn" id="mu-imp">Import JSON</button>' +
          '<button class="mu-btn" id="mu-purge">Usuń starsze niż ' + cfg.stats.retentionDays + ' dni</button>' +
          '<button class="mu-btn" id="mu-wipe">Wyczyść wszystko</button>' +
        '</div>' +
      '</details>' +
      '<input type="file" id="mu-file" accept="application/json" style="display:none">';

    const dataDetails = body.querySelector('#mu-data-details');
    dataDetails.addEventListener('toggle', function () { collectDataOpen = dataDetails.open; });

    const loadAll = body.querySelector('#mu-load-all');
    if (loadAll) loadAll.onclick = function () { MU.sniffer.loadAllPages(); };
    const loadResume = body.querySelector('#mu-load-resume');
    if (loadResume) loadResume.onclick = function () { MU.sniffer.loadAllPages({ resume: true }); };
    const loadStop = body.querySelector('#mu-load-stop');
    if (loadStop) loadStop.onclick = function () { MU.sniffer.stopLoadAll(); };
    body.querySelector('#mu-exp').onclick = function () {
      MU.store.exportAll().then(function (data) {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ulepy-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      });
    };
    const file = body.querySelector('#mu-file');
    body.querySelector('#mu-imp').onclick = function () { file.click(); };
    file.onchange = function () {
      const f = file.files[0];
      if (!f) return;
      f.text().then(function (t) {
        try {
          return MU.store.importAll(JSON.parse(t), false).then(function (n) {
            alert('Zaimportowano ' + n + ' obserwacji.');
            refresh();
          });
        } catch (e) { alert('Nieprawidłowy plik JSON.'); }
      });
    };
    body.querySelector('#mu-purge').onclick = function () {
      MU.store.purgeOld(cfg.stats.retentionDays).then(function (n) {
        alert('Usunięto ' + n + ' rekordów.'); refresh();
      });
    };
    body.querySelector('#mu-wipe').onclick = function () {
      if (confirm('Usunąć wszystkie zebrane obserwacje (i bazę śledzonych aukcji)? Tej operacji nie da się cofnąć.')) {
        MU.store.clearAll().then(function () {
          /* Liczniki w MU.lifecycle sa czysto in-memory (licza od startu
           * sesji, nie z bazy) - bez tego dalej pokazywalyby stare
           * wartosci mimo wyczyszczonej bazy. */
          const c = MU.lifecycle.state.counters;
          c.sold = 0; c.expired = 0; c.ambiguous = 0; c.asks = 0; c.tracked = 0;
          refresh();
        });
      }
    };
  }

  /* --- eksport CSV ---------------------------------------------------- */

  /* Eksport musi brac dane z zakladki, ktora jest AKTUALNIE widoczna -
   * "lastRows"/"lastRowsItems" sa ustawiane niezaleznie w renderTable/
   * renderItems, wiec bez tego rozroznienia klikniecie Eksportu na
   * Przedmiotach albo pokazywalo falszywe "brak danych" (gdy Tabela
   * nigdy nie byla otwarta), albo po cichu eksportowalo dane z INNEJ
   * zakladki niz ta widoczna na ekranie. */
  function exportCsv() {
    if (activeTab === 'przedmioty') return exportCsvItems();
    if (!lastRows.length) { alert('Brak danych do eksportu.'); return; }
    const head = ['przedzial', 'kategoria', 'rzadkosc', 'sr_poziom',
      'cena', 'punkty', 'koszt_za_punkt', 'pewnosc', 'brak_danych'];
    const lines = [head.join(';')];
    for (const r of lastRows) {
      lines.push([
        r.bracket, GROUP_LABELS[r.category] || r.category, MU.cfg.rarityById(r.rarity).label,
        fx(r.lvl, 0), fx(r.price), r.points, fx(r.costPerPoint, 2), fx(r.confidence, 3),
        r.empty ? '1' : '0',
      ].join(';'));
    }
    downloadCsv(lines, 'ulepy-srednie-ceny.csv');
  }

  function exportCsvItems() {
    if (!lastRowsItems.length) { alert('Brak danych do eksportu.'); return; }
    const head = ['przedmiot', 'kategoria', 'rzadkosc', 'poziom',
      'cena', 'punkty', 'koszt_za_punkt'];
    const lines = [head.join(';')];
    for (const r of lastRowsItems) {
      lines.push([
        r.name, MU.cfg.categoryById(r.category).label, MU.cfg.rarityById(r.rarity).label,
        fx(r.lvl, 0), fx(r.price), r.points, fx(r.costPerPoint, 2),
      ].join(';'));
    }
    downloadCsv(lines, 'ulepy-przedmioty.csv');
  }

  function downloadCsv(lines, filename) {
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  function fx(v, d) {
    if (!isFinite(v)) return '';
    /* Przecinek dziesietny - polski Excel inaczej potraktuje to jak tekst. */
    return String(U.round(v, d === undefined ? 0 : d)).replace('.', ',');
  }

  /* --- render --------------------------------------------------------- */

  /* --- zakladka: kalkulator ------------------------------------------ */

  /* Stan kalkulatora = cel ulepszania dla calego panelu (Przedmioty i
   * Srednie ceny licza bonusy wzgledem niego - patrz currentTarget).
   * Zapisywany w localStorage, zeby po przeladowaniu gry cel nie wracal po
   * cichu do domyslnej legendy. Samo liczenie jest w MU.upgrade.budgetPlan:
   * tylko punkty, bez oplaty za +5 i bez esencji (decyzja uzytkownika).
   * Grupa nie zmienia kafelkow (bonus +25% jest ten sam dla kazdej grupy) -
   * decyduje tylko, KTORE oferty w Przedmiotach go dostaja. */
  const CALC_RARITIES = [
    { id: 'unikat', label: 'Unikat' }, { id: 'heroik', label: 'Heroik' }, { id: 'legenda', label: 'Legenda' },
  ];
  const CALC_KEY = 'MU_CALC_v1';
  const calc = (function () {
    const c = { rarity: 'legenda', group: '', from: 0, lvl: '', budget: '' };
    try {
      const s = JSON.parse(localStorage.getItem(CALC_KEY) || 'null') || {};
      if (CALC_RARITIES.some(function (r) { return r.id === s.rarity; })) c.rarity = s.rarity;
      if (GROUP_ORDER.indexOf(s.group) >= 0) c.group = s.group;
      if (s.from >= 0 && s.from <= 4) c.from = s.from | 0;
      if (typeof s.lvl === 'string') c.lvl = s.lvl;
      if (typeof s.budget === 'string') c.budget = s.budget;
    } catch (e) { /* brak localStorage - zostaja domyslne */ }
    return c;
  })();
  function saveCalc() {
    try { localStorage.setItem(CALC_KEY, JSON.stringify(calc)); } catch (e) {}
  }

  /* Liczby ZAWSZE z odstepem co 3 cyfry (takze "1 684") - toLocaleString('pl-PL')
   * nie grupuje liczb 4-cyfrowych, przez co obok siebie stalo "1684" i
   * "2 968 000" (uwaga uzytkownika o niespojnym zapisie). */
  function calcNum(v) {
    return String(Math.floor(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* Wynik kalkulatora dla aktualnie wpisanych danych albo null. Uzywany
   * tez w zakladce Zbieranie (podpowiedz, ile wpisac w "Max. cena"). */
  function calcPlan() {
    const lvl = parseInt(calc.lvl, 10);
    const parsed = MU.normalize.parseGoldText(calc.budget);
    const budget = parsed && !parsed.hasPremium ? parsed.gold : NaN;
    if (!(lvl > 0) || !(budget > 0)) return null;
    const p = MU.upgrade.budgetPlan(lvl, calc.rarity, calc.from, budget);
    if (!p) return null;
    const brackets = MU.cfg.get().brackets;
    const maxLvl = brackets.length ? brackets[brackets.length - 1][1] : 300;
    const mpp = Math.floor(p.maxPerPoint);
    /* Osobno dla unikatow i heroikow: heroikow tak tanio nikt nie sprzedaje
     * (uwaga uzytkownika), wiec zalecany pulap Max. ceny to pulap unikatu -
     * inaczej gra wysylalaby wszystkie unikaty az do pulapu heroika. */
    return { lvl: lvl, budget: budget, p: p, caps: {
      unikat: MU.upgrade.maxOfferPrice(mpp, calc.rarity, maxLvl, 'unikat'),
      heroik: MU.upgrade.maxOfferPrice(mpp, calc.rarity, maxLvl, 'heroik'),
      lvl: maxLvl,
    } };
  }

  function calcOutHtml() {
    const c = calcPlan();
    if (!c) {
      return '<p class="mu-subtitle">Wpisz poziom przedmiotu i budżet, np. <b>6g</b>, <b>500m</b> albo <b>750k</b>.</p>';
    }
    const p = c.p;
    /* Wynik jako dwa duze kafelki zamiast malej tabeli - najwazniejsze
     * liczby od razu widoczne (uwaga uzytkownika o czytelnosci). */
    return '<p class="mu-calc-line">' + MU.cfg.rarityById(calc.rarity).label + ' lvl ' + c.lvl +
        ': +' + calc.from + ' &rarr; +5 &middot; potrzeba <b>' + calcNum(p.points) + '</b> pkt &middot; ' +
        'budżet <b>' + calcNum(c.budget) + '</b> (' + U.gold(c.budget) + ')</p>' +
      '<div class="mu-tiles">' +
        '<div class="mu-tile"><span class="mu-tile-lbl">Max za punkt</span>' +
          '<span class="mu-tile-val">' + calcNum(p.maxPerPoint) + '</span>' +
          '</div>' +
        '<div class="mu-tile"><span class="mu-tile-lbl">Z tej samej grupy (+25%)</span>' +
          '<span class="mu-tile-val">' + calcNum(p.groupMaxPerPoint) + '</span>' +
          '</div>' +
        /* Ulepszanie heroika heroikami (unikatu unikatami): bonus +200% za
         * te sama rzadkosc - tego brakowalo (uwaga uzytkownika). */
        (calc.rarity === 'heroik' || calc.rarity === 'unikat' ? (function () {
          const who = calc.rarity === 'heroik' ? 'Heroikiem' : 'Unikatem';
          return '<div class="mu-tile"><span class="mu-tile-lbl">' + who + ' (+200%)</span>' +
              '<span class="mu-tile-val">' + calcNum(p.sameRarityMaxPerPoint) + '</span>' +
              '</div>' +
            '<div class="mu-tile"><span class="mu-tile-lbl">' + who + ' z tej samej grupy (+225%)</span>' +
              '<span class="mu-tile-val">' + calcNum(p.sameRarityGroupMaxPerPoint) + '</span>' +
              '</div>';
        })() : '') +
      '</div>' +
      offerCapCalloutHtml(c.caps, calc.rarity) +
      '<p class="mu-subtitle" style="margin:0">Liczone tylko z punktów – bez opłaty za +5 i bez esencji.</p>';
  }

  /* Podpowiedz "Max. cena" - wyrozniona zlota ramka (uwaga uzytkownika: w
   * szarej ramce byla niewidoczna), tylko w Kalkulatorze. Pod kazda cena
   * krotkie wyjasnienie (uwaga uzytkownika: bez niego nie bylo wiadomo, co
   * i jak), ale bez dawnych bledow: "Rzadkosc Heroiczne" wprost jako filtr
   * w grze, nie wybor w Kalkulatorze, i bez "tak tanie heroiki sie nie
   * trafiaja" - przy wiekszym budzecie to nieprawda. Dwie ceny, bo jedna nie
   * wystarczy: z pulapem unikatu gra nie wysle drozszych, a wciaz oplacalnych
   * heroikow. */
  function offerCapCalloutHtml(caps, rarity) {
    const row = function (who, v, why) {
      return '<div class="mu-callout-row">' + who + ': <span class="mu-callout-val">' + calcNum(v) + '</span> ' +
        '<span class="mu-callout-sub">(' + U.gold(v) + ')</span>' +
        '<div class="mu-callout-sub">' + why + '</div></div>';
    };
    /* Stopka: ceny to GORNA granica dla najlepszego skladnika - nizszy
     * poziom daje mniej punktow (uwaga uzytkownika: heroik 20 lvl za 20m
     * miesci sie w pulapie, a wcale sie nie oplaca). O konkretnej ofercie
     * rozstrzyga zielone podswietlenie w Przedmiotach. */
    return '<div class="mu-callout"><span class="mu-callout-lbl">Ustaw w oknie aukcji Max. cenę</span>' +
      row('Unikaty', caps.unikat, 'Droższe unikaty i tak się nie opłacają – z tą ceną gra ich w ogóle nie ' +
        'wyśle, więc ładowanie będzie dużo krótsze.') +
      row('Heroiki', caps.heroik, (rarity === 'heroik' ? 'Z bonusem +200% za tę samą rzadkość. ' : '') +
        'Żeby je sprawdzić, osobno ustaw w oknie aukcji rzadkość Heroiczne i tę cenę (to filtr w grze, nie ' +
        'wybór w Kalkulatorze). Jeśli na twoim świecie tak tanich heroików nie ma, pomiń to – oszczędzisz ' +
        'jedno ładowanie.') +
      '<div class="mu-callout-sub mu-callout-foot">To górne granice, liczone dla najlepszego składnika (' +
        caps.lvl + ' lvl, ta sama grupa). Niższy poziom daje mniej punktów, więc np. heroik na 20 lvl opłaca ' +
        'się dużo taniej. Czy konkretna oferta się opłaca, pokazuje na zielono zakładka <b>Przedmioty</b>.</div>' +
      '</div>';
  }

  function renderCalc(body) {
    function seg(id, items, current) {
      return '<div class="mu-seg-row" id="' + id + '">' + items.map(function (it) {
        return '<button type="button" class="mu-seg' + (String(current) === String(it.id) ? ' mu-active' : '') +
          '" data-v="' + it.id + '">' + it.label + '</button>';
      }).join('') + '</div>';
    }
    /* Formularz jako siatka: etykiety w jednej kolumnie, przyciski i pola
     * rowno pod soba (uwaga uzytkownika - rozjechane rzedy). */
    body.innerHTML =
      '<div class="mu-calc-grid">' +
        '<span class="mu-seg-lbl">Rzadkość</span>' + seg('mu-calc-rar', CALC_RARITIES, calc.rarity) +
        '<span class="mu-seg-lbl">Obecne ulepszenie</span>' +
          seg('mu-calc-from', [0, 1, 2, 3, 4].map(function (k) { return { id: k, label: '+' + k }; }), calc.from) +
        '<span class="mu-seg-lbl" title="Grupa przedmiotu, który ulepszasz – składniki z tej samej grupy dostają +25% punktów (liczone w Przedmiotach)">Grupa</span>' +
          seg('mu-calc-grp', GROUP_ORDER.map(function (g) { return { id: g, label: GROUP_LABELS[g] }; }), calc.group) +
        '<label class="mu-seg-lbl" for="mu-calc-lvl">Poziom</label>' +
        '<div class="mu-calc-inputs"><input id="mu-calc-lvl" type="number" min="1" max="300" ' +
          'placeholder="np. 244" value="' + U.escapeHtml(calc.lvl) + '">' +
          '<label class="mu-seg-lbl" for="mu-calc-budget">Budżet</label><input id="mu-calc-budget" type="text" ' +
          'placeholder="np. 6g" value="' + U.escapeHtml(calc.budget) + '"></div>' +
      '</div>' +
      (calc.group ? '' : '<p class="mu-subtitle">Wybierz <b>grupę</b> przedmiotu – wtedy Przedmioty doliczą +25% ' +
        'składnikom z tej samej grupy.</p>') +
      '<div id="mu-calc-out"></div>';

    body.querySelectorAll('#mu-calc-rar .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { calc.rarity = b.getAttribute('data-v'); saveCalc(); renderCalc(body); });
    });
    body.querySelectorAll('#mu-calc-from .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { calc.from = parseInt(b.getAttribute('data-v'), 10); saveCalc(); renderCalc(body); });
    });
    body.querySelectorAll('#mu-calc-grp .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { calc.group = b.getAttribute('data-v'); saveCalc(); renderCalc(body); });
    });
    const out = body.querySelector('#mu-calc-out');
    const lvlIn = body.querySelector('#mu-calc-lvl');
    const budIn = body.querySelector('#mu-calc-budget');
    function update() { calc.lvl = lvlIn.value; calc.budget = budIn.value; saveCalc(); out.innerHTML = calcOutHtml(); }
    lvlIn.addEventListener('input', update);
    budIn.addEventListener('input', update);
    update();
  }

  function render(bodyOnly) {
    if (!panel) return;
    if (!bodyOnly) renderBar();
    const body = panel.querySelector('#mu-body');
    if (activeTab === 'tabela') renderTable(body);
    else if (activeTab === 'przedmioty') renderItems(body);
    /* Kalkulator nie zalezy od zebranych danych - raz narysowanego
     * formularza nie przerysowuje ZADNE odswiezenie (takze pelne, np. po
     * otwarciu panelu - konczy sie asynchronicznie i w lokalnym tescie
     * wyrzucalo kursor z pola, gubiac wpisywane cyfry). Rysujemy go tylko,
     * gdy go jeszcze nie ma (wejscie na zakladke). */
    else if (activeTab === 'kalkulator') { if (!body.querySelector('#mu-calc-out')) renderCalc(body); }
    else renderCollect(body);
  }

  return {
    mount: mount, toggle: toggle, refresh: refresh, render: render,
    notifyNewData: notifyNewData, state: state,
    get index() { return index; },
  };
})();

/* ===== 11-main.js ===== */
/* ------------------------------------------------------------------ *
 * MU.main - spiecie calosci.
 * ------------------------------------------------------------------ */
(function () {

  /* Swiat gry - dane trzymamy per swiat, bo ceny na roznych swiatach
   * nie maja ze soba nic wspolnego. */
  function detectWorld() {
    try {
      const m = /^(?:www\.)?([a-z0-9-]+)\.margonem\.(pl|com)$/i.exec(location.hostname);
      if (m && m[1] !== 'www' && m[1] !== 'forum' && m[1] !== 'pomoc') return m[1].toLowerCase();
      if (window.g && window.g.worldname) return String(window.g.worldname).toLowerCase();
      if (window.Engine && window.Engine.worldConfig && window.Engine.worldConfig.getWorldName) {
        return String(window.Engine.worldConfig.getWorldName()).toLowerCase();
      }
    } catch (e) {}
    return null;
  }

  /* Czy jestesmy w kliencie gry, czy na stronie serwisu. Sniffer instalujemy
   * wszedzie (jest tani i pasywny), ale panel tylko w grze. */
  function looksLikeGameClient() {
    return !!(window.g || window.Engine ||
      document.querySelector('#centerbox, #gameContainer, .game-window, #map'));
  }

  function boot() {
    MU.cfg.load();
    const world = detectWorld();
    if (world) {
      MU.cfg.get().world = world;
      MU.cfg.save();
    }

    MU.store.init().then(function (mode) {
      console.log('[Ulepy] magazyn:', mode, '| swiat:', world || 'nieznany');
      MU.lifecycle.attach();
      /* Sprzatanie starych rekordow raz na start - inaczej baza rosnie
       * w nieskonczonosc przez wszystkie sesje. */
      MU.store.purgeOld(MU.cfg.get().stats.retentionDays).then(function (n) {
        if (n) console.log('[Ulepy] usunieto', n, 'przeterminowanych obserwacji');
      });

      if (document.body) mountUi();
      else document.addEventListener('DOMContentLoaded', mountUi);
    });
  }

  function mountUi() {
    if (!looksLikeGameClient()) return;
    MU.ui.mount();
    MU.ui.refresh();
  }

  /* Sniffer musi ruszyc jak najwczesniej - inaczej przegapimy zapytania
   * wykonane przy starcie klienta. Reszta moze poczekac na DOM. */
  MU.sniffer.install();
  boot();

  /* Dostep z konsoli - do recznej inspekcji i debugowania. */
  window.MU = MU;
})();

})();
