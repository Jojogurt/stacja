# STACJA — brief projektowy (dla designera / Claude design)

## Krótki opis (kontekst)

**STACJA** to mobilny, webowy **trener muzycznego pubquizu**. Grupa znajomych chodzi na
muzyczne pubquizy (typu *Spin the Beat* / PubQuiz.pl) i używa appki, żeby ćwiczyć między
spotkaniami **albo grać razem** w wersji drużynowej.

Rdzeń gry: leci **30-sekundowa zajawka utworu** (z iTunes/Deezer) — zgadujesz
**tytuł + wykonawcę**. Do tego warianty utrudniające (od tyłu, fragment, lektor czytający
tekst) i tryb wieloosobowy „co-op", gdzie cała drużyna wspólnie składa odpowiedź.

- **Platforma:** single-page web (czysty HTML/JS), **mobile-first**, max szer. ~520px,
  działa w przeglądarce telefonu.
- **Dwa konteksty użycia:** *Solo* (trening, własne tempo) i *Ze znajomymi* (mecz w pokoju,
  real-time).
- **Duch produktu:** luźny, grupowy, „przy stole w pubie". Emotki i krótkie wiadomości są
  **rdzeniem**, nie dodatkiem. Estetyka **Duolingo** — przyjazna, „chunky", kolorowa.

## Istniejący design system (do uszanowania / rozwinięcia)

- Font **Nunito** (600–900).
- Kolory: **zielony** `#58CC02` (primary/poprawne), **niebieski** `#1CB0F6`
  (multiplayer/info), **złoty** `#FFC800` (pewniak/seria/playlisty), **czerwony** `#FF4B4B`
  (błąd/timer), **fiolet** `#CE82FF` (los/niepewność). Powierzchnie białe, tekst `#3C3C3C`,
  linie `#E5E5E5`.
- Wzorce: białe karty z ramką 2px, przyciski 3D (`box-shadow` jako „grubość", wciskają się
  przy tapnięciu), pigułki/ticki z grubszą dolną krawędzią.

---

## Lista featureów (stan obecny)

### 1. Wejście / nawigacja
- Landing z wyborem: 🎧 **Solo** / 👥 **Ze znajomymi** + 🏆 Liga / 👤 Profil.
- Globalny powrót „← menu".

### 2. Format meczu (solo i MP)
- Mecz = **R rund × 3 kategorie × 5 pytań** (rundy regulowane 1–4).
- Ekran **„ułóż mecz"**: wybór puli **kategorii** + puli **trybów** + liczby rund;
  przycisk 🎲 „Losuj".

### 3. Tryby pytań (jak słyszysz utwór)
- ♪ **Muzyka** (zwykła zajawka), 🔄 **Od tyłu** (audio odwrócone), ✂️ **Fragment** (2 s),
  🗣 **Lektor** (TTS czyta tekst/wskazówkę zamiast muzyki).

### 4. Kategorie / treści
- **Dekady**, **Style i gatunki**, **Gotowe playlisty** (charty gatunkowe),
  **Teksty** (kategorie do trybu lektor), **Twoje playlisty** (import ze Spotify, zapis lokalny).

### 5. Odpowiadanie i ocena
- Pola: **tytuł + wykonawca** (+ bonus rok/album w solo).
- Dopasowanie tolerancyjne: literówki (Levenshtein), diakrytyki, leetspeak
  (`PRO8L3M`=problem), rok ±2.

### 6. Multiplayer „co-op" (drużyna kontra komputer)
- Pokój z **4-znakowym kodem** + link `?room=`; host = źródło prawdy (real-time, Supabase).
- **Model odpowiedzi = sloty:** odpowiedź to N pól (dziś tytuł/wykonawca; w planach np.
  3 słowa). **Głos osobno na każdy slot**; odpowiedź drużyny = górka głosów w każdym slocie
  (miks najlepszych pól od różnych osób).
- **3 poziomy pewności per typ:** *zwykła* / *niepewny* (fiolet) / **pewniak** (złoto,
  ×2 punkty albo kara „stawia kolejkę").
- **Fazy rundy:** 🎧 *słuchaj* (audio + poziomy pasek odliczania czasu fazy) →
  🧠 *kombinujcie* (typowanie/głosowanie) → 👁 *odsłona* (wynik). Audio dostępne TYLKO
  w fazie słuchania.
- **Dwie skórki fazy kombinowania** (A/B, wybór per gracz): **kolumny** (głosowanie
  w kolumnach) i **czat** (strumień z composerem `@odp` — jedno pole: `@` → typ, tekst → czat).
- **Pasek osób (roster) ze stanem na żywo:** myśli · pisze… · wrzucił · niepewny · pewniak ·
  pas — na każdym ekranie gry.
- **Social:** emotki-reakcje (floatują z ksywą), krótkie wiadomości / feed czatu,
  przycisk **„pas"**.
- Timer rundy (off/30/60/90 s), faza gotowości (równy start u wszystkich),
  auto-zatwierdzenie po czasie.
- **Ekran wyniku:** punkty drużyny, MVP stołu, kto „stawia 🍺" (przepalone pewniaki).

### 7. Profil i Liga
- Profil: ksywa + statystyki. Liga: ranking. (Backend: logowanie anonimowe, zapis meczu.)

### 8. Jakość lektora (TTS)
- Kolejność: pre-generowane mp3 → Piper w przeglądarce → systemowy `speechSynthesis`
  (fallback).

---

## Priorytety dla designu

- **Ekran gry MP jest sercem** i historycznie był chaotyczny — porządkujemy go fazami
  i jasnym „co teraz".
- **Grupowość**: roster ze stanem, emotki i czat mają być widoczne i żywe.
- **Mobile-first**, kciukowo (akcje na dole), jeden rząd na sekcję.
- Dwie skórki (kolumny/czat) renderują **ten sam stan** — design powinien działać dla obu
  nad wspólnym modelem. Wspólne sekcje ekranu gry:
  **nagłówek** (runda · drużyna · timer / kategoria · tryb) → **rail faz** (słuchaj →
  kombinujcie → odsłona) → **roster** → **sekcja pewności** (zwykła/niepewny/pewniak/pas) →
  **sekcja odpowiedzi** (kolumny + odpowiedź drużyny + zatwierdź u hosta) →
  **sekcja emotek**.
