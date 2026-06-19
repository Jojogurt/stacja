#!/usr/bin/env python3
"""
gen_lektor.py — pre-generacja audio lektora (edge-tts, Microsoft neural pl-PL).

Najlepszy jakościowo lektor: generujesz mp3 RAZ, offline, a apka odtwarza je
jak zwykłe audio (zero kosztu u graczy, działa wszędzie).

Wejście: JSON — lista piosenek z fragmentem tekstu:
  [
    {"title": "Kombinacja", "artist": "Maanam", "lyric": "fragment tekstu do przeczytania"},
    ...
  ]

Użycie:
  pip install edge-tts
  python3 tools/gen_lektor.py lektor_songs.json
  # -> tworzy audio/<artist>-<title>.mp3
  # -> wypisuje gotowe pola `tts` do wklejenia w categories.js (songs[].tts)

Dobre głosy pl-PL: pl-PL-MarekNeural (męski), pl-PL-ZofiaNeural (żeński).
"""
import asyncio, json, re, sys, os
import edge_tts

VOICE = "pl-PL-MarekNeural"   # zmień na ZofiaNeural dla głosu żeńskiego
OUT_DIR = "audio"

def slug(s):
    s = s.lower().strip()
    s = (s.replace("ą","a").replace("ć","c").replace("ę","e").replace("ł","l")
           .replace("ń","n").replace("ó","o").replace("ś","s").replace("ż","z").replace("ź","z"))
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

async def gen(text, path):
    await edge_tts.Communicate(text, VOICE).save(path)

async def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "lektor_songs.json"
    songs = json.load(open(src, encoding="utf-8"))
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"// wygenerowano {len(songs)} plików — wklej pola tts do songs[] w categories.js\n")
    for s in songs:
        name = f"{slug(s['artist'])}-{slug(s['title'])}.mp3"
        path = os.path.join(OUT_DIR, name)
        await gen(s["lyric"], path)
        print(f'{{title:"{s["title"]}", artist:"{s["artist"]}", '
              f'lyric:"{s["lyric"]}", tts:"{OUT_DIR}/{name}"}},')

if __name__ == "__main__":
    asyncio.run(main())
