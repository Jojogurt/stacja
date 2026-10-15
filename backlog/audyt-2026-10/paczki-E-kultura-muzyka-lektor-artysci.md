# content_E — audyt: literatura, sztuka, mitologia, kosmetyki, muzyka (quiz) + lyrics.js, categories.js, playlists.js, questions.js

Repo: /Volumes/Lexar SSD/Projects/stacja (tylko odczyt). Sekcje zapisywane przyrostowo.

## literatura (data/quiz-literatura.json, 100 pytań)

Ocena ogólna: solidna merytorycznie (jeden jawny błąd faktu: Booker Tokarczuk), ale bardzo szkolna: ok. 70% to „Kto napisał X?” z lektur, ok. 60% łatwych / 33% średnich / 7% trudnych. Największe bolączki: pytania wielopolowe z wymuszoną kolejnością mimo „w dowolnej kolejności”, wyciek śmieciowego artefaktu generatora w treści (#78), wielokrotne powtarzanie tych samych tematów (Hamlet x4, Zbrodnia i kara x3, Wesele x3, Lalka x3, Verne x3, Nobel PL x4-5) i krzyżowe wycieki odpowiedzi między sąsiednimi pytaniami.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| literatura#96 | FAKT | krytyczna | Booker (International Booker 2018) dostała za „Biegunów” (Flights), nie za „Księgi Jakubowe” (Nike 2015). Do tego „sześcioksięgowa” – Księgi Jakubowe mają siedem ksiąg. Poprawka: „Za którą powieść Tokarczuk dostała International Booker Prize w 2018?” → Bieguni; albo osobne pytanie o Księgi Jakubowe (Nike). |
| literatura#34 | SLOTY | krytyczna | „w dowolnej kolejności”, a sloty a/b/c mają stałe, różne listy (Mickiewicz / Słowacki / Krasiński) → poprawna odpowiedź w innej kolejności odrzucona. Poprawka: identyczna lista (3 wieszcze + Norwid?) we wszystkich slotach i walidacja unikalności, albo zmienić na 3 osobne pytania. |
| literatura#90 | SLOTY | krytyczna | „trzy dramaty Szekspira w dowolnej kolejności”: a=[Hamlet] tylko, b=[Makbet] tylko, c=[Romeo i Julia, Otello, Lear, Burza]. „Otello, Hamlet, Makbet” odrzucone; brak Sen nocy letniej, Kupiec wenecki, Juliusz Cezar itd. Poprawka j.w. (wspólna lista, bez duplikatów). |
| literatura#78 | JĘZYK | krytyczna | W treści zostawiony artefakt generatora: „Kto napisał powieść „Mistrzowie” — pomyłka; kto napisał „Jądro ciemności”?”. Poprawka: „Kto napisał „Jądro ciemności”?”; dodać wariant „Józef Konrad Korzeniowski”. |
| literatura#35 | WYCIEK | krytyczna | Treść podpowiada odpowiedź („jeśli autor nieznany, podaj „nieznany””). Do tego pytanie „kto napisał” bez znanego autora jest nielogiczne (tradycja: św. Wojciech – odrzucone). Poprawka: „Jak nazywa się najstarsza polska pieśń religijna, której autor jest nieznany?” → Bogurodzica. |
| literatura#19 | NIEJEDN | krytyczna | ABCD: zamek w Elsynorze (Helsingør) to właśnie Kronborg; A (Kronborg) i B (Elsynor) obie poprawne, w answers tylko B. Poprawka: „Który duński zamek posłużył jako pierwowzór Elsynoru z Hamleta?” → Kronborg, dystraktory bez „Elsynor”. |
| literatura#1 | JĘZYK/WYCIEK | średnia | „Jak brzmi pełny tytuł... pierwsze słowa inwokacji — „... ojczyzno moja!”” – pełny tytuł to „Pan Tadeusz, czyli ostatni zajazd na Litwie”; pytanie miesza tytuł i incipit; DUP #0/#13. Poprawka: „Jakim słowem zaczyna się Pan Tadeusz?” albo usunąć. |
| literatura#12 vs #11, #9 | DUP | niska | Prus x2 (Lalka, Faraon) OK, ale Lalka: #9, #10, #62; #10 podaje „Izabeli Łęckiej” = odpowiedź b z #62. |
| literatura#62 | WYCIEK/DUP | średnia | Dubluje #9/#10; ukochana w treści #10. Usunąć lub zamienić na pytanie o Rzeckiego/Geista. |
| literatura#8, #20 | FAKT | niska | Nobel 1905 był za całokształt („wybitne zasługi jako pisarza epickiego”), nie za „Quo vadis”. Poprawka: „Którą powieść Sienkiewicza zna cały świat i jest najczęściej tłumaczona?”. |
| literatura#69 | JĘZYK/DUP | średnia | „dwie polskie poetki” – Tokarczuk to prozaiczka; duplikat #94/#95; etykiety slotów zdradzają lata. Poprawka: „polskie noblistki” lub usunąć. |
| literatura#97 | JĘZYK/DUP | średnia | „w którego pierwszej części pojawia się duch ojca” – dramat dzieli się na akty; Hamlet pojawia się w #18, #19, #27, #90, #97. Zostawić 1-2. |
| literatura#22/#23/#41 | DUP | średnia | Zbrodnia i kara 3x; #23 podaje Raskolnikowa w odpowiedzi, #41 w treści. |
| literatura#30/#31/#48 | DUP/WYCIEK | średnia | Wesele 3x; #48 treść zawiera „Bronowice” = odpowiedź #31. |
| literatura#76/#81/#82 | DUP/WYCIEK | średnia | Verne 3x; #76 treść ma „Nautilus i kapitan Nemo” = odpowiedź #82. |
| literatura#44/#45 | WYCIEK/DUP | średnia | #44 zawiera „Geralcie”, #45 odpowiedź „Geralt”; osobna paczka Wiedźmin dubluje. |
| literatura#36/#37 | WYCIEK | średnia | #36 treść: „córki Urszulki” = odpowiedź #37. |
| literatura#83 | WYCIEK | niska | „Krzyżacy” w odpowiedzi to rdzeń z treści („wojnie z Krzyżakami”). Poprawka: opis bez słowa Krzyżacy (np. „bitwa 1410”). |
| literatura#52 | JĘZYK | niska | „Kto napisała serię powieści...” – błąd gramatyczny, do tego trywialne. |
| literatura#99 vs #34 | DUP/TRYWIALNE | niska | „epoka Mickiewicza, Słowackiego i Krasińskiego” = romantyzm; ABCD, 4 opcje, oczywista. |
| literatura#0,#2,#7,#13,#17,#18,#25,#26,#40,#49,#52,#59,#66,#67,#79,#80,#84,#98 | TRYWIALNE | niska | Czysto szkolne „Kto napisał X?” bez haczyka (ok. 18 pytań). Zamienić na pytania z kontekstem (np. pierwsze zdanie, bohater poboczny, adaptacja). |
| literatura#91 | JĘZYK | niska | „Sklepy cynamonowe” to zbiór opowiadań, nie „powieść”. |
| literatura#96/#95 | NISZOWE | niska | Różnica „rok przyznania” vs „za rok 2018” (Tokarczuk: ogłoszona 2019) – dopisać do pytania „za rok 2018 (ogłoszona w 2019)”. |

ABCD: 28 pytań ABCD (rozkład poprawnych A8 B11 C7 D2 – litera D rzadka, B nadreprezentowana), dystraktory generalnie sensowne i z tej samej kategorii (dobre: #10, #56, #75, #87, #88), brak dystraktorów żartobliwych. Poprawna zwykle nie wyróżnia się długością.

## sztuka (data/quiz-sztuka.json, 100 pytań)

Ocena ogólna: merytorycznie poprawna (nie znalazłem błędu faktu), ale najsłabsza pod względem różnorodności: ok. 15 dzieł/artystów powtarza się po 3-6 razy (Van Gogh 5x, Leonardo 5x, Mona Lisa 5x, Matejko 5x, Monet 4x, Picasso 5x, Michał Anioł 4x), a bloki #83-#96 to praktycznie duplikaty wcześniejszych pytań w formie „tytuł i autor” – część z nich podaje tytuł w treści. Trudność: ok. 55% łatwych, 40% średnich, 5% trudnych; styl szkolny („Z jakiego kraju pochodził X?”). Trzy pytania wielopolowe (#97-#99) mają błędnie zbudowane sloty.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| sztuka#97 | SLOTY | krytyczna | a=[Aleksander, Maksymilian], b=[Maksymilian, Aleksander] – można wpisać „Aleksander” 2x i dostać komplet. Poprawka: identyczne listy + walidacja unikalności, albo pytanie jedno-slotowe „Który z braci Gierymskich namalował Pomarańczarkę?”. |
| sztuka#98 | SLOTY | krytyczna | Trzy identyczne listy (Monet, Renoir, Degas, Manet, Pissarro) – „Monet, Monet, Monet” = komplet. Brakuje Sisley, Morisot, Cassatt, Caillebotte, Bazille (poprawna odpowiedź odrzucona). Manet/Degas to też sporny „impresjonizm”. Poprawka: rozszerzyć listę, wymusić unikalność. |
| sztuka#99 | SLOTY | krytyczna | Jak wyżej: 3 identyczne listy, można wpisać Leonardo 3x; brak Tycjan, Giorgione, Masaccio, Bramante, Donatello. |
| sztuka#83 | SLOTY/WYCIEK | krytyczna | Slot a „dzieło” = „Dama z gronostajem”, a tytuł jest w treści pytania. Poprawka: zostawić tylko slot malarza (to samo co #18). |
| sztuka#12 | WYCIEK | średnia | Odpowiedź „impresjonizm” to rdzeń tytułu w treści („Impresja, wschód słońca”), a #11 mówi „od której wzięła nazwę cała epoka”. Poprawka: „Jaki kierunek reprezentowali Monet, Renoir i Degas?” lub usunąć. |
| sztuka#80 | WYCIEK/DUP | krytyczna | Odpowiedź „Kaplica Sykstyńska” jest w treści #2; samo pytanie jest niepoprawne („strop” vs odpowiedź „kaplica”). Poprawka: „W której kaplicy w Watykanie Michał Anioł namalował Sąd Ostateczny?” albo usunąć. |
| sztuka#35 | WYCIEK | średnia | „renesans, oznaczająca „odrodzenie”” – treść podaje tłumaczenie odpowiedzi (a „odrodzenie” jest przyjętym wariantem). Poprawka: usunąć nawias z „odrodzenie”. |
| sztuka#39 | WYCIEK | średnia | ABCD: definicja w treści („kontrast światła i cienia”) = opcja B „Światłocień”. Poprawka: zapytać o technikę Caravaggia bez definicji, np. „Jak nazywa się technika Leonarda – miękkie zacieranie konturów?” (sfumato). |
| sztuka#64 | WARIANTY/WYCIEK | średnia | Prompt: „obraz przedstawiający krajobraz”, a wariant „krajobraz” zalicza przepisanie słowa z pytania. Usunąć wariant „krajobraz”. Pytanie trywialne. |
| sztuka#85, #89, #91, #92 | WYCIEK | niska | Opisy zdradzają tytuł: „gwiaździsty” → Gwiaździsta noc; „krzyczącej postaci” → Krzyk; „dziewczyny z perłą” → Dziewczyna z perłą; „zamyślonego” → Myśliciel. |
| sztuka#87 | WARIANTY | średnia | „Bitwa pod Grunwaldem” – odpowiedź „Grunwald” zostanie odrzucona (krótszy <60% dłuższego). Dodać „Grunwald”, „Bitwa pod Grunwaldem”. Podobnie #90 „Trwałość pamięci” (+ „Płynące zegary”), #94 (+ „Wenus”). |
| sztuka#15, #16, #17, #87, #88 | DUP | średnia | Matejko 5x; #17 podaje „Stańczyk” = odpowiedź #88. |
| sztuka#2/#80, #3/#93/#69 | DUP/WYCIEK | średnia | #3 „we Florencji” zdradza #69 (Uffizi/Florencja); #93 duplikat #3. |
| sztuka#4, #5, #6, #7, #85 | DUP | średnia | Van Gogh 5x, w tym „Z jakiego kraju pochodził” (#7) – trywialne. |
| sztuka#0, #1, #18, #84, #96, #20, #21 | DUP | średnia | Leonardo/Mona Lisa/Luwr: #20 treść „w Paryżu” = odpowiedź #21; #96 = #20+#21. |
| sztuka#8, #9, #10, #34, #86 | DUP/WYCIEK | średnia | Picasso 5x; #8 „współtwórca kubizmu” = odpowiedź #34. |
| sztuka#42, #43, #95 | DUP/WYCIEK | średnia | Warhol 3x; #95 powtarza #42 i zawiera odpowiedź #43. |
| sztuka#51/#94, #29/#92, #24/#90, #10/#86, #23/#89, #26/#91, #11-14 | DUP | niska | Pary pytanie ↔ „podaj tytuł i autora” dla tego samego obrazu; #24 treść ma tytuł = odpowiedź #90. |
| sztuka#16, #28, #7, #9, #14, #21, #59 | TRYWIALNE | niska | „Z jakiego kraju pochodził X?” (7 pytań) – dziecinne. Także #62, #63, #65, #66, #67, #77, #79 (słownikowe: mozaika, sztaluga, witraż, ikona). |
| sztuka#82 | NIEJEDN | niska | „Trzeci mistrz renesansu” – Tycjan (opcja B) też jest wielkim mistrzem renesansu; zasadniczo kanon to Leonardo-Michał Anioł-Rafael, ale pytanie powinno brzmieć „Trzej mistrzowie Wysokiego Renesansu w Rzymie”. |
| sztuka#22 | NIEJEDN | niska | „największe muzeum sztuki w Madrycie” – Prado jest główne, ale Reina Sofía/Thyssen też duże; zmienić na „najsłynniejsze”. |
| sztuka#38 | JĘZYK | niska | „Jakimi farbami rozcieńczanymi wodą maluje się techniką przejrzystą, laserunkową?” – niezgrabne; „Jak nazywa się technika malowania rozcieńczonymi wodą przezroczystymi farbami?”. |
| sztuka#76 | FAKT | niska | „To nie jest fajka” to jeden obraz („Zdradliwość obrazów”), nie „cykl z fajką”. |
| sztuka#74/#75 | NIEJEDN | niska | „kierunek wyrażający emocje przez deformację” – ekspresjonizm, ale równie pasuje fowizm; #75 „Jak po polsku” bez sensu (nazwa polska jest jedyną). |

ABCD: 27 pytań, rozkład poprawnych A6 B7 C7 D7 (dobry), poprawna najdłuższa tylko 5x. Dystraktory trafne (#41, #56, #71, #81 bardzo dobre).

## mitologia (data/quiz-mitologia.json, 100 pytań)

Ocena ogólna: kompetentna, bez poważnych błędów faktów (poza niejednoznacznym #16 i wątpliwą „puszką” Pandory), ale bardzo schematyczna: 12 pytań (#86-#97) to ten sam szablon „grecki bóg + rzymski odpowiednik”, w dodatku powtarzający pytania #0-#14; liczne zależności typu „treść jednego pytania zdradza odpowiedź innego” (klastry Minotaur, Meduza, Argonauci, Orfeusz). Ok. 70% łatwych, 27% średnich, 3% trudnych. Mało „pubquizowego” haczyka.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| mitologia#98 | SLOTY | krytyczna | Trzej synowie Kronosa: stała kolejność Zeus/Posejdon/Hades, pytanie nie zaznacza kolejności → poprawna odpowiedź w innej kolejności odrzucona. Poprawka: wspólna lista + unikalność lub podać „(od najmłodszego)”. |
| mitologia#99 | SLOTY | krytyczna | Trzy boginie sporu o jabłko: stała kolejność Hera/Atena/Afrodyta; brak kolejności w treści. Poprawka j.w. |
| mitologia#16 | NIEJEDN | krytyczna | ABCD: w mitologii greckiej Charon przewozi przez Acheront (źródła rzymskie: Styks). Opcje B (Acheront) i C (Styks) obie bronialne; w answers tylko Styks. Poprawka: „Która rzeka dzieliła świat żywych od umarłych i na niej przysięgali bogowie?” (Styks) lub dodać Acheront jako poprawny i usunąć z opcji. |
| mitologia#43 | WARIANTY/FAKT | średnia | „Puszka Pandory” to błąd tłumaczenia (Erazm) – oryginał to pithos (dzban). Odrzucone zostaną „dzban”, „amfora”, „naczynie”, „pithos”, a przyjęte „skrzynia”. Poprawka: dodać dzban/amfora/naczynie/pithos. |
| mitologia#46 | WARIANTY | średnia | Odpowiedzi opisowe („orzeł wyjadał mu wątrobę”); „orzeł wyjadał wątrobę”/„wątroba” przejdzie dopiero przy bliskim brzmieniu, a „wątrobę wyjadał mu orzeł” nie. Skrócić do „wątroba” (+ „orzeł wyjadał wątrobę”). |
| mitologia#56 | WARIANTY | średnia | Odpowiedź opisowa; „obejrzeć się za siebie” przyjęte, „oglądać się”, „patrzeć na nią” nie. Lepiej pytać: „Co zrobił Orfeusz, tracąc Eurydykę?” z krótkim „obejrzał się”. |
| mitologia#86-#97 | DUP/TRYWIALNE | średnia | 12 identycznych pytań „bóg grecki + rzymski odpowiednik” (12% paczki), które dublują #0, #1, #2, #5-#8, #9, #11-#14. Zostawić 3-4, resztę zastąpić różnorodnymi (np. genealogia, atrybuty, mity mniej znane). |
| mitologia#2/#92 | WARIANTY | niska | Wariant „Plutos” jako Pluton: Plutos to inny bóg (bogactwa). Usunąć „Plutos”. |
| mitologia#22/#23/#24/#25/#69 | WYCIEK/DUP | średnia | #22 „zabił Meduzę” zdradza #23; Pegaz 2x (#25, #69). |
| mitologia#26-#31 | WYCIEK | średnia | Klaster Minotaura: #28 podaje „Tezeuszowi” (=odpowiedź #27), #30 „labirynt na Krecie” (=#29), #31 „syn Dedala” (=#30). |
| mitologia#60/#61 | WYCIEK | niska | „Argonautów” w #60 zdradza „Argo”. |
| mitologia#71/#72, #75/#76, #77/#78/#14, #40/#41/#42 | WYCIEK/DUP | niska | Sfinks→Edyp; „Gai” w #76 = odpowiedź #75; #78 (Demeter) duplikuje #14; #41 „syn króla Priama” = odpowiedź #42. |
| mitologia#50/#99 | WYCIEK | niska | #99 „złote jabłko (sąd Parysa)” = odpowiedź #50. |
| mitologia#58/#59 | WYCIEK | niska | „zanikła, pozostawiając tylko głos” → Echo zbyt oczywiste. |
| mitologia#66 | FAKT/JĘZYK | niska | „stugłowy lub stuoki” – Argus Panoptes jest stuoki; „stugłowy” to Tyfon/Ladon. Zostawić „stuoki”. |
| mitologia#53 | ABCD | niska | „charyty” i „gracje” to to samo (grecka i rzymska nazwa Gracji) – dwa dystraktory zlewające się; zastąpić np. „muzy”. |
| mitologia#21 | ABCD | niska | Dystraktory sztuczne („stajnie Eurysteusza/Diomedesa/Geriona” – Gerion miał bydło, Diomedes klacze). |
| mitologia#18 | WARIANTY | niska | „12 prac” odrzucone (tylko „12”/„dwanaście”). Dodać. |
| mitologia#0-#15, #17, #18, #20, #23, #26, #33, #34, #38, #45, #49, #51, #52, #64, #67 | TRYWIALNE | niska | Ok. 30 pytań poziomu gimnazjum („Który bóg władał morzami?”). |
| mitologia#4, #74, #81, #83 | OK | – | Dobre, trudniejsze ABCD (Reja, Chaos, Pola Elizejskie, Chiron). |

ABCD: 26 pytań, rozkład A6 B7 C8 D5; poprawna najdłuższa 3x – dobrze. Dystraktory mitologiczne, spójne.

## kosmetyki (data/quiz-kosmetyki.json, 100 pytań)

Ocena ogólna: najsłabsza z pięciu pod względem jakości generacji. Aż ok. 35 pytań ma odpowiedź (lub jej rdzeń) w treści, a pytania wielopolowe #84-#95 podają w treści jeden slot („podaj składnik „retinol” oraz jego działanie”), więc pierwszy slot jest za darmo. Dwa pytania są merytorycznie bełkotliwe (#59, #78), kilka niejednoznacznych. Styl: definicja → termin, ok. 65% łatwych, 30% średnich, 5% trudnych; mało „pubquizowe”, brak haczyka (poza #62, #63, #77).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| kosmetyki#59 | FAKT/JĘZYK | krytyczna | „marka... ma w nazwie słowo oznaczające „czystą skórę”” – La Roche-Posay to nazwa miejscowości, nic nie znaczy. Treść pomieszana. Poprawka: „Która francuska marka apteczna zasłynęła kremem Cicaplast i wodą termalną z miejscowości w departamencie Vienne?” |
| kosmetyki#78 | FAKT/WARIANTY/ABCD | krytyczna | Cicaplast to produkt La Roche-Posay (nie Avène), więc „La Roche-Posay lub...” bez sensu; answers zalicza „Cetaphil” (marka USA) i „Bioderma” jako poprawne dla opcji C „Avène”. Poprawka: „Która francuska marka apteczna produkuje krem Cicalfate i wodę termalną Eau Thermale?” → Avène; usunąć wszystkie warianty poza Avène. |
| kosmetyki#79 | NIEJEDN | krytyczna | ABCD: Sensibio H2O, Sébium H2O, Hydrabio H2O i Atoderm to wszystkie płyny micelarne Bioderma. Kilka opcji poprawnych. Poprawka: „Który płyn micelarny Bioderma w różowej butelce, dla skóry wrażliwej, jest najpopularniejszy?” lub inne pytanie. |
| kosmetyki#39 | NIEJEDN | krytyczna | „Jaki rodzaj kosmetyku... usuwa makijaż... pierwszy krok oczyszczania” – poprawnych odpowiedzi jest wiele (płyn micelarny, olejek, mleczko, pianka, balsam myjący), lista wariantów przyjmuje kilka, ale nie „płyn micelarny”/„pianka”. Poprawka: przeformułować na konkretny produkt (np. olejek hydrofilowy w double cleansing). |
| kosmetyki#81 | NIEJEDN/WYCIEK | krytyczna | „rodzaj kremu o lekkiej, nietłustej konsystencji” – odpowiedzi: żelowy, matujący, niekomedogenny, lekki; wariant „lekki krem” to słowa z treści. Poprawka: pytanie o „krem żelowy” lub usunąć. |
| kosmetyki#37 | SLOTY | krytyczna | UVA/UVB w stałej kolejności, pytanie nie narzuca kolejności; „UVB, UVA” odrzucone. Wspólna lista + unikalność. |
| kosmetyki#90 | SLOTY | krytyczna | Slot a=„tłusta” podany w treści, b=sucha, c=normalna w stałej kolejności („normalna, sucha” odrzucone). Poprawka: „Wymień cztery typy cery” z listą wspólną. |
| kosmetyki#91 | SLOTY/WYCIEK | krytyczna | Sloty a (retinol) i b (witamina C) podane w treści; slot c akceptuje peptydy/niacynamid (nie są „nawilżające”). |
| kosmetyki#92 | SLOTY/WYCIEK | krytyczna | Dwa z trzech slotów (tusz, cienie) podane w treści; zostaje 1 do zgadnięcia. |
| kosmetyki#85, #86, #87, #88, #89, #93, #95 | SLOTY/WYCIEK | krytyczna | Format „podaj X oraz Y”, gdzie X jest w treści (np. „podaj składnik „retinol” oraz jego efekt”) → slot a darmowy; slot b to opis swobodny (np. „wygładza skórę”), więc poprawne odpowiedzi „bardziej nawilża” odrzucone. Zastąpić pytaniami jednoslotowymi lub sensownym ABCD. |
| kosmetyki#84, #85, #86 | DUP | niska | Marka+kraj dubluje #13/#15/#17. |
| kosmetyki#23 | WYCIEK | krytyczna | „kosmetyk... nadający policzkom kolor (róż)” – odpowiedź w nawiasie. Usunąć nawias. |
| kosmetyki#31 | WYCIEK | krytyczna | „...oznaczana literą E” – odpowiedź w treści (wariant „E”). Usunąć „oznaczana literą E”. |
| kosmetyki#42 | WYCIEK | krytyczna | Prompt zawiera „maska w płachcie” = odpowiedź. |
| kosmetyki#45 | WYCIEK/ABCD | krytyczna | „składnik... pochodzącej od ślimaka, czyli ślimaczy filtrat/śluz” + opcja A „Śluz ślimaka (snail mucin)” jedyna z objaśnieniem i najdłuższa. |
| kosmetyki#50 | WYCIEK | krytyczna | „specjalistyczny krem lub żel pod oczy” → „krem pod oczy”. |
| kosmetyki#55 | WYCIEK | krytyczna | „beauty balm (skrót dwuliterowy)” = rozwinięcie BB. |
| kosmetyki#61 | WYCIEK | krytyczna | „flagowym produktem marki Nivea” → odpowiedź „Nivea Creme” z wariantem „krem Nivea”. Plus #60/#95 powtarzają Nivea 3x. |
| kosmetyki#65 | WYCIEK/ABCD | krytyczna | W treści „(„zapiekanie”)”, opcja A „Baking (zapiekanie)” – ten sam wyraz. |
| kosmetyki#68 | WYCIEK | krytyczna | „kosmetyk lub żel do stylizacji brwi” → „żel do brwi”; wariant „pomada do brwi” to inny produkt. |
| kosmetyki#80 | WYCIEK | krytyczna | „typu wazelina” – odpowiedź w treści. |
| kosmetyki#82 | WYCIEK | krytyczna | „z liści rośliny aloe vera” → odpowiedź aloes/aloe vera. |
| kosmetyki#96 | WYCIEK/WARIANTY | krytyczna | „puder transparentny” w treści; wariant „puder” zalicza dowolny puder. |
| kosmetyki#9 | WYCIEK | krytyczna | Treść: „zaskórniki”, a wariant „zaskorniki” (po normalizacji) zalicza słowo z pytania; sens: komedony = zaskórniki. Poprawka: „Jak nazywa się medycznie zaskórniki?” bez wariantu „zaskórniki”. |
| kosmetyki#40 | WYCIEK | średnia | „z drobinami micelarnymi” → płyn/woda micelarna. |
| kosmetyki#44 | WYCIEK | średnia | „dwuetapowe oczyszczanie” = „podwójne oczyszczanie” (wariant). Zapytać o nazwę koreańskiej metody z olejkiem, bez „dwuetapowe”. |
| kosmetyki#43 | WYCIEK | średnia | „K-beauty” (K = Korea) w treści; trywialne ABCD. |
| kosmetyki#67 | WYCIEK | średnia | „ciemny, dymny makijaż oczu” → „smokey eyes”/„dymne oczy”. |
| kosmetyki#74 | WYCIEK | średnia | „nakładany na noc” → „krem na noc”. |
| kosmetyki#51 | WYCIEK/WARIANTY | średnia | „rodzaj cery wrażliwej” → „cera wrażliwa”; wariant „naczyniowa” to inny typ cery. |
| kosmetyki#98 | WYCIEK | średnia | „występujący też w mleku” → „mlekowy”. |
| kosmetyki#58 | WYCIEK/FAKT | średnia | Hasło „Maybe she's born with it” zawiera „Maybe...”; czerwone „M” w logo – wątpliwe (logo to napis MAYBELLINE). Uprościć: „która marka ma slogan „Maybe it's Maybelline”” nie – raczej zapytać o kraj. |
| kosmetyki#4 | FAKT/WARIANTY | średnia | SPF = Sun Protection Factor („współczynnik ochrony przeciwsłonecznej”), a pierwszą odpowiedzią jest „filtr przeciwsłoneczny” (SPF to nie filtr). Poprawić odpowiedź i dodać „współczynnik...”, usunąć „ochrona przeciwsloneczna”. |
| kosmetyki#19/#20 | WYCIEK | średnia | #19 podaje „np. kwas salicylowy” = odpowiedź #20. |
| kosmetyki#2/#99 | DUP/WYCIEK | niska | Niacynamid ↔ B3 w obu kierunkach. |
| kosmetyki#33/#34 | DUP | niska | Kolagen/elastyna – schematyczne. |
| kosmetyki#49 | ABCD | średnia | „Jak nazywa się substancja... skrót SLS” z odpowiedzią-klasą „Detergent (surfaktant)” – poprawna jedyna z nawiasem i najdłuższa; pytanie o klasę, nie nazwę. |
| kosmetyki#66 | NIEJEDN | średnia | „modny rozświetlony, „mokry” wygląd skóry” – glow, dewy skin, glass skin, glazed – poprawnych kilka; akceptowane tylko glow/dewy. |
| kosmetyki#73 | WYCIEK/NIEJEDN | niska | „urodzona w Krakowie” podpowiada; w 1872 Kraków był w Austro-Węgrzech (opcja B bronialna). |
| kosmetyki#28 | JĘZYK | niska | „simondsia” → „simmondsia” (łac. Simmondsia chinensis). |
| kosmetyki#54 | WARIANTY | niska | Wariant „bronzer w plynie” zalicza produkt z innej kategorii (bronzer to #7). |
| kosmetyki#64 | WARIANTY | niska | „gabka do makijazu” zalicza dowolną gąbkę, a pytanie o beautyblender. |
| kosmetyki#47 | WARIANTY | niska | „keratyna” (sam składnik) zalicza się jako zabieg. |
| kosmetyki#3, #31 | WARIANTY | niska | Jednoliterowe warianty „C” / „E” akceptują „C”/„E” jako odpowiedź (w #3 jeszcze sensowne, w #31 wyciek). |
| kosmetyki#13, #14, #16, #17, #18, #60, #46, #57, #25, #12, #33, #35 | TRYWIALNE | niska | Marka→kraj (5x ABCD), „czym jest szminka”, podkład itp. |

ABCD: 28 pytań, rozkład A10 B9 C6 D3 (D rzadkie); poprawna najdłuższa w 8 z 28 (#45, #49, #52, #65, ...) – nadmiar. Dystraktory zwykle tej samej kategorii.

## muzyka (data/quiz-muzyka.json, 50 pytań) — kluczowa paczka trenera pubquizu

Ocena ogólna: poprawna faktograficznie (zero poważnych błędów), ale jako paczka „muzyczny pubquiz” jest za mało zróżnicowana i za łatwa: ok. 80% łatwych, 18% średnich, 2% trudnych; 49/50 pytań to jedno-slotowe „Kto wykonuje X / kto jest wokalistą Y” (brak ABCD, brak „dokończ tytuł”, „rok”, „skąd ten utwór”, „kto napisał”, teoria/instrumenty, rekordy, ciekawostki z haczykiem). Poprawny jest tylko jeden „haczyk” (#15 AC/DC = Australia). Pytania nie wykorzystują audio – to wyłącznie wiedza tekstowa, więc nie ćwiczą rozpoznawania z zajawki.

Rozkład (po treści pytań):
- Dekady (wg szczytu popularności tematu, orientacyjnie): 50s/60s ok. 8 (Elvis, Beatles x3, Dylan, Stones, Hendrix, Doors, Niemen), 70s ok. 9 (Queen x2, ABBA, Pink Floyd, Led Zeppelin, Eagles, Bowie, Police), 80s ok. 16 (Prince, Maanam, Kult, Republika, Perfect, Lady Pank, Whitney, Jackson x2, Bon Jovi, GnR, Metallica, U2 x2, Dżem...), 90s ok. 7 (Nirvana x3, Oasis, Radiohead, RHCP, Rammstein), 2000s ok. 6 (Adele, Winehouse, Eminem, Coldplay, Beyoncé, Podsiadło), 2010s 3-4 (Shape of You, Uptown Funk, Daft Punk). Lata 2020+: 0 (brak Dua Lipa, Billie Eilish, Taylor Swift, The Weeknd, Mata, Taco).
- PL vs zagranica: PL tylko 8/50 (16%): Kult, Maanam, Republika, Niemen, Perfect, Dżem, Podsiadło, Lady Pank. Brak: Myslovitz, Hey, Kayah, Bajm/Beata Kozidrak, Maryla Rodowicz, Anna Jantar, Budka Suflera, Czerwone Gitary, Lombard, T.Love, Sanah, Doda, Edyta Górniak, Sylwia Grzeszczak, Taco Hemingway, Quebonafide, Paktofonika, disco polo (Zenek Martyniuk/Akcent/Boys), Eurowizja.
- Gatunki: rock/pop dominują; rap (tylko Eminem), elektronika (tylko Daft Punk), metal (Metallica), jazz (Miles Davis), brak: reggae (Marley), soul/funk, country, klasyka/opera, musicale/soundtracki, K-pop, latino.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| muzyka#36 | NIEJEDN | średnia | „Kto śpiewa „Creep”?” – „Creep” to też hit TLC (1994, #1 w USA) i Stone Temple Pilots; odpowiedź tylko Radiohead. Poprawka: „Który zespół nagrał „Creep” na albumie „Pablo Honey”?” albo dodać TLC jako poprawne. |
| muzyka#45 | WARIANTY | średnia | Najczęstsza odpowiedź „Król” (samo „Król”) zostanie odrzucona: „Król” vs „Król rocka” = 0,5 < 0,6; „King” również odrzucone (jest tylko „The King”). Dodać „Król”, „King”. |
| muzyka#1 | WARIANTY | niska | „Freddie” (samo imię) odrzucone; dodać „Freddie”. Podobnie #16 (Chris Martin), #27 (Jim Morrison) – imię samo: akceptowalne, ale „Jim” nie zadziała. |
| muzyka#44 | WARIANTY | niska | Wariant „Jackson” zalicza też Janet/Jacksona 5; zostawić „Michael Jackson”, „Michael”. |
| muzyka#47 | SLOTY/WARIANTY | średnia | Slot „wokalista” przyjmuje „Bon Jovi” (nazwa zespołu), więc można wpisać „Bon Jovi” 2x i zaliczyć komplet. Poprawka: slot b = tylko [Jon Bon Jovi, Jon]. |
| muzyka#11 | NIEJEDN | niska | „oficjalnie rozpadł się” – formalnie (prawnie) 1974/75; powszechnie 1970. Poprawka: „W którym roku Paul McCartney ogłosił odejście z The Beatles?” (1970). |
| muzyka#34 | NIEJEDN | niska | „Uptown Funk” Marka Ronsona ft. Bruno Mars; pytanie podaje Ronsona w nawiasie, więc oczekiwany Bruno Mars. OK, ale odpowiedź „Mark Ronson” też bronialna. Dodać jako wariant lub zapytać „Kto śpiewa wokal?”. |
| muzyka#6, #17 | DUP/WYCIEK | średnia | Nirvana 3x (#5, #6, #17); #6 („lider Nirvany”) zdradza odpowiedź #5/#17. Podobnie Queen (#0, #1: #1 zdradza #0), U2 (#8, #22: #22 zdradza #8), The Beatles (#10, #11, #35). |
| muzyka#8, #22 | DUP/TRYWIALNE | niska | U2 2x – oba z powtórzonym tematem. |
| muzyka#2, #9, #14, #18, #19, #24, #26, #28, #32, #37, #38, #42, #44, #0, #5, #7, #12, #21, #25, #30 | TRYWIALNE | niska | „Kto wykonuje [największy hit]?” – ok. 20 pytań dla każdego dorosłego (Bohemian Rhapsody, Smells Like Teen Spirit, Hotel California, Stairway...). Brak haczyka. |
| muzyka#30 | PUBQUIZ | niska | Okazja do lepszego pytania: „I Will Always Love You” napisała Dolly Parton (1973); Whitney to cover (1992). |
| muzyka#46-#49 | SLOTY | niska | Sloty podają w treści tytuł utworu, ale pytanie „Zespół i jego wokalista” dobre; #46 „Wykonawca i rok albumu Thriller” OK (1982). |
| muzyka (całość) | PUBQUIZ | średnia | Przeważają pytania o znane nazwisko ↔ utwór. Proponowane szablony: ABCD z dystraktorami (kto z poniższych NIE był w zespole?), „dokończ tytuł/fragment”, „rok wydania ikonicznego singla”, „który utwór otwierał...”, „jak się nazywa z drugiej strony (pseudonim → imię)”, „kto wystąpił na Eurowizji”, „co łączy X i Y”, polskie: „Sopot/Opole – kto wygrał?”, „cover vs oryginał (Hallelujah, Nothing Compares 2 U, Ironic?)”. |

Fakty (sprawdzone, bez błędu): #1 Mercury, #3 Kazik, #4 Kora, #10 Liverpool, #11 (zob. wyżej), #15 AC/DC=Australia (założony w Sydney), #22 U2=Irlandia, #35 Sgt. Pepper 1967, #41 „Małomiasteczkowy” 2013 Podsiadło, #46 Thriller 1982, #48 Lady Pank/Panasewicz, #49 Rammstein/Niemcy. Zero błędów faktów w tej paczce.

# CZĘŚĆ 2 — dane trybu muzycznego i lektora

## lyrics.js — ocena ogólna (6 kategorii, 345 utworów: tlum-int 125, tlum-pl 97, zagadka-rock 32, zagadka-pop 32, rap-pl-opis 29, rap-pl-zagadka 30)

Brak duplikatów title|artist wewnątrz pliku. Rok i wykonawca w tlum-int/zagadka-rock/zagadka-pop są w zdecydowanej większości poprawne (sprawdzone z pamięci + iTunes). Główny problem systemowy: **wyciek tytułu przez tłumaczenie** — ok. 55% opisów w tlum-int i ok. 40% w zagadka-pop/rock zawiera dosłowne tłumaczenie tytułu („Powrót... na czarno” = Back in Black; „Hymn... przetrwania” = I Will Survive), a w kategoriach rap-pl-* opisy są albo generycznym „kawałkiem o...” (niezgadywalne), albo powtarzają tytuł. Dodatkowo lektor czyta opis głosem, więc słowa tytułu są słyszalne. Kategorie rap-pl-* nie są „opisami utworu” (nie ma treści piosenki), tylko opisem metadanych (miasto, wytwórnia, rok) – praktycznie nie do odgadnięcia bez znajomości wykonawcy. tlum-pl: opisy po angielsku — zgadywalność niska dla pytanych (polski pubquiz zna tytuł, ale angielski opis „A cheerful 1960s pop tune offering flowers...” pasuje do 10 piosenek).

Rozkład fun/trudności: tlum-int: łatwe 60% / średnie 35% / trudne 5%, fun wysoki (znane hity, odgadywane z fabuły). zagadka-rock/pop: średnie 60%, trudne 10%, łatwe 30%, fun dobry (zagadki z kontekstem — dobre wzorce: #5 Black Hole Sun, #16 Chop Suey!, #23 Walk This Way, #3 Believe). tlum-pl: trudne 55% (opisy zbyt ogólne). rap-pl-*: trudne 80% (praktycznie niezgadywalne, wyjątek: Jestem Bogiem, Scyzoryk, Patointeligencja).

### lyrics.js / tlum-int (światowe po polsku)

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| tlum-int#1 | WYCIEK | średnia | „błogosławieństwo dla całej Afryki” – tytuł Africa. Zastąpić: „kontynent” nie wymieniać; „deszcze nad sawanną, samotne Kilimandżaro” zostaje. |
| tlum-int#5 | WYCIEK | średnia | „luksusowego hotelu” + „nigdy nie da się wymeldować” – Hotel California (słowo hotel w tytule). Poprawka: „luksusowego miejsca”, „kalifornijskiego”. |
| tlum-int#2 | WYCIEK | średnia | „królowa parkietu” = Dancing Queen; zamienić na „piątkowa bohaterka dyskoteki”. |
| tlum-int#13 | WYCIEK | średnia | „jeszcze wczoraj kłopoty...” = Yesterday. |
| tlum-int#14 | WYCIEK | średnia | „kupi sobie drogę do nieba” = Stairway to Heaven. |
| tlum-int#19 | WYCIEK | średnia | „braci Gallagherów” zdradza zespół Oasis (artist leak). Usunąć. Także „tytuł to wymyślone słowo” – Wonderwall to nazwa albumu Harrisona, nie wymyślone słowo (FAKT niska). |
| tlum-int#24 | WYCIEK | średnia | „bez której nie da się żyć, ale i z którą jest ciężko” = With or Without You. |
| tlum-int#25 | WYCIEK/NIEJEDN | średnia | „O dwojgu ludziach, którzy są jednością” = One (U2); ten sam tytuł ma też Metallica (1988) i Three Dog Night. Poprawka: dodać szczegół specyficzny dla U2 (np. „powstała w Berlinie po kłótniach w zespole”) i usunąć tłumaczenie tytułu. |
| tlum-int#30 | WYCIEK | średnia | „wciąż stoję na nogach” = I'm Still Standing. |
| tlum-int#32 | WYCIEK | średnia | „nic innego się nie liczy” = Nothing Else Matters. |
| tlum-int#33 | WYCIEK | niska | „piaskunie” = Sandman. |
| tlum-int#35 | WYCIEK | średnia | „prowadzi prosto do piekła” = Highway to Hell. |
| tlum-int#36 | WYCIEK | średnia | „Powrót... na czarno” = Back in Black. |
| tlum-int#37 | WYCIEK | średnia | „rażonym piorunem” = Thunderstruck. |
| tlum-int#41 | WYCIEK | średnia | „cisza zamiast dialogu” = Sound of Silence. |
| tlum-int#42 | WYCIEK | krytyczna | „jak most ponad wzburzoną wodą” – cały tytuł. |
| tlum-int#44 | WYCIEK | średnia | „puka do nieba” = Knockin' on Heaven's Door. |
| tlum-int#46 | WYCIEK | średnia | „pomalować na czarno” = Paint It Black. |
| tlum-int#49, #50, #51 | WYCIEK | średnia | „dobrych wibracjach”, „ciepłą Kalifornią”, „fioletowej mgle” – tłumaczenia tytułów. |
| tlum-int#55, #56, #57, #61, #62, #63 | WYCIEK | średnia | What a Wonderful World („pięknie zwykłego świata”), My Way („po swojemu”), Fly Me to the Moon („Zabierz mnie na Księżyc”), I Will Survive („da sobie radę”/przetrwanie), Stayin' Alive („przetrwania”), September („wrześniowej nocy”). |
| tlum-int#66, #67, #69, #71, #72, #73, #74 | WYCIEK | średnia | Tainted Love, Girls Just Want to Have Fun (całe zdanie), Faith („wiary”), Last Christmas („Świąteczny... rok wcześniej” – pełen wyciek), Like a Prayer, Material Girl, Purple Rain („fioletowym deszczu”). |
| tlum-int#78, #79, #80, #81, #86, #89, #90 | WYCIEK | średnia | I Want to Break Free („wyzwolenia”), We Are the Champions, Don't Stop Me Now, Heroes („bohaterami”), No Woman No Cry („nie płacz”), Total Eclipse of the Heart („całkowitym zaćmieniu serca” – cały tytuł), Take Me to Church. |
| tlum-int#93, #94, #95, #96, #97, #98, #99 | WYCIEK | średnia | Shape of You („sylwetce”), Someone You Loved, Poker Face („kamienną twarzą jak przy stole karcianym”), Shallow („płytkim świecie”), Uptown Funk („Funkowy”), Just the Way You Are, Despacito („powolnym”). |
| tlum-int#100, #104, #106, #107, #109, #110, #111, #112, #114, #115, #116, #117, #118, #120, #121, #123, #124 | WYCIEK | średnia | Yellow („żółte”), Counting Stars, Believer, Happy („szczęściu”), Somebody That I Used to Know, Call Me Maybe („telefon... numer”), Shake It Off, Blank Space („puste miejsce”), Levitating („unosi”), Bad Guy, Old Town Road („starą drogą”), Sunflower, Stay, Diamonds, Firework, Crazy in Love, Single Ladies. |
| tlum-int#7 | FAKT | niska | Livin' on a Prayer: Tommy pracował w porcie (docks), nie „na bocznicy”; „stracił pracę” – strajk. Poprawka: „pracował w porcie”. |
| tlum-int#103 | FAKT | niska | Seven Nation Army: riff gra gitara z octaverem, zespół nie ma basisty; „basowy riff” – lepiej „gitarowy riff brzmiący jak bas”. |
| tlum-int#98 | NIEJEDN | średnia | Just the Way You Are – znana też wersja Billy Joela (1977); dodać „2010, urodzony na Hawajach”. |
| tlum-int#92 | NIEJEDN | niska | „Hello” – także Lionel Richie (1984); „telefon do dawnej miłości” pasuje do obu. Poprawka: dodać „monochromatyczny teledysk, rok 2015, album 25”. |
| tlum-int#47 | ZBYT OGÓLNE | niska | „Angie” – opis „melancholijne pożegnanie z kobietą o tym imieniu” pasuje do 10 ballad. Dodać „akustyczny, Mick Jagger, gitara Nicky Hopkins/Bill Wyman...” bez nazw. |
| tlum-int#87 | ZBYT OGÓLNE | niska | Could You Be Loved – opis ogólny („nie dać się zwieść”); dodać „dread i różowo-zielony”. |
| tlum-int#110 | ROK | niska | Call Me Maybe: premiera 2011 (Kanada, wrzesień), światowy hit 2012; w bazie 2012 – ok. |

Ogółem tlum-int: ok. 60 z 125 opisów zawiera tłumaczenie tytułu lub nazwę artysty; po usunięciu wycieków wciąż są zgadywalne (kontekst: tematyka, teledysk, fakty).

### lyrics.js / zagadka-rock i zagadka-pop

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| zagadka-rock#27 | WYCIEK | krytyczna | „zostać czy odejść — oto pytanie” = Should I Stay or Should I Go. |
| zagadka-rock#4 | WYCIEK | średnia | „zaproszenie, by przyjść takim, jakim się jest” = Come As You Are. |
| zagadka-rock#6 | WYCIEK | średnia | „mimo wszystko wciąż żyje” = Alive. |
| zagadka-rock#8 | WYCIEK | średnia | „ironiczna „policja”” = Karma Police (słowo Police w tytule). |
| zagadka-rock#9 | WYCIEK | średnia | „gorzko-słodki hymn” = Bittersweet Symphony. |
| zagadka-rock#15 | WYCIEK | średnia | „o byciu zdrętwiałym” = Numb. |
| zagadka-rock#31 | WYCIEK | średnia | „Manifest brytyjskiego punka; okrzyk anarchisty” = Anarchy in the U.K. |
| zagadka-rock#13, #22, #25, #28 | WYCIEK | niska | aleja/boulevard; marzenia/dream; niegasnący/don't stop; barracuda (morski drapieżnik). |
| zagadka-rock#17 | FAKT | niska | Bring Me to Life: męski wokal (Paul McCoy) to rap/krzyk, nie „growl”. |
| zagadka-rock#2 | ZBYT OGÓLNE | niska | „Ciężki, zniekształcony riff i psychodeliczny chaos” – pasuje do kilku utworów Led Zeppelin/Hendrixa; dodać „reklamowy motyw Top of the Pops”. |
| zagadka-pop#1, #4, #11, #12, #13, #14, #15, #18, #19, #20, #24, #25, #27, #28 | WYCIEK | średnia | Toxic („trucizny”), Genie in a Bottle („dżina”), Just Dance, I Kissed a Girl („pocałunku”), Roar („ryk”), New Rules („Lista zasad”), Can't Feel My Face, Love Yourself („pokochała samą siebie”), Sorry („przepraszanie”), Wrecking Ball („kula wyburzeniowa”), Livin' la Vida Loca („szalone życie”), Bleeding Love, Chandelier („żyrandol”), Wake Me Up („obudzi”). 14 z 32 zagadek pop zdradza tytuł. |
| zagadka-pop#29 | FAKT | średnia | Closer: w tekście „materac, który ukradłaś współlokatorowi w Boulder”, nie „kupiony od znajomego”. Poprawka: „materac ukradziony współlokatorowi”. |
| zagadka-pop#16 | ROK | niska | Watermelon Sugar: album Fine Line grudzień 2019, singiel 2020. W bazie 2019 – akceptowalne, ale wymaga podania „album”. |
| zagadka-pop#6 | ARTIST | niska | NSYNC → oficjalnie „*NSYNC”; w opisie „Justinem T.” zdradza zespół. |
| zagadka-pop#23 | ZBYT ŁATWE | niska | Waka Waka: „oficjalny hymn mundialu w RPA” – natychmiast rozpoznawalny. |

Obie kategorie zagadek są najlepszą jakościowo częścią lyrics.js; po usunięciu wycieków pozostaje dobry pubquizowy format (przykładowo #16 Chop Suey!, #23 Walk This Way, #3 Believe, #17 Bring Me to Life).


## categories.js — dekady i style (losowanie 30-s zajawek iTunes)

Metoda weryfikacji: dla KAŻDEGO artysty (154 unikalnych) wykonałem to samo zapytanie, co aplikacja (`itunes.apple.com/search?term=<artysta>&entity=song&attribute=artistTerm&limit=60&country=PL`), zastosowałem `pickTrack` (filtr BAD + `includes` nazwy) i policzyłem pulę grywalnych utworów, kto faktycznie jest dopasowany i rozkład lat.

**Kluczowe ustalenia systemowe**
1. **Dekada nie filtruje utworów** – gra wybiera losowego artystę z listy, a potem losowy utwór z jego pierwszych 60 wyników iTunes (cała dyskografia, covery duetów, reedycje). Udział utworów z deklarowanej dekady w puli: U2 w „lata 90” 9%, Coldplay w „2000” 25%, Rolling Stones w „60s” 30%, Elvis 40%, Queen w „80s” 29% (reszta to Bohemian Rhapsody 1975 itp.), Whitney 32%, Madonna w „90s” 21%, Depeche Mode w „80s” 38%, Dua Lipa w „10s” 39%. Mediana ok. 55%. Dla polskich klasyków udział wygląda na niski (Kombi 7%, Lombard 2%, Czerwone Gitary 5-13%, Budka Suflera 5%), ale to artefakt: iTunes podaje rok reedycji/składanki (np. „Słodkiego, miłego życia (2008)”, „Dziwny jest ten świat (2023)”), więc pokazywany po grze `year` bywa błędny o 20-40 lat. Poprawka: filtrować `releaseDate` do zakresu dekady (z tolerancją reedycji przez `collectionName`) lub trzymać `songs` z tytułem i rokiem zamiast `artists`.
2. **Brak dekady 2020+** (i lat 50.); „lata 2010” w ogóle nie zawiera Sanah, Margaret, Sylwii Grzeszczak, Taylor Swift, Lady Gagi, Rihanny (Rihanna i Beyoncé są w „2000”, choć szczyt Rihanny to 2007-2016), a „hity dziś” nie zawiera żadnego polskiego artysty ani Taylor Swift.
3. **Niska pula (ryzyko powtórzeń/pustych zajawek)**: Perfect – 3 utwory (wszystkie 2003/2012 w remake’ach, brak oryginałów), Oasis – 2 (tylko „Remastered”), Feel – 2, Hey – 7, Snap! – 6, Aqua – 7, Corona – 14, Classic – 1, Weekend – 0 (brak w iTunes PL!), After Party – 21, Virgin – 23 (czy to Doda?), Nirvana – 19, Pantera – 29, Coma – 30, Behemoth – 33.
4. **Złe dopasowanie nazwy** (pickTrack używa `includes`): „Boys” (disco polo) zwraca w 10 z 17 wyników Backstreet Boys i Saja Boys z K-Pop Demon Hunters; „Toples” – 44 z 58 to „MARCIN TOPLES” (wokalista, nie zespół), „Peja” – wszystkie 49 to „Peja & Slums Attack” (OK, ale w nazwie nie ma samego „Peja”), „Bedoes” – 0 wyników „Bedoes”, wszystkie „Bedoes 2115 & ...”, „Dżem” – iTunes zwraca „Dzem” (bez diakrytyku, `norm` to naprawia – OK). „Mig” (56 – OK).
5. **Zawyżone kolaboracje**: Taco Hemingway – 19/59 to „Taconafide” (z Quebonafide), Quebonafide – 26/57 to „TACONAFIDE, Quebonafide & Taco Hemingway” i tylko 9 solo; Pezet – 20/56 to „Pezet & Auer”; Bedoes – tylko duety z Lanek/Kubi Producent; Elton John – 17/55 duety (Dua Lipa, Britney Spears). Zajawka może mieć innego wiodącego wykonawcę.

### decades (sprawdzenie dekad)

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| decades.00s: Lady Pank, Kombii | DEKADA | średnia | Lady Pank (szczyt 1983-88) i Kombii (to Kombi, 80s) w „lata 2000” – tylko powroty/reedycje (Lady Pank w 00s: 15% utworów z lat 2000-09). Usunąć; wstawić np. Sistars, Blue Café, Natalia Kukulska, Doda (zamiast Virgin), Amy Winehouse, Black Eyed Peas, Green Day, Shakira, Evanescence, 50 Cent. |
| decades.00s: Rihanna, Beyoncé | DEKADA | niska | Szczyt Rihanny to 2007-2016; Beyoncé 2003-2016. W „2000” tylko 36%/46% utworów z dekady. Dopuszczalne, ale lepiej przenieść Rihannę do „2010”. |
| decades.00s/90s: Hey; 90s/00s: Myslovitz | DUP | niska | Hey i Myslovitz w dwóch dekadach (Hey – szczyt 1993-2002; Myslovitz – 1996-2005). |
| decades.80s/90s: Madonna; 70s/80s: Queen; 60s/70s: Czerwone Gitary | DUP | niska | Ci sami wykonawcy w dwóch dekadach – losowanie dubluje pulę (w „80s” Queen: 71% utworów spoza dekady). |
| decades.70s: Elton John | DEKADA | niska | Szczyt rzeczywiście 70s, ale w puli 45% z dekady, reszta to duety 2010+ (z Dua Lipa, Britney). |
| decades.70s: Maryla Rodowicz, Budka Suflera, Czerwone Gitary | DEKADA | niska | OK (szczyt 70s), ale nazwy w „60s” (Czerwone Gitary) i „70s”. Budka Suflera ma też pik w latach 80.; Maryla – 70s/80s. |
| decades.90s: Kult | DEKADA | niska | Kult: szczyt 1987-1995, pula 54% z 1990-99. OK. |
| decades.90s: Metallica | DEKADA | niska | Szczyt 80s (thrash) i 1991 (Czarny Album); w 90s pula 45%. |
| decades.90s: U2 | DEKADA | średnia | U2 – 91% utworów spoza lat 90. (Joshua Tree 1987, 2000+). Zamienić na np. Pearl Jam, Green Day lub Alanis Morissette. |
| decades.80s: Whitney Houston, Depeche Mode | DEKADA | niska | Pula w dekadzie 32%/38% (Whitney 1992 „I Will Always Love You” to 90s). |
| decades.60s: Aretha Franklin, The Kinks, The Animals, Niebiesko-Czarni | NISZOWE | niska | The Animals i Niebiesko-Czarni nieznani szerokiej publiczności; Aretha/Kinks 54-55% z 60s. Zamienić np. na Simon & Garfunkel, The Doors, Jimi Hendrix, The Supremes. |
| decades.70s: SBB | NISZOWE | niska | SBB – kultowe dla fanów rocka progresywnego, ale zajawki bez wokalu; dla pubquizu ogólnego zbyt niszowe (zamienić na Dire Straits/Deep Purple/Donna Summer, Marek Grechuta, Krzysztof Krawczyk). |
| decades.80s: Bananarama | NISZOWE | niska | Bananarama 82% z 80s, ale mało rozpoznawalna; zamienić na Wham!/George Michael, Duran Duran, Bon Jovi. |
| decades.80s: Perfect | PULA | średnia | Tylko 3 zajawki w iTunes PL (wszystkie rereleasy 2003/2012). Autobiografia, Niewiele ci mogę dać itp. i tak da się trafić, ale rotacja = 3 utwory. |
| decades.90s: Oasis | PULA | średnia | Tylko 2 utwory („Remastered”). Zamienić/ dodać playlistę `songs`. |
| decades.00s: Feel | PULA | średnia | Tylko 2 utwory (2002) – Feel, nazwa „Feel” pasuje też (includes) do dowolnych artystów z „feel” w nazwie. Zastąpić Dodą lub Sistars. |
| decades.90s/00s: Hey | PULA | średnia | 7 utworów (głównie reedycje 2010). |
| decades.10s: Daft Punk | DEKADA | niska | 56% z 2010-19 (RAM 2013); reszta 1995-2007. Dla „2010” ok. |
| decades.10s: Dua Lipa, The Weeknd | DEKADA | niska | Szczyt popularności to 2020+ (Future Nostalgia, Blinding Lights); w „10s” tylko 39%/47% utworów. |
| decades.10s: O.S.T.R., Kortez | NISZOWE | niska | O.S.T.R. i Kortez – nieznani poza fanami rapu/alternatywy; zamienić na Sanah, Margaret, Sylwia Grzeszczak, Ralph Kaminski, Daria Zawiałow. |
| decades (brak) | BRAKI | średnia | Brakujące oczywiste nazwiska dla polskiego pubquizu: 60s – Anna German, Marek Grechuta, The Doors, Simon & Garfunkel, Jimi Hendrix; 70s – Krzysztof Krawczyk, 2 plus 1, Deep Purple, Dire Straits, Donna Summer; 80s – Bajm, Oddział Zamknięty, Papa Dance, Wham!/George Michael, Duran Duran, Bon Jovi, Guns N’ Roses, Prince, Roxette, Europe; 90s – Kayah, Kasia Kowalska, Varius Manx, T.Love, Pearl Jam, Green Day, Britney Spears, Alanis Morissette, Radiohead, Celine Dion; 00s – Doda, Sistars, Blue Café, Natalia Kukulska, Amy Winehouse, Shakira, Black Eyed Peas, Maroon 5; 10s – Sanah, Margaret, Sylwia Grzeszczak, Cleo, Taylor Swift, Lady Gaga, Justin Bieber, Sia. |

### styles

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| styles.disco-polo: Weekend | PULA | krytyczna | 0 wyników w iTunes PL – wykonawca przy losowaniu zawsze jest pomijany po 2 próbach × timeout (marnuje budżet RESOLVE_CAP 20 s). Usunąć lub zastąpić (Piękni i Młodzi, Extazy, Czadoman). |
| styles.disco-polo: Classic | PULA | krytyczna | Jedyny wynik (2021). Usunąć/ zastąpić. |
| styles.disco-polo: Boys | NAZWA | krytyczna | `includes('boys')` dopasowuje Backstreet Boys (10/17) oraz fikcyjny zespół z K-Pop Demon Hunters – w „disco polo” zagra Backstreet Boys. Poprawka: dodać filtr dokładnej nazwy lub użyć `songs` z tytułami. |
| styles.disco-polo: Toples | NAZWA | średnia | Wyniki to „MARCIN TOPLES” (44) – raczej solowe nagrania; zajawki 2024-25 dla „Toples”. Sprawdzić czy to zamierzone. |
| styles.disco-polo: Akcent | NAZWA | niska | Pula to polski Akcent (zgodne), ale istnieje rumuński Akcent o tej samej nazwie – ryzyko wyników innego artysty przy zmianie rankingu iTunes. |
| styles.disco-polo: Łobuzy, After Party, Skaner, Mig | NISZOWE | niska | Mało znani szerokiej publiczności (Łobuzy 25 utworów, After Party 21). Dodać Zenon Martyniuk (solo), Piękni i Młodzi, Extazy, Jacek Stachursky, Mejk. |
| styles.rap-pl: Kazik | STYL | niska | Kazik (Kult) – rock/punk-rap; zdublowany w „rock PL” przez Kult. Zamienić na Liroy, Tede, Fokus, WWO, Molesta, Hemp Gru, Szpaku, Young Igi (te nazwiska są w lyrics.js rap-pl-*, a nie ma ich w puli). |
| styles.rap-pl: Peja, Bedoes, Pezet, Sokół, Białas, Mata | PULA | niska | Zajawki w ponad 60% to duety/gościnne (Peja & Slums Attack, Bedoes 2115 & Lanek...). Nie błąd, ale zaznaczyć. |
| styles.rock-pl: Lombard | STYL | niska | Lombard – synth/new wave, raczej „pop/new wave PL”. Dodać Armia, Oddział Zamknięty, Voo Voo, Pidżama Porno, Happysad, Elektryczne Gitary. |
| styles.rock-pl: Perfect, Hey | PULA | średnia | j.w. (3 i 7 utworów). |
| styles.rock-pl: Acid Drinkers | STYL | niska | Metal/crossover; w puli covery („Hit the Road Jack”, „Love Shack”) – zajawki cover-songów nieoczekiwane. |
| styles.rock-world: The Police, Coldplay, Foo Fighters | STYL | niska | Police – new wave; Coldplay – pop-rock; ok, ale brak Deep Purple, Aerosmith, Bon Jovi, Dire Straits, Scorpions, The Who, Green Day, Linkin Park. |
| styles.pop-world | BRAKI | niska | Brak Shakiry, Justina Biebera, Adele, Celine Dion; lista oparta na wokalistkach. OK. |
| styles.dance-90: Snap!, Aqua, Corona | PULA | średnia | 6, 7 i 14 utworów – po losowaniu wykonawcy zajawki się powtarzają. Dodać Whigfield, E-Type, Mr. President, Captain Hollywood, Rednex, Technotronic, Black Box, Alexia. |
| styles.dance-90: Ace of Base, Scooter | STYL | niska | Ace of Base to pop (jest w 90s); Scooter – szczyt 1995-2005, pula 90s ≈ 30%. |
| styles.hits-now | BRAKI | średnia | Brak polskich artystów (Sanah, Mata, Dawid Podsiadło, Margaret), brak Taylor Swift, Sabrina Carpenter, Chappell Roan, Lady Gagi; „hity dziś” = 12 anglojęzycznych nazwisk. |
| styles.hits-now `songs` | DANE | niska | Pole `songs` (5 pozycji z angielskimi fragmentami tekstu) jest martwe: gdy kategoria ma `artists`, `resolveTrack` ignoruje `songs`; w trybie lektor kategoria nie jest używana (lektor czyta z lyrics.js). Usunąć albo przenieść do lyrics. Dodatkowo fragmenty to dosłowne cytaty tekstów (prawa autorskie) – wbrew intencji lyrics.js. |
| styles.evergreen-pl | BRAKI | średnia | Brak Anna German, Marek Grechuta, Zbigniew Wodecki, Ewa Demarczyk, Halina Frąckowiak, Danuta Rinn, Jerzy Połomski, Mieczysław Fogg. Zdzisława Sośnicka i Wojciech Młynarski – mało znani młodszej publiczności (Młynarski = autor, nie wykonawca, 13/60 wyników z błędnym zapisem „Mlynarski”). |
| styles.metal | BRAKI | niska | Brak Judas Priest, Motörhead, Ozzy Osbourne, Korn, Vader, Turbo, Kat. Behemoth/Pantera/Sepultura ok. |
| styles.rap-pl: Kękę | NAZWA | niska | iTunes: „KęKę”; norm → „keke”; includes też „Keke Palmer” (brak w wynikach – ok). |


## questions.js — zaszyte demo-zestawy quizu

Zawiera 3 zestawy: `geografia` (8 pytań), `popkultura` (6 pytań, label „Film i popkultura”), `muzyka` (50 pytań). Nadpisywanie przez data/: klucz = nazwa pliku bez quiz-/.json (quiz-loader.js, `window.CATEGORIES.quiz[key] = data`).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| questions.js:muzyka | DUP | niska | Zestaw jest **identyczny** (50/50 pytań, ten sam JSON) z data/quiz-muzyka.json – nadpisywany 1:1, więc kod zaszyty to martwy duplikat (1/3 pliku, ~7 KB). Wszystkie uwagi do muzyki z sekcji „muzyka” obowiązują. Jednocześnie jeśli data/quiz-muzyka.json nie załaduje się (błąd sieci/offline), użytkownik dostaje te same 50 pytań – to jedyny sens zostawienia. |
| questions.js:geografia | NADPISANE | niska | Zestaw 8 pytań jest w pełni nadpisany przez data/quiz-geografia.json (100 pytań, label „Geografia świata”); żadne z 8 pytań demo nie występuje w paczce. Martwy kod/ offline fallback. Pytanie „Najdłuższa rzeka świata?” akceptuje i Nil, i Amazonkę (obie wersje spornie); „Przez ile stref czasowych rozciąga się Rosja?” – 11 (zgodne z 2026). |
| questions.js:popkultura | NIE NADPISANE | średnia | Brak data/quiz-popkultura.json, więc w grze pozostaje osobna kategoria „Film i popkultura” z 6 pytaniami obok pełnej „Film i kino” (quiz-film.json, 100 pytań). Brak `desc` (inne paczki mają „N pytań · poziom średni”). Pytania poprawne (Pulp Fiction – Tarantino, 1994; Forrest Gump – Tom Hanks; Krypton; „Doktor No” 1962; Arendelle) ale łatwe (Arendelle, Krypton, Dumbledore). „Czarodziej, mentor Harry’ego Pottera (dyrektor Hogwartu)” – wskazuje Dumbledore’a jednoznacznie, ale Snape/McGonagall też dyrektorami; minimalne ryzyko. Rekomendacja: usunąć klucz `popkultura` albo przemianować (np. `popkultura` → pełna paczka), aby uniknąć duplikatu kategorii. |
| questions.js (kolejność) | UWAGA | niska | `window.CATEGORIES.quiz = {...}` (przypisanie) w questions.js jest ładowane po categories.js/playlists.js/lyrics.js; kolejność skryptów w index.html jest poprawna (categories.js ustawia `window.CATEGORIES = {…}` jako pierwszy). Zamiana kolejności skasowałaby `playlists`/`lyrics` – kruche. |


## playlists.js — gotowe playlisty (snapshot charts Deezer, 7 list × ~50 utworów)

Metoda: dla każdego z 349 wpisów odtworzyłem tor `resolveFromSongs` (iTunes `term=<artysta>&attribute=artistTerm&limit=60&country=PL`, następnie `find(textMatch(tytuł) && textMatch(artysta))`; brak trafienia → utwór pomijany).

**Wynik: 229/349 (66%) utworów ma grywalną zajawkę, 120 (34%) jest „martwych”.** Per playlista: dz-rock 49/50, dz-top 40/50, dz-metal 41/50, dz-pop 37/50, dz-film 26/50, dz-dance 19/49, dz-rap 17/50. Główna przyczyna: iTunes zwraca tylko pierwsze 60 utworów artysty, a utwór z playlisty (nowy singiel, bardziej niszowy numer) nie mieści się w tej puli (Taco Hemingway, Mata, Pezet, Calvin Harris, Shakira, Daft Punk, Coldplay, Madonna, Beyoncé, Drake, Kendrick…). Gracz widzi mniejszą playlistę niż deklaruje („~50 utworów”), a w dz-rap/dz-dance ponad połowa pozycji nigdy nie wyleci. Poprawka: wyszukiwanie po `term=<tytuł> <artysta>` (bez artistTerm) albo zapisanie `preview` w danych.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| playlists.dz-rap | PULA | krytyczna | 33 z 50 utworów nierozwiązywalnych (66%); dodatkowo zaszyte pozycje typu „Janice STFU – Drake”, „4 Raws – EsDeeKid”, „Smoking Gun – Inpatient”, „Fever – Buckshot”, „Saudi – Tax Free” są nieznane polskiej publiczności. Lista to chart Deezer, nie playlista pubquizowa: bez klasyków (Wu-Tang, Notorious B.I.G., 2Pac, Dr. Dre, Snoop). |
| playlists.dz-dance | PULA | krytyczna | 30 z 49 nierozwiązywalnych (61%); zawartość to współczesny house/EDM (Anyma, John Summit, Sonny Fodera, Kato, ANOTR) praktycznie nieznany; w „dance” są też disco polo (Łobuzy „Mandacik”, Skolim „Niewinna”, David Tango „Napalona”) i Waterflame „Field of Memories” (muzyka z gry Newgrounds); „Turn The Lights Off” 2x (Kato i Justė – różne utwory o tym samym tytule, powielony tytuł w jednej playliście). |
| playlists.dz-film | PULA/NISZOWE | krytyczna | 24 z 50 nierozwiązywalnych; dużo ścieżek anime/gier niedostępnych dla ogółu: „Nyanpasu Yabure Kabure (Renge Song)”, „Majula” (Dark Souls), HOYO-MiX x3 (Genshin), „Lumière” (Clair Obscur), „in the pool – kensuke ushio”, „Ode to Crayola – Lemon Demon”, „Evil's Bane”, „Zoo – Disney”. Nieprzydatne do pubquizu. Brakuje klasyków soundtracków (Bond, Titanic, Króla Lwa, Gwiezdne Wojny, Mission Impossible, Pulp Fiction). |
| playlists.dz-film | FAKT/ARTIST | średnia | „Ain't No Mountain High Enough – Marvin Gaye” (to duet Marvin Gaye & Tammi Terrell z 1967; ok jako „Marvin Gaye”), „Distant Lover – Marvin Gaye” (nie film), „How Deep Is Your Love – Calvin Harris” (cover Bee Gees – oryginał 1977; wykonawca: Calvin Harris & Disciples), „Popular”/„One Of The Girls” – The Weeknd (serial HBO „The Idol”), „Alone in Love – Jean-Pierre Taïeb” (obskurne), „Captain Freedom's Workout – Harold Faltermeyer”. |
| playlists.dz-top / dz-pop | DUP | średnia | 21 wspólnych utworów dz-top/dz-pop; łącznie 37 duplikatów w całym pliku (309 unikalnych z 349). Jedna lista pubquizowa wystarczy. |
| playlists.dz-top / dz-pop | CZAS | średnia | Chart „top 50 teraz” jest snapshotem (2025-26: „Dracula – Tame Impala”, „The Fate of Ophelia – Taylor Swift”, „Golden – HUNTR/X”) – zestarzeje się w kilka tygodni; label „top 50 teraz” będzie nieprawdziwy. |
| playlists.dz-top | NISZOWE | niska | „Talk To You (ft. 54 Ultra) – ANOTR”, „Hell N Back – Bakar”, „Self Aware – Temper City”, „Boston – STELLA LEFTY”, „Stateside + Zara Larsson – PinkPantheress” (ostatni 0% rozwiązań) – nieznane. |
| playlists.dz-rock | KATEGORIA | krytyczna | Lista „rock” zawiera 6x Michael Jackson (Billie Jean, Smooth Criminal, Dirty Diana, They Don't Care About Us, Beat It, Bad), Britney Spears („...Baby One More Time”), Kylie Minogue („Can't Get You out of My Head”), Sia („Chandelier”), Adele („Easy On Me”), Tom Odell, Mariah the Scientist, Djo, Albert Hammond – to nie rock. Dobry odsetek rozwiązań (49/50), ale tematycznie mylący. |
| playlists.dz-metal | KATEGORIA | niska | „NEVER ENOUGH – Turnstile” (hardcore punk), „Killing In The Name – Rage Against the Machine” (rap metal); „THE DEATH OF PEACE OF MIND – Bad Omens” (metalcore), „R.I.P. – Motionless In White”, „Like A Villain – Bad Omens” – dla ogółu nieznane. 4x AC/DC (hard rock). Artysta z literą „Я” („KoЯn”) mogą psuć wyszukiwanie. |
| playlists.dz-pop | NISZOWE | niska | „Die On This Hill – SIENNA SPIRO”, „Headphones On/Fame is a Gun/Diet Pepsi – Addison Rae”, „Gabriela – KATSEYE”, „Show Me Love – WizTheMc”, „Sally, When The Wine Runs Out – Role Model”. 13 z 50 nierozwiązywalnych (Lady Gaga „Die With A Smile”, Rosé „APT.”, Madonna „Bring Your Love”, Beyoncé „TEXAS HOLD 'EM”, Marshmello, David Guetta). |
| playlists.* | LITERÓWKI | niska | Tytuły z pełnymi dopiskami: „CAN'T STOP THE FEELING! (from DreamWorks Animation's "TROLLS")”, „Ma Meilleure Ennemie (from the series Arcane League of Legends)”, „Nothing Breaks Like a Heart (feat. Miley Cyrus)” – po stronie odpowiedzi `norm` obcina nawiasy (OK), ale tytuły z „/” („Jesień - Tańcuj / Autumn Dance”, „Koniec Lata / End of Summer”) oraz artyści typu „Carolina Gaitán - La Gaita” czy „HUNTR/X” utrudniają odpowiedź gracza. |
| playlists.dz-rap/dz-pop | PL | niska | Polskie rapy: miu, Żabson, Gibbs, Majki, Taco, Mata, Fukaj, Quebonafide, Pezet, Kizo, Bedoes… – ale 13 z 17 nierozwiązywalnych; wśród oczywistych brakuje klasyków PL (Paktofonika, Kaliber 44, Liroy). |
| playlists.dz-top | ARTIST | niska | „Nareszcie – Męskie Granie Orkiestra” (nierozwiązywalne – 60 limit); „Skyfall – Adele” (OK); „Georgia On My Mind – Ray Charles” (przypadkowy klasyk w chartach). |


### lyrics.js / tlum-pl (polskie po angielsku, 97 utworów)

Weryfikacja: zapytanie iTunes po `tytuł + wykonawca` i po samym tytule (country=PL). Błędy atrybucji potwierdzone metadanymi iTunes oraz znanymi faktami (oznaczone PEWNE); pozycje, których iTunes PL w ogóle nie zawiera, oznaczone „niezweryfikowane” (nie zgłaszam jako błąd).

Ogólnie: ok. 95/97 opisów to dosłowne tłumaczenie tytułu na angielski („A cheerful 1960s pop tune offering flowers…” = Mamy dla was kwiaty; „boys don’t cry” = Chłopaki nie płaczą), czyli polski gracz odzyskuje tytuł bez znajomości utworu, a opisy bez słów kluczowych są zbyt ogólne. Tryb działa jako zadanie tłumaczeniowe, nie rozpoznawanie piosenki; sensowniejsze byłyby opisy fabuły/okoliczności bez tytułu (patrz zagadka-rock). 14 wpisów ma błędnego wykonawcę/lub nie istnieje.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| tlum-pl#32 / tlum-pl#33 | DUP | krytyczna | To ten sam utwór: „Remedium” Maryli Rodowicz ma w refrenie „wsiąść do pociągu byle jakiego” (iTunes: „Remedium (Wsiąść do pociągu)”). Dwa pytania o jedną piosenkę z dwoma różnymi „odpowiedziami” i rokiem 1972/1971. Usunąć #32 lub #33. |
| tlum-pl#37 | ARTIST | krytyczna | „Mamy dla was kwiaty” – Niebiesko-Czarni (1968), nie Skaldowie. PEWNE (iTunes). |
| tlum-pl#59 | ARTIST | krytyczna | „Jeszcze będzie przepięknie” – Tilt (Tomasz Lipiński), nie Sztywny Pal Azji. PEWNE (iTunes: Tilt). |
| tlum-pl#61 | ARTIST | krytyczna | „Niewiele ci mogę dać” – Perfect, nie Bajm. PEWNE. |
| tlum-pl#62 | ARTIST | krytyczna | „Trudno tak (razem być nam ze sobą)” – Krzysztof Krawczyk (duet z Edytą Bartosiewicz), nie Ryszard Rynkowski. PEWNE (iTunes). |
| tlum-pl#76 | ARTIST/ROK | krytyczna | „Niepokonani” – Perfect (rok 1983), nie Bajm 1993. PEWNE. |
| tlum-pl#86 | ARTIST/ROK | krytyczna | „Mała wojna” – Lady Pank (1988), nie Lombard 1983. PEWNE (iTunes). |
| tlum-pl#89 | ARTIST/ROK | krytyczna | „Tak bardzo się starałem” – Czerwone Gitary (1969), nie Bajm 1990. PEWNE (iTunes). |
| tlum-pl#90 | ARTIST/ROK | krytyczna | „Ten typ tak ma” – Ryszard Rynkowski (hit lat 90.), nie T.Love 1996. PEWNE. |
| tlum-pl#91 | ARTIST/ROK | krytyczna | „King” – T.Love (1992, album „King”), nie Kult 1990. PEWNE. |
| tlum-pl#31 | ARTIST | średnia | „Wielka woda” – piosenka Maryli Rodowicz (i covery Raz Dwa Trzy), a nie Izabeli Trojanowskiej. PRAWDOPODOBNE. |
| tlum-pl#44, #85 | NIEISTNIEJĄCE | średnia | „Stop! Smoking – Lady Pank” i „Marcheweczka – Lady Pank”: brak utworów o takim tytule w iTunes (znalezione tylko covery lub inne wykonawcy, np. Car Seat Headrest dla „Stop Smoking”); prawdopodobnie halucynacja. PRAWDOPODOBNE – zweryfikować. |
| tlum-pl#65 | NIEISTNIEJĄCE | średnia | „Co ci mogę dać – Maanam 1980”: w iTunes tylko „Cóż ci więcej mogę dać” (Czerwone Gitary 1970); tytuł wygląda na pomyłkę. PRAWDOPODOBNE. |
| tlum-pl#63 | NIEJEDN | niska | „Szczęśliwej drogi już czas” – oryginał Krzysztofa Klenczona i Trzech Koron (1971), Rynkowski to cover (1996). Gracz odpowie „Klenczon”. Poprawka: dodać wariant lub zmienić na wersję oryginalną. |
| tlum-pl#25 | ROK | niska | „Chodź, pomaluj mój świat” – 2 plus 1 powstała w 1972, nie 1976 (iTunes najwcześniej 1972). PRAWDOPODOBNE. |
| tlum-pl#28 | ROK | niska | „Historia jednej znajomości” – Czerwone Gitary 1966-67 (iTunes 1966), nie 1971. PRAWDOPODOBNE. |
| tlum-pl#74 | ROK | niska | „A wszystko to (bo Ciebie kocham)” – Ich Troje 1999 (iTunes), nie 2001. PRAWDOPODOBNE. |
| tlum-pl#93 | ROK | niska | „Po co wolność” – Kult ok. 1989-90 (iTunes 1989), nie 1993. PRAWDOPODOBNE. |
| tlum-pl#55 | FAKT | niska | „Sen o Victorii” – opis „named after a longed-for victory” bezpodstawny (Victoria to postać/miejsce w tekście); nie opisywać znaczenia tytułu. |
| tlum-pl#45, #48, #53, #67, #75, #80, #82, #84, #87, #88, #95 | NIEZWERYFIKOWANE | niska | Brak (lub tylko covery) w iTunes PL – atrybucje do zweryfikowania ręcznie, m.in. „Mój jest ten kawałek podłogi” (iTunes: Mr. Zoob – cover), „O mnie się nie martw” (Margaret 2014, Studio Buffo 1995), „Wino”, „To co czuję”, „Zachciało Ci się”, „Co z nami będzie” (iTunes: Sylwia Grzeszczak & Liber 2008 – inny utwór), „Lubię mówić z Tobą”, „Tańczę z Tobą”, „Dwie ostatnie noce”, „Wakacje z blondynką” (covery Maleńczuka, Kiljańskiego), „Co masz w środku”. |
| tlum-pl#0-#96 (prawie wszystkie) | WYCIEK | średnia | Opis = dosłowne tłumaczenie tytułu (np. #13 „grey rainy morning” ≈ spleen; #24 „elevator straight up to heaven”; #43 „castles in the sand”; #71 „little steamboat”). Gracz tłumaczy tytuł z powrotem na polski. Bez informacji o wykonawcy/okolicznościach rozgrywka sprowadza się do tłumaczenia. Poprawka: opisywać treść/okoliczności (kto, co, kiedy), nie tytuł. |
| tlum-pl#7, #33, #40, #50, #54, #58, #62, #70, #72, #73, #79 | ZBYT OGÓLNE | średnia | Opisy pasują do wielu piosenek („A warm, grateful ballad dedicated to a faithful friend”, „A heartfelt pop ballad saying that everything good in life is there simply because of you”). Niezgadywalne bez znajomości wykonawcy. |

### lyrics.js / rap-pl-opis i rap-pl-zagadka (59 utworów)

Najsłabsza część lyrics.js. Opisy to metadane („warszawski raper”, „wytwórnia”, „kultowy kawałek”), a nie opis treści; ok. 30 z 59 (≈ 50%) to generyczny „kawałek o…” pasujący do dziesiątek utworów. Dodatkowo: w rap-pl-zagadka tytuł jest podany w opisie („kawałek nazwany X”), w rap-pl-opis opis streszcza tytuł. Wiele pozycji (ok. 40 z 59) nie istnieje w iTunes PL, więc ich metadane (rok, wykonawca) są niezweryfikowane – wymaga przeglądu przez znawcę.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| rap-pl-opis#22 | WYCIEK | krytyczna | „…wspomnień topniejących jak wosk” – tytuł „Wosk” w treści (lektor czyta). |
| rap-pl-opis#27 | WYCIEK | krytyczna | „deszcz jako tło zadumy” – tytuł „Deszcz na betonie”. |
| rap-pl-opis#28 | WYCIEK | krytyczna | „mówieniu prawdy prosto w oczy” – tytuł „Czysta brudna prawda”. |
| rap-pl-opis#9, #7, #5, #12, #10, #16, #4 | WYCIEK | średnia | #9 „szukaniu pomysłu na życie” (Pomysł na siebie); #7 „tym, co się ma, a czego się pragnie” (cały tytuł); #5 „ostry jak sos” (Tabasko); #12 „naiwnych misiów” (Nmisie); #10 „byciu prawdziwym” (Real); #16 „tańcu w miejscu” (Tango); #4 „nocnego miasta” (Głucha noc). |
| rap-pl-opis#1 | WYCIEK | średnia | „numer Eldo i Pezeta” zdradza wykonawców; ponadto Grammatik jako wykonawca jest niezweryfikowany. |
| rap-pl-opis#8 | WYCIEK | niska | „członka Kaliber 44” zdradza Abradaba (artist leak). |
| rap-pl-opis#4, #24, #28 | WARIANTY | średnia | Wykonawca „Peja / Slums Attack” – znak „/” nie jest separatorem w `artistMatch` (separatory: & , feat ft x i), więc odpowiedź „Peja” (4 z 17 znaków) zostanie odrzucona; „Slums Attack” przejdzie. Poprawka: „Peja & Slums Attack” albo „Peja”. |
| rap-pl-opis#26 | FAKT | średnia | „Magia – Kaliber 44 (1996)”: utwór nazywa się „Magia i miecz” (album „W 63 minuty dookoła świata” 1996); iTunes ma tylko „Psychodela” i „Plus i minus”. PRAWDOPODOBNE – poprawić tytuł. Gracz wpisujący pełne „Magia i miecz” zostanie odrzucony (zawieranie 5/14 < 0,6). |
| rap-pl-opis#17 | ROK/ARTIST | średnia | „To nie jest hip-hop” – Quebonafide & The Returners feat. KRS-One, 2017 (iTunes), nie 2014. PRAWDOPODOBNE. |
| rap-pl-zagadka#18 | ARTIST/ROK | średnia | „Tamagotchi” – wykonawca w iTunes/Deezer to TACONAFIDE (Taco Hemingway + Quebonafide), nie solo Taco 2017. Do tego opis zdradza tytuł („elektronicznym zwierzakiem z lat 90.”). |
| rap-pl-zagadka#15 | ROK/WYCIEK | średnia | „Bubbletea” – iTunes 2020 (utwór z albumu Taconafide/solo z lat 2019-20), nie 2017; opis „nazwany modnym azjatyckim napojem z kuleczkami” = tytuł. |
| rap-pl-zagadka#2 | FAKT | krytyczna | „Chwile ulotne” – utwór z debiutanckiego i jedynego albumu Paktofoniki „Kinematografia” (2000), nie „z drugiego albumu… w cieniu tragedii (2002)”; iTunes: 2000. PEWNE. Podobnie #1 „Ja to ja” (iTunes pokazuje 2002 – reedycja; oryginał 2000 – bez zastrzeżeń). |
| rap-pl-zagadka#0 | WYCIEK | średnia | „nazwany dwoma przeciwstawnymi znakami” = Plus i minus. |
| rap-pl-zagadka#1, #19, #22, #23, #25, #26, #27, #28, #14, #16, #17, #13 | WYCIEK | średnia | Opis w ogóle tłumaczy tytuł: „bohater jest dokładnie tym, kim jest” (Ja to ja), „stadionową kamerą wyłapującą całujące się pary” (Kiss cam), „życie bez pieniędzy” (Reprezentuję biedę), „kara, którą trzeba odsiedzieć” (Życie jak wyrok), „hiszpańskim trunkiem” (Sangria), „morskich głębin” (Plankton), „diabła” (Diablo), „porównanych do kamienia” (Marmur), „wymarzonym autem w mrocznym kolorze” (Czarne Porsche), „pełzające stworzenia” (Robaki), „nazwany konkretnym lokalem” (Cafe Belga), „słowiańskich atutów” (My Słowianie). |
| rap-pl-opis#0, #2, #14; rap-pl-zagadka#13, #19 | DOBRE | – | Jedyne pozycje zgadywalne (Jestem Bogiem, Scyzoryk, Patointeligencja, My Słowianie, Kiss cam) – zostawić i rozbudować. |
| rap-pl-* | ZBYT OGÓLNE | krytyczna | Opisy typu „Refleksyjny, miastowy kawałek o przemijaniu…” (#15), „Intymny, szczery kawałek o własnym świecie…” (#25), „Liryczny, nocny kawałek o tęsknocie…” (#19), „Kawałek o porządkowaniu spraw…” (#20), „motywacyjny kawałek o wartościach” (#18) pasują do setek utworów – niezgadywalne. ok. 30/59. |
| rap-pl-* | BRAKI | niska | W całym lyrics.js brak: polski pop 2000-2020 (Doda, Sanah, Margaret, Dawid Podsiadło, Kayah „Supermenka”, Edyta Górniak), disco polo, hity PRL w angielskiej wersji. |
| rap-pl-zagadka#16 | ARTIST | niska | „Robaki – Quebonafide 2019”: brak utworu w iTunes – niezweryfikowane. |


## Wnioski systemowe

**Pytania quizowe (literatura, sztuka, mitologia, kosmetyki, muzyka) – 450 pytań przejrzanych:**
- Krytyczne (zła ocena gracza): literatura 6 (#96 FAKT Booker, #34/#90 SLOTY, #78 artefakt w treści, #35 wyciek, #19 niejednoznaczność), sztuka 5 (#97-#99 SLOTY, #83, #80), mitologia 3 (#98, #99 SLOTY, #16), kosmetyki ok. 29 (m.in. 12 pytań z odpowiedzią w treści, #59/#78/#79 błąd/niejednoznaczność, sloty z podaną odpowiedzią #85-#95), muzyka 0. Średnie: literatura ok. 15, sztuka ok. 25, mitologia ok. 20, kosmetyki ok. 14, muzyka 5.
- Powtarzalne wzorce generatora: (1) **Sloty „w dowolnej kolejności” z odrębnymi listami** (literatura #34, #90; mitologia #98, #99; kosmetyki #37, #90) – odrzuca poprawne odpowiedzi w innej kolejności; **identyczne listy w slotach bez unikalności** (sztuka #97-#99) – można wpisać to samo 3x. Poprawka w silniku: wspólna lista i `unique:true`, albo sloty-zbiór. (2) **Odpowiedź lub rdzeń w treści** (kosmetyki: ok. 25 pytań – „(róż)”, „maska w płachcie”, „typu wazelina”; sztuka: tłumaczenia tytułu; literatura #35). Dodać krok walidacji: żaden wariant poprawny nie może być podciągiem treści, a rdzeń (≥5 znaków, stem) nie może się w niej powtarzać. (3) **Klastry tematyczne** – ten sam obiekt 3-5 razy (Hamlet 4x, Van Gogh 5x, Mona Lisa 5x, Zeus-grecko-rzymski 12 pytań), a treść jednego pytania zdradza odpowiedź innego. Potrzebny dedupe po encji (odpowiedzi) i limit 1-2 pytania na encję. (4) **Pytania opisowe** z długą odpowiedzią swobodną (mitologia #46, #56; kosmetyki #87-#95) – lista wariantów nie pokryje parafraz. Zastąpić ABCD lub krótkim terminem. (5) **Szkolna „definicja → termin”** (kosmetyki, sztuka, literatura) zamiast haczyka pubquizowego; brak trudnych. (6) Artefakty generatora w treści (literatura #78 „— pomyłka;”). (7) Dobre: ABCD mają 4 opcje, poprawne rozłożone równo (poza D w literaturze 2/28 i kosmetykach 3/28), dystraktory zwykle trafne.
- **Muzyka** (kluczowa dla STACJI): fakty bezbłędne, ale 80% pytań to „kto wykonuje hit X” (trywialne), PL 16%, brak lat 50. i 2020+, brak rapu PL/disco polo/popu PL, brak ABCD i formatów muzycznych (dokończ tytuł, rok singla, pseudonim → imię, kto nie należał do zespołu). Tylko 1 haczyk (#15). 50 pytań to za mało na sesję (zaszyte demo jest 1:1 kopią pliku).

**Tryb muzyczny i lektor – kluczowe liczby:**
- lyrics.js: 345 opisów; ok. 60 z 125 tlum-int, ok. 14 z 32 zagadka-pop, ok. 9 z 32 zagadka-rock i ok. 95 z 97 tlum-pl **zdradza tytuł dosłownym tłumaczeniem** (lektor czyta to na głos); rap-pl-* (59) – ok. 50% generyczne („kawałek o…”) i niezgadywalne, kilka zdradza tytuł/wykonawcę. Poprawka procesu: generować opis w 2 krokach (fakty o utworze → opis bez słów z tytułu i bez imienia wykonawcy) + automatyczny test stemów (tytuł/artysta vs opis).
- tlum-pl: 9 błędnych atrybucji potwierdzonych (artist/rok: #37, #59, #61, #62, #76, #86, #89, #90, #91) + 1 duplikat (#32/#33), 3-5 prawdopodobnie nieistniejących; do pełnej weryfikacji przed publikacją.
- categories.js: dekady nie filtrują utworów po `releaseDate` (mediana 55% utworów z deklarowanej dekady; rok z iTunes często = reedycja), brak dekady 2020+, 3 pozycje disco polo bez grywalnej puli (Weekend 0, Classic 1, Boys → Backstreet Boys), ok. 8 artystów z pulą ≤7 utworów (Oasis 2, Feel 2, Perfect 3, Snap! 6, Hey 7, Aqua 7), liczne braki oczywistych nazwisk PL (Bajm, Kayah, Kasia Kowalska, Anna German, Wodecki, Doda, Sanah, Armia, Oddział Zamknięty, Liroy, Tede, Zenon Martyniuk).
- playlists.js: 34% (120/349) pozycji nierozwiązywalnych z powodu limitu 60 wyników artisty i dopasowania tytułu; dz-rap 66% i dz-dance 61% martwych; dz-rock zawiera 6x Michael Jackson jako „rock”; dz-film pełen obskurnych ścieżek z gier/anime; snapshot „top teraz” szybko się starzeje; 37 duplikatów między listami.
- questions.js: `muzyka` identyczna z plikiem (martwy duplikat), `geografia` w pełni nadpisana (martwy kod), `popkultura` nienadpisana (6 pytań obok pełnej „Film i kino”).
