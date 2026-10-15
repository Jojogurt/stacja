# SPEC — format pytań quizu v2 (audyt 2026-10)

Wspólny kontrakt dla silnika oceny (`core/scoring.js`, `app/solo.js`, `core/mpReducer.js`, serwer) i danych (`data/quiz-*.json`, `questions.js`). Wsteczna zgodność: pytanie bez nowych pól działa jak dotąd.

## Pytanie

```jsonc
{
  "prompt": "Wymień trzech aktorów, którzy grali Jamesa Bonda.",
  "slots": [ {"key":"a","label":"aktor 1"}, {"key":"b","label":"aktor 2"}, {"key":"c","label":"aktor 3"} ],
  "answers": { "a": [...], "b": [...], "c": [...] },   // patrz niżej
  "pool": [                                             // OPCJONALNE — pytanie „wymień N" (sloty wymienne)
    ["Sean Connery", "Connery"],
    ["Roger Moore", "Moore"],
    ["Daniel Craig", "Craig"],
    ["Pierce Brosnan", "Brosnan"],
    ["Timothy Dalton", "Dalton"],
    ["George Lazenby", "Lazenby"]
  ],
  "difficulty": 2,                                      // OPCJONALNE — 1 łatwe / 2 średnie / 3 trudne
  "fun": "Lazenby zagrał Bonda tylko raz — w 1969.",    // OPCJONALNE — ciekawostka pokazywana w odsłonie
  "fact": "IMDb: lista aktorów 007"                     // OPCJONALNE — uzasadnienie dla weryfikacji, NIE pokazywane
}
```

### Reguły

1. **`answers[key][0]` = forma kanoniczna** (z polskimi znakami, poprawna pisownia). Odsłona pokazuje TYLKO ją; pozostałe warianty to ukryte aliasy. Warianty różniące się tylko diakrytykami/wielkością liter są zbędne (scoring normalizuje) — nie dodawać.
2. **`pool`** (pytania „wymień N z M", kolejność dowolna):
   - `pool` = lista pozycji, każda pozycja = lista aliasów tej samej odpowiedzi (`[0]` kanoniczny).
   - Sloty są wymienne. Ocena: każde pole musi pasować (textMatch) do jakiegoś aliasu pozycji z puli, a dopasowane pozycje muszą być **różne** (to samo 2× = drugie pole źle). Dopasowanie optymalne (bipartite), nie zachłanne.
   - Wsteczna zgodność: `answers[k]` dla każdego slotu = spłaszczona pula (wszystkie aliasy). Stary klient przyjmie dowolną kolejność (bez dedup).
   - Odsłona: „poprawne: Sean Connery, Roger Moore, Daniel Craig, …" (kanoniczne formy puli).
3. **Sloty uporządkowane** (bez `pool`): każdy slot pyta o INNĄ rzecz i etykieta to mówi wprost („reżyser" / „rok"). Odpowiedź żadnego slotu nie może być w treści pytania.
4. **ABCD**: w `prompt` linie `\nA) …` … `\nD) …` — **dokładnie 4** opcje. `answers.a = [litera, tekst poprawnej opcji, ...aliasy]`. Żaden alias nie może się normalizować do pojedynczej litery a–d (koliduje z wyborem innej opcji). Silnik tasuje opcje w runtime, więc pozycja w danych nie ma znaczenia, ale dystraktory muszą być z tej samej kategorii co odpowiedź, wiarygodne, i nie dłuższe/bardziej szczegółowe od poprawnej.
5. **Liczby i numeracja** („Apollo 11", „Ludwik XIV", „1989"): scoring wymaga dokładnej zgodności tokenów liczbowych/rzymskich — literówka w liczbie = źle.
6. **Zakazy**: odpowiedź (lub jej rdzeń ≥5 znaków) w treści pytania; odpowiedź jednego pytania w treści lub opcjach innego pytania tej samej paczki; pytania dziecinne/podręcznikowe bez haczyka; ten sam szablon („Jaka jest stolica…") w >10% paczki; duplikaty w obrębie i między paczkami.
7. **`desc` paczki**: `"<N> pytań"` (bez „poziom średni").

## Walidacja

`npm run lint:data` (twarde błędy + raport ostrzeżeń) — patrz `test/data.js`. Po zakończeniu naprawy paczek twarde reguły wchodzą do `npm test`.
