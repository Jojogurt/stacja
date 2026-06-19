/* ============================================================
   lyrics.js — kategoria „teksty / tłumaczenia" do trybu LEKTOR
   ------------------------------------------------------------
   Twist: polski hit OPISANY po angielsku, a światowy po polsku —
   zgadujesz oryginalny tytuł i wykonawcę. Tekst leci na głos
   (lektor) ORAZ na ekranie.

   UWAGA o treści: pole `lyric` to NIE są dosłowne (przetłumaczone)
   teksty piosenek — to autorskie, własnymi słowami WSKAZÓWKI/opisy
   tematu utworu (żeby nie kopiować chronionych tekstów). Jeśli chcesz
   prawdziwe przetłumaczone fragmenty, podmień `lyric` lokalnie w tym
   pliku (offline) — reszta gry zadziała tak samo.

   Format kategorii (jak w categories.js): kind:'lyrics' + songs[].
   Brak `preview`/`artists` — kategoria gra TYLKO w trybie lektor.
   ============================================================ */
window.CATEGORIES = window.CATEGORIES || {};
window.CATEGORIES.lyrics = {

  'tlum-int': {
    label: 'światowe po polsku', desc: 'opis po PL — zgadnij', kind: 'lyrics',
    songs: [
      { title: 'Bohemian Rhapsody', artist: 'Queen', year: '1975',
        lyric: 'Operowa epopeja w kilku częściach: chłopak wyznaje, że właśnie zabił człowieka, błaga matkę o wybaczenie, a chór przywołuje imię diabelskiego błazna.' },
      { title: 'Africa', artist: 'Toto', year: '1982',
        lyric: 'Tęsknota za odległym kontynentem — deszcze nad sawanną, samotne Kilimandżaro i błogosławieństwo dla całej Afryki.' },
      { title: 'Dancing Queen', artist: 'ABBA', year: '1976',
        lyric: 'Siedemnastolatka, królowa parkietu, w piątkowy wieczór tańczy w rytm tamburynu i czuje, że to jej noc.' },
      { title: 'Billie Jean', artist: 'Michael Jackson', year: '1982',
        lyric: 'Mężczyzna gorączkowo zaprzecza, że jest ojcem dziecka kobiety, która twierdzi coś przeciwnego.' },
      { title: 'Smells Like Teen Spirit', artist: 'Nirvana', year: '1991',
        lyric: 'Grunge’owy hymn znudzonego, zbuntowanego pokolenia — ironiczne zaproszenie i poczucie, że „mniej znaczy więcej”.' },
      { title: 'Hotel California', artist: 'Eagles', year: '1977',
        lyric: 'Zmęczony podróżny trafia nocą do luksusowego hotelu, z którego — jak się okazuje — nigdy nie da się wymeldować.' },
      { title: 'Eye of the Tiger', artist: 'Survivor', year: '1982',
        lyric: 'Hymn boksera wracającego na ring: instynkt drapieżnika, wola walki i nieustępliwość wobec rywala.' },
      { title: 'Livin’ on a Prayer', artist: 'Bon Jovi', year: '1986',
        lyric: 'Robotnicza para — on stracił pracę na bocznicy, ona haruje w barze — trzyma się miłości i nadziei mimo biedy.' },
      { title: 'Take On Me', artist: 'a-ha', year: '1985',
        lyric: 'Synthpopowa, błagalna prośba, żeby spróbować być razem — kojarzona z teledyskiem rysowanym ołówkiem.' },
      { title: 'Someone Like You', artist: 'Adele', year: '2011',
        lyric: 'Była dziewczyna odwiedza dawną miłość, życzy mu szczęścia z inną i obiecuje, że znajdzie kogoś takiego jak on.' }
    ]
  },

  'tlum-pl': {
    label: 'polskie po angielsku', desc: 'clue in EN — guess', kind: 'lyrics',
    songs: [
      { title: 'Dziwny jest ten świat', artist: 'Czesław Niemen', year: '1967',
        lyric: 'A solemn 1960s protest: the world is strange and full of cruelty, yet the singer still believes people can drive evil away.' },
      { title: 'Jolka, Jolka pamiętasz', artist: 'Budka Suflera', year: '1981',
        lyric: 'A man looks back on secret meetings with a woman in a rented room during grim, grey times.' },
      { title: 'Biała flaga', artist: 'Republika', year: '1981',
        lyric: 'A new-wave anthem about raising a white flag — choosing surrender in love instead of an endless fight.' },
      { title: 'Kolorowe jarmarki', artist: 'Maryla Rodowicz', year: '1977',
        lyric: 'Warm nostalgia for colourful village fairs, balloons and carousels of years long gone.' },
      { title: 'Autobiografia', artist: 'Perfect', year: '1981',
        lyric: 'A whole generation’s memoir set to a birth year of 1960, growing up alongside rock and roll.' },
      { title: 'Słodkiego miłego życia', artist: 'Kombi', year: '1984',
        lyric: 'An ironic toast wishing a sweet, pleasant life while time keeps slipping away.' },
      { title: 'Baśka', artist: 'Wilki', year: '1992',
        lyric: 'A guy proudly brags that his girl has something special that no other woman has.' },
      { title: 'Nic nie może wiecznie trwać', artist: 'Anna Jantar', year: '1977',
        lyric: 'A bittersweet pop reminder that nothing in life can last forever.' },
      { title: 'Mniej niż zero', artist: 'Lady Pank', year: '1983',
        lyric: 'A sharp jab at an empty tabloid celebrity who, in the singer’s eyes, is worth less than zero.' },
      { title: 'Kombinacja', artist: 'Maanam', year: '1985',
        lyric: 'A restless, danceable warning about a tricky scheme and a person you shouldn’t fully trust.' }
    ]
  }

};
