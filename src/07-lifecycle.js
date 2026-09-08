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
