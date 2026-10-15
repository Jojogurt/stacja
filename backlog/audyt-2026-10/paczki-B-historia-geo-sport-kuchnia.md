# Audyt treści STACJA — paczki B (historia, geografia, sport, lotnictwo, kuchnia)

Uwaga metodologiczna (scoring.js, sprawdzone w kodzie): `nearMatch` toleruje 1 literówkę od 6 znaków, zawieranie się napisów gdy krótszy >= 60% dłuższego, a podobieństwo >= 0.84. Skutek dla numeracji rzymskiej/arabskiej: wariant "August II" zalicza "August III", "Jan III" zalicza "Jan II", "Zygmunt III" zalicza "Zygmunt I/II", "Apollo 11" zalicza "Apollo 12/13", "Ludwik XIV" zalicza "Ludwik XV", "Władysław III" zalicza "Władysław II/IV", "Mieszko II" zalicza "Mieszko I" (i odwrotnie). Odpowiedź "63 dni" nie zalicza wariantu "63" (zawieranie wymaga min. 4 znaków obu napisów). Wariant dłuższy niż wpisany ("Jezioro Michigan" vs "Michigan") bywa odrzucany (<60%).

## historia-polski (100 pytań)

Ocena: pytania szkolne, suche, ok. 70% łatwych / 25% średnich / 5% trudnych. Styl powtarzalny (pary "w którym roku" + "którego dnia" o tym samym wydarzeniu), wiele wzajemnych przecieków między pytaniami (treść jednego zdradza odpowiedź drugiego). Sekcja wielopolowa (90-98) jest w większości niegrywalna: sloty w sztywnej kolejności, a lista odpowiedzi jest krótsza niż zbiór poprawnych (np. 7 Jagiellonów, 6 prezydentów). Brakuje aktualizacji: prezydent po Dudzie (Nawrocki od 2025).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| hp#14 | FAKT | średnia | "drugi pokój toruński, kończący wielką wojnę z zakonem" — "Wielka wojna" (1409-1411) zakończył pierwszy pokój toruński 1411 (opcja A!); 1466 kończy wojnę trzynastoletnią. Popraw: "kończący wojnę trzynastoletnią". |
| hp#19 | WARIANTY | średnia | "Turcja","Imperium Osmańskie","Osmanowie" — brak "Turcy","Turków","Turcja osmańska". Dodaj. |
| hp#21 | WARIANTY | niska | dodaj "Stany Zjednoczone Ameryki", "Ameryka". |
| hp#22 | WARIANTY | średnia | brak "Stanisław August" (nie zaliczy: sim 0.77), "Stanisław II August". |
| hp#27, #28 | WYCIEK | średnia | "w listopadzie 1830" -> "listopadowe"; "w styczniu 1863" -> "styczniowe". Pytanie o nazwę zdradza miesiąc = przydomek. Zamień na opis bez miesiąca. |
| hp#28/#29, #27/#87 | WYCIEK | średnia | #28 podaje 1863 (odpowiedź #29), #87 "noc listopadowa" zdradza odpowiedź #87a i #27. |
| hp#4-6 | WYCIEK/DUP | średnia | #4 "do Kazimierza Wielkiego" zdradza odpowiedź #5 i #6 (cytat) i vice versa; #10 "Władysława Jagiełły" zdradza #9; #73 "Mazurek Dąbrowskiego" zdradza #74. |
| hp#33/#34/#82 | DUP | średnia | Bitwa Warszawska 1920 pytana 3 razy; #33 podaje 1920, #34 nazwę. Zostaw jedno. |
| hp#1/#85, #2/#83, #30/#31, #37-40, #44-46, #57-58, #63-64 | DUP | niska | pary pytań o to samo wydarzenie z przeciekiem; #85 slot a "chrzest Polski" = treść promptu. |
| hp#47 | WARIANTY | niska | dodaj "powstanie w warszawskim getcie", "powstanie w getcie warszawskim", "getto". |
| hp#46 | WARIANTY | niska | wolny tekst "63 dni" nie zaliczy "63"; dodaj "63 dni". |
| hp#49 | NIEJEDN | średnia | "obóz ... na ziemiach polskich, symbol Holokaustu" — Treblinka, Majdanek, Sobibór, Bełżec też pasują; dopisz "największy"/"w którym zginęło ok. 1,1 mln osób" i dodaj "KL Auschwitz". |
| hp#50 | NIEJEDN/DUP | średnia | "system polityczny" — odpowiedź otwarta ("PRL" to nazwa państwa, nie system); zaliczy "PRL" a #51 pyta o to samo. Rozdziel: #50 "komunizm/realny socjalizm", #51 PRL. |
| hp#69 | NIEJEDN/FAKT | średnia | "pierwsza stolica ... z katedrą i grobami pierwszych władców" — groby Mieszka I i Chrobrego są w katedrze w POZNANIU; Gniezno jest tradycyjną pierwszą stolicą, ale opis wskazuje Poznań. Popraw: "miejsce zjazdu 1000 r. z grobem św. Wojciecha". |
| hp#70 | FAKT | średnia | Konrad Mazowiecki był księciem, nie królem ("Który polski król"). Popraw: "książę". |
| hp#71 | JĘZYK/NIEJEDN | średnia | "Jak nazywał się układ ... — które trzy państwa go dokonały? Podaj jedno" — dwa pytania w jednym; DUP z #90, #95. Przeredaguj albo usuń. |
| hp#74 | NIEJEDN | średnia | "generał, którego imię pojawia się w hymnie" — w tekście są też Bonaparte (generał) i Czarniecki (hetman). Popraw: "którego nazwisko nosi hymn". |
| hp#72 | NISZOWE | niska | marszałek Sejmu Wielkiego (Małachowski) — OK pubquizowo, ale tylko tu. |
| hp#85 | WYCIEK | krytyczna | slot a "chrzest Polski" jest w treści ("chrzest Polski za panowania Mieszka I"). |
| hp#86 | WYCIEK | średnia | slot a: prompt opisuje wydarzenie ("uchwalenie pierwszej polskiej konstytucji"), zaliczy "uchwalenie konstytucji". Zostaw tylko rok. |
| hp#87 | WYCIEK | krytyczna | "nocy listopadowej" = powstanie listopadowe. |
| hp#88 | NIEJEDN | niska | "zryw warszawiaków przeciw Niemcom" pasuje też do getta (1943). Dodaj "w 1944" w treści. |
| hp#89 | WYCIEK | krytyczna | slot b "rola" = "późniejszy prezydent" w treści; ponadto DUP z #56, #65. |
| hp#84 | SLOTY | niska | slot b akceptuje "Sobieski" = to samo co slot a. |
| hp#91 | WYCIEK | krytyczna | etykieta slotu c "ród Sobieskiego" i opis "ród Jana III" zdradzają odpowiedź. |
| hp#90 | SLOTY | krytyczna | Rosja/Prusy/Austria w stałej kolejności; "Austria, Rosja, Prusy" odrzucone, "Rosja" 3x zaliczona. Wszystkie sloty = [Rosja, Prusy, Niemcy, Austria]. |
| hp#92 | TRYWIALNE | niska | Warszawa i Kraków; Gniezno sporne (Poznań/Ostrów Lednicki). |
| hp#93 | SLOTY/NIEJEDN | krytyczna | Jagiellonów-królów jest 7 (dodatkowo Warneńczyk, Jan Olbracht, Aleksander); sloty tylko 4 konkretne w stałej kolejności. Przeredaguj ("Wymień kolejnych: Jagiełło, ?, ?, Zygmunt Stary") albo użyj identycznych list z 7 nazwiskami. |
| hp#94 | SLOTY/DUP | krytyczna | literatura nobel: sloty a=Sienkiewicz, b=Reymont, c=reszta, kolejność wymuszona; Miłosz/Szymborska/Tokarczuk w a lub b odrzuceni. Poza kategorią historii. |
| hp#95 | SLOTY/JĘZYK | krytyczna | "dzieląc dawne ziemie ... (nazwy zaborów)" — niegramatyczne; "Rosja/Prusy/Austria" odrzucone (tylko przymiotniki); stała kolejność. |
| hp#96 | SLOTY | krytyczna | I sekretarzy PZPR było więcej (Bierut, Ochab, Kania, Rakowski); stała kolejność Gomułka/Gierek/Jaruzelski. |
| hp#97 | NISZOWE | niska | Chłopicki jako dyktator listopadowy — niszowe; sloty etykietowane, ok. |
| hp#98 | FAKT/SLOTY | krytyczna | prezydentów III RP jest 6 (+ Duda 2015-2025, Nawrocki od 2025); slot d: Komorowski albo Duda, a Nawrocki odrzucony; stała kolejność. Wszystkie sloty = [Wałęsa, Kwaśniewski, Kaczyński, Komorowski, Duda, Nawrocki]. |
| hp#99 | DUP | niska | powtarza #60-62. |
| hp#0,#16,#37,#48,#63 | TRYWIALNE | niska | #16 Kopernik (kategoria? i dup z hs#38), reszta dziecinna. |
| hp#20/#21/#86 | DUP | niska | konstytucja 3 maja 3x. |
| hp#55/#56/#65/#89/#98 | DUP | niska | Wałęsa w 4 pytaniach. |

## historia-swiata (100 pytań)

Ocena: poziom podstawówki/gimnazjum — ok. 85% trywialnych ("Kto był pierwszym prezydentem USA?"), 14% średnich, 1% trudnych. Prawie zero haczyków; wiele pytań "podaj nazwę" z odpowiedzią podaną w treści sąsiedniego pytania. ABCD miewa dystraktory z innej epoki lub kategorii. Wszystkie pytania wielopolowe z kolejnością.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| hs#5/#7 | WYCIEK | średnia | #5 "między Tygrysem a Eufratem" zdradza odpowiedź #7. |
| hs#7 | SLOTY | krytyczna | Tygrys/Eufrat w stałej kolejności. Oba sloty = [Tygrys, Eufrat]. |
| hs#10/#11 | WYCIEK | średnia | #11 "nauczycielem Aleksandra Wielkiego" zdradza #10. |
| hs#21/#31 | WYCIEK | średnia | Konstantynopol w obu. |
| hs#22 | WARIANTY | średnia | brak "Mohamed","Mahometa","Mohammed","Muhammad ibn Abd Allah". "Mohamed" nie zaliczy się z "Muhammad" (lev 2). |
| hs#27 | WARIANTY | niska | "czarna dżuma" jako wariant, ale zwykła "dżuma" odrzucona; ok. |
| hs#28/#29 | WYCIEK | średnia | #29 "z czasów wojny stuletniej" zdradza #28. |
| hs#31 | WARIANTY | krytyczna | poprawne "Turcy","Turcja","Turków" odrzucone (tylko "imperium osmańskie","Turcja osmańska","osmańskie","Osmanowie"; "Turcja"/"Turcja osmańska" = 0.4). Dodaj. |
| hs#32 | ABCD/TRYWIALNE | niska | dystraktory z innych epok (Leonardo, Galileusz, Marco Polo). |
| hs#36/#37 | WYCIEK | niska | opcja B w #37 = odpowiedź #36. |
| hs#38 | DUP | niska | identyczne z hp#16 (Kopernik). |
| hs#40 | WYCIEK | krytyczna | "epoka odrodzenia" -> wariant "odrodzenie" jest w treści. |
| hs#44 | WARIANTY | krytyczna | wariant "Ludwik XIV"/"Ludwik 14": wpisanie "Ludwik XV" zalicza się (lev 1, długość 10). |
| hs#49/#50 | WYCIEK | średnia | #50 "po klęsce pod Waterloo" zdradza #49. |
| hs#55 | WARIANTY | niska | dodaj "wojna domowa w USA","Civil War". |
| hs#57 | NIEJEDN | niska | żarówka: Swan/Łodygin/Edison — prompt mówi "opatentował", ok; dopisz "(pierwszy komercyjny patent)". |
| hs#60/#61 | WYCIEK | średnia | #60 "w 1914" = odpowiedź #61a. |
| hs#60 | ABCD | niska | poprawna opcja najdłuższa. |
| hs#63 | WARIANTY | niska | "Włodzimierz Iljicz Lenin" odrzucone (0.71, nie zawiera się). |
| hs#65 | WARIANTY | niska | "Nowy Jork" jako odpowiedź na "którą giełdę" jest miastem; dodaj "NYSE","New York Stock Exchange"; "giełda nowojorska" skrócona "nowojorska" odrzucona. |
| hs#66 | FAKT | niska | Fleming odkrył, ale "opracował" penicylinę jako lek Florey/Chain; zmień na "odkrył". |
| hs#68 | TRYWIALNE | niska | |
| hs#73 | SLOTY | niska | etykiety "pierwsze/drugie miasto" bez sprecyzowania kolejności bombardowania. |
| hs#74 | DUP | niska | = hp#48; ABCD nieposortowane. |
| hs#75-77 | WYCIEK/DUP | średnia | #75, #76, #64 zdradzają odpowiedzi #77. |
| hs#82/#86-87 | WYCIEK | niska | "kubański" w kolejnych. |
| hs#83/#86 | WYCIEK | średnia | opcja B #86 "Jurij Gagarin" = odpowiedź #83; #84 ABCD z kosmonautą z innej kategorii. |
| hs#85 | WARIANTY/NIEJEDN | krytyczna | "Apollo 11" + wariant "Apollo": "Apollo 12/13" zaliczone (lev 1), a w 1969 lądowały obie 11 i 12. Popraw: "pierwsza załogowa misja"; usuń wariant "Apollo". |
| hs#88 | WARIANTY | średnia | częsta pisownia "Ghandi"/"Gandi" odrzucona (lev 2). |
| hs#68,#72,#74,#98 | DUP | niska | z hp (1939, Auschwitz, 1945, Solidarność). |
| hs#33,#49,#61,#63,#73,#81 | SLOTY | niska | OK (etykiety), ale podwójne pytania "rok + X" bez haczyka. |
| hs#98, hs#68 | KATEGORIA | niska | Solidarność i atak na Polskę pasują do hp. |
| hs#4, #14, #41, #46, #48, #59, #64, #67, #69, #75, #76 | TRYWIALNE | niska | pytania dla dzieci. |

## krolowie-polscy (50 pytań)

Ocena: lepsza niż historia-polski (ok. 35% łatwych / 45% średnich / 20% trudniejszych), ale zawiera 4 błędy faktów w treści pytań, kilka oczywistych wycieków i mnóstwo wzajemnych podpowiedzi. 8 pytań to duplikaty pytań z historia-polski (0,1,4,6,7,13,14,15,16,21,49). Główne ryzyko techniczne: warianty z numeracją rzymską ("August II", "Jan III", "Zygmunt I/II/III", "Władysław III", "Kazimierz I/IV", "Mieszko II", "Bolesław II") zaliczają sąsiednich władców o tym samym imieniu.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| kp#0, #1, #4, #6, #7, #13, #14, #15, #16, #21, #49 | DUP | średnia | identyczne lub niemal identyczne z historia-polski (#0, #2, #5, #7-9, #13, #17, #22, #4, #10, #15, #20/#86). |
| kp#2/#38/#39 | WYCIEK | niska | #39 "koronowany w 1025" zdradza odpowiedź #2. |
| kp#3, #4, #15, #36 | WYCIEK/DUP | średnia | cztery pytania o Kazimierza Wielkiego; #15 "do Kazimierza Wielkiego" zdradza #4, #3 daje cytat. |
| kp#5 | WYCIEK | niska | "jako Władysław II" zdradza imię. |
| kp#7 | JĘZYK | niska | "Kto jako pierwsza zasiadła na tronie ... jako koronowany władca (król) z dynastii Andegawenów" — niezgrabne; popraw: "Jak miała na imię córka Ludwika Węgierskiego, koronowana na króla Polski w 1384?". |
| kp#8, #41, #42 | WYCIEK/DUP | średnia | #41 "przydomek brzmiał Śmiały lub Szczodry" i #42 "Bolesław Śmiały" zdradzają #8 (odp. "Śmiały","Szczodry") — te trzy pytania to jedno. |
| kp#9 | WYCIEK | krytyczna | "król Polski jako August II ... przydomek Mocny" — odpowiedź "August II Mocny" jest w treści. Dodatkowo wariant "August II" zalicza "August III". |
| kp#10/#11 | WYCIEK/DUP | średnia | #11 "w 1573" zdradza #10. |
| kp#14 | JĘZYK/FAKT | średnia | "ostatnim królem Polski przed rozbiorami" — panował PODCZAS rozbiorów (1772, 1793, 1795). Popraw: "ostatnim królem Rzeczypospolitej". |
| kp#16/#21 | WYCIEK | niska | #21 "ostatni z dynastii Jagiellonów" zdradza #16. |
| kp#17 | WARIANTY | krytyczna | wariant "Władysław III" zalicza "Władysław II/IV" (lev 1). Usuń "Władysław III" lub dodaj pełny. |
| kp#18 | FAKT | krytyczna | "Który król, OJCIEC Władysława Warneńczyka i Kazimierza Jagiellończyka, panował w latach 1447-1492" — odpowiedź Kazimierz Jagiellończyk jest synem Jagiełły i bratem Warneńczyka, nie ojcem. Popraw: "młodszy brat Władysława Warneńczyka". Wariant "Kazimierz IV" zalicza "Kazimierz III". |
| kp#18/#19 | WYCIEK | niska | "wojna trzynastoletnia" w obu. |
| kp#20 | WARIANTY | średnia | "Zygmunt I" zalicza "Zygmunt II/III"; "Stary" za krótkie. |
| kp#22/#23 | WYCIEK | średnia | lista "Zygmunt III, Władysław IV i Jan Kazimierz" zdradza odpowiedź #23 i #27/#48. |
| kp#23/#24 | WYCIEK | średnia | #23 "z Krakowa do Warszawy" = odpowiedź #24 (trywialne). Wariant "Zygmunt III" zalicza "Zygmunt I/II". |
| kp#25 | NIEJEDN | niska | Chrobry koronowany w Gnieźnie; "tradycyjnie" ok, ale dodaj "Gniezno"? lub doprecyzuj "od 1320". |
| kp#27/#28 | WYCIEK | średnia | #27 "potopu szwedzkiego" = odpowiedź #28. |
| kp#29 | FAKT | krytyczna | Michał Korybut Wiśniowiecki NIE był ojcem cesarza (bezdzietny; żona Eleonora była siostrą cesarza Leopolda I). Popraw: "szwagier cesarza Leopolda I". |
| kp#30 | WYCIEK | krytyczna | "listów do ukochanej Marysieńki" — odpowiedź ("Marysieńka") w treści; listy pisał Jan III, a nie ona. |
| kp#31/#32 | WYCIEK | średnia | #31 "testamentem" zdradza #32; #32 odp. "Krzywoustego" zdradza #31. |
| kp#32 | WARIANTY | średnia | brak "testament" (zawieranie 9/22 < 60%). |
| kp#33/#34 | WYCIEK/DUP | średnia | #33 podaje 1320, #34 pyta o 1320 i wymienia Łokietka. |
| kp#35 | FAKT/JĘZYK | średnia | "Jaki przydomek ... Wacław II" — "Czeski" to określenie, nie przydomek; w treści "Przemyślidów" a wariant "Przemyślida". Popraw: "Z jakiego kraju pochodził". |
| kp#37 | WYCIEK | krytyczna | "założycielem dynastii Piastów" -> odpowiedź "Piast". |
| kp#40 | WYCIEK | krytyczna | "nosząc przydomek Odnowiciel" -> odpowiedź "Kazimierz Odnowiciel". Wariant "Kazimierz I" zalicza "Kazimierz II/IV". |
| kp#41 | FAKT | krytyczna | Bolesław II Szczodry był SYNEM Kazimierza Odnowiciela, nie wnukiem. Popraw "syn". Wariant "Bolesław II" zalicza "Bolesław III". |
| kp#39 | WARIANTY | krytyczna | "Mieszko II" zalicza "Mieszko I" (lev 1) — typowa pomyłka gracza. Analogicznie #0 przyjmuje "Mieszko II". |
| kp#43/#9 | WARIANTY | krytyczna | "August III" zalicza "August II" i odwrotnie. |
| kp#44 | ABCD | niska | dystraktory B-D z XVII w., niemożliwe przy "konkurent Augusta II i III"; dobre pytanie, słabe opcje. |
| kp#48 | ABCD | niska | opcja B Jan Kazimierz także syn Zygmunta III (rozróżnia tylko data); A zawiera "Waza" z treści. |
| kp#13 | WARIANTY | średnia | "Jan III" zalicza "Jan II". |
| kp#27 | NIEJEDN | niska | OK. |
| kp#6, #19, #28, #32, #45, #46, #49 | KATEGORIA | niska | bitwy/pokoje/dokumenty/królowe w quizie "królowie". |

## geografia (100 pytań)

Ocena: skrajnie szkolna — ok. 85% łatwych, 15% średnich, 0% trudnych; 21 pytań "Jaka jest stolica X?" i 12 "w którym kraju jest Y" (Wieża Eiffla -> Francja). Poprawność merytoryczna wysoka, nie znalazłem nieaktualnej odpowiedzi stan 2026 poza kwestią nazwy Denali/McKinley (od 2025 w USA oficjalnie znów McKinley — wariant jest, ok). Pytania wielopolowe 81-99 są w większości zepsute: wycieki z treści i sztywna kolejność, częściowo sprzeczne z "w dowolnej kolejności".

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| geo#0-19 | TRYWIALNE/DUP | niska | 20 pytań "stolica X" o zbliżonym poziomie; zostaw 6-8 z haczykiem (Turcja, Szwajcaria, Australia, Maroko, RPA) i dodaj trudniejsze (Nigeria, Kazachstan, Mjanma). |
| geo#13 | NIEJEDN | niska | RPA ma 3 stolice; "siedziba rządu" rozwiązuje, ale Kapsztad (D. dystraktor) też jest stolicą. Dodaj "Tshwane". |
| geo#18 | WYCIEK | niska | stolica Meksyku = "Meksyk" (powtórzenie nazwy kraju zalicza). Zmień na "w którym mieście hiszpańskim..."? lub zostaw z wariantem "Miasto Meksyk". |
| geo#23, #20 | WARIANTY | niska | dodaj "Monte Bianco"; "Czomolungma/Sagarmatha". |
| geo#25 | WYCIEK | niska | "Mount Everest" w treści zdradza #20. |
| geo#26 | FAKT | niska | od 2025 oficjalnie w USA "Mount McKinley" (dekret); wariant jest, dopisz uwagę. |
| geo#28 | WARIANTY | niska | dodaj "Tatry Wysokie","Tatry Zachodnie" (nie zaliczy: 5/14). |
| geo#36 | NIEJEDN | średnia | granicę z Niemcami tworzy też Nysa Łużycka (ok. połowa długości). Dodaj "Nysa Łużycka" lub zapytaj "rzeka płynąca przez Szczecin i Wrocław". |
| geo#41, #42 | WYCIEK | niska | opcja D #41 "Bajkał" zdradza #42. |
| geo#43 | NIEJEDN | średnia | Tanganika jest drugim co do POJEMNOŚCI i drugim najgłębszym; "drugie co do wielkości" (powierzchnia) = Wiktorii — doprecyzuj "powierzchni". |
| geo#49/#51 | WYCIEK | średnia | #51 "leżący na Sycylii" zdradza #49. |
| geo#55 | ABCD | niska | poprawna opcja ("frank szwajcarski") najdłuższa/najbardziej szczegółowa. |
| geo#60 | NIEJEDN/JĘZYK | średnia | "graniczy na wschodzie i które jest jej największym wschodnim sąsiadem" — zlepek dwóch warunków; Białoruś, Litwa, Rosja (obw. kaliningradzki) też sąsiadami. Popraw: "Który kraj ma najdłuższą granicę z Polską na wschodzie?". |
| geo#61 | WYCIEK | niska | "(Greenwich)" -> Londyn. |
| geo#62/#63, #40/#64 | WYCIEK | średnia | opcja A #62 "Kanał Panamski" = odpowiedź #63; #40 "Cieśniną Gibraltarską" = odpowiedź #64. |
| geo#65, #68, #69-#72, #80 | TRYWIALNE | niska | "gdzie leży Wieża Eiffla/Wielki Mur/piramidy/Wawel" — dziecinne. |
| geo#66 | NIEJEDN | średnia | w polskim kanonie szkolnym 6 kontynentów (Eurazja) lub 7 — opcje "sześć" i "siedem" obie obronne. Usuń "klasyczny podział" lub zamień pytanie. |
| geo#75 | WARIANTY | niska | dodaj "Wielka Rafa Barierowa". |
| geo#77/#84 | WYCIEK | średnia | #84 "Półwyspie Iberyjskim" zdradza #77. |
| geo#78 | WYCIEK | krytyczna | "leży na Alasce — w jakim stanie USA?" -> "Alaska". |
| geo#79 | WYCIEK | średnia | "Zatoką Gdańską" -> Gdańsk; (Gdynia też nad Zatoką). |
| geo#81 | WYCIEK | krytyczna | "ze stolicą Wiedniem" = slot b. |
| geo#84 | WYCIEK | krytyczna | "ze stolicą Lizboną" = slot b. |
| geo#89 | WYCIEK | krytyczna | "oraz to miasto" -> "Warszawa" w treści; DUP #34. |
| geo#82/#83/#85/#86 | TRYWIALNE/DUP | niska | slot b "euro" i "Amsterdam","Moskwa" duplikują wcześniejsze. |
| geo#87/#29, #88/#21 | DUP | niska | pytania wielopolowe powtarzają jednopolowe. |
| geo#90 | SLOTY | krytyczna | Czechy/Słowacja w stałej kolejności. Oba sloty = [Czechy, Słowacja]. |
| geo#91 | NIEJEDN/SLOTY | krytyczna | Amerykę Płn. oblewa też Ocean Arktyczny; sloty tylko Atlantycki/Spokojny w kolejności. Zmień na "trzy" lub "dwa z trzech". |
| geo#92 | NIEJEDN/SLOTY | krytyczna | Włochy oblewają też morza Jońskie, Liguryjskie (i Śródziemne); stała kolejność Tyrreńskie/Adriatyckie. |
| geo#93 | SLOTY | krytyczna | "dowolne trzy z siedmiu", a sloty zamykają się na Niemcy/Czechy/Słowacja w stałej kolejności; Ukraina, Białoruś, Litwa, Rosja odrzucone. Wszystkie sloty = lista 7 sąsiadów. |
| geo#94 | SLOTY | krytyczna | Litwa/Łotwa/Estonia w stałej kolejności. |
| geo#95 | SLOTY/NIEJEDN | krytyczna | Norwegia/Szwecja/Dania w stałej kolejności; Finlandia, Islandia (kraje nordyckie) często zaliczane. Dodatkowo #96 w treści zdradza listę. |
| geo#96 | WYCIEK/DUP | średnia | w treści "Norwegii, Szwecji i Danii", Oslo dup #6. |
| geo#97 | SLOTY | krytyczna | "w dowolnej kolejności", a slot a=Rosja, b=Kanada, c=USA/Chiny; "Chiny, Kanada, Rosja" odrzucone. Wszystkie sloty = [Rosja, Kanada, USA, Chiny]. Trzecie miejsce zależy od źródła (USA/Chiny). |
| geo#98 | SLOTY | krytyczna | cztery oceany w stałej kolejności; od ok. 2021 część organizacji uznaje Ocean Południowy (piąty) — "wg klasycznego podziału" ok, ale dodaj "Południowy". |
| geo#99 | SLOTY/FAKT | krytyczna | "cztery z pięciu" w stałej kolejności (a=Górne wymagane); jezioro Michigan leży w całości w USA, więc nie "przy granicy". Warianty "Jezioro Górne","Jezioro Huron" nie zaliczą (<60%). |

## lotnictwo (50 pytań)

Ocena: ok. 60% łatwych / 30% średnich / 10% trudnych. Dominuje jeden szablon "Jak nazywa się [definicja słownikowa]?" (ok. 40 z 50) — styl podręcznika, nie pubquizu; same hasła: ster, lotka, klapa, wariometr. Aż 14 pytań ma odpowiedź lub jej rdzeń w treści (własne lub sąsiedniego pytania). Bardzo słabo: tylko 5-6 pytań z historią lub Polską (Żwirko i Wigura, 303, Wilga, Lindbergh). W polach `answers` generator duplikuje wpisy ("szybowiec","szybowiec"; Q13,14,15,21,22,26,27,31,33,36,37,38,40,43,44,45).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| lot#0/#1 | WYCIEK/DUP | średnia | #0 podaje 1903, #1 pyta o 1903; #1 dup hs#58. Połącz. |
| lot#2/#3 | WYCIEK | średnia | #3 w treści "Charles Lindbergh" zdradza #2. |
| lot#4 | WARIANTY | niska | dwie osoby w jednym slocie: "Żwirko" lub "Wigura i Żwirko" odrzucone; dodaj odwrócone i same nazwiska. |
| lot#5 | NIEJEDN | niska | w Bitwie o Anglię walczył też 302 (nieobecny w opcjach); 301 to dywizjon bombowy (dystraktor słaby). |
| lot#6/#11 | WYCIEK | średnia | #11 "zwiększające siłę nośną" zdradza #6. |
| lot#7 | WARIANTY | średnia | brak "opór powietrza","drag" — typowa odpowiedź gracza. |
| lot#8-#11, #25-#27 | WYCIEK (opcje) | średnia | opcje ABCD w #8 zawierają odpowiedzi #9 (ster kierunku), #10 (lotka), #11 (klapa); opcje #25 zawierają odpowiedzi #26 i #27. Cały blok to "ściągawka". |
| lot#12 | NIEJEDN | niska | VTOL: Osprey, F-35B — doprecyzuj "wirnikowi nośnemu". |
| lot#13-#16 | WYCIEK | średnia | #15 "(np. Zeppelin)" = odpowiedź #16, #16 "sterowców" = odpowiedź #15. |
| lot#16 | JĘZYK | niska | "serię niemieckich sterowców ... Hindenburga" — sam Hindenburg to Zeppelin; zmień na "firma/nazwa". |
| lot#18 | ABCD | niska | Jumbo/Superjumbo — zmyłka, ale wariant "Jumbo" ok. |
| lot#20 | WARIANTY | średnia | wariant "An-225" zalicza wpisanie opcji C "An-22" (zawieranie 5/6). Usuń "An-225" lub zamień dystraktor na An-124/An-148. |
| lot#18/#21/#22/#23 | WYCIEK/DUP | średnia | #18 "Boeing 747" zdradza #21; #22 "A380" zdradza #23. |
| lot#23 | FAKT | niska | "produkowany przez Airbusa" — produkcja A380 zakończona w 2021 (stan 2026). Popraw na "zbudowany". |
| lot#29 | NISZOWE | niska | kod WAW — łatwy dla podróżujących, ale ok. |
| lot#33/#34 | WYCIEK | krytyczna | #33 "pomarańczowe urządzenie" zdradza odpowiedź #34 (pomarańczowy); #34 "czarne skrzynki" zdradza #33. Zrezygnuj z "pomarańczowe" w #33. |
| lot#35 | WYCIEK | krytyczna | "w skrócie ATC" — wariant "ATC" jest w treści. Pytaj "co oznacza ATC?" lub usuń skrót. |
| lot#36 | WARIANTY | niska | wariant "wieża" zbyt luźny (ok), "tower" ok. |
| lot#37/#38/#43/#45 | TRYWIALNE | niska | pas startowy, radar, spadochron, autopilot. |
| lot#39 | WARIANTY | średnia | współczesne liniowce mają silniki dwuprzepływowe: brak "turbowentylatorowy","turboodrzutowy","dwuprzepływowy","turbofan". |
| lot#40 | WYCIEK | krytyczna | "Jak nazywa się podwozie samolotu chowane..." — odpowiedź "podwozie" w treści. |
| lot#41 | WARIANTY/WYCIEK | średnia | wariant "bariera dźwięku" jest w treści i nie jest odpowiedzią; usuń. |
| lot#44 | WYCIEK | niska | "Jak nazywa się fotel..." — połowa odpowiedzi w treści. |
| lot#47/#48 | WYCIEK | średnia | #47 "krytycznego kąta natarcia" zdradza #48. |
| lot#49 | WYCIEK | krytyczna | "pełnej pętli" -> odpowiedź "pętla". |
| lot#31 | WARIANTY | niska | dodaj "węzły","kt". |
| lot#46 | NISZOWE | niska | Wilga — świetne pytanie polskie, zostaw. |

## kuchnia (100 pytań)

Ocena: ok. 85% łatwych / 13% średnich / 2% trudnych; 38 pytań to szablon "Z jakiego kraju pochodzi X?" (pizza -> Włochy, taco -> Meksyk, szampan -> Francja), często z nazwą kraju/miasta zaszytą w nazwie dania (sznycel wiedeński, wino Bordeaux, Giro d'Italia). Fun niski: brakuje haczyków, ciekawostek, napojów. Sekcja wielopolowa (88-99) jest mocno uszkodzona: odpowiedź w nawiasie w treści (baozi, shepherd's pie), kraj w treści (klasyk francuski), a pytania o składniki (94-99) mają stałą kolejność i jednocześnie wyciek z pytań 42, 61.

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| ku#0-#23 | TRYWIALNE | niska | pizza, sushi, paella, taco, risotto, pad thai, tiramisu, guacamole (11), ramen... to pytania dla dzieci; zostaw kilka z haczykiem (croissant, hamburger, pavlova, cheddar, haggis). |
| ku#2 | NIEJEDN | średnia | pierogi to "danie narodowe" także Ukrainy/Rosji (wareniki, pielmieni); odpowiedź "Polska" tylko dzięki kontekstowi. |
| ku#8 | WYCIEK | średnia | "sznycel wiedeński" -> Austria. Opcje B/D i tak zgaduje się z nazwy. |
| ku#9 | NIEJEDN/JĘZYK | średnia | "Z jakiego kraju jako kuchnia narodowa pochodzi curry" — curry thai/japońskie/brytyjskie; sformułowanie niegramatyczne. Doprecyzuj. |
| ku#10 | NIEJEDN | niska | doner w bułce wynaleziono w Berlinie (Niemcy); dodaj "w obecnej formie". |
| ku#16, #22, #7 | NIEJEDN | niska | fondue (też Francja/Włochy), strudel (też Węgry), mussaka (też Turcja/Bałkany) — dystraktory częściowo poprawne. |
| ku#11/#52/#95 | DUP | niska | guacamole 3x. |
| ku#24/#94, #26/#96-97 | DUP | niska | mozzarella, parmezan powtórzone w slotach. |
| ku#25, #31 | WARIANTY | średnia | "Z jakiego mleka" -> gracz pisze "owczego": odrzucone (sim 0.67). Dodaj "owczego","mleka owczego","od owiec","z owiec". |
| ku#33, #35 | WYCIEK | średnia | wino "Bordeaux" (miasto we Francji), "szampan" (od Szampanii). |
| ku#39 | WARIANTY/ABCD | średnia | wariant "wanilia" jest w treści pytania (powtórzenie zalicza); dystraktory paproć/trzcina/palma absurdalne. |
| ku#40 | WYCIEK | niska | "japońskiego chrzanu" prowadzi do wasabi (znane). |
| ku#42/#96 | WYCIEK | krytyczna | #42 wymienia bazylię, czosnek, oliwę, orzeszki, parmezan = pełna odpowiedź #96. |
| ku#43 | JĘZYK | niska | odpowiedź angielska "stir-fry" w polskim pubquizie; dodaj "smażenie w woku". |
| ku#44/#45 | WYCIEK | średnia | opcje #44 zawierają odpowiedź #45 (blanszowanie); dystraktor "braising" po angielsku. |
| ku#46 | WARIANTY | niska | dodaj "panierka","w panierce". |
| ku#47 | WARIANTY | średnia | "fermentacja mlekowa/alkoholowa","kiszenie" odrzucone (<60%). |
| ku#48/#77 | WYCIEK | niska | hummus w obu. Dodaj "cieciorka". |
| ku#53/#91 | WYCIEK/DUP | krytyczna | #91 slot b "ryba": w treści "z surowej ryby"; slot a = odpowiedź #53. |
| ku#55/#75 | WYCIEK | średnia | #75 "barszczu czerwonego" zdradza #55; #75 "czerwonej bulwie" (burak to korzeń). |
| ku#56 | WARIANTY | średnia | brak "żur" (lev 2, sim 0.6 -> odrzucone), "żurek staropolski". |
| ku#56/#88 | DUP | krytyczna | #88 to to samo pytanie + kraj "Polska". |
| ku#58 | NIEJEDN | niska | "włoski deser lodowy" — odpowiedź "lody włoskie" odrzucona; dodaj. |
| ku#64/#65, #66/#85 | WYCIEK | średnia | #65 "zawinięta tortilla" = odpowiedź #64; #66 "tandoor" = odpowiedź #85. |
| ku#66 | NIEJEDN | niska | w tandoorze pieką się też roti, kulcza, paratha. |
| ku#67 | NIEJEDN/FAKT | średnia | "kluski z dziurką" = kluski śląskie; kopytka nie mają wgłębienia. Rozdziel dwa dania lub usuń "z dziurką". |
| ku#68 | JĘZYK | niska | "zawijaski" potocznie. |
| ku#73/#74 | WYCIEK | niska | espresso w treści #74. |
| ku#74 | WARIANTY | niska | "kapucino","capuccino" odrzucone (cappuccino ma tolerancję 1, nie 2). |
| ku#70 | ABCD | niska | dystraktory "al pesto", "alla carbonara" komiczne/nonsensowne. |
| ku#80 | WYCIEK | średnia | "syrop klonowy" -> klon. |
| ku#84 | WYCIEK | krytyczna | "suszonej papryki" -> odpowiedź "papryka". Zmień na "Jak nazywa się węgierska przyprawa..." -> "papryka" bez frazy w treści ("czerwona sproszkowana przyprawa typowa dla kuchni węgierskiej"). |
| ku#86 | NIEJEDN | niska | spór Australia/Nowa Zelandia; wariant jest, ale opcja ABCD bez NZ — ok, pytanie pubquizowe, zostaw. |
| ku#89 | WYCIEK | krytyczna | "(baozi)" w treści = slot a. |
| ku#90 | WYCIEK/FAKT | krytyczna | "(shepherd's pie)" w treści = slot a; "z mielonego mięsa" — shepherd's pie to jagnięcina (wołowina = cottage pie). |
| ku#92/#29 | DUP | niska | roquefort 2x. |
| ku#93 | WYCIEK/WARIANTY | krytyczna | "klasyk kuchni francuskiej" = slot b; brak wariantów "wołowina burgundzka","bourguignon","beef bourguignon". |
| ku#94 | SLOTY | krytyczna | pomidory/mozzarella/bazylia w stałej kolejności; "ser" w slocie b zalicza dowolny ser; pominięte "ciasto","oliwa". Wszystkie sloty = [pomidor, mozzarella, bazylia, ciasto]. |
| ku#95 | SLOTY | krytyczna | a=awokado, b=limonka, c=cebula/kolendra/pomidor/sól — niespójne; "awokado, cebula, limonka" odrzucone w b. |
| ku#96 | SLOTY | krytyczna | a=bazylia, b=ser, c=orzeszki lub czosnek; "czosnek" w slocie b odrzucony. |
| ku#97 | SLOTY/WYCIEK | krytyczna | a=jajka, b=guanciale, c=pecorino/ser; #61 w treści ma wszystkie trzy. |
| ku#98 | SLOTY | krytyczna | a=kapusta kiszona, b=kapusta świeża/mięso/kiełbasa, c=mięso/kiełbasa/grzyby; "kiełbasa, mięso, kapusta" odrzucone, "kiełbasa" x3 zaliczone (b i c). Brak śliwek, boczku, cebuli. |
| ku#99 | SLOTY | krytyczna | a=pomidory, b=ogórek, c=feta/oliwki/cebula; "feta, oliwki, pomidory" odrzucone. |

## sport (100 pytań)

Ocena: ok. 75% łatwych / 22% średnich / 3% trudnych. Są dobre pytania (Zidane 2 gole głową, Lato Złoty But, Rutkiewicz, Otylia, Federer 8x Wimbledon, ABCD o Senna/Piquet), ale wokół nich masa dziecinnych (11 zawodników, 5 kółek olimpijskich, "jaki medal dostaje zwycięzca") oraz 4 pytania "Skojarz zawodnika z dyscypliną" z nazwiskiem w treści. Wykryłem 4 błędy faktów i 2 nieaktualne (Messi, stadion).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| sp#0, #6, #7, #14, #17, #25, #43, #57, #60, #61, #62, #85 | TRYWIALNE | niska | pytania dla dzieci (11 zawodników, 6 w siatkówce, 5 kółek, czerwona kartka, kolor medalu). |
| sp#4/#95/#1 | DUP | niska | MŚ 1974 RFN: pytanie 1 i slot b #95; Polska 3. miejsce w #4 i #95. |
| sp#7 | WYCIEK/FAKT | średnia | "klub Manchester United -> Manchester" (nazwa w treści); stadion Old Trafford leży w Stretford. |
| sp#9/#8 | WYCIEK | niska | "zdobywca trzech mistrzostw" blisko #8. |
| sp#12 | WARIANTY | niska | dodaj "UEFA Champions League","Liga Mistrzów UEFA","Puchar Europy". |
| sp#13 | FAKT | niska | opcja C "Wanda Metropolitano" nieaktualna (od 2024 Riyadh Air Metropolitano). |
| sp#15 | FAKT | krytyczna | Tomaszewski NIE był "mistrzem świata 1974" (Polska 3. miejsce); był mistrzem olimpijskim 1972. Popraw: "brązowy medalista MŚ 1974, mistrz olimpijski 1972". |
| sp#18 | FAKT? | niska | skład kapitański zmieniał się w 2025 (Lewandowski stracił opaskę, potem wrócił) — "wieloletni kapitan" bezpieczne, ale sprawdź stan 2026. |
| sp#20 | FAKT | krytyczna | Messi ma 8 Złotych Piłek (od 2023), nie 7. Popraw na 8 lub usuń liczbę. |
| sp#24 | WARIANTY | niska | dodaj "Narodowy w Warszawie". |
| sp#27/#28 | WYCIEK | średnia | #27 "Turniej Czterech Skoczni" = odpowiedź #28. |
| sp#27 | NIEJEDN | niska | Stoch także 4 medale olimpijskie (3 złota + brąz drużynowy 2022); rozstrzyga TCS 2001. |
| sp#30 | WYCIEK/WARIANTY | krytyczna | "w kształt litery V" -> odpowiedź "styl V"; "V" samo odrzucone. Popraw: "styl Boklöva". |
| sp#31 | WARIANTY | średnia | "100" samo odrzucone (3 znaki); pytanie "najszybszy dystans" niejednoznaczne (60 m w hali). |
| sp#32/#96 | WYCIEK | niska | #32 "2008-2016" = rok w #96. |
| sp#33 | ABCD | niska | poprawna opcja jedyna nieokrągła liczba. |
| sp#34 | WYCIEK | krytyczna | "słynny z gestu Kozakiewicza" — nazwisko w treści. |
| sp#35/#93 | DUP | średnia | Włodarczyk/rzut młotem 2x. |
| sp#42 | WARIANTY | niska | dodaj "Flushing Meadows". |
| sp#47 | WYCIEK | krytyczna | "wsadza piłkę" -> "wsad". |
| sp#50 | WYCIEK | krytyczna | "tor Monte Carlo" w treści i wariant "Monte Carlo" zalicza przepisanie. |
| sp#52/#53 | WYCIEK | średnia | #52 "we Francji"; #53 zawiera "Tour de France". |
| sp#54 | WYCIEK | niska | "włoski ... Giro d'Italia". |
| sp#65 | WYCIEK/WARIANTY | krytyczna | "dawniej Cassius Clay" i wariant "Cassius Clay" zalicza przepisanie (to nie jest odpowiedź na "Jak nazywał się..."). |
| sp#66 | FAKT | średnia | Adamek był mistrzem świata w wadze półciężkiej i junior ciężkiej (cruiser), NIE ciężkiej. Popraw. |
| sp#68 | WYCIEK | niska | "Iron Mike". |
| sp#70/#98 | WYCIEK | krytyczna | #70 wymienia pływanie, rower, bieg = pełna odpowiedź #98. |
| sp#72 | WYCIEK | krytyczna | "Jak nazywa się krążek" — odpowiedź w treści. |
| sp#73/#74 | WYCIEK | średnia | #73 "biegi narciarskie" = odpowiedź #74; opcja A #74 "biathlon" = odpowiedź #73. |
| sp#76/#77 | WYCIEK/DUP | średnia | #77 "Mount Everest" w treści; #76 dup geo#20. |
| sp#78 | WYCIEK | krytyczna | "zwany potocznie kraulem" = odpowiedź. |
| sp#79 | ABCD | niska | opcja B "33 metry" absurdalna. |
| sp#87 | SLOTY | krytyczna | Real/Barcelona w stałej kolejności. Oba sloty = [Real Madryt, FC Barcelona]; "Real" za luźne. |
| sp#88 | SLOTY | krytyczna | United/City w stałej kolejności. |
| sp#89 | TRYWIALNE | niska | etykiety sloty z nazwisk w treści; "kraj Ronaldo" dwuznaczne (Cristiano w treści, ok). |
| sp#90 | SLOTY | krytyczna | Polska/Ukraina w stałej kolejności. |
| sp#91-#94 | WYCIEK | krytyczna | "Skojarz zawodnika z dyscypliną: Adam Małysz i jego dyscyplina" — slot a to nazwisko z treści. Usunąć wszystkie 4 (dup #27, #49, #35, #66). |
| sp#95 | WARIANTY | niska | dodaj "Republika Federalna Niemiec". |
| sp#97 | FAKT | krytyczna | Polskich indywidualnych mistrzów olimpijskich w skokach jest DWÓCH: Fortuna (1972), Stoch (2014, 2018). Małysz nie ma złota olimpijskiego (2 srebra, 2 brązy). Pytanie z "trzema" jest fałszywe, a slot a/c zalicza Małysza. Przeredaguj: "Wymień medalistów olimpijskich w skokach...". Stała kolejność. |
| sp#98 | SLOTY | krytyczna | pływanie/kolarstwo/bieg w stałej kolejności. |
| sp#99 | SLOTY | krytyczna | Australian Open/RG/Wimbledon/US Open w stałej kolejności; trywialne po #38, #42. |
| sp#37 | ABCD | niska | opcja A "2" itp.; ok. |

## Wnioski systemowe

Liczby (przejrzano 600 pytań: hp 100, hs 100, kp 50, geo 100, sport 100, lot 50, kuchnia 100). Krytyczne (zła ocena gracza: błąd faktu, odrzucona poprawna, zaliczona zła, wyciek): hp 21, hs 7, kp 15, geo 18, sport 24, lot 8, kuchnia 22 = ok. 115 (19%). Średnie: ok. 110 (18%). Same pytania wielopolowe: 72 w 7 paczkach — niemal wszystkie mają błąd SLOTY lub WYCIEK.

1. **Sloty wielopolowe (najgorszy wzorzec).** Każde pytanie typu "wymień trzech/cztery" ma stałą kolejność i różne listy dla slotów — odrzuca poprawne odpowiedzi w innej kolejności (np. Jagiellonowie, noblistów, sąsiedzi Polski, składniki, szczegóły triatlonu). Poprawka w generatorze: dla "wymień N z M" wszystkie sloty dostają tę samą pełną listę poprawnych (M elementów), a silnik oceny wymaga unikatowości (dedup). Dopóki nie ma dedup, nie generować takich pytań.
2. **Wyciek w treści.** Odpowiedź lub jej rdzeń w prompcie: "ze stolicą Wiedniem", "(baozi)", "(shepherd's pie)", "klasyk kuchni francuskiej", "zwany kraulem", "gestu Kozakiewicza", "Jak nazywa się krążek", "wsadza piłkę", "Skojarz zawodnika: Adam Małysz". Dodać do generatora walidację: żaden wariant odpowiedzi (po normalizacji) ani jego rdzeń (>= 5 znaków, stem) nie może wystąpić w promptcie, w etykietach slotów ani we wcześniejszych pytaniach tej samej paczki.
3. **Wzajemne podpowiedzi między pytaniami.** Pytania o to samo wydarzenie (rok / dzień / nazwa) leżą w jednej paczce i zdradzają się wzajemnie; w losowej kolejności gracz dostaje odpowiedź w poprzednim pytaniu. Walidacja: jedna encja = jedno pytanie na paczkę; opcje ABCD nie mogą zawierać odpowiedzi innych pytań (lotnictwo #8-#11, #25-#27).
4. **Numeracja i liczby w wariantach vs. scoring.** Tolerancja literówek zalicza "August III" za "August II", "Jan II" za "Jan III", "Apollo 12" za "Apollo 11", "Ludwik XV" za "Ludwik XIV", "Władysław II/IV" za "Władysław III", "Mieszko I/II". Dla odpowiedzi zawierających numer (rzymski lub arabski) scoring powinien wymagać dokładnego dopasowania, albo generator ma unikać wariantów "Imię + liczba".
5. **Fakty w treści pytań (halucynacje generatora).** Przykłady: Michał Korybut "ojciec cesarza", "ojciec" Kazimierza Jagiellończyka, Bolesław Śmiały "wnuk" Odnowiciela, Warneńczyk król Czech, Tomaszewski "mistrz świata 1974", Messi "7 razy", "trzech" polskich mistrzów olimpijskich w skokach (jest dwóch), Adamek mistrzem wagi ciężkiej, A380 "produkowany". Wymagać źródła per pytanie (weryfikacja wtórna) i generować pytania wyłącznie o fakty jednoznaczne.
6. **Brak wariantów morfologicznych.** Pytania "z jakiego mleka", "z jakiego kraju" przyjmują tylko mianownik/jedną formę ("owcze" vs "owczego", "Turcy" vs "Turcja", "żur" vs "żurek", "kapucino"). Zalecenie: lista wariantów w odmianie (D./B.), nazwa potoczna, forma rzeczownikowa/przymiotnikowa.
7. **Trywialność i brak haczyka.** 75-85% pytań jest szkolnych; geografia i kuchnia to ponad 40% pytań w identycznym szablonie ("Jaka jest stolica", "Z jakiego kraju pochodzi"). Dla poziomu "średni, dorośli, pub" ograniczyć liczbę pytań z jednego szablonu do 10%, wymagać drugiego warunku ("który z dwóch...", ciekawostka, wyjątek), dopilnować rozkładu ok. 30/50/20.
8. **ABCD.** Lotnictwo i królowie: poprawna odpowiedź to prawie zawsze B (8/10, 6/10) i nigdy D; dystraktory bywają z innej epoki/kategorii (Gagarin przy "kto stanął na Księżycu", Marco Polo przy Gutenbergu, "al pesto", "33 metry"). Losować pozycję poprawnej opcji i wymagać dystraktorów z tej samej kategorii co odpowiedź.
9. **Duplikaty między plikami.** historia-polski i królowie-polscy mają ok. 11 prawie identycznych pytań (Mieszko, Chrobry, Kazimierz, Grunwald, Jadwiga, Sobieski, Stanisław August, Piastowie, Jagiellonowie, Konstytucja); historia-świata/historia-polski (Kopernik, Auschwitz, 1939, 1945, Solidarność); sport/geografia (Everest); kuchnia (sashimi 2x, roquefort 2x, żurek 2x). Zintegrować lub rozdzielić tematycznie.
10. **Artefakty generatora.** Zduplikowane wpisy w `answers` (lotnictwo), warianty ASCII bez sensu ("Wisla","Wisła"), pytania z `(skrót)`/`(w skrócie ATC)` zdradzające wariant, pytanie w stylu "Podaj X i Y: opis" bez jasnej treści (hp#71, hp#95, hp#99).
