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
