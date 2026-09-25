#!/usr/bin/env python3
"""
Encrypt Ayushi's photos so they can live in a public repository safely.

Why this exists: a free static host builds only from a PUBLIC repo, and these
are private photographs of a real person. Encrypting them means the repository
can be public without publishing anything, and the live page's images are
undecryptable without the answer to the lock screen question — which a lock
screen alone could not achieve, since anyone could fetch
/assets/photo/full/a01.webp directly.

Design
------
* One random 32-byte master key (K) encrypts every photo with AES-256-GCM.
* K is wrapped once per accepted answer, using a key derived from that answer
  with PBKDF2-SHA256. K itself is never written down.
* Each encrypted file is  nonce(12) || ciphertext+tag.
* assets/crypto.json holds the KDF parameters, the wrapped keys, and the file map.

Run:  python3 tools/encrypt_assets.py
Then commit assets/enc/ and assets/crypto.json.
(assets/photo/ and assets/video/ are gitignored.)
"""
import base64
import json
import os
import secrets
import sys

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("Needs the 'cryptography' package:  pip install cryptography")

PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(PROJ, "assets", "enc")
ITERS = 250_000
SALT_LEN = 16
NONCE_LEN = 12

# The answers are deliberately NOT in this file: this repo is public, and a list
# of candidate answers would make the wrapped key trivial to brute-force. They
# come from AYUSHI_ANSWERS or a git-ignored tools/.answers (one per line).
# They must match CONFIG.ANSWERS in data.js after normalisation (lowercase,
# letters only).
def load_answers():
    env = os.environ.get("AYUSHI_ANSWERS", "").strip()
    if env:
        return [a.strip() for a in env.split(",") if a.strip()]
    local = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".answers")
    if os.path.isfile(local):
        with open(local) as fh:
            return [l.strip() for l in fh if l.strip() and not l.startswith("#")]
    sys.exit("No answers supplied. Set AYUSHI_ANSWERS or create tools/.answers")


def b64(b):
    return base64.b64encode(b).decode()


def derive(answer: str, salt: bytes) -> bytes:
    """PBKDF2-SHA256, 32 bytes. Mirrors the WebCrypto call in app.js."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERS)
    return kdf.derive(answer.encode("utf-8"))


def encrypt_bytes(key: bytes, data: bytes) -> bytes:
    nonce = secrets.token_bytes(NONCE_LEN)
    return nonce + AESGCM(key).encrypt(nonce, data, None)


def main():
    # ---- collect the photos -------------------------------------------------
    jobs = []
    pdir = os.path.join(PROJ, "assets", "photo")
    for size in ("thumb", "full"):
        d = os.path.join(pdir, size)
        if not os.path.isdir(d):
            sys.exit(f"missing {d} — run the media pipeline first")
        for f in sorted(os.listdir(d)):
            if f.endswith(".webp"):
                jobs.append((f"{os.path.splitext(f)[0]}.{size}", os.path.join(d, f)))

    if not jobs:
        sys.exit("nothing to encrypt")

    # ---- master key + wrapped copies ---------------------------------------
    answers = load_answers()
    master = secrets.token_bytes(32)
    salt = secrets.token_bytes(SALT_LEN)
    wraps = []
    for a in answers:
        wkey = derive(a, salt)
        nonce = secrets.token_bytes(NONCE_LEN)
        ct = AESGCM(wkey).encrypt(nonce, master, None)
        wraps.append({"iv": b64(nonce), "ct": b64(ct)})

    # Clear the output first: a stale blob left behind by an earlier run would
    # still be served (and still be decryptable) after the photos changed.
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.endswith(".bin"):
            os.remove(os.path.join(OUT, old))

    files = {}
    total_in = total_out = 0
    for key, path in jobs:
        data = open(path, "rb").read()
        blob = encrypt_bytes(master, data)
        name = key.replace(".", "_") + ".bin"
        with open(os.path.join(OUT, name), "wb") as fh:
            fh.write(blob)
        files[key] = name
        total_in += len(data)
        total_out += len(blob)

    meta = {
        "v": 1,
        "note": ("Photographs are AES-256-GCM encrypted. The master key is wrapped once "
                 "per accepted answer with PBKDF2-SHA256; it is not stored in plaintext "
                 "anywhere."),
        "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": ITERS, "salt": b64(salt)},
        "wraps": wraps,
        "files": files,
    }
    with open(os.path.join(PROJ, "assets", "crypto.json"), "w") as fh:
        json.dump(meta, fh, indent=1)

    print(f"encrypted {len(jobs)} files  ({total_in/1e6:.1f} MB -> {total_out/1e6:.1f} MB)")
    print(f"wrapped the master key for {len(wraps)} accepted answer(s)")
    print(f"output: assets/enc/  ({len(files)} files) + assets/crypto.json")

    # ---- verify we can get them back ---------------------------------------
    ok = 0
    for key, name in files.items():
        blob = open(os.path.join(OUT, name), "rb").read()
        try:
            AESGCM(master).decrypt(blob[:NONCE_LEN], blob[NONCE_LEN:], None)
            ok += 1
        except Exception as exc:
            sys.exit(f"round-trip FAILED for {name}: {exc}")
    print(f"round-trip check: OK ({ok}/{len(files)})")


if __name__ == "__main__":
    main()
