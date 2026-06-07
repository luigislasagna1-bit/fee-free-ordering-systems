export const meta = {
  name: 'translate-keys',
  description: 'Translate a set of i18n keys into all 37 non-English locales',
  phases: [{ title: 'Translate', detail: 'one agent per locale' }],
};

// EMBEDDED per-feature (args delivery proved unreliable — embed instead).
// Edit NS / CONTEXT / EN for each feature, then re-run the workflow.
const NS = "kitchen";
const CONTEXT = "the restaurant Kitchen Display 'Alert Sound' settings modal (staff-facing). It controls the new-order alert bell: choosing a sound, volume, mute, and a test button. Keep the brand name 'GloriaFood' untranslated. '/admin/profile' is a path — keep it literal. Concise, clear staff tone for a busy kitchen.";
const EN = {
  "soundTitle": "Alert Sound",
  "soundDesc": "The bell rings whenever a new order is waiting. Spaced out at first, then escalates to rapid in the final 30 seconds before the order is auto-rejected. Keep it loud so you never miss one.",
  "soundPickerLabel": "Alert sound",
  "soundGloriaSub": "Default",
  "soundClassic": "Classic Bell",
  "soundClassicSub": "Synthesized",
  "soundCustom": "Custom Sound",
  "soundCustomSub": "Owner-uploaded",
  "soundCustomReplaceHint": "Upload or replace your custom ring from /admin/profile.",
  "soundCustomUploadHint": "Want a custom sound? Upload one from /admin/profile.",
  "soundPreviewHint": "Use the test button below to preview your selection.",
  "soundVolume": "Volume",
  "soundMuted": "Muted",
  "soundMax": "Max",
  "soundLowWarn": "Volume is below 50%. We recommend keeping it at maximum so your team never misses an order during a busy rush.",
  "soundOffWarn": "Alert sound is OFF. New orders will appear visually only — you may not notice them in a noisy kitchen.",
  "soundSilence": "Silence current alarm",
  "soundMutedTap": "Sound muted — tap to unmute",
  "soundOnTap": "Sound on — tap to mute permanently",
  "soundTest": "Play test sound (1 ring)",
  "soundDone": "Done",
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
