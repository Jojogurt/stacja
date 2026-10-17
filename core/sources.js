/* core/sources.js — CZYSTE scalanie źródeł utworów (iTunes + Deezer). Zero DOM / fetch.
 * iTunes daje rok i gatunek, ale z IP Cloudflare bywa blokowany (429) — wtedy zostaje Deezer.
 * Tu: mapowanie odpowiedzi Deezera na kształt wiersza iTunes oraz stabilne scalanie list.
 * Kolejność wyników ≈ popularność (trackSelect), a Deezer `/artist/{id}/top` jest sortowany wg rank. */
import { norm } from './scoring.js';

// id gatunku Deezer → nazwa w stylu iTunes `primaryGenreName` (trafia w grupy profileGenre / genreGroup)
export const DEEZER_GENRES = {
  132:'Pop', 116:'Hip-Hop/Rap', 152:'Rock', 113:'Dance', 165:'R&B/Soul', 85:'Alternative', 106:'Electronic',
  466:'Folk', 144:'Reggae', 129:'Jazz', 98:'Classical', 173:'Soundtrack', 464:'Metal', 169:'Soul',
  153:'Blues', 197:'Latin', 84:'Country', 95:"Children's Music",
};

const str = (v) => (v == null ? '' : String(v));

// odpowiedzi Deezera → wiersze w kształcie iTunes (+ src:'deezer'). Rok i gatunek z albumu (po album.id).
// tracks: `data[]` z /artist/{id}/top lub /search; albums: `data[]` z /artist/{id}/albums (opcjonalnie).
export function deezerRows({ tracks, albums } = {}){
  const byAlbum = new Map();
  for(const a of (albums || [])){
    if(a && a.id != null) byAlbum.set(String(a.id), a);
  }
  const out = [];
  for(const t of (tracks || [])){
    if(!t || !t.preview || !t.title) continue;   // bez zajawki = bezużyteczny
    const alb = t.album || {};
    const meta = byAlbum.get(str(alb.id)) || {};
    out.push({
      trackName: str(t.title),
      artistName: str(t.artist && t.artist.name),
      collectionName: str(alb.title),
      releaseDate: str(meta.release_date),
      previewUrl: str(t.preview),
      artworkUrl100: str(alb.cover_medium || alb.cover || meta.cover_medium),
      primaryGenreName: DEEZER_GENRES[meta.genre_id] || '',
      src: 'deezer',
    });
  }
  return out;
}

// znaczniki WERSJI w tytule — „Song" ≠ „Song (Live)" ≠ „Song (Acoustic)" (trackSelect rozróżnia wersje, a norm() wycina nawiasy)
const VERSION_RE = /\b(live|acoustic|unplugged|remix|instrumental|karaoke|piano|guitar|demo|cover|tribute|extended|reprise|medley|sessions?|orchestral|a cappella)\b/g;
const verTag = (t) => [...new Set(String(t || '').toLowerCase().match(VERSION_RE) || [])].sort().join('+');
const keyOf = (r) => norm(r && r.trackName) + '|' + norm(r && r.artistName) + '|' + verTag(r && r.trackName);

// scal listy: najpierw primary (iTunes) BEZ zmian kolejności i liczby (różne wersje/albumy tego samego utworu zostają),
// potem brakujące z secondary (dedup po norm(tytuł)+norm(wykonawca)+znacznik wersji).
// Puste pola wiersza primary uzupełniamy z duplikatu secondary (np. brak gatunku). Bez mutacji wejścia.
export function mergeSources(primary, secondary){
  const dupe = new Map();   // klucz → wiersz secondary (pierwszy)
  for(const r of (secondary || [])){
    const k = keyOf(r);
    if(k !== '||' && !dupe.has(k)) dupe.set(k, r);
  }
  const seen = new Set(), out = [];
  for(const r of (primary || [])){
    const k = keyOf(r);
    seen.add(k);
    const d = dupe.get(k);
    if(d){
      const m = { ...r };
      for(const f of Object.keys(d)){
        if(f === 'src') continue;
        if(m[f] == null || m[f] === '') m[f] = d[f];
      }
      out.push(m);
    } else out.push(r);
  }
  for(const r of (secondary || [])){
    const k = keyOf(r);
    if(seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
