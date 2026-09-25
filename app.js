/* ============================================================================
   Ayushi's birthday page — behaviour.
   The photos are encrypted (AES-256-GCM); the lock screen IS the decryption.
   The crypto core is shared with Anjali's page, including three fixes that
   site taught us the hard way — see the notes on verifyKey, loadMeta and the
   retry inside assetURL.
   ============================================================================ */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ CRYPTO */
  const ASSET_CACHE = new Map();
  const subtle = (window.crypto && window.crypto.subtle) || null;
  let META = null, MASTER = null;

  const b64ToBytes = (s) => {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const b64FromBytes = (b) => {
    let s = "";
    const u = new Uint8Array(b);
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  };
  const mimeFor = (key) => "image/webp";

  /* A remembered key is proven by decrypting one real photo before it is
     trusted. importKey() accepts ANY 32 bytes as a valid AES key, so a key
     saved before the photos were last re-encrypted would unlock the page and
     then fail on every image — a blank page with no visible error. */
  const verifyKey = () =>
    Object.keys(META.files).find((k) => k.endsWith(".thumb")) || Object.keys(META.files)[0];

  async function loadMeta() {
    // Always fresh: the host's edge cache holds each file for minutes, and a
    // crypto.json from before a re-encryption cannot open photos from after it.
    const res = await fetch("assets/crypto.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("cannot load assets/crypto.json");
    return (META = await res.json());
  }

  async function deriveKek(password) {
    const base = await subtle.importKey(
      "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return subtle.deriveKey(
      { name: "PBKDF2", salt: b64ToBytes(META.kdf.salt),
        iterations: META.kdf.iterations, hash: META.kdf.hash },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }

  /* There is no separate answer check: if the unwrap decrypts, the answer was
     right. AES-GCM authenticates it, so a wrong answer cannot pass. */
  async function unlockWith(answer) {
    if (!subtle || !META) return null;
    const kek = await deriveKek(answer);
    for (const w of META.wraps) {
      try {
        const raw = await subtle.decrypt(
          { name: "AES-GCM", iv: b64ToBytes(w.iv) }, kek, b64ToBytes(w.ct));
        return { key: await subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]), raw };
      } catch (e) { /* not this answer — try the next */ }
    }
    return null;
  }

  const importMaster = (rawB64) =>
    subtle.importKey("raw", b64ToBytes(rawB64), "AES-GCM", false, ["decrypt"]);

  function assetURL(key) {
    if (ASSET_CACHE.has(key)) return ASSET_CACHE.get(key);
    const job = (async () => {
      const name = META && META.files[key];
      if (!name) throw new Error("unknown asset: " + key);

      const grab = async (fresh) => {
        const url = "assets/enc/" + name +
          (fresh ? "?r=" + Math.random().toString(36).slice(2) : "");
        const res = await fetch(url, fresh ? { cache: "no-store" } : undefined);
        if (!res.ok) throw new Error("fetch failed: " + name);
        return new Uint8Array(await res.arrayBuffer());
      };
      const open = async (buf) => URL.createObjectURL(new Blob(
        [await subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) },
          MASTER, buf.subarray(12))], { type: mimeFor(key) }));

      try {
        return await open(await grab(false));
      } catch (e) {
        // The edge cache can still serve the previous version of a file for a
        // few minutes after a deploy. One forced refetch settles that; if it
        // fails again, the key really is wrong and the caller reports it.
        return await open(await grab(true));
      }
    })();
    ASSET_CACHE.set(key, job);
    job.catch(() => ASSET_CACHE.delete(key));
    return job;
  }

  async function hydrate(root) {
    const nodes = $$("[data-asset]", root || document);
    await Promise.all(nodes.map(async (n) => {
      const key = n.dataset.asset;
      try { n.src = await assetURL(key); }
      catch (e) { console.warn("photo failed:", key, e && e.message); }
      delete n.dataset.asset;
    }));
  }

  /* ------------------------------------------------------------------- PETALS */
  const petals = (canvas, count) => {
    if (!canvas || reduced) return { start() {} };
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, items = [], running = false;
    const resize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    const make = () => ({
      x: Math.random() * w, y: Math.random() * -h, r: 3 + Math.random() * 5,
      s: 0.3 + Math.random() * 0.7, a: 0.25 + Math.random() * 0.4,
      rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.02,
      hue: Math.random() < 0.5 ? "233,178,110" : "226,150,170",
    });
    const draw = () => {
      canvas.width = w; canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      if (items.length < count) items.push(make());
      for (const p of items) {
        p.y += p.s; p.rot += p.spin;
        if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = `rgba(${p.hue},${p.a})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      requestAnimationFrame(draw);
    };
    resize();
    addEventListener("resize", resize, { passive: true });
    // idempotent: calling start() again must not stack another animation loop
    return { start() { if (running) return; running = true; resize(); requestAnimationFrame(draw); } };
  };

  /* --------------------------------------------------------------------- GATE */
  function initGate() {
    const gate = $("#gate"), input = $("#gateInput"), err = $("#gateError"),
          form = $("#gateForm"), hint = $("#gateHint"), btn = $("#gateForm button");

    $("#gateName").textContent = CONFIG.her;
    hint.textContent = CONFIG.GATE_QUESTION;
    input.placeholder = CONFIG.GATE_PLACEHOLDER;

    if (!subtle) {
      err.textContent = "This browser can't open the photos. Try Chrome or Safari.";
      return;
    }

    const reveal = () => {
      gate.classList.add("gate--out");
      document.body.classList.remove("locked");
      setTimeout(() => {
        gate.hidden = true;
        $("#site").hidden = false;
        startSite();
      }, 650);
    };
    const fail = (msg) => {
      err.textContent = msg;
      gate.classList.remove("gate--shake");
      void gate.offsetWidth;
      gate.classList.add("gate--shake");
      if (input) input.select();
    };

    /* The answer is forgiving on purpose: lowercase, and everything that isn't
       a letter dropped, so "Anjali", "anjali " and "Anjali Karwa" all pass. */
    const normalise = (s) => (s || "").toLowerCase().replace(/[^a-z]/g, "");

    (async () => {
      try { await loadMeta(); }
      catch (e) { fail("Couldn't load the page's security data — check your connection and reload."); return; }

      let saved = null;
      try { saved = sessionStorage.getItem("ayushi-key"); } catch (e) {}
      if (saved) {
        try {
          MASTER = await importMaster(saved);
          await assetURL(verifyKey());       // prove it, don't assume it
          gate.hidden = true;
          document.body.classList.remove("locked");
          $("#site").hidden = false;
          startSite();
          return;
        } catch (e) {
          MASTER = null;
          try { sessionStorage.removeItem("ayushi-key"); } catch (e2) {}
        }
      }

      document.body.classList.add("locked");
      gateFX.start(26);
      setTimeout(() => input && input.focus(), 450);
    })();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const typed = normalise(input.value);
      if (!typed) return;
      if (btn) { btn.disabled = true; btn.textContent = "checking…"; }
      err.textContent = "";

      let got = null;
      try { got = await unlockWith(typed); } catch (e2) { got = null; }
      if (btn) { btn.disabled = false; btn.textContent = "Unlock"; }

      if (!got) { fail(CONFIG.GATE_WRONG); return; }

      MASTER = got.key;
      try { sessionStorage.setItem("ayushi-key", b64FromBytes(got.raw)); } catch (e2) {}
      reveal();
    });
  }

  /* --------------------------------------------------------------------- HERO */
  function initHero() {
    $("#heroName").textContent = CONFIG.her;
    $("#heroEyebrow").textContent = COPY.heroEyebrow;
    $("#heroSub").textContent = COPY.heroSub;
    $("#heroFrom").textContent = `— ${CONFIG.from}`;
    heroFX.start();
  }

  /* ----------------------------------------------------------------- GALLERY */
  const visible = PHOTOS.slice();

  function initGallery() {
    $("#galleryTitle").textContent = COPY.galleryTitle;
    $("#galleryNote").textContent = COPY.galleryNote;

    $("#frames").innerHTML = visible.map((id, i) => `
      <figure class="frame reveal" data-i="${i}" data-open="${id}">
        <div class="frame__mount">
          <img data-asset="${id}.thumb" alt="Ayushi, photograph ${i + 1}" decoding="async">
        </div>
      </figure>`).join("");

    hydrate($("#frames"));
    initLightbox();
    initReveal();
  }

  /* ---------------------------------------------------------------- LIGHTBOX */
  let lbIndex = 0;

  function paintLightbox() {
    const id = visible[lbIndex];
    assetURL(id + ".full")
      .then((u) => { $("#lightboxImg").src = u; })
      .catch(() => { assetURL(id + ".thumb").then((u) => { $("#lightboxImg").src = u; }); });
    $("#lightboxImg").alt = `Ayushi, photograph ${lbIndex + 1}`;
  }

  function openLightbox(i) {
    lbIndex = i;
    paintLightbox();
    $("#lightbox").hidden = false;
    document.body.classList.add("no-scroll");
  }
  const closeLightbox = () => {
    $("#lightbox").hidden = true;
    $("#lightboxImg").src = "";
    document.body.classList.remove("no-scroll");
  };
  const step = (d) => {
    lbIndex = (lbIndex + d + visible.length) % visible.length;
    paintLightbox();
  };

  function initLightbox() {
    $("#frames").addEventListener("click", (e) => {
      const f = e.target.closest("[data-open]");
      if (f) openLightbox(+f.dataset.i);
    });
    $("#lightboxClose").addEventListener("click", closeLightbox);
    $("#lightboxPrev").addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
    $("#lightboxNext").addEventListener("click", (e) => { e.stopPropagation(); step(1); });
    $("#lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    addEventListener("keydown", (e) => {
      if ($("#lightbox").hidden) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
    // swipe
    let x0 = null;
    const lb = $("#lightbox");
    lb.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
  }

  /* -------------------------------------------------------------------- NOTE */
  function initNote() {
    $("#notesTitle").textContent = COPY.notesTitle;
    $("#noteBody").innerHTML = NOTE.map((p) => `<p>${p}</p>`).join("");
  }

  /* -------------------------------------------------------------------- CAKE */
  function initCake() {
    $("#cakeTitle").textContent = COPY.cakeTitle;
    $("#cakeLead").textContent = COPY.cakeLead;

    const N = Math.max(1, CONFIG.CANDLES | 0);
    /* The cake's top surface is y=138 in the viewBox below. Candles have to
       stand ON that line (drawn upwards from it), and they must be emitted
       AFTER the cake shapes — drawn first, the tiers paint straight over them
       and only the flames (which poke above the icing) remain visible. */
    const TOP_Y = 138;             // top of the icing, where candles stand
    const H = 40;                  // candle height
    const gap = 190 / (N + 1);

    const candles = Array.from({ length: N }, (_, i) => {
      const x = 65 + gap * (i + 1);
      const y = TOP_Y - H;         // the candle's top edge
      const flameY = y - 16;
      return `
        <g class="candle" style="--d:${(i * 0.12).toFixed(2)}s">
          <line x1="${x.toFixed(1)}" y1="${y}" x2="${x.toFixed(1)}" y2="${y - 6}"
                stroke="#6b5745" stroke-width="1.6" stroke-linecap="round"/>
          <rect x="${(x - 4.5).toFixed(1)}" y="${y}" width="9" height="${H}" rx="3.5" fill="url(#stripe)"/>
          <rect x="${(x - 4.5).toFixed(1)}" y="${y}" width="9" height="${H}" rx="3.5"
                fill="none" stroke="rgba(120,86,50,.3)" stroke-width=".8"/>
          <g class="flame" data-i="${i}">
            <ellipse cx="${x.toFixed(1)}" cy="${flameY}" rx="6" ry="11" fill="url(#flame)"/>
            <ellipse cx="${x.toFixed(1)}" cy="${flameY + 4}" rx="2.6" ry="5" fill="#fff6d8" opacity=".92"/>
          </g>
          <ellipse class="flame-hit" cx="${x.toFixed(1)}" cy="${(y + TOP_Y) / 2}" rx="13" ry="46" fill="transparent"/>
        </g>`;
    }).join("");

    $("#cake").innerHTML = `
      <svg viewBox="0 0 320 300" role="img" aria-label="Birthday cake">
        <defs>
          <linearGradient id="sponge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f7d9b8"/><stop offset="1" stop-color="#d9a276"/>
          </linearGradient>
          <linearGradient id="icing" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff4e2"/><stop offset="1" stop-color="#f0d3ae"/>
          </linearGradient>
          <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#e9d6ba"/><stop offset="1" stop-color="#b99a76"/>
          </linearGradient>
          <radialGradient id="flame" cx="50%" cy="65%" r="60%">
            <stop offset="0" stop-color="#fff1c0"/><stop offset="55%" stop-color="#ffb347"/>
            <stop offset="1" stop-color="#ff7a2f"/>
          </radialGradient>
          <pattern id="stripe" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
            <rect width="8" height="8" fill="#f6e6cd"/><rect width="4" height="8" fill="#e2a0ad"/>
          </pattern>
        </defs>

        <ellipse cx="160" cy="262" rx="132" ry="17" fill="url(#plate)"/>
        <rect x="52" y="196" width="216" height="60" rx="12" fill="url(#sponge)"/>
        <rect x="52" y="182" width="216" height="22" rx="11" fill="url(#icing)"/>
        <rect x="84" y="150" width="152" height="46" rx="10" fill="url(#sponge)"/>
        <rect x="84" y="138" width="152" height="18" rx="9" fill="url(#icing)"/>
        <path d="M52 196 q22 20 44 0 q22 20 44 0 q22 20 44 0 q22 20 44 0 v-14 H52z" fill="#fff4e2" opacity=".85"/>
        <path d="M84 150 q18 16 36 0 q18 16 36 0 q18 16 36 0 v-12 H84z" fill="#fff4e2" opacity=".85"/>

        <!-- the candles, LAST: drawn after the cake so nothing paints over them -->
        ${candles}
      </svg>`;

    let out = 0;
    const hint = $("#cakeHint");
    hint.textContent = COPY.cakeHint;

    const killFlame = (g) => {
      if (!g || g.dataset.done === "1") return;
      g.dataset.done = "1";
      g.classList.add("flame--out");
      out++;
      if (out >= N) { hint.textContent = COPY.cakeHintDone; siteFX.burst(160); }
      else if (!reduced) siteFX.burst(12);
    };

    $("#cake").addEventListener("click", (e) => {
      const hit = e.target.closest(".flame");
      if (hit) { killFlame(hit); return; }
      const h = e.target.closest(".flame-hit");
      if (h) { killFlame(h.parentElement.querySelector(".flame")); return; }
      $$(".flame", $("#cake")).forEach(killFlame);   // tapping the cake blows them all out
    });
  }

  /* -------------------------------------------------------------- CONFETTI */
  const confetti = (canvas) => {
    if (!canvas || reduced) return { burst() {}, start() {} };
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, bits = [];
    const resize = () => { w = canvas.width = innerWidth; h = canvas.height = innerHeight; };
    const burst = (n) => {
      for (let i = 0; i < n; i++) {
        bits.push({
          x: w / 2 + (Math.random() - 0.5) * w * 0.5,
          y: h * 0.42,
          vx: (Math.random() - 0.5) * 7, vy: -3 - Math.random() * 6,
          s: 4 + Math.random() * 6, rot: Math.random() * 6.28,
          spin: (Math.random() - 0.5) * 0.3,
          c: ["#f0b86e", "#e88ba0", "#fff1d6", "#d9a276", "#c98da0"][i % 5],
        });
      }
      if (bits.length) requestAnimationFrame(draw);
    };
    let running = false;
    const draw = () => {
      if (!running) { running = true; }
      canvas.width = w; canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      bits = bits.filter((b) => b.y < h + 40);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.vy += 0.16; b.vx *= 0.995; b.rot += b.spin;
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
        ctx.restore();
      }
      if (bits.length) requestAnimationFrame(draw);
      else { running = false; ctx.clearRect(0, 0, w, h); }
    };
    resize();
    addEventListener("resize", resize, { passive: true });
    return { burst, start() {} };
  };

  /* ---------------------------------------------------------------- REVEAL */
  const inView = (n, ratio = 0.88) => {
    const r = n.getBoundingClientRect();
    return r.top < innerHeight * ratio && r.bottom > 0;
  };
  function initReveal() {
    const nodes = $$(".reveal");
    const paint = () => nodes.forEach((n) => { if (inView(n)) n.classList.add("in"); });
    paint();
    addEventListener("scroll", paint, { passive: true });
    setInterval(paint, 3000);
  }

  /* --------------------------------------------------------------- BOOT SITE */
  let siteFX, gateFX, heroFX;   // declared before use — the IIFE is strict mode

  function startSite() {
    initHero();
    initGallery();
    initNote();
    initCake();
  }

  gateFX = petals($("#gatePetals"), 30);
  heroFX = petals($("#heroPetals"), 16);

  // one shared confetti canvas, created before the gate so fire() always has it
  const fx = document.createElement("canvas");
  fx.id = "siteFx";
  fx.className = "site-fx";
  document.body.appendChild(fx);
  siteFX = confetti(fx);

  initGate();
})();
