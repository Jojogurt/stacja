# Fact-check paczek quizu — runda 2 (audyt 2026-10)

## Zakres

1. `quiz-disney.json`: wszystkie 100 pytań. Poprawki z rundy 1 (disney#15, #20, #24, #92, #95) potraktowałem jako zamknięte.
2. `quiz-literatura.json`, `quiz-sztuka.json`, `quiz-mitologia.json`, `quiz-kosmetyki.json`: wszystkie pytania, razem 400.
3. Pola `fun` w pozostałych 21 paczkach. Odtworzyłem próbę z rundy 1 (`random.Random(nazwa_pliku).sample(range(n), 20)` ∪ difficulty 3 ∪ wszystkie pytania z `fun`) i liczby zgadzają się z kolumną „sprawdzono” w raporcie rundy 1, np. disney 59, kosmos 72, sport 88. Wynika z tego, że **wszystkie pola `fun` w tych paczkach były już sprawdzane w rundzie 1**. Zgodnie z zakresem nie sprawdzałem ich drugi raz, więc w tym punkcie zostaje 0 pól.
4. Duplikaty między paczkami. Linter (`--summary`) nie zgłasza żadnych ostrzeżeń reguły 5, ani przed zmianami, ani po nich. Duplikaty treściowe wyszukałem więc skryptem po identycznej odpowiedzi kanonicznej w różnych paczkach. Oprócz duplikatu zwierzeta#94 / geografia#49 znalazłem jeszcze 4 pary, w których pytanie dotyczy tego samego faktu (opisane niżej).
5. Rozstrzygnięcia z sieci: disney#31 (wróżki ze „Śpiącej Królewny”) i harry-potter#14 (Szafka Zniknięć).

Po zmianach `node test/lint-data.js --summary` daje **0 BŁĘDÓW, 34 OSTRZEŻENIA**, czyli tyle samo co przed zmianami. Nowe pytania nie dodały żadnego ostrzeżenia. `node test/data.js` przechodzi (22355/22355). Zmieniałem tylko pliki w `data/`. Kod został nietknięty, nic nie jest scommitowane. Liczba pytań w każdej paczce się nie zmieniła.

## Poprawki

| plik#indeks | co było źle | poprawka | pewność |
|---|---|---|---|
| disney#31 | [odpowiedź/alias] W polskim dubbingu (1995) wróżki nazywają się **Flora, Hortensja i Niezabudka**. Fauna to Hortensja, a Merryweather to Niezabudka. Imię „Niebianka” nie występuje w dubbingu, a polskich form brakowało w puli | pula: [Flora], [Hortensja, Fauna], [Niezabudka, Merryweather, Pogódka] | wysoka (pl.wikipedia, dubbingpedia: obsada Gładyszewska/Chrobak/Homerska) |
| disney#35 | [fun] „De Mon = demon, celowa gra słów” to nieuzasadniona interpretacja | fun wyjaśnia oryginalne „de Vil” ≈ „devil”, a „De Mon” przedstawia jako polski odpowiednik tej gry słów | średnia |
| disney#85 | [fun] „Edna Mode wzorowana jest na Edith Head”. Pixar tego nie potwierdził, to tylko popularne porównanie | „często porównuje się do…” | wysoka |
| literatura#0 | [fun] Podany „pełny tytuł” był niepełny | pełny tytuł z podtytułem „Historia szlachecka z roku 1811 i 1812 we dwunastu księgach wierszem” | wysoka |
| literatura#3 | [fun] Fun zdradzał odpowiedź na literatura#41 (Norwid jako czwarty wieszcz) | nowy fun: Krypta Wieszczów na Wawelu (Mickiewicz, Słowacki) | wysoka |
| literatura#6 | [treść] „Ginie, wysadzając bastion”. W powieści lont podpala Ketling, a Wołodyjowski ginie w wybuchu zamku | „ginie podczas wysadzenia zamku w Kamieńcu Podolskim” | wysoka |
| literatura#41 | [treść] Błąd składni („Którego poetę, doceniono…”) | „docenionego dopiero po śmierci” | wysoka |
| literatura#46 | [alias] Brak polskiej formy imienia konia z przekładu | dodano alias „Bokser” | średnia |
| literatura#47 | [alias] Brak wariantu z innego przekładu („niewiedza to siła”) | dodano 2 aliasy | średnia |
| literatura#60 | [alias] Pula nie przyjmowała części poprawnych odpowiedzi (inne komedie, polskie warianty tytułów) | dodano „Sen nocy świętojańskiej”, „Komedia pomyłek”, „Dwaj szlachcice z Werony”, „Stracone zachody miłości”, „Wszystko dobre, co się dobrze kończy”, „Miarka za miarkę” | wysoka |
| literatura#69 | [treść] „Choć mówi po francusku” to nielogiczny kontrast, bo Belgowie też mówią po francusku | „często błędnie brany za Francuza” | wysoka |
| literatura#75 | [duplikat] To samo co disney#45 (Andersen jako autor baśni) | nowe pytanie d1: Piętaszek z „Robinsona Crusoe” | wysoka |
| literatura#86 | [fun] „Dwa lata w więzieniu w Reading”. Wilde siedział też w Pentonville i Wandsworth | „dwa lata ciężkich robót, większość w Reading” | wysoka |
| literatura#89 | [dystraktor] Zły polski tytuł „Ze życia owadów” (czeski szyk) i niepewny tytuł „Biała choroba” | dystraktory „Z życia owadów”, „Matka”, „Sprawa Makropulos” | wysoka |
| sztuka#1 | [duplikat] Ten sam fakt co historia-polski#12 (Hołd pruski, Rynek 1525) | nowe pytanie d2 ABCD: „Rejtan – Upadek Polski” | wysoka |
| sztuka#2 | [alias] Alias „Gierymski” zaliczał też dystraktor Maksymilian Gierymski | usunięto alias | wysoka |
| sztuka#19 | [treść] „Ostatni z Jagiellonów”. Po Zygmuncie Auguście panowała jeszcze Anna Jagiellonka | „ostatni z Jagiellonów w linii męskiej” | wysoka |
| sztuka#25 | [fun] „Obraz skradziono ponownie”. W 2004 roku z Muzeum Muncha skradziono inną wersję „Krzyku” | poprawiono | wysoka |
| sztuka#39 | [treść] Zdanie niegramatyczne („Kogo przedstawia zamordowanego…”) | przeredagowano | wysoka |
| sztuka#50 | [treść] Błąd językowy „z zraszacza” w dystraktorze | „ze zraszacza” | wysoka |
| sztuka#53 | [fun] Polski tytuł pracy Hirsta to „Fizyczna niemożliwość…”, a nie „niemożność” | poprawiono tytuł | wysoka |
| sztuka#61 | [alias] „Découpage” to inna technika (zdobienie przedmiotów wycinankami) | alias zamieniony na „papiers découpés” / „gouaches découpées” | średnia |
| sztuka#95 | [alias] Pula Wysokiego Renesansu nie przyjmowała Giorgionego ani Andrei del Sarto | dodano 2 pozycje | wysoka |
| mitologia#6 | [treść] Błąd składni („Którego greckiego boga… odpowiada”) | „Któremu greckiemu bogu…” | wysoka |
| mitologia#13 | [treść] Ortografia: „nie zaproszona” | „niezaproszona” | wysoka |
| mitologia#38 | [alias] „Amfora” to inne naczynie niż pithos | usunięto alias | wysoka |
| mitologia#41 | [fun] „Atlasy nazwano od ilustracji Atlasa na kartach tytułowych” to wątpliwe uproszczenie. Merkator wyprowadzał nazwę od króla Atlasa z Mauretanii | „nazwę spopularyzował pod koniec XVI wieku Gerard Merkator” | wysoka |
| mitologia#52 | [duplikat] Prawie identyczne z medycyna#42 (laska Asklepiosa) | nowe pytanie d2: Penelopa i całun | wysoka |
| mitologia#89 | [treść] Smoka wawelskiego pokonał w tradycji szewczyk Skuba. „Dratewka” to późniejsza wersja popularna, a pytanie podawało ją jako fakt | „szewczyk Skuba (w popularnych wersjach Dratewka)” | wysoka |
| mitologia#93 | [alias] Kukulkan to bóstwo Majów, a pytanie dotyczy bóstwa azteckiego | usunięto alias | wysoka |
| kosmetyki#17 | [treść] Zdanie bez sensu („nawilża i złuszcza kremy”) | przeredagowano | wysoka |
| kosmetyki#34 | [fun] Kolejność malejącego stężenia obowiązuje tylko składniki powyżej 1% | doprecyzowano | wysoka |
| kosmetyki#50 | [treść] Wyciek odpowiedzi: „w Hollywood” w treści zdradzało USA. Rok 1976 jest niepewny (źródła podają 1975 lub 1976) | nowa treść bez wycieku i bez roku, Jeff Pink przeniesiony do fun. Dystraktory zmienione tak, żeby nie powtarzały odpowiedzi z innych pytań paczki | średnia |
| kosmetyki#74 | [fun] Pierwsza farba Schuellera nazywała się „Auréale”, nie „Auréole” | poprawiono, dopisano, że od niej pochodzi nazwa L’Oréal | średnia |
| kosmetyki#75 | [fun] „Krem w niebieskiej puszce wprowadzono w 1911 roku”. Niebieska puszka pojawiła się dopiero w 1925 | rozdzielono obie daty | wysoka |
| kosmetyki#77 | [dystraktor] Dystraktor „Wiedeń” nie pasuje do treści „w którym polskim mieście” | zamieniono na „Łódź” | wysoka |
| kosmetyki#82 | [fun] „Pierwszą perfumerię Sephora otwarto w Limoges” jest niepewne. W Limoges zaczynał Mandonnaud, a markę Sephora kupił w 1993 roku | nowy fun: LVMH kupił Sephorę w 1997 roku | średnia |
| kosmetyki#98 | [duplikat] Prawie identyczne z biologia#91 (witamina D z UV) | nowe pytanie d2: mikrodermabrazja | wysoka |
| zwierzeta#94 | [duplikat] Wielka Rafa Koralowa, ten sam fakt co geografia#49 | nowe pytanie d1: „Ile ramion ma zwykle rozgwiazda?” (5) + fun o regeneracji | wysoka |

## Rozstrzygnięcia z rundy 1

- **disney#31**: rozstrzygnięte. Polskie imiona z dubbingu 1995 (reż. Izabella Falewiczowa) to Flora (Zofia Gładyszewska), Hortensja (Halina Chrobak) i Niezabudka (Maria Homerska). Źródła: [pl.wikipedia „Śpiąca królewna (film 1959)”](https://pl.wikipedia.org/wiki/%C5%9Api%C4%85ca_kr%C3%B3lewna_(film_1959)), [dubbingpedia](https://dubbingpedia.pl/wiki/%C5%9Api%C4%85ca_kr%C3%B3lewna_(film_1959)), [disney.fandom.com/pl „Niezabudka”](https://disney.fandom.com/pl/wiki/Niezabudka). Fandom podaje dla Merryweather także formę „Pogódka”, więc dodałem ją jako alias. Forma „Niebianka” nie pojawia się w żadnym źródle i została usunięta.
- **harry-potter#14**: potwierdzone. Hasło na polskiej HP Wiki (harrypotter.fandom.com/pl) nosi tytuł „**Szafka Zniknięć** (ang. Vanishing Cabinet)”. Obecna kanoniczna odpowiedź jest poprawna, nic nie zmieniałem. Pewność: wysoka.

## Potwierdzone w sieci (bez zmian w danych)

- literatura#30: laureatką literackiego Nobla 2026 (ogłoszenie 8.10.2026) jest Anne Carson, więc polskich noblistów nadal jest pięciu.
- literatura#29: „Księgi Jakubowe” dzielą się na siedem ksiąg (Wikipedia EN, katalog UW).

## Statystyka per paczka

Kolumna „błędy” liczy pytania z rzeczywistym błędem merytorycznym, redakcyjnym, złym aliasem lub wyciekiem. „Uzupełnienia” to brakujące poprawne aliasy, a „duplikaty” to pytania wymienione z powodu dublowania innej paczki.

| paczka | sprawdzono | odpowiedź | treść | fun | alias (zły) | dystraktor | razem błędy | % błędów | uzupełnienia aliasów | duplikaty |
|---|---|---|---|---|---|---|---|---|---|---|
| quiz-disney.json | 100 | 1 | 0 | 2 | 0 | 0 | 3 | 3% | 0 | 0 |
| quiz-literatura.json | 100 | 0 | 3 | 3 | 0 | 1 | 7 | 7% | 3 | 1 |
| quiz-sztuka.json | 100 | 0 | 3 | 2 | 2 | 0 | 7 | 7% | 1 | 1 |
| quiz-mitologia.json | 100 | 0 | 3 | 1 | 2 | 0 | 6 | 6% | 0 | 1 |
| quiz-kosmetyki.json | 100 | 0 | 2 | 4 | 0 | 1 | 7 | 7% | 0 | 1 |
| quiz-zwierzeta.json | — | — | — | — | — | — | — | — | — | 1 |
| fun w 21 pozostałych paczkach | 0 (całość sprawdzona w rundzie 1) | — | — | — | — | — | — | — | — | — |
| **RAZEM** | 500 | 1 | 11 | 12 | 4 | 2 | 30 | 6.0% | 4 | 5 |

Uwagi:
- Wszystkich zmienionych pytań jest 39: 30 błędów, 4 uzupełnienia aliasów i 5 wymian duplikatów.
- Kosmetyki#50 zaliczyłem do „treści”, bo najważniejszy był wyciek odpowiedzi. Literatura#3 zaliczyłem do „fun”, bo ciekawostka zdradzała odpowiedź na inne pytanie.
- W 400 świeżych pytaniach (literatura, sztuka, mitologia, kosmetyki) **nie znalazłem żadnej błędnej odpowiedzi kanonicznej**. Błędy siedzą w ciekawostkach, aliasach i redakcji treści. Disney po rundzie 1 jest czysty, jeśli nie liczyć polskich imion wróżek.

## Pozostałe obserwacje (bez zmian)

- Skrypt znalazł inne pary pytań z tą samą odpowiedzią w różnych paczkach, ale każda z nich pyta o inny fakt, więc to nie są duplikaty. Przykłady: „Nikt” (Nemo / Odyseusz), „Charon” (księżyc / przewoźnik), „Mont Blanc” (Kordian / najwyższy szczyt Alp), „Zurych” (dada / FIFA), „keratyna” (paznokcie / grzechotka). Te pary zostawiłem.
- Zostały pary pytań, które się dublują i nie należą do zakresu tej rundy. Warto je przejrzeć w kolejnej rundzie:
  - kosmos#75 i lotnictwo#22 (Hermaszewski),
  - informatyka#44 i sport#95 (Deep Blue),
  - film#22 i muzyka#49 (Kilar i „Dracula”),
  - star-wars#5 i muzyka#147 (John Williams),
  - lotnictwo#28 i nauka#39 (prędkość dźwięku),
  - biologia#12 i kuchnia#94 (umami).
- Ostrzeżenia reguły 2 (34) to te same ostrzeżenia, które były przed rundą 2.
