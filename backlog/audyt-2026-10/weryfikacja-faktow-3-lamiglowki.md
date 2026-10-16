# Fact-check łamigłówek — audyt 2026-10 (część 3)

Zakres: dwie nowe paczki z grupy `lamiglowki`, sprawdzone w całości:
- `data/quiz-rebusy.json`: 80 rebusów, w tym 30 z opcjami ABCD i 30 z polem `fun`,
- `data/quiz-jedna-litera.json`: 40 drabinek, czyli 120 opisów, z czego 14 ma pole `fun`.

W rebusach sprawdzono, czy da się je rozwiązać i czy odpowiedź jest jedna przy danej podpowiedzi kategorii, czy podpowiedź (rok, dekada, gatunek, kraj) jest prawdziwa i czy któryś dystraktor ABCD też nie jest poprawny. W drabinkach sprawdzono, czy każdy opis jest prawdziwy i wskazuje dokładnie jedno słowo, oraz czy aliasy nie zaliczają złych odpowiedzi. W obu paczkach sprawdzono też pola `fun` (prawdziwość i brak cytatów z tekstów) oraz `track`/`tracks`.

WebSearch użyto dwa razy, dla dat dwóch piosenek 2 plus 1. Wyszło, że „Iść w stronę słońca” to 1981 r., a „Windą do nieba” to 1977 r.

Po poprawkach:
- `node test/lint-data.js --strict --summary` daje 0 BŁĘDÓW. Obie paczki mają 0 ostrzeżeń, a reguły J1 i R1 dają 0/0.
- `node test/data.js` przechodzi (23595/23595).
- `node tools/verify-tracks.mjs` dla obu paczek: rebusy 80/80, jedna-litera 99/99, 0 nierozwiązanych. Pól `track`/`tracks` nie zmieniano.

Zmiany są tylko w `data/`, nic nie zostało scommitowane.

## Poprawki

| plik#indeks | problem | poprawka | pewność |
|---|---|---|---|
| rebusy#67 | [podpowiedź] „Iść w stronę słońca” (2 plus 1) to piosenka z 1981 r., a podpowiedź mówiła „lata 70.” | „polski przebój lat 80.” | wysoka |
| rebusy#10 | [fun] Tekst „Rocket Man” jako inspirowany opowiadaniem Bradbury'ego jest niepewny. Źródła wskazują też na piosenkę Toma Rappa jako pośrednią inspirację | zamieniono na pewny fakt: album „Honky Château” (1972), tekst Bernie Taupin | średnia |
| jedna-litera#34 | [fun] Wyrażenie „dzień, w którym umarła muzyka” pochodzi z tekstu „American Pie”, więc łamie zakaz cytowania tekstów | zastąpiono faktem: zginął razem z Ritchiem Valensem i The Big Bopperem | wysoka |
| jedna-litera#24 | [opis] „małe bębenki grane dłońmi (w l. poj.)” to sprzeczna konstrukcja, a polska forma brzmi „bongos”/„bongosy”, nie „bongo” | „„___ drums” — para małych bębenków grana dłońmi (ang.)” | wysoka |
| jedna-litera#26 | [opis] Singiel „Jump” Van Halen ukazał się w grudniu 1983 r., więc „przebój z 1984 r.” jest nieprecyzyjne | „przebój Van Halen z albumu „1984”, z syntezatorowym riffem” | wysoka |
| jedna-litera#5 | [alias] Opis prosi o słowo „po angielsku”, a alias „róg” zaliczał odpowiedź po polsku | usunięto alias „róg” (zostały „Horn” i „French horn”) | średnia |
| jedna-litera#3 | [opis] „długoletniej wokalistki zespołu Łzy”: lata jej udziału w zespole są niepewne | „byłej wokalistki zespołu Łzy” | średnia |

## Sprawdzone bez zmian (uwagi)

- **rebusy#69, „Kolorowe jarmarki”**: track to `Kozak System`, czyli w iTunes wersja „feat. Maryla Rodowicz”. Oryginał Rodowicz nie rozwiązuje się w iTunes PL, a w tej wersji śpiewa Rodowicz, więc ją zostawiono.
- **jedna-litera#3**: track „Agnieszka już dawno...” to `Anna Wyszkoni`. To jej nagranie solowe tej piosenki Łez, więc pasuje do rozwiązania „Ania” i zostało.
- **rebusy#52, „Ale jazz!”**: rozwiązuje się do wersji „(na jazzowo)” sanah. Tytuł się zgadza.
- **rebusy#30**: dystraktory „Rock Me Amadeus” i „Der Kommissar” to piosenki Austriaka Falco, a podpowiedź mówi „niemiecki hit”. Nie są jednak poprawną odpowiedzią na rebus 🎈, więc zostały.
- **jedna-litera#33**: próba dopisania „Katy Perry” do opisu dała ostrzeżenie o wycieku odpowiedzi, bo „Perry” to rozwiązanie #27. Zostawiono oryginał, bo „Prism” (2013) i tak wskazuje jednoznacznie.
- **jedna-litera#20**: „Drive” zaśpiewał Benjamin Orr, ale opis mówi „zespół Rica Ocaska”, co jest prawdą. Bez zmian.
- **Pozostałe fakty (zgodne)**: wszystkie podpowiedzi dekad i lat w pozostałych 79 rebusach oraz wszystkie `fun`, m.in. MTV 1.08.1981, „Last Christmas” na 1. miejscu UK w 2021 r., „Baby Shark” z 10 mld wyświetleń w 2022 r., instalacja z „Africa” w Namibii w 2019 r., „Mbube” z 1939 r., Montreux i Zappa w 1971 r., Grammy dla Creed w 2001 r., orkiestra USC w „Tusk”, Live Aid na Wembley i w Filadelfii.
- **Dystraktory ABCD**: żaden nie jest drugą poprawną odpowiedzią.
- **Rebusy otwarte**: przy podanej podpowiedzi żaden nie pasuje równie dobrze do innego popularnego hitu.

## Statystyka

- Sprawdzone: 80 rebusów i 40 drabinek (120 opisów), razem 120 pytań, w tym 44 pola `fun` i 179 utworów `track`/`tracks`.
- Pytania z poprawkami: 7 (2 rebusy i 5 drabinek).
- Według typu:
  - podpowiedź/opis: 4
  - fun: 2
  - alias: 1
  - track: 0
  - usunięte lub zastąpione pytania: 0
- Pewność: wysoka 4, średnia 3.
- Liczba pytań i format zostały zachowane. Lint J1/R1 daje 0/0.
