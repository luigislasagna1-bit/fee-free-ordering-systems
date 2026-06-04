export const meta = {
  name: 'translate-keys',
  description: 'Translate a set of i18n keys into all 37 non-English locales',
  phases: [{ title: 'Translate', detail: 'one agent per locale' }],
};

// EMBEDDED per-feature (args delivery proved unreliable — embed instead).
// Edit NS / CONTEXT / EN for each feature, then re-run the workflow.
const NS = "@root"; // keys below are FULL dotted paths (multi-namespace batch)
const CONTEXT = "a restaurant ordering platform; an 'auto phone-call' feature that telephones the restaurant with a spoken message when a new order isn't accepted in ~90s. The autoCallMessage value is SPOKEN ALOUD over the phone — keep it natural for text-to-speech";
const EN = {
  "kitchen.autoCallMessage": "New order {number} at {restaurant} is waiting and has not been accepted yet. Please open your kitchen display to accept or reject it.",
  "admin.kitchenWorkflowToggle.autoCallLabel": "Auto phone-call alert",
  "admin.kitchenWorkflowToggle.autoCallStatusOn": "On — we call your phone if a new order is not accepted within ~90 seconds.",
  "admin.kitchenWorkflowToggle.autoCallStatusOff": "Off — new orders alert on the kitchen display only.",
  "admin.kitchenWorkflowToggle.autoCallToggleAriaLabel": "Toggle auto phone-call alert",
  "admin.kitchenWorkflowToggle.autoCallFooterNote": "If a new order sits unaccepted for about 90 seconds, we place an automated call to your restaurant phone so you never miss an order — even if the tablet is unattended.",
  "admin.kitchenWorkflowToggle.autoCallEnabledToast": "Auto phone-call alert enabled.",
  "admin.kitchenWorkflowToggle.autoCallDisabledToast": "Auto phone-call alert disabled.",
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
