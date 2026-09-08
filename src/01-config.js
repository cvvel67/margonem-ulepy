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
  const LS_KEY = 'MU_CFG_v8';

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
   * koczan (amunicja), pominiety - to nie sprzet do ulepszania. */
  const defaultCategories = [
    { id: 'bron', label: 'Bron', group: 'bronie', cl: ['weapon', '4', 'magic'], kw: [
      'miecz', 'topor', 'topór', 'mlot', 'młot', 'sztylet', 'kostur',
      'rozdzka', 'różdżka', 'luk', 'łuk', 'kusza',
      'wlocznia', 'włócznia', 'kosa', 'bulawa', 'buława',
      'szpada', 'pika', 'laska', 'berlo', 'berło', 'ostrze', 'katana',
      'glewia', 'halabarda', 'maczuga', 'noz', 'nóż', 'palka',
      'pałka', 'cep', 'obuch'] },
    /* Orb (`cl:'7'`) i Bron pomocnicza (`cl:'5'`) to bron do drugiej
     * reki - kw ponizej to tylko awaryjny fallback, bo real nazwy
     * przedmiotow tych typow rzadko zawieraja te slowa wprost (dzieli
     * je od bron glownej wylacznie slot/cl, nie nazwa). */
    { id: 'orb', label: 'Orb', group: 'bronie', cl: ['7'], kw: [
      'orb', 'kula magiczna', 'sfera'] },
    { id: 'bron_pomocnicza', label: 'Bron pomocnicza', group: 'bronie', cl: ['5'], kw: [
      'bron pomocnicza', 'broń pomocnicza', 'sztylet pomocniczy'] },
    { id: 'pancerz', label: 'Pancerz', group: 'pancerz', cl: ['8'], kw: [
      'pancerz', 'zbroja', 'kolczuga', 'napiersnik', 'napierśnik',
      'kirys', 'szata', 'tunika', 'kaftan', 'plaszcz', 'płaszcz',
      'karacena', 'brygantyna', 'bluza', 'koszula', 'suknia', 'kubrak'] },
    { id: 'helm', label: 'Helm', group: 'pancerz', cl: ['9'], kw: [
      'helm', 'hełm', 'kaptur', 'czapka', 'korona', 'diadem',
      'przylbica', 'przyłbica', 'kapelusz', 'opaska', 'maska',
      'czepiec', 'misiurka', 'szyszak'] },
    { id: 'buty', label: 'Buty', group: 'pancerz', cl: ['10'], kw: [
      'buty', 'trzewiki', 'sandaly', 'sandały', 'cizmy', 'ciżmy',
      'obuwie', 'kalosze', 'sabaty', 'nagolenniki', 'onuce', 'botki'] },
    { id: 'rekawice', label: 'Rekawice', group: 'pancerz', cl: ['11'], kw: [
      'rekawice', 'rękawice', 'rekawiczki', 'rękawiczki',
      'karwasze', 'nareczaki', 'naręczaki'] },
    { id: 'tarcza', label: 'Tarcza', group: 'pancerz', cl: ['14'], kw: [
      'tarcza', 'puklerz', 'pawez', 'pawęż'] },
    { id: 'pierscien', label: 'Pierscien', group: 'bizuteria', cl: ['12'], kw: [
      'pierscien', 'pierścien', 'pierścień', 'sygnet',
      'obraczka', 'obrączka'] },
    { id: 'naszyjnik', label: 'Naszyjnik', group: 'bizuteria', cl: ['13'], kw: [
      'naszyjnik', 'amulet', 'wisior', 'medalion', 'talizman', 'lancuch',
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
