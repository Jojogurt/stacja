# Audyt treści D: Harry Potter, Władca Pierścieni, Wiedźmin, Gry wideo

(id = indeks 0-based w tablicy questions; wszystkie pytania przejrzane)

## Harry Potter (quiz-harry-potter.json, 100 pytań)

Ogólnie: faktograficznie paczka jest czysta, a nazewnictwo Polkowskiego (Tiara Przydziału, Zgredek, Stworek, Glizdogon, Hogwart Ekspres, Zwierciadło Ain Eingarp, Myślodsiewnia) w większości poprawne. Problemy są strukturalne: ok. 40% pytań to czyste "kto/co to" dla każdego widza filmów (trywialne), a około 30 pytań tworzy klastry duplikatów i wzajemnych przecieków (domy/założyciele/godła, Lucjusz–Draco, Durmstrang–Beauxbatons, tytuły książek). Dystraktory ABCD często wracają (Myślodsiewnia x4, Świstoklik x3). Trudność: ok. 55% łatwe, 38% średnie, 7% trudne (Regulus, oklumencja, Żongler, Polkowski). Pytań ABCD jest ok. 28, litera D poprawna tylko 2x (A i B po ~10).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| HP#4 | WARIANTY | średnia | Wariant "Tom" zalicza też opcje B/D (Tom Gaunt, Tom Marvolo Gaunt). Usunąć "Tom", dodać "Riddle", "Tom Marvolo Riddle" zostawić. |
| HP#14 | NIEJEDN | średnia | "ten, kto pochodzi z niemagicznej rodziny" to w kanonie MUGOLAK (Muggle-born), a "mugol" to osoba bez magii. Odpowiedź mugolak odrzucona. Przeformułować: "Jak czarodzieje nazywają ludzi bez zdolności magicznych?" lub dodać "mugolak", "mugolacy". |
| HP#41 | WYCIEK | krytyczna | Prompt zawiera "znany też jako Glizdogon", a "Glizdogon/Glizdogona" są w wariantach. Gracz przepisuje z pytania i zdobywa punkt. Usunąć przydomek z treści albo go nie akceptować. |
| HP#56 | SLOTY | krytyczna | Trzy sloty z różnymi listami w stałej kolejności (różdżka, kamień, peleryna). Wymienienie w innej kolejności (np. peleryna pierwsza) = odrzucone, mimo że prompt mówi "wymień trzy". Wariant "Różdżka" i "Kamień" samodzielnie nie przechodzą (<60%). Zmienić na jeden slot z wymaganiem 3 trafień lub podać wspólną listę wariantów w każdym slocie (i deduplikację po stronie silnika). Dodać "Różdżka", "Kamień", "Starsza Różdżka". Treść ujawnia też odpowiedź na HP#55 ("Insygnia Śmierci"). |
| HP#80 | SLOTY | niska | Sloty z podpisem Gryffindor/Slytherin, więc kolejność jasna. Ale prompt "Wymień zwierzęta" sugeruje dowolną kolejność. Dodać "lwa", "węża". Przeciek: HP#90/91 zawierają "wąż"/"lwa". |
| HP#89 | SLOTY/DUP | średnia | Trzy pytania w jednym, duplikat HP#1, HP#44 (Cedrik-Hufflepuff), HP#51 (Luna-Ravenclaw). Treść niezgrabna ("Wymień dom ... Podaj dom Harry'ego, ..."). Wyciąć. |
| HP#92 | SLOTY | średnia | Prompt "Wymień dwoje założycieli" sugeruje dowolną kolejność, ale a=Rowena, b=Helga zakodowane. Gracz, który poda Helgę pierwszą, dostaje 0. Dodać wspólne listy lub zmienić na dwa osobne pytania. Dodatkowo podpisy slotów podają nazwy domów. |
| HP#53 | ABCD | średnia | Dystraktory: "Lustro Galadrieli" (z innego uniwersum, żart), "Wieczne Lustro" (wymyślone), Myślodsiewnia (z innej kategorii). Jedynie A brzmi jak nazwa HP. Dodać wariant "Zwierciadło", "Lustro Ain Eingarp". |
| HP#36 | ABCD | niska | "Wąż morski" i "Smok" absurdalne; prompt "wielki wąż" wyklucza resztę. Prompt HP#93 zdradza "bazyliszka". |
| HP#75 | ABCD | niska | Dystraktor "Aragog" to pająk, "Bazyl" i "Salazar" nie są wężami. Pytanie trywialne. |
| HP#62 | ABCD | niska | "Który z bliźniaków": opcje Percy i Charlie nie są bliźniakami, więc realne 50/50. |
| HP#42 | ABCD | niska | Dystraktor "Klepsydra Mendla" wymyślony (nie ma w kanonie), czytelny żart. |
| HP#82 | ABCD | niska | Dystraktor "Kula" absurdalny. |
| HP#95 | DUP/WYCIEK | niska | Odpowiedź Lestrange jest w odpowiedzi HP#64 (Bellatriks Lestrange). Zależnie od kolejności losowania pytania się podpowiadają. |
| HP#25 / HP#65 | DUP/WYCIEK | średnia | To samo pytanie odwrócone: HP#25 "syn Lucjusza", HP#65 "ojciec Draco Malfoya". Każde ujawnia odpowiedź drugiego. Zostawić jedno. |
| HP#45 / HP#46 | DUP/WYCIEK | średnia | Każde ma odpowiedź drugiego jako opcję + "francuska szkoła" w HP#46 pozwala odgadnąć HP#45 przez eliminację. Zostawić jedno lub zmienić pytania. |
| HP#85 / HP#86 | DUP | średnia | HP#86 (rodzice) zawiera HP#85 (matka). Usunąć HP#85. |
| HP#17 / HP#66 / HP#67 | DUP | niska | Trzy Klątwy Niewybaczalne jako trzy osobne pytania ABCD, wzajemnie się podpowiadają (opcje zawierają pozostałe klątwy). Zostawić jedno pytanie wielopolowe z wymaganiem 3 trafień. |
| HP#78/79/90/91/92/1/80 | DUP | średnia | Klaster 8 pytań o domy, założycieli i godła. Prompty wzajemnie ujawniają odpowiedzi (HP#90 "wąż", HP#91 "lwa", HP#92 "orzeł i borsuk", HP#78 "orzeł", HP#79 "borsuk" a HP#80 prosi o te zwierzęta). Zredukować do 2-3 pytań. |
| HP#54 / HP#55 / HP#35 | DUP/WYCIEK | niska | Trzy pytania o polskie tytuły. Opcja C w HP#54 to "Insygnia Śmierci" czyli odpowiedź HP#55, a prompt HP#56 też. Dodatkowo nudne, szkolne. |
| HP#93 | WYCIEK | średnia | Prompt zawiera "Tiarze Przydziału" (odpowiedź HP#9) i "bazyliszka" (HP#36). Przeformułować: "Jaki miecz wyciąga Harry z magicznego nakrycia głowy?" |
| HP#94 | NISZOWE | średnia | Nazwisko tłumacza wie niemal nikt (pytanie z meta-poziomu, nie o świat). Wyciek "Tiara Przydziału" w treści. Zostawić jako pytanie bonusowe lub usunąć. |
| HP#9, HP#37 | WYCIEK | niska | HP#37 "bije gałęziami" odsłania "Bijąca". HP#9 "Tiara Przydziału" jest już w treści HP#93/94. |
| HP#30 / HP#31 | WYCIEK | niska | HP#30 w treści "szukający", HP#31 pyta o pozycję Harry'ego z opcją Szukający. |
| HP#38 / HP#98 | WYCIEK | niska | Opcja B w HP#38 to "Stworek", odpowiedź HP#98. |
| HP#49 / HP#50 | WYCIEK | niska | HP#49 "urzędniczka ministerstwa" zdradza HP#50 (Ministerstwo Magii). |
| HP#63 / HP#64 | WYCIEK | niska | HP#63 w treści "Bellatriks" = odpowiedź HP#64. |
| HP#47 / HP#48 | WYCIEK | niska | HP#47 "Dumbledore'a" w treści, odpowiedź HP#48 ma "Dumbledore'a". |
| HP#34 / HP#58 | WYCIEK | niska | Opcja C w HP#34 to "Felix Felicis" (odpowiedź HP#58). |
| HP#57 / HP#53 / HP#23 / HP#42 | DUP | niska | Myślodsiewnia występuje jako opcja w 4 pytaniach, Świstoklik w 3. Rozszerzyć pulę dystraktorów. |
| HP#58 | WARIANTY | niska | Brak "Płynne Szczęście" (polski odpowiednik, PRAWDOPODOBNE), "Felix". |
| HP#59 | WARIANTY | niska | Polski przekład to PRAWDOPODOBNIE "Mikołaj Flamel" (wariant brak), "starożytny" to nieprecyzyjne (XIV wiek). |
| HP#61 | WARIANTY | niska | Brak "Ekspres do Hogwartu" (tak bywa w przekładzie i dubbingu), "Hogwart Express". |
| HP#37 | WARIANTY | niska | Brak "Wierzba" (samo "wierzba" jest <60% i odrzucone). |
| HP#47 / HP#48 | WARIANTY | niska | Brak "Gwardia" / "GD" / "Feniksa" samodzielnie. |
| HP#60 | WARIANTY | niska | Brak "9¾" (znak ułamkowy); "peron 9 i 3/4" <60%. |
| HP#99 | WARIANTY | niska | Samo "Albus" zalicza pytanie o pełne imię (wąsko dopuszczalne). |
| HP#2, #3, #25, #64... | WARIANTY | niska | Samo nazwisko ("Weasley", "Black", "Malfoy", "Moody") akceptowane. Przy "Weasley" (HP#2) pasuje 7 postaci, ale pytanie wskazuje jedną. Niegroźne. |
| HP#16 | NIEJEDN | niska | Mobiliarbus i Levicorpus też "unoszą"; wyraźna odpowiedź Wingardium, więc tylko uwaga. |
| HP#96 | NIEJEDN | niska | "Biżuteria należąca niegdyś do Slytherina": diadem i pierścień to też biżuteria (Gaunt, nie sam Slytherin). Wskazanie jednoznaczne tylko dzięki "Slytherina". Dobre pytanie, ale doprecyzować. |
| HP#88 | NISZOWE | niska | Oklumencja: dobre, trudniejsze. Prompt zdradza "legilimencja" (HP#66 ma Legilimens jako opcję). |
| HP#23 | ABCD | niska | Dystraktor "Insygnium" nie istnieje jako przedmiot; odpowiedź jedyna "pasuje". |
| trywialne | TRYWIALNE | niska | HP#0,1,2,3,5,6,7,8,10,11,15,18,19,20,21,22,25,26,27,30,31,32,33,39,40,43,46,50,52,60,61,68,69,76,77,82,85,87,99 (ok. 40). Skrócić do ok. 15. |


## Władca Pierścieni (quiz-wladca-pierscieni.json, 100 pytań)

Ogólnie: najsłabsza paczka z czterech. Ok. 20 pytań ma wyciek odpowiedzi w treści, a pytania wielopolowe (HP-style "wymień cztery...") są zbudowane tak, że poprawna odpowiedź w innej kolejności jest odrzucana. Pojawiają się też błędy faktu i niedbały język (kalki, "brat-barwa", pytanie o ojca Froda z odpowiedzią "Baggins"). Warianty polskich nazw (Skibniewska: Obieżyświat, Brandywina, Helmowy Jar, Drzewiec, Pod Rozbrykanym Kucykiem, Arcyklejnot, Nazgûle/Upiory Pierścienia) są w większości dobre, ale pomieszane z angielskimi opcjami w ABCD. Trudność: ok. 50% łatwe, 40% średnie, 10% trudne/niszowe (Henneth Annûn, Glorfindel, Księga Mazarbul).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| LOTR#3 | FAKT | średnia | "który jako pierwszy znalazł Jedyny Pierścień" fałsz: pierwszy był Déagol, zabrał Sméagol/Gollum. Bilbo znalazł go w jaskini, jako pierwszy hobbit. Poprawić na "jako pierwszy hobbit" lub "wujek (kuzyn)" Froda. |
| LOTR#25 | WYCIEK | krytyczna | Treść: "czarni jeźdźcy", a "Czarni Jeźdźcy" są w wariantach. Przeformułować: "Jak nazywa się dziewięciu upiornych sług Saurona w czarnych szatach?" |
| LOTR#27 / LOTR#28 | WYCIEK | średnia | LOTR#27 w treści "Narsila" = odpowiedź LOTR#28; w LOTR#28 opcja A to Anduril (odpowiedź LOTR#27). Wzajemnie się rozwiązują. Połączyć w jedno. |
| LOTR#35 | FAKT | średnia | PRAWDOPODOBNE: miruvor to napój z Rivendell (dar Elronda, pita na Caradhrasie), nie z Lothlórien; w Lórien Drużyna dostała lembasy i kielich pożegnalny z miodem. Poprawić miejsce na "Rivendell" lub dopasować. Wariant "miód elfów" wątpliwy. |
| LOTR#36 | NIEJEDN/WARIANTY | krytyczna | Pytanie niejasne (język? treść?). Warianty "inskrypcja" i "napis w mowie Mordoru" powtarzają treść pytania, więc zalicza każdy opis. Sprecyzować: "W jakim języku jest napis?" odp. "Czarna Mowa / mowa Mordoru". |
| LOTR#39 | WYCIEK | krytyczna | Treść: "zwany Gadzim Językiem", a "Gadzi Język" w wariantach. Podstawowa odpowiedź to Gríma. Usunąć przydomek z treści. |
| LOTR#41 | JĘZYK/FAKT | niska | "ratuje przed Morią": Sam uwalnia Billa przed Morią; sformułowanie mylące. |
| LOTR#42 | WARIANTY | niska | Wariant "Gworn" bez pokrycia (PRAWDOPODOBNIE zmyślony); usunąć. |
| LOTR#47 | FAKT/WARIANTY | krytyczna | Pytanie o ojca Froda, a odpowiedź to nazwisko "Baggins/Bagosz". Ojciec to Drogo Baggins. "Drogo Baggins" odrzucone (7/13 znaków <60%), "Drogo" odrzucone. Dodatkowo pytanie duplikuje LOTR#1/3. Przeformułować na "Jak nazywał się ojciec Froda?" odp. Drogo. |
| LOTR#48 | JĘZYK/ABCD | niska | Opcje mieszają angielski (Bag End, Crickhollow, Brandy Hall) i polski ("Wielkie Smiale"). Wariant "Worczykowa Góra" niezweryfikowany. Ujednolicić. |
| LOTR#50 | WYCIEK/NIEJEDN | krytyczna | Pytanie o nazwę, a w wariantach "smoczy wierzchowiec" (jest w treści), "skrzydlata bestia". Dodać "skrzydlaty potwór", "skrzydlaty stwór", "Fell Beast". Prompt już mówi "latający, smoczy wierzchowiec". |
| LOTR#51 | WYCIEK/WARIANTY | krytyczna | Prompt "wielkich orłów", a "orły/orly" w wariantach zaliczają odpowiedź na pytanie o imię przywódcy. Usunąć "orły/orly". |
| LOTR#53 | FAKT | średnia | Éomer to siostrzeniec Théodena, nie "bratanek" (syn siostry Théodwyny). Poprawić na "siostrzeniec". |
| LOTR#54 | WYCIEK | krytyczna | Treść: "zwany Starym Hamem", wariant "Stary Ham". Dobra odpowiedź to Hamfast Gamgee. Usunąć przydomek z treści albo zmienić pytanie. |
| LOTR#55 | WYCIEK/JĘZYK | krytyczna | Treść: "syn króla Thranduila" + "Mrocznej Puszczy" i odpowiedzi Thranduil/Mroczna Puszcza/Mirkwood. Pytanie niespójne (pyta "jak nazywa się elf", a odpowiedź dotyczy ojca). Do usunięcia, duplikat LOTR#8. |
| LOTR#56 / LOTR#9 | WYCIEK | średnia | LOTR#9 w treści "syn Glóina" (odpowiedź LOTR#56), a LOTR#56 w treści "Gimliego" (odpowiedź LOTR#9). Wzajemny przeciek. |
| LOTR#57 | WYCIEK | krytyczna | Treść: "Jak nazywa się palantír", wariant "palantir". Przeformułować bez słowa: "kryształowa kula z Isengardu...". |
| LOTR#61 | FAKT | średnia | "stolica Saurona przed jej upadkiem" nieprawda: Minas Morgul to miasto Nazgûli (Minas Ithil), stolicą Saurona jest Barad-dûr (opcja D, też pasuje). Przeformułować: "dawne Minas Ithil, zajęte przez Nazgûle". |
| LOTR#68 / LOTR#26 / LOTR#37 | DUP | niska | Trzykrotnie odpowiedź "dziewięć" (Nazgûle, pierścienie, Drużyna). LOTR#26 i LOTR#37 to to samo. Usunąć jedno. |
| LOTR#69 | SLOTY | krytyczna | Cztery sloty (człowiek, elf, krasnolud, czarodziej) w stałej kolejności; zła kolejność = 0. Dodatkowo "czarodziej" nie jest rasą. Zmienić na jeden slot lub wspólną listę. |
| LOTR#70 | SLOTY | krytyczna | Czterech hobbitów w stałej kolejności Frodo, Sam, Merry, Pippin. Prompt "wymień" nie wymusza, a wpisanie Pippin pierwszy dostaje 0. |
| LOTR#71 | SLOTY/FAKT | krytyczna | "Wymień trzech ludzi (nie-hobbitów)": nie-hobbitów jest pięcioro (Legolas, Gimli odrzucone), a ludzi tylko dwóch (Gandalf to Maia). Stała kolejność Aragorn, Boromir, Gandalf. Przeformułować: "Wymień członków Drużyny poza hobbitami" z pulą 5. |
| LOTR#72 | SLOTY | krytyczna | Merry i Pippin w stałej kolejności. |
| LOTR#73 / LOTR#74 | WYCIEK/SLOTY/TRYWIALNE | krytyczna | Slot a ("Legolas"/"Gimli") jest w treści; slot b to trywialna rasa. Duplikat LOTR#8/9. Usunąć. |
| LOTR#75 | SLOTY | krytyczna | Gondor i Rohan w stałej kolejności; zamiana = 0. |
| LOTR#76 | SLOTY/NIEJEDN | krytyczna | Slot a "Aragorn" = nazwa pytania (wyciek). Brakuje Estel, Thorongil, Dúnadan, Kamień Elfów, Wingfoot. Przeformułować na jeden slot z pełną pulą przydomków. |
| LOTR#77 | SLOTY/WYCIEK | krytyczna | Slot a "Frodo" jest w treści. Dodatkowo niezgrabne: "kto go ostatecznie ugryzł". Zostawić jeden slot (Gollum). |
| LOTR#80 | WARIANTY | średnia | Brak "brakująca łuska", "dziura w zbroi", "lewa pierś", "odsłonięte serce". "łuska" samo <60%. |
| LOTR#81 | WYCIEK | krytyczna | Treść: "Arcyklejnot", opcja B "Arcyklejnot", wariant "Arcyklejnot". Zmienić na "Serce Góry" lub opis. Dystraktor Silmaril, Nauglamír (naszyjnik), Elessar jest ok. |
| LOTR#82 | ABCD | niska | Treść wylicza pięć armii, wskazując odpowiedź. Opcje B,D odnoszą się do innych pytań (LOTR#40, LOTR#83). |
| LOTR#85 | NISZOWE | niska | Henneth Annûn: tylko dla czytelników książki. |
| LOTR#86 | WYCIEK | krytyczna | Treść zawiera "zwierciadło Galadrieli", wariant "Zwierciadło Galadrieli". |
| LOTR#87 | WYCIEK/FAKT | średnia | Warianty "broszka w kształcie liścia" powtarzają treść. Broszka w książce jest zielono-srebrna, nie złota. Poprawić "złota" na "zielona/srebrna". |
| LOTR#88 | JĘZYK | średnia | "brat-barwa Gandalfa" bez sensu. Zamienić na "członek zakonu Istari zwany Brunatnym". |
| LOTR#89 | TRYWIALNE/JĘZYK | niska | "zakonu/grupy istot (Majarów...)" niezgrabne; odp. "czarodzieje" trywialna. |
| LOTR#92 | WARIANTY | niska | "elficki" zbyt luźne; Quenya i Sindarin oba przyjęte, ok. |
| LOTR#93 | NIEJEDN | niska | "edro" to też słowo w pytaniu Gandalfa (inne zaklęcie); wariant "przyjaciel" to tłumaczenie, nie hasło. |
| LOTR#94 | WYCIEK/NIEJEDN | krytyczna | Treść: "(Strażnik w Wodzie)" w nawiasie, a wariant "Strażnik w Wodzie". Jezioro nie ma nazwy w kanonie (rzeka Sirannon). Zmienić na "Kto atakuje Drużynę w jeziorze?" bez nawiasu. |
| LOTR#95 | ABCD | niska | Opcja A najbardziej szczegółowa; B,C,D z innych lokacji (Nimrodel, Cirith Ungol), oczywiście złe. Brak wariantu "Most Durina". |
| LOTR#97 / LOTR#98 | DUP/WYCIEK | średnia | LOTR#97 przyjmuje "Szare Przystanie" (odpowiedź LOTR#98), pytanie zbyt ogólne. Usunąć LOTR#97. |
| LOTR#99 | NIEJEDN | średnia | Rządy w Shire najpierw obejmuje Lotho (Szef), potem Saruman ("Szarkey"). Lotho to opcja C. Wariant "Gnida" niezweryfikowany. Przeformułować: "kto stał za okupacją Shire". |
| LOTR#13 / LOTR#14 | WYCIEK | średnia | Każde ujawnia odpowiedź drugiego (Elrond/Rivendell). |
| LOTR#10 / LOTR#52 | WYCIEK | średnia | Denethor i Boromir w treści drugiego. |
| LOTR#22, LOTR#45, LOTR#95 | WYCIEK | niska | "Cirith Ungol" w treści LOTR#22 i opcji LOTR#95 = odpowiedź LOTR#45. |
| LOTR#4 / LOTR#5 | WYCIEK | niska | LOTR#4 w treści "Saurona" = odpowiedź LOTR#5. |
| LOTR#31 / LOTR#79 / LOTR#80 | WYCIEK | niska | Smaug w treści dwóch pytań. |
| LOTR#43 / LOTR#71 / LOTR#76 | WYCIEK | niska | "Obieżyświata" w treści LOTR#43. |
| LOTR#20 / LOTR#78 / LOTR#21 | ABCD/DUP | niska | Ta sama czwórka dystraktorów (Arwena, Éowina, Galadriela, Tauriel), LOTR#20 ujawnia odpowiedź LOTR#78. |
| LOTR#11 | ABCD | niska | Dystraktor "Lobelia" to postać żeńska, zupełnie z innej bajki; "Gríma" to odpowiedź LOTR#39. |
| LOTR#15 | ABCD/TRYWIALNE | niska | "Ognisty demon" + Warg/Troll/Smok. |
| LOTR#22 | ABCD | niska | Dwa smoki jako dystraktory pajęczycy. |
| LOTR#62-LOTR#68 | TRYWIALNE | niska | Reżyser, trzej aktorzy, tytuły filmów, liczba: nudne zapamiętanie. |
| LOTR#17, 18, 23, 24, 12, 14 | TRYWIALNE | niska | Ok. 35 pytań trywialnych w całości. |


## Wiedźmin (quiz-wiedzmin.json, 50 pytań)

Ogólnie: lepsza językowo niż LOTR, ale ma kilka twardych błędów faktu (Dijkstra, Crach, Jaskółka jako wariant, Heliotrop), kilka wycieków (Regis, Pan Lusterko, prastara krew) i dwa pytania prawdopodobnie zmyślone (gnomy "błękitnoskóre", Płaczka "ptasiopodobna"). Klaster 4 pytań o Znaki (Aard/Igni/Axii/Yrden) jest szablonowy i nudny. Proza Sapkowskiego vs gry jest mieszana bez zaznaczenia (Płotka, Vesemir/Wesemir, Wyzima/Wizima w wariantach, to dobrze), ale treść bywa grą-centryczna. Trudność: ok. 55% łatwe, 35% średnie, 10% trudne. Pytań trywialnych ok. 20 (40%).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| WIED#15 | WYCIEK | krytyczna | Treść: "wampir Regis", odpowiedź i wariant "wampir". Pytanie o "z pochodzenia" bez sensu. Zmienić: "Jakiego rodzaju wampirem jest Regis?" odp. "wyższy wampir" (bez wariantu "wampir"), lub zapytać o zawód (cyrulik). |
| WIED#16 / WIED#22 | WYCIEK | średnia | WIED#16 w treści "lubiący gwint" = odpowiedź WIED#22. |
| WIED#22 | WARIANTY | średnia | Brak "Gwent" (standardowa polska pisownia marki, używana też w komunikacji CDPR) i "Gwent: Wiedźmińska Gra Karciana". Duplikaty "gwint"/"Gwint" zbędne. |
| WIED#29 | WYCIEK/JĘZYK | krytyczna | Treść: "prastara krew", wariant "prastara krew". "żywioł elfów" bez sensu (to rodowód/gen). Przeformułować: "Jak nazywa się elfi gen dziedziczony przez Ciri?" |
| WIED#48 | DUP/ABCD | średnia | Powtarza WIED#29 (Starsza Krew). Dystraktory: "Lara Dorren" (postać), "Teleportacja" (też arguable-poprawna), "Aard" (Znak). Opcja B najbardziej szczegółowa. Usunąć jedno z pary. |
| WIED#32 | FAKT | krytyczna | Dijkstra nie jest czarodziejem ani "mentorem", tylko szefem wywiadu Redanii; w grach jest łysy, ale brak mocnych dowodów na "jednookiego". Odpowiedź Dijkstra przy tej treści wprowadza w błąd. Przeformułować: "Jak nazywa się łysy szef redańskiego wywiadu?" |
| WIED#33 | FAKT/JĘZYK | niska | "zniewieściały" nie pasuje do Eredina (surowy dowódca Dzikiego Gonu), PRAWDOPODOBNE halucynacja. W treści "Dzikiego Gonu" ujawnia odpowiedź WIED#28. |
| WIED#35 / WIED#36 | WYCIEK/DUP | średnia | WIED#35 w treści "Gaunter O'Dimm" = odpowiedź WIED#36; WIED#36 w treści "Serca z Kamienia" = odpowiedź WIED#35. |
| WIED#36 | WYCIEK | krytyczna | Treść: "zwany Panem Lusterko", wariant "Pan Lusterko". Usunąć przydomek z treści albo pytać o O'Dimma bez "Lusterka". |
| WIED#38 | WARIANTY/FAKT | krytyczna | Wariant "Jaskółka" zalicza złą odpowiedź: Jaskółka to eliksir leczniczy, nie nocnego widzenia. Usunąć. Dodać "Kot" (nazwa w W3). |
| WIED#43 | NIEJEDN/FAKT | krytyczna | "Heliotrop" jest kanonicznym Znakiem w prozie i alternatywą Quen w W3, więc klucz wątpliwy (a Axii wśród opcji brak). Zastąpić czymś jednoznacznym (np. "Yrden/Axii/Igni/Heliotrop" lub wyrzucić). |
| WIED#46 | FAKT/NIEJEDN | krytyczna | Crach an Craite nie jest kandydatem, to jarl i ojciec kandydatów (Hjalmar, Cerys). Klucz A wadliwy; pasują Hjalmar i Cerys (obie opcje w zestawie). Zmienić treść ("ojciec kandydatów") lub klucz. |
| WIED#45 | FAKT | średnia | PRAWDOPODOBNE zmyślone: nie znalazłem w W3 "błękitnoskórych skrzatów przy stawie" (w Krwi i Winie są gnomo-podobne chochliki/pixies). Pytanie nieweryfikowalne; "Bobołaki" jako dystraktor niezwiązany. Usunąć lub sprawdzić. |
| WIED#49 | FAKT | średnia | PRAWDOPODOBNE zmyślone: "Płaczka", "ptasiopodobna", "biała pani" nie dają się potwierdzić. Dystraktory (Mglak, Południca, Pijawka) są z innych kategorii. Zweryfikować w grze lub usunąć. |
| WIED#10 | TRYWIALNE/WARIANTY | średnia | "Kim jest Triss" odpowiedź "czarodziejka" w treści WIED#1/39; nadmiernie otwarte (mag, magiczka). Zamienić na pytanie o skąd pochodzi (Maribor), ksywę ("Rudowłosa") lub losy. |
| WIED#11 | JĘZYK | średnia | "rumiana klacz Geralta, którą wiedźmin nazywa kolejne wierzchowce" nieskładne. Poprawić: "Jak Geralt nazywa każdego ze swoich koni?" Dodać "Roach". |
| WIED#41 | WYCIEK | niska | Treść "opowiadanie o wiedźminie" podpowiada tytuł "Wiedźmin". |
| WIED#4 / WIED#5 | WYCIEK | niska | WIED#5 w treści "Kaer Morhen" = odpowiedź WIED#4. |
| WIED#19 / WIED#28 | WYCIEK | niska | WIED#19 odpowiedź "Dziki Gon" = odpowiedź WIED#28; WIED#28 w treści "podtytuł trzeciej gry". |
| WIED#6-9 | DUP/TRYWIALNE | średnia | Cztery pytania "Który Znak..." (+WIED#43). Zostawić jedno pytanie (np. "Wymień Znaki") lub dwa. Opcje WIED#43 i WIED#48 ujawniają nazwy Znaków. |
| WIED#30 | JĘZYK | niska | Pytanie złożone z trzech pytań naraz; zostawić "z jakiego metalu jest miecz na potwory?" Dodać "ze srebra", "srebrem". |
| WIED#23 / WIED#38 | DUP | niska | Kocie oczy / Kocie Oko wzajemnie się podpowiadają. |
| WIED#13 | WARIANTY | niska | Dodać "topielec", "drowner". |
| WIED#14 | WARIANTY | niska | Dodać "leszen". |
| WIED#3 | WARIANTY | niska | Dodać "Dandelion". |
| WIED#47 | ABCD | niska | Poprawna odpowiedź najdłuższa; "Mikolai" (pisownia z angielska) jako dystraktor. |
| WIED#42 | OK | - | Dobre, jednoznaczne. |
| WIED#0-3, 17, 18, 20, 21, 25, 26 | TRYWIALNE | niska | Ok. 20 pytań "kto/co to" dla każdego gracza. |


## Gry wideo (quiz-gry-wideo.json, 100 pytań)

Ogólnie: najsłabsza jakościowo paczka, choć faktograficznie prawie poprawna. Ok. 65% pytań jest trywialnych ("Kto produkuje PlayStation?", "Jak nazywa się hydraulik Nintendo?"), prawie wszystkie to jednozdaniowe "Jak nazywa się X opisany wprost". Około 20 pytań ma odpowiedź (lub jej rdzeń) w treści (schemat "podtytuł brzmi „Skyrim”", "oznaczana skrótem SNES"), a 10 ostatnich (#90-99) to puste "Wymień grę i jej studio", gdzie jeden slot jest podany w pytaniu, a drugi duplikuje wcześniejsze pytanie. Wzajemne przecieki w parach "gra → studio" i "studio → gra" (Rockstar, Blizzard, Valve, Epic, Capcom, Bethesda, Naughty Dog) sprawiają, że pytania podpowiadają sobie same. Trudność: ok. 70% łatwe, 25% średnie, 5% trudne. Pytania ze świata Wiedźmina (#3, #4, #5, #69-72, #90, #93) duplikują paczkę Wiedźmin.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| GRY#44 | WYCIEK | krytyczna | "podtytuł brzmi „Skyrim”", odpowiedź "Skyrim". Zmienić: "Jak nazywa się piąta część TES?" |
| GRY#55 | WYCIEK | krytyczna | "podtytuł brzmi „Breath of the Wild”", odpowiedź tożsama. |
| GRY#70 | WYCIEK | krytyczna | "podtytuł brzmi „Dziki Gon”", odpowiedź tożsama. |
| GRY#48 | WYCIEK | krytyczna | Treść "PS2", wariant "PS2". |
| GRY#50 | WYCIEK | krytyczna | Treść "SNES", wariant "SNES". |
| GRY#82 | WYCIEK/WARIANTY | krytyczna | Treść "NES", wariant "NES". Wariant "Pegasus" to inna (pirackia) konsola, zaliczanie jej jest błędne. |
| GRY#53 | WYCIEK/WARIANTY | krytyczna | Treść "FIFA", wariant "FIFA". Wariant "FC" (2 litery) za luźny. Właściwie pytanie powinno brzmieć: "Jak nazywa się seria po 2022?" odp. "EA Sports FC". |
| GRY#73 | WYCIEK | krytyczna | Treść "znana też jako Biohazard", wariant "Biohazard". Odpowiedź Resident Evil jest przypisana tytułowi, którego pytanie nie zdradza, ale wariant pozwala przepisać. |
| GRY#85 | WYCIEK | krytyczna | "tytuł zaczyna się od słowa Forza", wariant "Forza". |
| GRY#49 | WYCIEK/WARIANTY | średnia | Treść: "Mega Drive", warianty "Mega Drive", "Sega Mega Drive". Odpowiedź Genesis jest nazwą z USA. Zmienić na "w USA znana jako". |
| GRY#66 | WYCIEK | średnia | "o budowaniu cywilizacji" + wariant "Cywilizacja". |
| GRY#40 | WYCIEK | średnia | "bractwem skrytobójców" to dosłownie "assassin". Plus Ubisoft w treści (odpowiedź GRY#41). |
| GRY#59 | WYCIEK/FAKT | niska | "PUBG Corporation" w treści = wariant "PUBG". Gra nazywa się obecnie "PUBG: Battlegrounds". |
| GRY#88 | JĘZYK/WYCIEK | niska | "jamraj" nie istnieje, "(bandikut)" odsłania "Bandicoot"; dystraktor "Jak" bez sensu. |
| GRY#36 | FAKT | średnia | "gra-łamigłówka": This War of Mine to survival/strategia. 11 bit studios w treści = odpowiedź GRY#37. |
| GRY#86 | FAKT | krytyczna | SCS Software jest czeskie (Praga), nie polskie. PEWNE. Poprawić na "czeskiej serii". |
| GRY#42 | WARIANTY | średnia | Wariant "Red Dead Redemption" zalicza część pierwszą (John Marston), a treść mówi o Arthurze Morganie. Rockstar w treści = odpowiedź GRY#8. |
| GRY#96 | SLOTY/WARIANTY | krytyczna | Trzy sloty w stałej kolejności (Sony, Microsoft, Nintendo); każda inna kolejność = 0. Dodatkowo "PS" za krótkie, mieszanie producentów z markami ("Sony" vs "PlayStation"). Zmienić na jeden slot z 3 trafieniami. |
| GRY#90-95, 97-99 | SLOTY/WYCIEK/DUP | krytyczna | Dziesięć pytań "Wymień grę i jej studio/konsolę i producenta": slot a jest podany w treści (gracz przepisuje), slot b to duplikat wcześniejszego pytania (#3, #28, #29, #33, #6, #26/#27, #24/#83, #1/#2). Usunąć wszystkie. |
| GRY#97 | JĘZYK | niska | "Mojang stworzyło którą kultową grę o blokach?" niegramatyczne. |
| GRY#18 / GRY#19 | WYCIEK | średnia | Wzajemny: Riot w #18, League of Legends w #19. |
| GRY#22 / GRY#23 | WYCIEK | średnia | Valve i Steam wzajemnie. |
| GRY#26 / GRY#27 / GRY#98 | WYCIEK/DUP | średnia | The Last of Us/Naughty Dog zadane trzy razy. |
| GRY#31 / GRY#32 / GRY#33 / GRY#95 | WYCIEK/DUP | średnia | Epic, Fortnite, Unreal wzajemnie, czterokrotnie. |
| GRY#39 / GRY#56 | WYCIEK | średnia | Kratos i God of War w treści drugiego. |
| GRY#43 / GRY#45 | WYCIEK | średnia | Fallout/Bethesda wzajemnie. |
| GRY#46 / GRY#47 | WYCIEK | średnia | Doom/id Software wzajemnie. |
| GRY#62-65, GRY#68 | WYCIEK/DUP | średnia | Blizzard i trzy jego tytuły wymienione w GRY#62 wzajemnie z GRY#63-65; GRY#68 powtarza Blizzard. |
| GRY#73 / GRY#74 / GRY#80 | WYCIEK | średnia | Capcom, Resident Evil, Mega Man wzajemnie. |
| GRY#76 / GRY#77 | WYCIEK | średnia | Metal Gear/Kojima wzajemnie. |
| GRY#24 / GRY#83 / GRY#99 | WYCIEK/DUP | średnia | Elden Ring i FromSoftware zadane trzy razy. |
| GRY#37 / GRY#87 / GRY#28 | WYCIEK | niska | Opcje zawierają odpowiedzi innych pytań (Techland, Bloober Team). |
| GRY#12 | ABCD | niska | "Ganon" i "Donkey Kong" to antagoniści innych serii/inny charakter; ok, ale łatwe. |
| GRY#14 | ABCD | niska | Dystraktory z tej samej serii, ale trywialnie. |
| GRY#72 | ABCD | niska | Dystraktory "Anna" i "Vesemir" (mężczyzna) absurdalne. |
| GRY#84 | NIEJEDN | niska | "z niebieskim logiem" pasuje do Skype i TeamSpeak. |
| GRY#71 | NIEJEDN | niska | "jedna z głównych miłości": Triss, Shani też pasują; ratuje tylko "czarnowłosa". |
| GRY#78 | JĘZYK | niska | "Donkey Konga" (dopełniacz) może być odczytane jako gra Donkey Konga. |
| GRY#3, 4, 5, 69-72, 90, 93 | DUP | średnia | Duplikaty z paczką Wiedźmin (np. studio, autor, bohater, Gwint, Dziki Gon, Yennefer, Ciri). |
| GRY#0-2, 6-11, 13-17, 20, 23, 31, 34, 35, 38, 52, 54, 61, 63-65, 67, 79, 89 | TRYWIALNE | niska | Ok. 65 pytań trywialnych ("Sony", "Microsoft", "hydraulik Mario", "Tetris"). |
| GRY#25 | WARIANTY | niska | "Mistrz John" niezweryfikowany; dodać "John-117", "Chief". |
| GRY#21, 30, 57, 58, 75, 77, 83 | OK | - | Pytania z rozsądnymi dystraktorami (Alyx Vance/Adrian Shephard, Idris Elba z Phantom Liberty, Hallownest). |

## Wnioski systemowe

Przejrzano: 350 pytań (HP 100, LOTR 100, Wiedźmin 50, Gry wideo 100).
Z problemem krytycznym: ok. 10 (HP: #41, #56 + 8 pozostałych semi-krytycznych), LOTR ok. 28, Wiedźmin 7, Gry wideo ok. 21 = łącznie ok. 65 (ok. 19%). Z problemem średnim: ok. 60.

Powtarzalne wzorce błędów generatora:
1. **Odpowiedź w treści.** Najczęstszy błąd: "Jak nazywa się X, zwany Y?" z Y w wariantach (Glizdogon, Gadzi Język, Stary Ham, Pan Lusterko, Arcyklejnot, palantír, Zwierciadło Galadrieli, Strażnik w Wodzie, Czarni Jeźdźcy, Thranduil, Regis-wampir); "podtytuł brzmi „Skyrim/BotW/Dziki Gon”"; "oznaczana skrótem SNES/NES/PS2/FIFA"; "zaczyna się od Forza". Wprowadzić automatyczny test: żaden wariant (po normalizacji, z uwzględnieniem tolerancji literówek) nie może być podciągiem treści pytania i odwrotnie.
2. **Wzajemne przecieki w obrębie paczki.** Pary i klastry pytań (A-B, B-A) zdradzają się nawzajem w treści lub opcjach (Lucjusz–Draco, Durmstrang–Beauxbatons, Narsil–Anduril, Elrond–Rivendell, Boromir–Denethor, studio–gra). Generować pytania z listy faktów jednorazowo (każdy fakt raz) i sprawdzać krzyżowo, czy odpowiedź jednego pytania nie występuje w treści innego.
3. **Pytania wielopolowe zbudowane na stałej kolejności.** LOTR #69-72, #75, #76, HP #56, #92, Gry #96: kolejność odpowiedzi jest wymagana, a w treści nic o niej nie mówi. Zasada: pytanie "wymień N" albo jeden slot z listą N wymaganych trafień (nieuporządkowanych), albo wspólna lista wariantów w każdym slocie + deduplikacja po stronie silnika.
4. **Slot z odpowiedzią w treści.** "Podaj postać i jej rasę: Legolas...", "Wymień grę i jej studio: gra Wiedźmin...", "Frodo nosił Pierścień, a kto...". Zakazać slotów, których odpowiedź jest podana w treści.
5. **Zbyt luźne lub błędne warianty.** "Tom" (HP#4), "Jaskółka" (WIED#38), "orły" (LOTR#51), "Pegasus", "Red Dead Redemption", "inskrypcja" (LOTR#36), "FC", "PS", "id". Warianty muszą być generowane jako "synonimy tej samej odpowiedzi", nie "skojarzenia".
6. **Błędy faktu z halucynacji opisu.** Dijkstra jako czarodziej, Crach jako kandydat, SCS jako polskie, Éomer jako bratanek, miruvor z Lórien, Bilbo jako pierwszy znalazca Pierścienia, Minas Morgul jako stolica Saurona, "błękitne gnomy", "ptasiopodobna Płaczka". Wymagać drugiego przebiegu weryfikującego fakty, zwłaszcza opisy postaci i miejsc.
7. **Kalkowane/niezgrabne sformułowania.** "brat-barwa", "żywioł elfów", "ludzcy królowie", "którą wiedźmin nazywa kolejne wierzchowce", "jamraj", "kto go ostatecznie ugryzł", "Podaj narząd..." (wzorce). Dodać krok redakcji językowej.
8. **ABCD: dystraktory ze wspólnej, małej puli.** Myślodsiewnia/Świstoklik (HP), Arwena/Éowina/Galadriela/Tauriel (LOTR), dystraktory absurdalne ("Wąż morski", "Kula", "Lobelia", "Lustro Galadrieli") i zbyt szczegółowa poprawna opcja. Rozkład poprawnych liter w HP: A 10, B 10, C 6, D 2. Losować pozycję poprawnej odpowiedzi.
9. **Duplikaty i klastry tematyczne.** HP: 8 pytań o domy/założycieli, 3 o Klątwy Niewybaczalne, 3 o tytuły; LOTR: 3x "dziewięć"; Wiedźmin: 4 Znaki; Gry: studio-do-gry w 3 wersjach i 9 duplikatów z paczką Wiedźmin. Wprowadzić limit 1-2 pytania na fakt/temat oraz deduplikację między paczkami.
10. **Za dużo trywialnych pytań.** Poziom "średni" nie jest zachowany: Gry wideo ~65% trywialnych, HP i LOTR ~40%, Wiedźmin ~40%. Brak pytań z "haczykiem" (poza kilkoma: Idris Elba, Regulus Black, Glorfindel, Żongler, Fred/George).
11. **Tłumaczenia.** HP (Polkowski) w większości poprawne, brak tylko wariantów alternatywnych (Płynne Szczęście, Ekspres do Hogwartu, Mikołaj Flamel – PRAWDOPODOBNE). LOTR: dobre warianty Skibniewskiej (Obieżyświat, Brandywina, Rozbrykany Kucyk, Helmowy Jar, Rogowy Gród), ale warianty z innych tłumaczeń (Worczykowa Góra, Gorzaleń, Gworn, Gnida, miód elfów) nie zostały zweryfikowane i część wygląda na zmyślone; Baggins/Bagosz ok. Wiedźmin: dobrze pokryte książka+gra (Wyzima/Wizima, Vesemir/Wesemir), brak Gwent i Kot.
