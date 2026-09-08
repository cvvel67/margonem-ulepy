/* ------------------------------------------------------------------ *
 * MU.main - spiecie calosci.
 * ------------------------------------------------------------------ */
(function () {

  /* Swiat gry - dane trzymamy per swiat, bo ceny na roznych swiatach
   * nie maja ze soba nic wspolnego. */
  function detectWorld() {
    try {
      const m = /^(?:www\.)?([a-z0-9-]+)\.margonem\.(pl|com)$/i.exec(location.hostname);
      if (m && m[1] !== 'www' && m[1] !== 'forum' && m[1] !== 'pomoc') return m[1].toLowerCase();
      if (window.g && window.g.worldname) return String(window.g.worldname).toLowerCase();
      if (window.Engine && window.Engine.worldConfig && window.Engine.worldConfig.getWorldName) {
        return String(window.Engine.worldConfig.getWorldName()).toLowerCase();
      }
    } catch (e) {}
    return null;
  }

  /* Czy jestesmy w kliencie gry, czy na stronie serwisu. Sniffer instalujemy
   * wszedzie (jest tani i pasywny), ale panel tylko w grze. */
  function looksLikeGameClient() {
    return !!(window.g || window.Engine ||
      document.querySelector('#centerbox, #gameContainer, .game-window, #map'));
  }

  function boot() {
    MU.cfg.load();
    const world = detectWorld();
    if (world) {
      MU.cfg.get().world = world;
      MU.cfg.save();
    }

    MU.store.init().then(function (mode) {
      console.log('[Ulepy] magazyn:', mode, '| swiat:', world || 'nieznany');
      MU.lifecycle.attach();
      /* Sprzatanie starych rekordow raz na start - inaczej baza rosnie
       * w nieskonczonosc przez wszystkie sesje. */
      MU.store.purgeOld(MU.cfg.get().stats.retentionDays).then(function (n) {
        if (n) console.log('[Ulepy] usunieto', n, 'przeterminowanych obserwacji');
      });

      if (document.body) mountUi();
      else document.addEventListener('DOMContentLoaded', mountUi);
    });
  }

  function mountUi() {
    if (!looksLikeGameClient()) return;
    MU.ui.mount();
    MU.ui.refresh();
  }

  /* Sniffer musi ruszyc jak najwczesniej - inaczej przegapimy zapytania
   * wykonane przy starcie klienta. Reszta moze poczekac na DOM. */
  MU.sniffer.install();
  boot();

  /* Dostep z konsoli - do recznej inspekcji i debugowania. */
  window.MU = MU;
})();

})();
