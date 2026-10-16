#!/usr/bin/env python3
"""
gen_lektor.py — pre-generacja audio lektora (edge-tts, głosy neuronowe Microsoft) z lyrics.js.

Najlepszy jakościowo lektor: mp3 generujesz RAZ, offline, a apka odtwarza je jak zwykłe
audio (pole `tts` na utworze — app/lektor.js ma je jako priorytet nad Piperem i głosem systemowym).

Źródło: lyrics.js (window.CATEGORIES.lyrics) — czytane przez `node` (musi być w PATH).
Język GŁOSU = pole `lang` KATEGORII (domyślnie 'pl'; „polskie po angielsku" ma 'en'):
  pl → pl-PL-MarekNeural      en → en-US-AndrewNeural      (zmiana: --voice-pl / --voice-en)
Wyjście: audio/lektor/<kategoria>-<wykonawca>-<tytuł>.mp3 (slug ASCII); istniejące pliki są pomijane
(chyba że --force). Na koniec wypisuje pola `tts`, a z --write wpisuje/aktualizuje je w lyrics.js.

DECYZJA (właściciel): całości NIE generujemy do repo (~264 opisy ≈ 16 MB mp3). Do prób / pojedynczych
kategorii użyj --limit / --cat; pełna generacja dopiero po decyzji o hostingu audio.

Użycie:
  pip install edge-tts
  python3 tools/gen_lektor.py --cat tlum-pl --limit 3          # 3 pierwsze opisy kategorii → mp3 + pola tts (wypis)
  python3 tools/gen_lektor.py --cat tlum-pl --limit 3 --write  # j.w. + wpisz `tts` do lyrics.js
  python3 tools/gen_lektor.py --dry-run                        # tylko plan: plik, głos, język (bez sieci/edge-tts)

Opcje: --limit N (maks. N NOWYCH plików), --cat KLUCZ (powtarzalne), --force, --write, --dry-run,
       --voice-pl NAZWA, --voice-en NAZWA, --lyrics ŚCIEŻKA (domyślnie lyrics.js w katalogu repo).
Dobre głosy: pl-PL-MarekNeural / pl-PL-ZofiaNeural; en-US-AndrewNeural / en-US-AvaNeural / en-GB-RyanNeural.
"""
import argparse, asyncio, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = "audio/lektor"                        # względem katalogu repo (i URL-a strony)
VOICES = {"pl": "pl-PL-MarekNeural", "en": "en-US-AndrewNeural"}

def slug(s):
    s = str(s or "").lower().strip()
    for a, b in zip("ąćęłńóśżź", "acelnoszz"):
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"

def lang_of(cat):
    l = str(cat.get("lang") or "").strip().lower()
    return "en" if l == "en" or l.startswith("en-") or l.startswith("en_") else "pl"

def load_lyrics(path):
    """lyrics.js → dict kategorii (wykonanie przez node z atrapą `window`)."""
    js = ("const fs=require('fs');const window={};globalThis.window=window;"
          "eval(fs.readFileSync(process.argv[1],'utf8'));"
          "process.stdout.write(JSON.stringify(window.CATEGORIES.lyrics||{}));")
    out = subprocess.run(["node", "-e", js, path], check=True, capture_output=True, text=True).stdout
    return json.loads(out)

def plan(cats, only):
    for key, cat in cats.items():
        if only and key not in only:
            continue
        lang = lang_of(cat)
        for s in cat.get("songs") or []:
            if not s.get("lyric"):
                continue
            name = f"{slug(key)}-{slug(s.get('artist'))}-{slug(s.get('title'))}.mp3"
            yield key, lang, s, f"{OUT_DIR}/{name}"

# ---- wpisanie `tts` do lyrics.js: obiekt utworu znajdowany po kategorii + tytule, skaner świadomy stringów JS ----
def _string_end(src, i):
    q = src[i]; i += 1
    while i < len(src):
        if src[i] == "\\": i += 2; continue
        if src[i] == q: return i
        i += 1
    raise ValueError("niezamknięty string")

def _object_end(src, i):
    depth = 0
    while i < len(src):
        c = src[i]
        if c in "'\"`": i = _string_end(src, i)
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: return i
        i += 1
    raise ValueError("niezamknięty obiekt")

def js_str(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

def write_tts(path, entries):
    src = open(path, encoding="utf-8").read()
    done = 0
    for key, title, tts in entries:
        m = re.search(r"(['\"])" + re.escape(key) + r"\1\s*:\s*\{", src)
        if not m: print(f"!! brak kategorii {key} w lyrics.js", file=sys.stderr); continue
        cat_end = _object_end(src, m.end() - 1)
        t = re.compile(r"\{\s*title\s*:\s*" + re.escape(js_str(title)))
        sm = t.search(src, m.end(), cat_end)
        if not sm: print(f"!! brak utworu „{title}” w {key}", file=sys.stderr); continue
        o_start, o_end = sm.start(), _object_end(src, sm.start())
        obj = src[o_start:o_end + 1]
        if re.search(r"\btts\s*:", obj):
            obj2 = re.sub(r"(\btts\s*:\s*)(['\"])(?:\\.|(?!\2).)*\2", lambda mm: mm.group(1) + js_str(tts), obj, count=1)
        else:
            obj2 = obj[:-1].rstrip() + ", tts: " + js_str(tts) + " }"
        src = src[:o_start] + obj2 + src[o_end + 1:]
        done += 1
    open(path, "w", encoding="utf-8").write(src)
    return done

async def gen(text, voice, path):
    import edge_tts                                   # import dopiero tu: --dry-run działa bez pakietu
    await edge_tts.Communicate(text, voice).save(path)

async def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--lyrics", default=os.path.join(ROOT, "lyrics.js"))
    ap.add_argument("--limit", type=int, default=0, help="maks. liczba NOWYCH plików (0 = bez limitu)")
    ap.add_argument("--cat", action="append", default=[], help="tylko ta kategoria (powtarzalne)")
    ap.add_argument("--force", action="store_true", help="nadpisz istniejące mp3")
    ap.add_argument("--write", action="store_true", help="wpisz pola `tts` do lyrics.js")
    ap.add_argument("--dry-run", action="store_true", help="tylko wypisz plan")
    ap.add_argument("--voice-pl", default=VOICES["pl"]); ap.add_argument("--voice-en", default=VOICES["en"])
    a = ap.parse_args()
    voices = {"pl": a.voice_pl, "en": a.voice_en}
    cats = load_lyrics(a.lyrics)
    made, entries = 0, []
    for key, lang, s, rel in plan(cats, set(a.cat)):
        path = os.path.join(ROOT, rel)
        exists = os.path.exists(path)
        if not exists or a.force:
            if a.limit and made >= a.limit:
                continue
            if a.dry_run:
                print(f"[plan] {rel}  ({lang}, {voices[lang]})")
            else:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                await gen(s["lyric"], voices[lang], path)
                print(f"[ok]   {rel}  ({lang}, {voices[lang]})")
            made += 1
            if a.dry_run: continue
        if os.path.exists(path):
            entries.append((key, s["title"], rel))
    print(f"\n// {'zaplanowano' if a.dry_run else 'wygenerowano'} {made} plików; pola tts ({len(entries)}):")
    for key, title, rel in entries:
        print(f"//   [{key}] {title} → tts: '{rel}'")
    if a.write and entries and not a.dry_run:
        n = write_tts(a.lyrics, entries)
        print(f"// lyrics.js: wpisano/zaktualizowano {n} pól tts")

if __name__ == "__main__":
    asyncio.run(main())
