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

   UWAGA: trzymaj ten plik OBOK index.html (ładowany przez <script src>).
   Działa też przy otwarciu z dysku (file://) na telefonie.
   ============================================================ */
window.CATEGORIES = {
  decades: {
    '60s': {label:'lata 60', range:'1960–69', artists:['The Beatles','The Rolling Stones','Elvis Presley','The Beach Boys','Czerwone Gitary','Czesław Niemen','Skaldowie','Aretha Franklin','The Animals','Niebiesko-Czarni','Bob Dylan','The Kinks']},
    '70s': {label:'lata 70', range:'1970–79', artists:['ABBA','Bee Gees','Boney M.','Queen','Pink Floyd','Led Zeppelin','David Bowie','Eagles','Maryla Rodowicz','Anna Jantar','Budka Suflera','SBB','Elton John','Czerwone Gitary']},
    '80s': {label:'lata 80', range:'1980–89', artists:['Maanam','Lady Pank','Republika','Perfect','Kombi','Lombard','Modern Talking','Michael Jackson','Madonna','Depeche Mode','a-ha','Whitney Houston','Queen','Bananarama']},
    '90s': {label:'lata 90', range:'1990–99', artists:['Hey','Myslovitz','Kult','Wilki','Edyta Bartosiewicz','Elektryczne Gitary','Nirvana','U2','Oasis','Spice Girls','Backstreet Boys','Metallica','Madonna','Ace of Base']},
    '00s': {label:'lata 2000', range:'2000–09', artists:['Myslovitz','Feel','Ich Troje','Virgin','Coma','Hey','Coldplay','Eminem','Linkin Park','Beyoncé','Rihanna','The Killers','Lady Pank','Kombii']},
    '10s': {label:'lata 2010', range:'2010–19', artists:['Dawid Podsiadło','Brodka','Mela Koteluk','Taco Hemingway','Quebonafide','O.S.T.R.','Kortez','Adele','Ed Sheeran','Imagine Dragons','Bruno Mars','Daft Punk','The Weeknd','Dua Lipa']},
  },
  styles: {
    'rap-pl':   {label:'rap PL',     desc:'polski hip-hop', artists:['Taco Hemingway','Quebonafide','O.S.T.R.','Paktofonika','Kaliber 44','Peja','Pezet','Eldo','Łona i Webber','Sokół','Mata','Białas','Bedoes','Kękę','Kazik','PRO8L3M']},
    'disco-polo':{label:'disco polo', desc:'parkietowe', artists:['Akcent','Boys','Bayer Full','Top One','Shazza','Weekend','Toples','Skaner','Classic','Łobuzy','Mig','After Party']},
    'rock-pl':  {label:'rock PL',    desc:'polski rock', artists:['Dżem','Perfect','Lady Pank','Maanam','Republika','Kult','Hey','Myslovitz','T.Love','Lombard','Budka Suflera','Coma','Acid Drinkers','Strachy na Lachy']},
    'rock-world':{label:'rock świat', desc:'klasyka rocka', artists:['Queen','The Beatles','The Rolling Stones','Led Zeppelin','Pink Floyd','Nirvana','U2','Metallica','AC/DC','Guns N\' Roses','Red Hot Chili Peppers','Foo Fighters','Coldplay','Radiohead','The Police']},
    'pop-world':{label:'pop świat',  desc:'wielkie gwiazdy', artists:['Michael Jackson','Madonna','Whitney Houston','Mariah Carey','Britney Spears','Lady Gaga','Beyoncé','Rihanna','Taylor Swift','Justin Timberlake','Ariana Grande','Bruno Mars','Katy Perry']},
    'dance-90': {label:'eurodance',  desc:'dance lat 90', artists:['Ace of Base','La Bouche','Haddaway','2 Unlimited','Dr. Alban','Snap!','Corona','Real McCoy','Culture Beat','Scooter','Eiffel 65','Vengaboys','Aqua']},
    'hits-now': {label:'hity dziś',  desc:'współczesne', artists:['Dua Lipa','The Weeknd','Ed Sheeran','Billie Eilish','Harry Styles','Imagine Dragons','Doja Cat','Post Malone','Olivia Rodrigo','Sam Smith','SZA','Miley Cyrus'],
      // `songs` z polem `lyric` = pula pod tryb LEKTOR (czytane offline, bez sieci).
      // Fragmenty dobrane tak, by NIE zawierały tytułu. Tu demo — resztę wygenerujesz lokalnie.
      songs:[
        {title:'Shape of You', artist:'Ed Sheeran', lyric:'The club isn\'t the best place to find a lover, so the bar is where I go'},
        {title:'Blinding Lights', artist:'The Weeknd', lyric:'I\'ve been tryna call, I\'ve been on my own for long enough'},
        {title:'Bad Guy', artist:'Billie Eilish', lyric:'So you\'re a tough guy, like it really rough guy, just can\'t get enough guy'},
        {title:'Levitating', artist:'Dua Lipa', lyric:'If you wanna run away with me, I know a galaxy and I can take you for a ride'},
        {title:'Watermelon Sugar', artist:'Harry Styles', lyric:'Tastes like strawberries on a summer evening'},
      ]},
    'evergreen-pl':{label:'evergreeny PL', desc:'polskie złoto', artists:['Maryla Rodowicz','Anna Jantar','Czesław Niemen','Czerwone Gitary','Skaldowie','Krzysztof Krawczyk','Zdzisława Sośnicka','Irena Santor','Violetta Villas','Andrzej Zaucha','Wojciech Młynarski']},
    'metal':    {label:'metal',      desc:'cięższe brzmienia', artists:['Metallica','Iron Maiden','Black Sabbath','Slipknot','Rammstein','System of a Down','Behemoth','Slayer','Megadeth','Pantera','Sepultura']},
  },
};
