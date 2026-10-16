/* ============================================================
   categories.js — dane kategorii dla trenera STACJA
   ------------------------------------------------------------
   Ten plik jest CELOWO oddzielony od index.html, żeby dało się
   go regenerować w osobnej sesji (np. dopisać wykonawców, nowe
   kategorie albo teksty piosenek pod lektora) bez ruszania logiki gry.

   Struktura:
     window.CATEGORIES = {
       decades: { <klucz>: { label, range, artists:[...] }, ... },
       styles:  { <klucz>: { label, desc,  artists:[...] }, ... },
     }

   Pole `songs` (opcjonalne, na przyszłość — pod lektora) może wyglądać:
     songs: [ { title, artist, lyric:"fragment tekstu", year, album }, ... ]
   Jeśli kategoria ma `songs`, gra może z nich korzystać zamiast/oprócz
   losowania po `artists`. Na razie używane są `artists`.
   Wyjątek: „akustycznie / unplugged" (styles.unplugged) — same `songs` z polem
   `match` (słowo wymagane w tytule/albumie wyniku iTunes: wersja akustyczna, nie
   studyjna) i `noModes` (tryby wyłączone dla kategorii, core/match.modesFor).

   Zasady puli (audyt 2026-10): dekada = szczyt popularności wykonawcy (nie
   cała dyskografia); każdy wykonawca sprawdzony w iTunes PL (attribute=
   artistTerm, limit 60) — ≥8 grywalnych zajawek i wyniki tego samego
   wykonawcy (pickTrack dopasowuje nazwę przez `includes`, więc krótkie,
   ogólne nazwy typu „Boys" łapią Backstreet Boys — takich nie dodawaj).
   Usunięte za brak puli: Perfect (3 zajawki), Hey (7), Oasis (2), Feel (2),
   Weekend (0), Classic (1), Snap! (2), Aqua (3), Corona (7).

   UWAGA: trzymaj ten plik OBOK index.html (ładowany przez <script src>).
   Działa też przy otwarciu z dysku (file://) na telefonie.
   ============================================================ */
window.CATEGORIES = {
  decades: {
    '60s': {label:'lata 60', range:'1960–69', artists:['The Beatles','The Rolling Stones','Elvis Presley','The Beach Boys','Bob Dylan','The Doors','Jimi Hendrix','Simon & Garfunkel','The Kinks','The Supremes','Czerwone Gitary','Czesław Niemen','Skaldowie','Anna German']},
    '70s': {label:'lata 70', range:'1970–79', artists:['ABBA','Bee Gees','Boney M.','Queen','Pink Floyd','Led Zeppelin','David Bowie','Eagles','Elton John','Deep Purple','Donna Summer','Maryla Rodowicz','Anna Jantar','Budka Suflera','Krzysztof Krawczyk','Marek Grechuta','2 plus 1']},
    '80s': {label:'lata 80', range:'1980–89', artists:['Maanam','Lady Pank','Republika','Kombi','Lombard','Bajm','Oddział Zamknięty','Papa Dance','Dżem','Modern Talking','Michael Jackson','Madonna','Depeche Mode','a-ha','Wham!','Bon Jovi','Guns N\' Roses','Roxette','Duran Duran']},
    '90s': {label:'lata 90', range:'1990–99', artists:['Kult','Myslovitz','Wilki','Edyta Bartosiewicz','Elektryczne Gitary','Kayah','Kasia Kowalska','Varius Manx','T.Love','Edyta Górniak','Nirvana','Pearl Jam','Green Day','Alanis Morissette','Celine Dion','Spice Girls','Backstreet Boys','Ace of Base']},
    '00s': {label:'lata 2000', range:'2000–09', artists:['Ich Troje','Doda','Sistars','Blue Café','Ania Dąbrowska','Golec uOrkiestra','Coma','Coldplay','Eminem','Linkin Park','Beyoncé','The Killers','Amy Winehouse','Black Eyed Peas','Shakira','Evanescence','50 Cent']},
    '10s': {label:'lata 2010', range:'2010–19', artists:['Dawid Podsiadło','Brodka','Mela Koteluk','Sylwia Grzeszczak','Margaret','Cleo','Kamil Bednarek','Taco Hemingway','Quebonafide','Adele','Ed Sheeran','Imagine Dragons','Bruno Mars','Rihanna','Taylor Swift','Lady Gaga','Justin Bieber','Avicii']},
    '20s': {label:'lata 2020', range:'2020–', artists:['sanah','Mata','Daria Zawiałow','Ralph Kaminski','Kwiat Jabłoni','Young Leosia','Ochman','Dua Lipa','The Weeknd','Billie Eilish','Harry Styles','Olivia Rodrigo','Sabrina Carpenter','Måneskin','Bad Bunny']},
  },
  styles: {
    'rap-pl':   {label:'rap PL',     desc:'polski hip-hop', artists:['Taco Hemingway','Quebonafide','O.S.T.R.','Paktofonika','Kaliber 44','Liroy','Tede','Molesta Ewenement','Peja','Pezet','Eldo','Łona i Webber','Sokół','Mata','Białas','Bedoes','Kękę','PRO8L3M']},
    'disco-polo':{label:'disco polo', desc:'parkietowe', artists:['Akcent','Zenon Martyniuk','Bayer Full','Top One','Shazza','Piękni i Młodzi','Czadoman','Jacek Stachursky','Extazy','Skaner','Mig','Łobuzy','After Party']},
    'rock-pl':  {label:'rock PL',    desc:'polski rock', artists:['Dżem','Lady Pank','Maanam','Republika','Kult','Myslovitz','T.Love','Budka Suflera','Oddział Zamknięty','Armia','Voo Voo','Pidżama Porno','Elektryczne Gitary','Happysad','Coma','Acid Drinkers','Strachy na Lachy']},
    'rock-world':{label:'rock świat', desc:'klasyka rocka', artists:['Queen','The Beatles','The Rolling Stones','Led Zeppelin','Pink Floyd','Deep Purple','Aerosmith','Dire Straits','Scorpions','The Who','Nirvana','U2','Metallica','AC/DC','Guns N\' Roses','Bon Jovi','Red Hot Chili Peppers','Foo Fighters','Green Day','Linkin Park','Radiohead','The Police']},
    'pop-world':{label:'pop świat',  desc:'wielkie gwiazdy', artists:['Michael Jackson','Madonna','Whitney Houston','Mariah Carey','Celine Dion','Britney Spears','Shakira','Adele','Lady Gaga','Beyoncé','Rihanna','Taylor Swift','Justin Timberlake','Justin Bieber','Ariana Grande','Bruno Mars','Katy Perry']},
    'dance-90': {label:'eurodance',  desc:'dance lat 90', artists:['La Bouche','Haddaway','2 Unlimited','Dr. Alban','Real McCoy','Culture Beat','Captain Hollywood Project','Whigfield','E-Type','Rednex','Technotronic','Alexia','Eiffel 65','Vengaboys','Scooter']},
    'hits-now': {label:'hity dziś',  desc:'współczesne', artists:['Dua Lipa','The Weeknd','Billie Eilish','Harry Styles','Olivia Rodrigo','Sabrina Carpenter','Chappell Roan','Taylor Swift','Ed Sheeran','Doja Cat','Post Malone','SZA','Miley Cyrus','sanah','Mata','Dawid Podsiadło','Sylwia Grzeszczak']},
    'evergreen-pl':{label:'evergreeny PL', desc:'polskie złoto', artists:['Maryla Rodowicz','Anna Jantar','Anna German','Czesław Niemen','Czerwone Gitary','Skaldowie','Krzysztof Krawczyk','Zbigniew Wodecki','Marek Grechuta','Halina Frąckowiak','Jerzy Połomski','Irena Santor','Violetta Villas','Andrzej Zaucha','Zdzisława Sośnicka']},
    'metal':    {label:'metal',      desc:'cięższe brzmienia', artists:['Metallica','Iron Maiden','Black Sabbath','Judas Priest','Motörhead','Ozzy Osbourne','Slayer','Megadeth','Pantera','Sepultura','Korn','System of a Down','Slipknot','Rammstein','Behemoth','Vader']},
    /* kuratorowana (2026-10): OFICJALNE wersje akustyczne/unplugged nagrane przez TEGO SAMEGO wykonawcę (MTV Unplugged,
       albumy „Akustycznie"/„Unplugged"). `match` = słowo wymagane w tytule/albumie wyniku iTunes (core/trackSelect.matchSong),
       żeby nie zagrała wersja studyjna; `year`/`album` = wydanie akustyczne. Każdy utwór sprawdzony w iTunes PL:
       `node tools/verify-tracks.mjs --cats unplugged`. `noModes`: zajawka już JEST wersją akustyczną — bez coverów
       instrumentalnych, okładki i składanki (core/match.modesFor). */
    'unplugged':{label:'akustycznie / unplugged', desc:'MTV Unplugged i wersje akustyczne', noModes:['piano','guitar','cover','medley'], songs:[
      {title:'Czerwony jak cegła', artist:'Dżem', year:'1994', album:'Akustycznie', match:'akustycz'},
      {title:'Jest taki samotny dom', artist:'Budka Suflera', year:'1998', album:'Akustycznie', match:'akustycz'},
      {title:'Mój dom', artist:'IRA', year:'2014', album:'IRA Akustycznie', match:'akustycz'},
      {title:'Kryzysowa narzeczona', artist:'Lady Pank', year:'2022', album:'MTV Unplugged', match:'unplugged'},
      {title:'Mniej niż zero', artist:'Lady Pank', year:'2007', album:'Akustycznie – Mała wojna', match:'akustycz'},
      {title:'Płomień z nieba', artist:'Bajm', year:'2015', album:'Live Akustycznie', match:'akustycz'},
      {title:'Dmuchawce, latawce, wiatr', artist:'Urszula', year:'2017', album:'Złote przeboje akustycznie', match:'akustycz'},
      {title:'Na językach', artist:'Kayah', year:'2007', album:'MTV Unplugged', match:'unplugged'},
      {title:'Baśka', artist:'Wilki', year:'2009', album:'MTV Unplugged', match:'unplugged'},
      {title:'A to co mam', artist:'Kasia Kowalska', year:'2019', album:'MTV Unplugged', match:'unplugged'},
      {title:'Granda', artist:'Brodka', year:'2018', album:'MTV Unplugged', match:'unplugged'},
      {title:'Miłość miłość', artist:'Krzysztof Zalewski', year:'2021', album:'MTV Unplugged', match:'unplugged'},
      {title:'Im więcej Ciebie tym mniej', artist:'Natalia Kukulska', year:'2022', album:'MTV Unplugged', match:'unplugged'},
      {title:'Małomiasteczkowy', artist:'Dawid Podsiadło', year:'2019', album:'EP (na żywo, akustycznie)', match:'akustycz'},
      {title:'Za daleko', artist:'Mrozu', year:'2023', album:'Mrozu. MTV Unplugged', match:'unplugged'},
      {title:'Głupi ja', artist:'Organek', year:'2024', album:'MTV Unplugged Organek', match:'unplugged'},
      {title:'Cool Me Down', artist:'Margaret', year:'2023', album:'MTV Unplugged Margaret', match:'unplugged'},
      {title:'About a Girl', artist:'Nirvana', year:'1994', album:'MTV Unplugged in New York', match:'unplugged'},
      {title:'Come as You Are', artist:'Nirvana', year:'1994', album:'MTV Unplugged in New York', match:'unplugged'},
      {title:'All Apologies', artist:'Nirvana', year:'1994', album:'MTV Unplugged in New York', match:'unplugged'},
      {title:'Dumb', artist:'Nirvana', year:'1994', album:'MTV Unplugged in New York', match:'unplugged'},
      {title:'Nutshell', artist:'Alice in Chains', year:'1996', album:'MTV Unplugged', match:'unplugged'},
      {title:'Rooster', artist:'Alice in Chains', year:'1996', album:'MTV Unplugged', match:'unplugged'},
      {title:'Would?', artist:'Alice in Chains', year:'1996', album:'MTV Unplugged', match:'unplugged'},
      {title:'Down in a Hole', artist:'Alice in Chains', year:'1996', album:'MTV Unplugged', match:'unplugged'},
      {title:'Tears in Heaven', artist:'Eric Clapton', year:'1992', album:'Unplugged', match:'unplugged'},
      {title:'Hotel California', artist:'Eagles', year:'1994', album:'Hell Freezes Over', match:'mtv'},
      {title:'Desperado', artist:'Eagles', year:'1994', album:'Hell Freezes Over', match:'mtv'},
      {title:'Emotions', artist:'Mariah Carey', year:'1992', album:'MTV Unplugged', match:'unplugged'},
      {title:'Vision of Love', artist:'Mariah Carey', year:'1992', album:'MTV Unplugged', match:'unplugged'},
      {title:'Someday', artist:'Mariah Carey', year:'1992', album:'MTV Unplugged', match:'unplugged'},
      {title:'Ojos así', artist:'Shakira', year:'2000', album:'MTV Unplugged', match:'unplugged'},
      {title:'Inevitable', artist:'Shakira', year:'2000', album:'MTV Unplugged', match:'unplugged'},
      {title:'Dog Days Are Over', artist:'Florence + the Machine', year:'2012', album:'MTV Presents Unplugged', match:'unplugged'},
      {title:'Cosmic Love', artist:'Florence + the Machine', year:'2012', album:'MTV Presents Unplugged', match:'unplugged'},
      {title:'Freak on a Leash', artist:'Korn', year:'2007', album:'MTV Unplugged', match:'mtv'},
      {title:'Falling Away from Me', artist:'Korn', year:'2007', album:'MTV Unplugged', match:'mtv'},
      {title:'Take On Me', artist:'a-ha', year:'2017', album:'MTV Unplugged – Summer Solstice', match:'unplugged'},
      {title:'The Sun Always Shines on TV', artist:'a-ha', year:'2017', album:'MTV Unplugged – Summer Solstice', match:'unplugged'},
      {title:'Hunting High and Low', artist:'a-ha', year:'2017', album:'MTV Unplugged – Summer Solstice', match:'unplugged'},
      {title:'Stitches', artist:'Shawn Mendes', year:'2017', album:'MTV Unplugged', match:'unplugged'},
      {title:'There\'s Nothing Holdin\' Me Back', artist:'Shawn Mendes', year:'2017', album:'MTV Unplugged', match:'unplugged'},
      {title:'Summer of \'69', artist:'Bryan Adams', year:'1997', album:'MTV Unplugged', match:'unplugged'},
      {title:'Heaven', artist:'Bryan Adams', year:'1997', album:'MTV Unplugged', match:'unplugged'},
      {title:'Beth', artist:'Kiss', year:'1996', album:'MTV Unplugged', match:'unplugged'},
      {title:'Wind of Change', artist:'Scorpions', year:'2013', album:'MTV Unplugged in Athens', match:'unplugged'},
      {title:'Still Loving You', artist:'Scorpions', year:'2013', album:'MTV Unplugged in Athens', match:'unplugged'},
      {title:'If I Ain\'t Got You', artist:'Alicia Keys', year:'2005', album:'Unplugged', match:'unplugged'},
      {title:'Fallin\'', artist:'Alicia Keys', year:'2005', album:'Unplugged', match:'unplugged'},
      {title:'I Kissed a Girl', artist:'Katy Perry', year:'2009', album:'MTV Unplugged', match:'unplugged'},
      {title:'Knockin\' on Heaven\'s Door', artist:'Bob Dylan', year:'1995', album:'MTV Unplugged', match:'unplugged'},
      {title:'Like a Rolling Stone', artist:'Bob Dylan', year:'1995', album:'MTV Unplugged', match:'unplugged'},
      {title:'Maggie May', artist:'Rod Stewart', year:'1993', album:'Unplugged… and Seated', match:'unplugged'}
    ]},
  },
};
