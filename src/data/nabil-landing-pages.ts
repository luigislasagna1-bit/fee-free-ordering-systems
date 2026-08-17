/**
 * Programmatic SEO landing pages — "AI phone ordering for {sushi restaurants /
 * food trucks / …}". Rendered by src/app/ai-phone-ordering-for/[slug]/page.tsx,
 * statically generated at build time, listed in the sitemap, and cross-linked.
 *
 * Strategy: capture high-intent organic search like "AI phone ordering for
 * sushi restaurants" / "automated ordering for food trucks" and funnel it into
 * the Nabil AI add-on signup (/signup?addon=phone_ordering). Mirrors the proven
 * /online-ordering-for/[slug] engine (SSG + JSON-LD + cross-links).
 *
 * ENGLISH-ONLY by design — same established exception as the /vs and
 * /online-ordering-for pages. The product UI is fully 38-locale; these
 * acquisition pages are not.
 *
 * Substantive, NOT thin: each page has a unique cuisine-specific intro, sample
 * phone exchange, pain point, benefits, and FAQ. Every claim maps to a SHIPPED
 * Nabil AI feature (rounds 1–7). NOT claimed: card payment by phone, scheduled
 * orders, self-serve number provisioning, background ambience. Start with 20
 * high-impact restaurant types — do NOT mass-generate near-duplicates.
 */

export interface NabilBenefit {
  title: string;
  body: string;
}
export interface NabilFaq {
  q: string;
  a: string;
}
export interface NabilSampleExchange {
  caller1: string;
  nabil1: string;
  caller2: string;
  nabil2: string;
}
export interface NabilLandingPage {
  slug: string;
  /** Singular lowercase noun: "sushi restaurant". */
  noun: string;
  /** Plural noun: "sushi restaurants" — used in headings. */
  nounPlural: string;
  /** The cuisine or food word, for contextual copy: "sushi", "BBQ". */
  cuisine: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  /** Short uppercase-styled eyebrow above the H1. */
  eyebrow: string;
  /** 2–3 sentence hero intro. */
  intro: string;
  /** A 4-line sample phone conversation specific to this restaurant type. */
  sampleExchange: NabilSampleExchange;
  painPoint: NabilBenefit;
  /** Exactly 3 cuisine-specific benefits of AI phone ordering. */
  benefits: NabilBenefit[];
  /** 4–5 unique FAQs (drives FAQPage JSON-LD). */
  faqs: NabilFaq[];
}

/* ─── ASIAN CUISINES ───────────────────────────────────────────────── */

const sushi: NabilLandingPage = {
  slug: "sushi-restaurants",
  noun: "sushi restaurant",
  nounPlural: "sushi restaurants",
  cuisine: "sushi",
  metaTitle: "AI Phone Ordering for Sushi Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your sushi restaurant's phone and takes roll, platter, and combo orders conversationally — with accurate modifiers, read-back confirmation, and instant kitchen printing. US$0.60/min.",
  h1: "AI phone ordering for sushi restaurants",
  eyebrow: "Nabil AI for sushi restaurants",
  intro:
    "Roll names are easy to mangle over the phone, and a busy dinner rush means missed calls are missed revenue. Nabil AI answers your sushi restaurant's phone, takes à-la-carte roll orders, combo platters, and delivery requests conversationally, and sends every order straight to your kitchen — no hold music, no mispronounced spicy tuna.",
  sampleExchange: {
    caller1: "Hi, can I get a Dragon Roll and a Spicy Salmon Roll for pickup?",
    nabil1: "Sure! I have a Dragon Roll and a Spicy Salmon Roll for pickup. Would you like to add any appetizers — edamame or miso soup?",
    caller2: "Add an edamame. That's it.",
    nabil2: "Got it — Dragon Roll, Spicy Salmon Roll, and edamame for pickup. Your total is $34.50. Can I get your name?",
  },
  painPoint: {
    title: "Missed calls during the dinner rush cost you the best tickets",
    body: "Sushi is a high-ticket, customization-heavy cuisine. When the phone rings during a Friday night rush and no one can answer, that's a $40–$80 order gone — often to a delivery app that takes 25–30% of it. An AI agent that never misses a call keeps those orders direct.",
  },
  benefits: [
    {
      title: "Roll names and modifiers, handled accurately",
      body: "Dragon Roll, Rainbow Roll, Philadelphia Roll — Nabil knows your menu and confirms every item by name. Modifier requests like 'no avocado' or 'extra spicy mayo' are captured cleanly and sent to the kitchen exactly as ordered.",
    },
    {
      title: "Combo platters and party orders by phone",
      body: "Large platter orders are high-value but complex to take over the phone. Nabil walks the caller through combo options, confirms piece counts and selections, and reads back the full order before placing it — no miscommunication on a $120 party tray.",
    },
    {
      title: "Every phone order prints alongside your online orders",
      body: "Phone orders go through the same checkout as your website orders. They appear on your Kitchen Order App, print on your thermal printer, and show up in your dashboard — one system for everything, not a separate notepad by the phone.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle specialty roll names and custom modifications?",
      a: "Yes — Nabil knows your full menu including specialty rolls, and captures modifications like 'no cucumber', 'extra sauce', or 'make it a hand roll' as part of the order. Every item is read back for confirmation before it's placed.",
    },
    {
      q: "What happens if a caller asks for something not on the menu?",
      a: "Nabil tells them it's not available and suggests similar items from your menu. If the caller needs help beyond what Nabil can do, it transfers the call to your store instantly.",
    },
    {
      q: "How does the order get to the kitchen?",
      a: "Phone orders go through the same checkout system as your online orders. They ring on your Kitchen Order App (iOS & Android), print to your WiFi thermal printer, and appear in your order dashboard — no separate system to check.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute, with a US$249.99 per month minimum (whichever is higher). Every call includes a recording, full transcript, and per-call timeline on your dashboard.",
    },
    {
      q: "Can Nabil take delivery orders and check if an address is in range?",
      a: "Yes — Nabil asks for the delivery address and checks it against your configured delivery zones before placing the order, so out-of-range orders are caught on the call, not after.",
    },
  ],
};

const chinese: NabilLandingPage = {
  slug: "chinese-restaurants",
  noun: "Chinese restaurant",
  nounPlural: "Chinese restaurants",
  cuisine: "Chinese",
  metaTitle: "AI Phone Ordering for Chinese Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your Chinese restaurant's phone and takes combo, family dinner, and delivery orders conversationally — large menus handled accurately with read-back confirmation. US$0.60/min.",
  h1: "AI phone ordering for Chinese restaurants",
  eyebrow: "Nabil AI for Chinese restaurants",
  intro:
    "Chinese restaurants take more phone orders than almost any other cuisine — and large menus with 100+ items make those calls slow and error-prone. Nabil AI answers your phone, navigates your full menu conversationally, and takes combo dinners, family meals, and delivery orders accurately, so your staff can focus on cooking instead of answering the phone.",
  sampleExchange: {
    caller1: "I'd like a combo dinner number 5 and a large General Tso's chicken for delivery.",
    nabil1: "I have combo dinner #5 and a large General Tso's chicken for delivery. The combo comes with a choice of soup — would you like wonton or egg drop?",
    caller2: "Wonton soup, and add a pint of pork fried rice.",
    nabil2: "Got it — combo #5 with wonton soup, large General Tso's chicken, and a pint of pork fried rice for delivery. I'll need your delivery address.",
  },
  painPoint: {
    title: "Phone-heavy business, phone-heavy labour costs",
    body: "Many Chinese restaurants get half or more of their orders by phone — and each call ties up a staff member for 3–5 minutes navigating a large menu, repeating combo options, and writing down addresses. That's a full person's worth of labour just answering the phone on a busy night.",
  },
  benefits: [
    {
      title: "100+ item menus, navigated effortlessly",
      body: "Nabil knows your entire menu — every numbered combo, every size option, every side choice. Callers just say what they want and Nabil finds it, confirms the details, and adds it to the order. No flipping through a paper menu on the caller's behalf.",
    },
    {
      title: "Combo dinners with all the right choices",
      body: "Combo #3 with egg drop soup and pork fried rice — Nabil walks callers through every choice in their combo, confirms selections, and sends the complete order to the kitchen. No missing sides, no forgotten soup choices.",
    },
    {
      title: "Free up staff for cooking and counter orders",
      body: "When Nabil handles the phone, your kitchen staff stay on the line and your counter person can focus on walk-ins. Phone orders still print on your thermal printer and ring on your Kitchen Order App the moment they're placed.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle numbered combos with choices (soup, side, protein)?",
      a: "Yes — Nabil knows every combo on your menu and walks the caller through each choice: soup selection, side, protein, and any size options. Everything is confirmed before the order is placed.",
    },
    {
      q: "My menu has over 150 items — can Nabil really handle that?",
      a: "Yes. Nabil works from your actual menu data, so it knows every item regardless of menu size. It can find dishes by name, number, or description and suggest options when a caller isn't sure what they want.",
    },
    {
      q: "Do phone orders show up alongside online orders?",
      a: "Yes — phone orders go through the same system as your website orders. They appear on your Kitchen Order App, print to your thermal printer, and show on your order dashboard.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Includes recordings, transcripts, and analytics for every call.",
    },
  ],
};

const thai: NabilLandingPage = {
  slug: "thai-restaurants",
  noun: "Thai restaurant",
  nounPlural: "Thai restaurants",
  cuisine: "Thai",
  metaTitle: "AI Phone Ordering for Thai Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your Thai restaurant's phone and takes curry, noodle, and takeout orders with spice levels and protein swaps — accurately and conversationally. US$0.60/min.",
  h1: "AI phone ordering for Thai restaurants",
  eyebrow: "Nabil AI for Thai restaurants",
  intro:
    "Pad thai with shrimp, green curry medium spice, swap tofu for chicken — Thai orders are all about customization, and getting those details wrong by phone means remakes and unhappy customers. Nabil AI takes those calls, captures every spice level and protein swap, and sends the order to your kitchen exactly right.",
  sampleExchange: {
    caller1: "Can I get a pad thai with shrimp and a green curry, medium spice, with tofu?",
    nabil1: "Sure — pad thai with shrimp and a green curry at medium spice with tofu. Would you like white rice or brown rice with the curry?",
    caller2: "Brown rice, and make the pad thai extra spicy.",
    nabil2: "Got it — pad thai with shrimp, extra spicy, and green curry with tofu, medium spice, with brown rice. Anything else?",
  },
  painPoint: {
    title: "Spice-level mix-ups are the costliest phone-order mistake",
    body: "A 'medium' that arrives 'extra hot' — or vice versa — means a remake, a refund, or a lost customer. On a busy takeout night, handwritten phone orders are where those mistakes happen. An AI that reads back 'green curry, medium spice, with tofu' before placing the order eliminates them.",
  },
  benefits: [
    {
      title: "Spice levels and protein swaps, confirmed every time",
      body: "Nabil captures spice level (mild, medium, hot, extra hot) and protein choice for every dish, reads the full order back, and only places it once the caller confirms. No more guessing what 'a little spicy' meant.",
    },
    {
      title: "Takeout rushes without tying up staff",
      body: "Thai restaurants often run lean crews with heavy takeout volume. Nabil handles the phone so your cook stays cooking and your one front-of-house person stays packaging orders — not scribbling on a notepad with the phone wedged between ear and shoulder.",
    },
    {
      title: "Phone orders land in the same system as online",
      body: "Every phone order goes through your existing checkout, prints on your thermal printer, and appears on your Kitchen Order App. One ticket stream, one dashboard, one system — whether the order came from your website or a phone call.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle spice levels and protein choices?",
      a: "Yes — spice levels, protein swaps, and add-ons like extra vegetables or brown rice are all captured as part of the order and read back for confirmation before it's placed.",
    },
    {
      q: "What if a caller changes their mind mid-order?",
      a: "Nabil handles changes naturally — 'actually, make that a red curry instead' works just like it would with a human. The updated order is read back for final confirmation.",
    },
    {
      q: "How does the order get to my kitchen?",
      a: "Phone orders enter the same system as your online orders — they ring on your Kitchen Order App and print to your WiFi thermal printer instantly. No separate phone-order workflow.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and a per-call timeline are included with every call.",
    },
  ],
};

const vietnamese: NabilLandingPage = {
  slug: "vietnamese-restaurants",
  noun: "Vietnamese restaurant",
  nounPlural: "Vietnamese restaurants",
  cuisine: "Vietnamese",
  metaTitle: "AI Phone Ordering for Vietnamese Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your Vietnamese restaurant's phone and takes pho, banh mi, and vermicelli bowl orders with accurate customizations — protein choices, broth options, and add-ons. US$0.60/min.",
  h1: "AI phone ordering for Vietnamese restaurants",
  eyebrow: "Nabil AI for Vietnamese restaurants",
  intro:
    "Pho with rare steak and brisket, no bean sprouts, extra hoisin on the side — Vietnamese orders are specific, and callers don't always know the menu numbers. Nabil AI answers your phone, understands your menu by name or number, and takes pho, banh mi, and vermicelli bowl orders with every customization captured correctly.",
  sampleExchange: {
    caller1: "Hi, I'd like a large pho with rare steak and brisket, and a grilled pork banh mi.",
    nabil1: "I have a large pho with rare steak and brisket, and a grilled pork banh mi. Would you like any add-ons with the pho — extra noodles, tripe, or tendon?",
    caller2: "Add tendon to the pho. And can I get a Vietnamese iced coffee?",
    nabil2: "Sure — large pho with rare steak, brisket, and tendon, a grilled pork banh mi, and a Vietnamese iced coffee. Is this for pickup or delivery?",
  },
  painPoint: {
    title: "Menu pronunciation shouldn't slow down your phone orders",
    body: "Callers stumble over 'bun bo hue' and 'banh xeo', and staff spend time decoding what they mean. Nabil knows your menu items by name, number, and common English descriptions, so a caller who says 'the crispy crepe thing' still gets the right dish on their ticket.",
  },
  benefits: [
    {
      title: "Pho orders with every protein and add-on right",
      body: "Rare steak, well-done brisket, tendon, tripe, extra noodles — Nabil captures every pho customization and reads back the full build before placing the order. No more 'I said rare steak, not well-done flank.'",
    },
    {
      title: "Callers find dishes without knowing the Vietnamese name",
      body: "Nabil matches menu items by name, number, or description. A caller who says 'the vermicelli bowl with grilled pork' gets the right item, even if they don't say 'bun thit nuong.' Less back-and-forth, faster orders.",
    },
    {
      title: "Orders print in your kitchen instantly",
      body: "Every phone order goes through your existing checkout and prints on your thermal printer alongside online orders. Your kitchen sees one unified ticket stream — phone and web — on the Kitchen Order App.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle pho customizations (proteins, add-ons, size)?",
      a: "Yes — every protein combination, size option, and add-on (extra noodles, tendon, etc.) is captured as part of the order and confirmed with the caller before it's placed.",
    },
    {
      q: "What if a caller doesn't know the dish name?",
      a: "Nabil can find items by description, menu number, or partial name. If a caller says 'the beef noodle soup' or 'number 12', Nabil matches it to the right dish on your menu.",
    },
    {
      q: "Do phone orders go through the same system as online orders?",
      a: "Yes — they enter the same checkout, ring on your Kitchen Order App, print on your thermal printer, and show on your dashboard. One system for all orders.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Includes recordings, transcripts, and analytics for every call.",
    },
  ],
};

const koreanBbq: NabilLandingPage = {
  slug: "korean-bbq-restaurants",
  noun: "Korean BBQ restaurant",
  nounPlural: "Korean BBQ restaurants",
  cuisine: "Korean BBQ",
  metaTitle: "AI Phone Ordering for Korean BBQ Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your Korean BBQ restaurant's phone and takes takeout orders — galbi, bulgogi, bibimbap, banchan, and combo platters — with accurate modifiers and read-back. US$0.60/min.",
  h1: "AI phone ordering for Korean BBQ restaurants",
  eyebrow: "Nabil AI for Korean BBQ",
  intro:
    "Korean BBQ menus are built for sharing — combo platters, multiple proteins, banchan selections. Those orders are complex to take by phone, especially during a busy dinner rush when your staff are managing tables and grills. Nabil AI handles the phone, takes takeout and delivery orders for galbi, bulgogi, bibimbap, and combo platters, and gets every detail right.",
  sampleExchange: {
    caller1: "I want to order the BBQ combo for two — can I get bulgogi and galbi?",
    nabil1: "Sure — the BBQ combo for two with bulgogi and galbi. That comes with rice, three banchan, and your choice of soup. Would you like kimchi jjigae or doenjang jjigae?",
    caller2: "Kimchi jjigae, and add a bibimbap with extra egg.",
    nabil2: "Got it — BBQ combo for two with bulgogi, galbi, kimchi jjigae, plus a bibimbap with extra egg. Is this for pickup or delivery?",
  },
  painPoint: {
    title: "Combo orders with multiple choices tie up the phone for minutes",
    body: "A Korean BBQ combo for four means choosing proteins, sides, soup, and rice for each person — that's a 5-minute phone call minimum, and any misheard choice means a wrong order. Nabil walks callers through every selection methodically and reads back the complete order before placing it.",
  },
  benefits: [
    {
      title: "Multi-protein combos with every choice captured",
      body: "Bulgogi, galbi, spicy pork, chicken — Nabil walks the caller through each protein slot in the combo, captures soup and side choices, and builds the complete order with no missed selections.",
    },
    {
      title: "Takeout orders without pulling staff from the grill",
      body: "Your grill master shouldn't be answering the phone. Nabil handles takeout and delivery calls so your team stays focused on the dining room and the kitchen — phone orders still print on your thermal printer instantly.",
    },
    {
      title: "Phone and online orders in one dashboard",
      body: "Every phone order goes through the same checkout as your website. Kitchen Order App, thermal printer, order dashboard — one system. You can see the recording and transcript of every call alongside the order it produced.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle combo platters with multiple protein choices?",
      a: "Yes — Nabil knows your combo structure and walks callers through each choice: proteins, soup, sides, rice. Everything is captured and read back before the order is placed.",
    },
    {
      q: "Does Nabil know banchan and Korean side dish names?",
      a: "Yes — Nabil works from your actual menu data, so it knows every item by name. If a caller says 'kimchi' or 'japchae' or uses a menu number, Nabil matches it correctly.",
    },
    {
      q: "How does the order reach my kitchen?",
      a: "Phone orders enter the same checkout as online orders. They ring on your Kitchen Order App, print to your thermal printer, and appear on your dashboard — no separate system.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and per-call analytics included.",
    },
  ],
};

/* ─── EUROPEAN / MEDITERRANEAN ─────────────────────────────────────── */

const italian: NabilLandingPage = {
  slug: "italian-restaurants",
  noun: "Italian restaurant",
  nounPlural: "Italian restaurants",
  cuisine: "Italian",
  metaTitle: "AI Phone Ordering for Italian Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your Italian restaurant's phone and takes pasta, pizza, and catering orders conversationally — with modifiers, portion sizes, and read-back confirmation. US$0.60/min.",
  h1: "AI phone ordering for Italian restaurants",
  eyebrow: "Nabil AI for Italian restaurants",
  intro:
    "Pasta with a protein swap, a large catering tray of eggplant parm, half a dozen garlic knots on the side — Italian menus are broad and the phone never stops ringing. Nabil AI answers your calls, takes orders for pastas, entrees, catering trays, and yes, pizzas, and sends every order to your kitchen through the same system as your website.",
  sampleExchange: {
    caller1: "I'd like a chicken parmigiana with a side of penne vodka, and a large Caesar salad.",
    nabil1: "I have a chicken parmigiana, a side of penne vodka, and a large Caesar salad. Would you like to add any garlic bread or dessert?",
    caller2: "Add a garlic bread. How long for pickup?",
    nabil2: "Got it — chicken parm, penne vodka, large Caesar, and garlic bread for pickup. Your estimated pickup time will be about 25 minutes. Can I get a name for the order?",
  },
  painPoint: {
    title: "The phone rings all night and your best cook is answering it",
    body: "Italian restaurants run on volume — pasta dishes, entrees, desserts, and the constant phone calls that come with them. Every call pulls someone off the line or away from plating. Nabil answers the phone so your team stays in the kitchen where they belong.",
  },
  benefits: [
    {
      title: "Pastas, entrees, and catering trays — all handled",
      body: "Penne alla vodka, chicken marsala, a full tray of baked ziti for 20 — Nabil takes orders across your entire menu, captures portion sizes and modifier requests, and reads everything back before placing the order.",
    },
    {
      title: "Upsells that actually happen",
      body: "Nabil suggests add-ons naturally during the conversation — garlic bread, a dessert, an appetizer — the same way a good phone person would. Those small add-ons lift the average ticket without annoying the caller.",
    },
    {
      title: "One system for phone, online, and walk-in orders",
      body: "Phone orders print on your thermal printer and ring on your Kitchen Order App alongside your online orders. Your kitchen sees one unified ticket stream and your dashboard tracks revenue from every channel.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil take pizza orders with custom toppings?",
      a: "Yes — Nabil handles the full pizza builder: sizes, crusts, sauces, toppings, and half-and-half combinations. It's the same system that powers the online pizza builder.",
    },
    {
      q: "Does it handle catering and large-party orders?",
      a: "Yes — catering trays, half trays, full trays, and large-quantity orders are all supported. Nabil walks the caller through options and confirms everything before placing the order.",
    },
    {
      q: "How quickly can I be set up?",
      a: "Setup takes about one business day. We connect Nabil to your phone line (you can forward your existing number or get a new one) and configure it with your full menu.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Includes recordings, transcripts, and a dashboard with analytics for every call.",
    },
  ],
};

const mediterranean: NabilLandingPage = {
  slug: "mediterranean-restaurants",
  noun: "Mediterranean restaurant",
  nounPlural: "Mediterranean & Greek restaurants",
  cuisine: "Mediterranean",
  metaTitle: "AI Phone Ordering for Mediterranean & Greek Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your Mediterranean restaurant's phone and takes gyro, falafel, and platter orders conversationally — build-your-own modifiers, sauces, and sides captured accurately. US$0.60/min.",
  h1: "AI phone ordering for Mediterranean & Greek restaurants",
  eyebrow: "Nabil AI for Mediterranean restaurants",
  intro:
    "Build-your-own gyros, falafel platters with six sauce options, family-style dinners — Mediterranean menus are all about choices, and getting those choices right over the phone takes patience your rush-hour staff don't always have. Nabil AI answers the call, walks customers through every option, and sends the complete order to your kitchen.",
  sampleExchange: {
    caller1: "Can I get a chicken shawarma wrap with hummus and garlic sauce, and a falafel platter?",
    nabil1: "Sure — a chicken shawarma wrap with hummus and garlic sauce, and a falafel platter. The platter comes with your choice of two sides — would you like rice, salad, pita, or fries?",
    caller2: "Rice and salad. And add a side of grape leaves.",
    nabil2: "Got it — chicken shawarma wrap with hummus and garlic sauce, falafel platter with rice and salad, and a side of grape leaves. Is this for pickup or delivery?",
  },
  painPoint: {
    title: "Build-your-own orders take the longest to get right by phone",
    body: "Protein, toppings, sauces, sides, wrap or platter — a single build-your-own gyro has five decisions, and a family order multiplies that. Handwritten phone orders drop details. Nabil captures every modifier and reads the order back, so the kitchen gets it right the first time.",
  },
  benefits: [
    {
      title: "Every sauce, side, and topping captured",
      body: "Hummus or baba ganoush? Garlic sauce or tzatziki? Rice or fries? Nabil walks callers through every choice on build-your-own items and platters, so nothing is missing when the order prints in the kitchen.",
    },
    {
      title: "Family platters and catering orders, handled by phone",
      body: "Large Mediterranean orders — mixed grill platters, family-style dinners, catering trays — are high-value and high-complexity. Nabil takes them methodically, confirms every selection, and places them through your checkout.",
    },
    {
      title: "Phone orders print and ring alongside online orders",
      body: "Every phone order enters the same system as your website. It appears on your Kitchen Order App, prints on your thermal printer, and shows in your dashboard with a full recording and transcript.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle build-your-own wraps and platters?",
      a: "Yes — Nabil walks the caller through each choice: protein, toppings, sauces, and sides. Every selection is captured and read back before the order is placed.",
    },
    {
      q: "Does it handle delivery orders?",
      a: "Yes — Nabil takes the delivery address, checks it against your delivery zones, and places the order for delivery. Out-of-range addresses are caught on the call.",
    },
    {
      q: "How do phone orders reach my kitchen?",
      a: "They go through the same checkout as online orders — ring on your Kitchen Order App, print to your thermal printer, and appear on your dashboard.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and per-call analytics included.",
    },
  ],
};

const middleEastern: NabilLandingPage = {
  slug: "middle-eastern-restaurants",
  noun: "Middle Eastern restaurant",
  nounPlural: "Middle Eastern & halal restaurants",
  cuisine: "Middle Eastern",
  metaTitle: "AI Phone Ordering for Middle Eastern & Halal Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your Middle Eastern restaurant's phone and takes kebab, platter, and family meal orders conversationally — halal menus handled accurately with full read-back. US$0.60/min.",
  h1: "AI phone ordering for Middle Eastern & halal restaurants",
  eyebrow: "Nabil AI for Middle Eastern restaurants",
  intro:
    "Kebab platters, mixed grill for the family, a dozen sides to choose from — Middle Eastern restaurants run on big, customizable orders, and the phone rings constantly. Nabil AI answers your calls, takes orders for kebabs, platters, and family meals, and sends them to your kitchen accurately so your team can focus on the grill.",
  sampleExchange: {
    caller1: "I'd like a mixed grill platter and a lamb shawarma plate for delivery.",
    nabil1: "I have a mixed grill platter and a lamb shawarma plate for delivery. The mixed grill comes with your choice of two sides — would you like rice, hummus, fattoush, or fries?",
    caller2: "Rice and hummus. And add a large order of falafel.",
    nabil2: "Got it — mixed grill platter with rice and hummus, lamb shawarma plate, and a large falafel for delivery. I'll need your delivery address.",
  },
  painPoint: {
    title: "Family-size orders are your highest-margin tickets — and the hardest to take by phone",
    body: "A $70 family platter with six side choices is exactly the kind of order you want — and exactly the kind that gets garbled when someone shouts it over a loud kitchen. Nabil captures every choice methodically and reads it back before placing the order.",
  },
  benefits: [
    {
      title: "Kebab platters and family meals, ordered accurately",
      body: "Mixed grill for four, lamb kebab platter with specific sides, a family tray of chicken shawarma — Nabil handles the complexity of Middle Eastern combo orders and confirms every detail before the order hits the kitchen.",
    },
    {
      title: "Large delivery orders without long phone calls",
      body: "Middle Eastern delivery orders tend to be big — multiple platters, sides, bread, dips. Nabil takes them efficiently, checks the delivery address against your zones, and places the order in your system. Your phone line is free again in minutes.",
    },
    {
      title: "Every call recorded with a full transcript",
      body: "Every phone order comes with a recording, transcript, and timeline on your dashboard. If a customer disputes an order, you have an exact record of what was said and confirmed.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle halal menu requirements?",
      a: "Nabil works from your actual menu data — whatever items you offer are what it presents to callers. It doesn't substitute or suggest items outside your menu.",
    },
    {
      q: "Does Nabil handle family platters with multiple side choices?",
      a: "Yes — Nabil walks callers through each side and protein selection for platters and combos, confirms everything, and reads back the full order before placing it.",
    },
    {
      q: "How does the order reach the kitchen?",
      a: "Phone orders go through the same system as your online orders — Kitchen Order App, thermal printer, and your dashboard. One system for everything.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Includes recordings, transcripts, and analytics for every call.",
    },
  ],
};

/* ─── AMERICAS ─────────────────────────────────────────────────────── */

const mexican: NabilLandingPage = {
  slug: "mexican-restaurants",
  noun: "Mexican restaurant",
  nounPlural: "Mexican restaurants",
  cuisine: "Mexican",
  metaTitle: "AI Phone Ordering for Mexican Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your Mexican restaurant's phone and takes taco, burrito, and catering tray orders conversationally — proteins, salsas, and sides captured accurately. US$0.60/min.",
  h1: "AI phone ordering for Mexican restaurants",
  eyebrow: "Nabil AI for Mexican restaurants",
  intro:
    "Three al pastor tacos, a burrito with no sour cream, a family taco kit for twelve — Mexican orders are fast, customized, and frequent. Nabil AI answers your phone, takes taco, burrito, bowl, and catering orders with every protein and salsa choice captured, and sends them to your kitchen without tying up your counter staff.",
  sampleExchange: {
    caller1: "Can I get four street tacos — two carnitas and two al pastor — and a chicken burrito with no beans?",
    nabil1: "I have four street tacos — two carnitas and two al pastor — and a chicken burrito with no beans. Would you like any sides — rice, chips and guac, or elote?",
    caller2: "Chips and guac. What's the total?",
    nabil2: "Adding chips and guac. Your total is $28.75. Is this for pickup or delivery?",
  },
  painPoint: {
    title: "High-volume phone orders pull your counter person off the line",
    body: "Mexican restaurants with strong takeout business get a constant stream of phone calls — tacos, burritos, family meals, catering. Every call takes your counter person away from the customers standing right in front of them. Nabil answers the phone so your counter stays focused on walk-ins.",
  },
  benefits: [
    {
      title: "Every protein, salsa, and 'no beans' captured",
      body: "Nabil handles build-your-own tacos, burritos, and bowls with all the modifiers — protein choice, salsa, toppings, extras, exclusions. Everything is read back before the order is placed.",
    },
    {
      title: "Catering and family meal orders by phone",
      body: "Taco kits for 12, a catering tray of rice and beans, a party pack — Nabil takes large orders methodically, walks callers through options, and places them through your checkout with every detail confirmed.",
    },
    {
      title: "Phone orders land on your kitchen printer instantly",
      body: "Every phone order enters the same system as your online orders — Kitchen Order App, thermal printer, dashboard. Your kitchen gets one ticket stream and you get recordings and transcripts of every call.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle build-your-own burritos and bowls?",
      a: "Yes — protein, rice, beans, salsa, toppings, and extras are all captured as modifier choices. Nabil walks the caller through each step and confirms the complete build.",
    },
    {
      q: "Does Nabil speak Spanish?",
      a: "Nabil detects the caller's language and responds in kind. If your menu translations are set up, Nabil can take orders in the caller's preferred language.",
    },
    {
      q: "How do catering orders work?",
      a: "Nabil takes catering orders the same way as regular orders — walks through the menu, captures quantities, confirms everything, and places the order through your checkout.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and analytics included.",
    },
  ],
};

const bbq: NabilLandingPage = {
  slug: "bbq-smokehouses",
  noun: "BBQ restaurant",
  nounPlural: "BBQ restaurants & smokehouses",
  cuisine: "BBQ",
  metaTitle: "AI Phone Ordering for BBQ Restaurants & Smokehouses — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your BBQ restaurant's phone and takes brisket, rib, and platter orders conversationally — portion sizes, sides, and sauces captured accurately. US$0.60/min.",
  h1: "AI phone ordering for BBQ restaurants & smokehouses",
  eyebrow: "Nabil AI for BBQ & smokehouses",
  intro:
    "A pound of brisket, a half rack of ribs, two sides of mac and cheese, extra sauce on the side — BBQ orders are big, specific, and often called in by groups. Nabil AI answers your phone, takes orders for meats by the portion, combo platters, and family packs, and gets every side and sauce right so your pitmaster can stay at the smoker.",
  sampleExchange: {
    caller1: "I'd like a half pound of brisket, a quarter rack of ribs, and a pulled pork sandwich.",
    nabil1: "I have a half pound of brisket, a quarter rack of ribs, and a pulled pork sandwich. Each comes with two sides — would you like to choose those now?",
    caller2: "Mac and cheese and coleslaw for the brisket, baked beans and cornbread for the ribs. Fries with the sandwich.",
    nabil2: "Got it — brisket with mac and cheese and coleslaw, ribs with baked beans and cornbread, pulled pork sandwich with fries. Any sauce preference?",
  },
  painPoint: {
    title: "Big group orders by phone are where the mistakes happen",
    body: "A family calling in for five people's worth of BBQ means ten side choices, multiple meats, and sauce preferences — all on a noisy call. One wrong side per person and you've got five unhappy customers. Nabil takes it methodically, per item, and reads back the entire order.",
  },
  benefits: [
    {
      title: "Meats by the portion, combos, and family packs",
      body: "Brisket by the pound, ribs by the rack, combo platters with two-meat or three-meat options — Nabil handles portion-based ordering and walks callers through every side and sauce choice per item.",
    },
    {
      title: "Every side choice tracked per item",
      body: "When each meat comes with two sides, keeping track matters. Nabil captures sides per item — not just 'three mac and cheeses somewhere in the order' — so the kitchen knows exactly what goes with what.",
    },
    {
      title: "Recordings settle 'I said baked beans, not coleslaw' disputes",
      body: "Every call is recorded with a full transcript. If a customer disputes a side choice, you have the exact recording of what they ordered and what Nabil confirmed. No more he-said-she-said.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle meat orders by weight (half pound, full pound)?",
      a: "Yes — Nabil works from your menu structure, so if your brisket is sold by the half pound or full pound, it captures the portion size as part of the order.",
    },
    {
      q: "Does it handle combo platters with multiple side choices per item?",
      a: "Yes — Nabil walks through each item in a combo and asks for the associated side choices. Everything is read back together at the end.",
    },
    {
      q: "How do large catering or party orders work by phone?",
      a: "Nabil takes them step by step — meats, sides, sauces, quantities — and confirms the complete order before placing it. The order enters the same system as all your other orders.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Includes recordings, transcripts, and analytics for every call.",
    },
  ],
};

const burgerJoints: NabilLandingPage = {
  slug: "burger-joints",
  noun: "burger restaurant",
  nounPlural: "burger joints",
  cuisine: "burgers",
  metaTitle: "AI Phone Ordering for Burger Joints — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your burger joint's phone and takes burger, combo, and pickup orders conversationally — custom toppings, sizes, and combos captured accurately. US$0.60/min.",
  h1: "AI phone ordering for burger joints",
  eyebrow: "Nabil AI for burger joints",
  intro:
    "Double smash burger, no pickles, add bacon, make it a combo with onion rings — burger orders are fast and specific. Nabil AI answers your phone, takes build-your-own burger orders with every topping and combo option, and sends them to your kitchen instantly so your line cooks stay on the grill.",
  sampleExchange: {
    caller1: "Can I get a double cheeseburger with bacon and no pickles, and make it a combo?",
    nabil1: "A double cheeseburger with bacon, no pickles, as a combo. Would you like fries or onion rings, and what to drink?",
    caller2: "Onion rings and a Coke. And a chicken sandwich, plain.",
    nabil2: "Got it — double cheeseburger combo with bacon, no pickles, onion rings, and a Coke, plus a plain chicken sandwich. Anything else?",
  },
  painPoint: {
    title: "Lunch rush calls go to voicemail — and voicemail doesn't take orders",
    body: "Burger joints run on speed, and the lunch rush is when the phone rings most and your staff can answer it least. Every call that goes to voicemail is a lost order. Nabil answers every call, takes the order in under two minutes, and sends it to the kitchen — no voicemail, no missed revenue.",
  },
  benefits: [
    {
      title: "Build-your-own burgers with every modifier",
      body: "Patty count, cheese type, toppings, exclusions, 'make it a combo' — Nabil captures the full build and reads it back. A 'double with Swiss, no onion, add jalapeños, combo with fries' arrives at the kitchen exactly right.",
    },
    {
      title: "Fast orders, no staff pulled off the line",
      body: "Nabil takes a typical burger order in under two minutes. Your grill cook stays on the grill, your counter person stays on the counter, and the phone order prints alongside everything else.",
    },
    {
      title: "Phone orders in the same system as online and walk-in",
      body: "Every phone order goes through your existing checkout — Kitchen Order App, thermal printer, dashboard. No side system, no handwritten tickets, no separate workflow.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle combo meals with drink and side choices?",
      a: "Yes — Nabil asks for the side (fries, rings, etc.) and drink choice when a caller says 'make it a combo,' and includes everything in the order.",
    },
    {
      q: "What about custom burgers with many toppings?",
      a: "Nabil captures every topping, exclusion, and extra. 'Add bacon, add mushrooms, no tomato, extra pickles' is all captured and read back before the order is placed.",
    },
    {
      q: "How fast can I be live?",
      a: "Setup takes about one business day — we connect Nabil to your phone line and configure it with your full menu.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Includes recordings, transcripts, and analytics.",
    },
  ],
};

/* ─── SOUTH ASIAN ──────────────────────────────────────────────────── */

const indian: NabilLandingPage = {
  slug: "indian-restaurants",
  noun: "Indian restaurant",
  nounPlural: "Indian restaurants",
  cuisine: "Indian",
  metaTitle: "AI Phone Ordering for Indian Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your Indian restaurant's phone and takes curry, thali, and catering orders conversationally — spice levels, bread choices, and sides captured accurately. US$0.60/min.",
  h1: "AI phone ordering for Indian restaurants",
  eyebrow: "Nabil AI for Indian restaurants",
  intro:
    "Chicken tikka masala, medium spice, with garlic naan and a side of raita — Indian orders are rich with choices and the catering orders are even more complex. Nabil AI answers your phone, captures every spice level, bread choice, and thali selection, and sends the order to your kitchen accurately so your chef stays at the tandoor.",
  sampleExchange: {
    caller1: "I'd like a chicken tikka masala, medium spice, and a lamb vindaloo, extra hot.",
    nabil1: "I have a chicken tikka masala at medium spice and a lamb vindaloo at extra hot. Would you like naan, roti, or rice with those?",
    caller2: "Two garlic naan and one plain basmati rice. And a mango lassi.",
    nabil2: "Got it — chicken tikka masala medium, lamb vindaloo extra hot, two garlic naan, plain basmati rice, and a mango lassi. Is this for pickup or delivery?",
  },
  painPoint: {
    title: "Catering orders by phone tie up your best person for 15 minutes",
    body: "A corporate lunch order for 20 — three curries, two rice options, assorted breads, and appetizers — is exactly the kind of high-value order you want. But taking it by phone means 15 minutes of back-and-forth, and one wrong spice level means a remake. Nabil takes it methodically and confirms everything.",
  },
  benefits: [
    {
      title: "Spice levels, breads, and thali choices — all captured",
      body: "Mild, medium, hot, extra hot — Nabil asks for and confirms the spice level on every dish that has one. Bread choices (naan, roti, paratha), rice options, and thali selections are all handled the same way.",
    },
    {
      title: "High-value catering orders, taken accurately",
      body: "Corporate lunches and event catering are your biggest tickets. Nabil walks through the order item by item, captures quantities and options, and reads back the complete order — no missed items on a $300 catering tray.",
    },
    {
      title: "Every phone order prints alongside your online orders",
      body: "Phone orders go through the same checkout as your website — Kitchen Order App, thermal printer, and your dashboard. You can see the recording and transcript alongside the order it produced.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle spice levels for individual dishes?",
      a: "Yes — Nabil asks for the spice level on every dish that offers one and includes it in the order. If a caller says 'medium' for one curry and 'extra hot' for another, both are captured correctly.",
    },
    {
      q: "Does it handle thali and combo meal selections?",
      a: "Yes — Nabil walks callers through each thali choice: curry, bread, rice, sides. Every selection is confirmed before the order is placed.",
    },
    {
      q: "Can Nabil take large catering orders by phone?",
      a: "Yes — Nabil handles multi-item orders of any size, walking through each item, capturing quantities and options, and reading back the complete order before placing it.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Includes recordings, transcripts, and analytics for every call.",
    },
  ],
};

/* ─── FORMAT / CONCEPT ─────────────────────────────────────────────── */

const fastCasual: NabilLandingPage = {
  slug: "fast-casual-restaurants",
  noun: "fast casual restaurant",
  nounPlural: "fast casual restaurants",
  cuisine: "fast casual",
  metaTitle: "AI Phone Ordering for Fast Casual Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your fast casual restaurant's phone and takes build-your-own orders conversationally — bowls, wraps, and combos with every modifier captured accurately. US$0.60/min.",
  h1: "AI phone ordering for fast casual restaurants",
  eyebrow: "Nabil AI for fast casual",
  intro:
    "Fast casual is built on customization — build your bowl, pick your protein, choose your toppings. Those orders work great on a screen, but they're a nightmare to take by phone when your team is making 50 bowls an hour. Nabil AI answers the call and walks customers through every choice, the same way your counter would, and sends the order to your kitchen.",
  sampleExchange: {
    caller1: "Can I get a burrito bowl with chicken, brown rice, black beans, and corn salsa?",
    nabil1: "A burrito bowl with chicken, brown rice, black beans, and corn salsa. Would you like to add any toppings — cheese, sour cream, guacamole?",
    caller2: "Guac and cheese. And a side of chips.",
    nabil2: "Got it — burrito bowl with chicken, brown rice, black beans, corn salsa, guac, and cheese, plus a side of chips. Is this for pickup?",
  },
  painPoint: {
    title: "Your build-your-own model doesn't translate well to phone calls",
    body: "On a screen, choosing a base, protein, toppings, and sauce takes 30 seconds. On the phone, it takes 3 minutes and your staff member has to walk through every step while the lunch line grows. Nabil does that walk-through conversationally, freeing your team for the people in front of them.",
  },
  benefits: [
    {
      title: "Build-your-own, step by step, by phone",
      body: "Base, protein, toppings, sauce, extras — Nabil walks callers through your build-your-own menu the same way your counter staff would, capturing every choice and reading it back before placing the order.",
    },
    {
      title: "Lunch-rush phone orders without pulling staff",
      body: "Your team is making bowls, wrapping burritos, and serving the line. Nabil answers the phone so nobody has to stop what they're doing. Orders still print on your thermal printer the moment they're placed.",
    },
    {
      title: "Phone and digital orders in one system",
      body: "Every phone order enters the same checkout as your app and website orders. Kitchen Order App, thermal printer, dashboard — one stream. You can see every call's recording and transcript alongside the order.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil walk through a build-your-own menu?",
      a: "Yes — Nabil follows your menu structure step by step: base, protein, toppings, sauce, extras. Each choice is captured and the full build is read back for confirmation.",
    },
    {
      q: "What if a caller wants to order for multiple people?",
      a: "Nabil handles multi-item orders naturally — it takes each item one at a time, confirms it, then asks 'anything else?' until the order is complete.",
    },
    {
      q: "How do phone orders appear in the kitchen?",
      a: "They go through the same checkout system as online orders — ring on your Kitchen Order App and print to your thermal printer.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and analytics included.",
    },
  ],
};

const foodTrucks: NabilLandingPage = {
  slug: "food-trucks",
  noun: "food truck",
  nounPlural: "food trucks",
  cuisine: "food truck",
  metaTitle: "AI Phone Ordering for Food Trucks — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your food truck's phone and takes orders conversationally — even when your crew is heads-down during the lunch rush. Orders print instantly. US$0.60/min.",
  h1: "AI phone ordering for food trucks",
  eyebrow: "Nabil AI for food trucks",
  intro:
    "You're a two-person crew in a truck and the phone is ringing while you're plating. Nobody can answer it. Nabil AI answers for you, takes the caller's order from your menu, and sends it to your kitchen printer so it's ready when they walk up to the window — no missed calls, no interruptions.",
  sampleExchange: {
    caller1: "Hey, are you guys open? I want to pre-order two Korean tacos and a loaded fries for pickup.",
    nabil1: "Yes, we're open! I have two Korean tacos and a loaded fries for pickup. Would you like any drinks or extra sauce?",
    caller2: "A bottled water. How long?",
    nabil2: "Adding a bottled water. Your order should be ready in about 10 minutes. Can I get a name?",
  },
  painPoint: {
    title: "You can't answer the phone when you're the entire kitchen",
    body: "Food trucks run on tiny crews — often two people doing everything. When the phone rings during service, nobody can pick it up without stopping production. Every missed call is a missed sale. Nabil answers every call so your crew stays focused on the window.",
  },
  benefits: [
    {
      title: "Pre-orders without interrupting service",
      body: "Callers place their order by phone and pick it up at the window — no waiting in line, no holding up the queue. Their order prints on your kitchen printer and is ready when they arrive.",
    },
    {
      title: "Never miss a call during peak hours",
      body: "Your busiest hours are exactly when you can't answer the phone. Nabil picks up every call, takes the order conversationally, and sends it to your printer. Zero missed revenue from unanswered calls.",
    },
    {
      title: "Works with your existing setup",
      body: "Nabil sends orders through the same system as your online orders — Kitchen Order App on a tablet, thermal printer if you have one. Phone orders show up alongside everything else.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle a small, simple menu?",
      a: "Yes — Nabil works with menus of any size. A food truck with 8 items gets the same accurate order-taking as a restaurant with 150.",
    },
    {
      q: "What if we change our menu or specials daily?",
      a: "Your menu is managed through the same system as your online ordering page. Update it there and Nabil uses the current version for every call.",
    },
    {
      q: "Do I need special hardware?",
      a: "Just a tablet or phone running the Kitchen Order App. A WiFi thermal printer is optional but recommended — orders can print automatically as they come in.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Includes recordings, transcripts, and analytics.",
    },
  ],
};

const ghostKitchens: NabilLandingPage = {
  slug: "ghost-kitchens",
  noun: "ghost kitchen",
  nounPlural: "ghost kitchens & virtual restaurants",
  cuisine: "ghost kitchen",
  metaTitle: "AI Phone Ordering for Ghost Kitchens & Virtual Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI gives your ghost kitchen a phone presence — answers calls, takes orders from your menu, and routes them to your kitchen. No front-of-house staff needed. US$0.60/min.",
  h1: "AI phone ordering for ghost kitchens & virtual restaurants",
  eyebrow: "Nabil AI for ghost kitchens",
  intro:
    "Ghost kitchens don't have a front door or a host to answer the phone — but customers still want to call. Nabil AI gives your virtual brand a professional phone presence, takes orders conversationally from your menu, and sends them to your kitchen through the same system as your online orders. No receptionist, no missed calls.",
  sampleExchange: {
    caller1: "Hi, is this the place with the smash burgers? I'd like to order for delivery.",
    nabil1: "Yes! I can help you order. What would you like? We have single, double, and triple smash burgers, plus chicken sandwiches and sides.",
    caller2: "Two double smash burgers and an order of loaded fries, please.",
    nabil2: "Two double smash burgers and loaded fries for delivery. I'll need your delivery address to make sure you're in our area.",
  },
  painPoint: {
    title: "No storefront means no phone — but customers still call",
    body: "Customers Google your brand name and call the number. If nobody answers, they assume you're closed and order from somewhere else. Nabil gives your ghost kitchen a phone line that always answers, takes orders, and converts callers into revenue you'd otherwise lose.",
  },
  benefits: [
    {
      title: "A professional phone presence without staff",
      body: "Nabil answers with your brand name, knows your full menu, and takes orders conversationally. Callers get the experience of talking to a real restaurant — because they are, just one without a dining room.",
    },
    {
      title: "Direct orders without marketplace commissions",
      body: "Every phone order goes through your own checkout at 0% commission. For a ghost kitchen already paying 25–30% to delivery apps, a direct phone channel is pure margin improvement.",
    },
    {
      title: "One kitchen, multiple brands, one system",
      body: "If you operate multiple virtual brands from one kitchen, each can have its own phone number with Nabil. Orders from all brands land on the same Kitchen Order App and dashboard.",
    },
  ],
  faqs: [
    {
      q: "Can I have separate phone numbers for separate virtual brands?",
      a: "Yes — each brand can have its own dedicated number with its own menu. Orders from all brands arrive on the same Kitchen Order App so your kitchen sees everything in one place.",
    },
    {
      q: "Does Nabil handle delivery addresses and zone checks?",
      a: "Yes — Nabil asks for the delivery address and checks it against your configured zones before placing the order. Out-of-range callers are told on the call, not after.",
    },
    {
      q: "How do I get a phone number?",
      a: "We provision a phone number for your brand as part of setup, or you can forward an existing number to Nabil. Setup takes about one business day.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and analytics for every call included.",
    },
  ],
};

const catering: NabilLandingPage = {
  slug: "catering-companies",
  noun: "catering company",
  nounPlural: "catering companies",
  cuisine: "catering",
  metaTitle: "AI Phone Ordering for Catering Companies — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your catering company's phone and takes large event orders conversationally — menu selections, quantities, and details captured accurately with full read-back. US$0.60/min.",
  h1: "AI phone ordering for catering companies",
  eyebrow: "Nabil AI for catering companies",
  intro:
    "Catering orders are your biggest tickets and your longest phone calls. A corporate lunch for 40 means walking through protein options, side choices, dietary accommodations, and quantities — 10 to 15 minutes per call. Nabil AI handles those calls, takes every detail, and reads back the complete order before placing it so nothing falls through the cracks.",
  sampleExchange: {
    caller1: "I need to place a catering order for 30 people — lunch next Friday. What do you have for hot entrees?",
    nabil1: "For hot entrees we have chicken marsala, beef stir-fry, and vegetable lasagna, each served as full trays. How many trays would you like and which entrees?",
    caller2: "Two trays of chicken marsala and one vegetable lasagna. What sides come with those?",
    nabil2: "Each tray comes with your choice of two sides — roasted potatoes, seasonal vegetables, Caesar salad, or garlic bread. What would you like for each tray?",
  },
  painPoint: {
    title: "Every catering call is a 15-minute commitment from your best person",
    body: "Catering inquiries are high-value but time-intensive — the caller needs to walk through the menu, choose options for dozens of people, and confirm quantities. That's your office manager or your best salesperson tied to the phone. Nabil handles the order-taking so your team can handle the planning and execution.",
  },
  benefits: [
    {
      title: "Large, complex orders taken methodically",
      body: "Nabil walks through each menu section — entrees, sides, beverages, desserts — captures quantities and selections per item, and reads back the complete order before placing it. Nothing gets lost on a 20-item catering order.",
    },
    {
      title: "Callers get a professional, patient experience",
      body: "Nabil never rushes, never gets flustered by a big order, and never puts the caller on hold. A catering client calling to order for 50 people gets the same attentive service whether it's Monday morning or Friday at 5.",
    },
    {
      title: "Every order recorded with a full transcript",
      body: "Every catering call comes with a recording, transcript, and timeline on your dashboard. If a client says 'I ordered the vegetable lasagna, not the beef,' you have the exact record of what was discussed and confirmed.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle orders for 50+ people with multiple menu selections?",
      a: "Yes — Nabil takes orders of any size, walking through each selection, capturing quantities and options per item, and reading back the full order before placing it.",
    },
    {
      q: "What if a caller has questions about dietary accommodations?",
      a: "Nabil can answer questions based on your menu data (e.g., which items are vegetarian, gluten-free options). For detailed dietary questions beyond what's on the menu, Nabil transfers the call to your team.",
    },
    {
      q: "Can I review the order before confirming it?",
      a: "Yes — Nabil reads back the complete order to the caller and only places it once they confirm. You can also see the order on your dashboard with the full call recording and transcript.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Includes recordings, transcripts, and analytics for every call.",
    },
  ],
};

const veganVegetarian: NabilLandingPage = {
  slug: "vegan-vegetarian-restaurants",
  noun: "vegan restaurant",
  nounPlural: "vegan & vegetarian restaurants",
  cuisine: "vegan",
  metaTitle: "AI Phone Ordering for Vegan & Vegetarian Restaurants — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your vegan or vegetarian restaurant's phone and takes orders conversationally — modifications, substitutions, and dietary requirements captured accurately. US$0.60/min.",
  h1: "AI phone ordering for vegan & vegetarian restaurants",
  eyebrow: "Nabil AI for vegan & vegetarian",
  intro:
    "Your customers care deeply about what's in their food — and they call to ask. 'Is the pesto vegan?' 'Can you sub the cheese for cashew cream?' Nabil AI answers your phone, handles orders and modification requests based on your actual menu data, and sends every order to your kitchen with the details exactly right.",
  sampleExchange: {
    caller1: "Hi, can I get the Buddha bowl with extra avocado and the BBQ jackfruit sandwich?",
    nabil1: "Sure — a Buddha bowl with extra avocado and a BBQ jackfruit sandwich. Would you like to add any sides or drinks?",
    caller2: "A kombucha and a side of sweet potato fries.",
    nabil2: "Got it — Buddha bowl with extra avocado, BBQ jackfruit sandwich, kombucha, and sweet potato fries. Is this for pickup or delivery?",
  },
  painPoint: {
    title: "Dietary questions by phone eat up time you don't have",
    body: "Vegan and vegetarian restaurants get more ingredient questions per call than almost any other concept. 'Is this gluten-free?' 'What oil do you cook with?' Each question adds a minute to the call. Nabil answers menu-based questions instantly from your data, so the order moves forward faster.",
  },
  benefits: [
    {
      title: "Modifications and substitutions, handled from your menu",
      body: "Sub cashew cream for cheese, add extra avocado, hold the croutons — Nabil captures every modification as part of the order and confirms it before placing. Your kitchen gets a clear, accurate ticket.",
    },
    {
      title: "Menu-based ingredient questions answered instantly",
      body: "Nabil works from your actual menu data. If a caller asks 'is the pesto vegan?' and your menu notes say yes, Nabil confirms it. For questions beyond the menu data, Nabil transfers the call to your team.",
    },
    {
      title: "Phone and online orders in one system",
      body: "Every phone order enters the same checkout as your website. Kitchen Order App, thermal printer, dashboard — one stream with recordings and transcripts for every call.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil answer ingredient and allergen questions?",
      a: "Nabil can answer questions based on what's in your menu data — item descriptions, tags, and notes. For detailed allergen or cross-contamination questions beyond that, it transfers the call to your team.",
    },
    {
      q: "Does it handle custom substitutions?",
      a: "Yes — modifications and substitutions available on your menu (e.g., 'sub tofu for tempeh') are captured as part of the order and confirmed before it's placed.",
    },
    {
      q: "How does the order reach my kitchen?",
      a: "Phone orders go through the same system as your online orders — Kitchen Order App, thermal printer, and your dashboard.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and analytics included.",
    },
  ],
};

/* ─── NON-RESTAURANT FOOD SERVICE ──────────────────────────────────── */

const cafes: NabilLandingPage = {
  slug: "cafes-coffee-shops",
  noun: "café",
  nounPlural: "cafés & coffee shops",
  cuisine: "café",
  metaTitle: "AI Phone Ordering for Cafés & Coffee Shops — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your café's phone and takes coffee, drink, and food orders conversationally — milk, syrup, and size choices captured accurately. US$0.60/min.",
  h1: "AI phone ordering for cafés & coffee shops",
  eyebrow: "Nabil AI for cafés & coffee shops",
  intro:
    "Large oat milk latte, extra shot, light ice — coffee orders are fast and specific, and your barista doesn't have a free hand to answer the phone. Nabil AI takes the call, captures every drink customization, and sends the order to your counter so it's ready when the customer walks in.",
  sampleExchange: {
    caller1: "Can I get a large iced oat milk latte with an extra shot and a blueberry muffin?",
    nabil1: "Sure — a large iced oat milk latte with an extra shot and a blueberry muffin. Would you like any sweetener in the latte — vanilla, caramel, or hazelnut?",
    caller2: "Vanilla, please. That's it.",
    nabil2: "Got it — large iced oat milk latte with an extra shot and vanilla, and a blueberry muffin. Can I get a name for the order?",
  },
  painPoint: {
    title: "Small tickets mean every order matters — especially the ones you miss",
    body: "A $6 latte doesn't leave room for missed calls. When a regular calls to pre-order their morning coffee and nobody picks up, they walk into the shop next door. Nabil answers every call and keeps your regulars coming back.",
  },
  benefits: [
    {
      title: "Every milk, syrup, and size choice captured",
      body: "Oat milk, almond milk, extra shot, light ice, vanilla syrup — Nabil captures every drink customization and reads it back before placing the order. Your barista gets a clear ticket, not a garbled phone scribble.",
    },
    {
      title: "Pre-orders that skip the line",
      body: "Callers order ahead and pick up without waiting. The order prints on your counter and is ready when they walk in — faster for them, smoother for your morning rush.",
    },
    {
      title: "Regulars greeted by name",
      body: "Nabil recognizes returning callers and greets them by name. It's the personal touch of a neighbourhood café, even when your team is too busy to pick up the phone.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle complex drink customizations?",
      a: "Yes — milk type, syrup flavours, shot count, ice level, and drink size are all captured as part of the order and confirmed with the caller.",
    },
    {
      q: "Does it handle food orders too?",
      a: "Yes — pastries, sandwiches, salads, whatever's on your menu. Nabil takes drink and food orders together in the same call.",
    },
    {
      q: "Will returning customers be recognized?",
      a: "Yes — Nabil recognizes returning callers by their phone number and greets them by name, with their order history available for fast reorders.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and analytics for every call included.",
    },
  ],
};

const bakeries: NabilLandingPage = {
  slug: "bakeries",
  noun: "bakery",
  nounPlural: "bakeries",
  cuisine: "bakery",
  metaTitle: "AI Phone Ordering for Bakeries — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your bakery's phone and takes pastry, bread, and custom order requests conversationally — item quantities, flavours, and pickup times captured accurately. US$0.60/min.",
  h1: "AI phone ordering for bakeries",
  eyebrow: "Nabil AI for bakeries",
  intro:
    "A dozen assorted croissants, six chocolate, six almond, ready at 8 AM — bakery phone orders are all about quantities, flavours, and timing. Nabil AI answers your calls, takes orders for pastries, breads, and prepared items, and sends them to your kitchen so your bakers can stay in the back.",
  sampleExchange: {
    caller1: "I need a dozen croissants for tomorrow morning — six plain and six chocolate.",
    nabil1: "A dozen croissants — six plain and six chocolate. What time would you like to pick them up?",
    caller2: "8 AM. And add four cinnamon rolls.",
    nabil2: "Got it — six plain croissants, six chocolate croissants, and four cinnamon rolls for pickup tomorrow at 8 AM. Can I get a name?",
  },
  painPoint: {
    title: "Your bakers are in the back and your counter is one person deep",
    body: "Bakeries run lean — the team is in the back baking, and one person works the counter. When the phone rings during the morning rush, that person chooses between the caller and the customer in front of them. Nabil handles the phone so your counter person stays on the counter.",
  },
  benefits: [
    {
      title: "Quantity orders with flavour choices, taken accurately",
      body: "A dozen mixed muffins — four blueberry, four chocolate chip, four banana nut — Nabil captures the quantity and flavour breakdown, reads it back, and sends a clear ticket to your kitchen. No more misheard '4' vs. '14.'",
    },
    {
      title: "Morning pre-orders placed the night before",
      body: "Customers call the evening before to order pastries for tomorrow's pickup. Nabil takes those calls whenever your line is forwarded, so you start the morning with a stack of pre-orders ready to bake.",
    },
    {
      title: "Phone orders in the same system as walk-in and online",
      body: "Every phone order goes through your existing checkout — Kitchen Order App, thermal printer, dashboard. One ticket stream for everything, with recordings and transcripts for every call.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle large quantity orders with specific flavour breakdowns?",
      a: "Yes — Nabil captures the exact quantity and flavour for each item (e.g., '6 plain, 4 chocolate, 2 almond') and reads back the full order for confirmation.",
    },
    {
      q: "Can customers place orders after hours?",
      a: "Yes — when your line is forwarded to Nabil outside business hours, callers can place orders for next-day pickup. The order will be waiting in your system when you open.",
    },
    {
      q: "How does the order reach the kitchen?",
      a: "Phone orders go through the same system as your online orders — Kitchen Order App and thermal printer. Your team sees phone and online orders in one stream.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and analytics included.",
    },
  ],
};

const delis: NabilLandingPage = {
  slug: "delis-sandwich-shops",
  noun: "deli",
  nounPlural: "delis & sandwich shops",
  cuisine: "deli",
  metaTitle: "AI Phone Ordering for Delis & Sandwich Shops — Nabil AI | Fee Free Ordering",
  metaDescription:
    "Nabil AI answers your deli's phone and takes sandwich, sub, and platter orders conversationally — bread, protein, toppings, and condiments captured accurately. US$0.60/min.",
  h1: "AI phone ordering for delis & sandwich shops",
  eyebrow: "Nabil AI for delis & sandwich shops",
  intro:
    "Turkey club on sourdough, no mayo, extra pickles, toasted — deli orders are pure customization, and a lunch-rush phone call takes your sandwich maker off the line. Nabil AI answers your phone, takes sandwich orders with every bread, topping, and condiment choice captured, and sends them to your kitchen so your team keeps building sandwiches.",
  sampleExchange: {
    caller1: "I'd like a turkey club on sourdough, no mayo, extra pickles, and an Italian sub on a hero.",
    nabil1: "A turkey club on sourdough, no mayo, extra pickles, and an Italian sub on a hero. Would you like the turkey club toasted?",
    caller2: "Yes, toasted. And add a bag of chips and a pickle.",
    nabil2: "Got it — turkey club on sourdough toasted, no mayo, extra pickles, Italian sub on a hero, chips, and a pickle. Is this for pickup?",
  },
  painPoint: {
    title: "Lunch rush phone calls are the worst possible interruption",
    body: "Your busiest 90 minutes are exactly when the phone rings most. Every call pulls someone off the sandwich line, slows down the queue, and backs up the kitchen. Nabil takes those calls so your team stays assembling — and the phone orders still print alongside everything else.",
  },
  benefits: [
    {
      title: "Every bread, topping, and 'hold the mayo' captured",
      body: "Nabil handles the full deli build: bread choice, proteins, cheese, toppings, condiments, and exclusions. 'Rye, pastrami, Swiss, mustard, no tomato' arrives at the kitchen as a clear, accurate ticket.",
    },
    {
      title: "Lunch pre-orders that skip the line",
      body: "Office workers call ahead to pre-order their lunch. Nabil takes the call, places the order, and it's ready when they arrive — no waiting in the lunch rush line.",
    },
    {
      title: "Phone orders in the same ticket stream",
      body: "Every phone order goes through your existing checkout — Kitchen Order App, thermal printer, dashboard. Your team sees one stream of tickets, phone and online, and can manage them all from one place.",
    },
  ],
  faqs: [
    {
      q: "Can Nabil handle full sandwich customization — bread, protein, toppings, condiments?",
      a: "Yes — every element of a build-your-own sandwich is captured as modifier choices. Nabil walks through each step and reads back the complete sandwich before placing the order.",
    },
    {
      q: "What about party platters and catering orders?",
      a: "Nabil handles multi-item orders of any size — sandwich platters, sub trays, and catering orders are taken step by step with quantities and options confirmed before placing.",
    },
    {
      q: "How do orders reach the kitchen?",
      a: "Phone orders go through the same system as online orders — Kitchen Order App, thermal printer, and your dashboard. One ticket stream for everything.",
    },
    {
      q: "What does Nabil AI cost?",
      a: "US$0.60 per call-minute with a US$249.99 monthly minimum. Recordings, transcripts, and analytics included.",
    },
  ],
};

/* ─── EXPORT ───────────────────────────────────────────────────────── */

export const NABIL_LANDING_PAGES: NabilLandingPage[] = [
  sushi,
  chinese,
  thai,
  vietnamese,
  koreanBbq,
  italian,
  mediterranean,
  middleEastern,
  mexican,
  bbq,
  burgerJoints,
  indian,
  fastCasual,
  foodTrucks,
  ghostKitchens,
  catering,
  veganVegetarian,
  cafes,
  bakeries,
  delis,
];

export function getNabilLandingPage(slug: string): NabilLandingPage | undefined {
  return NABIL_LANDING_PAGES.find((p) => p.slug === slug);
}
