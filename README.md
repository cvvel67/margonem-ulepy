# Ulepy — kalkulator kosztu punktów ulepszenia (Margonem)

Dodatek (userscript) do Margonem, który zbiera realne ceny z domu
aukcyjnego, filtruje anomalie i liczy **koszt za punkt ulepszenia** dla
każdego przedmiotu — czyli co najtaniej opłaca się kupić na składniki do
własnego ulepszania sprzętu.

## Instalacja

1. Zainstaluj rozszerzenie Tampermonkey (Chrome/Firefox/Edge).
2. Otwórz w przeglądarce
   [ten link](https://raw.githubusercontent.com/cvvel67/margonem-ulepy/main/dist/margonem-ulepy.min.user.js)
   — Tampermonkey sam pokaże ekran instalacji, wystarczy potwierdzić.
   Skrypt aktualizuje się sam dzięki `@updateURL` w nagłówku.
3. Wejdź na margonem.pl, zaloguj się do gry. Obok natywnego paska ikon w
   prawym górnym rogu ekranu pojawi się mały zielony przycisk **U** —
   to włącznik panelu dodatku. Można go swobodnie przeciągnąć w inne
   miejsce (pozycja zapamiętuje się automatycznie), tak samo jak samo
   okno za jego pasek tytułowy.

## Co dodatek liczy

**Nie** projektuje ceny sprzedaży po ulepszeniu i nie zakłada odsprzedaży
— punkty ulepszenia służą do ulepszania własnego sprzętu, więc jedyna
sensowna miara opłacalności to:

```
koszt_za_punkt = cena_z_aukcji / efektywne_punkty_z_poświęcenia
```

Im niżej, tym lepsza okazja. Panel ma cztery zakładki:

- **Przedmioty** — widok bieżący i **sesyjny**: każda oferta, jaką
  dodatek zaobserwował od załadowania strony (nie tylko z aktualnie
  wybranej w grze kategorii), bez uśredniania, jeden wiersz = jedna
  realna oferta. Koszt za punkt liczony jest z bonusami względem tego,
  co ustawisz w Kalkulatorze, a oferty mieszczące się w budżecie są
  podświetlone na zielono.
- **Kalkulator** — wpisujesz rzadkość, grupę, poziom i obecne ulepszenie
  przedmiotu, który chcesz wbić na +5, oraz budżet (np. „6g”, „500m”).
  Dostajesz liczbę potrzebnych punktów i maksymalną cenę za punkt, przy
  której zmieścisz się w budżecie — także dla składników z tej samej
  grupy (+25% punktów), a przy ulepszaniu heroika lub unikatu także dla
  składników tej samej rzadkości (+200%, razem z grupą +225%). Podpowiada
  też, ile wpisać w pole **Max. cena**
  w oknie aukcji — droższe oferty i tak się nie opłacą, a z tym filtrem
  gra ich w ogóle nie wysyła, więc ładowanie listy jest dużo krótsze.
  Liczone tylko z punktów, bez opłaty za +5 i bez esencji.
- **Zbieranie** — doładowanie całej listy aukcji (Załaduj wszystkie
  strony, wznawianie po przerwaniu), stan pokrycia listy oraz dane
  (eksport, import, czyszczenie).
- **Średnie ceny** — zbierane w tle średnie ceny z domu aukcyjnego (do
  60 dni, świeższe ważą więcej): dla wybranej grupy (Bronie/Pancerze/
  Biżuteria) i rzadkości (Unikat/Heroik) typowa cena i koszt za punkt
  w każdym przedziale poziomów. To podgląd rynku — do kupowania służy
  zakładka Przedmioty.

**Cel ulepszania** (rzadkość, grupa i poziom przedmiotu, który faktycznie
ulepszasz) ustawiasz w jednym miejscu — w Kalkulatorze; zapamiętuje się
między sesjami. Przedmioty i Średnie ceny doliczają względem niego bonusy
punktowe za dopasowanie składnika (patrz niżej), pokazując realny,
efektywny koszt zamiast wartości bazowej.

## Mechanizm gry (realny, nie przybliżony)

Wzory poniżej pochodzą wprost z poradnika
[forum.margonem.pl "Wiedza o Rzemiośle"](https://forum.margonem.pl/?task=forum&show=posts&id=511370)
(z odwołaniem do oficjalnej Mechaniki Walk, pomoc.margonem.pl/index/view,372
pkt 3.3) i są zaimplementowane dokładnie, bez zaokrągleń "na oko" —
każda stała zweryfikowana przeciw przykładom liczbowym z tego wątku
(patrz `test/run.mjs`).

**Punkty z poświęcenia przedmiotu:**
```
punkty = floor(((180 + poziom) × e) × 0.1)
```
gdzie `e` zależy od rzadkości: zwykły=1, unikat=10, heroik=100,
legenda=1000. Rzadkości **zwykły i legenda są całkowicie wykluczone**
ze zbierania i wyświetlania — dodatek interesuje się wyłącznie unikatami
i heroikami jako składnikami.

**Bonusy za dopasowanie do ulepszanego przedmiotu** (addytywne):
- +25% jeśli składnik jest z tej samej **grupy** co cel (gra rozróżnia
  tylko trzy grupy: bronie / pancerz / biżuteria — węższe kategorie w
  tym dodatku, np. hełm czy buty, mieszczą się w grupie "pancerz")
- +200% jeśli składnik ma tę samą **rzadkość** co cel
- +75% jeśli to dokładnie **ten sam przedmiot** co cel (co razem z
  powyższymi daje +300%, czyli 4×)
- **Zero bonusów**, jeśli sam składnik jest już ulepszony (+1 lub wyżej)
  — to reguła wprost z gry, nie licencja tego dodatku.

**Koszt ulepszenia celu** (informacyjnie, nie wpływa na ranking, bo to
Twój koszt niezależnie od tego, skąd wziąłeś punkty):
```
koszt_stopnia(+k→+k+1) = (180+poziom)×e × [100%,110%,130%,160%,200%][k]
```
plus jednorazowa opłata przy finalizacji +5: złoto = `(10×poziom+1300)×poziom×n`
(n: zwykły=1, unikat=10, heroik=30, legenda=60) oraz
esencje = `(poziom/10+10) × 300%`.

**Ważna korekta względem pierwotnego pomysłu**: koszt ulepszenia **nie
zależy od kategorii przedmiotu** — tylko od poziomu i rzadkości.
Kategoria/grupa wpływa wyłącznie na bonus punktowy przy poświęcaniu
składnika, nie na sam koszt ulepszenia celu.

## Skąd biorą się ceny (metodologia zbierania)

**1. Cena wywoławcza ≠ cena transakcyjna.** Uśrednianie ofert widocznych
na liście systematycznie zawyża wynik — oferty przecenione wiszą
tygodniami i trafiają do próby przy każdym odświeżeniu, sensowne znikają
po godzinach. Dodatek śledzi każdą aukcję po ID i klasyfikuje ją dopiero
gdy zniknie z listy: **sprzedana** (zniknęła przed czasem końca) vs
**wygasła** (dotrwała do końca, nikt nie kupił). Do ceny liczy się tylko
sprzedaż i bieżące oferty ("kup teraz").

**2. Filtr MAD zamiast ucinania 10/10.** Filtr oparty o medianę i
odchylenie bezwzględne (MAD) dopasowuje się do faktycznego rozrzutu
danych, zamiast zakładać z góry, ile jest anomalii. Statystyki liczone
są w przestrzeni logarytmicznej (ceny w grze są log-normalne). Klasyczna
średnia ucinana 10/10 jest liczona równolegle jako wewnętrzna kolumna
porównawcza, ale nigdy nie jest tym, co widzi użytkownik.

**3. Trend.** Ceny ważone są wykładniczo względem wieku, dodatkowo
liczony jest trend (regresja Theila-Sena, odporna na pojedyncze
anomalie).

**4. Paginacja jako warunek bezpiecznego wnioskowania o sprzedaży.**
Okno aukcji dzieli wyniki na strony (~15 pozycji/stronę, potwierdzone
na żywo) — dodatek kumuluje unikalne ID widziane na kolejnych stronach
tego samego filtra i uznaje listę za "pełną" dopiero, gdy pokrycie
dorówna licznikowi "Ilość aukcji: N" w oknie gry. Kolejne strony
doładujesz ręcznie (przewijając listę w grze — dodatek trzyma ją
podsuniętą blisko dołu, więc wystarczy drobny ruch kółkiem) albo
przyciskiem **Załaduj wszystkie strony** w zakładce **Zbieranie**.
Wtedy dodatek prosi grę o kolejne strony dokładnie tej listy, którą
masz otwartą — strona po stronie, bez sztucznej przerwy (tempo wyznacza
kolejka zadań samej gry), i zatrzymuje się przy zmianie filtra,
zamknięciu okna albo braku odpowiedzi. Na czas ładowania wiersze listy
w oknie gry są ukryte (przy tysiącach widocznych wierszy gra z każdą
stroną zwalniała) i wracają po zakończeniu.

**5. Wykluczenia.** Oferty za walutę premium (SŁ) i oferty wystawione
wyłącznie na licytację (bez opcji "Kup teraz") są całkowicie pomijane —
nie da się ich uczciwie porównać z ceną czysto złotową ani potraktować
jako pewną cenę rynkową. Cała zakładka **Inne** domu aukcyjnego
(książki, konsumpcyjne, neutralne, talizmany, torby, leczące, waluty,
teleporty) też nie jest zbierana — to nie sprzęt do ulepszania.
Strzały liczą się jako **Broń** i są zbierane razem z bronią.

## Co dodatek robi w grze, a czego nie

Dodatek nie gra za Ciebie: nigdy nie klika elementów gry, nie licytuje,
nie kupuje i nie wystawia przedmiotów. W tle wyłącznie **czyta** dane
widoczne w interfejsie gry (DOM, przechwycone odpowiedzi XHR/fetch).

Jedyny wyjątek to przycisk **Załaduj wszystkie strony**. Po jego
kliknięciu dodatek wysyła przez własną funkcję gry (`_g`) to samo
zapytanie o kolejną stronę listy aukcji, które gra wysyła sama przy
przewijaniu. Różni się ono wyłącznie numerem strony. Bez kliknięcia nic
nie jest wysyłane. Regulamin gry może formalnie zabraniać wysyłania
zapytań przez skrypty, więc z tej funkcji korzystasz na własną
odpowiedzialność.

## Struktura projektu

```
src/            moduły źródłowe (sklejane w kolejności alfabetycznej)
  00-banner.js      nagłówek Tampermonkey (@name/@match/@updateURL...)
  01-config.js      konfiguracja: przedziały, kategorie+grupy, rzadkości
  02-util.js        formatowanie, PRNG, drobne narzędzia
  03-stats.js       statystyki odporne (MAD, EWMA, Theil-Sen)
  04-storage.js     IndexedDB / fallback localStorage
  05-normalize.js   surowy rekord -> znormalizowana obserwacja
  06-sniffer.js     przechwytywanie danych (DOM skalibrowany + XHR/fetch/global jako zapas)
  07-lifecycle.js   sprzedaż vs wygaśnięcie aukcji, paginacja/pokrycie
  08-upgrade.js     dokładny mechanizm Rzemiosła: punkty, koszty, bonusy
  09-aggregate.js   agregacja + ranking koszt-za-punkt
  10-ui.js          panel wynikowy (natywny styl okien gry)
  11-main.js        spięcie całości
build.mjs       sklejenie src/*.js -> dist/margonem-ulepy.user.js (czytelne)
build-min.mjs   zaciemnienie (terser: mangle+compress) -> dist/margonem-ulepy.min.user.js
test/run.mjs        testy jednostkowe (formuły z poradnika, statystyki, wykluczenia)
test/qa-stress.mjs  testy wytrzymałościowe (duże wolumeny, stany puste, dane brzegowe)
test/verify-min.mjs weryfikacja, że zaciemniony bundle liczy identycznie jak źródło
```

## Rozwój

```bash
node build.mjs           # przebuduj dist/margonem-ulepy.user.js (czytelny)
node build-min.mjs       # przebuduj dist/margonem-ulepy.min.user.js (do publikacji)
node test/run.mjs        # testy jednostkowe
node test/qa-stress.mjs  # testy wytrzymałościowe
node test/verify-min.mjs # weryfikacja zaciemnionego bundla
node dev/serve.mjs       # podgląd UI bez gry: http://localhost:8766 (symulator aukcji: /sim.html)
```

`build-min.mjs` wymaga jednorazowo `npx terser` (pobierane na żądanie,
nie jest stałą zależnością projektu — `build.mjs` działa bez niczego).
