/* ------------------------------------------------------------------ *
 * MU.themes - trzy motywy wygladu panelu (wybor uzytkownika): Nocny
 * blekit (domyslny), Arkana, Otchlan. Reguly nadpisuja tokeny --mu-* z CSS
 * w MU.ui i dodaja wlasny wyglad naglowka/zakladek okna. Motyw wybiera
 * atrybut data-mu-theme na oknie panelu (zakladka Zbieranie -> Wyglad).
 * Czcionki Cinzel i Metamorphous (licencja OFL) z Google Fonts - gdy gra
 * ich nie wpusci, zostaja zapasowe czcionki szeryfowe.
 * Wygenerowane z lokalnego podgladu motywow - reguly edytuj tutaj.
 * ------------------------------------------------------------------ */
MU.themes = {
  /* desc/swatch - karta w zakladce Motywy (opis i probka kolorow). */
  LIST: [
    { id: 'nocny', label: 'Nocny błękit', desc: 'Granat z błękitną poświatą – nowoczesny i czytelny.',
      swatch: ['#0c111a', '#172030', '#5cb8ff', '#4fe3b0'] },
    { id: 'arkana', label: 'Arkana', desc: 'Złote ramki, turkusowe runy, ozdobne wersaliki.',
      swatch: ['#010a13', '#785a28', '#c8aa6e', '#0ac8b9'] },
    { id: 'otchlan', label: 'Otchłań', desc: 'Kamień, żelazo i krwawy żar.',
      swatch: ['#0b0908', '#3a3129', '#c7b377', '#a3221a'] },
  ],
  IMPORT: "@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Metamorphous&display=swap');\n",
  CSS: `
.mu-window[data-mu-theme="nocny"]{--mu-bg:#0c111a;--mu-s1:#121926;--mu-s2:#172030;--mu-s3:#1d2839;
  --mu-line:#1c2533;--mu-line2:#2a3647;--mu-tx:#e8eef6;--mu-tx2:#9fb0c3;--mu-tx3:#66778b;
  --mu-gold:#5cb8ff;--mu-gold-d:#3d8ed6;--mu-gold-hi:#9fd6ff;--mu-gold-bg:rgba(92,184,255,.08);--mu-gold-line:rgba(92,184,255,.28);
  --mu-green:#4fe3b0;--mu-green-bg:rgba(79,227,176,.07);--mu-r:10px;
  background:radial-gradient(120% 55% at 50% -12%,rgba(92,184,255,.13),transparent 62%),#0c111a;
  border:1px solid #223047;border-radius:16px;
  box-shadow:0 0 0 1px rgba(0,0,0,.6),0 24px 60px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.05)}
.mu-window[data-mu-theme="nocny"] .mu-body,.mu-window[data-mu-theme="nocny"] .mu-bar{background:transparent}
.mu-window[data-mu-theme="nocny"] .mu-body{font-family:"Segoe UI",system-ui,sans-serif}
.mu-window[data-mu-theme="nocny"] .mu-body::-webkit-scrollbar-thumb{background:#24324a}
.mu-window[data-mu-theme="nocny"] .header-label-positioner{background:transparent;border-bottom:none;height:40px}
.mu-window[data-mu-theme="nocny"] .header-label .text{align-items:center;font:700 14px "Segoe UI",system-ui,sans-serif;
  color:#e8eef6;letter-spacing:.01em;padding-top:10px}
.mu-window[data-mu-theme="nocny"] .header-label .text::before{content:'\\25B2';display:inline-flex;align-items:center;
  justify-content:center;width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#5cb8ff,#4fe3b0);
  color:#07121c;font-size:9px;box-shadow:0 2px 10px rgba(92,184,255,.35)}
.mu-window[data-mu-theme="nocny"] .header-label .text::after{content:'kalkulator ulepszeń';font:400 11px "Segoe UI",system-ui,sans-serif;color:#66778b}
.mu-window[data-mu-theme="nocny"] .cards-header-wrapper.tabs-nav{margin:2px 10px 10px;padding:3px;gap:2px;background:#101722;
  border:1px solid #1c2533;border-radius:12px}
.mu-window[data-mu-theme="nocny"] .cards-header-wrapper .card{background:transparent;border:none;border-radius:9px;color:#9fb0c3;
  font:600 12px "Segoe UI",system-ui,sans-serif;padding:7px 4px;transition:color .15s ease,background .15s ease}
.mu-window[data-mu-theme="nocny"] .cards-header-wrapper .card:hover{color:#e8eef6;background:rgba(255,255,255,.03)}
.mu-window[data-mu-theme="nocny"] .cards-header-wrapper .card.active{background:linear-gradient(#24385a,#1b2b45);color:#fff;
  box-shadow:inset 0 0 0 1px rgba(92,184,255,.4),0 4px 14px rgba(92,184,255,.16)}
.mu-window[data-mu-theme="nocny"] .mu-bar{border-bottom:1px solid #1c2533}
.mu-window[data-mu-theme="nocny"] .mu-seg-row{background:#0f1520;border:1px solid #1c2533;border-radius:10px;padding:2px}
.mu-window[data-mu-theme="nocny"] .mu-seg{border-radius:8px;color:#8394a8}
.mu-window[data-mu-theme="nocny"] .mu-seg:hover{background:rgba(255,255,255,.04);color:#e8eef6}
.mu-window[data-mu-theme="nocny"] .mu-seg.mu-active{background:linear-gradient(#24385a,#1b2b45);color:#fff;box-shadow:inset 0 0 0 1px rgba(92,184,255,.4)}
.mu-window[data-mu-theme="nocny"] .mu-calc-grid input{background:#0f1520;border:1px solid #26324a;border-radius:9px;height:30px}
.mu-window[data-mu-theme="nocny"] .mu-calc-grid input:focus{border-color:#5cb8ff;box-shadow:0 0 0 3px rgba(92,184,255,.18)}
.mu-window[data-mu-theme="nocny"] .mu-tile{background:linear-gradient(180deg,#16223a,#111a28);border:1px solid #1f2b3d;border-radius:14px;
  padding:10px 12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.mu-window[data-mu-theme="nocny"] .mu-tile-lbl{letter-spacing:.08em}
.mu-window[data-mu-theme="nocny"] .mu-tile-val{font:700 24px "Segoe UI",system-ui,sans-serif;background:linear-gradient(90deg,#b8e2ff,#5cb8ff);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.mu-window[data-mu-theme="nocny"] .mu-callout{background:linear-gradient(180deg,rgba(92,184,255,.11),rgba(92,184,255,.04));
  border:1px solid rgba(92,184,255,.25);border-radius:14px}
.mu-window[data-mu-theme="nocny"] .mu-callout .mu-callout-val{color:#fff;font-size:18px}
.mu-window[data-mu-theme="nocny"] .mu-callout b{color:#fff}
.mu-window[data-mu-theme="nocny"] .mu-callout.mu-info{background:rgba(159,176,195,.05);border-color:rgba(159,176,195,.2)}
.mu-window[data-mu-theme="nocny"] .mu-callout.mu-info .mu-callout-lbl{color:#9fb0c3}
.mu-window[data-mu-theme="nocny"] .mu-stats-line>span{background:#121926;border-color:#1c2533}
.mu-window[data-mu-theme="nocny"] table.mu-t th{background:rgba(12,17,26,.9);backdrop-filter:blur(6px);border-bottom-color:#1c2533}
.mu-window[data-mu-theme="nocny"] table.mu-t td{border-bottom-color:#151d29}
.mu-window[data-mu-theme="nocny"] table.mu-t tbody tr:hover td{background:rgba(92,184,255,.06)}
.mu-window[data-mu-theme="nocny"] table.mu-t tbody tr.mu-ok td:first-child{box-shadow:inset 3px 0 0 #4fe3b0}
.mu-window[data-mu-theme="nocny"] table.mu-t tbody tr.mu-sel td{background:rgba(92,184,255,.12)}
.mu-window[data-mu-theme="nocny"] table.mu-t tbody tr.mu-sel td:first-child{box-shadow:inset 3px 0 0 #5cb8ff}
.mu-window[data-mu-theme="nocny"] .mu-btn{border-radius:10px;background:#172030;border-color:#26324a}
.mu-window[data-mu-theme="nocny"] .mu-btn:hover{background:#1d2839;border-color:#33425a}
.mu-window[data-mu-theme="nocny"] .mu-icon-btn{border-radius:9px;background:#172030;border-color:#26324a}
.mu-window[data-mu-theme="nocny"] #mu-load-all,.mu-window[data-mu-theme="nocny"] #mu-load-resume{background:linear-gradient(135deg,#5cb8ff,#3d8ed6);
  border:none;color:#07121c;font-weight:700;box-shadow:0 6px 18px rgba(92,184,255,.25)}
.mu-window[data-mu-theme="nocny"] #mu-load-all:hover,.mu-window[data-mu-theme="nocny"] #mu-load-resume:hover{filter:brightness(1.08)}
.mu-window[data-mu-theme="nocny"] .mu-target,.mu-window[data-mu-theme="nocny"] .mu-narrow-note,.mu-window[data-mu-theme="nocny"] .mu-warn{border-radius:12px}
.mu-window[data-mu-theme="nocny"] .mu-target{background:#121926}
.mu-window[data-mu-theme="arkana"]{--mu-bg:#010a13;--mu-s1:#0a1428;--mu-s2:#091428;--mu-s3:#1e2328;
  --mu-line:#1e2328;--mu-line2:#3c3c41;--mu-tx:#f0e6d2;--mu-tx2:#a09b8c;--mu-tx3:#5b5a56;
  --mu-gold:#c8aa6e;--mu-gold-d:#785a28;--mu-gold-hi:#f0e6d2;--mu-gold-bg:rgba(200,170,110,.05);--mu-gold-line:rgba(200,170,110,.35);
  --mu-green:#0ac8b9;--mu-green-bg:rgba(10,200,185,.07);--mu-blue:#0ac8b9;--mu-r:0;
  --mu-font-h:'Cinzel',"Palatino Linotype","Book Antiqua",Georgia,serif;
  background:radial-gradient(100% 40% at 50% 0%,rgba(0,90,130,.2),transparent 70%),linear-gradient(180deg,#091428 0%,#010a13 38%);
  border:2px solid transparent;border-image:linear-gradient(180deg,#c8aa6e 0%,#785a28 55%,#463714 100%) 1;
  box-shadow:0 0 0 1px #010a13,0 0 34px rgba(0,0,0,.85)}
.mu-window[data-mu-theme="arkana"] .mu-body,.mu-window[data-mu-theme="arkana"] .mu-bar{background:transparent}
.mu-window[data-mu-theme="arkana"] .mu-body{font-family:"Segoe UI",Arimo,Arial,sans-serif;color:#f0e6d2}
.mu-window[data-mu-theme="arkana"] .mu-body::-webkit-scrollbar-track{background:#010a13}
.mu-window[data-mu-theme="arkana"] .mu-body::-webkit-scrollbar-thumb{background:linear-gradient(#785a28,#463714);border-radius:0}
.mu-window[data-mu-theme="arkana"] .header-label-positioner{height:42px;background:linear-gradient(#0f1d33,#010a13);
  border-bottom:none;box-shadow:inset 0 -1px 0 #785a28}
.mu-window[data-mu-theme="arkana"] .header-label .text{align-items:center;gap:12px;padding-top:11px;
  font:700 15px var(--mu-font-h);color:#f0e6d2;letter-spacing:.26em;text-transform:uppercase;text-shadow:0 0 12px rgba(200,170,110,.35)}
.mu-window[data-mu-theme="arkana"] .header-label .text::before,
.mu-window[data-mu-theme="arkana"] .header-label .text::after{content:'';width:54px;height:1px;
  background:linear-gradient(90deg,transparent,#c8aa6e);box-shadow:0 0 6px rgba(200,170,110,.5)}
.mu-window[data-mu-theme="arkana"] .header-label .text::after{background:linear-gradient(270deg,transparent,#c8aa6e)}
.mu-window[data-mu-theme="arkana"] .cards-header-wrapper.tabs-nav{background:linear-gradient(#010a13,#050f1c);
  border-bottom:1px solid #463714;padding:0 8px;gap:0}
.mu-window[data-mu-theme="arkana"] .cards-header-wrapper .card{background:none;border:none;border-radius:0;color:#a09b8c;
  font:700 11px var(--mu-font-h);letter-spacing:.12em;text-transform:uppercase;padding:11px 4px 10px;transition:color .15s ease}
.mu-window[data-mu-theme="arkana"] .cards-header-wrapper .card:hover{color:#cdbe91}
.mu-window[data-mu-theme="arkana"] .cards-header-wrapper .card.active{color:#f0e6d2;
  background:radial-gradient(60% 100% at 50% 100%,rgba(200,170,110,.24),transparent 72%);
  box-shadow:inset 0 -2px 0 #c8aa6e;text-shadow:0 0 8px rgba(240,230,210,.35)}
.mu-window[data-mu-theme="arkana"] .mu-bar{border-bottom:1px solid #1e2328}
.mu-window[data-mu-theme="arkana"] .mu-sec,.mu-window[data-mu-theme="arkana"] .mu-seg-lbl,.mu-window[data-mu-theme="arkana"] .mu-tile-lbl,
.mu-window[data-mu-theme="arkana"] .mu-callout .mu-callout-lbl,.mu-window[data-mu-theme="arkana"] table.mu-t th,
.mu-window[data-mu-theme="arkana"] .mu-target summary{font-family:var(--mu-font-h);letter-spacing:.12em}
.mu-window[data-mu-theme="arkana"] .mu-sec{color:#c8aa6e}
.mu-window[data-mu-theme="arkana"] .mu-seg-lbl,.mu-window[data-mu-theme="arkana"] .mu-tile-lbl{color:#a09b8c}
.mu-window[data-mu-theme="arkana"] .mu-seg-row{background:#010a13;border:1px solid #3c3c41;border-radius:0}
.mu-window[data-mu-theme="arkana"] .mu-seg{border-radius:0;color:#a09b8c}
.mu-window[data-mu-theme="arkana"] .mu-seg:hover{background:rgba(200,170,110,.06);color:#cdbe91}
.mu-window[data-mu-theme="arkana"] .mu-seg.mu-active{background:linear-gradient(#1e2328,#0f1519);color:#f0e6d2;
  box-shadow:inset 0 0 0 1px #c8aa6e,0 0 8px rgba(200,170,110,.25)}
.mu-window[data-mu-theme="arkana"] .mu-calc-grid input{background:#010a13;border:1px solid #3c3c41;border-radius:0;color:#f0e6d2}
.mu-window[data-mu-theme="arkana"] .mu-calc-grid input:focus{border-color:#0ac8b9;box-shadow:0 0 8px rgba(10,200,185,.3)}
.mu-window[data-mu-theme="arkana"] .mu-tile{border:1px solid transparent;border-radius:0;padding:10px 14px;
  background:linear-gradient(180deg,#0f1d33,#010a13) padding-box,linear-gradient(180deg,#c8aa6e,#463714) border-box;
  clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}
.mu-window[data-mu-theme="arkana"] .mu-tile-val{font:700 24px var(--mu-font-h);color:#f0e6d2;text-shadow:0 0 10px rgba(200,170,110,.35)}
.mu-window[data-mu-theme="arkana"] .mu-callout{border:1px solid transparent;border-radius:0;
  background:linear-gradient(180deg,rgba(0,90,130,.22),rgba(0,90,130,0) 70%) padding-box,linear-gradient(#010a13,#010a13) padding-box,
  linear-gradient(180deg,#0ac8b9,#005a82) border-box}
.mu-window[data-mu-theme="arkana"] .mu-callout .mu-callout-lbl{color:#0ac8b9}
.mu-window[data-mu-theme="arkana"] .mu-callout .mu-callout-val{font:700 19px var(--mu-font-h);color:#f0e6d2}
.mu-window[data-mu-theme="arkana"] .mu-callout b{color:#f0e6d2}
.mu-window[data-mu-theme="arkana"] .mu-callout .mu-callout-sub{color:#a09b8c}
.mu-window[data-mu-theme="arkana"] .mu-callout-foot{border-top-color:rgba(10,200,185,.25)}
.mu-window[data-mu-theme="arkana"] .mu-callout.mu-info{background:linear-gradient(180deg,rgba(200,170,110,.08),rgba(200,170,110,0) 70%) padding-box,
  linear-gradient(#010a13,#010a13) padding-box,linear-gradient(180deg,#785a28,#463714) border-box}
.mu-window[data-mu-theme="arkana"] .mu-callout.mu-info .mu-callout-lbl{color:#c8aa6e}
.mu-window[data-mu-theme="arkana"] .mu-stats-line>span{background:#010a13;border-color:#3c3c41;border-radius:0}
.mu-window[data-mu-theme="arkana"] table.mu-t th{background:#010a13;color:#a09b8c;border-bottom:1px solid #785a28}
.mu-window[data-mu-theme="arkana"] table.mu-t td{border-bottom-color:#1e2328}
.mu-window[data-mu-theme="arkana"] table.mu-t tbody tr:hover td{background:linear-gradient(90deg,rgba(200,170,110,.1),transparent)}
.mu-window[data-mu-theme="arkana"] table.mu-t td.mu-hi{color:#c8aa6e}
.mu-window[data-mu-theme="arkana"] .mu-btn,.mu-window[data-mu-theme="arkana"] .mu-icon-btn{border:2px solid transparent;border-radius:0;color:#cdbe91;
  background:linear-gradient(#1e2328,#1e2328) padding-box,linear-gradient(180deg,#c8aa6e,#785a28) border-box}
.mu-window[data-mu-theme="arkana"] .mu-btn{font:700 11px var(--mu-font-h);letter-spacing:.08em;text-transform:uppercase}
.mu-window[data-mu-theme="arkana"] .mu-btn:hover,.mu-window[data-mu-theme="arkana"] .mu-icon-btn:hover{color:#f0e6d2;
  background:linear-gradient(#262d34,#1e2328) padding-box,linear-gradient(180deg,#f0e6d2,#c8aa6e) border-box;
  box-shadow:0 0 10px rgba(200,170,110,.3)}
.mu-window[data-mu-theme="arkana"] #mu-load-all,.mu-window[data-mu-theme="arkana"] #mu-load-resume{height:34px;padding:0 22px;border:2px solid transparent;
  color:#cdfafa;text-shadow:0 0 8px rgba(10,200,185,.6);font:700 12px var(--mu-font-h);letter-spacing:.12em;
  background:linear-gradient(180deg,#0a323c,#091428) padding-box,linear-gradient(180deg,#0ac8b9,#005a82) border-box;
  clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,10px 100%,0 50%)}
.mu-window[data-mu-theme="arkana"] #mu-load-all:hover,.mu-window[data-mu-theme="arkana"] #mu-load-resume:hover{filter:brightness(1.15);
  background:linear-gradient(180deg,#0d4452,#0a1c30) padding-box,linear-gradient(180deg,#cdfafa,#0ac8b9) border-box}
.mu-window[data-mu-theme="arkana"] .mu-target{background:#0a1428;border-color:#3c3c41;border-radius:0}
.mu-window[data-mu-theme="arkana"] .mu-target summary{color:#c8aa6e}
.mu-window[data-mu-theme="arkana"] .mu-narrow-note,.mu-window[data-mu-theme="arkana"] .mu-warn{border-radius:0}
.mu-window[data-mu-theme="arkana"] .mu-link{color:#0ac8b9;border-bottom-color:#005a82}
.mu-window[data-mu-theme="arkana"] .mu-goal b{color:#f0e6d2}
.mu-window[data-mu-theme="otchlan"]{--mu-bg:#0b0908;--mu-s1:#15110e;--mu-s2:#1a1512;--mu-s3:#231c17;
  --mu-line:#221b16;--mu-line2:#3a3129;--mu-tx:#d8d0c0;--mu-tx2:#9a8c78;--mu-tx3:#6f6353;
  --mu-gold:#c7b377;--mu-gold-d:#7a6340;--mu-gold-hi:#e6cf8f;--mu-gold-bg:rgba(199,179,119,.05);--mu-gold-line:rgba(122,99,64,.45);
  --mu-green:#7cc35e;--mu-green-bg:rgba(124,195,94,.07);--mu-red:#d23a2a;--mu-r:2px;
  --mu-font-h:'Metamorphous',"Book Antiqua","Palatino Linotype",Georgia,serif;
  --mu-noise:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .07 0 0 0 0 .055 0 0 0 0 .045 0 0 0 .7 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background:var(--mu-noise),radial-gradient(80% 40% at 50% 0%,rgba(150,20,10,.24),transparent 70%),linear-gradient(#15100d,#0a0807);
  border:1px solid #000;
  box-shadow:0 0 0 1px #3a3129,0 0 0 3px #0d0b09,0 0 0 4px #5e4b30,0 0 0 5px #000,inset 0 0 60px rgba(0,0,0,.85),0 24px 60px rgba(0,0,0,.85)}
.mu-window[data-mu-theme="otchlan"]::before{content:'';position:absolute;top:-6px;left:50%;width:10px;height:10px;z-index:5;
  transform:translateX(-50%) rotate(45deg);border:1px solid #5e4b30;pointer-events:none;
  background:radial-gradient(circle at 35% 35%,#ff7a5c,#a3221a 55%,#3d0806);box-shadow:0 0 12px rgba(230,50,25,.8)}
.mu-window[data-mu-theme="otchlan"] .mu-body,.mu-window[data-mu-theme="otchlan"] .mu-bar{background:transparent}
.mu-window[data-mu-theme="otchlan"] .mu-body{font-family:"Book Antiqua","Palatino Linotype",Georgia,serif;color:#d8d0c0}
.mu-window[data-mu-theme="otchlan"] table.mu-t,.mu-window[data-mu-theme="otchlan"] .mu-calc-grid input,
.mu-window[data-mu-theme="otchlan"] .mu-stats-line{font-family:Arimo,Arial,sans-serif}
.mu-window[data-mu-theme="otchlan"] .mu-body::-webkit-scrollbar-track{background:#0a0807}
.mu-window[data-mu-theme="otchlan"] .mu-body::-webkit-scrollbar-thumb{background:linear-gradient(90deg,#2b2622,#4a4038,#2b2622);border-radius:1px}
.mu-window[data-mu-theme="otchlan"] .header-label-positioner{height:44px;background:var(--mu-noise),linear-gradient(#2a1712,#120a08);
  border-bottom:1px solid #000;box-shadow:inset 0 -1px 0 #5e4b30,inset 0 1px 0 rgba(255,200,150,.06)}
.mu-window[data-mu-theme="otchlan"] .header-label .text{align-items:center;gap:12px;padding-top:11px;
  font:400 18px var(--mu-font-h);color:#c7b377;letter-spacing:.16em;text-transform:uppercase;
  text-shadow:0 0 14px rgba(210,40,20,.65),0 2px 0 #000}
.mu-window[data-mu-theme="otchlan"] .header-label .text::before,
.mu-window[data-mu-theme="otchlan"] .header-label .text::after{content:'';width:56px;height:2px;
  background:linear-gradient(90deg,transparent,#7a6340 70%,#c7b377);box-shadow:0 1px 0 #000}
.mu-window[data-mu-theme="otchlan"] .header-label .text::after{background:linear-gradient(270deg,transparent,#7a6340 70%,#c7b377)}
.mu-window[data-mu-theme="otchlan"] .cards-header-wrapper.tabs-nav{background:linear-gradient(#0f0b09,#0a0807);border-bottom:1px solid #000;
  box-shadow:inset 0 -1px 0 #3a3129;padding:6px 8px 0;gap:4px}
.mu-window[data-mu-theme="otchlan"] .cards-header-wrapper .card{background:var(--mu-noise),linear-gradient(#2a241f,#171310);
  border:1px solid #000;border-bottom:none;border-radius:2px 2px 0 0;color:#8c7f6c;font:400 12px var(--mu-font-h);letter-spacing:.06em;
  padding:8px 4px 7px;box-shadow:inset 0 1px 0 rgba(255,230,200,.08),inset 0 0 0 1px #3a3129}
.mu-window[data-mu-theme="otchlan"] .cards-header-wrapper .card:hover{color:#d8d0c0}
.mu-window[data-mu-theme="otchlan"] .cards-header-wrapper .card.active{background:var(--mu-noise),linear-gradient(#3b1712,#1c0c09);
  color:#e6cf8f;text-shadow:0 0 8px rgba(230,120,60,.45);
  box-shadow:inset 0 1px 0 rgba(255,120,90,.25),inset 0 0 0 1px #6b2a1a,0 -2px 12px rgba(200,30,20,.28)}
.mu-window[data-mu-theme="otchlan"] .mu-bar{border-bottom:1px solid #000;box-shadow:0 1px 0 #2b2622}
.mu-window[data-mu-theme="otchlan"] .mu-sec,.mu-window[data-mu-theme="otchlan"] .mu-seg-lbl,.mu-window[data-mu-theme="otchlan"] .mu-tile-lbl,
.mu-window[data-mu-theme="otchlan"] .mu-callout .mu-callout-lbl,.mu-window[data-mu-theme="otchlan"] table.mu-t th,
.mu-window[data-mu-theme="otchlan"] .mu-target summary{font-family:var(--mu-font-h);letter-spacing:.08em}
.mu-window[data-mu-theme="otchlan"] .mu-sec{color:#c7b377;text-shadow:0 0 8px rgba(210,40,20,.35)}
.mu-window[data-mu-theme="otchlan"] .mu-seg-lbl,.mu-window[data-mu-theme="otchlan"] .mu-tile-lbl{color:#8c7f6c}
.mu-window[data-mu-theme="otchlan"] .mu-seg-row{background:#0a0807;border:1px solid #000;border-radius:2px;
  box-shadow:inset 0 0 0 1px #2b2622,inset 0 2px 4px rgba(0,0,0,.8)}
.mu-window[data-mu-theme="otchlan"] .mu-seg{border-radius:1px;color:#8c7f6c;font-family:var(--mu-font-h)}
.mu-window[data-mu-theme="otchlan"] .mu-seg:hover{background:rgba(160,25,15,.12);color:#d8d0c0}
.mu-window[data-mu-theme="otchlan"] .mu-seg.mu-active{background:linear-gradient(#4a1d15,#2a0f0a);color:#e6cf8f;
  box-shadow:inset 0 0 0 1px #7a2a1a,0 0 8px rgba(200,30,20,.3)}
.mu-window[data-mu-theme="otchlan"] .mu-calc-grid input{background:#0a0807;border:1px solid #000;border-radius:1px;color:#d8d0c0;
  box-shadow:inset 0 0 0 1px #2b2622,inset 0 2px 5px rgba(0,0,0,.9)}
.mu-window[data-mu-theme="otchlan"] .mu-calc-grid input:focus{border-color:#000;box-shadow:inset 0 0 0 1px #9e1b14,0 0 10px rgba(200,30,20,.35)}
.mu-window[data-mu-theme="otchlan"] .mu-tile{background:var(--mu-noise),linear-gradient(#1b1512,#0e0b09);border:1px solid #000;border-radius:2px;
  padding:10px 12px;box-shadow:inset 0 0 0 1px #3a3129,inset 0 0 0 2px #0d0b09,inset 0 0 0 3px rgba(122,99,64,.35),inset 0 10px 24px rgba(0,0,0,.6)}
.mu-window[data-mu-theme="otchlan"] .mu-tile-val{font:400 25px var(--mu-font-h);color:#e6cf8f;text-shadow:0 0 12px rgba(220,60,30,.4),0 2px 0 #000}
.mu-window[data-mu-theme="otchlan"] .mu-callout{background:rgba(8,6,5,.94);border:1px solid #000;border-radius:2px;
  box-shadow:inset 0 0 0 1px #5e4b30,inset 0 0 0 2px #0d0b09,inset 0 0 30px rgba(120,15,8,.18)}
.mu-window[data-mu-theme="otchlan"] .mu-callout .mu-callout-lbl{color:#c7b377;text-shadow:0 0 8px rgba(210,40,20,.4)}
.mu-window[data-mu-theme="otchlan"] .mu-callout .mu-callout-val{font:400 20px var(--mu-font-h);color:#e6cf8f;text-shadow:0 1px 0 #000}
.mu-window[data-mu-theme="otchlan"] .mu-callout b{color:#e6cf8f}
.mu-window[data-mu-theme="otchlan"] .mu-callout .mu-callout-sub{color:#9a8c78}
.mu-window[data-mu-theme="otchlan"] .mu-callout-foot{border-top-color:rgba(122,99,64,.45)}
.mu-window[data-mu-theme="otchlan"] .mu-callout.mu-info .mu-callout-lbl{color:#9a8c78;text-shadow:none}
.mu-window[data-mu-theme="otchlan"] .mu-stats-line>span{background:#0e0b09;border-color:#2b2622;border-radius:2px}
.mu-window[data-mu-theme="otchlan"] table.mu-t th{background:#0c0908;color:#8c7f6c;border-bottom:1px solid #5e4b30}
.mu-window[data-mu-theme="otchlan"] table.mu-t td{border-bottom-color:#1c1714}
.mu-window[data-mu-theme="otchlan"] table.mu-t td.mu-hi{color:#e6cf8f}
.mu-window[data-mu-theme="otchlan"] table.mu-t tbody tr:hover td{background:linear-gradient(90deg,rgba(160,25,15,.2),transparent 80%)}
.mu-window[data-mu-theme="otchlan"] .mu-btn,.mu-window[data-mu-theme="otchlan"] .mu-icon-btn{background:var(--mu-noise),linear-gradient(#3a332d,#1f1a16);
  border:1px solid #000;border-radius:2px;color:#c7b377;
  box-shadow:inset 0 1px 0 rgba(255,230,200,.12),inset 0 0 0 1px #4a4038,inset 0 -2px 0 rgba(0,0,0,.5)}
.mu-window[data-mu-theme="otchlan"] .mu-btn{font:400 12px var(--mu-font-h);letter-spacing:.05em}
.mu-window[data-mu-theme="otchlan"] .mu-btn:hover,.mu-window[data-mu-theme="otchlan"] .mu-icon-btn:hover{filter:brightness(1.18)}
.mu-window[data-mu-theme="otchlan"] #mu-load-all,.mu-window[data-mu-theme="otchlan"] #mu-load-resume{height:34px;padding:0 18px;
  background:var(--mu-noise),linear-gradient(#a3221a,#5c0e09);border:1px solid #000;color:#fbe6c8;font:400 13px var(--mu-font-h);letter-spacing:.06em;
  text-shadow:0 1px 0 #000,0 0 8px rgba(255,120,60,.5);
  box-shadow:inset 0 1px 0 rgba(255,160,130,.35),inset 0 0 0 1px #c23a2a,inset 0 -3px 0 rgba(0,0,0,.4),0 0 16px rgba(200,30,20,.45)}
.mu-window[data-mu-theme="otchlan"] #mu-load-all:hover,.mu-window[data-mu-theme="otchlan"] #mu-load-resume:hover{filter:brightness(1.12);
  box-shadow:inset 0 1px 0 rgba(255,160,130,.45),inset 0 0 0 1px #e0553f,inset 0 -3px 0 rgba(0,0,0,.4),0 0 24px rgba(230,40,20,.6)}
.mu-window[data-mu-theme="otchlan"] .mu-target{background:#0e0b09;border:1px solid #000;border-radius:2px;box-shadow:inset 0 0 0 1px #2b2622}
.mu-window[data-mu-theme="otchlan"] .mu-target summary{color:#8c7f6c}
.mu-window[data-mu-theme="otchlan"] .mu-narrow-note,.mu-window[data-mu-theme="otchlan"] .mu-warn{border-radius:2px}
.mu-window[data-mu-theme="otchlan"] .mu-link{color:#c7b377;border-bottom-color:#7a6340}
.mu-window[data-mu-theme="otchlan"] .mu-goal b{color:#d8d0c0}
.mu-window[data-mu-theme="nocny"] .mu-sec{display:flex;align-items:center;gap:10px;color:#5cb8ff;letter-spacing:.1em}
.mu-window[data-mu-theme="nocny"] .mu-sec::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#26324a,transparent)}
.mu-window[data-mu-theme="nocny"] .mu-warn{background:rgba(255,184,77,.07);border-color:rgba(255,184,77,.25);color:#f0c98a}
.mu-window[data-mu-theme="nocny"] .mu-narrow-note{border-color:rgba(79,227,176,.3)}
.mu-window[data-mu-theme="nocny"] table.mu-t td{padding:6px 5px}
.mu-window[data-mu-theme="nocny"] table.mu-t tbody tr.mu-ok:hover td{background:rgba(79,227,176,.12)}
.mu-window[data-mu-theme="nocny"] table.mu-t th.mu-sorted{color:#9fd6ff;box-shadow:inset 0 -2px 0 #5cb8ff}
.mu-window[data-mu-theme="nocny"] .mu-conf i,.mu-window[data-mu-theme="nocny"] .mu-progress{background:#1c2533}
.mu-window[data-mu-theme="nocny"] .mu-conf i b{background:linear-gradient(90deg,#3d8ed6,#4fe3b0)}
.mu-window[data-mu-theme="nocny"] .mu-progress i{background:linear-gradient(90deg,#3d8ed6,#5cb8ff)}
.mu-window[data-mu-theme="nocny"] tr.mu-empty-row td{color:#2a3647}
.mu-window[data-mu-theme="nocny"] tr.mu-empty-row td:first-child{color:#66778b}
.mu-window[data-mu-theme="nocny"] .mu-target summary{color:#9fb0c3}
.mu-window[data-mu-theme="nocny"] .mu-calc-line b,.mu-window[data-mu-theme="nocny"] .mu-empty b{color:#fff}
.mu-window[data-mu-theme="arkana"] .mu-sec{display:flex;align-items:center;gap:10px}
.mu-window[data-mu-theme="arkana"] .mu-sec::before{content:'\\25C6';font-size:7px;color:#c8aa6e}
.mu-window[data-mu-theme="arkana"] .mu-sec::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#785a28,transparent)}
.mu-window[data-mu-theme="arkana"] .mu-warn{background:rgba(200,170,110,.06);border:1px solid #785a28;border-radius:0;color:#cdbe91}
.mu-window[data-mu-theme="arkana"] .mu-narrow-note{background:rgba(10,200,185,.07);border:1px solid #0a6e68;color:#f0e6d2}
.mu-window[data-mu-theme="arkana"] table.mu-t tbody tr.mu-ok td:first-child{box-shadow:inset 3px 0 0 #0ac8b9}
.mu-window[data-mu-theme="arkana"] table.mu-t tbody tr.mu-ok:hover td{background:rgba(10,200,185,.12)}
.mu-window[data-mu-theme="arkana"] table.mu-t tbody tr.mu-sel td{background:rgba(200,170,110,.12)}
.mu-window[data-mu-theme="arkana"] table.mu-t tbody tr.mu-sel td:first-child{box-shadow:inset 3px 0 0 #c8aa6e}
.mu-window[data-mu-theme="arkana"] table.mu-t th.mu-sorted{color:#f0e6d2;box-shadow:inset 0 -2px 0 #c8aa6e}
.mu-window[data-mu-theme="arkana"] .mu-conf i,.mu-window[data-mu-theme="arkana"] .mu-progress{background:#1e2328;border-radius:0}
.mu-window[data-mu-theme="arkana"] .mu-conf i b{background:linear-gradient(90deg,#005a82,#0ac8b9)}
.mu-window[data-mu-theme="arkana"] .mu-progress i{background:linear-gradient(90deg,#785a28,#c8aa6e)}
.mu-window[data-mu-theme="arkana"] tr.mu-empty-row td{color:#2a2f35}
.mu-window[data-mu-theme="arkana"] tr.mu-empty-row td:first-child{color:#5b5a56}
.mu-window[data-mu-theme="arkana"] .mu-calc-line b{color:#f0e6d2}
.mu-window[data-mu-theme="arkana"] .mu-empty b{color:#c8aa6e}
.mu-window[data-mu-theme="otchlan"] .mu-sec{display:flex;align-items:center;gap:10px}
.mu-window[data-mu-theme="otchlan"] .mu-sec::after{content:'';flex:1;height:2px;background:linear-gradient(90deg,#7a6340,transparent);box-shadow:0 1px 0 #000}
.mu-window[data-mu-theme="otchlan"] .mu-warn{background:rgba(140,20,10,.14);border:1px solid #5a2a1a;border-radius:2px;color:#d9b38a;
  box-shadow:inset 0 0 0 1px #0d0b09}
.mu-window[data-mu-theme="otchlan"] .mu-narrow-note{background:rgba(124,195,94,.07);border:1px solid #3f5a2a;color:#d8d0c0}
.mu-window[data-mu-theme="otchlan"] table.mu-t tbody tr.mu-ok:hover td{background:rgba(124,195,94,.13)}
.mu-window[data-mu-theme="otchlan"] table.mu-t tbody tr.mu-sel td{background:rgba(199,179,119,.12)}
.mu-window[data-mu-theme="otchlan"] table.mu-t tbody tr.mu-sel td:first-child{box-shadow:inset 3px 0 0 #c7b377}
.mu-window[data-mu-theme="otchlan"] table.mu-t th.mu-sorted{color:#e6cf8f;box-shadow:inset 0 -2px 0 #9e1b14}
.mu-window[data-mu-theme="otchlan"] .mu-conf i,.mu-window[data-mu-theme="otchlan"] .mu-progress{background:#1c1714;border-radius:1px;box-shadow:inset 0 1px 2px #000}
.mu-window[data-mu-theme="otchlan"] .mu-conf i b{background:linear-gradient(90deg,#5c0e09,#c23a2a)}
.mu-window[data-mu-theme="otchlan"] .mu-progress i{background:linear-gradient(90deg,#7a6340,#c7b377)}
.mu-window[data-mu-theme="otchlan"] tr.mu-empty-row td{color:#2b2622}
.mu-window[data-mu-theme="otchlan"] tr.mu-empty-row td:first-child{color:#6f6353}
.mu-window[data-mu-theme="otchlan"] .mu-calc-line b{color:#e6cf8f}
.mu-window[data-mu-theme="otchlan"] .mu-empty b,.mu-window[data-mu-theme="otchlan"] .mu-subtitle b{color:#c7b377}
.mu-window[data-mu-theme="arkana"] table.mu-t th,.mu-window[data-mu-theme="otchlan"] table.mu-t th{letter-spacing:.03em;padding:6px 4px}
.mu-window[data-mu-theme] .cards-header-wrapper .card{white-space:nowrap;min-width:0}
.mu-window[data-mu-theme="arkana"] .cards-header-wrapper .card{letter-spacing:.05em;font-size:10px;padding:11px 2px 10px}
.mu-window[data-mu-theme="otchlan"] .cards-header-wrapper .card{font-size:11px;letter-spacing:.02em;padding:8px 2px 7px}
.mu-window[data-mu-theme="nocny"] .cards-header-wrapper .card{font-size:11.5px;padding:7px 2px}
.mu-window[data-mu-theme="arkana"] .mu-theme-card{border-radius:0;background:linear-gradient(180deg,#0f1d33,#010a13);border-color:#3c3c41}
.mu-window[data-mu-theme="arkana"] .mu-theme-card.mu-active{border-color:#c8aa6e;box-shadow:inset 0 0 0 1px #c8aa6e,0 0 12px rgba(200,170,110,.25)}
.mu-window[data-mu-theme="otchlan"] .mu-theme-card{border-radius:2px;background:var(--mu-noise),linear-gradient(#1b1512,#0e0b09);
  border-color:#000;box-shadow:inset 0 0 0 1px #3a3129}
.mu-window[data-mu-theme="otchlan"] .mu-theme-card.mu-active{box-shadow:inset 0 0 0 1px #c7b377,0 0 12px rgba(200,30,20,.3)}
.mu-window[data-mu-theme="nocny"] .mu-theme-card{border-radius:14px;background:linear-gradient(180deg,#16223a,#111a28)}
`,
};
