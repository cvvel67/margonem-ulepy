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
 * Dodatek tylko CZYTA to, co klient i tak pobiera. Nie generuje wlasnego
 * ruchu do serwera gry i nie automatyzuje zadnych akcji w grze.
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
    const m = /Ilo[śs][ćc]\s+aukcji:\s*([\d\s]+)/i.exec(document.body.textContent || '');
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
      const itemDiv = tr.querySelector('.item-slot-td .item');
      if (!itemDiv) continue;
      const idM = /item-id-(\d+)/.exec(itemDiv.className);
      const aid = idM ? idM[1] : null;

      if (aid && rowCache.has(aid)) {
        allCount++;
        const clCached = itemDiv.getAttribute('data-cl');
        if (clCached) clSeen.add(clCached);
        allIds.push(aid);
        const cachedObs = rowCache.get(aid);
        if (cachedObs) obs.push(cachedObs);
        continue;
      }

      const nameTd = tr.querySelector('.item-name-td');
      if (!nameTd) continue;
      const name = nameTd.textContent.trim();
      if (!name) continue;
      allCount++;
      const cl = itemDiv.getAttribute('data-cl');
      if (cl) clSeen.add(cl);
      if (aid) allIds.push(aid);

      const buyTd = tr.querySelector('.item-buy-now-td');
      const featured = !!(buyTd && buyTd.classList.contains('is-featured'));
      const buyLabel = buyTd && buyTd.querySelector('.auction-cost-label');
      const buyParsed = buyLabel ? N.parseGoldText(buyLabel.textContent) : null;
      if (featured || (buyParsed && buyParsed.hasPremium)) {
        if (aid) rowCache.set(aid, null);
        continue;
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
      if (o) obs.push(o);
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

  /* Automatyczne doladowywanie kolejnych stron listy aukcji - ZBADANE I
   * ODRZUCONE, zostaje tylko jako udokumentowany negatywny wynik.
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

  function install() {
    if (installed) return;
    installed = true;
    hookXhr();
    hookFetch();
    startGlobalWatch(30000);
    startDomWatch(8000);
    startKeepScrolledNearBottom(1500);
  }

  return {
    install: install, onSnapshot: onSnapshot, diag: diag,
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
