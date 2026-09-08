# Ulepy — kalkulator kosztu punktów ulepszenia (Margonem)

Dodatek (userscript) do Margonem, który zbiera realne ceny z domu
aukcyjnego, filtruje anomalie i liczy **koszt za punkt ulepszenia** dla
każdego przedmiotu — czyli co najtaniej opłaca się kupić na składniki do
własnego ulepszania sprzętu.

## Instalacja

1. Zainstaluj rozszerzenie Tampermonkey (Chrome/Firefox/Edge).
2. Otwórz Tampermonkey → "Utwórz nowy skrypt" → wklej całą zawartość
   [`dist/margonem-ulepy.min.user.js`](dist/margonem-ulepy.min.user.js)
   → zapisz (Ctrl+S). Skrypt aktualizuje się sam dzięki `@updateURL` w
   nagłówku, wskazującemu na ten plik w tym repozytorium.
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

Im niżej, tym lepsza okazja. Panel ma trzy zakładki:

- **Tabela** — ranking posortowany po koszcie za punkt, osobno dla
  każdej kombinacji grupa zasobu (Bronie/Pancerze/Biżuteria) × przedział
  poziomowy × rzadkość (Unikat/Heroik), zbudowany z historycznych,
  uśrednionych obserwacji cenowych.
- **Przedmioty** — widok bieżący i **sesyjny**: każda oferta, jaką
  dodatek zaobserwował od załadowania strony (nie tylko z aktualnie
  wybranej w grze kategorii), bez uśredniania, jeden wiersz = jedna
  realna oferta.
- **Zbieranie** — status zbierania danych w tle (ile ofert widziano,
  ile aukcji sprzedano/wygasło, stan pokrycia paginacji).

Opcjonalnie można wskazać **cel ulepszania** (rzadkość i grupę
przedmiotu, który faktycznie ulepszasz, zwijana sekcja "Cel ulepszania"
nad tabelą) — wtedy dodatek dolicza bonusy punktowe za dopasowanie
składnika (patrz niżej), pokazując realny, efektywny koszt zamiast
wartości bazowej.

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
dorówna licznikowi "Ilość aukcji: N" w oknie gry. Automatyczne
doładowanie kolejnych stron bez udziału użytkownika **nie jest możliwe**
(przeglądarka blokuje syntetyczne zdarzenia scroll/wheel) — dodatek
trzyma listę podsuniętą blisko dołu, więc wystarczy nawet drobny ruch
kółkiem myszy, żeby doładować kolejną partię. Zakładka **Zbieranie**
pokazuje ten status.

**5. Wykluczenia.** Oferty za walutę premium (SŁ) i oferty wystawione
wyłącznie na licytację (bez opcji "Kup teraz") są całkowicie pomijane —
nie da się ich uczciwie porównać z ceną czysto złotową ani potraktować
jako pewną cenę rynkową.

## Zero automatyzacji gry

Dodatek wyłącznie **czyta** dane już widoczne w interfejsie gry (DOM,
przechwycone odpowiedzi XHR/fetch) — nigdy nie klika, nie licytuje, nie
kupuje i nie wysyła własnych zapytań do serwera gry. Jedyne generowane
przez niego zdarzenia `.click()` dotyczą elementów, które sam stworzył
(pobieranie eksportu CSV/JSON), nigdy elementów gry.

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
```

`build-min.mjs` wymaga jednorazowo `npx terser` (pobierane na żądanie,
nie jest stałą zależnością projektu — `build.mjs` działa bez niczego).
