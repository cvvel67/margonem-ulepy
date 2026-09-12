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
  /* Pierwsza zakladka to Przedmioty - "Srednie ceny" (id 'tabela') sa na
   * koncu jako podglad rynku (uwaga uzytkownika). */
  let activeTab = 'przedmioty';

  /* Etykiety trzech nadrzednych grup zasobu (Bronie/Pancerz/Bizuteria -
   * patrz MU.cfg categories[].group) - uzywane wylacznie w zakladce
   * Tabela, ktora teraz operuje na tym nadrzednym podziale zamiast
   * drobiazgowych kategorii (patrz MU.aggregate.buildCoarseTable). */
  const GROUP_LABELS = { bronie: 'Bronie', pancerz: 'Pancerze', bizuteria: 'Biżuteria' };
  const GROUP_ORDER = ['bronie', 'pancerz', 'bizuteria'];

  /* Cel ulepszania (rzadkosc/grupa/poziom) nie jest juz tutaj - bierzemy go
   * z Kalkulatora (patrz currentTarget i `calc`), jedno miejsce zamiast dwoch. */
  const state = {
    tableGroup: 'bronie',    // zakladka Srednie ceny: dokladnie JEDNA z 3 grup zasobu
    tableRarity: 'unikat',   // zakladka Srednie ceny: dokladnie JEDNA z 2 rzadkosci (unikat/heroik)
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
.mu-window .header-label-positioner{cursor:move}
.mu-window .cards-header-wrapper.tabs-nav .card{cursor:pointer}
.mu-window .inner-content{display:flex;flex-direction:column;
  height:min(560px,calc(100vh - 130px));min-height:260px}
/* --- Wnetrze panelu (wszystko ponizej naglowka i zakladek gry) - jeden
 * spojny zestaw tokenow zamiast recznie dobieranych kolorow w kazdej
 * regule: cienkie linie zamiast ciezkich czarnych ramek, zaokraglone
 * karty, jeden akcent (zloto) i zielen wylacznie dla "miesci sie w
 * budzecie" (uwaga uzytkownika: "cos nie siedzi", ciemna kolorystyka
 * zostaje). Naglowek/zakladki/przycisk zamkniecia nadal natywne z gry. */
.mu-window{--mu-bg:#121212;--mu-s1:#181818;--mu-s2:#1e1e1e;--mu-s3:#262626;--mu-line:#252525;--mu-line2:#343434;
  --mu-tx:#ebe7e0;--mu-tx2:#a8a29a;--mu-tx3:#77726b;--mu-gold:#e6bd6a;--mu-gold-d:#b98f45;--mu-gold-hi:#f3d28e;
  --mu-gold-bg:rgba(230,189,106,.07);--mu-gold-line:rgba(230,189,106,.26);
  --mu-green:#82d69c;--mu-green-bg:rgba(130,214,156,.07);
  --mu-blue:#93b6d8;--mu-blue-bg:rgba(147,182,216,.06);--mu-blue-line:rgba(147,182,216,.24);
  --mu-red:#e39191;--mu-r:6px}
.mu-body{flex:1;overflow:auto;padding:10px;background:var(--mu-bg);color:var(--mu-tx);
  font:12px/1.45 Arimo,Calibri,Segoe,"Segoe UI",Optima,Arial,sans-serif}
.mu-body::-webkit-scrollbar{width:8px}
.mu-body::-webkit-scrollbar-track{background:transparent}
.mu-body::-webkit-scrollbar-thumb{background:#2e2e2e;border-radius:4px}
.mu-body::-webkit-scrollbar-thumb:hover{background:#3d3d3d}
.mu-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:7px 10px;
  border-bottom:1px solid var(--mu-line);background:#151515}
.mu-bar .mu-fld{display:flex;flex-direction:column;gap:3px}
.mu-bar .mu-fld>span{font-size:10px;color:var(--mu-tx3);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.mu-bar select,.mu-bar input{background:var(--mu-s2);border:1px solid var(--mu-line2);color:var(--mu-tx);border-radius:var(--mu-r);
  padding:3px 7px;font-size:12px;height:26px;transition:border-color .12s ease}
.mu-bar select{cursor:pointer;min-width:88px}
.mu-bar select:hover,.mu-bar input:hover{border-color:#4a4a4a}
.mu-bar select:focus-visible,.mu-bar input:focus-visible,.mu-btn:focus-visible,.mu-icon-btn:focus-visible,
.mu-seg:focus-visible,.mu-link:focus-visible,table.mu-t th:focus-visible{outline:2px solid var(--mu-gold-d);outline-offset:1px}
.mu-btn{background:var(--mu-s3);border:1px solid var(--mu-line2);color:var(--mu-tx);border-radius:var(--mu-r);padding:0 12px;height:28px;
  cursor:pointer;font-size:12px;font-weight:600;transition:background .12s ease,border-color .12s ease,transform .05s ease}
.mu-btn:hover{background:#2f2f2f;border-color:#474747}
.mu-btn:active{transform:translateY(1px)}
/* Glowna akcja zakladki Zbieranie - jedyny przycisk w kolorze akcentu. */
#mu-load-all,#mu-load-resume{background:#2b2417;border-color:#5e4b27;color:#f1d59a}
#mu-load-all:hover,#mu-load-resume:hover{background:#352c1b;border-color:#7a6232}
.mu-bar-spacer{flex:1 0 4px}
.mu-goal{font-size:12px;color:var(--mu-tx3);line-height:1.4}
.mu-goal b{color:var(--mu-tx);font-weight:600}
.mu-link{background:none;border:none;border-bottom:1px dotted var(--mu-gold-d);padding:0;margin-left:4px;color:var(--mu-gold);
  cursor:pointer;font-size:12px}
.mu-link:hover{color:var(--mu-gold-hi)}
.mu-icon-btn{background:var(--mu-s3);border:1px solid var(--mu-line2);color:var(--mu-tx2);border-radius:var(--mu-r);width:26px;height:26px;
  cursor:pointer;font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;
  transition:background .12s ease,color .12s ease}
.mu-icon-btn:hover{background:#2f2f2f;color:var(--mu-tx)}
.mu-icon-btn:active{transform:translateY(1px)}
/* Przelacznik: przyciski w jednej "rynience" (ciemniejsze wglebienie),
 * aktywny jako jasniejszy klawisz - zamiast zlaczonych gradientow. */
.mu-seg-block{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mu-seg-lbl{font-size:10px;color:var(--mu-tx3);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.mu-seg-row{display:inline-flex;justify-self:start;gap:2px;padding:2px;background:rgba(0,0,0,.3);
  border:1px solid var(--mu-line);border-radius:var(--mu-r)}
.mu-seg{padding:3px 10px;font-size:12px;font-weight:600;cursor:pointer;color:var(--mu-tx3);background:transparent;
  border:none;border-radius:4px;transition:color .12s ease,background .12s ease}
.mu-seg:hover{color:var(--mu-tx);background:#202020}
.mu-seg.mu-active{color:#fff;background:#333;box-shadow:inset 0 0 0 1px #454545}
.mu-row{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px}
.mu-subtitle{font-size:11px;color:var(--mu-tx2);margin:0 0 10px;line-height:1.55}
.mu-subtitle b{color:var(--mu-gold);font-weight:600}
/* Statystyki jako male "pigulki" zamiast ciagu tekstu z linia pod spodem. */
.mu-stats-line{font-size:11px;color:var(--mu-tx3);margin:0 0 10px;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.mu-stats-line>span{background:var(--mu-s1);border:1px solid var(--mu-line);border-radius:999px;padding:2px 9px}
.mu-stats-line b{color:var(--mu-tx);font-weight:600;font-variant-numeric:tabular-nums}
.mu-stats-line b.mu-hi{color:var(--mu-gold)}
.mu-stats-line b.mu-pos{color:var(--mu-green)}
.mu-progress-wrap{display:flex;align-items:center;gap:6px;margin-left:auto;color:var(--mu-tx3)}
.mu-progress{width:56px;height:6px;background:#2a2a2a;border-radius:3px;overflow:hidden}
.mu-progress i{display:block;height:100%;background:var(--mu-gold-d)}
.mu-target{margin:0 0 10px;border:1px solid var(--mu-line);border-radius:8px;background:var(--mu-s1)}
.mu-target summary{padding:7px 10px;cursor:pointer;font-size:10px;color:var(--mu-tx2);text-transform:uppercase;
  letter-spacing:.06em;font-weight:600;list-style:none}
.mu-target summary:hover{color:var(--mu-tx)}
.mu-target summary::-webkit-details-marker{display:none}
.mu-target summary::before{content:'\\25B8\\0020';display:inline-block;color:var(--mu-tx3)}
.mu-target[open] summary::before{content:'\\25BE\\0020'}
.mu-target[open] summary{border-bottom:1px solid var(--mu-line)}
.mu-target-body{padding:8px 10px;display:flex;flex-wrap:wrap;gap:8px}
/* Tabele: bez zebry i ciezkich ramek - cienkie separatory, rowne cyfry
 * (tabular-nums), naglowek male kapitaliki. */
table.mu-t{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;font-variant-numeric:tabular-nums}
table.mu-t th{position:sticky;top:0;background:#161616;color:var(--mu-tx3);text-align:right;padding:6px 5px;
  border-bottom:1px solid var(--mu-line2);cursor:pointer;white-space:nowrap;font-weight:600;font-size:10px;
  text-transform:uppercase;letter-spacing:.04em;z-index:1;user-select:none;transition:color .12s ease}
table.mu-t th:hover{color:var(--mu-tx)}
table.mu-t th.mu-sorted{color:var(--mu-gold);box-shadow:inset 0 -2px 0 var(--mu-gold-d)}
table.mu-t th:first-child{text-align:left}
table.mu-t td{padding:5px;border-bottom:1px solid #1d1d1d;text-align:right;white-space:nowrap;color:var(--mu-tx)}
/* Pierwsza kolumna (nazwa przedmiotu / przedzial) moze sie zawijac -
 * nazwy nie maja gornego limitu dlugosci. */
table.mu-t td:first-child{text-align:left;white-space:normal;word-break:break-word;max-width:150px}
table.mu-t tbody tr:hover td{background:rgba(255,255,255,.035)}
table.mu-t td.mu-hi{color:var(--mu-gold);font-weight:700}
/* Oferta miesci sie w budzecie z Kalkulatora - zielony koszt/pkt i pasek po lewej. */
table.mu-t tbody tr.mu-ok td{background:var(--mu-green-bg)}
table.mu-t tbody tr.mu-ok:hover td{background:rgba(130,214,156,.12)}
table.mu-t tbody tr.mu-ok td:first-child{box-shadow:inset 2px 0 0 var(--mu-green)}
table.mu-t tbody tr.mu-ok td.mu-hi{color:var(--mu-green)}
table.mu-t tbody tr.mu-click{cursor:pointer}
/* Oferty, do ktorych zawezono okno aukcji - zloty pasek. */
table.mu-t tbody tr.mu-sel td{background:rgba(230,189,106,.10)}
table.mu-t tbody tr.mu-sel td:first-child{box-shadow:inset 2px 0 0 var(--mu-gold)}
.mu-narrow-note{background:var(--mu-green-bg);border:1px solid rgba(130,214,156,.3);border-radius:8px;
  padding:7px 10px;margin:0 0 10px;font-size:12px;line-height:1.5;color:var(--mu-tx)}
.mu-narrow-note b{color:var(--mu-green)}
.auction-window.mu-pager-running .auction-table tr{display:none}
/* Zawezenie listy w oknie aukcji po kliknieciu oferty w Przedmiotach -
 * tylko widok (patrz MU.sniffer.setNarrow). */
.auction-table.mu-narrowed tr:not(.mu-keep){display:none}
.auction-table.mu-narrowed{outline:2px solid rgba(130,214,156,.6);outline-offset:-1px}
/* Podpowiedz "Max. cena" - zlota karta; informacja (Srednie ceny) - ta sama
 * karta w chlodnym kolorze. Pelna, delikatna ramka zamiast grubego paska. */
.mu-callout{margin:10px 0 8px;padding:10px 12px;border:1px solid var(--mu-gold-line);border-radius:8px;
  background:var(--mu-gold-bg);color:var(--mu-tx);font-size:12px;line-height:1.5}
.mu-callout .mu-callout-lbl{display:block;font-size:10px;color:var(--mu-gold);text-transform:uppercase;
  letter-spacing:.06em;font-weight:700;margin-bottom:4px}
.mu-callout .mu-callout-val{font-size:17px;font-weight:700;color:var(--mu-gold-hi);font-variant-numeric:tabular-nums}
.mu-callout .mu-callout-sub{color:var(--mu-tx2);font-size:11px}
.mu-callout b{color:var(--mu-gold-hi)}
.mu-callout-row+.mu-callout-row{margin-top:8px}
.mu-callout-foot{margin-top:9px;padding-top:8px;border-top:1px solid var(--mu-gold-line)}
.mu-callout.mu-info{border-color:var(--mu-blue-line);background:var(--mu-blue-bg)}
.mu-callout.mu-info .mu-callout-lbl{color:var(--mu-blue)}
.mu-callout.mu-info b{color:#d3e3f2}
.mu-calc-line{font-size:11px;color:var(--mu-tx2);margin:0 0 10px;line-height:1.5}
.mu-calc-line b{color:var(--mu-tx);font-variant-numeric:tabular-nums}
/* Formularz kalkulatora jako siatka: etykiety w jednej kolumnie, przyciski
 * i pola rowno pod soba. */
.mu-calc-grid{display:grid;grid-template-columns:max-content 1fr;align-items:center;gap:7px 12px;margin:0 0 12px}
.mu-calc-inputs{display:flex;align-items:center;gap:12px}
.mu-calc-grid input{box-sizing:border-box;background:var(--mu-s2);border:1px solid var(--mu-line2);color:var(--mu-tx);
  border-radius:var(--mu-r);padding:3px 8px;font-size:12px;height:26px;font-variant-numeric:tabular-nums;
  transition:border-color .12s ease}
.mu-calc-grid input:hover{border-color:#4a4a4a}
.mu-calc-grid input:focus{border-color:var(--mu-gold-d);outline:none}
#mu-calc-lvl{width:64px}
#mu-calc-budget{width:100px}
.mu-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 4px}
.mu-tile{box-sizing:border-box;min-width:0;padding:8px 11px;background:var(--mu-s1);border:1px solid var(--mu-line);border-radius:8px}
.mu-tile-lbl{display:block;font-size:10px;color:var(--mu-tx3);text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.mu-tile-val{display:block;font-size:20px;font-weight:700;color:var(--mu-gold);line-height:1.25;font-variant-numeric:tabular-nums}
.mu-status{font-size:11px;margin:10px 0 0;line-height:1.5;color:var(--mu-tx2)}
/* Pusty przedzial: caly wiersz wygaszony, komorki poza pierwsza puste. */
tr.mu-empty-row td{color:#3d3d3d}
tr.mu-empty-row td:first-child{color:var(--mu-tx3)}
.mu-v{padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600;display:inline-block}
.mu-v-oplaca{background:#1d3a24;color:#6ee08a;border:1px solid #2f6b3d}
.mu-v-ryzykowne{background:#3a3218;color:#e0c46e;border:1px solid #6b5c2f}
.mu-v-marginalne{background:#2a2a2a;color:#b0b0b0;border:1px solid #4a4a4a}
.mu-v-nie-oplaca{background:#3a1d1d;color:#e08a8a;border:1px solid #6b2f2f}
.mu-v-za-malo-danych,.mu-v-brak-danych{background:#22252e;color:#7f8ba3;border:1px solid #39415a}
.mu-pos{color:var(--mu-green)}.mu-neg{color:var(--mu-red)}.mu-mut{color:var(--mu-tx3)}
.mu-conf{display:inline-flex;align-items:center;gap:5px;vertical-align:middle}
.mu-conf i{display:block;width:26px;height:5px;background:#2a2a2a;border-radius:3px;overflow:hidden}
.mu-conf i b{display:block;height:100%;background:#6b8f4a;transition:width .2s ease}
.mu-conf span{font-size:10px;color:var(--mu-tx3);min-width:22px}
.mu-empty{padding:30px 16px;text-align:center;color:var(--mu-tx3);line-height:1.6;font-size:12px}
.mu-empty b{color:var(--mu-tx)}
.mu-sec{margin:2px 0 10px;font-size:10px;color:var(--mu-tx3);text-transform:uppercase;letter-spacing:.08em;font-weight:700}
.mu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:14px}
.mu-f{background:var(--mu-s1);border:1px solid var(--mu-line);border-radius:8px;padding:6px 8px;transition:border-color .12s ease}
.mu-f:focus-within{border-color:#4a4a4a}
.mu-f label{display:block;font-size:10px;color:var(--mu-tx3);margin-bottom:3px;text-transform:uppercase}
.mu-f input,.mu-f select{width:100%;background:var(--mu-s2);border:1px solid var(--mu-line2);color:var(--mu-tx);
  border-radius:4px;padding:4px 6px;font-size:11px}
.mu-note{background:var(--mu-s1);border:1px solid var(--mu-line);border-radius:8px;padding:8px 10px;margin:0 0 10px;
  color:var(--mu-tx2);font-size:11px;line-height:1.5}
.mu-warn{background:rgba(230,170,90,.07);border:1px solid rgba(230,170,90,.25);border-radius:8px;padding:8px 10px;
  margin:0 0 10px;color:#dcb98a;font-size:11px;line-height:1.5}
pre.mu-raw{background:#0d0d0d;border:1px solid var(--mu-line);border-radius:8px;padding:8px;overflow:auto;max-height:180px;
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
    { id: 'przedmioty', label: 'Przedmioty' },
    { id: 'kalkulator', label: 'Kalkulator' },
    { id: 'zbieranie', label: 'Zbieranie' },
    { id: 'tabela', label: 'Średnie ceny' },
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
      class: 'mu-bar-icon', title: 'Ulepy – opłacalność ulepszania (przeciągnij, żeby przesunąć)',
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
          '<div class="text" name="Ulepy">Ulepy</div>' +
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

    /* Wpisywanie w pola panelu (poziom, budzet "6g"...) nie moze odpalac
     * skrotow klawiszowych gry. Tylko dla pol tekstowych - klawisze przy
     * fokusie na przyciskach panelu dalej trafiaja do gry. */
    ['keydown', 'keyup', 'keypress'].forEach(function (type) {
      panel.addEventListener(type, function (e) {
        const t = e.target && e.target.tagName;
        if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') e.stopPropagation();
      });
    });

    /* Ikona i okno zawsze na ekranie - rowniez po zmianie rozmiaru okna
     * przegladarki. Na zywo: ikona zamontowana przy szerokim oknie zostala
     * na x=922 po zwezeniu okna do 337px i nie dalo sie jej kliknac. */
    function keepOnScreen() {
      [icon, panel].forEach(function (x) {
        let left = parseInt(x.style.left, 10) || 0;
        let top = parseInt(x.style.top, 10) || 0;
        /* Otwarte okno (ma wtedy wymiary) miesci sie w CALOSCI, jesli ekran
         * na to pozwala - samo "60 px widoczne" z clampPos wystarcza dla
         * ikony, ale okno zostawialo prawie calkiem poza ekranem (lokalny
         * test: lewa krawedz na 740 z 800 px). */
        if (x === panel && x.offsetWidth) {
          left = Math.min(left, Math.max(0, window.innerWidth - x.offsetWidth));
          top = Math.min(top, Math.max(0, window.innerHeight - x.offsetHeight));
        }
        const c = clampPos(left, top);
        x.style.left = c.left + 'px';
        x.style.top = c.top + 'px';
      });
    }
    keepOnScreen();
    window.addEventListener('resize', U.debounce(keepOnScreen, 150));
    root.keepOnScreen = keepOnScreen;

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
      /* Dopiero otwarte okno ma wymiary - dopasuj je do ekranu teraz. */
      if (root.keepOnScreen) root.keepOnScreen();
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

  /* Postep "Zaladuj wszystkie strony" (i zamiana przycisku na Zatrzymaj).
   * Throttle, nie debounce: przy stronach szybszych niz 200 ms debounce
   * odkladal render w nieskonczonosc i postep sie w ogole nie pokazywal
   * (lokalny symulator). Teraz najwyzej raz na 200 ms, zawsze z aktualnym
   * stanem - takze ostatnia aktualizacja po zakonczeniu. */
  let pagerRenderTimer = null;
  function renderPagerDebounced() {
    if (pagerRenderTimer) return;
    pagerRenderTimer = setTimeout(function () {
      pagerRenderTimer = null;
      if (panel && panel.classList.contains('mu-open') && activeTab === 'zbieranie') render(true);
    }, 200);
  }
  MU.sniffer.onPager(renderPagerDebounced);
  /* Gdy gracz otworzy/zmieni liste w oknie aukcji - odswiez Zbieranie, zeby
   * przycisk "Wznow" pojawil sie od razu po powrocie do tej samej listy. */
  MU.sniffer.onAhTask(renderPagerDebounced);
  /* Zawezenie okna aukcji (klik w Przedmiotach) - liczba pasujacych ofert
   * zmienia sie np. po zakupie, pasek w Przedmiotach ma to pokazywac. */
  /* Kupione (znikniete z listy w oknie aukcji) oferty wypadaja z Przedmiotow. */
  if (MU.sniffer.onSessionChange) MU.sniffer.onSessionChange(renderLiveDebounced);
  if (MU.sniffer.onNarrow) MU.sniffer.onNarrow(function () {
    if (panel && panel.classList.contains('mu-open') && activeTab === 'przedmioty') render(true);
  });

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
    return '<span class="mu-conf" title="Pewność danych: ' + pctv + '%">' +
      '<i><b style="width:' + pctv + '%;background:' + color + '"></b></i>' +
      '<span>' + pctv + '%</span></span>';
  }

  /* Cel ulepszania = to, co wpisane w Kalkulatorze (rzadkosc, grupa,
   * poziom). Dawniej osobna zwijana sekcja "Cel ulepszania" nad lista -
   * dublowala Kalkulator i latwo bylo policzyc bonus dwa razy (uwaga
   * uzytkownika). Teraz w pasku jest tylko linijka, dla czego liczymy. */
  function goalHtml() {
    const t = currentTarget();
    const parts = [MU.cfg.rarityById(t.rarity).label + (t.lvl ? ' lvl ' + t.lvl : '')];
    parts.push(t.group ? GROUP_LABELS[t.group] : 'grupa nie wybrana');
    return '<div class="mu-goal">Ulepszasz: <b>' + U.escapeHtml(parts.join(' · ')) + '</b> ' +
      '<button type="button" class="mu-link" id="mu-goto-calc">zmień w Kalkulatorze</button></div>';
  }

  function goTab(id) {
    const card = panel && panel.querySelector('#mu-tabs .card[data-tab="' + id + '"]');
    if (card) card.click();
  }

  /* Pasek nad lista: linijka "Ulepszasz: ..." (cel z Kalkulatora) +
   * przyciski akcji (male ikony, nie przyciski z pelnym tekstem - patrz
   * .mu-icon-btn). Filtry WLASCIWE danej zakladki (Kategoria/Rzadkosc w
   * Tabeli, Kategoria/Rzadkosc skladnika w Przedmiotach) sa teraz
   * renderowane w tresci danej zakladki (renderTable/renderItems), bo sa
   * scisle zwiazane z tym, co ta zakladka akurat pokazuje. */
  function renderBar() {
    const bar = panel.querySelector('#mu-bar');
    /* Na zakladkach bez paska (Kalkulator, Zbieranie) chowamy go calkiem -
     * pusty pasek zostawial pod zakladkami zbedny pas (uwaga uzytkownika). */
    if (activeTab !== 'tabela' && activeTab !== 'przedmioty') { bar.innerHTML = ''; bar.style.display = 'none'; return; }
    bar.style.display = '';

    bar.innerHTML = goalHtml() +
      '<div class="mu-bar-spacer"></div>' +
      '<button class="mu-icon-btn" id="mu-csv" title="Eksport CSV">&#8681;</button>' +
      '<button class="mu-icon-btn" id="mu-refresh" title="Odśwież teraz">&#8635;</button>';

    bar.querySelector('#mu-goto-calc').onclick = function () { goTab('kalkulator'); };
    bar.querySelector('#mu-csv').onclick = exportCsv;
    /* Owiniete w funkcje - onclick przekazalby MouseEvent jako pierwszy
     * argument refresh(bodyOnly), co przypadkiem wlaczyloby tryb "w tle". */
    bar.querySelector('#mu-refresh').onclick = function () { refresh(); };
  }

  /* Zawsze jest jakis cel - rzadkosc w Kalkulatorze ma wartosc domyslna. */
  function currentTarget() {
    const lvl = parseInt(calc.lvl, 10);
    return { rarity: calc.rarity, group: calc.group || null,
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
    { k: 'bracket', t: 'Przedział', f: function (r) { return U.escapeHtml(r.bracket); } },
    { k: 'lvl', t: 'Śr. lvl', f: function (r) { return r.empty ? '' : U.round(r.lvl, 0); } },
    { k: 'price', t: 'Cena', f: function (r) { return r.empty ? '' : U.gold(r.price); } },
    { k: 'points', t: 'Pkt', f: function (r) {
        if (r.empty) return '';
        return r.points + (r.bonusApplied ? '<span class="mu-pos" title="z bonusem za dopasowanie do celu">*</span>' : ''); } },
    { k: 'costPerPoint', t: 'Koszt/pkt', f: function (r) { return r.empty ? '' : U.gold(r.costPerPoint); },
      cls: function (r) { return r.empty ? '' : 'mu-hi'; } },
    { k: 'confidence', t: 'Pewność', f: function (r) { return r.empty ? '' : confBar(r.confidence); } },
  ];

  /* Zakladka "Srednie ceny" (dawniej "Tabela") to podglad rynku, nie lista
   * zakupow - stad ramka z wyjasnieniem na gorze (uwaga uzytkownika). */
  function avgInfoHtml(cfg) {
    return '<div class="mu-callout mu-info"><span class="mu-callout-lbl">Co tu jest</span>' +
      'Tu dodatek w tle zbiera <b>średnie ceny</b> z domu aukcyjnego. Z każdej oferty, którą zobaczysz ' +
      'w oknie aukcji, zapisuje cenę i trzyma ją do ' + cfg.stats.retentionDays + ' dni – świeższe liczą się ' +
      'bardziej. Dla każdego przedziału poziomów widzisz typową cenę przedmiotu i ile średnio wychodzi za punkt.' +
      '<div class="mu-callout-sub" style="margin-top:4px">To podgląd rynku, nie lista zakupów – konkretne oferty ' +
      'do kupienia są w zakładce <b>Przedmioty</b>. Jeśli ładujesz aukcje z ustawioną Max. ceną, trafiają tu ' +
      'tylko tanie oferty, więc średnie wyjdą niższe niż naprawdę.</div></div>';
  }

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
    let html = avgInfoHtml(cfg) + '<div class="mu-row">' +
      '<div class="mu-seg-block"><span class="mu-seg-lbl">Kategoria</span><div class="mu-seg-row" id="mu-tabgrp-pills">' +
        GROUP_ORDER.map(function (g) {
          return '<button type="button" class="mu-seg' + (state.tableGroup === g ? ' mu-active' : '') +
            '" data-g="' + g + '">' + GROUP_LABELS[g] + '</button>';
        }).join('') + '</div></div>' +
      '<div class="mu-seg-block"><span class="mu-seg-lbl">Rzadkość</span><div class="mu-seg-row" id="mu-tabrar-pills">' +
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
      '<span><b>' + filled.length + '/' + rows.length + '</b> przedziałów</span>' +
      '<span>najtaniej <b class="mu-hi">' + (isFinite(cheapest) ? U.gold(cheapest) : '-') + '</b>/pkt</span>' +
      '<span class="mu-progress-wrap" title="Zebrano ' + days + ' z ' + cfg.collectDays + ' zadeklarowanych dni zbierania danych">' +
        days + '/' + cfg.collectDays + ' dni<span class="mu-progress"><i style="width:' + collectPct + '%"></i></span>' +
      '</span>' +
      '</div>';

    /* Krotki, stonowany podtytul zamiast dawnego dlugiego akapitu -
     * najwazniejsza informacja (brak bonusow bez celu) w jednej linii,
     * bez pogrubien/kolorow poza jednym akcentem na nazwie sekcji. */
    const target = currentTarget();
    html += '<p class="mu-subtitle">Kolumna "Pkt" z bonusami za dopasowanie do tego, co ulepszasz ' +
      '(ustawienia z <b>Kalkulatora</b>).</p>';

    /* Calkowity koszt ulepszenia CELU (+0 -> +5) zalezy WYLACZNIE od
     * poziomu i rzadkosci tego celu (im wyzsza rzadkosc/poziom, tym wiecej
     * punktow trzeba zebrac - dla legendy to nawet 1000x wiecej niz dla
     * zwyklego przedmiotu na tym samym poziomie). Bez tego zestawienia
     * kolumna "koszt za punkt" jest tylko abstrakcyjnym wskaznikiem -
     * to pokazuje realna, calkowita kwote. */
    if (target && target.rarity && target.lvl) {
      const totalPts = MU.upgrade.totalPointsCost(target.lvl, target.rarity, 0, 5);
      const fodderGold = isFinite(cheapest) ? cheapest * totalPts : NaN;
      /* Bez oplaty za +5 i bez esencji - decyzja uzytkownika: koszt
       * ulepszenia to tylko punkty x cena za punkt. */
      html += '<p class="mu-subtitle">Całkowicie +0&rarr;+5 (' + MU.cfg.rarityById(target.rarity).label +
        ' lvl ' + target.lvl + '): <b>' + U.round(totalPts, 0) + '</b> pkt &middot; składniki ' +
        '<b>' + (isFinite(fodderGold) ? U.gold(fodderGold) : '-') + '</b>.</p>';
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

  function renderEmpty(body) {
    const d = MU.sniffer.diag.lastDom;
    let hint = 'Otwórz dom aukcyjny w grze i poprzeglądaj listy – dodatek zapisuje cenę ' +
      'każdej nowo zobaczonej oferty od razu.';
    if (d) {
      hint = 'Dodatek widział dotąd <b>' + d.covered + '</b>' +
        (isFinite(d.total) ? ' z <b>' + d.total + '</b>' : '') +
        ' pasujących aukcji, ale w wybranej kategorii i rzadkości nie ma jeszcze danych.';
    }
    body.innerHTML = avgInfoHtml(MU.cfg.get()) + '<div class="mu-empty">' +
      '<b>Brak danych – jeszcze.</b><br>' + hint + '<br><br>' +
      'Całą listę pobierzesz przyciskiem <b>Załaduj wszystkie strony</b> w zakładce ' +
      '<b>Zbieranie</b>.' +
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
  /* Komunikat po nieudanym zawezeniu okna aukcji (patrz renderItems). */
  let narrowMsg = '';
  function plOfert(n) {
    const d = n % 10, dd = n % 100;
    return n === 1 ? 'oferta' : (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? 'oferty' : 'ofert');
  }

  const ITEM_COLS = [
    { k: 'name', t: 'Przedmiot', f: function (r) { return U.escapeHtml(r.name); } },
    { k: 'category', t: 'Kat.', f: function (r) {
        return U.escapeHtml(MU.cfg.categoryById(r.category).label); } },
    { k: 'rarity', t: 'Rzadkość', f: function (r) {
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
    /* Minimum, nie rows[0] - po sortowaniu po innej kolumnie pierwszy wiersz
     * nie jest najtanszy. */
    const cheapestLive = rows.reduce(function (m, r) { return r.costPerPoint < m ? r.costPerPoint : m; }, Infinity);
    /* Budzet z Kalkulatora: oferta sie oplaca, gdy jej koszt za punkt (juz z
     * bonusami za dopasowanie do celu) nie przekracza max ceny za punkt. */
    const plan = calcPlan();
    const maxPP = plan ? Math.floor(plan.p.maxPerPoint) : NaN;
    const fits = function (r) { return r.costPerPoint <= maxPP; };
    const nFit = isFinite(maxPP) ? rows.filter(fits).length : 0;

    let html = '<div class="mu-stats-line">' +
      '<span><b>' + rows.length + '</b> ofert (sesja)</span>' +
      '<span>pokazano <b>' + Math.min(rows.length, SHOWN_MAX) + '</b></span>' +
      (isFinite(maxPP) ? '<span><b class="mu-pos">' + nFit + '</b> w budżecie</span>' : '') +
      '<span>najtaniej <b class="mu-hi">' + (isFinite(cheapestLive) ? U.gold(cheapestLive) : '-') + '</b>/pkt</span>' +
      '</div>';

    html += '<p class="mu-subtitle">' + (isFinite(maxPP)
        ? 'Na zielono oferty mieszczące się w budżecie z Kalkulatora – koszt/pkt do <b>' + calcNum(maxPP) +
          '</b> (bonusy już wliczone).'
        : 'Wpisz poziom i budżet w <b>Kalkulatorze</b>, a oferty mieszczące się w budżecie podświetlą się na zielono.') +
      ' Kliknij ofertę, a w oknie aukcji zostaną tylko takie same w tej samej cenie.' +
      ' Lista to wszystkie oferty widziane od otwarcia gry, nie historia – średnie są w zakładce <b>Średnie ceny</b>.</p>';

    /* Zawezenie okna aukcji (klik oferty) - co widac w grze i jak wrocic. */
    const nw = MU.sniffer.getNarrow ? MU.sniffer.getNarrow() : null;
    const isSel = function (r) { return !!nw && r.name === nw.name && r.price === nw.price; };
    if (nw) {
      html += '<div class="mu-narrow-note">W oknie aukcji widać tylko: <b>' + U.escapeHtml(nw.name) + '</b> za <b>' +
        U.gold(nw.price) + '</b> – ' + (nw.count ? nw.count + ' ' + plOfert(nw.count) : 'nie ma już tych ofert') +
        ' <button type="button" class="mu-link" id="mu-narrow-clear">Pokaż wszystko</button></div>';
    } else if (narrowMsg) {
      html += '<div class="mu-warn">' + narrowMsg + '</div>';
    }

    if (!rows.length) {
      html += '<div class="mu-empty">Brak jeszcze zaobserwowanych ofert. Otwórz dom aukcyjny ' +
        'w grze i poprzeglądaj kategorie – dodatek zapamięta każdą widzianą ofertę aż do ' +
        'przeładowania strony.</div>';
      body.innerHTML = html;
      return;
    }

    if (rows.length > SHOWN_MAX) {
      html += '<div class="mu-warn">Pokazano ' + SHOWN_MAX + ' z ' + rows.length + ' najtańszych – reszta ukryta.</div>';
    }

    html += '<table class="mu-t"><thead><tr>' + ITEM_COLS.map(function (c) {
      const on = sortKeyItems === c.k;
      const mark = on ? (sortDirItems < 0 ? ' &#9660;' : ' &#9650;') : '';
      return '<th data-k="' + c.k + '"' + (on ? ' class="mu-sorted"' : '') + '>' + c.t + mark + '</th>';
    }).join('') + '</tr></thead><tbody>';

    for (const r of rows.slice(0, SHOWN_MAX)) {
      const rc = ['mu-click'];
      if (fits(r)) rc.push('mu-ok');
      if (isSel(r)) rc.push('mu-sel');
      html += '<tr class="' + rc.join(' ') + '" data-aid="' + U.escapeHtml(String(r.aid)) +
        '" title="Pokaż w oknie aukcji tylko ten przedmiot w tej samej cenie">' + ITEM_COLS.map(function (c) {
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

    /* Klik oferty -> zawezenie listy w oknie aukcji do tego przedmiotu w tej
     * samej cenie; ponowny klik tej samej oferty je zdejmuje. */
    const byAid = new Map(rows.map(function (r) { return [String(r.aid), r]; }));
    body.querySelector('table.mu-t tbody').addEventListener('click', function (e) {
      const tr = e.target.closest('tr[data-aid]');
      const r = tr && byAid.get(tr.getAttribute('data-aid'));
      if (!r) return;
      const cur = MU.sniffer.getNarrow();
      if (cur && cur.name === r.name && cur.price === r.price) {
        narrowMsg = '';
        MU.sniffer.clearNarrow();
        render(true);
        return;
      }
      const res = MU.sniffer.setNarrow(r.name, r.price);
      narrowMsg = res.ok ? '' : (res.reason === 'no-window'
        ? 'Otwórz dom aukcyjny w grze – zawężana jest lista, którą gra pokazuje w oknie aukcji.'
        : 'Tej oferty nie ma teraz w oknie aukcji (inna kategoria lub filtr, albo ktoś ją już kupił). ' +
          'Nazwa skopiowana do schowka.');
      if (!res.ok && res.reason === 'none') {
        try { navigator.clipboard.writeText(r.name).catch(function () {}); } catch (err) {}
      }
      render(true);
    });
    const clr = body.querySelector('#mu-narrow-clear');
    if (clr) clr.onclick = function () { narrowMsg = ''; MU.sniffer.clearNarrow(); render(true); };
  }

  /* --- zakladka: zbieranie -------------------------------------------- */

  /* Czy zwijana sekcja "Dane" jest rozwinieta - zapamietane poza renderem,
   * bo zakladka przerysowuje sie przy kazdej stronie ladowania (inaczej
   * sekcja zwijalaby sie sama co chwile). */
  let collectDataOpen = false;

  function renderCollect(body) {
    const cfg = MU.cfg.get();
    const d = MU.sniffer.diag;

    /* Uklad (uwaga uzytkownika o czytelnosci): najpierw to, czego sie uzywa -
     * doladowanie listy. Techniczne liczniki (sprzedane/wygasle, trafienia,
     * magazyn) usuniete - nieprzydatne dla gracza (uwaga uzytkownika). */
    body.innerHTML =
      (d.hits === 0 ? '<div class="mu-warn">Dodatek nie zobaczył jeszcze żadnych danych ' +
        'aukcyjnych. Otwórz dom aukcyjny w grze i wybierz kategorię.</div>' : '') +
      '<h4 class="mu-sec">Doładowanie listy</h4>' +
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
          line = '<span class="mu-mut">Ładuję stronę <b>' + (p.page + 1) + '</b> z <b>' + p.pages +
            '</b> – w oknie gry <b>' + p.rows + '</b> z <b>' + p.total + '</b> ofert' +
            (p.avgMs ? ', średnio <b>' + (p.avgMs / 1000).toFixed(2) + ' s</b>/stronę (ostatnia ' +
              (p.lastMs / 1000).toFixed(2) + ' s)' : '') +
            '. Lista w oknie gry jest na ten czas ukryta.</span>';
        } else if (p.message) {
          line = '<span class="' + (p.status === 'done' ? 'mu-pos' : 'mu-mut') + '">' +
            esc(p.message) + '</span>';
        }
        /* Wznawianie: po przerwaniu (zamkniecie okna, Zatrzymaj...) i powrocie
         * do tej samej listy - "Wznow od strony X" zamiast ladowania od nowa. */
        const resume = MU.sniffer.getResumeInfo();
        let buttons = '<button class="mu-btn" id="mu-load-all">Załaduj wszystkie strony</button>';
        if (p.running) buttons = '<button class="mu-btn" id="mu-load-stop">Zatrzymaj</button>';
        else if (resume && resume.matches) {
          buttons = '<button class="mu-btn" id="mu-load-resume">Wznów od strony ' + (resume.page + 1) +
            ' z ' + resume.pages + '</button> <button class="mu-btn" id="mu-load-all">Od początku</button>';
        }
        const resumeHint = !p.running && resume && !resume.matches
          ? '<p class="mu-status mu-mut">Przerwane ładowanie (strona ' + resume.page + ' z ' + resume.pages +
            '). Otwórz w oknie aukcji tę samą listę (te same filtry i kategoria), żeby wznowić.</p>'
          : '';
        /* Ramka z Max. cena jest tylko w Kalkulatorze - tu byla ta sama (uwaga
         * uzytkownika). Opis mowi wprost, CO sie wczytuje: otwarta lista z
         * filtrami z gry, nie caly dom aukcyjny. */
        return buttons +
          (line ? '<p class="mu-status">' + line + '</p>' : '') + resumeHint +
          '<p class="mu-subtitle" style="margin-top:8px">Wczytuje wszystkie strony listy otwartej teraz w oknie ' +
          'aukcji – z filtrami ustawionymi w grze, więc najpierw wpisz tam Max. cenę z <b>Kalkulatora</b>. ' +
          'Nic nie kupuje i nie licytuje.</p>';
      })() +
      (d.lastDom ? (function () {
        const status = d.lastDom.complete
          ? '<span class="mu-pos">Pobrano komplet listy dla tego filtra.</span>'
          : '<span class="mu-mut">To jeszcze nie komplet.</span>';
        return '<p class="mu-subtitle">W oknie gry <b>' + d.lastDom.allCount + '</b> wierszy, zobaczonych ' +
          'dotąd <b>' + d.lastDom.covered + '</b>' +
          (d.lastDom.total === null ? '' : ' z <b>' + d.lastDom.total + '</b>') +
          ' pasujących aukcji (' + new Date(d.lastDom.at).toLocaleTimeString() + '). ' + status + '</p>';
      })() : '') +
      /* Dane (eksport/import/czyszczenie) tez zwiniete - uzywane rzadko
       * (uwaga uzytkownika). */
      '<details class="mu-target" id="mu-data-details"' + (collectDataOpen ? ' open' : '') + '>' +
        '<summary>Dane</summary>' +
        '<div style="padding:8px;display:flex;flex-wrap:wrap;gap:6px">' +
          '<button class="mu-btn" id="mu-exp">Eksport JSON</button>' +
          '<button class="mu-btn" id="mu-imp">Import JSON</button>' +
          '<button class="mu-btn" id="mu-purge">Usuń starsze niż ' + cfg.stats.retentionDays + ' dni</button>' +
          '<button class="mu-btn" id="mu-wipe">Wyczyść wszystko</button>' +
        '</div>' +
      '</details>' +
      '<input type="file" id="mu-file" accept="application/json" style="display:none">';

    const dataDetails = body.querySelector('#mu-data-details');
    dataDetails.addEventListener('toggle', function () { collectDataOpen = dataDetails.open; });

    const loadAll = body.querySelector('#mu-load-all');
    if (loadAll) loadAll.onclick = function () { MU.sniffer.loadAllPages(); };
    const loadResume = body.querySelector('#mu-load-resume');
    if (loadResume) loadResume.onclick = function () { MU.sniffer.loadAllPages({ resume: true }); };
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
        } catch (e) { alert('Nieprawidłowy plik JSON.'); }
      });
    };
    body.querySelector('#mu-purge').onclick = function () {
      MU.store.purgeOld(cfg.stats.retentionDays).then(function (n) {
        alert('Usunięto ' + n + ' rekordów.'); refresh();
      });
    };
    body.querySelector('#mu-wipe').onclick = function () {
      if (confirm('Usunąć wszystkie zebrane obserwacje (i bazę śledzonych aukcji)? Tej operacji nie da się cofnąć.')) {
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
    downloadCsv(lines, 'ulepy-srednie-ceny.csv');
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

  /* --- zakladka: kalkulator ------------------------------------------ */

  /* Stan kalkulatora = cel ulepszania dla calego panelu (Przedmioty i
   * Srednie ceny licza bonusy wzgledem niego - patrz currentTarget).
   * Zapisywany w localStorage, zeby po przeladowaniu gry cel nie wracal po
   * cichu do domyslnej legendy. Samo liczenie jest w MU.upgrade.budgetPlan:
   * tylko punkty, bez oplaty za +5 i bez esencji (decyzja uzytkownika).
   * Grupa nie zmienia kafelkow (bonus +25% jest ten sam dla kazdej grupy) -
   * decyduje tylko, KTORE oferty w Przedmiotach go dostaja. */
  const CALC_RARITIES = [
    { id: 'unikat', label: 'Unikat' }, { id: 'heroik', label: 'Heroik' }, { id: 'legenda', label: 'Legenda' },
  ];
  const CALC_KEY = 'MU_CALC_v1';
  const calc = (function () {
    const c = { rarity: 'legenda', group: '', from: 0, lvl: '', budget: '' };
    try {
      const s = JSON.parse(localStorage.getItem(CALC_KEY) || 'null') || {};
      if (CALC_RARITIES.some(function (r) { return r.id === s.rarity; })) c.rarity = s.rarity;
      if (GROUP_ORDER.indexOf(s.group) >= 0) c.group = s.group;
      if (s.from >= 0 && s.from <= 4) c.from = s.from | 0;
      if (typeof s.lvl === 'string') c.lvl = s.lvl;
      if (typeof s.budget === 'string') c.budget = s.budget;
    } catch (e) { /* brak localStorage - zostaja domyslne */ }
    return c;
  })();
  function saveCalc() {
    try { localStorage.setItem(CALC_KEY, JSON.stringify(calc)); } catch (e) {}
  }

  /* Liczby ZAWSZE z odstepem co 3 cyfry (takze "1 684") - toLocaleString('pl-PL')
   * nie grupuje liczb 4-cyfrowych, przez co obok siebie stalo "1684" i
   * "2 968 000" (uwaga uzytkownika o niespojnym zapisie). */
  function calcNum(v) {
    return String(Math.floor(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* Wynik kalkulatora dla aktualnie wpisanych danych albo null. Uzywany
   * tez w zakladce Zbieranie (podpowiedz, ile wpisac w "Max. cena"). */
  function calcPlan() {
    const lvl = parseInt(calc.lvl, 10);
    const parsed = MU.normalize.parseGoldText(calc.budget);
    const budget = parsed && !parsed.hasPremium ? parsed.gold : NaN;
    if (!(lvl > 0) || !(budget > 0)) return null;
    const p = MU.upgrade.budgetPlan(lvl, calc.rarity, calc.from, budget);
    if (!p) return null;
    const brackets = MU.cfg.get().brackets;
    const maxLvl = brackets.length ? brackets[brackets.length - 1][1] : 300;
    const mpp = Math.floor(p.maxPerPoint);
    /* Osobno dla unikatow i heroikow: heroikow tak tanio nikt nie sprzedaje
     * (uwaga uzytkownika), wiec zalecany pulap Max. ceny to pulap unikatu -
     * inaczej gra wysylalaby wszystkie unikaty az do pulapu heroika. */
    return { lvl: lvl, budget: budget, p: p, caps: {
      unikat: MU.upgrade.maxOfferPrice(mpp, calc.rarity, maxLvl, 'unikat'),
      heroik: MU.upgrade.maxOfferPrice(mpp, calc.rarity, maxLvl, 'heroik'),
      lvl: maxLvl,
    } };
  }

  function calcOutHtml() {
    const c = calcPlan();
    if (!c) {
      return '<p class="mu-subtitle">Wpisz poziom przedmiotu i budżet, np. <b>6g</b>, <b>500m</b> albo <b>750k</b>.</p>';
    }
    const p = c.p;
    /* Wynik jako dwa duze kafelki zamiast malej tabeli - najwazniejsze
     * liczby od razu widoczne (uwaga uzytkownika o czytelnosci). */
    return '<p class="mu-calc-line">' + MU.cfg.rarityById(calc.rarity).label + ' lvl ' + c.lvl +
        ': +' + calc.from + ' &rarr; +5 &middot; potrzeba <b>' + calcNum(p.points) + '</b> pkt &middot; ' +
        'budżet <b>' + calcNum(c.budget) + '</b> (' + U.gold(c.budget) + ')</p>' +
      '<div class="mu-tiles">' +
        '<div class="mu-tile"><span class="mu-tile-lbl">Max za punkt</span>' +
          '<span class="mu-tile-val">' + calcNum(p.maxPerPoint) + '</span>' +
          '</div>' +
        '<div class="mu-tile"><span class="mu-tile-lbl">Z tej samej grupy (+25%)</span>' +
          '<span class="mu-tile-val">' + calcNum(p.groupMaxPerPoint) + '</span>' +
          '</div>' +
        /* Ulepszanie heroika heroikami (unikatu unikatami): bonus +200% za
         * te sama rzadkosc - tego brakowalo (uwaga uzytkownika). */
        (calc.rarity === 'heroik' || calc.rarity === 'unikat' ? (function () {
          const who = calc.rarity === 'heroik' ? 'Heroikiem' : 'Unikatem';
          return '<div class="mu-tile"><span class="mu-tile-lbl">' + who + ' (+200%)</span>' +
              '<span class="mu-tile-val">' + calcNum(p.sameRarityMaxPerPoint) + '</span>' +
              '</div>' +
            '<div class="mu-tile"><span class="mu-tile-lbl">' + who + ' z tej samej grupy (+225%)</span>' +
              '<span class="mu-tile-val">' + calcNum(p.sameRarityGroupMaxPerPoint) + '</span>' +
              '</div>';
        })() : '') +
      '</div>' +
      offerCapCalloutHtml(c.caps, calc.rarity) +
      '<p class="mu-subtitle" style="margin:0">Liczone tylko z punktów – bez opłaty za +5 i bez esencji.</p>';
  }

  /* Podpowiedz "Max. cena" - wyrozniona zlota ramka (uwaga uzytkownika: w
   * szarej ramce byla niewidoczna), tylko w Kalkulatorze. Pod kazda cena
   * krotkie wyjasnienie (uwaga uzytkownika: bez niego nie bylo wiadomo, co
   * i jak), ale bez dawnych bledow: "Rzadkosc Heroiczne" wprost jako filtr
   * w grze, nie wybor w Kalkulatorze, i bez "tak tanie heroiki sie nie
   * trafiaja" - przy wiekszym budzecie to nieprawda. Dwie ceny, bo jedna nie
   * wystarczy: z pulapem unikatu gra nie wysle drozszych, a wciaz oplacalnych
   * heroikow. */
  function offerCapCalloutHtml(caps, rarity) {
    const row = function (who, v, why) {
      return '<div class="mu-callout-row">' + who + ': <span class="mu-callout-val">' + calcNum(v) + '</span> ' +
        '<span class="mu-callout-sub">(' + U.gold(v) + ')</span>' +
        '<div class="mu-callout-sub">' + why + '</div></div>';
    };
    /* Stopka: ceny to GORNA granica dla najlepszego skladnika - nizszy
     * poziom daje mniej punktow (uwaga uzytkownika: heroik 20 lvl za 20m
     * miesci sie w pulapie, a wcale sie nie oplaca). O konkretnej ofercie
     * rozstrzyga zielone podswietlenie w Przedmiotach. */
    return '<div class="mu-callout"><span class="mu-callout-lbl">Ustaw w oknie aukcji Max. cenę</span>' +
      row('Unikaty', caps.unikat, 'Droższe unikaty i tak się nie opłacają – z tą ceną gra ich w ogóle nie ' +
        'wyśle, więc ładowanie będzie dużo krótsze.') +
      row('Heroiki', caps.heroik, (rarity === 'heroik' ? 'Z bonusem +200% za tę samą rzadkość. ' : '') +
        'Żeby je sprawdzić, osobno ustaw w oknie aukcji rzadkość Heroiczne i tę cenę (to filtr w grze, nie ' +
        'wybór w Kalkulatorze). Jeśli na twoim świecie tak tanich heroików nie ma, pomiń to – oszczędzisz ' +
        'jedno ładowanie.') +
      '<div class="mu-callout-sub mu-callout-foot">To górne granice, liczone dla najlepszego składnika (' +
        caps.lvl + ' lvl, ta sama grupa). Niższy poziom daje mniej punktów, więc np. heroik na 20 lvl opłaca ' +
        'się dużo taniej. Czy konkretna oferta się opłaca, pokazuje na zielono zakładka <b>Przedmioty</b>.</div>' +
      '</div>';
  }

  function renderCalc(body) {
    function seg(id, items, current) {
      return '<div class="mu-seg-row" id="' + id + '">' + items.map(function (it) {
        return '<button type="button" class="mu-seg' + (String(current) === String(it.id) ? ' mu-active' : '') +
          '" data-v="' + it.id + '">' + it.label + '</button>';
      }).join('') + '</div>';
    }
    /* Formularz jako siatka: etykiety w jednej kolumnie, przyciski i pola
     * rowno pod soba (uwaga uzytkownika - rozjechane rzedy). */
    body.innerHTML =
      '<div class="mu-calc-grid">' +
        '<span class="mu-seg-lbl">Rzadkość</span>' + seg('mu-calc-rar', CALC_RARITIES, calc.rarity) +
        '<span class="mu-seg-lbl">Obecne ulepszenie</span>' +
          seg('mu-calc-from', [0, 1, 2, 3, 4].map(function (k) { return { id: k, label: '+' + k }; }), calc.from) +
        '<span class="mu-seg-lbl" title="Grupa przedmiotu, który ulepszasz – składniki z tej samej grupy dostają +25% punktów (liczone w Przedmiotach)">Grupa</span>' +
          seg('mu-calc-grp', GROUP_ORDER.map(function (g) { return { id: g, label: GROUP_LABELS[g] }; }), calc.group) +
        '<label class="mu-seg-lbl" for="mu-calc-lvl">Poziom</label>' +
        '<div class="mu-calc-inputs"><input id="mu-calc-lvl" type="number" min="1" max="300" ' +
          'placeholder="np. 244" value="' + U.escapeHtml(calc.lvl) + '">' +
          '<label class="mu-seg-lbl" for="mu-calc-budget">Budżet</label><input id="mu-calc-budget" type="text" ' +
          'placeholder="np. 6g" value="' + U.escapeHtml(calc.budget) + '"></div>' +
      '</div>' +
      (calc.group ? '' : '<p class="mu-subtitle">Wybierz <b>grupę</b> przedmiotu – wtedy Przedmioty doliczą +25% ' +
        'składnikom z tej samej grupy.</p>') +
      '<div id="mu-calc-out"></div>';

    body.querySelectorAll('#mu-calc-rar .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { calc.rarity = b.getAttribute('data-v'); saveCalc(); renderCalc(body); });
    });
    body.querySelectorAll('#mu-calc-from .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { calc.from = parseInt(b.getAttribute('data-v'), 10); saveCalc(); renderCalc(body); });
    });
    body.querySelectorAll('#mu-calc-grp .mu-seg').forEach(function (b) {
      b.addEventListener('click', function () { calc.group = b.getAttribute('data-v'); saveCalc(); renderCalc(body); });
    });
    const out = body.querySelector('#mu-calc-out');
    const lvlIn = body.querySelector('#mu-calc-lvl');
    const budIn = body.querySelector('#mu-calc-budget');
    function update() { calc.lvl = lvlIn.value; calc.budget = budIn.value; saveCalc(); out.innerHTML = calcOutHtml(); }
    lvlIn.addEventListener('input', update);
    budIn.addEventListener('input', update);
    update();
  }

  function render(bodyOnly) {
    if (!panel) return;
    if (!bodyOnly) renderBar();
    const body = panel.querySelector('#mu-body');
    if (activeTab === 'tabela') renderTable(body);
    else if (activeTab === 'przedmioty') renderItems(body);
    /* Kalkulator nie zalezy od zebranych danych - raz narysowanego
     * formularza nie przerysowuje ZADNE odswiezenie (takze pelne, np. po
     * otwarciu panelu - konczy sie asynchronicznie i w lokalnym tescie
     * wyrzucalo kursor z pola, gubiac wpisywane cyfry). Rysujemy go tylko,
     * gdy go jeszcze nie ma (wejscie na zakladke). */
    else if (activeTab === 'kalkulator') { if (!body.querySelector('#mu-calc-out')) renderCalc(body); }
    else renderCollect(body);
  }

  return {
    mount: mount, toggle: toggle, refresh: refresh, render: render,
    notifyNewData: notifyNewData, state: state,
    get index() { return index; },
  };
})();
