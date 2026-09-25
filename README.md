# Happy Birthday, Ayushi 🎂

A small birthday page for **Ayushi Karwa**, made by her sister **Anjali**.

Static site: plain HTML/CSS/JS, no build step, no dependencies. The photographs
are encrypted, and the lock screen is what decrypts them.

## What's on it

| Section | What it is |
|---|---|
| `index.html` | The lock screen, the hero, the photographs, Anjali's note, the cake |
| `styles.css` | Warm plum/gold styling; the photo frames live here |
| `data.js` | **Everything Anjali wrote**, the lock screen question, the candle count |
| `app.js` | Behaviour: the gate, decrypting photos, the lightbox, the cake |
| `assets/photo/` | 20 photographs, WebP in `full/` (1100px) and `thumb/` (520px) — gitignored |
| `assets/enc/` | The encrypted copies that actually get published (40 files) |
| `assets/crypto.json` | KDF parameters, the wrapped key per accepted answer, the file map |
| `tools/encrypt_assets.py` | Encrypts the photos; run it after changing the media |

## The page does four things

1. **A lock screen** — one question, one right answer.
2. **A hero** — her name, and a line from her sister.
3. **Twenty photographs** — no captions, each one framed, tap to open it big.
4. **A note from Anjali**, then **a cake** whose candles you blow out.

Deliberately **not** here: no videos, no quiz, no counters, no story chapters,
and nothing written underneath the cake.

## Changing things

Almost everything is in **`data.js`**:

- `CONFIG.GATE_QUESTION` / `CONFIG.ANSWERS` — the lock screen. Answers are
  compared after lowercasing and dropping everything that isn't a letter, so
  `Anjali`, `anjali ` and `Anjali Karwa` all work.
- `CONFIG.CANDLES` — how many candles the cake has.
- `PHOTOS` — the list of photographs, in order. Add or remove ids and every
  mention of the count follows automatically.
- `NOTE` — Anjali's words, exactly as she sent them. Not one character edited.
- `COPY` — the small lines on the hero and the section headings.

## Privacy

The photographs are private, and the repository has to be public for a free
static host to build it. So the images are **AES-256-GCM encrypted** with a
random master key. That key is wrapped once per accepted answer using
PBKDF2-SHA256 (250,000 iterations) and stored in `assets/crypto.json` — which
means answering the question in the browser *is* the decryption.

- The master key is never stored in the clear anywhere.
- Fetching `assets/enc/a01_thumb.bin` directly gets you ciphertext, not a photo.
- The accepted answers are **not** in this repo — `tools/encrypt_assets.py`
  reads them from `AYUSHI_ANSWERS` or a git-ignored `tools/.answers`, because a
  published list of candidates would make the wrapped key trivial to crack.

To be honest about the limit: a short answer like this stops a casual snooper
and search engines. It is not protection against someone determined to get in.

### Re-encrypting

If the photos change, or one is removed:

```bash
python3 tools/encrypt_assets.py     # new master key, new salt, new blobs
```

It clears `assets/enc/` first, so a stale blob can't survive a re-key and stay
readable. Commit `assets/enc/` and `assets/crypto.json` afterwards.

## Running it locally

```bash
python3 -m http.server 8150 --bind 127.0.0.1
# then open http://127.0.0.1:8150/ and answer the question
```

## Deploying

Push to the repo; the host redeploys automatically. Two things worth knowing,
both learned the hard way on the sister site:

- **Set the publish path to `.`** — the host defaults to `public/`, and the
  site 404s if the files are at the repo root.
- **The edge caches every file for ~5 minutes** (`s-maxage=300`), so right after
  a deploy a visitor can get a mix of old and new files. `app.js` defends
  against this (it always fetches `crypto.json` fresh, and re-fetches a photo
  once if it fails to decrypt), but when verifying a deploy, use plain requests —
  not `?cb=` cache-busted URLs, which only prove what the origin has.
