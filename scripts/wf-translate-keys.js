export const meta = {
  name: 'translate-keys',
  description: 'Translate a set of i18n keys into all 37 non-English locales',
  phases: [{ title: 'Translate', detail: 'one agent per locale' }],
};

// EMBEDDED per-feature (args delivery proved unreliable — embed instead).
// Edit NS / CONTEXT / EN for each feature, then re-run the workflow.
const NS = "admin.services";
const CONTEXT = "the restaurant admin Services settings — pre-order ('order for later') limits for pickup/delivery. 'Minimum time in advance' = how soon before pickup/delivery a customer may order; 'Maximum days in advance' = how far ahead they may pre-order. unitMinutes/unitHours/unitDays are unit labels in a dropdown. {days} is a number — keep it EXACTLY. Concise admin tone.";
const EN = {
  "minAdvanceLabel": "Minimum time in advance",
  "minAdvanceHint": "How soon before pickup/delivery a customer can order. 0 = as soon as possible (only limited by your prep time).",
  "maxAdvanceLabel": "Maximum days in advance",
  "maxAdvanceHint": "Customers can pre-order up to {days} days ahead.",
  "maxAdvanceHintUnlimited": "No limit on how far ahead customers can pre-order.",
  "unitMinutes": "minutes",
  "unitHours": "hours",
  "unitDays": "days",
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
