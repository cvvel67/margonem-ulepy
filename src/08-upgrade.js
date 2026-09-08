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

  return {
    RARITY_E: RARITY_E, RARITY_N: RARITY_N, STEP_PCT: STEP_PCT,
    formulaBase: formulaBase, basePoints: basePoints, sacrificeYield: sacrificeYield,
    stepPointsCost: stepPointsCost, totalPointsCost: totalPointsCost,
    finalizeGoldCost: finalizeGoldCost, essenceValue: essenceValue,
    finalizeEssenceCost: finalizeEssenceCost, costPerPoint: costPerPoint,
  };
})();
