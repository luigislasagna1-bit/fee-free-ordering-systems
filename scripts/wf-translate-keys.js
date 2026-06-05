export const meta = {
  name: 'translate-keys',
  description: 'Translate a set of i18n keys into all 37 non-English locales',
  phases: [{ title: 'Translate', detail: 'one agent per locale' }],
};

// EMBEDDED per-feature (args delivery proved unreliable — embed instead).
// Edit NS / CONTEXT / EN for each feature, then re-run the workflow.
const NS = "admin.menus";
const CONTEXT = "a restaurant admin 'multi-menu manager' — the owner has several named menu versions (e.g. Summer, Winter), edits a draft while the current one stays live, can duplicate a menu, set one live, and SCHEDULE one to go live at a future date/time. {n} is a number, {name} a menu name, {time} an already-formatted date/time — keep {n}/{name}/{time} placeholders EXACTLY as-is. Concise admin-dashboard tone.";
const EN = {
  "live": "Live",
  "categories": "{n} categories",
  "scheduled": "scheduled",
  "setLive": "Set live",
  "newMenu": "New menu",
  "duplicate": "Duplicate this menu",
  "rename": "Rename",
  "delete": "Delete menu",
  "failed": "Something went wrong",
  "created": "Menu created",
  "duplicated": "Menu duplicated",
  "renamed": "Menu renamed",
  "activated": "Menu is now live",
  "deleted": "Menu deleted",
  "newMenuPrompt": "Name your new menu:",
  "newMenuDefault": "New menu",
  "duplicatePrompt": "Name for the duplicated menu:",
  "renamePrompt": "Rename this menu:",
  "activateConfirm": "Make \"{name}\" the live menu customers see right now?",
  "deleteConfirm": "Delete \"{name}\" and all its categories/items? This can't be undone.",
  "schedule": "Schedule go-live",
  "scheduleGoLive": "Go live on:",
  "scheduleSave": "Schedule",
  "scheduledForLabel": "Goes live {time}",
  "change": "Change",
  "clearSchedule": "Clear",
  "scheduleSaved": "Go-live scheduled",
  "scheduleCleared": "Schedule cleared",
  "cancel": "Cancel",
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
