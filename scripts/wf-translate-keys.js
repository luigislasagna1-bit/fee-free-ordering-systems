export const meta = {
  name: 'translate-keys',
  description: 'Translate a set of i18n keys into all 37 non-English locales',
  phases: [{ title: 'Translate', detail: 'one agent per locale per chunk' }],
};

// EMBEDDED per-feature (args delivery proved unreliable — embed instead).
// Edit CONTEXT / UNIQUE / KEY_MAP for each feature, then re-run the workflow.
//
// NOTE (2026-08-01): a single 64-key schema is rejected by the output
// classifier ("output schema too large"). Two changes keep runs safe:
//   1. translate UNIQUE strings only (many namespaces repeat the same word),
//   2. chunk them into small schemas (<= CHUNK keys per agent).
const CONTEXT = `RESTAURANT COMBO ORDERING for an online ordering platform. Two features: (1) picking several items in one combo step - quantity steppers ("Add another X" / "Remove one X"), a "How many?" stepper in an item popup, an inline red note listing what a step still needs ("{slot}: choose {count} more" - {slot} is the step's name like "Choose 4 Pop"), and "x{count}" quantity prefixes; (2) a SHARED TOPPING POOL for pizza combos: the combo includes N free pizza toppings SHARED across all pizzas in it ("2 large pizzas, 6 toppings combined") - a live meter shows "Shared toppings: {used} of {total} used" plus "{left} left", pizza topping rows show a small "Included" badge while the shared allowance covers them, and once it runs out extra toppings are charged. CUSTOMER strings: warm, short, mobile-friendly. ADMIN strings (restaurant owner's menu editor): plain practical language; tooltip help texts are full sentences explaining the switch; "Included Toppings" refers to an existing setting name on the pizza item.`;

// canonical id -> English source (translate each ONE time)
const UNIQUE = {
  u_addChoiceQty: "Add {count}{price}",
  u_times: "×{count}",
  u_addAnother: "Add another {name}",
  u_removeOne: "Remove one {name}",
  u_slotNeedsMore: "{slot}: choose {count} more",
  u_howMany: "How many?",
  u_poolMeter: "Shared toppings: {used} of {total} used",
  u_poolLeft: "{left} left",
  u_poolEmpty: "All used — extra toppings are charged",
  u_toppingsShared: "Toppings — {left} of {total} shared toppings left",
  u_poolIncluded: "Included",
  u_allowDup: "Allow adding the same item multiple times",
  u_allowDupHelp: "ON: a customer filling this step can take several of one item — e.g. 4× the same pop — using the quantity buttons. OFF: every pick must be a different item.",
  u_poolTitle: "Share included toppings across all pizzas",
  u_poolHelp: "Applies only to the pizzas in this combo. While ON, each pizza's own \"Included Toppings\" (from its Pizza Setup tab) is ignored inside this combo — this shared number replaces it. Extra toppings beyond the shared allowance are always charged at that pizza's extra-topping price, even when \"Charge for add-ons & extras\" is off. Non-pizza items are unaffected.",
  u_poolOffHint: "OFF — each pizza uses its own \"Included Toppings\" number.",
  u_poolOnHint: "ON — all pizzas draw from one shared allowance. Example: 6 shared toppings on a 2-pizza combo — a customer can put 1 topping on the first pizza and still has 5 free for the second. Beyond that, extra toppings are charged normally.",
  u_poolCountLabel: "Toppings included (all pizzas combined):",
};

// full dotted i18n key -> canonical id above
const KEY_MAP = {
  "customer.combo.addChoiceQty": "u_addChoiceQty",
  "customer.combo.timesCount": "u_times",
  "customer.combo.addAnother": "u_addAnother",
  "customer.combo.removeOne": "u_removeOne",
  "customer.combo.slotNeedsMore": "u_slotNeedsMore",
  "customer.combo.howMany": "u_howMany",
  "customer.combo.poolMeter": "u_poolMeter",
  "customer.combo.poolLeft": "u_poolLeft",
  "customer.combo.poolEmpty": "u_poolEmpty",
  "pizza.toppingsShared": "u_toppingsShared",
  "pizza.poolIncluded": "u_poolIncluded",
  "admin.menuEditor.comboAllowDuplicates": "u_allowDup",
  "admin.menuEditor.comboAllowDuplicatesHelp": "u_allowDupHelp",
  "admin.menuEditor.comboPoolTitle": "u_poolTitle",
  "admin.menuEditor.comboPoolHelp": "u_poolHelp",
  "admin.menuEditor.comboPoolOffHint": "u_poolOffHint",
  "admin.menuEditor.comboPoolOnHint": "u_poolOnHint",
  "admin.menuEditor.comboPoolCountLabel": "u_poolCountLabel",
};

const LOCALES = [
  ["fr", "French"], ["es", "Spanish"], ["it", "Italian"], ["pt", "European Portuguese"],
  ["pt-BR", "Brazilian Portuguese"], ["de", "German"], ["nl", "Dutch"], ["ro", "Romanian"],
  ["sv", "Swedish"], ["da", "Danish"], ["nb", "Norwegian Bokmal"], ["fi", "Finnish"],
  ["pl", "Polish"], ["cs", "Czech"], ["sk", "Slovak"], ["hu", "Hungarian"],
  ["el", "Greek"], ["bg", "Bulgarian"], ["hr", "Croatian"], ["sr", "Serbian"],
  ["sl", "Slovenian"], ["et", "Estonian"], ["lv", "Latvian"], ["lt", "Lithuanian"],
  ["tr", "Turkish"], ["ru", "Russian"], ["uk", "Ukrainian"], ["ca", "Catalan"],
  ["id", "Indonesian"], ["vi", "Vietnamese"], ["th", "Thai"], ["zh", "Simplified Chinese"],
  ["ja", "Japanese"], ["ko", "Korean"], ["ar", "Arabic"], ["he", "Hebrew"], ["hi", "Hindi"],
];

const CHUNK = 10;
const ALL_IDS = Object.keys(UNIQUE);
const CHUNKS = [];
for (let i = 0; i < ALL_IDS.length; i += CHUNK) CHUNKS.push(ALL_IDS.slice(i, i + CHUNK));

const jobs = [];
for (const [code, name] of LOCALES) {
  for (let ci = 0; ci < CHUNKS.length; ci++) {
    const ids = CHUNKS[ci];
    const src = Object.fromEntries(ids.map((k) => [k, UNIQUE[k]]));
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ids,
      properties: Object.fromEntries(ids.map((k) => [k, { type: "string" }])),
    };
    jobs.push(() =>
      agent(
        `You are a professional software localizer. Translate these UI strings from English into ${name} (locale code "${code}"). Context: ${CONTEXT}

STRICT RULES:
- Output is validated as a JSON object with EXACTLY these ${ids.length} keys. Translate the VALUES only; never change the keys.
- Preserve EXACTLY any ICU placeholders in curly braces like {n}, {adults}, {children}, {label} - do not translate or reorder them.
- Output raw characters, NOT HTML entities.
- Tone: concise, professional, matching a modern restaurant ordering UI.

English source:
${JSON.stringify(src, null, 2)}`,
        { label: `${code}#${ci + 1}`, phase: 'Translate', schema },
      ).then((obj) => ({ code, obj })).catch(() => ({ code, obj: null })),
    );
  }
}

phase('Translate');
const results = await parallel(jobs);

// Merge chunks per locale, then fan the canonical values out to every dotted key.
const byLocale = {};
for (const r of results) {
  if (!r || !r.obj) continue;
  byLocale[r.code] = { ...(byLocale[r.code] || {}), ...r.obj };
}
const staging = {};
for (const [dotted, canon] of Object.entries(KEY_MAP)) {
  const row = { en: UNIQUE[canon] };
  for (const [code] of LOCALES) {
    const v = byLocale[code] && byLocale[code][canon];
    if (v) row[code] = v;
  }
  staging[dotted] = row;
}
const missing = LOCALES.filter(([c]) => !byLocale[c] || Object.keys(byLocale[c]).length < ALL_IDS.length)
  .map(([c]) => `${c}:${byLocale[c] ? Object.keys(byLocale[c]).length : 0}/${ALL_IDS.length}`);
log(`locales complete: ${LOCALES.length - missing.length}/${LOCALES.length}${missing.length ? ` — incomplete: ${missing.join(", ")}` : ""}`);
return { staging, missing };
