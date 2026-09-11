/* ------------------------------------------------------------------ *
 * MU.ui - panel wynikowy.
 *
 * Jedna tabela odpowiadajaca na jedno pytanie: "co najtaniej daje punkty
 * ulepszenia?" (cena / efektywne punkty z poswiecenia - patrz MU.upgrade).
 * Zadnego "kup i sprzedaj drozej" - punkty sluza do wlasnego ulepszania,
 * wiec jedyna miara oplacalnosci to koszt za punkt. Domyslny sort:
 * rosnaco po koszcie za punkt (najlepsza okazja na gorze).
 * ------------------------------------------------------------------ */
MU.ui = (function () {

  const U = MU.util;
  let root = null, panel = null, index = null, lastRows = [], lastRowsItems = [];
  /* Domyslny sort Tabeli: rosnaco po przedziale lvl (patrz zadanie
   * uzytkownika) - NIE po koszcie za punkt jak wczesniej. Przedmioty
   * (ITEM_COLS/sortKeyItems ponizej) maja wlasny, osobny stan sortowania. */
  let sortKey = 'bracket', sortDir = 1;
  let activeTab = 'tabela';

  /* Etykiety trzech nadrzednych grup zasobu (Bronie/Pancerz/Bizuteria -
   * patrz MU.cfg categories[].group) - uzywane wylacznie w zakladce
   * Tabela, ktora teraz operuje na tym nadrzednym podziale zamiast
   * drobiazgowych kategorii (patrz MU.aggregate.buildCoarseTable). */
  const GROUP_LABELS = { bronie: 'Bronie', pancerz: 'Pancerze', bizuteria: 'Bizuteria' };
  const GROUP_ORDER = ['bronie', 'pancerz', 'bizuteria'];

  const state = {
    targetRarity: '',   // rzadkosc ulepszanego przedmiotu ('' = brak celu, widok bazowy)
    targetGroup: '',    // grupa ulepszanego przedmiotu ('' = brak celu)
    targetLevel: '',    // poziom ulepszanego przedmiotu - potrzebny do wzorow calkowitego kosztu
    tableGroup: 'bronie',    // zakladka Tabela: dokladnie JEDNA z 3 grup zasobu
    tableRarity: 'unikat',   // zakladka Tabela: dokladnie JEDNA z 2 rzadkosci (unikat/heroik)
    targetOpen: false,       // czy zwijana sekcja "Cel ulepszania" jest rozwinieta
  };

  const CSS = `
/* --- Ikona w stylu paska widgetow gry (.widget-button.green - patrz
 * top-right/top-left main-buttons-container) - zastepuje dawny wlasny
 * okragly przycisk. Stoi TUZ OBOK natywnego paska (nie wewnatrz niego -
 * gra sama zarzadza ukladem swoich .widget-button i wstawienie obcego
 * elementu do srodka ryzykowaloby, ze zostanie nadpisany przy kolejnym
 * przeliczeniu ukladu), wiec wyglada jak jego naturalna kontynuacja bez
 * ingerowania w kod gry. */
.mu-bar-icon{position:fixed;z-index:2147483000;width:44px;height:44px;border-radius:4px;
  background-image:linear-gradient(#3a5a2a,#16250f);border:1px solid #0c0d0d;
  box-shadow:0 0 0 1px #cecece inset,0 0 0 3px #0c0d0d inset;cursor:pointer;padding:0;
  display:flex;align-items:center;justify-content:center;transition:filter .12s ease}
.mu-bar-icon:hover{filter:brightness(1.18)}
.mu-bar-icon:active{filter:brightness(.92)}
.mu-bar-icon .mu-bi-glyph{font:700 17px/1 system-ui,sans-serif;color:#e8dcc0;text-shadow:0 1px 1px #000}
.mu-bar-icon .mu-dot{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;background:#c0562e;
  color:#fff;font:600 10px/16px system-ui,sans-serif;display:none;padding:0 4px;box-shadow:0 0 0 2px #1a1512}

/* --- Okno dodatku: reuzywa NATYWNYCH klas okien Margonem (c-window,
 * border-window, header-label-positioner, close-button-corner-decor,
 * cards-header-wrapper...) - naglowek, przycisk zamkniecia i wyglad
 * zakladek pochodza wprost z JUZ zaladowanego arkusza stylow gry. Wlasny
 * CSS ponizej (wnetrze: pasek filtrow, tabela, statystyki) zostal
 * zbudowany na podstawie REALNYCH tokenow kolorystycznych/typograficznych
 * zbadanych na zywo w innych oknach gry (Aukcje, paski postepu questow/
 * rzemiosla) - nie na wlasnej interpretacji "ciemnego motywu fantasy":
 *   - tlo/tekst tabeli: rgb(255,255,255) na czarnych odcieniach - dokladnie
 *     jak wiersze .auction-table w oknie Aukcji.
 *   - szary rgb(112,113,114) dla stanu "nieaktywny" - dokladnie jak
 *     .action-menu-item w lewym panelu Aukcji.
 *   - pasek postepu (.mu-progress) - te same wartosci co natywna klasa
 *     gry .interface-element-progress-bar-2 (tor/obwodka/gradient wypelnienia).
 *   - font: Arimo/Calibri/Segoe - ten sam stack, ktorego gra uzywa wszedzie.
 * Rozmiar okna: CELOWO waski (ma stac OBOK okna Aukcji na ekranie
 * rownoczesnie, nie zaslaniac go) - patrz zadanie uzytkownika. 460px
 * (nie 400px) - zweryfikowane na zywo, ze Przedmioty (7 kolumn) przy
 * 400px wymuszaja poziome przewijanie. */
.mu-window{position:fixed;display:none;z-index:2147483000;width:min(460px,calc(100vw - 24px));
  /* Natywny border-image (window-frame.png) renderuje sie nieprawidlowo
   * (blade/jasne, "biale" pasy) przy tak waskiej, niestandardowej
   * szerokosci okna - zweryfikowane na zywo. Wlasna, jednolicie ciemna
   * ramka zamiast ryzykowac jasne artefakty - naglowek/zakladki/przycisk
   * zamkniecia (osobne elementy, bez tego problemu) zostaja natywne. */
  border-image:none;border-color:#000;background:#141414;
  /* Bez tego przegladarka rysuje wlasny, JASNY domyslny suwak przewijania
   * (motyw strony nigdy nie zadeklarowal color-scheme:dark) - to on byl
   * zrodlem "bialych zaokraglonych naroznikow" w gornej/dolnej czesci
   * prawej krawedzi okna, zweryfikowane na zywo (computed color-scheme
   * bylo "normal", nie "dark"). Ponizsze ::-webkit-scrollbar to dodatkowe,
   * jawne dociemnienie - dziala nawet gdy samo color-scheme z jakiegos
   * powodu nie wystarczy. */
  color-scheme:dark}
.mu-window.mu-open{display:block}
.mu-window .content{padding:0}
.mu-body::-webkit-scrollbar{width:10px}
.mu-body::-webkit-scrollbar-track{background:#1a1a1a}
.mu-body::-webkit-scrollbar-thumb{background:#444;border-radius:5px}
.mu-body::-webkit-scrollbar-thumb:hover{background:#555}
.mu-window .header-label .text{display:flex;align-items:baseline;gap:7px;justify-content:center}
.mu-window .header-label .text .mu-sub{font-weight:400;opacity:.7;font-size:11px}
.mu-window .header-label-positioner{cursor:move}
.mu-window .cards-header-wrapper.tabs-nav .card{cursor:pointer}
.mu-window .inner-content{display:flex;flex-direction:column;
  height:min(480px,calc(100vh - 130px));min-height:260px}
.mu-body{flex:1;overflow:auto;padding:8px;background:#141414;color:#e8e8e8;
  font:12px/1.4 Arimo,Calibri,Segoe,"Segoe UI",Optima,Arial,sans-serif}
.mu-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 8px;
  border-bottom:1px solid #000;background:#191919}
.mu-bar .mu-fld{display:flex;flex-direction:column;gap:2px}
.mu-bar .mu-fld>span{font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
.mu-bar select,.mu-bar input{background:#1c1c1c;border:1px solid #333;color:#e8e8e8;border-radius:4px;
  padding:3px 5px;font-size:11px;height:24px;transition:border-color .12s ease,background .12s ease}
.mu-bar select{cursor:pointer;min-width:88px}
.mu-bar select:hover,.mu-bar input:hover{border-color:#666}
.mu-bar select:focus-visible,.mu-bar input:focus-visible,.mu-btn:focus-visible,.mu-icon-btn:focus-visible,
.mu-seg:focus-visible,table.mu-t th:focus-visible{outline:2px solid #c99a4a;outline-offset:1px}
.mu-btn{background:#2a2a2a;border:1px solid #444;color:#e8e8e8;border-radius:4px;padding:0 10px;height:24px;
  cursor:pointer;font-size:11px;font-weight:600;transition:background .12s ease,transform .05s ease}
.mu-btn:hover{background:#383838}
.mu-btn:active{transform:translateY(1px)}
.mu-bar-spacer{flex:1 0 4px}
/* Male, kwadratowe przyciski-ikony (Eksport/Odswiez) - oszczedzaja
 * miejsce w waskim oknie w porownaniu do przyciskow z pelnym tekstem. */
.mu-icon-btn{background:#2a2a2a;border:1px solid #444;color:#e8e8e8;border-radius:4px;width:24px;height:24px;
  cursor:pointer;font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;
  transition:background .12s ease,transform .05s ease}
.mu-icon-btn:hover{background:#383838}
.mu-icon-btn:active{transform:translateY(1px)}
/* Segmentowany przelacznik (wybor DOKLADNIE JEDNEJ opcji: grupa zasobu /
 * rzadkosc) - ZLACZONY pasek przyciskow, nie osobne "pigulki". Kolory
 * 1:1 z realnego CSS gry: aktywna zakladka = ten sam gradient co .card
 * (glowne zakladki okna), nieaktywna = rgb(112,113,114) - dokladnie kolor
 * nieaktywnego .action-menu-item w lewym panelu okna Aukcji. */
.mu-seg-block{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mu-seg-lbl{font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
.mu-seg-row{display:flex}
.mu-seg{padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;color:#707172;
  background:linear-gradient(#2b2b2b,#1e1e1e);border:1px solid #000;border-left:none;transition:color .12s ease}
.mu-seg:first-child{border-left:1px solid #000;border-radius:3px 0 0 3px}
.mu-seg:last-child{border-radius:0 3px 3px 0}
.mu-seg:hover{color:#a0a0a0}
.mu-seg.mu-active{color:#fff;background:linear-gradient(rgb(100,100,100),rgb(63,63,63))}
.mu-row{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:8px}
.mu-subtitle{font-size:11px;color:#8a8a8a;margin:0 0 8px;line-height:1.5}
.mu-subtitle b{color:#c99a4a}
/* Pasek statystyk w jednej linii + wbudowany pasek postepu zbierania
 * danych (patrz .mu-progress) zamiast osobnego duzego bloku tekstu. */
.mu-stats-line{font-size:11px;color:#8a8a8a;margin:0 0 8px;display:flex;flex-wrap:wrap;align-items:center;
  column-gap:12px;row-gap:4px;border-bottom:1px solid #000;padding-bottom:7px}
.mu-stats-line b{color:#e8e8e8;font-weight:600}
.mu-stats-line b.mu-hi{color:#f0d090}
.mu-progress-wrap{display:flex;align-items:center;gap:6px;margin-left:auto;color:#8a8a8a}
/* Pasek postepu - te same wartosci co natywna klasa gry
 * .interface-element-progress-bar-2 (uzywana w oknach questow/rzemiosla):
 * ciemny tor, jasna cienka obwodka, zloto-brazowy gradient wypelnienia. */
.mu-progress{width:70px;height:9px;background:rgb(54,52,53);border:1px solid rgb(204,204,204);
  border-radius:4px;overflow:hidden}
.mu-progress i{display:block;height:100%;background:linear-gradient(rgb(184,119,40) 70%,rgb(147,96,33) 70%)}
/* Zwijana sekcja "cel ulepszania" - domyslnie zwinieta, bo dotyczy
 * tylko dodatkowego szacunku calkowitego kosztu +0->+5 (patrz
 * renderTable) i nie jest potrzebna przy zwyklym przegladaniu tabeli. */
.mu-target{margin:0 0 8px;border:1px solid #000;border-radius:4px;background:#1a1a1a}
.mu-target summary{padding:5px 8px;cursor:pointer;font-size:10px;color:#8a8a8a;text-transform:uppercase;
  letter-spacing:.4px;font-weight:600;list-style:none}
.mu-target summary::-webkit-details-marker{display:none}
.mu-target summary::before{content:'\\25B8\\0020';display:inline-block}
.mu-target[open] summary::before{content:'\\25BE\\0020'}
.mu-target[open] summary{border-bottom:1px solid #000}
.mu-target-body{padding:7px 8px;display:flex;flex-wrap:wrap;gap:7px}
table.mu-t{width:100%;border-collapse:collapse;font-size:11px}
table.mu-t th{position:sticky;top:0;background:#1c1c1c;color:#999;text-align:right;padding:4px 4px;border-bottom:1px solid #333;
  cursor:pointer;white-space:nowrap;font-weight:600;z-index:1;user-select:none;transition:background .12s ease,color .12s ease}
table.mu-t th:hover{color:#ccc;background:#242424}
table.mu-t th.mu-sorted{color:#f0d090;box-shadow:inset 0 -2px 0 #c99a4a}
table.mu-t th:first-child{text-align:left}
table.mu-t td{padding:3px 4px;border-bottom:1px solid #232323;text-align:right;white-space:nowrap;color:#e8e8e8}
/* Pierwsza kolumna (nazwa przedmiotu / przedzial) moze sie zawijac -
 * nazwy przedmiotow nie maja gornego limitu dlugosci, wiec zamiast
 * szukac szerokosci okna "wystarczajacej na wszystko" (niemozliwe),
 * pozwalamy tej JEDNEJ kolumnie rosnac w pionie zamiast wymuszac
 * poziome przewijanie calej tabeli. */
table.mu-t td:first-child{text-align:left;white-space:normal;word-break:break-word;max-width:150px}
table.mu-t tbody tr:nth-child(even) td{background:rgba(0,0,0,.25)}
table.mu-t tr:hover td{background:rgba(255,255,255,.06)}
/* Wynik kluczowy (koszt za punkt) - najwazniejsza liczba w calej tabeli,
 * jedyna czesc danych z akcentem zlota (hierarchia wizualna: reszta
 * tabeli jest neutralnie biala/szara). */
table.mu-t td.mu-hi{color:#f0d090;font-weight:700}
/* Pusty przedzial: zamiast myslnika powtorzonego w kazdej komorce (szum
 * wizualny), caly wiersz jest wygaszony, a komorki poza pierwsza (nazwa
 * przedzialu) sa po prostu puste. */
tr.mu-empty-row td{color:#4a4a4a;opacity:.6}
tr.mu-empty-row td:first-child{color:#8a8a8a;opacity:1}
.mu-v{padding:1px 7px;border-radius:3px;font-size:11px;font-weight:600;display:inline-block}
.mu-v-oplaca{background:#1d3a24;color:#6ee08a;border:1px solid #2f6b3d}
.mu-v-ryzykowne{background:#3a3218;color:#e0c46e;border:1px solid #6b5c2f}
.mu-v-marginalne{background:#2a2a2a;color:#b0b0b0;border:1px solid #4a4a4a}
.mu-v-nie-oplaca{background:#3a1d1d;color:#e08a8a;border:1px solid #6b2f2f}
.mu-v-za-malo-danych,.mu-v-brak-danych{background:#22252e;color:#7f8ba3;border:1px solid #39415a}
.mu-pos{color:#6ee08a}.mu-neg{color:#e08a8a}.mu-mut{color:#888}
.mu-conf{display:inline-flex;align-items:center;gap:4px;vertical-align:middle}
.mu-conf i{display:block;width:24px;height:6px;background:#2a2a2a;border-radius:3px;overflow:hidden}
.mu-conf i b{display:block;height:100%;background:#6b8f4a;transition:width .2s ease}
.mu-conf span{font-size:10px;color:#8a8a8a;min-width:22px}
.mu-empty{padding:28px 14px;text-align:center;color:#888;line-height:1.6;font-size:11px}
.mu-empty b{color:#ccc}
.mu-kpi{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.mu-kpi div{background:#1a1a1a;border:1px solid #000;border-radius:5px;padding:5px 9px;min-width:78px}
.mu-kpi span{display:block;font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.3px}
.mu-kpi b{font-size:14px;color:#e8e8e8;font-weight:600}
.mu-sec{margin:0 0 6px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #000;padding-bottom:4px}
.mu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:7px;margin-bottom:14px}
.mu-f{background:#1a1a1a;border:1px solid #000;border-radius:4px;padding:5px 7px;transition:border-color .12s ease}
.mu-f:focus-within{border-color:#666}
.mu-f label{display:block;font-size:9px;color:#8a8a8a;margin-bottom:3px;text-transform:uppercase}
.mu-f input,.mu-f select{width:100%;background:#1c1c1c;border:1px solid #333;color:#e8e8e8;border-radius:3px;padding:4px 6px;font-size:11px}
.mu-note{background:#1a1a1a;border-left:3px solid #555;padding:6px 9px;margin:0 0 10px;color:#aaa;font-size:11px;line-height:1.5}
.mu-warn{background:#1e1a12;border-left:3px solid #8a6a3a;padding:6px 9px;margin:0 0 10px;color:#c0a47a;font-size:11px;line-height:1.5}
pre.mu-raw{background:#0d0d0d;border:1px solid #000;border-radius:4px;padding:8px;overflow:auto;max-height:180px;
  font:10px/1.4 ui-monospace,Consolas,monospace;color:#9a9a9a}
`;

  /* ---------------------------------------------------------------- */

  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  const TABS = [
    { id: 'tabela', label: 'Tabela' },
    { id: 'przedmioty', label: 'Przedmioty' },
    { id: 'zbieranie', label: 'Zbieranie' },
  ];

  /* Docelowy rodzic dla naszego okna: ten sam kontener, w ktorym gra
   * trzyma swoje wlasne okna (.c-window) - patrz zbadana na zywo
   * struktura Aukcji/Zegara. Z fallbackiem na document.body, gdyby ten
   * layer z jakiegos powodu nie istnial (np. bardzo wczesny etap
   * ladowania) - CSS naszego okna i tak dziala niezaleznie od rodzica. */
  function nativeWindowLayer() {
    return document.querySelector('.game-window-positioner .alerts-layer') ||
      document.querySelector('.game-window-positioner') || document.body;
  }

  /* Ikona-wlacznik: pozycjonowana TUZ OBOK natywnego paska widgetow gry
   * (.top-right.main-buttons-container - ten sam element, w ktorym siedza
   * "Klany"/"Globus"/"Zagadka" itd.), a NIE jako jego dziecko - gra sama
   * przelicza uklad wlasnych .widget-button (indeksy/pozycje "left"), wiec
   * wstrzykniecie obcego elementu do srodka tego kontenera ryzykowaloby
   * bycie nadpisanym/przesunietym przy nastepnym takim przeliczeniu.
   * Stojac obok, ikona wyglada jak naturalna czesc paska (ten sam styl
   * .widget-button.green), ale nigdy nie koliduje z logika gry. */
  function barIconPosition() {
    const bar = document.querySelector('.top-right.main-buttons-container') ||
      document.querySelector('.top-left.main-buttons-container');
    if (!bar) return { top: '4px', left: '4px' };
    const r = bar.getBoundingClientRect();
    const onRight = bar.classList.contains('top-right');
    return onRight
      ? { top: r.top + 'px', left: (r.left - 50) + 'px' }
      : { top: r.top + 'px', left: (r.right + 6) + 'px' };
  }

  /* Zapamietane pozycje - localStorage, oddzielnie od reszty konfiguracji
   * (MU.cfg), bo to czysto UI-owy stan bez wplywu na dane/obliczenia.
   * Dwa NIEZALEZNE klucze - okno i ikona-wlacznik przesuwaja sie
   * oddzielnie (uzytkownik moze chciec przestawic samą ikone, np. gdy
   * zasłania mu inny natywny przycisk, niezaleznie od tego, gdzie akurat
   * stoi samo okno). Zapisywane po KAZDYM przeciagnieciu (patrz
   * makeDraggable/makeIconDraggable), odczytywane raz w mount(). */
  const WINDOW_POS_KEY = 'MU_WINDOW_POS_v1';
  const ICON_POS_KEY = 'MU_ICON_POS_v1';

  function loadPos(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!isFinite(p.left) || !isFinite(p.top)) return null;
      return p;
    } catch (e) { return null; }
  }

  function savePos(key, left, top) {
    try { localStorage.setItem(key, JSON.stringify({ left: left, top: top })); } catch (e) {}
  }

  /* Utrzymuje przynajmniej 60px elementu widoczne na ekranie -
   * zabezpieczenie na wypadek zmiany rozdzielczosci miedzy sesjami
   * (pozycja zapisana na szerokim monitorze nie moze wypchnac elementu
   * calkowicie poza ekran wezszy). */
  function clampPos(left, top) {
    const maxLeft = Math.max(0, window.innerWidth - 60);
    const maxTop = Math.max(0, window.innerHeight - 60);
    return { left: Math.min(Math.max(0, left), maxLeft), top: Math.min(Math.max(0, top), maxTop) };
  }

  /* Wlasna, niezalezna od jQuery UI implementacja przeciagania za naglowek -
   * standardowe zdarzenia myszy (mousedown/mousemove/mouseup) bez zadnych
   * zewnetrznych zaleznosci ani zalozen o konkretnej wersji jQuery UI
   * dolaczonej przez klienta gry, wiec dziala niezaleznie od tego, czy i
   * jak gra go akurat laduje. */
  function makeDraggable(panelEl, handle, posKey) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = panelEl.getBoundingClientRect();
      ox = r.left; oy = r.top;
      panelEl.style.left = ox + 'px';
      panelEl.style.top = oy + 'px';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      panelEl.style.left = (ox + (e.clientX - sx)) + 'px';
      panelEl.style.top = (oy + (e.clientY - sy)) + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      savePos(posKey, parseInt(panelEl.style.left, 10), parseInt(panelEl.style.top, 10));
    });
  }

  /* Przeciaganie samej ikony-wlacznika - w odroznieniu od okna (gdzie caly
   * naglowek TO uchwyt do przeciagania, a otwieranie/zamykanie idzie przez
   * osobny przycisk zamkniecia), ikona musi obslugiwac DWIE rozne akcje na
   * tym samym elemencie: krotkie klikniecie = otworz/zamknij okno,
   * przeciagniecie = zmien pozycje ikony. Rozroznienie po przesunieciu
   * myszy miedzy mousedown a mouseup - powyzej progu 3px uznajemy to za
   * przeciagniecie (i NIE otwieramy okna), ponizej za zwykle kliknieciе. */
  function makeIconDraggable(iconEl, onClick) {
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    iconEl.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      const r = iconEl.getBoundingClientRect();
      ox = r.left; oy = r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true;
      if (moved) {
        iconEl.style.left = (ox + dx) + 'px';
        iconEl.style.top = (oy + dy) + 'px';
      }
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        savePos(ICON_POS_KEY, parseInt(iconEl.style.left, 10), parseInt(iconEl.style.top, 10));
      } else {
        onClick();
      }
    });
  }

  /* Kolko myszy nad trescia okna: zweryfikowane na zywo, ze natywny scroll
   * przegladarki NIE dziala tu sam z siebie (scrollTop zostawal 0 mimo
   * prawdziwego, zaufanego zdarzenia scroll) - najpewniej gra ma wlasny,
   * globalny listener na 'wheel' (np. do obslugi zoomu/przewijania mapy),
   * ktory wywoluje preventDefault() zanim zdarzenie dotrze do przegladarki
   * jako "przewin ten div". Zamiast polegac na domyslnej akcji przegladarki,
   * przesuwamy scrollTop RECZNIE w JS - dziala niezaleznie od tego, czy
   * cokolwiek wyzej w drzewie zdarzenie anuluje. */
  function installWheelScroll(el) {
    el.addEventListener('wheel', function (e) {
      el.scrollTop += e.deltaY;
      e.stopPropagation();
    }, { passive: true });
  }

  function mount() {
    if (root) return;
    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const icon = el('button', {
      class: 'mu-bar-icon', title: 'Ulepy - oplacalnosc ulepszania (przeciagnij, zeby przesunac)',
    }, '<span class="mu-bi-glyph">U</span><span class="mu-dot"></span>');
    /* Domyslna pozycja obok natywnego paska widgetow - ALE jesli
     * uzytkownik juz kiedys przeciagnal ikone gdzie indziej, ta zapisana
     * pozycja ma pierwszenstwo (patrz makeIconDraggable). */
    const savedIconPos = loadPos(ICON_POS_KEY);
    if (savedIconPos) {
      const c = clampPos(savedIconPos.left, savedIconPos.top);
      icon.style.left = c.left + 'px';
      icon.style.top = c.top + 'px';
    } else {
      const pos = barIconPosition();
      icon.style.top = pos.top;
      icon.style.left = pos.left;
    }
    makeIconDraggable(icon, toggle);
    document.body.appendChild(icon);

    /* Struktura ponizej to WPROST skopiowany szkielet natywnego okna gry
     * (c-window/border-window/header-label-positioner/close-button-corner-decor/
     * cards-header-wrapper) - zbadany na zywo na oknach Aukcji i Zegara.
     * Dzieki tym samym klasom ramka, tekstura naglowka, przycisk zamkniecia
     * i wyglad zakladek pochodza wprost z JUZ zaladowanego arkusza stylow
     * gry, bez recznego kopiowania kolorow/grafik. */
    panel = el('div', { class: 'c-window border-window mu-window' });
    /* Domyslna pozycja (pierwsze otwarcie / brak zapisanej pozycji): pod
     * ikona-wlacznikiem, po prawej stronie ekranu - tak, zeby od razu stac
     * OBOK okna aukcji, a nie je zaslaniac. Zawsze liczona jako jawny
     * piksel `left` (NIE `right`) - okno i tak zaraz bedzie przeciagane
     * wlasna implementacja (makeDraggable), ktora rowniez operuje na
     * `left`/`top`. Jesli jest zapisana wczesniejsza pozycja (patrz
     * loadPos), uzywamy jej zamiast domyslnej. */
    const iconPos = barIconPosition();
    const defaultLeft = window.innerWidth - 460 - 40 - 10;
    const defaultTop = parseInt(iconPos.top, 10) + 50;
    const saved = loadPos(WINDOW_POS_KEY);
    const startPos = saved ? clampPos(saved.left, saved.top) : { left: defaultLeft, top: defaultTop };
    panel.style.left = startPos.left + 'px';
    panel.style.top = startPos.top + 'px';
    panel.innerHTML =
      '<div class="header-label-positioner">' +
        '<div class="draggable-window-element ui-draggable-handle"></div>' +
        '<div class="header-label">' +
          '<div class="left-decor"></div>' +
          '<div class="right-decor"></div>' +
          '<div class="text" name="Ulepy">Ulepy <span class="mu-sub" id="mu-sub"></span></div>' +
        '</div>' +
      '</div>' +
      '<div class="content">' +
        '<div class="inner-content">' +
          '<div class="cards-header-wrapper tabs-nav" id="mu-tabs">' +
            TABS.map(function (t, i) {
              return '<div class="card' + (i === 0 ? ' active' : '') + '" data-tab="' + t.id + '">' +
                '<div class="label">' + t.label + '</div>' +
                '<div class="card-notification"></div><div class="amount"></div></div>';
            }).join('') +
          '</div>' +
          '<div class="mu-bar" id="mu-bar"></div>' +
          '<div class="mu-body" id="mu-body"></div>' +
        '</div>' +
        '<div class="window-controlls"></div>' +
      '</div>' +
      '<div class="c-window__bottom-bar">' +
        '<div class="interface-element-bottom-bar-background-stretch"></div>' +
      '</div>' +
      '<div class="close-button-corner-decor">' +
        '<button type="button" class="close-button" title="Zamknij"></button>' +
      '</div>';
    nativeWindowLayer().appendChild(panel);
    root = { icon: icon, panel: panel };

    makeDraggable(panel, panel.querySelector('.draggable-window-element'), WINDOW_POS_KEY);
    installWheelScroll(panel.querySelector('#mu-body'));

    /* Ikona i okno zawsze na ekranie - rowniez po zmianie rozmiaru okna
     * przegladarki. Na zywo: ikona zamontowana przy szerokim oknie zostala
     * na x=922 po zwezeniu okna do 337px i nie dalo sie jej kliknac. */
    function keepOnScreen() {
      [icon, panel].forEach(function (x) {
        const c = clampPos(parseInt(x.style.left, 10) || 0, parseInt(x.style.top, 10) || 0);
        x.style.left = c.left + 'px';
        x.style.top = c.top + 'px';
      });
    }
    keepOnScreen();
    window.addEventListener('resize', U.debounce(keepOnScreen, 150));

    panel.querySelector('.close-button').addEventListener('click', toggle);
    panel.querySelectorAll('#mu-tabs .card').forEach(function (b) {
      b.addEventListener('click', function () {
        activeTab = b.getAttribute('data-tab');
        panel.querySelectorAll('#mu-tabs .card').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        render();
      });
    });
  }

  function toggle() {
    mount();
    const open = panel.classList.toggle('mu-open');
    if (open) {
      root.icon.querySelector('.mu-dot').style.display = 'none';
      refresh();
    }
  }

  let pending = 0;
  function notifyNewData(n) {
    pending += n;
    if (!root) return;
    const dot = root.icon.querySelector('.mu-dot');
    if (!panel.classList.contains('mu-open')) {
      dot.textContent = pending > 99 ? '99+' : String(pending);
      dot.style.display = 'block';
    } else {
      refreshDebounced();
    }
  }

  /* Zakladka Przedmioty odswieza sie z WLASNEGO, niezaleznego sygnalu -
   * kazdej nowej migawce DOM (MU.sniffer.onLiveSnapshot) - a nie z
   * notifyNewData (ktore odpala sie tylko przy zapisie do bazy
   * historycznej). To celowe rozdzielenie: widok biezacy ma sie
   * aktualizowac nawet gdy nic nowego nie trafia do historii (np. lista
   * po prostu sie skurczyla, bo oferta zniknela), i odwrotnie - zapis do
   * historii nie zalezy od tego, czy ta zakladka jest w ogole otwarta. */
  const renderLiveDebounced = U.debounce(function () {
    if (panel && panel.classList.contains('mu-open') && activeTab === 'przedmioty') render(true);
  }, 400);
  MU.sniffer.onLiveSnapshot(renderLiveDebounced);

  /* Postep "Zaladuj wszystkie strony" (i zamiana przycisku na Zatrzymaj). */
  const renderPagerDebounced = U.debounce(function () {
    if (panel && panel.classList.contains('mu-open') && activeTab === 'zbieranie') render(true);
  }, 200);
  MU.sniffer.onPager(renderPagerDebounced);

  /* bodyOnly=true: wywolane w tle (nowe dane), NIE przez akcje uzytkownika -
   * pomija przebudowe paska filtrow (renderBar), zeby nie wycinac w polu
   * "poziom" wartosci, ktora uzytkownik akurat wpisuje (kazda przebudowa
   * innerHTML kasuje niezatwierdzony tekst w polu). Jawne akcje uzytkownika
   * (klik zakladki, zmiana filtra, przycisk Odswiez) zawsze wolaja refresh()/
   * render() bez argumentu - tam pelne odswiezenie paska jest oczekiwane
   * i nieszkodliwe, bo to wlasnie ten klik zmienil dany filtr. */
  function refresh(bodyOnly) {
    pending = 0;
    const cfg = MU.cfg.get();
    return MU.store.allObservations(Date.now() - cfg.stats.retentionDays * U.DAY_MS)
      .then(function (obs) {
        index = MU.aggregate.buildIndex(obs, cfg, Date.now());
        render(bodyOnly);
      });
  }
  const refreshDebounced = U.debounce(function () { refresh(true); }, 1500);

  /* ---------------------------------------------------------------- */

  function confBar(c) {
    const pctv = Math.round((c || 0) * 100);
    const color = pctv >= 60 ? '#6b8f4a' : (pctv >= 30 ? '#8f7d4a' : '#8f4a4a');
    return '<span class="mu-conf" title="Pewnosc danych: ' + pctv + '%">' +
      '<i><b style="width:' + pctv + '%;background:' + color + '"></b></i>' +
      '<span>' + pctv + '%</span></span>';
  }

  /* "Cel ulepszania" (rzadkosc/grupa/poziom przedmiotu, KTORY ulepszamy)
   * jest wspolny dla obu zakladek (Tabela i Przedmioty) - dawniej byl to
   * wiersz 3 pol zajmujacy polowe szerokosci paska, teraz to jedna
   * zwijana sekcja (domyslnie zwinieta - dotyczy tylko dodatkowego,
   * opcjonalnego szacunku CALKOWITEGO kosztu +0->+5, patrz renderTable),
   * co w waskim oknie robi ogromna roznice w ilosci miejsca. */
  function targetSummaryLabel() {
    const t = currentTarget();
    if (!t) return '';
    const parts = [];
    if (t.rarity) parts.push(MU.cfg.rarityById(t.rarity).label);
    if (t.group) parts.push(GROUP_LABELS[t.group] || t.group);
    if (t.lvl) parts.push('lvl ' + t.lvl);
    return parts.join(', ');
  }

  function renderTargetDetails(cfg) {
    const label = targetSummaryLabel();
    return '<details class="mu-target" id="mu-target-details"' + (state.targetOpen ? ' open' : '') + '>' +
      '<summary>Cel ulepszania' + (label ? ': <b>' + U.escapeHtml(label) + '</b>' : ' (brak - widok bazowy)') + '</summary>' +
      '<div class="mu-target-body">' +
        '<div class="mu-fld" title="Rzadkosc przedmiotu, ktory ulepszasz - wlacza bonus +200% za dopasowanie rzadkosci skladnika">' +
          '<span>Rzadkosc</span><select id="mu-trar"><option value="">- brak -</option>' +
          cfg.targetRarities.map(function (r) {
            return '<option value="' + r.id + '"' +
              (state.targetRarity === r.id ? ' selected' : '') + '>' + r.label + '</option>';
          }).join('') + '</select></div>' +
        '<div class="mu-fld" title="Grupa ulepszanego przedmiotu (bronie/pancerz/bizuteria) - wlacza bonus +25% za dopasowanie grupy skladnika">' +
          '<span>Grupe</span><select id="mu-tgrp"><option value="">- brak -</option>' +
          '<option value="bronie"' + (state.targetGroup === 'bronie' ? ' selected' : '') + '>Bronie</option>' +
          '<option value="pancerz"' + (state.targetGroup === 'pancerz' ? ' selected' : '') + '>Pancerz</option>' +
          '<option value="bizuteria"' + (state.targetGroup === 'bizuteria' ? ' selected' : '') + '>Bizuteria</option>' +
          '</select></div>' +
        '<div class="mu-fld" title="Poziom ulepszanego przedmiotu - potrzebny do wzoru calkowitego kosztu +0 -> +5">' +
          '<span>Poziom</span><input type="number" id="mu-tlvl" min="1" max="300" style="width:56px" value="' +
          U.escapeHtml(String(state.targetLevel)) + '"></div>' +
      '</div>' +
    '</details>';
  }

  function wireTargetDetails(container) {
    const details = container.querySelector('#mu-target-details');
    if (!details) return;
    details.addEventListener('toggle', function () { state.targetOpen = details.open; });
    container.querySelector('#mu-trar').onchange = function (e) { state.targetRarity = e.target.value; render(); };
    container.querySelector('#mu-tgrp').onchange = function (e) { state.targetGroup = e.target.value; render(); };
    /* oninput (na biezaco), nie onchange (dopiero po opuszczeniu pola) -
     * ale przez render(true) (bodyOnly), zeby NIE przebudowywac paska
     * (a wiec i tego pola) przy kazdym znaku - inaczej pole samo sobie
     * kasowaloby fokus/kursor po kazdym wpisanym znaku. */
    container.querySelector('#mu-tlvl').oninput = function (e) { state.targetLevel = e.target.value; render(true); };
  }

  /* Pasek nad tabela: teraz tylko wspolna sekcja "Cel ulepszania" +
   * przyciski akcji (male ikony, nie przyciski z pelnym tekstem - patrz
   * .mu-icon-btn). Filtry WLASCIWE danej zakladki (Kategoria/Rzadkosc w
   * Tabeli, Kategoria/Rzadkosc skladnika w Przedmiotach) sa teraz
   * renderowane w tresci danej zakladki (renderTable/renderItems), bo sa
   * scisle zwiazane z tym, co ta zakladka akurat pokazuje. */
  function renderBar() {
    const cfg = MU.cfg.get();
    const bar = panel.querySelector('#mu-bar');
    if (activeTab !== 'tabela' && activeTab !== 'przedmioty') { bar.innerHTML = ''; return; }

    bar.innerHTML = renderTargetDetails(cfg) +
      '<div class="mu-bar-spacer"></div>' +
      '<button class="mu-icon-btn" id="mu-csv" title="Eksport CSV">&#8681;</button>' +
      '<button class="mu-icon-btn" id="mu-refresh" title="Odswiez teraz">&#8635;</button>';

    wireTargetDetails(bar);
    bar.querySelector('#mu-csv').onclick = exportCsv;
    /* Owiniete w funkcje - onclick przekazalby MouseEvent jako pierwszy
     * argument refresh(bodyOnly), co przypadkiem wlaczyloby tryb "w tle". */
    bar.querySelector('#mu-refresh').onclick = function () { refresh(); };
  }

  function currentTarget() {
    if (!state.targetRarity && !state.targetGroup) return null;
    const lvl = parseInt(state.targetLevel, 10);
    return { rarity: state.targetRarity || null, group: state.targetGroup || null,
      lvl: isFinite(lvl) && lvl > 0 ? lvl : null };
  }

  /* Bez kolumn Kategoria/Rzadkosc - zbedne, odkad Tabela filtruje zawsze
   * do DOKLADNIE jednej grupy x jednej rzadkosci (patrz segmentowany
   * przelacznik w renderTable): kazdy wiersz i tak mialby te sama wartosc
   * w obu kolumnach, wiec pokazujemy to raz, w podtytule nad tabela
   * zamiast powtarzac w kazdym wierszu - i zwalniamy 2 z 8 kolumn na
   * waskim oknie.
   * Puste komorki (r.empty) zwracaja teraz PUSTY string zamiast myslnika -
   * caly wiersz dostaje klase mu-empty-row (patrz renderTable), ktora
   * wygasza go jednym spojnym stylem, zamiast powtarzac "-" w kazdej
   * kolumnie (szum wizualny, patrz zadanie uzytkownika o hierarchii). */
  const COLS = [
    { k: 'bracket', t: 'Przedzial', f: function (r) { return U.escapeHtml(r.bracket); } },
    { k: 'lvl', t: 'Sr.lvl', f: function (r) { return r.empty ? '' : U.round(r.lvl, 0); } },
    { k: 'price', t: 'Cena', f: function (r) { return r.empty ? '' : U.gold(r.price); } },
    { k: 'points', t: 'Pkt', f: function (r) {
        if (r.empty) return '';
        return r.points + (r.bonusApplied ? '<span class="mu-pos" title="z bonusem za dopasowanie do celu">*</span>' : ''); } },
    { k: 'costPerPoint', t: 'Koszt/pkt', f: function (r) { return r.empty ? '' : U.gold(r.costPerPoint); },
      cls: function (r) { return r.empty ? '' : 'mu-hi'; } },
    { k: 'confidence', t: 'Pewnosc', f: function (r) { return r.empty ? '' : confBar(r.confidence); } },
  ];

  function renderTable(body) {
    const cfg = MU.cfg.get();
    if (!index || !index.nObs) return renderEmpty(body);

    const rows = MU.aggregate.buildCoarseTable(index, {
      target: currentTarget(),
      group: state.tableGroup, rarity: state.tableRarity,
    });
    const filled = rows.filter(function (r) { return !r.empty; });
    /* Najtansza pozycja MUSI byc policzona PRZED sortowaniem wg wyboru
     * uzytkownika - inaczej po kliknieciu jakiejkolwiek innej kolumny
     * (np. "Sr. poziom") rows[0] przestaje byc najtanszy, a KPI ponizej
     * (i zalezny od niego szacunek calkowitego kosztu ulepszenia) zaczyna
     * pokazywac wartosc losowego wiersza podpisana jako "najtansze". */
    const cheapest = filled.length
      ? Math.min.apply(null, filled.map(function (r) { return r.costPerPoint; })) : NaN;
    rows.sort(function (a, b) {
      if (sortKey === 'bracket') {
        return sortDir * (MU.cfg.bracketOrder(a.bracket) - MU.cfg.bracketOrder(b.bracket));
      }
      /* Puste wiersze zawsze na koniec, niezaleznie od kierunku sortowania -
       * inaczej przy sortowaniu malejaco "brak danych" (NaN) wyskakiwalby
       * na gore jako pozornie "najlepszy" wynik. */
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      const x = a[sortKey], y = b[sortKey];
      const nx = isFinite(x) ? x : Infinity, ny = isFinite(y) ? y : Infinity;
      if (typeof x === 'string' && typeof y === 'string') {
        return sortDir * x.localeCompare(y);
      }
      return sortDir * (nx - ny);
    });
    lastRows = rows;

    const days = index.firstObsTs
      ? U.round((Date.now() - index.firstObsTs) / U.DAY_MS, 1) : 0;

    /* Segmentowany przelacznik Kategoria/Rzadkosc - wybor DOKLADNIE jednej
     * z 3 grup i jednej z 2 rzadkosci, od razu widoczny, bez rozwijania
     * list (patrz zadanie uzytkownika o intuicyjnosci) - zlaczony pasek
     * przyciskow w stylu natywnych kontrolek gry (patrz CSS .mu-seg). */
    let html = '<div class="mu-row">' +
      '<div class="mu-seg-block"><span class="mu-seg-lbl">Kategoria</span><div class="mu-seg-row" id="mu-tabgrp-pills">' +
        GROUP_ORDER.map(function (g) {
          return '<button type="button" class="mu-seg' + (state.tableGroup === g ? ' mu-active' : '') +
            '" data-g="' + g + '">' + GROUP_LABELS[g] + '</button>';
        }).join('') + '</div></div>' +
      '<div class="mu-seg-block"><span class="mu-seg-lbl">Rzadkosc</span><div class="mu-seg-row" id="mu-tabrar-pills">' +
        cfg.rarities.map(function (r) {
          return '<button type="button" class="mu-seg' + (state.tableRarity === r.id ? ' mu-active' : '') +
            '" data-r="' + r.id + '">' + r.label + '</button>';
        }).join('') + '</div></div>' +
      '</div>';

    /* Pasek statystyk w jednej linii + wbudowany pasek postepu zbierania
     * danych (dni/collectDays) zamiast osobnego duzego brazowego bloku
     * tekstu - patrz CSS .mu-progress (te same wartosci co natywna klasa
     * gry .interface-element-progress-bar-2). */
    const collectPct = U.clamp(days / cfg.collectDays * 100, 0, 100);
    html += '<div class="mu-stats-line">' +
      '<span><b>' + index.nObs + '</b> obs.</span>' +
      '<span><b>' + filled.length + '/' + rows.length + '</b> przedzialow</span>' +
      '<span>najtaniej <b class="mu-hi">' + (isFinite(cheapest) ? U.gold(cheapest) : '-') + '</b>/pkt</span>' +
      '<span class="mu-progress-wrap" title="Zebrano ' + days + ' z ' + cfg.collectDays + ' zadeklarowanych dni zbierania danych">' +
        days + '/' + cfg.collectDays + ' dni<span class="mu-progress"><i style="width:' + collectPct + '%"></i></span>' +
      '</span>' +
      '</div>';

    /* Krotki, stonowany podtytul zamiast dawnego dlugiego akapitu -
     * najwazniejsza informacja (brak bonusow bez celu) w jednej linii,
     * bez pogrubien/kolorow poza jednym akcentem na nazwie sekcji. */
    const target = currentTarget();
    if (!target) {
      html += '<p class="mu-subtitle">Bez celu: kolumna "Pkt" to wartosc bazowa, bez bonusow za ' +
        'dopasowanie. Rozwin <b>Cel ulepszania</b> powyzej dla realnego kosztu.</p>';
    }

    /* Calkowity koszt ulepszenia CELU (+0 -> +5) zalezy WYLACZNIE od
     * poziomu i rzadkosci tego celu (im wyzsza rzadkosc/poziom, tym wiecej
     * punktow trzeba zebrac - dla legendy to nawet 1000x wiecej niz dla
     * zwyklego przedmiotu na tym samym poziomie). Bez tego zestawienia
     * kolumna "koszt za punkt" jest tylko abstrakcyjnym wskaznikiem -
     * to pokazuje realna, calkowita kwote. */
    if (target && target.rarity && target.lvl) {
      const totalPts = MU.upgrade.totalPointsCost(target.lvl, target.rarity, 0, 5);
      const finalizeGold = MU.upgrade.finalizeGoldCost(target.lvl, target.rarity);
      const finalizeEssence = MU.upgrade.finalizeEssenceCost(target.lvl);
      const fodderGold = isFinite(cheapest) ? cheapest * totalPts : NaN;
      html += '<p class="mu-subtitle">Calkowicie +0&rarr;+5 (' + MU.cfg.rarityById(target.rarity).label +
        ' lvl ' + target.lvl + '): <b>' + U.round(totalPts, 0) + '</b> pkt &middot; skladniki ' +
        '<b>' + (isFinite(fodderGold) ? U.gold(fodderGold) : '-') + '</b> &middot; finalizacja ' +
        '<b>' + U.gold(finalizeGold) + '</b> zlota + <b>' + finalizeEssence + '</b> esencji.</p>';
    }

    html += '<table class="mu-t"><thead><tr>' + COLS.map(function (c) {
      const on = sortKey === c.k;
      const mark = on ? (sortDir < 0 ? ' &#9660;' : ' &#9650;') : '';
      return '<th data-k="' + c.k + '"' + (on ? ' class="mu-sorted"' : '') + '>' + c.t + mark + '</th>';
    }).join('') + '</tr></thead><tbody>';

    /* Brak galezi "pusta tabela" - buildCoarseTable zawsze zwraca pelna
     * siatke przedzialow (patrz zadanie uzytkownika), wiec `rows` nigdy
     * nie jest pusta; brakujace dane sa widoczne per-wiersz (empty:true),
     * wygaszone jednym spojnym stylem (mu-empty-row) zamiast myslnikow
     * powtorzonych w kazdej kolumnie. */
    for (const r of rows) {
      html += '<tr' + (r.empty ? ' class="mu-empty-row"' : '') + '>' +
        COLS.map(function (c) {
          const cls = c.cls ? c.cls(r) : '';
          return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + c.f(r) + '</td>';
        }).join('') + '</tr>';
    }
    html += '</tbody></table>';
    body.innerHTML = html;

    body.querySelectorAll('#mu-tabgrp-pills .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { state.tableGroup = b.getAttribute('data-g'); render(); });
    });
    body.querySelectorAll('#mu-tabrar-pills .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { state.tableRarity = b.getAttribute('data-r'); render(); });
    });
    body.querySelectorAll('th').forEach(function (th) {
      th.addEventListener('click', function () {
        const k = th.getAttribute('data-k');
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
        render();
      });
    });
  }

  function kpi(label, val) {
    return '<div><span>' + U.escapeHtml(label) + '</span><b>' + U.escapeHtml(String(val)) + '</b></div>';
  }

  function renderEmpty(body) {
    const d = MU.sniffer.diag.lastDom;
    let hint = 'Otworz dom aukcyjny w grze i poprzegladaj listy - dodatek zapisuje cene ' +
      'kazdej nowo zobaczonej oferty od razu, bez czekania na cokolwiek.';
    if (d) {
      hint = 'Dodatek widzial dotad <b>' + d.covered + '</b>' +
        (isFinite(d.total) ? ' z <b>' + d.total + '</b>' : '') +
        ' pasujacych aukcji, ale zaden przedmiot jeszcze nie ma wystarczajacej liczby ' +
        'obserwacji w wybranym filtrze (Rzadkosc skladnika / Kategoria / Min. pewnosc). ' +
        'Dodatek trzyma liste podsunieta blisko dolu - wystarczy nawet drobny ruch ' +
        'kolkiem myszy w oknie aukcji, zeby doladowac kolejna partie ofert (pelnego ' +
        'automatycznego doladowania bez Twojego udzialu przegladarka nie pozwala zrobic). ' +
        'Albo poluzuj filtry powyzej.';
    }
    body.innerHTML = '<div class="mu-empty">' +
      '<b>Brak danych - jeszcze.</b><br>' + hint + '<br><br>' +
      'Zakladka <b>Zbieranie</b> pokazuje szczegoly (ile ofert dodatek widzial, ile ' +
      'stron zaladowal).' +
      '</div>';
  }

  /* --- zakladka: przedmioty - widok SESYJNY, nie historyczny --------- *
   * Zrodlem jest MU.sniffer.getSessionItems() (kazda oferta zaobserwowana
   * od zaladowania strony, kumulatywnie - patrz sessionItems w
   * 06-sniffer.js), a nie baza historyczna (`index`) uzywana przez
   * zakladke Tabela. Kazdy wiersz to jedna realna oferta - zero
   * usredniania. W odroznieniu od dawnego zachowania (migawka
   * nadpisywana przy kazdym skanie), przelaczanie kategorii/rzadkosci w
   * oknie aukcji gry JUZ NIE gubi wczesniej zobaczonych przedmiotow -
   * wszystko kumuluje sie w jeden plaski widok "Wszystkie", bez filtrow.
   * Zbieranie danych do zakladki Tabela (MU.lifecycle -> MU.store) dziala
   * rownolegle i NIEZALEZNIE od tego, co ten widok akurat pokazuje. */

  /* Wlasny, niezalezny stan sortowania od zakladki Tabela (COLS/sortKey/
   * sortDir powyzej) - inne kolumny, inny domyslny sort. */
  let sortKeyItems = 'costPerPoint', sortDirItems = 1;

  const ITEM_COLS = [
    { k: 'name', t: 'Przedmiot', f: function (r) { return U.escapeHtml(r.name); } },
    { k: 'category', t: 'Kat.', f: function (r) {
        return U.escapeHtml(MU.cfg.categoryById(r.category).label); } },
    { k: 'rarity', t: 'Rzadkosc', f: function (r) {
        const x = MU.cfg.rarityById(r.rarity);
        return '<span style="color:' + x.color + '">' + U.escapeHtml(x.label) + '</span>'; } },
    { k: 'lvl', t: 'lvl', f: function (r) { return U.round(r.lvl, 0); } },
    { k: 'price', t: 'Cena', f: function (r) { return U.gold(r.price); } },
    { k: 'points', t: 'Punkty', f: function (r) {
        return r.points + (r.bonusApplied ? '<span class="mu-pos" title="z bonusem za dopasowanie do celu"> *</span>' : ''); } },
    { k: 'costPerPoint', t: 'Koszt/pkt', f: function (r) { return U.gold(r.costPerPoint); }, cls: function () { return 'mu-hi'; } },
  ];

  /* Widok "Wszystkie" - bez filtrow. Zrodlem jest MU.sniffer.getSessionItems()
   * (kazda oferta zaobserwowana od zaladowania strony, kumulatywnie -
   * patrz komentarz przy sessionItems w 06-sniffer.js), NIE
   * getLiveSnapshot() (tylko biezacy skan) - dzieki temu przelaczanie
   * kategorii w oknie aukcji gry juz nie gubi wczesniej zobaczonych
   * przedmiotow z innych kategorii. Zadnych filtrow Kategoria/Rzadkosc -
   * to jedyny, plaski widok wszystkiego naraz (patrz zadanie uzytkownika). */
  function renderItems(body) {
    const rows = MU.aggregate.buildLiveTable(MU.sniffer.getSessionItems(), { target: currentTarget() });
    rows.sort(function (a, b) {
      const x = a[sortKeyItems], y = b[sortKeyItems];
      const nx = isFinite(x) ? x : Infinity, ny = isFinite(y) ? y : Infinity;
      if (typeof x === 'string' && typeof y === 'string') {
        return sortDirItems * x.localeCompare(y);
      }
      return sortDirItems * (nx - ny);
    });
    lastRowsItems = rows;

    const SHOWN_MAX = 400;
    const cheapestLive = rows.length ? rows[0].costPerPoint : NaN;

    let html = '<div class="mu-stats-line">' +
      '<span><b>' + rows.length + '</b> ofert (sesja)</span>' +
      '<span>pokazano <b>' + Math.min(rows.length, SHOWN_MAX) + '</b></span>' +
      '<span>najtaniej <b class="mu-hi">' + (isFinite(cheapestLive) ? U.gold(cheapestLive) : '-') + '</b>/pkt</span>' +
      '</div>';

    html += '<p class="mu-subtitle">Wszystkie oferty zaobserwowane od otwarcia gry (nie tylko ' +
      'biezaco widoczna kategoria w oknie aukcji) - nie historia. Srednie z historii sa w ' +
      'zakladce <b>Tabela</b>.</p>';

    if (!rows.length) {
      html += '<div class="mu-empty">Brak jeszcze zaobserwowanych ofert. Otworz dom aukcyjny ' +
        'w grze i poprzegladaj kategorie - dodatek zapamieta kazda widziana oferte az do ' +
        'przeladowania strony.</div>';
      body.innerHTML = html;
      return;
    }

    if (rows.length > SHOWN_MAX) {
      html += '<div class="mu-warn">Pokazano ' + SHOWN_MAX + ' z ' + rows.length + ' najtanszych - reszta ukryta.</div>';
    }

    html += '<table class="mu-t"><thead><tr>' + ITEM_COLS.map(function (c) {
      const on = sortKeyItems === c.k;
      const mark = on ? (sortDirItems < 0 ? ' &#9660;' : ' &#9650;') : '';
      return '<th data-k="' + c.k + '"' + (on ? ' class="mu-sorted"' : '') + '>' + c.t + mark + '</th>';
    }).join('') + '</tr></thead><tbody>';

    for (const r of rows.slice(0, SHOWN_MAX)) {
      html += '<tr>' + ITEM_COLS.map(function (c) {
        const cls = c.cls ? c.cls(r) : '';
        return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + c.f(r) + '</td>';
      }).join('') + '</tr>';
    }
    html += '</tbody></table>';
    body.innerHTML = html;

    body.querySelectorAll('th').forEach(function (th) {
      th.addEventListener('click', function () {
        const k = th.getAttribute('data-k');
        if (sortKeyItems === k) sortDirItems = -sortDirItems; else { sortKeyItems = k; sortDirItems = 1; }
        render();
      });
    });
  }

  /* --- zakladka: zbieranie -------------------------------------------- */

  function renderCollect(body) {
    const cfg = MU.cfg.get();
    const c = MU.lifecycle.state.counters;
    const d = MU.sniffer.diag;
    const days = index && index.firstObsTs
      ? U.round((Date.now() - index.firstObsTs) / U.DAY_MS, 1) : 0;

    body.innerHTML =
      '<div class="mu-kpi">' +
        kpi('Sledzone aukcje', c.tracked) +
        kpi('Sprzedane', c.sold) +
        kpi('Wygasle', c.expired) +
        kpi('Niejednoznaczne', c.ambiguous) +
        kpi('Dni zbierania', days) +
        kpi('Magazyn', MU.store.mode) +
      '</div>' +
      '<p class="mu-note">Dodatek liczy srednia z <b>biezacych ofert</b> ("kup teraz") - ' +
      'kazda nowo zobaczona aukcja zapisuje sie do proby od razu, raz. Skrajne ceny ' +
      '(pranie zlota, pomylki, przecenione/przewartosciowane oferty) sa odsiewane ' +
      'statystycznie (filtr MAD), a nie przez czekanie na sprzedaz.</p>' +
      '<h4 class="mu-sec">Sniffer</h4>' +
      '<div class="mu-kpi">' +
        kpi('Przeskanowanych odp.', d.scanned) +
        kpi('Trafien', d.hits) +
        kpi('Ostatnie trafienie', d.lastHitAt ?
          new Date(d.lastHitAt).toLocaleTimeString() : 'brak') +
      '</div>' +
      (d.hits === 0 ? '<div class="mu-warn">Dodatek nie zobaczyl jeszcze zadnych danych ' +
        'aukcyjnych. Otworz dom aukcyjny w grze i przewin liste.</div>' : '') +
      (d.lastDom ? (function () {
        const status = d.lastDom.complete
          ? '<span class="mu-pos">Pobrano komplet listy dla tego filtra.</span>'
          : '<span class="mu-mut">To jeszcze nie komplet - kliknij "Zaladuj wszystkie strony" ' +
            'ponizej albo przewin liste w oknie aukcji.</span>';
        return '<div class="mu-note">' +
          'Biezaca strona: <b>' + d.lastDom.allCount + '</b> wierszy. Zobaczonych dotad: <b>' +
          d.lastDom.covered + '</b>' +
          (d.lastDom.total === null ? '' : ' z <b>' + d.lastDom.total + '</b>') +
          ' pasujacych aukcji (' + new Date(d.lastDom.at).toLocaleTimeString() + '). ' +
          status +
          '</div>';
      })() : '') +
      '<h4 class="mu-sec">Doladowanie listy</h4>' +
      (function () {
        /* Jedyne miejsce, z ktorego dodatek cokolwiek wysyla do gry - i to
         * tylko po kliknieciu, patrz MU.sniffer.loadAllPages. */
        const p = MU.sniffer.getPager();
        const esc = function (s) {
          return String(s).replace(/[&<>"]/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
          });
        };
        let line = '';
        if (p.running) {
          line = '<span class="mu-mut">Laduje strone <b>' + (p.page + 1) + '</b> z <b>' + p.pages +
            '</b> - w oknie gry <b>' + p.rows + '</b> z <b>' + p.total + '</b> ofert.</span>';
        } else if (p.message) {
          line = '<span class="' + (p.status === 'done' ? 'mu-pos' : 'mu-mut') + '">' +
            esc(p.message) + '</span>';
        }
        return '<p class="mu-note">Prosi gre o kolejne strony dokladnie tej listy, ktora masz ' +
          'otwarta w oknie aukcji - tak samo jak przy przewijaniu, strona po stronie, z przerwa ' +
          'ok. 1 s. Nic nie kupuje i nie licytuje. ' + line + '</p>' +
          (p.running
            ? '<button class="mu-btn" id="mu-load-stop">Zatrzymaj</button>'
            : '<button class="mu-btn" id="mu-load-all">Zaladuj wszystkie strony</button>');
      })() +
      '<h4 class="mu-sec">Dane</h4>' +
      '<button class="mu-btn" id="mu-exp">Eksport JSON</button> ' +
      '<button class="mu-btn" id="mu-imp">Import JSON</button> ' +
      '<button class="mu-btn" id="mu-purge">Usun starsze niz ' + cfg.stats.retentionDays + ' dni</button> ' +
      '<button class="mu-btn" id="mu-wipe">Wyczysc wszystko</button>' +
      '<input type="file" id="mu-file" accept="application/json" style="display:none">';

    const loadAll = body.querySelector('#mu-load-all');
    if (loadAll) loadAll.onclick = function () { MU.sniffer.loadAllPages(); };
    const loadStop = body.querySelector('#mu-load-stop');
    if (loadStop) loadStop.onclick = function () { MU.sniffer.stopLoadAll(); };
    body.querySelector('#mu-exp').onclick = function () {
      MU.store.exportAll().then(function (data) {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ulepy-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      });
    };
    const file = body.querySelector('#mu-file');
    body.querySelector('#mu-imp').onclick = function () { file.click(); };
    file.onchange = function () {
      const f = file.files[0];
      if (!f) return;
      f.text().then(function (t) {
        try {
          return MU.store.importAll(JSON.parse(t), false).then(function (n) {
            alert('Zaimportowano ' + n + ' obserwacji.');
            refresh();
          });
        } catch (e) { alert('Nieprawidlowy plik JSON.'); }
      });
    };
    body.querySelector('#mu-purge').onclick = function () {
      MU.store.purgeOld(cfg.stats.retentionDays).then(function (n) {
        alert('Usunieto ' + n + ' rekordow.'); refresh();
      });
    };
    body.querySelector('#mu-wipe').onclick = function () {
      if (confirm('Usunac wszystkie zebrane obserwacje (i baze sledzonych aukcji)? Tej operacji nie da sie cofnac.')) {
        MU.store.clearAll().then(function () {
          /* Liczniki w MU.lifecycle sa czysto in-memory (licza od startu
           * sesji, nie z bazy) - bez tego dalej pokazywalyby stare
           * wartosci mimo wyczyszczonej bazy. */
          const c = MU.lifecycle.state.counters;
          c.sold = 0; c.expired = 0; c.ambiguous = 0; c.asks = 0; c.tracked = 0;
          refresh();
        });
      }
    };
  }

  /* --- eksport CSV ---------------------------------------------------- */

  /* Eksport musi brac dane z zakladki, ktora jest AKTUALNIE widoczna -
   * "lastRows"/"lastRowsItems" sa ustawiane niezaleznie w renderTable/
   * renderItems, wiec bez tego rozroznienia klikniecie Eksportu na
   * Przedmiotach albo pokazywalo falszywe "brak danych" (gdy Tabela
   * nigdy nie byla otwarta), albo po cichu eksportowalo dane z INNEJ
   * zakladki niz ta widoczna na ekranie. */
  function exportCsv() {
    if (activeTab === 'przedmioty') return exportCsvItems();
    if (!lastRows.length) { alert('Brak danych do eksportu.'); return; }
    const head = ['przedzial', 'kategoria', 'rzadkosc', 'sr_poziom',
      'cena', 'punkty', 'koszt_za_punkt', 'pewnosc', 'brak_danych'];
    const lines = [head.join(';')];
    for (const r of lastRows) {
      lines.push([
        r.bracket, GROUP_LABELS[r.category] || r.category, MU.cfg.rarityById(r.rarity).label,
        fx(r.lvl, 0), fx(r.price), r.points, fx(r.costPerPoint, 2), fx(r.confidence, 3),
        r.empty ? '1' : '0',
      ].join(';'));
    }
    downloadCsv(lines, 'ulepy-tabela.csv');
  }

  function exportCsvItems() {
    if (!lastRowsItems.length) { alert('Brak danych do eksportu.'); return; }
    const head = ['przedmiot', 'kategoria', 'rzadkosc', 'poziom',
      'cena', 'punkty', 'koszt_za_punkt'];
    const lines = [head.join(';')];
    for (const r of lastRowsItems) {
      lines.push([
        r.name, MU.cfg.categoryById(r.category).label, MU.cfg.rarityById(r.rarity).label,
        fx(r.lvl, 0), fx(r.price), r.points, fx(r.costPerPoint, 2),
      ].join(';'));
    }
    downloadCsv(lines, 'ulepy-przedmioty.csv');
  }

  function downloadCsv(lines, filename) {
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  function fx(v, d) {
    if (!isFinite(v)) return '';
    /* Przecinek dziesietny - polski Excel inaczej potraktuje to jak tekst. */
    return String(U.round(v, d === undefined ? 0 : d)).replace('.', ',');
  }

  /* --- render --------------------------------------------------------- */

  function render(bodyOnly) {
    if (!panel) return;
    if (!bodyOnly) renderBar();
    const body = panel.querySelector('#mu-body');
    const sub = panel.querySelector('#mu-sub');
    sub.textContent = index ? (index.nObs + ' obserwacji') : '';
    if (activeTab === 'tabela') renderTable(body);
    else if (activeTab === 'przedmioty') renderItems(body);
    else renderCollect(body);
  }

  return {
    mount: mount, toggle: toggle, refresh: refresh, render: render,
    notifyNewData: notifyNewData, state: state,
    get index() { return index; },
  };
})();
