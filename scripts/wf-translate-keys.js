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
const CONTEXT = `TABLE RESERVATION "booking questions" for a restaurant platform (feature request from an Italian reseller, modeled on Restoo). Strings appear in three places: the CUSTOMER booking form (warm, short, mobile-friendly: Adults/Children counters, a hint under Children saying what the restaurant counts as a child, and optional chips that open extra questions), STAFF surfaces (kitchen screen labels, the restaurant owner's settings page including tooltip help sentences that explain a toggle in plain practical language, and a narrow thermal-printed slip where labels must be VERY short), and NOTIFICATION EMAILS (card labels). Occasion names are choices in a dropdown - use the natural everyday phrase in your language. "Stroller" = pushchair/pram. "High chair" = baby seat at the table.`;

// canonical id -> English source (translate each ONE time)
const UNIQUE = {
  u_adults: "Adults",
  u_children: "Children",
  u_childDefAge: "Up to {n} years old",
  u_childDefHeight: "Up to {n} cm tall",
  u_fewer: "Fewer {label}",
  u_more: "More {label}",
  u_highChairQ: "Do you need a high chair?",
  u_strollerQ: "Are you bringing a stroller?",
  u_allergies: "Allergies",
  u_allergiesPh: "Tell us about any allergies or dietary needs",
  u_occasion: "Special occasion",
  u_occasionPh: "Please indicate the special occasion",
  u_occasionOtherPh: "Tell us what you're celebrating",
  u_accessible: "Accessible",
  u_accessiblePh: "e.g. wheelchair access, step-free seating",
  u_commentsGeneric: "Comments (optional) - special requests",
  u_occBirthday: "Birthday",
  u_occAnniversary: "Wedding anniversary",
  u_occDate: "Romantic date",
  u_occFriends: "Meeting friends",
  u_occFamily: "Meeting family",
  u_occBusiness: "Business",
  u_occCelebration: "Celebration",
  u_occOther: "Other",
  u_highChair: "High chair",
  u_stroller: "Stroller",
  u_breakdownComma: "{adults} adults, {children} children",
  u_breakdownSlash: "{adults} adults / {children} children",
  u_childSeating: "Child seating",
  u_occasionShort: "Occasion",
  u_accessibility: "Accessibility",
  u_headingQuestions: "Booking questions",
  u_descQuestions: "Ask guests a few extra things while they book. Answers appear in the kitchen, on the reservations list, on the printed slip and in your notification email.",
  u_labelSplit: "Ask adults and children separately",
  u_helpSplit: "Replaces the single party-size picker with separate Adults and Children counters. The total still respects your minimum and maximum guests.",
  u_labelChildDef: "Who counts as a child",
  u_helpChildDef: "Shown as a small hint under the Children counter so guests know what you mean. Choose an age or a height limit, or None to show no hint.",
  u_optNone: "No definition",
  u_optAge: "Under an age",
  u_optHeight: "Under a height",
  u_childrenAreUnder: "Children are under",
  u_years: "years",
  u_cm: "cm",
  u_labelSeatingSetting: "High chairs and strollers",
  u_helpSeating: "Guests booking with children can tell you how many high chairs they need and whether they're bringing a stroller.",
  u_helpAllergies: "Adds an optional allergies and dietary-needs question to the booking form.",
  u_helpOccasion: "Lets guests tell you they're celebrating - a birthday, an anniversary, a business meal - so you can prepare.",
  u_accessibilityNeeds: "Accessibility needs",
  u_helpAccessibility: "Adds an optional question about accessibility needs, like step-free seating or wheelchair access.",
};

// full dotted i18n key -> canonical id above
const KEY_MAP = {
  "reservation.adults": "u_adults",
  "reservation.children": "u_children",
  "reservation.childDefinitionAge": "u_childDefAge",
  "reservation.childDefinitionHeight": "u_childDefHeight",
  "reservation.fewerLabel": "u_fewer",
  "reservation.moreLabel": "u_more",
  "reservation.childSeating": "u_children",
  "reservation.highChairQuestion": "u_highChairQ",
  "reservation.strollerQuestion": "u_strollerQ",
  "reservation.allergiesLabel": "u_allergies",
  "reservation.allergiesPlaceholder": "u_allergiesPh",
  "reservation.occasionLabel": "u_occasion",
  "reservation.occasionSelectPlaceholder": "u_occasionPh",
  "reservation.occasionOtherPlaceholder": "u_occasionOtherPh",
  "reservation.accessibilityLabel": "u_accessible",
  "reservation.accessibilityPlaceholder": "u_accessiblePh",
  "reservation.commentsPlaceholderGeneric": "u_commentsGeneric",
  "reservationDetails.occasionBirthday": "u_occBirthday",
  "reservationDetails.occasionAnniversary": "u_occAnniversary",
  "reservationDetails.occasionDate": "u_occDate",
  "reservationDetails.occasionFriends": "u_occFriends",
  "reservationDetails.occasionFamily": "u_occFamily",
  "reservationDetails.occasionBusiness": "u_occBusiness",
  "reservationDetails.occasionCelebration": "u_occCelebration",
  "reservationDetails.occasionOther": "u_occOther",
  "reservationDetails.highChair": "u_highChair",
  "reservationDetails.stroller": "u_stroller",
  "kitchen.partyBreakdown": "u_breakdownComma",
  "kitchen.labelChildSeating": "u_childSeating",
  "kitchen.labelAllergies": "u_allergies",
  "kitchen.labelOccasion": "u_occasionShort",
  "kitchen.labelAccessibility": "u_accessibility",
  "admin.reservationsList.partyBreakdown": "u_breakdownComma",
  "admin.reservationsList.headingBookingQuestions": "u_headingQuestions",
  "admin.reservationsList.descBookingQuestions": "u_descQuestions",
  "admin.reservationsList.labelSplitParty": "u_labelSplit",
  "admin.reservationsList.helpSplitParty": "u_helpSplit",
  "admin.reservationsList.labelChildDefinition": "u_labelChildDef",
  "admin.reservationsList.helpChildDefinition": "u_helpChildDef",
  "admin.reservationsList.optionChildDefNone": "u_optNone",
  "admin.reservationsList.optionChildDefAge": "u_optAge",
  "admin.reservationsList.optionChildDefHeight": "u_optHeight",
  "admin.reservationsList.labelChildDefYears": "u_childrenAreUnder",
  "admin.reservationsList.labelChildDefCm": "u_childrenAreUnder",
  "admin.reservationsList.unitYears": "u_years",
  "admin.reservationsList.unitCm": "u_cm",
  "admin.reservationsList.labelAskChildSeating": "u_labelSeatingSetting",
  "admin.reservationsList.helpAskChildSeating": "u_helpSeating",
  "admin.reservationsList.labelAskAllergies": "u_allergies",
  "admin.reservationsList.helpAskAllergies": "u_helpAllergies",
  "admin.reservationsList.labelAskOccasion": "u_occasion",
  "admin.reservationsList.helpAskOccasion": "u_helpOccasion",
  "admin.reservationsList.labelAskAccessibility": "u_accessibilityNeeds",
  "admin.reservationsList.helpAskAccessibility": "u_helpAccessibility",
  "admin.reservationsList.labelChildSeating": "u_childSeating",
  "admin.reservationsList.labelAllergies": "u_allergies",
  "admin.reservationsList.labelOccasion": "u_occasionShort",
  "admin.reservationsList.labelAccessibility": "u_accessibility",
  "receipt.reservation.adultsChildren": "u_breakdownSlash",
  "receipt.reservation.labelChildSeating": "u_childSeating",
  "receipt.reservation.labelAllergies": "u_allergies",
  "receipt.reservation.labelOccasion": "u_occasionShort",
  "receipt.reservation.labelAccessibility": "u_accessibility",
  "email.newReservation.badgeAdultsChildren": "u_breakdownComma",
  "email.newReservation.labelChildSeating": "u_childSeating",
  "email.newReservation.labelAllergies": "u_allergies",
  "email.newReservation.labelOccasion": "u_occasionShort",
  "email.newReservation.labelAccessibility": "u_accessibility",
  "email.reservationConfirmed.partyBreakdown": "u_breakdownComma",
  "email.reservationConfirmed.labelChildSeating": "u_childSeating",
  "email.reservationConfirmed.labelAllergies": "u_allergies",
  "email.reservationConfirmed.labelOccasion": "u_occasionShort",
  "email.reservationConfirmed.labelAccessibility": "u_accessibility",
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
