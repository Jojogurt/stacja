/* ports/RealtimeTransport.js — KONTRAKT transportu real-time (interfejs).
 *
 * app.js (MP) zależy TYLKO od tego kontraktu, nigdy od konkretu. Dziś rozgrywkę
 * wozi Supabase Realtime (host-authority). W Etapie 2 ten sam kontrakt realizuje
 * `adapters-web/partyTransport.js` (Durable Object jako autorytet pokoju), a na
 * natywie — natywny WebSocket. Protokół to plain WebSocket + JSON, więc adapter
 * jest wymienny, a serwer (Twój `core/mpReducer.js`) zostaje ten sam.
 *
 * @typedef {Object} Me  { id: string, name: string }   // id = auth.uid
 *
 * @typedef {Object} RealtimeTransport
 * @property {(roomCode:string, me:Me) => Promise<void>} join     dołącz/utwórz pokój
 * @property {(action:object) => void} send                       wyślij akcję gracza (vote/propose/sure/buzz…)
 * @property {(cb:(state:object)=>void) => void} onState          autorytatywny stan gry od serwera
 * @property {(cb:(event:object)=>void) => void} onEvent          ulotne zdarzenia (emotki/wiadomości/obecność)
 * @property {() => void} leave                                   opuść pokój i posprzątaj
 *
 * Implementacje:
 *   - adapters-web/partyTransport.js     (Etap 2 — Durable Object + partysocket)
 *   - [do zrobienia przy migracji] supabaseTransport — owija obecny kanał Realtime,
 *     żeby przełączenie transportu było zmianą jednej linii, nie logiki gry.
 */
export {};
