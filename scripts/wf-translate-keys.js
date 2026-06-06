export const meta = {
  name: 'translate-keys',
  description: 'Translate a set of i18n keys into all 37 non-English locales',
  phases: [{ title: 'Translate', detail: 'one agent per locale' }],
};

// EMBEDDED per-feature (args delivery proved unreliable — embed instead).
// Edit NS / CONTEXT / EN for each feature, then re-run the workflow.
const NS = "admin.menuEditor";
const CONTEXT = "the menu-item editor in a restaurant admin. These strings build a COMBO item — one menu item made of several 'slots', each offering a pool of items the customer picks from (e.g. '2-Pizza Combo', 'Pizza + Wings'); pizza picks open the pizza builder. {price} is a formatted currency amount, {n} a slot number — keep {price}/{n} placeholders EXACTLY as-is. Keep emoji (🧩) and the literal 'PIZZA' tag. Concise admin tone.";
const EN = {
  "tabComboActive": "🧩 Combo",
  "tabComboSetup": "Combo",
  "comboToggleTitle": "Make this a combo",
  "comboToggleHint": "Build one item from several picks (e.g. 2 pizzas, or a pizza + wings). Pizza picks open the full pizza builder.",
  "comboPriceNote": "Customers pay this item's price ({price}) for the whole combo, plus any per-item upcharges you set below.",
  "comboSlotLabelPlaceholder": "Slot {n} label (e.g. 'Choose your 1st pizza')",
  "comboMin": "Min",
  "comboMax": "Max",
  "comboEligibleItems": "Items the customer can choose from:",
  "comboNoItems": "Add some regular menu items first — then include them in a combo here.",
  "comboUpcharge": "Premium upcharge for this item",
  "comboPizzaTag": "PIZZA",
  "comboAddSlot": "Add slot",
};
const KEYS = Object.keys(EN);

const LOCALES = [
  ["fr", "French"], ["es", "Spanish"], ["it", "Italian"], ["pt", "European Portuguese"],
  ["pt-BR", "Brazilian Portuguese"], ["de", "German"], ["nl", "Dutch"], ["ro", "Romanian"],
  ["sv", "Swedish"], ["da", "Danish"], ["nb", "Norwegian Bokmål"], ["fi", "Finnish"],
  ["pl", "Polish"], ["cs", "Czech"], ["sk", "Slovak"], ["hu", "Hungarian"],
  ["el", "Greek"], ["bg", "Bulgarian"], ["hr", "Croatian"], ["sr", "Serbian"],
  ["sl", "Slovenian"], ["et", "Estonian"], ["lv", "Latvian"], ["lt", "Lithuanian"],
  ["tr", "Turkish"], ["ru", "Russian"], ["uk", "Ukrainian"], ["ca", "Catalan"],
  ["id", "Indonesian"], ["vi", "Vietnamese"], ["th", "Thai"], ["zh", "Simplified Chinese"],
  ["ja", "Japanese"], ["ko", "Korean"], ["ar", "Arabic"], ["he", "Hebrew"], ["hi", "Hindi"],
];

const schema = {
  type: "object",
  additionalProperties: false,
  required: KEYS,
  properties: Object.fromEntries(KEYS.map((k) => [k, { type: "string" }])),
};

phase('Translate');
const results = await parallel(
  LOCALES.map(([code, name]) => () =>
    agent(
      `You are a professional software localizer. Translate these UI strings from English into ${name} (locale code "${code}"). Context: ${CONTEXT}.

STRICT RULES:
- Output is validated as a JSON object with EXACTLY these ${KEYS.length} keys. Translate the VALUES only; never change the keys.
- Preserve EXACTLY any ICU placeholders in curly braces like {amount}, {count}, {name} — do not translate or reorder their contents.
- Preserve EXACTLY any markup tags like <strong>...</strong>, <a>...</a>, <b>...</b> — translate the text inside but keep the tags.
- Keep brand names (Stripe, PayPal, GloriaFood) untranslated. Keep literal token prefixes (pk_test_, sk_live_, etc.) unchanged.
- Output raw characters, NOT HTML entities (write < and > and & and ' directly, never &lt; &gt; &amp; &#39;).
- Tone: concise, professional, matching a modern SaaS dashboard / customer ordering UI.

English source:
${JSON.stringify(EN, null, 2)}`,
      { label: code, phase: 'Translate', schema },
    ).then((obj) => ({ code, obj })),
  ),
);

return results.filter(Boolean);
