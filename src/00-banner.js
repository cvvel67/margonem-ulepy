// ==UserScript==
// @name         Ulepy — kalkulator opłacalności ulepszania (Margonem)
// @namespace    https://github.com/cvvel67/margonem-ulepy
// @version      1.0.0
// @description  Zbiera ceny z domu aukcyjnego, odsiewa anomalie i liczy, czy opłaca się kupić przedmiot i go ulepszyć.
// @author       cvvel67
// @match        *://*.margonem.pl/*
// @match        *://*.margonem.com/*
// @updateURL    https://raw.githubusercontent.com/cvvel67/margonem-ulepy/main/dist/margonem-ulepy.min.user.js
// @downloadURL  https://raw.githubusercontent.com/cvvel67/margonem-ulepy/main/dist/margonem-ulepy.min.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

/*
 * Struktura:
 *   MU.cfg        - konfiguracja (przedziały lvl, mnożniki kosztu, parametry statystyk)
 *   MU.util       - drobiazgi
 *   MU.store      - trwałe składowanie obserwacji (IndexedDB, fallback localStorage)
 *   MU.sniffer    - przechwytywanie danych aukcyjnych z klienta gry
 *   MU.normalize  - surowy payload -> znormalizowana obserwacja
 *   MU.lifecycle  - śledzenie aukcji w czasie -> wykrywanie faktycznej sprzedaży
 *   MU.stats      - odporne statystyki (log-space, MAD, EWMA, Theil-Sen, bootstrap)
 *   MU.aggregate  - hierarchiczna agregacja ze skurczem (shrinkage)
 *   MU.upgrade    - model kosztu ulepszania i opłacalności
 *   MU.ui         - panel wynikowy
 */
;(function () {
'use strict';
const MU = { version: '1.0.0' };
