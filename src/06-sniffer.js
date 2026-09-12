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
