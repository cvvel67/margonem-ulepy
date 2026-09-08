/* ------------------------------------------------------------------ *
 * MU.util - drobiazgi wspoldzielone przez reszte modulow.
 * ------------------------------------------------------------------ */
MU.util = (function () {

  const DAY_MS = 86400000;

  /* Formatowanie zlota w konwencji KLIENTA GRY: 1 000 000 -> "1m", 25 000 -> "25k"
   * (potwierdzone podgladem realnego okna aukcji - gra uzywa k/m/mld,
   * NIE potocznego "kk" z czatu). Spojnosc z tym, co gracz widzi na aukcji,
   * jest wazniejsza niz slangowa konwencja. */
  function gold(n) {
    if (n === null || n === undefined || !isFinite(n)) return '-';
    const neg = n < 0;
    const a = Math.abs(n);
    let s;
    if (a >= 1e9) s = round(a / 1e9, 2) + 'mld';
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
