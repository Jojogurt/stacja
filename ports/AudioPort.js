/* ports/AudioPort.js — KONTRAKT odtwarzania (interfejs, nie implementacja).
 *
 * Rdzeń i UI zależą od tego kontraktu, nie od konkretu (HTMLAudioElement /
 * Web Audio / AVFoundation / ExoPlayer). Na natywie podmieniasz tylko adapter.
 *
 * @typedef {Object} ReverseHandle
 * @property {boolean} ok        czy udało się odtworzyć „od tyłu"
 * @property {boolean} aborted   true, gdy runda zmieniła się w trakcie dekodowania (cisza, bez fallbacku)
 * @property {() => void} [stop]  zatrzymaj odtwarzanie i sprzątnij (tylko gdy ok)
 *
 * @typedef {Object} AudioPort
 * @property {(url:string, cfg:object) => Promise<ArrayBuffer>} fetchBytes
 *           pobierz bajty zajawki (z fallbackiem proxy gdy brak CORS)
 * @property {(ctx:AudioContext, url:string, opts:object) => Promise<ReverseHandle>} playReverse
 *           zdekoduj + odtwórz odwróconą zajawkę; opts: {cfg, onProgress, onEnded, shouldPlay}
 *
 * Web-owa implementacja: adapters-web/webAudio.js
 */
export {};
