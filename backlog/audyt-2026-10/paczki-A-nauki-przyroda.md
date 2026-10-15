## Medycyna (quiz-medycyna, 50 pytań)

Ogólnie: paczka to w dużej mierze kopia pytań z biologii (ok. 22/50 to duplikaty lub bliskie duplikaty bio: insulina, komory serca, hemoglobina, krwinki, płuca, kość udowa, aorta, tarczyca, nerki, przepona, 5 litrów krwi, szkorbut, witamina D, szpik...). Autentycznie "medyczne" są tylko: #2-3, #4, #7-9, #13-15, #19, #25, #27, #29, #32, #36-37, #42, #45. ~60% trywialnych ("lekarz leczący dzieci" -> pediatra), 25% średnich, 15% z pewnym haczykiem (112, 206 kości, kości dłoni, 0 Rh-). ABCD często ma 3 opcje.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| med#1 | NIEJEDN/FAKT | krytyczna | Jak bio#7: "komór" = 2, ale 4 jamy serca (2 przedsionki + 2 komory) to odpowiedź większości graczy. Zaakceptować "4/cztery" lub przeredagować na "jam serca". |
| med#0,#5,#6,#10,#11,#17,#18,#21,#23,#24,#26,#28,#33,#40,#41,#44,#46,#47,#49 | DUP | średnia | Prawie identyczne z pytaniami w biologii (np. #0 = bio#3, #5 = bio#4, #10 = bio#5, #17 = bio#2, #18 = bio#11, #24 = bio#10, #26 = bio#53, #28 = bio#24, #33 = bio#18, #40 = bio#63, #49 = bio#61). Usunąć z jednej z paczek; w medycynie zostawić pytania stricte medyczne. |
| med#8 | WARIANTY | średnia | Brak angielskiego "CPR" i "reanimacja"; w treści "resuscytację krążeniowo-oddechową" praktycznie rozwija skrót (WYCIEK, niska). |
| med#9 | WARIANTY | niska | "36,6" przyjęte, ale "36,6°C", "36,6 stopnia", "36,6 C" mogą przepaść (>60% zawierania dla "36,6 stopnia" nie jest spełnione). Dodać. |
| med#13 | WYCIEK | niska | "atak serca" -> "zawał serca" (rdzeń "serca"). |
| med#14 | WYCIEK | krytyczna | "promienie X (rentgenowskie)" w treści = nazwisko Röntgen; wariant "Rentgen" zaliczy przepisanie z pytania. Usunąć nawias. |
| med#15 | WYCIEK | niska | "znieczulaniem" ~ anestezjologia. |
| med#20 | WARIANTY | niska | Dodać "słońce", "promieniowania UV", "nasłonecznienia", "UVB". |
| med#21 | WARIANTY | niska | Wariant "C" OK dla pytania o witaminę. Dup bio#55. |
| med#29 | JĘZYK | niska | "zabieg diagnostyczny" -> "badanie". Dodać "ultrasonograf", "usg". |
| med#30 | NIEJEDN/WARIANTY | krytyczna | "Co lekarze nazywają diagnozą?" — wolna definicja ("rozpoznanie choroby", "rozpoznanie", "określenie choroby"); każda inna poprawna parafraza ("ustalenie, co dolega pacjentowi") przepadnie. Pytanie nudne i niegrywalne — usunąć. |
| med#31 | WARIANTY | krytyczna | Odpowiedź "0/zero/grupa 0" — gracze piszą literę "O" ("grupa O"); brak "O", "grupa O", "0 Rh-". Dup bio#60. |
| med#32 | JĘZYK/WARIANTY | średnia | "Kto, jako dwukrotna noblistka, zajmowała się..." — niegramatyczne. Brak "Curie", "Marie Curie". |
| med#34 | WARIANTY | niska | Dodać "immunologiczny", "uklad immunologiczny" jest, ale "immunologiczny" sam nie. |
| med#35 | TRYWIALNE/WYCIEK | niska | "zmysł związany z narządem oka" -> wzrok; dziecinne. |
| med#37 | WYCIEK | krytyczna | "operacje chirurgiczne" -> chirurg. |
| med#38 | WYCIEK | krytyczna | "drobne pęcherzyki w płucach" -> "pęcherzyki płucne" (praktycznie przepisanie). Zmienić na "Jak nazywa się miejsce wymiany gazowej w płucach?" (pęcherzyki płucne). |
| med#39 | ABCD | średnia | 3 opcje, "Grzyba" absurdalne; prompt "Czy grypa ... bakterię czy wirusa" w treści daje 50/50; trywialne. |
| med#40 | ABCD | niska | Dystraktory 10 i 15 l absurdalne. |
| med#42 | WYCIEK | niska | "(nie na wirusy)" ułatwia eliminacją. |
| med#43 | ABCD | niska | OK, dobre ("największy organ w ogóle" vs wątroba), ale "w ogóle" zdradza skórę; sąsiaduje z #6 (zestaw ciekawy, zostawić). |
| med#46 | NIEJEDN | średnia | "hormon regulujący poziom cukru" — adrenalina też podnosi poziom glukozy, tyroksyna wpływa na metabolizm. Zmienić na "hormon obniżający poziom cukru". Dup bio#54, med#0. |
| med#47 | ABCD/WYCIEK | średnia | 3 opcje; "kość łzowa" i "rzepka" nie są w uchu, a prompt mówi "w uchu" — odpowiedź oczywista przez eliminację. Dup bio#12. |
| med#48 | WYCIEK/TRYWIALNE | średnia | "pompa napędzająca krążenie" -> serce. |
| med#49 | ABCD | niska | 3 opcje. |
| med#2,#3,#12,#19,#22,#25,#27,#36 | TRYWIALNE | niska | Poziom dziecięcy (pediatra, kardiolog, dermatolog, krew, alergia, szczepionka). |

## Informatyka (quiz-informatyka, 50 pytań)

Ogólnie: ok. 25% pytań to "Co oznacza skrót X?" (CPU, GPU, SSD, ROM, USB, CSS, URL, SQL, LAN, IP, JSON) — nudne i powtarzalne; ok. 15 pytań trywialnych/szkolnych, ale kilka pytań z haczykiem (port 443, 127.0.0.1, ENIAC, bug). Jakość promptów gorsza niż w innych plikach — dwa pytania (#46, #49) to bełkot generatora. Rozkład: ~50% łatwe, 40% średnie, 10% trudne. Wiele ABCD ma tylko 3 opcje.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| inf#2 | JĘZYK/WARIANTY | średnia | "Ile to jest liczba dziesiętna 5 w systemie dwójkowym?" -> "Jak zapisać liczbę 5 w systemie dwójkowym?". Reguła zawierania zalicza "1011", "1101", "10101" (101 to >=60% długości). Zaakceptować także "00000101", "101b". |
| inf#5 | WYCIEK | krytyczna | "szesnastkowego" -> szesnaście (wariant "szesnaście"). Zmienić: "Jaka jest podstawa systemu heksadecymalnego?" lub usunąć. |
| inf#6 | TRYWIALNE | niska | Wariant "procesor" nie jest rozwinięciem skrótu, ale OK. Dodać "Central Processor Unit". |
| inf#7 | WARIANTY | średnia | Wariant "pamięć RAM": sam wyraz "pamięć" (z prompta, 6/10 = 60%) zostanie zaliczony. Dodać tylko "RAM", "Random Access Memory". Brak "pamięć operacyjna". |
| inf#9 | WARIANTY | niska | Brak "Solid State Disk" (sim <0.84). |
| inf#10 | ABCD | średnia | 3 opcje, "RAM" nie jest nośnikiem danych; trywialne. |
| inf#13 | TRYWIALNE | niska | Definicja szkolna. |
| inf#14 | NISZOWE | niska | OK. |
| inf#17 | WARIANTY | niska | Dodać "Guido". |
| inf#18/#42/#36/#37 | DUP/WYCIEK | średnia | Linux/Torvalds powtarza się w 4 pytaniach: #42 prompt zawiera "Linusa Torvaldsa" (odpowiedź #18), #18 prompt "Linux" (odpowiedź #36, #37). #36 i #37 mają tę samą odpowiedź (Linux). |
| inf#21 | ABCD | średnia | 3 opcje; "XIX-wieczną postać" eliminuje Hopper i Lamarr. |
| inf#24/#25/#27/#28 | WYCIEK/DUP | średnia | Cztery pytania o HTTP/HTTPS: #25 "dodawana do HTTP" zdradza #24; #28 "szyfrowany ruch HTTPS" zdradza #25; #27 ma opcję 443 (odpowiedź #28). |
| inf#25 | WARIANTY | niska | Odpowiedź "S" — jednoliterowy wariant jest tu zamierzony; ok. |
| inf#26 | WYCIEK | niska | "nazwy domen" -> Domain Name System. |
| inf#28 | ABCD | średnia | 3 opcje. |
| inf#29 | WYCIEK | krytyczna | "(localhost)" w treści = wariant "localhost" zaliczy przepisanie. Usunąć nawias i wariant. |
| inf#30 | WARIANTY | niska | Dodać "32 bity" jest; brak "32 bitów". |
| inf#33 | ABCD/TRYWIALNE | niska | 3 opcje; "pobierania" -> SELECT. |
| inf#34 | WARIANTY | niska | Dodać "oprogramowanie ransomware". |
| inf#35 | WYCIEK | krytyczna | "złośliwe oprogramowanie" w treści i w wariantach — przepisanie zalicza. Usunąć nawias; zostawić tylko "malware". |
| inf#38 | WARIANTY | niska | Dodać "UTF-8". |
| inf#39 | WYCIEK | niska | "7-bitowych" -> 2^7. |
| inf#40 | WARIANTY | średnia | Wariant "bug" zawiera się w "debug" (3/5 = 60%) — odpowiedź "debug" zaliczona. Dobry haczyk pytania, ale dodać "pluskwa". |
| inf#41 | WARIANTY | niska | Dodać "odpluskwianie". |
| inf#43 | ABCD | niska | 3 opcje, brak GIF/WebP; BMP z alfą istnieje. |
| inf#44 | FAKT/JĘZYK | krytyczna | "Ile bajtów liczy binarnie jeden megabajt (w stosunku do kilobajtów)?" — odpowiedź "1024" to liczba kilobajtów; 1 MiB = 1 048 576 bajtów. Treść sprzeczna z odpowiedzią. Zmienić: "Ile kilobajtów w jednym megabajcie (binarnie)?". Dup #3. |
| inf#45 | WARIANTY/JĘZYK | średnia | "NAND" zawiera "AND" (3/4 = 75%) -> zaliczone, a to błędna odpowiedź. "dwójkowa" -> "dwuargumentowa". |
| inf#46 | JĘZYK/WYCIEK | krytyczna | "Jaki firmowy język zapytań i format opisu danych ma rozwinięcie JavaScript Object Notation?" — bełkot (JSON nie jest językiem zapytań), a rozwinięcie jest w treści. Zmienić: "Jaki format wymiany danych, oparty na składni JavaScript, używa nawiasów klamrowych?" |
| inf#47 | ABCD | niska | 3 opcje; "lata 40." eliminuje UNIVAC (1951) i Altair. |
| inf#48 | TRYWIALNE | niska | LAN. |
| inf#49 | JĘZYK/WYCIEK | krytyczna | "Który firmowy adres MAC i protokół internetowy oznacza skrót IP?" — nonsens, w treści "protokół internetowy" = wariant. Zmienić: "Co oznacza skrót IP w adresie IP?" |
| inf#0,#1,#4,#5,#12,#15,#16,#22,#31,#32 | TRYWIALNE/NUDA | niska | Skróty i podstawy, bez haczyka. Zamienić na np. "Kto jest autorem jądra Linux", "pierwszy e-mail", "dlaczego bug", itd. |

## Nauka i wynalazki (quiz-nauka, 100 pytań)

Ogólnie: ok. 55% trywialnych/dziecinnych (7x8, 1 km = m, sześciokąt, wierzchołki sześcianu, termometr, 100°C, pierwiastki po symbolu), silnie szablonowe: 11 pytań "Jaki pierwiastek oznaczamy symbolem X?" (#1,#2,#8-#12,#47-#50) i 8 "W jakiej jednostce mierzymy...?" (#15-#19,#54,#55,#74); mnóstwo duplikatów (Newton, Darwin, Mendelejew, Curie, Edison, Bell, Einstein) w parach "pytanie + wersja wielopolowa" (#89-#98 to powtórki #3, #5, #6, #8, #9, #1, #20, #21). Kategoria nie pasuje: #35, #65-#68, #69, #79-#82 to biologia/kosmos/matematyka. Rozkład: ~60% łatwe, 35% średnie, 5% trudne. Cała końcówka pytań wielopolowych (#89-#98) ma sloty zdradzone w treści.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| nau#5 | WARIANTY | średnia | Brak "Curie", "Marie Curie", "Maria Skłodowska". Dup #90, med#32. |
| nau#13/#14 | DUP | niska | Lustrzane (CO2 / O2), plus bio#32/#93, #86. |
| nau#15-#19, #54, #55 | WARIANTY | niska | Jednoliterowe warianty "A", "V", "W", "N", "J", "K" — akceptowalne tu, ale ryzykują w parze z innymi pytaniami (K = potas w #50). |
| nau#20 | FAKT | średnia | "wynalazł żarówkę ... zakładając firmę w 1879" — Edison Electric Light Co. powstała 1878; 1879 to udany test żarówki węglowej; zasługi dzieli m.in. J. Swan. Zmienić na "Kto w 1879 zaprezentował praktyczną żarówkę z włóknem węglowym?" Dup #93. |
| nau#21 | NIEJEDN/DUP | niska | Bell vs Meucci/Gray — pubquizowy haczyk, ale bez niego. Dup #89. |
| nau#22 | ABCD | niska | Kopernik jako dystraktor absurdalny. |
| nau#25 | WARIANTY | średnia | "300000 km/s" lub "300 000 km/s" odrzucone (6/11 < 60%). Dodać z jednostką. |
| nau#27 | WYCIEK/TRYWIALNE | krytyczna | "sześciokąt" -> sześć. Dziecinne. |
| nau#34 | WARIANTY/WYCIEK | krytyczna | "neon" jest w treści ("kolorowe neony"). Dodatkowo wpisanie "ksenon" (opcja D) jest zaliczane: "neon" to 4/6 = 67% długości "ksenon". Zmienić: "Jaki gaz szlachetny daje czerwonopomarańczowe światło w lampach?" i uważać na warianty. |
| nau#36 | DUP | niska | Dup bio/med (206 kości). |
| nau#37 | NIEJEDN | niska | RNA też przenosi informację; dodać "RNA"? Raczej doprecyzować "magazynuje". |
| nau#41 | WYCIEK | niska | "parę" -> parowanie. Dodać "odparowanie", "wyparowanie". |
| nau#42 | WARIANTY | średnia | "100 stopni Celsjusza" odrzucone (10/20 = 50%), "100°C" może przejść. Dodać "100 stopni Celsjusza". Trywialne. |
| nau#43 | WARIANTY | średnia | "0 stopni Celsjusza", "0°C" odrzucone. Dodać. Trywialne. |
| nau#45 | FAKT | krytyczna | "Kto jako pierwszy stwierdził, że Ziemia krąży wokół Słońca" — pierwszym był Arystarch z Samos (III w. p.n.e.). Kopernik stworzył pełny model heliocentryczny. Zmienić: "Kto w XVI w. opublikował model heliocentryczny?" Dup kosmos#6, #56. |
| nau#46 | FAKT/ABCD | niska | Galileusz nie skonstruował teleskopu (Lipperhey 1608), zbudował własny; Kopernik martwy od 1543 — absurdalny dystraktor. Dup kosmos#19. |
| nau#52 | WARIANTY | średnia | Brak "siła grawitacyjna", "ciążenie", "przyciąganie grawitacyjne". Dup kosmos#29. |
| nau#53/#74 | DUP | średnia | Herc zadany dwukrotnie; dystraktory (dżul, wat) to odpowiedzi #19 i #17. |
| nau#57/#58 | WARIANTY | średnia | "minus", "plus", "negatywny", "ujemnie" odrzucone; #77 zdradza #57 ("ujemnie naładowana"), #78 podpowiada neutron. Trywialne. |
| nau#59 | WARIANTY | niska | Dodać "Wrightowie", "Wilbur i Orville Wright". |
| nau#61 | DUP | niska | Dup bio#39; dystraktory z tej samej puli (Darwin, Pasteur, Crick). |
| nau#63 | WARIANTY | krytyczna | Wpisanie "resublimacja" (opcja D) zostanie zaliczone — zawiera "sublimacja" (10/12). Obecny pomysł z resublimacją dobry, ale usunąć możliwość lub ustawić tylko literę. |
| nau#65-#68, #69, #35, #79-#82 | DUP/KATEGORIA | średnia | Hemoglobina, planety, wątroba, serce, mnożenie — poza kategorią, dup z bio/kosmos. #79 (7x8), #82 (m w km), #81 (wierzchołki) dziecinne. |
| nau#76 | WYCIEK | niska | "pod wpływem prądu elektrycznego" -> elektroliza. |
| nau#83/#84 | WYCIEK | niska | #84 zawiera "mikroskop" (odpowiedź #83). |
| nau#85 | WYCIEK | średnia | "O3" -> ozon. |
| nau#86 | WYCIEK | niska | foto-synteza. |
| nau#88 | WYCIEK | średnia | "promieniowanie rentgenowskie" -> opcja A "Roentgen". Dup med#14. |
| nau#89 | WYCIEK/JĘZYK | krytyczna | "osoba opatentowana w 1876 r." nonsens; "urządzenie do rozmów na odległość" -> telefon (slot b). Dup #21. |
| nau#90 | JĘZYK/WYCIEK | średnia | "badaczka ... niego" niezgodność; "nazwany od Polski" -> polon; "Po" dwuliterowy wariant. Brak "Curie". Rad też odkryty przez nią. |
| nau#91 | WYCIEK | krytyczna | "o symbolu Au" -> slot b (wariant "Au"). Dup #9. |
| nau#92 | WYCIEK/JĘZYK | krytyczna | "gaz oddychania o symbolu O" -> slot b "O" (jednoliterowy). Dup #1. |
| nau#93 | WYCIEK | krytyczna | "spopularyzował żarówkę" -> slot b. Dup #20. |
| nau#94 | WYCIEK | krytyczna | "E=mc² i teorii względności" -> oba sloty. Dup #3. |
| nau#95 | SLOTY | krytyczna | "Trzy stany skupienia" — stała kolejność stały/ciekły/gazowy; gracz piszący "gazowy, ciekły, stały" jest odrzucony; "lotny" jako wariant gazu jest błędny. Przerobić na pytanie z jednym slotem. |
| nau#96 | WYCIEK/SLOTY | krytyczna | Wzór C6H12O6 w treści zdradza C, H, O; stała kolejność; jednoliterowe warianty. Zmienić na "Z jakich pierwiastków zbudowana jest glukoza?" bez wzoru i z każdym slotem akceptującym wszystkie trzy (z ryzykiem powtórzeń). |
| nau#97 | WYCIEK | krytyczna | "o symbolu Fe" -> slot b. Dup #8. |
| nau#98 | WYCIEK | krytyczna | "teorii ewolucji" w treści -> slot b; label "dziedzina/teoria" niejasny. Dup #6. |
| nau#99 | TRYWIALNE/KATEGORIA | niska | Wenus/Mars; kategoria kosmos. |
| nau#0-#4,#7,#27,#28,#35,#39,#57,#58,#71-#73,#77-#82 | TRYWIALNE | niska | Szkoła podstawowa. |
| nau#4/#44, #6/#98, #7/#75, #3/#94, #14/#86 | DUP | średnia | Pary w obrębie pliku. |

## Kosmos i astronomia (quiz-kosmos, 100 pytań)

Ogólnie: najlepiej napisana z 6, ale ok. 40% trywialnych (kolejność planet, Księżyc, Słońce, NASA, Armstrong, Gagarin), ok. 12 pytań duplikatów (pary planeta+księżyc #64, #86, #92, #96, #99 i listy planet #42, #49, #81, #93). Ciekawe pozycje pubquizowe: #25 (Tiereszkowa z realnymi dystraktorami), #34 (Łajka), #40 (Uran), #45 (Wenus najgorętsza), #73 (Rosetta), #78 (Ceres), #90 (Jowisz doba), #91. Rozkład: ~55% łatwe, 38% średnie, 7% trudne. Pytania wielopolowe fatalne: wymuszona kolejność i wyciek w promptach.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| kos#9 | WARIANTY | średnia | Levenshtein 1 zalicza "Apollo 13", "Apollo 12", "Apollo 10" jako Apollo 11. Dodatkowo "Apollo" samo jest akceptowane (6/9). Zostawić tylko "Apollo 11"/"Apollo XI" i obejść tolerancję przez pytanie o numer ("Który numer miała misja ...?"). |
| kos#13 | WARIANTY/WYCIEK | krytyczna | Wariant "Galaktyka" — słowo jest w treści ("galaktyka"); przepisanie zalicza. Usunąć; dodać "Milky Way". |
| kos#14/#15/#95 | DUP | średnia | Hubble/Webb w trzech pytaniach; #15 zawiera "Hubblea" (zdradza #14). Dodać "Webb", "teleskop Webba". |
| kos#16/#17/#35/#36 | DUP | niska | Księżyce Jowisza/Saturna w 4 pytaniach + #64, #86, #96. |
| kos#18 | WARIANTY | średnia | Brak "zaćmienie słoneczne", "całkowite zaćmienie Słońca" jest, "zaćmienie Słońca" jest; ale "zaćmienie słoneczne" (sim <0.84) odrzucone. |
| kos#19 | FAKT/ABCD | niska | "jako pierwszy skierował lunetę" — Harriot obserwował Księżyc wcześniej. Kopernik i Tycho Brahe (zm. przed lunetą) to absurdalne dystraktory. Dup nau#46. |
| kos#22 | WYCIEK | niska | #61, #62, #79 w treści zawierają "Pluton". |
| kos#23 | ABCD | niska | Dystraktory = odpowiedzi #47, #48, #69 (Polarna, Syriusz, Betelgeza). |
| kos#24 | DUP | niska | Dup nau#33. |
| kos#27 | TRYWIALNE | niska | 8 planet. |
| kos#28 | SLOTY | krytyczna | Fobos/Deimos w stałej kolejności; "Deimos, Fobos" odrzucone. Dup #92. |
| kos#33 | WARIANTY | niska | "Sputnik 2" przejdzie (lev 1). |
| kos#35 | NIEJEDN | niska | Ganimedes i Kallisto też mają prawdopodobne oceany pod lodem. Dodać "Europa" jako jedyna? Raczej uściślić "najbardziej znany". |
| kos#37 | ABCD | niska | Opcja D "Lata kosmiczne" absurdalna; definicja zdradza "rok świetlny". Dup #65. |
| kos#41 | WYCIEK | krytyczna | "widoczny jako czerwonawa plama" -> Wielka Czerwona Plama (wariant "Czerwona Plama"). |
| kos#42 | SLOTY | krytyczna | 4 planety skaliste w stałej kolejności Merkury-Wenus-Ziemia-Mars; inne kolejności odrzucone. Dup #81, #0. |
| kos#46 | WARIANTY | niska | Literówka w wariancie "plamy na Slncu". |
| kos#47 | WARIANTY | niska | Brak "Polarna". |
| kos#49 | SLOTY/NIEJEDN | krytyczna | Kolejność wymuszona; Uran i Neptun to lodowe olbrzymy (dziś rozróżnia się gazowe olbrzymy: Jowisz i Saturn). |
| kos#50 | WYCIEK | niska | "jądra wodoru łączą się w hel" -> fuzja. |
| kos#51 | DUP | niska | Dystraktory zawierają odpowiedzi #53 (Curiosity), #52 Ingenuity w sąsiedztwie. |
| kos#54 | NIEJEDN | średnia | Falcon 9 vs Falcon Heavy (obie rakiety lądują); "Falcon" samo zaliczone, "Falcon 8" też. Doprecyzować "najczęściej używana". |
| kos#55 | WARIANTY | krytyczna | "Voyager 2" (opcja B) zostanie zaliczone przy odpowiedzi tekstowej (lev 1). |
| kos#56/#6/#57/#58 | DUP | niska | Kopernik w #6 i #56; Kepler w #57/#58 (#58 zawiera "prawa Keplera"). |
| kos#59/#60 | DUP | niska | Opcja B w #59 = odpowiedź #60. |
| kos#61 | WARIANTY | niska | Brak "Szaron". |
| kos#63 | NIEJEDN/TRYWIALNE | niska | Brak "luneta". Dziecinne. |
| kos#64,#86,#92,#96,#99 | WYCIEK/DUP/JĘZYK | średnia | Zagadki planeta+księżyc dublują #4, #17, #1, #35, #3, #28, #36, #88; #86 "noszący nazwę kontynentu" zdradza Europę; #96 "o krótkiej nazwie" absurd; #86 "księżyc z oceanem" niejednoznaczny. Usunąć. |
| kos#65 | WYCIEK | krytyczna | "Jak nazywa się jednostka astronomiczna" — odpowiedź w treści. |
| kos#66 | WARIANTY | średnia | "8 minut", "około 8 minut" odrzucone (wariant tylko "8"). |
| kos#67 | WYCIEK/FAKT | krytyczna | Oba warianty ("Wielka Niedźwiedzica", "Wielki Wóz") są w treści; poza tym Wielki Wóz to asteryzm, nie gwiazdozbiór. |
| kos#70/#71/#72 | WARIANTY | niska | Brak "zaćmienie księżycowe", "zorza", "horyzont". |
| kos#74 | WYCIEK | krytyczna | "po polsku zwany promem kosmicznym" -> odpowiedź. Również "statek" a nie program. |
| kos#81 | SLOTY/DUP | niska | Labels określają kolejność (ok), ale dup #42/#0; trywialne. |
| kos#82/#83/#97 | DUP | średnia | Skład atmosfery trzy razy; nau#51/#85. |
| kos#87 | JĘZYK/FAKT | krytyczna | Opcja C "Niemiec Titow" — to German Titow (imię German, nie narodowość). Zmienić na "German Titow". |
| kos#93 | FAKT/SLOTY | krytyczna | "Trzy ostatnie planety licząc od Słońca": Saturn, Uran, Neptun; odpowiedzi to a=Uran, b=Neptun, c=Saturn, więc poprawna kolejność jest odrzucona. |
| kos#94/#98/#95 | DUP | niska | Dup #8/#44, #7/#25, #14/#15. |
| kos#0-#5,#7,#8,#11,#21,#31,#32,#63,#68 | TRYWIALNE | niska | Dziecięce. |

## Zwierzęta i przyroda (quiz-zwierzeta, 100 pytań)

Ogólnie: ok. 60% pytań trywialnych/dziecinnych (samica konia, młode psa/kota, nogi pająka, zebra, kogut, lew, biedronka); szablony "Do jakiej gromady należy X", "Jak nazywa się młode/samiec Y", "Podaj zwierzę i kontynent" (#88-#90, #97) i "Wymień trzy X" z identycznymi listami w slotach. Dobre i pubquizowe: #1, #5 (jerzyk jako haczyk), #14 (nietoperz), #33, #35 (3 serca ośmiornicy), #44, #53, #62 (modrzew), #75, #81. Wątek roślin (#54-#65) to powtórki z biologii. Rozkład: ~65% łatwe, 30% średnie, 5% trudne. Najcięższe wady: sloty z jednakowymi listami (#93-#96, #99), wycieki w treści (#45, #61, #64, #70, #71, #87, #88-#90, #97), błędy faktu (#57, #60, #64) i niejednoznaczności (#10, #13, #22, #23, #52).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| zwi#7/#39 | DUP | niska | Kogut: "samiec kury" i "ptak budzący piejąc". |
| zwi#10 | NIEJEDN | średnia | "Wieprz" (B) to kastrowany samiec świni, a "kiernoz" w gwarze to samiec świni/dzika; "Knur" jest typową odpowiedzią, ale B i C też bywają poprawne. "Maciorek" absurdalny. Zamienić dystraktory (np. Locha, Wieprzek) lub pytać o "niekastrowanego samca". |
| zwi#13 | NIEJEDN | średnia | Opcja A "Gęsior" jest poprawną wariantową formą (SJP dopuszcza gęsior obok gąsiora); D "Gander" angielskie. Zmienić dystraktory. Dup #91. |
| zwi#14-#18 | DUP/TRYWIALNE | niska | Pięć pytań "Do jakiej gromady..." (#14-#18) + bio#64-#66. #17 bez słowa "kręgowców". |
| zwi#20 | TRYWIALNE | niska | "Ile nóg ma pająk?" z briefu; dup #19, bio#67. |
| zwi#21 | WARIANTY | niska | Dodać "Oceania", "Nowa Gwinea" (kangury drzewne). |
| zwi#22 | NIEJEDN | średnia | Dzikie lwy żyją też w Indiach (lew azjatycki, Gir). Doprecyzować: "na którym kontynencie żyje najwięcej dzikich lwów?". |
| zwi#23 | NIEJEDN/ABCD | krytyczna | Pytanie o kontynent, odpowiedź "Arktyka" (to region, nie kontynent), a niedźwiedź polarny żyje też na Syberii (Azja), Svalbardzie (Europa), w Kanadzie i na Alasce — opcje C i D też poprawne. Zmienić na "w której krainie geograficznej" i dać Antarktydę jako dystraktor obok np. Patagonii. |
| zwi#25 | NIEJEDN | niska | Niedźwiedź polarny bywa klasyfikowany jako ssak morski; zaliczać też Kodiaka. |
| zwi#26 | FAKT/NUDA | niska | Lew żyje w sawannie, nie w dżungli; potoczne "król zwierząt". |
| zwi#27/#34 | DUP | średnia | Oba o żyrafie ("najdłuższa szyja" i "najwyższy ssak"). |
| zwi#28 | WYCIEK | niska | "leniwego" -> leniwiec. |
| zwi#30/#83 | DUP | niska | Pszczoła (miód / wosk). |
| zwi#36 | FAKT | niska | Kameleony zmieniają kolor głównie dla komunikacji i termoregulacji, a nie dla maskowania. |
| zwi#42 | WARIANTY | średnia | Tylko "rekin wielorybi"; brak "wielorybi", "rekin-wieloryb". |
| zwi#43 | WARIANTY | niska | "bielik" to inny gatunek niż godło (orzeł biały jest stylizowany); bielik zaliczany luźno. |
| zwi#45 | WYCIEK | krytyczna | "Jaki bocian gniazduje..." — wariant "bocian" jest w treści (przepisanie zalicza). Zmienić: "Jaki ptak ... gniazduje na kominach?" |
| zwi#46/#79 | DUP | średnia | Oba -> bóbr; #79 "największy ssak żyjący w polskich rzekach" (wydra?) -> "największy gryzoń". |
| zwi#47 | NIEJEDN | niska | Szakal złocisty, lis, jenot to też psowate. Wilk raczej wiodący. |
| zwi#48/#70 | WYCIEK | niska | #70 w treści zawiera "jeż" (odpowiedź #48). |
| zwi#50/#51 | DUP | średnia | Opcje wzajemnie zdradzają (A "Byk" w #50 = odpowiedź #51; B "Kozioł" w #51 = odpowiedź #50). "Rogal" absurdalny. |
| zwi#52 | NIEJEDN | krytyczna | "Zimą przylatuje do Polski i ma czerwoną pierś" -> gil mieszka tu cały rok; rudzik (czerwona/pomarańczowa pierś) też zimuje; wariant "rudzik" odrzucony. Przeredagować: "ptak z czarną czapeczką i różowo-czerwoną piersią, zimą przy karmnikach". |
| zwi#54-#56, #59, #65 | DUP | średnia | Fotosynteza/gazy/chlorofil/korzeń powtarzają bio#31-#33, #75, nau#86-#87. |
| zwi#57 | FAKT/WARIANTY | krytyczna | Najwyższe drzewo to sekwoja wieczniezielona (Hyperion); mamutowiec (Sequoiadendron) jest największy objętościowo, a nie najwyższy, a wariant "mamutowiec" jest zaliczany. Usunąć "mamutowiec". |
| zwi#58 | WARIANTY | niska | Brak "Amazon", "las amazoński", "dżungla amazońska". |
| zwi#60 | FAKT/ABCD | krytyczna | "najstarsza i największa puszcza w Polsce" — największe kompleksy to Bory Dolnośląskie i Bory Tucholskie (dystraktor D!), Białowieska jest najlepiej zachowanym pierwotnym lasem. Zmienić: "najlepiej zachowany las pierwotny nizinnej Europy, dom żubrów". Cross-leak z #44. |
| zwi#61 | WYCIEK | krytyczna | "przebija się przez śnieg" -> przebiśnieg. Zmienić na "pierwsze kwiaty wiosny, białe dzwoneczki". |
| zwi#62 | NISZOWE-OK | brak | Dobre pytanie, zostawić. |
| zwi#64 | FAKT/WYCIEK | krytyczna | "kasztany jadalne i ozdobne (kasztanowce)" — kasztany jadalne to Castanea (kasztan jadalny), a kasztanowiec (Aesculus) ma nasiona niejadalne; wariant "kasztan" także luźny; "kasztanowce" w treści = odpowiedź. Zmienić na "Z jakiego drzewa pochodzą kasztany, z których robi się ludziki?". |
| zwi#66 | TRYWIALNE | niska | Sahara. |
| zwi#67/#82 | DUP | średnia | Wielbłąd dwa razy; brak "dromader". |
| zwi#68 | JĘZYK | średnia | "najgłębszy ocean / rów oceaniczny" — niezręczne. -> "najgłębszy rów oceaniczny". |
| zwi#70 | WYCIEK | krytyczna | "zwierzęta zapadają w zimowy sen" -> wariant "sen zimowy" jest w treści. Niedźwiedzie nie hibernują ściśle (torpor). Zmienić. |
| zwi#71 | WYCIEK | krytyczna | "sezonowa wędrówka" -> wariant "wędrówka" w treści. |
| zwi#72-#74 | TRYWIALNE/WYCIEK | niska | Rdzenie w treści ("roślinami" -> roślinożerca); szkolne. |
| zwi#75 | WARIANTY | niska | Literówkowy wariant "krokodyl roznicowy" (powinno być "rozancowy"). Wariant "krokodyl" zbyt ogólny. |
| zwi#76 | JĘZYK | krytyczna | "Jaki jad ma najjadowitszy wąż lub jak nazywa się najbardziej znany jadowity wąż Indii (z kapturem)?" — dwa pytania sklejone, plus "z kapturem" zdradza kobrę. Przepisać: "Jak nazywa się jadowity wąż z kapturem, tańczący dla zaklinaczy?". |
| zwi#77 | NIEJEDN | średnia | "dusiciel z Ameryki Południowej" pasuje też do opcji B (boa dusiciel, a anakonda sama jest boa). Zmienić dystraktor. |
| zwi#78 | WYCIEK | niska | "osiem ramion" -> ośmiornica. |
| zwi#84 | NIEJEDN | niska | Orka/butlonos; dodać "butlonos". Dup z #93. |
| zwi#85 | NIEJEDN | niska | Sęp (B) to też kondor; harpia (A) jest największym orłem. |
| zwi#86, #87 | WYCIEK/TRYWIALNE | średnia | #87 "róg na nosie" -> nosorożec; #86 "czarno-białe pasy" -> zebra. Dziecięce. |
| zwi#88-#90, #97 | WYCIEK/SLOTY | krytyczna | Slot a (zwierzę) jest w treści ("gdzie żyje koala"), więc wymaga tylko kontynentu. #90 brak "Antarktyka" (częsta nazwa), #97 slot a. Zmienić na jednosłotowe pytania o kontynent. |
| zwi#91/#92/#98 | JĘZYK/TRYWIALNE | niska | "Podaj samca i samicę: jak nazywa się samiec i samica..." — tautologia, kalka. #91 dup #13. |
| zwi#93 | SLOTY | krytyczna | Identyczne listy w obu slotach — "delfin, delfin" przejdzie; usunąć duplikaty lub dać 1 slot. |
| zwi#94 | SLOTY/WARIANTY | krytyczna | Trzy identyczne listy ("lew, lew, lew" zaliczone); brak "gnu", "struś", "guziec", "impala", "krokodyl", "surykatka", "szakal". |
| zwi#95 | SLOTY | krytyczna | Trzy identyczne listy ("ssaki, ssaki, ssaki"). |
| zwi#96 | SLOTY/WARIANTY | krytyczna | Jw.; brak "bogatka", "modraszka", "zięba", "kruk", "dzwoniec", "kukułka", "jaskółka"; "kos" 3-literowy. |
| zwi#99 | SLOTY/WARIANTY | krytyczna | Jw. (owady); brak "stonka", "pasikonik", "świerszcz", "chrabąszcz", "karaluch", "mszyca", "konik polny", "bąk". Trywialne. |
| zwi#0,#2-#4,#6-#9,#11,#12,#15,#16,#19,#20,#24,#27,#29,#30,#37-#41,#46,#48,#63,#66,#69,#72-#74,#78,#80,#82-#84,#86,#87 | TRYWIALNE | niska | Poziom przedszkolny/podstawówka. |

## Wnioski systemowe

Przejrzano 500 pytań (biologia 100, nauka 100, kosmos 100, zwierzęta 100, medycyna 50, informatyka 50). Z problemem krytycznym (zła ocena gracza: błąd faktu, odrzucona poprawna odpowiedź, zaliczona zła, wyciek): ok. 22 w biologii, 13 w nauce, 12 w kosmosie, 24 w zwierzętach, 6 w medycynie, 6 w informatyce = ok. 83 pytań (17%). Z problemem średnim: ok. 8 + 12 + 10 + 18 + 28 (głównie dup) + 8 = ok. 84 (17%). Do wymiany ze względu na trywialność/dziecinność: ok. 45% całości (ok. 220 pytań).

Powtarzalne wzorce błędów generatora:
1. WYCIEK w treści pytania — najczęstsza wada (ok. 60 przypadków): odpowiedź lub jej rdzeń (bio: żuchwa, odcinek szyjny, mięsień żwacz, biceps, soczewka, hormony tarczycy, cudzożywny; nau: sześciokąt, neon; kos: jednostka astronomiczna, Wielki Wóz, prom kosmiczny; zwi: przebiśnieg, sen zimowy, wędrówka, bocian). Dodać do procesu automatyczny test: dla każdej odpowiedzi i wariantu sprawdzić, czy jego rdzeń (stem, po usunięciu polskich końcówek) występuje w prompcie; wynik >0 -> odrzucić pytanie.
2. Pytania wielopolowe zbudowane ze słowami z promptu w slotach: pytania typu "Podaj X i jego Y (opis zdradzający X)" mają sloty a/b wyciekające w nawiasie (nau#91-#98, bio#87-#94, #99, zwi#88-#90, #97, kos#64, #86, #92, #96, #99). Reguła: każdy slot ma wymagać wiedzy, której nie ma w prompcie.
3. Sloty o identycznych listach bez deduplikacji (zwi#93-#96, #99): "lew, lew, lew" przejdzie. Albo mieć jeden slot z liczbą oczekiwaną w treści, albo rozdzielić na różne kategorie per slot, albo dodać do scoringu deduplikację. Sloty o stałej kolejności (nau#95-#96, kos#28, #42, #49, #93, bio#91): kolejność nie jest oczywista dla gracza — albo kolejność wynika z labela (pierwsza, druga), albo pytanie zamienić.
4. Tolerancja scoringu wobec bliskich błędów: zawieranie >=60% i Levenshtein 1 zaliczają "Voyager 2", "Apollo 13", "ksenon" (neon), "resublimacja", "NAND", "debug", "1011" (101). Przy pytaniach z cyframi i bliskimi nazwami w dystraktorach należy ustawić tylko literę ABCD lub wyłączyć tolerancję dla wariantów <=6 znaków i ze zmianą cyfry.
5. Brak wariantów z jednostką i formami opisowymi: "8 minut", "100 stopni Celsjusza", "300 000 km/s", "minus/plus" (ładunek), "siła grawitacyjna", "Curie". Dodać generowanie wariantów: liczba + jednostka, forma przymiotnikowa, nazwisko, nazwa łacińska/angielska.
6. Wariant jednoliterowy wycelowany w dystraktor: bio#56 wariant "d" (litera D = B12). Walidator: litera w answers musi odpowiadać tylko prawidłowej opcji.
7. Duplikaty zdominowują paczki: medycyna ~44% kopii z biologii; nauka powtarza własne pytania w wersji wielopolowej (#89-#98 vs #1-#9); kosmos ma pary planeta+księżyc zdublowane pięciokrotnie; zwierzęta powtarzają bio (gromady, fotosynteza). Przed publikacją deduplikacja semantyczna (embedding lub klucz odpowiedź + rdzeń pytania) między wszystkimi paczkami.
8. Bełkot językowy generatora w zmiennych szablonach: inf#46, #49, zwi#76, nau#89, bio#20, "Podaj narząd i układ. Płuca to narząd należący do układu..." i "Podaj samca i samicę: jak nazywa się samiec i samica". Należy ręcznie lub modelem-krytykiem sprawdzić gramatykę przed zapisem.
9. ABCD: 3 opcje zamiast 4 (med#39, #47, #49; inf#10, #21, #28, #33, #43, #47), dystraktory z innej epoki lub kategorii (Kopernik w pytaniu o lampę naftową i o lunetę, Kopernik/Tycho przy Galileuszu, "Lata kosmiczne", "Maciorek"), dystraktory cross-reusing odpowiedzi innych pytań (kos#23, nau#53, zwi#50/#51). Minimum 4 opcje, dystraktory z tej samej kategorii i epoki, wygenerowane niezależnie od innych pytań.
10. Błędy faktograficzne wynikające z uproszczeń: "najczęstsza grupa krwi" 0 Rh- (bio#60), "kto jako pierwszy" heliocentryzm (nau#45), "największa puszcza" (zwi#60), mamutowiec jako najwyższy (zwi#57), kasztany jadalne (zwi#64), "Niemiec Titow" (kos#87), Wielki Wóz jako gwiazdozbiór (kos#67), 1 MB = 1024 B (inf#44), trzy ostatnie planety w złej kolejności (kos#93), 2 komory serca (bio#7, med#1). Warto dodać etap weryfikacji faktów drugim źródłem dla pytań z superlatywami ("największy", "pierwszy", "najczęstszy").
11. Poziom i styl: deklarowane "poziom średni", a ok. połowa pytań jest przedszkolna (nogi pająka, 7x8, 1 km = 1000 m); brak haczyków i ciekawostek. Wymagać w promptach generatora "pytanie z niespodzianką/ciekawostką, nie zdanie z podręcznika", zakazać przykładów typu "Ile nóg ma pająk" i szablonów "Jaki pierwiastek oznaczamy symbolem X" w ilości >2 na paczkę.
12. Kategoryzacja: nauka (#35, #65-#69, #79-#82, #99), zwierzęta (#54-#65) zawierają pytania z innych dziedzin; medycyna to w dużej części anatomia. Ustalić granice kategorii i zakazać przekrojowych powtórek.

Liczby: przejrzano 500 pytań we wszystkich sześciu paczkach.
