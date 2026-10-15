# Audyt treści C: film, disney, marvel, star-wars

(id = indeks 0-based w `questions`; przejrzano wszystkie 4 x 100 pytań. Uwaga ogólna dot. scoringu: tolerancja zawierania wymaga >=60% długości dłuższego napisu, więc samo nazwisko/krótka forma często NIE przechodzi, jeśli nie jest wpisana w warianty.)

## film (quiz-film.json)

Solidna baza faktograficzna (prawie brak błędów faktów), ale styl bardzo jednolity: ~75% to szablon "Kto wyreżyserował / Który aktor zagrał X" bez haczyka. Poziom: ok. 60% łatwe, 35% średnie, 5% trudne. Główne problemy to sloty wielopolowe (kolejność, leaki w prompcie), kilka wycieków oraz jedna realna pomyłka faktu (Hoffman/Quo Vadis). Mocne klastry duplikatów (Titanic, Pulp Fiction, Ojciec chrzestny, Shawshank, Forrest Gump, Gladiator, Machulski x4, Coppola x2, Spielberg x4).

| id | typ | waga | opis + poprawka |
|---|---|---|---|
| film#4 | WYCIEK | krytyczna | Prompt: film „Kiler”, a warianty przyjmują "Kiler" (tytuł filmu). Zalicza złą/oczywistą odpowiedź. Usunąć "Kiler" z wariantów (zostawić "Jurek Kiler", "Jerzy Kiler", "Jurek") lub zmienić pytanie na "Jak ma na imię...". |
| film#17 | WYCIEK | krytyczna | "W jakim mieście rozgrywa się akcja filmu Casablanca?" -> odpowiedź "Casablanca" jest w tytule. Przepisać (np. "W jakim kraju...?" -> Maroko) albo wyrzucić. |
| film#37 | WYCIEK | krytyczna | Prompt: "opowiada o łowcy androidów", odpowiedź/opcja B: "Łowca androidów" (polski tytuł Blade Runnera). Zmienić opis fabuły ("film o replikantach / w Los Angeles 2019"). |
| film#67 | FAKT | krytyczna | „Quo Vadis” (2001) wyreżyserował Jerzy Kawalerowicz, nie Hoffman. Dodatkowo "Znachor" ma remake (2023, Michał Gazda) - NIEJEDN. PEWNE. Poprawka: "Ogniem i mieczem, Potop, Pan Wołodyjowski" -> Hoffman. |
| film#87 | WYCIEK / SLOTY | krytyczna | Prompt podaje w nawiasie wprost tytuły wszystkich trzech filmów, więc zdradza Kieślowskiego, Wajdę i Hasa; sloty w stałej kolejności (a=Kieślowski, b=Wajda, c=Has/Polański/Munk), a prompt mówi "wymień trzech" -> poprawni w innej kolejności odrzucani. Usunąć nawias, zrobić 3 identyczne listy z wszystkimi akceptowanymi nazwiskami (i tak brak dedup. -> lepiej zamienić na pojedyncze pytanie). |
| film#86 | SLOTY | krytyczna | a=[Connery], b=[Moore], c=[Craig, Brosnan, Dalton, Lazenby]. Odpowiedź "Craig, Brosnan, Dalton" odrzucona (a, b zła), a dwa różne poprawne wpisy w złej kolejności też. Zamienić na "Który z poniższych NIE grał..." lub pytanie jednopolowe "Wymień jednego aktora, który zagrał Bonda" z wszystkimi sześcioma. |
| film#99 | SLOTY | krytyczna | a=[Kargulowie], b=[Pawlakowie]; prompt nie narzuca kolejności -> "Pawlakowie, Kargulowie" odrzucone. Zmienić prompt ("pierwszy ród: ten z Kargulem") albo oba sloty = obie nazwy (i tak bez dedup.). |
| film#27 | NIEJEDN | krytyczna | "Który aktor wielokrotnie współpracował ze Scorsese i zagrał w Taksówkarzu" - równie poprawny Harvey Keitel (też Cybill Shepherd/Jodie Foster, Albert Brooks). Dodać Keitel lub zmienić na "zagrał Travisa Bickle'a". |
| film#78 | NIEJEDN | średnia | "Główny aktor" Shawshank: Morgan Freeman (Red) jest równorzędnym bohaterem; akceptuje się tylko Robbinsa. Dodać Freeman do wariantów b. |
| film#46 | FAKT / NIEJEDN | średnia | "Reżyser serii Indiana Jones" - piąty film (Artefakt przeznaczenia, 2023) wyreżyserował James Mangold. Zmienić na "pierwszych czterech filmów" albo dodać Mangolda. PEWNE. |
| film#90 | SLOTY | niska | Etykiety "aktor"/"aktorka" wymuszają kolejność (DiCaprio, Winslet); prompt "dwoje głównych aktorów" jej nie komunikuje - wpisanie Winslet pierwszej odrzucone. Dodać do obu slotów obie osoby lub doprecyzować prompt. Dup z #15, #89, #7. |
| film#82 | SLOTY | niska | Kolejność Max/Albert tylko w nawiasie; odwrócona rejestruje błąd. Akceptowalne, ale dodać do obu slotów obie wersje nazwisk (są też Jerzy Stuhr w roli Maksa i Olgierd Łukaszewicz w roli Alberta - ok). |
| film#79 | SLOTY | niska | Kolejność wymuszona etykietami Vito/Michael - ok, ale dup z #2. |
| film#80 | JĘZYK | niska | "Podaj film oraz reżysera, w którym pada cytat" - kalka składniowa ("reżysera, w którym"). Poprawić: "Z jakiego filmu pochodzi cytat... i kto go wyreżyserował?". Także dup z #6/#22. |
| film#97 | JĘZYK / FAKT | niska | "androidalny zabójca" - Terminator T-800 to cyborg, nie android. Poprawić na "cybernetyczny zabójca". Dodać warianty "T-800", "Terminator T-800". Dodatkowo #97 i #98 mają tę samą odpowiedź "Terminator" -> DUP. |
| film#98 | DUP | niska | j.w. - ta sama odpowiedź co #97. Zmienić na cytat z innego filmu. |
| film#60 | WARIANTY | niska | Polski przekład "Why so serious?" w dubbingu/napisach to prawdopodobnie "Czemu taki poważny?" (nie "Skąd ta powaga?"). PRAWDOPODOBNE - zweryfikować; opcje i tak rozwiązują pytanie. |
| film#31 | WARIANTY | niska | Dodać "Bong". Dodatkowo #32 (Parasite - kraj) to wtórne pytanie. |
| film#95 | WARIANTY | niska | Dodać "2001". Klaster #41/#95/#96 (Kubrick/2001) - 3 pytania o ten sam film. |
| film#66 | WARIANTY | niska | Dodać "Rękopis" (może się nie zaliczyć); pytanie raczej niszowe dla poziomu średniego. |
| film#75 | WARIANTY | niska | Dodać "Cold War". |
| film#3, #45, #81, #83 | DUP | średnia | Machulski jako odpowiedź w 4 pytaniach (3, 45, 81, 83), Spielberg w 5 (13, 25, 46, 91, 93), Cameron w 3 (7, 29, 89), Coppola x2 (1, 65), Scorsese x2. #25 i #93 to dosłownie to samo pytanie (Lista Schindlera -> Spielberg). |
| film#53 | DUP / NIE-KATEGORIA | średnia | "Lwiątko w Królu Lwie -> Simba" duplikuje disney#4 i jest trywialne; wyrzucić z "film". |
| film#0/#77, #19/#78, #1/#2/#79, #7/#89, #15/#90, #35/#36/#85, #12/#40, #50-52 | DUP | niska | Multi-slotowe "Wymień reżysera oraz rok/aktora" (#77-#91) to przepisane pojedyncze pytania z początku paczki (≈15 pytań). Odpowiedź na slot "rok" (1994, 1984...) - łatwy leak dla osoby znającej #0. |
| film#14, #6, #12, #33, #38, #47, #55, #56 | TRYWIALNE | niska | Pytania typu "kto zagrał Neo/Forresta/Jacka Sparrowa/Indianę" - znane każdemu dorosłemu, bez haczyka. Łącznie ok. 40 pytań to wariacje "reżyser/aktor filmu X". |
| film#63 | WARIANTY | niska | Dodać "Italia"; dla "Korea" w #32 dodać "Korea Południowa" w odmianach ("Południowa Korea"). |
| film#43, #44 | ABCD | niska | #43 wszystkie opcje to filmy Barei (świetnie); #44 opcje to aktorzy z "Misia" - ok, ale pytanie wymaga bardzo szczegółowej wiedzy (niszowe). |
| film#37, #41, #58, #71 | ABCD | niska | Poprawna opcja najdłuższa/najbardziej szczegółowa (#37 "Łowca androidów" - przy okazji wyciek, #41 "Stanley Kubrick" jako jedyny z dwoma słowami nie, ale dłuższa, itd.). Wyrównać długości opcji. |
| film#30, #58, #59 | ABCD | niska | Dystraktor "Mark Ruffalo" (#30) jest z innej kategorii (nie grał Jokera); w #58 "Jared Leto" faktycznie występował w American Psycho - ok. |

## disney (quiz-disney.json)

Paczka dla dzieci, nie dla dorosłych w pubie: ok. 90% pytań to "jak nazywa się [postać] z [bajki]" z odpowiedzią w stylu imienia głównego bohatera (poziom łatwy/bardzo łatwy ok. 90%, średni ok. 8%, trudny ok. 2%). Fakty w większości poprawne i polskie nazwy dubbingowe są zwykle uwzględnione, ale: (1) kilka jawnych wycieków odpowiedzi w treści, (2) bardzo gęste wycieki między pytaniami (pytania o tę samą bajkę zdradzają sobie nawzajem odpowiedzi), (3) dwa wielopolowe pytania z identycznymi listami w slotach, (4) pewne luki w wariantach (Zygzak, Mickey, Balu, Mogli, Sokowia).

| id | typ | waga | opis + proponowana poprawka |
|---|---|---|---|
| disney#29 | WYCIEK | krytyczna | "Jak nazywa się żeglarka z wyspy Motunui w filmie „Vaiana”?" -> odpowiedź "Vaiana" jest w tytule (wariant "Moana" nie ratuje). Przepisać na "Jak nazywa się półbóg..." (Maui) lub "Jak nazywa się zwierzak-kogut?" (Heihei); i #30 mówi "towarzysz Vaiany". |
| disney#51 | WYCIEK + FAKT | krytyczna | „Gdzie jest Nemo?” - odpowiedź "Nemo" w tytule; poza tym Nemo "ginie" (jest porwany). Poprawić: "...rybka klaun porwana przez nurka" -> pytanie o imię ojca (Marlin) lub o "Dory". |
| disney#63 | WYCIEK | krytyczna | „Merida Waleczna” - tytuł zawiera odpowiedź "Merida". Zmienić na "Jak nazywa się królestwo / rodzina?" lub pytać o niedźwiedzia. |
| disney#95 | WYCIEK | krytyczna | „Raya i ostatni smok” - odpowiedź "Raya" w tytule w pytaniu; #94 mówi o "tytułowej bohaterce" (błędnie - tytułowa jest Raya, Sisu to "ostatni smok", ale pytanie wprowadza w błąd). Zmienić #94 na "Jak nazywa się ostatni smok (smoczyca)?" bez słowa "tytułowa". |
| disney#46 | WYCIEK | krytyczna | Slot a: odpowiedź "Prosiaczek" jest w prompcie ("prosiaczek i smutny szary osioł"). Zostawić tylko jeden slot (Kłapouchy) lub pytać o ich przyjaciela "Tygrysek". |
| disney#86 | WYCIEK | średnia | "opowiada o dzwonniku katedry Notre Dame" -> odpowiedź "Dzwonnik z Notre Dame". Przerobić: "Jaki film z 1996 opowiada o Quasimodo i Esmeraldzie?". |
| disney#93 | WYCIEK + ABCD | średnia | Opis "bohaterowie proszą, by nie mówić o pewnej postaci" to dosłowne tłumaczenie tytułu opcji B. Zmienić na pytanie o postać Bruno / kto śpiewa / w jakim filmie jest piosenka. W odpowiedzi dodać polskie "Nie mówimy o Brunie" (poprawna odmiana, obecny wariant "Nie mówimy o Bruno" jest gorszy). |
| disney#96 | WYCIEK | średnia | W prompcie "duszach" ≈ odpowiedź "Dusza". |
| disney#23 | SLOTY | krytyczna | Dwa sloty z identyczną listą (Flora/Fauna/Niebianka/Merryweather) i brak dedup. -> można wpisać "Flora" dwa razy. Zamienić na pytanie jednopolowe "Wymień jedną z trzech dobrych wróżek" z trzema wariantami. Sprawdzić polską nazwę trzeciej (Niebianka). |
| disney#65 | SLOTY | krytyczna | Trzy identyczne listy dla "trzech z pięciu emocji" -> "Radość, Radość, Radość" zaliczone. Poza tym poprzednie #64 podaje 4 z 5 emocji w opcjach (cross-leak). Zrobić jedno pytanie: "Wymień jedną emocję" lub pytać o Odrazę / Niepokój (Inside Out 2). Dodać zastrzeżenie "w pierwszej części" - sequel (2024) dodał Niepokój, Zazdrość, Nudę, Zakłopotanie. |
| disney#77 | NIEJEDN / FAKT | średnia | "Współzałożyciel studia, od którego nazwiska pochodzi nazwa" - współzałożycielami byli Walt i Roy Disney (oboje noszą to nazwisko); akceptowany tylko Walt. Poza tym samo "Disney" przechodzi (6/10 znaków = 60% progu) i jest oczywistym słowem z kategorii. Zmienić: "Kto stworzył Myszkę Miki?" i dodać Ub Iwerks jako ciekawostkę. |
| disney#41 | ABCD | krytyczna | Opcje B) "Dzwoneczka" i D) "Dzwoneczek" to ta sama postać (odmiana). Dwie poprawne. Zamienić B na np. "Dzwoneczka" -> "Iskierka" itd. (inną postać, np. "Wendy" już jest). |
| disney#18 | ABCD | niska | Dystraktor "Jaś" - nie jest postacią z bajki (absurdalny); "Skuttle" w polskim dubbingu "Scuttle"/"Mewa"? zweryfikować. |
| disney#22 / #82 | ABCD + DUP | niska | Dystraktory wzajemnie zdradzają odpowiedzi (#22: Cruella, Urszula; #82: Diabolina, Urszula, Yzma). "Maleva" (#22 C) nie jest znanym złoczyńcą Disneya - dystraktor słabo dobrany. |
| disney#16 | ABCD | niska | Dystraktor "Sisu" (smok z Rayi) to odpowiedź na #94; "Shenron", "Haku" z innych franczyz - zabawne, ale poza kategorią. |
| disney#39 | ABCD | niska | Dystraktor "Dumbo" (słoń) przy pytaniu o jelonka - absurdalny; odpowiedź na poprzednie #38. |
| disney#2 | ABCD / WARIANTY | niska | Opcje po angielsku, a "Mam tę moc" (polski tytuł) jest tylko wariantem. Ujednolicić: opcje w polskich tytułach lub w obu. Dystraktory ("Into the Unknown", "Show Yourself") to piosenki Elsy z części 2 - dobre. |
| disney#14 | WARIANTY | średnia | Polski tytuł "A Whole New World" w dubbingu to prawdopodobnie "Świat nowy" / "Ten nowy świat" - "Cały nowy świat" wygląda na tłumaczenie dosłowne. PRAWDOPODOBNE; zweryfikować i dodać rzeczywisty tytuł. |
| disney#13 | NIEJEDN / JĘZYK | niska | "Jaki przedmiot uwalnia Dżina" - lampa raczej go więzi; uwalnia go Aladyn. Zmienić: "W jakim przedmiocie mieszka Dżin?". |
| disney#25 | WARIANTY | niska | Dodać "dwunasta", "00:00", "0:00" (obecne tylko 12:00/24:00). |
| disney#34 | FAKT | niska | Lumiere jest "maître d'hôtel" (zarządcą sali), nie kamerdynerem; kamerdynerem (majordomus) jest Trybik (Cogsworth). Polski dubbing: Lumiere = "Płomyk" - dodać do treści/wariantów w razie pytań o imię. |
| disney#35 | FAKT | średnia | Trybik (Cogsworth) to majordomus/marszałek dworu, nie "zegarmistrz". PEWNE. Zmienić na "majordomus". Dodać wariant "zegar kominkowy" (to zegar kominkowy, nie "stojący"). |
| disney#15 | FAKT | niska | Mulan nie jest księżniczką (zwykła dziewczyna; "Disney Princess" to marketing). Zmienić na "bohaterka". |
| disney#21 | FAKT / WARIANTY | niska | W wersji Disneya Aurora nie śpi "100 lat" (klątwa działa do pocałunku, w filmie ok. doby/niedługo) - 100 lat to Perrault. Zmienić. Dodać "Różyczka" (imię z ukrycia, wariant "Śpiąca Królewna" jest tytułem, nie imieniem). |
| disney#61 | WARIANTY | krytyczna | Warianty: "Zygzak McQueen", "McQueen", "Lightning McQueen". Samo "Zygzak" (najczęstsza polska odpowiedź) = 6/13 znaków (46%) -> ODRZUCONE. Dodać "Zygzak". |
| disney#72 | WARIANTY | średnia | "Mickey" samo nie przechodzi (6/11 = 54%) - dodać "Mickey", "Mysz Miki". Ta sama uwaga dla #80 (dup). |
| disney#83 | WARIANTY | średnia | Dodać "Balu" (polska pisownia z Kiplinga), "Szere Khan" / "Szer Khan" / "Khan" (dubbing). Samo "Baloo" jest, ale "Balu" 4/5 = poniżej progu. |
| disney#84 | WARIANTY | średnia | Dodać "Mogli" (stare polskie tłumaczenie); "Mowgli" vs "Mogli" - 0,83 sim, tuż pod progiem. |
| disney#97 | WARIANTY / FAKT | niska | Polski tytuł "To nie wypanda" - zweryfikować (prawdopodobnie nieprawidłowy; polski tytuł Turning Red to "Czerwona panda"?). PRAWDOPODOBNE. Dodać oba warianty. |
| disney#45 | WARIANTY | niska | Dodać "Kubuś" (5/13 = 38%). |
| disney#49 | WARIANTY | średnia | Polskie hasło Buzza to prawdopodobnie "Do nieskończoności i jeszcze dalej!" - brak wariantu z "jeszcze". Dodać warianty z "i jeszcze dalej". PRAWDOPODOBNE. |
| disney#59 | WARIANTY | niska | Dodać "Paris" (sim 0,6). |
| disney#78 | WARIANTY | niska | Dodać "Śnieżka", "Królewna Śnieżka i siedmiu krasnoludków" jest obecna. |
| disney#92 | WARIANTY | niska | Dodać "Mirabel Madrigal". |
| disney#68 | WARIANTY | niska | Polski dubbing Zwierzogrodu: leniwiec "Błysk" lub "Flash"? Zweryfikować; dodać oba. PRAWDOPODOBNE. |
| disney#4 | DUP | średnia | Simba duplikuje film#53; w obrębie paczki 6 pytań o Króla Lwa (4-9), 5 o Lodzie (0-3, 99), 5 o Aladynie (10-14), 4 o Małej Syrence (17-20). |
| disney#72 / #80 | DUP | średnia | Oba mają odpowiedź "Myszka Miki". Dodatkowo #80: Minnie też zadebiutowała w Steamboat Willie (niejednoznaczne "jaka postać"). |
| disney (cross-leaks) | WYCIEK | średnia | Pytania o tę samą bajkę zdradzają sobie odpowiedzi: #5<->#6 (Mufasa), #17<->#20 (Ariel; Tryton w #18), #26<->#27 (Roszpunka), #32<->#33 (Bella), #40<->#41/#42 (Piotruś Pan), #43<->#44 (Kraina Czarów), #61<->#62 (Zygzak), #70<->#71 (Wielka Szóstka), #87<->#88 (Herkules), #94<->#95 (Raya), #21<->#23 (Aurora), #15<->#16 (Mulan), #73/#76 (Myszka Miki), #74<->#75 (Donald), #99<->#2 (Elsa), #0 (Krainie lodu). Przy losowaniu z jednej paczki zdarza się to często. |
| disney (mix kategorii) | NIE-KATEGORIA | niska | #50 ("jakie studio produkowało..." - DreamWorks/Illumination/Ghibli jako dystraktory - absurdalnie łatwe); #67 ("z jakim krajem i jego świętem" - odpowiedź tylko kraj). |
| disney#7, #53, #69, #83, #99 | SLOTY | niska | Kolejność wymuszona opisem w prompcie - OK, ale odwrócona kolejność = błąd; rozważyć symetryczne sloty. |

## marvel (quiz-marvel.json)

Najsłabsza paczka z czterech: ok. 85% pytań to łatwe (parowanie "prawdziwe imię/kto gra"), a w dużej części wyciek odpowiedzi w prompcie albo warianty przyjmujące alias zamiast pytanego imienia. Ok. 30 pytań (#58-#74) to wielopolowe przepisania pojedynczych pytań z początku paczki, często z adnotacją "(a = ..., b = ...)" w treści, która ujawnia odpowiedź. Trudność: ok. 85% łatwe, 13% średnie, 2% trudne. Kilka błędów faktu (Ultron/Banner, Vormir/Gamora, trylogia Avengers, Kirby/Cap).

| id | typ | waga | opis + proponowana poprawka |
|---|---|---|---|
| marvel#99 | NIEJEDN / FAKT | krytyczna | Ultrona stworzyli wspólnie Tony Stark i Bruce Banner; opcja A) Bruce Banner też poprawna, a w wariantach tylko Stark. PEWNE. Zmienić na "Kto z Avengersów BYŁ jedynym...", np. "Kto stworzył Vision?" lub pytać o Starka i Bannera jako parę. |
| marvel#68 | FAKT / JĘZYK | krytyczna | Prompt: "dwie postacie, które złożyły życie na Vormir w Endgame" - Gamora poświęcona w Wojnie bez granic (Thanosa), Natasha w Endgame. Prompt myli filmy, w nawiasie ujawnia klucz odpowiedzi ("a = ta, która poświęciła życie w Endgame"), a "Kamień Duszy oddany przez jedną z nich" jest niezrozumiałe. Przepisać: "Kto poświęcił się na Vormir w Endgame?" (Czarna Wdowa). |
| marvel#66 | WYCIEK / SLOTY | krytyczna | Prompt wylicza "Kapitan Ameryka, Hulk, Czarna Wdowa, Hawkeye" = pełna odpowiedź; sloty w stałej kolejności (a=Cap, b=Hulk, c=BW, d=Hawkeye) mimo "dowolni czterej". Usunąć. Zastąpić jednopolowym pytaniem "Wymień jednego z oryginalnych Avengersów". |
| marvel#67 | WYCIEK / SLOTY | krytyczna | Prompt podaje "(a = Star-Lord, b = Gamora, c = Drax)" - pełny klucz; etykiety slotów też zdradzają. Usunąć. |
| marvel#61 | WYCIEK | krytyczna | Prompt: "króla Wakandy... nazwę jego królestwa" -> slot b "Wakanda" w treści (i w #17). Usunąć lub przeformułować. |
| marvel#63 | WYCIEK + WARIANTY | krytyczna | Slot a: "prawdziwe imię i nazwisko Thora" - warianty "Thor" (= słowo z promptu, zalicza złą odpowiedź). Thor Odinson to nie "prawdziwe" nazwisko. Przepisać: "Imię ojca Thora" -> Odyn, albo pytać o Mjolnir osobno. |
| marvel#24 | WYCIEK | krytyczna | "gadające drzewo, które mówi tylko „I am Groot”" -> odpowiedź "Groot" w cytacie. |
| marvel#39 | WYCIEK | krytyczna | „Avengers: Czas Ultrona” w prompcie, odpowiedź "Ultron". |
| marvel#41 | WYCIEK | krytyczna | "(Falcon)" w prompcie + warianty "Falcon". Pytać o imię (Sam Wilson) bez podawania aliasu, a "Falcon" nie akceptować. |
| marvel#26 | WYCIEK + WARIANTY | krytyczna | "Star-Lorda" w prompcie, wariant "Star-Lord"/"Star Lord" zalicza pytane imię. |
| marvel#36 | WYCIEK + WARIANTY | krytyczna | "Scarlet Witch" w prompcie, warianty akceptują "Scarlet Witch". Pytanie o prawdziwe imię -> tylko Wanda Maximoff. |
| marvel#38 | WYCIEK + WARIANTY | krytyczna | "Quicksilver" w prompcie i w wariantach (pytanie o imię). |
| marvel#40 | WYCIEK + WARIANTY | krytyczna | "Zimowym Żołnierzem" w prompcie i "Winter Soldier"/"Zimowy Zolnierz" w wariantach. Zostawić "Bucky Barnes", "James Barnes", "Bucky". |
| marvel#83 | WYCIEK + WARIANTY | krytyczna | "zbroję War Machine" w prompcie i wariant "War Machine". |
| marvel#84 | WYCIEK + WARIANTY | średnia | "(Vulture)" w prompcie, wariant "Vulture"/"Sep"; pytanie o imię (Adrian Toomes). Wariant "Sep" (polskie "Sęp") dziwne. |
| marvel#85 | WYCIEK + WARIANTY | średnia | "(Mysterio)" w prompcie i wariantach. |
| marvel#87 | WYCIEK / JĘZYK / FAKT | krytyczna | "(The Wasp)" w prompcie = odpowiedź; zdanie bełkotliwe ("żona Ant-Mana z komiksów / partnerka bohaterka"). W komiksach żoną Hanka Pyma jest Janet; w MCU Scotta - nie. Przepisać lub wyrzucić (#88 już pyta o Osę). |
| marvel#88 | WARIANTY | niska | Wariant "Van Dyne" zaliczy też Janet (matkę, pierwsza Wasp). Usunąć "Van Dyne". |
| marvel#89 | WYCIEK | krytyczna | "twórca cząsteczek Pyma" -> odpowiedź "Pym" w prompcie; plus "grany przez Michaela Douglasa". |
| marvel#90 | WYCIEK | krytyczna | "bohater filmu Shang-Chi" -> odpowiedź "Shang-Chi" w tytule. |
| marvel#91 | WYCIEK / JĘZYK | krytyczna | "organizacja / dziesięć pierścieni dających moc" - odpowiedź (opcja B "Dziesięć Pierścieni") w prompcie; slash niezgrabny. |
| marvel#92 | WYCIEK | średnia | "z filmu „Eternals”" -> odpowiedź "Eternals". |
| marvel#93 | WYCIEK + WARIANTY | krytyczna | "(She-Hulk)" w prompcie i wariancie; pytanie o imię i nazwisko. |
| marvel#0 | WARIANTY | krytyczna | Pytanie o prawdziwe imię Iron Mana, warianty przyjmują "Iron Man" (zła odpowiedź i słowo z pytania). Ta sama wada: #2 ("Captain America", "Kapitan Ameryka"), #8 ("Spider-Man"), #11 ("Black Widow", "Czarna Wdowa"), #13 ("Hawkeye", "Sokole Oko") - w prompcie też są te aliasy. Usunąć aliasy z wariantów w #0, #2, #8, #11, #13. |
| marvel#14 | FAKT | średnia | "główny złoczyńca trylogii „Avengers”" - filmów Avengers jest 4 (Thanos głównym w dwóch ostatnich). Zmienić na "sagi / Wojny bez granic i Końca gry". Ta sama pomyłka w #73. |
| marvel#47 | FAKT | średnia | Kapitana Amerykę stworzyli Joe Simon i Jack Kirby (1941); Stan Lee go nie współtworzył. Prompt "współtworzył z Stanem Lee m.in. Kapitana Amerykę" -> mylący. PEWNE. Zmienić na "Fantastyczną Czwórkę, Hulka, Thora". |
| marvel#22 | FAKT | niska | Fury nie jest "twórcą" S.H.I.E.L.D. (założyli Peggy Carter i Howard Stark) - jest dyrektorem. |
| marvel#77 | FAKT / NIEJEDN | niska | "świeci na żółto-niebiesko" - nieprecyzyjne (złote światło). Przy okazji #79 odsłania aktorkę (Brie Larson w #77). |
| marvel#78 | NIEJEDN | niska | W komiksach Kapitan Marvel to również Monica Rambeau (opcja C) - w MCU nie, ale pytanie bez zastrzeżenia "w MCU". |
| marvel#58 | SLOTY / WARIANTY | krytyczna | a=czerwony, b=złoty -> "złoty, czerwony" odrzucone; brak "żółty" (częsta odpowiedź), "złota/zloto" ok. Zrobić jeden slot lub oba z oboma kolorami; sformułowanie "Jaki kolorowy kombinezon" nieporadne. Trywialne. |
| marvel#59 | SLOTY | średnia | a=Wanda, b=Pietro bez wskazania kolejności w prompcie -> "Pietro, Wanda" odrzucone. Ujawnia także "Sokovia" (cross #98). |
| marvel#60 | WYCIEK + SLOTY | średnia | "tytuł filmu o Iron Manie" -> a="Iron Man" w prompcie. Adnotacja "(a = tytuł, b = aktor)" jest w treści prompta - artefakt generatora (podobnie #61-#74). |
| marvel#16 | ABCD / WYCIEK | średnia | Odpowiedź D) "Rękawica Nieskończoności" zdradzona słowem "Kamienie Nieskończoności" w prompcie; A-C to wymyślone nazwy ("Rękawica Asgardu") - łatwe. |
| marvel#96 | ABCD | średnia | Dystraktory to kwestie innych bohaterów (Hulk, Wakanda forever, Avengers naprzód) - jedyna "Tonyowa" kwestia jest oczywista. Poza tym "kończy film" nieprecyzyjne (przed pstryknięciem). |
| marvel#97 | ABCD | średnia | A) "Avengers assemble" - dystraktory (D "I am Iron Man") odpowiedź #96; polski dubbing: "Avengers... do boju"? - zweryfikować, dodać "Avengers, zbiórka". PRAWDOPODOBNE. |
| marvel#43 | ABCD | niska | Poprawna opcja ("Killmonger") najbardziej szczegółowa; Namor/Klaue ok. |
| marvel#51, #56, #77, #91, #95 | ABCD | niska | Poprawna opcja najdłuższa (7/28 pytań ABCD). |
| marvel#34 | WYCIEK | średnia | #33 w prompcie mówi "granego przez Paula Rudda" -> odpowiedź #34. Opcje "Paul..." tylko pozornie mylące. |
| marvel#45 | WARIANTY | niska | "Burzogrom" jako polska nazwa Stormbreakera - zweryfikować (w polskim dubbingu raczej "Stormbreaker"). PRAWDOPODOBNE. |
| marvel#98 | WARIANTY | średnia | Polski zapis: "Sokowia" (oraz "Sokovia" jest ok) - dodać "Sokowia". |
| marvel#1, #3, #5, #12, #15, #19, #23, #27, #31, #37, #79 | TRYWIALNE / DUP | średnia | Wzorzec "Który aktor gra X" w 11 pytaniach - zero haczyka, zgadywalne bez wiedzy o kinie; dubel z pytaniami "prawdziwe imię X" bezpośrednio przed. |
| marvel#1, #2, #72, #82 | WARIANTY | niska | Dodać nazwiska samodzielnie: "Downey" (6/14 = 43%), "Rogers", "Parker", "Potts" - nie przejdą bez wpisania. |
| marvel#62-#74 | DUP | średnia | Każde to powtórka dwóch wcześniejszych pytań: 62 (=2+3), 63 (=4), 64 (=4+6), 65 (=10+...), 70 (=22+23), 71 (=26+27), 72 (=8+9), 73 (=14), 74 (=46+47). |
| marvel#52-#54 | TRYWIALNE | niska | 4 pytania o Kamienie; zakres "z dużą wiedzą" - ok, ale wtórne względem #68 (Soul). |

## star-wars (quiz-star-wars.json)

Mieszanka: sensowna wiedza o uniwersum, ale 9 pytań (#29-#37) to czysta lista tytułów epizodów, a ok. 11 końcowych (#89-#99) to wielopolowe powtórki z błędnymi slotami. Występują realne błędy faktów (AT-AT, Phasma, Porgi, Darth Maul), bełkotliwe sformułowania ("kontynentalny tytuł", "szablonowi żołnierze", "rdzewiejące istoty (mleczne)") i wycieki. Polskie nazwy (Sokół Millennium, Gwiazda Śmierci, Najwyższy Porządek, Ruch Oporu, karbonit) są dobrze użyte; braki to warianty skrótowe (Kessel, wyścigi, szturmowiec). Trudność: ok. 70% łatwe, 25% średnie, 5% trudne.

| id | typ | waga | opis + proponowana poprawka |
|---|---|---|---|
| sw#28 | FAKT | krytyczna | AT-AT są CZTERONOŻNE; "dwunożny" to AT-ST (którego na Hoth nie było). PEWNE. Zmienić na "czteronożny". |
| sw#47 | FAKT | krytyczna | Darth Maul nie jest "mistrzem Dartha Vadera" - jest uczniem Sidiousa. PEWNE. Poprawić: "uczeń Dartha Sidiousa w epizodzie I". |
| sw#78 | FAKT | krytyczna | Phasma to kapitan (nie generał), jej twarzy/włosów nie widać; "ognistowłosa" pasuje do Huxa, nie do Phasmy. Prompt jednocześnie mówi "generał" i "(Captain ...)". PEWNE. Przepisać: "kapitan w chromowanej zbroi" + usunąć "(Captain ...)". |
| sw#88 | FAKT / JĘZYK | krytyczna | Porgi to ptakopodobne stworzenia, nie "świńskopodobne"; nie "pilnują" wyspy; "rdzewiejące" i "(mleczne)" nie mają sensu. PEWNE. Przepisać: "małe, pierzaste stworzenia z wyspy Ahch-To". |
| sw#95 | FAKT | średnia | Endor nie był bazą Rebelii (to miejsce bitwy i tarczy); bazą w V był Hoth, w IV Yavin 4. Prompt: "dwie planety będące bazami Rebelii" - zmienić na "miejsca kluczowych bitew" lub zamienić Endor na Yavin. |
| sw#41 | WYCIEK | krytyczna | "(oficjalnie Grogu)" - odpowiedź w prompcie, a pytanie dotyczy nazwy nadanej przez fanów (Baby Yoda); wariant "Grogu" zalicza złą. Usunąć nawias, odpowiedź "Baby Yoda", ewentualnie "Grogu" jako drugie pytanie. |
| sw#43 | WYCIEK | krytyczna | "zwanych też Tuskenami" -> odpowiedź "Tuskeni". Zdanie "klan / lud" niezgrabne. |
| sw#48 | WYCIEK | krytyczna | "hrabia ... (Darth Tyranus)" - opcja D "Hrabia Dooku" i wariant "Darth Tyranus" w prompcie. |
| sw#66 | WYCIEK | krytyczna | "(dół Sarlacca)" -> odpowiedź "Sarlacc". |
| sw#97 | WYCIEK / SLOTY | krytyczna | Prompt: "mistrz Jedi szkolący Luke'a ... jego uczeń" -> slot b "Luke" w prompcie. Dup #11. |
| sw#98 | NIEJEDN / SLOTY / WYCIEK | krytyczna | "Wymień trzech łowców nagród / antagonistów" - za szeroko (Bossk, Dengar, Greedo, IG-88, Palpatine, Tarkin...), a sloty ściśle: a=Boba Fett, b=Jabba, c=Vader/Tarkin; Jabba nie jest łowcą nagród; podpowiedź "spod znaku Mandalorian i Huttów" ujawnia a i b. Wyrzucić. |
| sw#99 | SLOTY | krytyczna | a=[Tatooine], b=[Hoth], c=[Endor, Bespin, Dagobah, Alderaan, Yavin] - "Endor, Hoth, Tatooine" lub "Bespin, Dagobah, Alderaan" odrzucone. Wyrzucić albo zrobić jedno pole "Wymień jedną planetę" z pełną listą. |
| sw#91 | SLOTY | krytyczna | Oba sloty mają tę samą listę (R2-D2 / C-3PO) bez dedup. -> "R2-D2, R2-D2" zaliczone. Plus dup #7/#8. |
| sw#92 | SLOTY / WARIANTY | średnia | Jedno pole "piloci" z wariantami "Han Solo i Chewbacca", "Han Solo", "Chewbacca" - "Chewbacca i Han Solo" odrzucone (<60%), a samo "Han Solo" zalicza połowę odpowiedzi. #3 zdradza obu pilotów w prompcie. |
| sw#93 | DUP | niska | Anakin/Vader duplikuje #2; #94 duplikuje #13; #89, #90 duplikują #14, #86, #0; #96 duplikuje #15; #97 duplikuje #11. |
| sw#29 | JĘZYK | krytyczna | "Jaki kontynentalny tytuł nosi pierwsza część sagi" - "kontynentalny" nic nie znaczy (miało być "podtytuł"). Przepisać; pamiętać, że w 1977 film nazywał się po prostu "Gwiezdne wojny". |
| sw#50 | JĘZYK | średnia | "szablonowi żołnierze klony" - nonsens; poza tym klony powstały na Kamino, nie "pochodzą z planety" (podobnie ich geneza - Jango Fett pochodzi z Concord Dawn). Przepisać: "Na jakiej planecie wyprodukowano armię klonów?". Zdradza też #51 (Jango Fett). |
| sw#13 | JĘZYK / WARIANTY | niska | "pełne imię i tytuł" nie pasuje do odpowiedzi "Palpatine / Sidious". Dodać "Sheev Palpatine", "Darth Sidious". Zdradza ją też #45 (Sheev Palpatine). |
| sw#15 | JĘZYK | niska | "Jaki tytuł nosi" - Kylo Ren to imię/pseudonim, nie tytuł. |
| sw#76 | JĘZYK / WARIANTY | średnia | "w jakim sporcie ścigowym" - dziwna fraza. Warianty "wyscigi scigaczy", "podracing" - brak "wyścigi" (7/15 = 47% odrzucone), "ścigacze". Dodać. |
| sw#59 | WYCIEK | średnia | "zasadzki Imperium" ≈ "pułapka" (odpowiedź "To pułapka"); w #58 sam cytat w prompcie ("To pułapka!"). |
| sw#63 | WYCIEK | średnia | "gubernator (Grand Moff)" - tylko opcja C zawiera "Grand Moff". Polska nazwa: "Wielki Moff Tarkin" - dodać wariant. |
| sw#85 | WYCIEK | średnia | "Mandaloriańskie... Mandalorian" -> odpowiedź "Mandalore" zdradzona przez "Mandalorian". Poza tym "lud noszący charakterystyczne zbroje" niezgrabne. |
| sw#40 | WYCIEK / FAKT | niska | "z planety Mandalore" - Din Djarin pochodzi z Aq Vetina (jest wychowany przez Mandalorian). Dodatkowo ujawnia "Mandalorian". |
| sw#19 | WYCIEK | niska | "skrzydła w kształcie litery X" -> "X-wing". |
| sw#20 | WARIANTY | średnia | "szturmowiec" (l.poj.) vs "szturmowcy" -> sim 0,73 (odrzucone). Dodać "szturmowiec". |
| sw#65 | WARIANTY | średnia | Dodać samo "Kessel" (6/11 = 54%, odrzucone). Dobre pytanie z realnymi dystraktorami (Hydiański, Rimma, Korelliański). |
| sw#71 | WARIANTY | niska | Dodać "Organa" (6/10 = 60% granicznie). |
| sw#81 | WARIANTY | niska | Dodać "Erso". |
| sw#37 | WARIANTY | niska | Dodać "Odrodzenie". |
| sw#77 | NIEJEDN / WARIANTY | niska | Kylo Ren zostaje Najwyższym Liderem pod koniec VIII - opcja C częściowo poprawna; "Najwyższy Lider" vs oficjalne "Najwyższy Wódz" - zweryfikować, dodać wariant. |
| sw#42 | NIEJEDN | niska | Lando Calrissian też awansuje na generała i był przemytnikiem - ale "przyjaciel Luke'a" wskazuje Hana. |
| sw#22 | WARIANTY | niska | Wariant "Fett" zaliczy też Jango (#51). Usunąć samo "Fett". |
| sw#7, #12, #26, #39, #49, #53, #60, #64, #82 | ABCD | niska | Poprawna opcja najdłuższa w 8/29 pytaniach ABCD (#12, #39, #49, #53, #60, #63, #64, #82). |
| sw#80 | ABCD / FAKT | niska | Dwa z czterech dystraktorów to seriale (The Mandalorian, Obi-Wan Kenobi) - pytanie o "film"; "pierwszy film spin-off" jest nieścisłe (wcześniej były filmy o Ewokach i Clone Wars). Wariant z "Gwiezdne wojny - historie" dziwny. |
| sw#82, #83 | ABCD / DUP | niska | Oba mają ten sam zestaw 4 kolorów; razem z #24 to trzy pytania o kolor miecza. Odpowiedź jednej wskazuje drugą. |
| sw#29-#37 | TRYWIALNE / FUN | średnia | Dziewięć pytań "Jak brzmi podtytuł epizodu N z roku R" - sucha lista tytułów, 3 z nich z ABCD, opcje wzajemnie zdradzają odpowiedzi (#32-#34). |
| sw#0-#11, #14, #16-#21, #23-#25, #27 | TRYWIALNE | niska | Pytania znane każdemu, kto widział choć jeden film (Tatooine, Leia, Vader, Sokół, Moc, R2-D2, Yoda); ok. 45 pytań. |
| sw#72, #73, #74, #75 | NISZOWE | niska | Owen Lars, Beru, Shmi, Watto - dla poziomu średniego wymagają znajomości detali (dobre jako haczyk, ale rozbić na 1 pytanie). |
| sw cross-leaks | WYCIEK | średnia | #7<->#8 (opcja C-3PO), #9<->#55 (BB-8/Poe), #17<->#21 (Endor/Ewoki), #18<->#46 (Padmé), #53<->#54 (Najwyższy Porządek/Ruch Oporu), #58<->#59 (Ackbar/pułapka), #60<->#61 (Bespin), #70<->#71 (Alderaan), #3<->#92, #50<->#51 (Jango Fett). |

## Wnioski systemowe

Powtarzalne wzorce błędów generatora:
1. **Wyciek odpowiedzi w prompcie** (najczęstszy, ok. 40 przypadków w 4 paczkach): pytanie o postać zawiera jej tytuł filmu lub alias (Vaiana, Merida, Raya, Nemo, Groot, Ultron, Sarlacc, Shang-Chi). Reguła: nigdy nie powtarzać w treści słów, które są w odpowiedzi/wariantach; walidator: sprawdzić, czy którykolwiek wariant (po normalizacji) występuje w prompcie.
2. **Warianty przyjmujące alias z pytania** ("prawdziwe imię Iron Mana" -> "Iron Man", "Spider-Man", "Hawkeye", "She-Hulk", "Star-Lord", "Winter Soldier"). Zalicza złą odpowiedź. Warianty tylko dla pytanej cechy.
3. **Sloty wielopolowe**: (a) identyczne listy w slotach bez dedup (disney#23, #65; sw#91), (b) stała kolejność przy wymaganych "dowolnych" (film#86, #87, #99; marvel#58, #59, #66; sw#98, #99), (c) w treści klucz "(a = ..., b = ...)" i wyliczenie odpowiedzi (marvel#60-#74, #66, #67). Zamienić na pojedyncze pytania, albo wymusić jawny porządek w treści; albo scoring z deduplikacją.
4. **Duplikaty/przepisywanie**: wielopolowe pytania to przepisane pojedyncze pytania (film#77-#91, marvel#60-#74, sw#89-#99); wiele pytań o ten sam film/postać; wymiana odpowiedzi między pytaniami (cross-leaks) w obrębie jednej bajki/filmu.
5. **Zbyt łatwy poziom, szablon "Kto zagrał/ reżyserował"**: film ok. 75%, marvel ok. 85%, disney ok. 90% trywialnych; brakuje haczyka, ciekawostek, "dlaczego".
6. **Błędy faktu z przybliżeń**: liczba nóg AT-AT, Phasma-generał, Porgi-świniopodobne, Maul jako mistrz Vadera, Ultron stworzył sam Stark, Cap współtworzony przez Lee, Quo Vadis u Hoffmana, "trylogia Avengers", Mulan księżniczka, Cogsworth zegarmistrz. Generator łączy wiedzę niedokładnie - potrzebny krok weryfikacji źródłowej.
7. **Język**: kalki i nonsens składniowy ("kontynentalny tytuł", "szablonowi żołnierze", "rdzewiejące... (mleczne)", "organizacja / dziesięć pierścieni", "klan / lud"). Wyłapać regułą: slash w treści, niezamknięte nawiasy/adnotacje.
8. **ABCD**: dystraktory z innej kategorii lub absurdalne ("Jaś", Dumbo przy jelonku, DreamWorks przy Pixarze), dwie opcje pokrywające tę samą postać (Dzwoneczka/Dzwoneczek), poprawna opcja najdłuższa w 22/113 pytaniach ABCD (ok. 19%; film 4/28, disney 7/27, marvel 7/28, star-wars 8/29), rozkład liter akceptowalny. Opcje w pytaniach tej samej serii zdradzają sobie odpowiedzi.
9. **Warianty polskie**: generalnie dobre (Zygzak McQueen, Złomek, Skaza, Sokół Millennium), ale brakuje krótkich form, które nie przechodzą progu 60% (Zygzak, Mickey, Kubuś, Balu, Mogli, Kessel, Downey, Rogers, Parker, Potts, szturmowiec, wyścigi, Sokowia).

Liczby (przejrzano 400 pytań):
| paczka | pytań | krytyczne | średnie |
|---|---|---|---|
| film | 100 | 8 (#4, #17, #27, #37, #67, #86, #87, #99) | ok. 8 |
| disney | 100 | ok. 11 (#29, #51, #63, #95, #46, #23, #65, #41, #61 itd.) | ok. 15 |
| marvel | 100 | ok. 27 | ok. 15 |
| star-wars | 100 | ok. 14 | ok. 12 |
Łącznie: ok. 60 pytań z problemem krytycznym, ok. 50 ze średnim (liczby przybliżone; tabela wyżej = lista źródłowa).
