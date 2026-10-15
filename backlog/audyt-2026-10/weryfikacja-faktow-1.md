# Fact-check paczek quizu — audyt 2026-10

Zakres: 22 paczki `data/quiz-*.json` (bez literatury, sztuki, mitologii i kosmetyków) oraz `lyrics.js` (title/artist/year).
Próba w każdej paczce: 20 pytań losowanych deterministycznie (`random.Random(nazwa_pliku)`), do tego wszystkie pytania z difficulty 3 i wszystkie z polem `fun`. W `quiz-muzyka.json` sprawdzono całość (150). W lyrics.js: cała kategoria tlum-pl (65) i 30 losowych z tlum-int (seed „lyrics.js”).
Po poprawkach: `lint-data --file` daje 0 błędów dla każdej zmienionej paczki, a `node test/data.js` przechodzi (22357/22357). Zmiany są tylko w `data/` i `lyrics.js`, nic nie zostało scommitowane.

## Poprawki

| plik#indeks | co było źle | poprawka | pewność |
|---|---|---|---|
| muzyka#7 | [alias] Aliasy „Olga Sipowicz” (nazwisko po 2. mężu, od 2013) i „Olga Ostrowska” (panieńskie) zaliczają złą odpowiedź na pytanie o nazwisko z czasów triumfów Maanamu | usunięto 2 aliasy | wysoka |
| muzyka#9 | [fun] „W tym samym 1983 roku” — premiera „Akademii pana Kleksa” to 1984 (niepewne datowanie) | przeformułowano bez roku | średnia |
| muzyka#20 | [treść] Błędny tytuł: piosenka Niemena to „Wspomnienie” (l.poj.), nie „Wspomnienia” | poprawiono tytuł | wysoka |
| muzyka#32 | [fun] „od 1983 roku wokalista Lady Pank” — data niepewna (dołączył ok. 1982) | usunięto datę | średnia |
| muzyka#39 | [fun] „W 2025 roku został radcą prawnym” — rok niepotwierdzony | przeformułowano bez roku | średnia |
| muzyka#44 | [fun] Liszewski jako „producent i właściciel wytwórni” — niepotwierdzone | usunięto fun | średnia |
| muzyka#54 | [dystraktor] Dystraktor „Paryż” mylący — „Casino de Paris” to też słynna paryska rewia | zamieniono na „Londyn” | średnia |
| muzyka#56 | [dystraktor] „Z jakiego kraju pochodzi Ewa Farna” — Polka z Zaolzia, więc „Polska” też broni się jako odpowiedź | zmieniono na „W którym kraju urodziła się” | wysoka |
| muzyka#72 | [alias] Alias „Finneas” — współautor, nie wykonawca | usunięto alias | wysoka |
| biologia#15 | [fun] „Mózg uczy się odwracać obraz w niemowlęctwie” — popularny mit/uproszczenie | usunięto fun | średnia |
| biologia#86 | [fun] Nieprecyzyjne: podobną budowę ma hem (porfiryna), nie cała hemoglobina | doprecyzowano | wysoka |
| biologia#98 | [alias] Alias „owodnia” to błona, nie płyn | usunięto alias | wysoka |
| disney#15 | [fun] Disney+ wystartował w Polsce 14 czerwca 2022, nie 2020 | poprawiono rok | wysoka |
| disney#20 | [dystraktor] Dystraktor „Nawiedzony dwór” (2003) też jest filmem Disneya opartym na atrakcji parku — 2 poprawne odpowiedzi | zamieniono na „Zakręcony piątek” (2003) | wysoka |
| disney#24 | [odpowiedź] W polskim dubbingu królik nazywa się Tuptuś, nie „Tup” | kanoniczna „Tuptuś” | wysoka |
| disney#31 | [odpowiedź] Polskie imię „Niebianka” dla Merryweather niepotwierdzone | kanoniczna „Merryweather”, „Niebianka” jako alias | niska |
| disney#92 | [fun] Polskie nazwy nowych emocji z części 2 („Niepokój”, „Nuda”, „Zakłopotanie”) niepotwierdzone | uogólniono | średnia |
| disney#95 | [alias] Alias „nagietki” — nagietek (Calendula) to inna roślina niż aksamitka (Tagetes) | usunięto alias | wysoka |
| film#19 | [odpowiedź] Kazimierza Pawlaka grał Wacław Kowalski; Władysław Hańcza grał Kargula — kanoniczna odpowiedź była błędna | odpowiedź A) Wacław Kowalski | wysoka |
| geografia#18 | [treść] Mauna Kea to wulkan uśpiony, nie wygasły | „wygasły” → „uśpiony” | wysoka |
| geografia#19 | [treść] Kilimandżaro (Kibo) to wulkan uśpiony, nie wygasły | „wygasły” → „uśpiony” | wysoka |
| gry-wideo#18 | [treść] Zdanie bez orzeczenia („Który coroczny turniej… słynący…?”) | przeredagowano | wysoka |
| gry-wideo#22 | [treść] Błąd składni („W jakim języku wypowiada się Krzyki”) | przeredagowano | wysoka |
| gry-wideo#56 | [treść] Błąd składni („Którego gry kasety Atari miało podobno zakopać”) | przeredagowano | wysoka |
| gry-wideo#78 | [fun] „Final Fantasy = ostatnia nadzieja Square przed bankructwem” — popularny mit, dementowany przez twórców | usunięto fun | średnia |
| harry-potter#14 | [alias] W polskim przekładzie to „Szafka Zniknięć” — brak tej formy wśród aliasów | dodano „Szafka Zniknięć” jako kanoniczną | średnia |
| harry-potter#57 | [alias] Alias „skrzela” zalicza złą odpowiedź (to nie roślina) | usunięto alias | wysoka |
| harry-potter#87 | [alias] Alias „kruk” zalicza odpowiedź filmową, sprzeczną z fun (w książkach orzeł) | usunięto alias | wysoka |
| harry-potter#94 | [fun] Znicz NIE otworzył się po przyłożeniu do ust — wtedy ujawnił napis; otworzył się, gdy Harry szedł na śmierć | poprawiono fun | wysoka |
| historia-polski#0 | [fun] „Przy okazji ożenił się z Dobrawą” — ślub był w 965, rok przed chrztem | poprawiono | wysoka |
| historia-polski#10 | [fun] Odwrócony sens: to heroldowie Ulricha przynieśli miecze Jagielle, a nie odwrotnie | poprawiono | wysoka |
| historia-polski#99 | [fun] „Dwa tygodnie później oba kraje wkroczyły” — Niemcy po 9 dniach, ZSRR po 25 | poprawiono | wysoka |
| historia-swiata#6 | [fun] „Cały V wiek p.n.e.” — wiek Peryklesa to środek stulecia | doprecyzowano | średnia |
| historia-swiata#35 | [fun] To Atahualpa zaoferował okup (pokój złota), nie Pizarro go zażądał | poprawiono | wysoka |
| kosmos#22 | [treść] Zbędny przecinek w treści | poprawiono interpunkcję | wysoka |
| kosmos#61 | [alias] Polska nazwa gwiazdozbioru to Hydra / Wąż Wodny, nie „Wąż Morski” | zamieniono alias | wysoka |
| krolowie-polscy#18 | [treść] Treść odwołuje się do poprzedniego pytania („ta sama królowa”) — po tasowaniu traci sens | pytanie samodzielne | wysoka |
| kuchnia#21 | [fun] „Wasabi rośnie TYLKO w strumieniach” — uprawia się je też na polach | złagodzono | wysoka |
| lotnictwo#37 | [fun] Data „od 1919 r.” niepewna (wprowadzenie szachownicy datuje się różnie, 1918–1921) | uogólniono | średnia |
| lotnictwo#42 | [fun] Pierwszym samolotem czterosilnikowym był „Russkij Witiaź” (1913), nie Ilja Muromiec | poprawiono | wysoka |
| medycyna#0 | [fun] „także z telefonu bez karty SIM” — nie we wszystkich krajach UE (część blokuje takie połączenia) | usunięto tę część | średnia |
| medycyna#39 | [treść] 120/80 to górna granica ciśnienia optymalnego (optymalne = poniżej 120/80) | przeformułowano | wysoka |
| marvel#57 | [treść] Od 2015 r. komiksy zanegowały ojcostwo Magneto — „jest ojcem” nieaktualne | „przez dekady uchodził za ojca” | średnia |
| marvel#80 | [treść] Na imprezie nikt poza Thorem nie podnosi Mjolnira — Vision robi to później | usunięto „na imprezie” | wysoka |
| nauka#22 | [fun] „Kilkanaście lat później” — gal odkryto po 6 latach (1875) | podano lata | wysoka |
| sport#33 | [treść] „Najmłodsza mistrzyni olimpijska w historii lekkoatletyki” — fałsz (np. B. Jones, 15 lat, 1952) | przeformułowano na wiek 17 lat | wysoka |
| sport#40 | [fun] Kowalczyk wygrała Puchar Świata 4 razy (2009, 2010, 2011, 2013), nie 5 | 5 → 4 | wysoka |
| sport#69 | [treść] Pierwszym polskim IMŚ był Jerzy Szczakiel (1973), nie Gollob | „w cyklu Grand Prix” | wysoka |
| sport#99 | [treść] Regaty są coroczne od 1856 r. (pierwsza w 1829, w Henley) | przeformułowano | wysoka |
| star-wars#5 | [fun] LSO nagrała muzykę do 6 pierwszych filmów, nie do wszystkich 9 (sekwele nagrywano w LA) | doprecyzowano | wysoka |
| star-wars#38 | [treść] Literówka „kroczaca” | „krocząca” | wysoka |
| star-wars#41 | [treść] Zdanie bez orzeczenia | przeredagowano | wysoka |
| star-wars#95 | [treść] Nad Como kręcono nadjeziorną rezydencję (ślub Anakina i Padmé), a nie pałac Naboo (Caserta) | przeformułowano | wysoka |
| wladca-pierscieni#0 | [alias] Alias „ptak” zalicza każdą opcję (wszystkie są ptakami) | usunięto alias | wysoka |
| wladca-pierscieni#26 | [fun] W książce zagadkę rozwiązał Gandalf — Frodo zgaduje tylko w filmie | poprawiono | wysoka |
| wladca-pierscieni#32 | [alias] Nimloth to drzewo Númenoru (przodek), nie Białe Drzewo Minas Tirith | usunięto alias | wysoka |
| zwierzeta#75 | [odpowiedź] „Orlisko” — termin niepotwierdzony w słownikach (prawdopodobna halucynacja) | zastąpiono pytaniem o sójkę | wysoka |
| zwierzeta#89 | [fun] Przebiśnieg jest od 2014 r. pod ochroną częściową, nie ścisłą | „objęty ochroną gatunkową” | średnia |
| lyrics tlum-pl „Mamy dla was kwiaty” (Niebiesko-Czarni) | [rok] rok 1968 niepotwierdzony w źródłach | year → '' | średnia |
| lyrics tlum-pl „Tak bardzo się starałem” (Czerwone Gitary) | [rok] rok 1969 niepotwierdzony (źródła wskazują 1968–69) | year → '' | średnia |
| lyrics tlum-int „Old Town Road” (Lil Nas X) | [rok] singiel ukazał się w grudniu 2018, nie w 2019 | 2019 → 2018 | wysoka |

## Statystyka per paczka

| paczka | sprawdzono | odpowiedź | treść | fun | alias | dystraktor | razem | % błędów w próbie |
|---|---|---|---|---|---|---|---|---|
| quiz-biologia.json | 63 | 0 | 0 | 2 | 1 | 0 | 3 | 5% (3 pyt.) |
| quiz-disney.json | 59 | 2 | 0 | 2 | 1 | 1 | 6 | 10% (6 pyt.) |
| quiz-film.json | 58 | 1 | 0 | 0 | 0 | 0 | 1 | 2% (1 pyt.) |
| quiz-geografia.json | 52 | 0 | 2 | 0 | 0 | 0 | 2 | 4% (2 pyt.) |
| quiz-gry-wideo.json | 60 | 0 | 3 | 1 | 0 | 0 | 4 | 7% (4 pyt.) |
| quiz-harry-potter.json | 60 | 0 | 0 | 1 | 3 | 0 | 4 | 7% (4 pyt.) |
| quiz-historia-polski.json | 65 | 0 | 0 | 3 | 0 | 0 | 3 | 5% (3 pyt.) |
| quiz-historia-swiata.json | 60 | 0 | 0 | 2 | 0 | 0 | 2 | 3% (2 pyt.) |
| quiz-informatyka.json | 35 | 0 | 0 | 0 | 0 | 0 | 0 | 0% (0 pyt.) |
| quiz-kosmos.json | 72 | 0 | 1 | 0 | 1 | 0 | 2 | 3% (2 pyt.) |
| quiz-krolowie-polscy.json | 42 | 0 | 1 | 0 | 0 | 0 | 1 | 2% (1 pyt.) |
| quiz-kuchnia.json | 61 | 0 | 0 | 1 | 0 | 0 | 1 | 2% (1 pyt.) |
| quiz-lotnictwo.json | 43 | 0 | 0 | 2 | 0 | 0 | 2 | 5% (2 pyt.) |
| quiz-marvel.json | 58 | 0 | 2 | 0 | 0 | 0 | 2 | 3% (2 pyt.) |
| quiz-medycyna.json | 36 | 0 | 1 | 1 | 0 | 0 | 2 | 6% (2 pyt.) |
| quiz-muzyka.json | 150 | 0 | 1 | 4 | 2 | 2 | 9 | 6% (9 pyt.) |
| quiz-nauka.json | 59 | 0 | 0 | 1 | 0 | 0 | 1 | 2% (1 pyt.) |
| quiz-sport.json | 88 | 0 | 3 | 1 | 0 | 0 | 4 | 5% (4 pyt.) |
| quiz-star-wars.json | 54 | 0 | 3 | 1 | 0 | 0 | 4 | 7% (4 pyt.) |
| quiz-wiedzmin.json | 34 | 0 | 0 | 0 | 0 | 0 | 0 | 0% (0 pyt.) |
| quiz-wladca-pierscieni.json | 54 | 0 | 0 | 1 | 2 | 0 | 3 | 6% (3 pyt.) |
| quiz-zwierzeta.json | 67 | 1 | 0 | 1 | 0 | 0 | 2 | 3% (2 pyt.) |
| **RAZEM** | 1330 | 4 | 17 | 24 | 10 | 3 | 58 | 4.4% |
| lyrics.js (tlum-pl 65 + tlum-int 30) | 95 | — | — | — | — | — | 3 (rok) | 3% |

## Uwagi
- Wpisy oznaczone „treść” obejmują też drobne usterki redakcyjne: zdania bez orzeczenia (gry#18, #22, #56; star-wars#41), literówkę (star-wars#38) i zbędny przecinek (kosmos#22). Poważne błędy merytoryczne w treści to: sport#33, #69, #99; medycyna#39; marvel#57, #80; star-wars#95; geografia#18, #19; królowie#18.
- Zostało do decyzji: disney#31. Polskie imię Merryweather („Niebianka”) jest niepotwierdzone, więc kanoniczna jest teraz forma oryginalna, a „Niebianka” została jako alias. Warto to sprawdzić w polskim dubbingu.
- Zostało do decyzji: harry-potter#14. „Szafka Zniknięć” (przekład Polkowskiego) jest teraz kanoniczna z pewnością średnią; stare formy zostały jako aliasy.
- Poza zakresem fact-checku (duplikat między paczkami): zwierzeta#94 i geografia#49 pytają o Wielką Rafę Koralową.
- Ostrzeżenia lintera typu „kanoniczna odpowiedź w innym pytaniu” (biologia, kosmos, kuchnia, marvel, nauka, star-wars, władca) były już wcześniej, poza jednym, które sam wprowadziłem i od razu usunąłem (królowie#18).
- Źródła sprawdzone w sieci: Kinematografia (premiera 18.12.2000, Magik zm. 26.12), Łona został radcą prawnym (rok niepotwierdzony), Disney+ w Polsce od 14.06.2022, Tuptuś w dubbingu „Bambi” (fdb.pl), „Mała wojna” Lady Pank (Tacy sami, 1988), „Sen o Warszawie” (singiel 1966), „Z kopyta kulig rwie” (1969), „orlisko” nie występuje w słownikach.
