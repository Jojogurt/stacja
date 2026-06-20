/* ports/TrackRepository.js — KONTRAKT źródła utworów (interfejs).
 *
 * Chowa iTunes / Deezer / proxy / playlisty za jednym wywołaniem. Solo i host
 * MP proszą o utwór tak samo; podmiana źródła (np. na natywie bez CORS —
 * prosto w iTunes/Deezer) to wymiana adaptera, nie zmiana logiki gry.
 *
 * @typedef {Object} Track
 * @property {string} track   tytuł
 * @property {string} artist  wykonawca
 * @property {string} year    rok (YYYY) lub ''
 * @property {string} album   album lub ''
 * @property {string} preview URL zajawki audio
 * @property {string} art     URL okładki (300×300) lub ''
 *
 * @typedef {Object} ResolveError
 * @property {true} error
 * @property {'offline'|'empty'} reason  brak sieci vs brak pasujących zajawek
 *
 * @typedef {Object} TrackRepository
 * @property {(opts:{cat:object, seen:Set<string>, recent?:string[], cfg:object}) => Promise<Track|ResolveError>} resolveTrack
 *           rozwiąż grywalny utwór dla kategorii; `seen`/`recent` to anty-powtórki (mutowane)
 *
 * Web-owa implementacja: adapters-web/itunesRepository.js
 */
export {};
