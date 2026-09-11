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
       * talizmany, torby, leczace, waluty, teleporty) albo strzaly. Nie
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
