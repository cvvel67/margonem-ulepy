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
      bonusApplied: !!target && upgrade === 0,
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
        bonusApplied: !!target && s.upgrade === 0,
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
