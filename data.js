/* ============================================================================
   Ayushi's birthday page — all content lives here.
   A birthday gift from her sister, Anjali. Everything Anjali wrote is in this
   file, untouched; the rest is layout.
   ============================================================================ */

const CONFIG = {
  her: "Ayushi",
  herFull: "Ayushi Karwa",
  from: "Anjali",

  // The lock screen. Compared after lowercasing and stripping everything except
  // letters, so an extra space, a capital, or "Anjali Karwa" all still work —
  // nobody should get locked out of their own birthday page by a stray capital.
  GATE_QUESTION: "Who is your favorite sister?",
  GATE_HINT: "Go on, you know this one 😌",
  GATE_WRONG: "Hmm. Try again — there's only one right answer here 😌🤍",
  GATE_PLACEHOLDER: "type her name…",
  ANSWERS: ["anjali", "anjalikarwa"],

  // Candles on the cake. Set this to her age, or however many you like.
  CANDLES: 5,
};

/* The photographs, in the order they appear. There are deliberately no
   captions on this page — the pictures carry themselves, and each one sits in
   its own frame. */
const PHOTOS = Array.from({ length: 20 }, (_, i) => `a${String(i + 1).padStart(2, "0")}`);

/* ============================================================================
   THE NOTE — Anjali's words, exactly as she sent them.
   Emojis, spellings, typos and all. Not one character edited.
   ============================================================================ */
const NOTE = [
  "Happieeee Birthdayyy meri dramebaaz behen🫶 ❤️😂",
  "Today is the day when you were adopted 😂🤭 and still somehow tujhe mujhse zyada pyaar milta raha 😩😩",
  "But honestly, tu meri life ka ek bahut important part hai ❤️ joh kabhi koi replace nahi krksta ...🤗💋... Meri life savior, meri partner in all crime😎😎 and  bakwaas🤓😛.Tere saath ladna🫣, tujhe irritate karna 😁🤪aur phir thodi der baad sab normal ho jaana 🤣❤️ usmaah toh ek alag hi sukoon haii😌...I knw I don't express u much....but I love u very much 🫶💋",
  "Abhi toh hum virtual birthday celebrate kar rahe hain 🥹❤️ but bahut jaldi paas rehke proper birthday celebrate karenge🥳🥳, saath mein masti karenge 🎊🎉aur bahut saara time spend karenge🥹🫶🏻...and double party krenge iss baar ...🧸🎁",
  "Bas hamesha aise hi khush reh💋🥰, haste reh🤗🫶, aur apna ye drama kabhi band mat karna 😂😂..keep entertaining us...🫣🤪🤪... Bhagwan tujhe woh sab de jo tu chahti hai ❤️🤗😘..saari wishes Puri ho😌😌🤞.",
  "Enjoy ur day...🎉🎊Love you loads meri adopted😌, dramebaaz🥰, life-savior behen ❤️🫶🏻",
  "Happy Birthday once againnn! 🎂🥹❤️",
];

/* Small lines for the hero and the section headings. */
const COPY = {
  heroEyebrow: "Happy Birthday",
  heroSub: "From your caring behen",
  // No counts anywhere — the page never says how many photographs there are.
  galleryTitle: "You, in pictures",
  galleryNote: "Every mood, every version of you — my dramebaaz behen 🫶",
  notesTitle: "A note from Anjali",
  cakeTitle: "Make a wish",
  cakeLead: "Blow out the candles — tap them 🎂",
  cakeHint: "tap the flames",
  cakeHintDone: "all out 🤍",
};
