# BACKLOG — Drużyny i znajomi (pełny system)

> Status: **do zrobienia** (osobny etap backendowy). Zastępuje docelowo zakładkę „Liga".
> Priorytet wg użytkownika: **wyższy niż liga** — ważniejsza możliwość stworzenia drużyny
> i ekran znajomych niż ranking.

## Cel

Trwałe **drużyny** (nazwane, współdzielone między urządzeniami) i **znajomi**
(dodawanie, zaproszenia), zamiast dzisiejszych ad-hoc pokoi na kod. Gracz widzi swoją
drużynę i znajomych, zaprasza ich do meczu jednym tapnięciem, a wyniki/statystyki wiążą
się z tożsamością, nie z anonimową sesją.

## Co już jest (punkt wyjścia)

- Multiplayer = ad-hoc pokój na 4-znakowy kod + link `?room=KOD`, Supabase **Realtime**
  (broadcast+presence), host = źródło prawdy. **Zero tabel** — stan żyje tylko w trakcie meczu.
- Etap 1 (częściowo): logowanie **anonimowe** (auth.uid) + `record_match` + bazowy profil/liga.
- Tożsamość gracza dziś = anon auth.uid + ksywa w localStorage.

## Zakres (do researchu/decyzji)

### A. Znajomi
- Lista znajomych, wyszukiwanie/dodawanie (po ksywie/kodzie znajomego?), **zaproszenia**
  (wyślij / przyjmij / odrzuć), status online (presence), „ostatnio graliście".
- Ekran „Znajomi": kto online, zaproś do pokoju, historia wspólnych meczów.

### B. Drużyny
- Stworzenie **nazwanej drużyny** (nazwa + emoji/awatar), członkowie, role (kapitan/host).
- Trwałość: drużyna istnieje między meczami; statystyki drużyny; szybki start meczu „z drużyną".
- Relacja do pokoju: pokój meczowy może być **zakładany z drużyny** (auto-zaproszenie członków).

## Co wymaga (backend — Supabase)

- **Trwała tożsamość**: dziś anon auth. Decyzja: zostać przy anon + ksywa, czy wprowadzić
  logowanie (e-mail/OAuth), żeby znajomi/drużyny przetrwały reinstalację i działały
  cross-device. **To kluczowa decyzja — bez stabilnego konta znajomi tracą sens.**
- **Tabele** (szkic): `profiles(id=auth.uid, handle, avatar)`, `friendships(a,b,status)`
  lub `friend_requests(from,to,status)`, `teams(id,name,emoji,owner)`,
  `team_members(team_id,profile_id,role)`, ew. `team_invites`.
- **RLS**: kto widzi czyj profil/listę znajomych; tylko członkowie widzą drużynę; zaproszenia
  widoczne dla nadawcy/odbiorcy. Dotąd projekt był Realtime-only (klucz publishable bezpieczny,
  zero danych) — **wejście w tabele zmienia model bezpieczeństwa**, trzeba RLS od początku.
- **Realtime**: powiadomienia o zaproszeniach / statusie online (kanał per użytkownik).
- **Anty-spam / prywatność**: ograniczenie zaproszeń, blokowanie, widoczność po kodzie nie po
  zgadywaniu ksywy.

## Ekrany (UI — w stylu STACJA.dc.html)

- Zakładka w menu: **Drużyna / Znajomi** (zamiast „Liga").
- Ekran znajomych: lista + online + „zaproś do meczu" + zaproszenia oczekujące.
- Ekran drużyny: nazwa+emoji, członkowie (awatary+role), „zagraj z drużyną", staty drużyny.
- Wpięcie w istniejący flow pokoju: „stwórz pokój z drużyną" auto-zaprasza członków linkiem/push.

## Otwarte pytania (do rozstrzygnięcia przed implementacją)

1. **Konta**: zostajemy przy anon-auth, czy realne logowanie? (decyduje o trwałości znajomych)
2. Dodawanie znajomych: po **kodzie znajomego** (jak room-code) czy po ksywie + zaproszenie?
3. Drużyna = trwały byt, czy tylko „nazwa bieżącego pokoju"? (użytkownik chce trwały)
4. Czy zaproszenia push/realtime, czy na start tylko link do pokoju?
5. Zakres MVP: najpierw same drużyny (nazwa+członkowie+szybki start), znajomi później?

## Szacunek

Duży — to **nowy etap backendowy** (tabele + RLS + realtime powiadomienia + auth decyzja +
≥3 ekrany). Nie mieści się w jednej „fali" re-skinu. Sugerowany podział:
- **MVP-1**: trwałe drużyny (nazwa+emoji, członkowie z aktualnego pokoju, szybki rewanż „z drużyną").
- **MVP-2**: znajomi + zaproszenia + online.
- **MVP-3**: statystyki drużyn, integracja z ligą/rankingiem.

## Powiązania

- Zastępuje zakładkę „Liga" (deprioritetyzowana).
- Wymaga decyzji z „Etap 1/Etap 2" (auth, Durable Objects) — patrz pamięć projektu.
