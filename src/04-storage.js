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
