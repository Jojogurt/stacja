# stacja-rooms — autorytet pokoju (Etap 2)

Cloudflare Worker + Durable Object jako **autorytet pokoju w czasie rzeczywistym**.
Zdejmuje autorytet z telefonu hosta (koniec z „host pada = mecz pada") i daje
**sprawiedliwy buzzer** (jeden serwer stempluje kolejność „kto pierwszy").

> **Status: SZKIELET, NIEPODPIĘTY.** Produkcja dalej działa na Supabase Realtime
> (host-authority). Te pliki nic nie zmieniają w obecnej rozgrywce. Aktywacja to
> osobny, ostrożny krok — patrz „Migracja" niżej.

## Co już jest
- `gameRoom.js` — Durable Object; trzyma stan, odpala **ten sam `core/mpReducer.js`** co web,
  obsługuje akcje gracza (vote/propose/sure/unpropose), przekazuje emotki/czat, liczy obecność.
- `index.js` — routing Workera do pokoju po kodzie.
- `wrangler.toml` — config deployu (DO na SQLite = darmowy plan).
- `../adapters-web/partyTransport.js` — klient (partysocket) realizujący `ports/RealtimeTransport.js`.

## Czego brakuje (TODO — orkiestracja hosta, do doportowania z app.js)
- losowanie utworu na serwerze (na natywie/serwerze **bez CORS** → wprost iTunes/Deezer; proxy znika),
- faza gotowości (`mpArm`/`mpGo`), buzzer „kto pierwszy",
- zatwierdzanie odpowiedzi (`evaluateAnswer`), następne pytanie (`matchAdvance`), koniec,
- zapis wyniku z DO przez `record_match` (service key jako sekret Workera).

## Wymagania
- Konto **Cloudflare** (darmowe; DO-SQLite na free planie, hibernacja = realnie $0).
- Nic poza tym. Brak osobnego konta „PartyKit".

## Deploy
```bash
cd server
npm install
npx wrangler login          # OAuth w przeglądarce
npx wrangler deploy         # → https://stacja-rooms.<konto>.workers.dev
# gdy DO będzie pisać do bazy:
# npx wrangler secret put SUPABASE_SERVICE_KEY
```

## Migracja (jak aktywować BEZ psucia rozgrywki)
1. Dodaj `roomsHost` do `config.js` (adres workers.dev).
2. W `app.js` wymień warstwę transportu MP na `ports/RealtimeTransport`:
   - dziś: `mpCh.send(...)` / `mpCh.on('broadcast', ...)` rozsiane po `mp*`.
   - docelowo: jeden `transport` (Supabase albo Party) za portem; `mpSend`→`transport.send`,
     `mpAfterSync` z `transport.onState`.
3. Zostaw adapter Supabase jako drugą implementację portu → przełącznik (flaga) pozwala
   wrócić, gdyby coś nie grało. Migruj jeden pokój testowy, potem reszta.
4. Dopiero gdy działa — przenoś orkiestrację hosta z `app.js` do `gameRoom.js`
   (reducer już tam jest; dochodzi losowanie utworu, arming, lock, next).

Rdzeń (`core/`) jest współdzielony web↔serwer, więc to przenosiny logiki, nie przepisywanie.
