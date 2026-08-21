/**
 * The spoken "Temporary Closure" line appended to Nabil's call greeting when a
 * service is paused (Restaurant *PausedUntil — the same shared switch the
 * website + kitchen app honour). Luigi 2026-08-20: "if we pause delivery it
 * should allow only pickup … and specify that by phone IMMEDIATELY to callers"
 * — so this is deterministic (composed into the TwiML welcomeGreeting, before
 * the model says a word), rebuilt from the DB on every call.
 *
 * Language: keyed on the store's language (restaurant.defaultLanguage →
 * cfg.primaryLanguage → en), same resolution the greeting itself uses. The
 * ×38 table lives here because the greeting is raw TTS — the model never gets
 * a chance to translate it (unlike the prompt, which stays English and is
 * rephrased by the model in the caller's language).
 *
 * Resume time is spoken in the EN line only: the time-in-words formatter
 * (describeNextOpen) produces English ("this evening at 8:00 PM"), and mixing
 * English time words into a French greeting is worse than omitting them — the
 * model still knows `resumesLocal` from the volatile prompt and gives the time
 * in-language when asked.
 *
 * Deliberately limited to the ORDER channels (pickup / delivery): announcing a
 * paused catering or dine-in to every caller is noise, and the greeting must
 * stay short (spoken). Those pauses still reach the model via the prompt's
 * services line. An owner-written message (VoiceAgentConfig.pauseGreeting)
 * replaces the auto sentence verbatim.
 */
import { describeNextOpen } from "@/lib/voice/local-time-words";

type PausePhrases = {
  pickup: string;
  delivery: string;
  /** {service} paused, {alt} available */
  onePausedAlt: string;
  /** EN only — adds {time} from describeNextOpen */
  onePausedAltTime?: string;
  /** no order channel left */
  ordersPaused: string;
  /** no order channel left, but reservations still bookable */
  ordersPausedReservations: string;
};

/* eslint-disable @typescript-eslint/naming-convention */
const P: Record<string, PausePhrases> = {
  en: {
    pickup: "pickup",
    delivery: "delivery",
    onePausedAlt: "Just so you know, {service} is paused right now — {alt} is still available.",
    onePausedAltTime: "Just so you know, {service} is paused right now and should be back {time} — {alt} is still available.",
    ordersPaused: "Just so you know, we're not taking orders right now, but I'm happy to answer any questions.",
    ordersPausedReservations: "Just so you know, we're not taking orders right now, but I can still book you a table or answer questions.",
  },
  fr: {
    pickup: "le retrait",
    delivery: "la livraison",
    onePausedAlt: "Petite précision : {service} est en pause pour le moment — {alt} reste disponible.",
    ordersPaused: "Petite précision : nous ne prenons pas de commandes pour le moment, mais je peux répondre à vos questions.",
    ordersPausedReservations: "Petite précision : nous ne prenons pas de commandes pour le moment, mais je peux quand même réserver une table ou répondre à vos questions.",
  },
  es: {
    pickup: "la recogida",
    delivery: "el reparto",
    onePausedAlt: "Un aviso: {service} está en pausa en este momento — {alt} sigue disponible.",
    ordersPaused: "Un aviso: no estamos tomando pedidos en este momento, pero con gusto respondo sus preguntas.",
    ordersPausedReservations: "Un aviso: no estamos tomando pedidos en este momento, pero aún puedo reservarle una mesa o responder sus preguntas.",
  },
  it: {
    pickup: "il ritiro",
    delivery: "la consegna",
    onePausedAlt: "Una precisazione: {service} è in pausa al momento — {alt} è comunque disponibile.",
    ordersPaused: "Una precisazione: al momento non prendiamo ordini, ma posso comunque rispondere alle sue domande.",
    ordersPausedReservations: "Una precisazione: al momento non prendiamo ordini, ma posso comunque prenotarle un tavolo o rispondere alle sue domande.",
  },
  pt: {
    pickup: "a recolha",
    delivery: "a entrega",
    onePausedAlt: "Só para avisar: {service} está em pausa neste momento — {alt} continua disponível.",
    ordersPaused: "Só para avisar: não estamos a aceitar pedidos neste momento, mas posso responder às suas perguntas.",
    ordersPausedReservations: "Só para avisar: não estamos a aceitar pedidos neste momento, mas ainda posso reservar uma mesa ou responder às suas perguntas.",
  },
  "pt-BR": {
    pickup: "a retirada",
    delivery: "a entrega",
    onePausedAlt: "Só para avisar: {service} está em pausa no momento — {alt} continua disponível.",
    ordersPaused: "Só para avisar: não estamos aceitando pedidos no momento, mas posso responder às suas perguntas.",
    ordersPausedReservations: "Só para avisar: não estamos aceitando pedidos no momento, mas ainda posso reservar uma mesa ou responder às suas perguntas.",
  },
  de: {
    pickup: "die Abholung",
    delivery: "die Lieferung",
    onePausedAlt: "Nur zur Info: {service} ist gerade pausiert — {alt} ist weiterhin möglich.",
    ordersPaused: "Nur zur Info: wir nehmen gerade keine Bestellungen an, aber ich beantworte gern Ihre Fragen.",
    ordersPausedReservations: "Nur zur Info: wir nehmen gerade keine Bestellungen an, aber ich kann Ihnen weiterhin einen Tisch reservieren oder Fragen beantworten.",
  },
  nl: {
    pickup: "afhalen",
    delivery: "bezorgen",
    onePausedAlt: "Even ter info: {service} is op dit moment gepauzeerd — {alt} kan nog wel.",
    ordersPaused: "Even ter info: we nemen op dit moment geen bestellingen aan, maar ik beantwoord graag uw vragen.",
    ordersPausedReservations: "Even ter info: we nemen op dit moment geen bestellingen aan, maar ik kan nog wel een tafel voor u reserveren of vragen beantwoorden.",
  },
  ro: {
    pickup: "ridicarea comenzii",
    delivery: "livrarea",
    onePausedAlt: "O mențiune: {service} este momentan în pauză — {alt} rămâne disponibilă.",
    ordersPaused: "O mențiune: momentan nu preluăm comenzi, dar vă pot răspunde la întrebări.",
    ordersPausedReservations: "O mențiune: momentan nu preluăm comenzi, dar vă pot rezerva o masă sau răspunde la întrebări.",
  },
  sv: {
    pickup: "avhämtning",
    delivery: "hemkörning",
    onePausedAlt: "Bara så du vet: {service} är pausad just nu — {alt} fungerar fortfarande.",
    ordersPaused: "Bara så du vet: vi tar inte emot beställningar just nu, men jag svarar gärna på frågor.",
    ordersPausedReservations: "Bara så du vet: vi tar inte emot beställningar just nu, men jag kan fortfarande boka ett bord eller svara på frågor.",
  },
  da: {
    pickup: "afhentning",
    delivery: "levering",
    onePausedAlt: "Lige til info: {service} er sat på pause lige nu — {alt} er stadig muligt.",
    ordersPaused: "Lige til info: vi tager ikke imod bestillinger lige nu, men jeg svarer gerne på spørgsmål.",
    ordersPausedReservations: "Lige til info: vi tager ikke imod bestillinger lige nu, men jeg kan stadig booke et bord eller svare på spørgsmål.",
  },
  nb: {
    pickup: "henting",
    delivery: "levering",
    onePausedAlt: "Bare så du vet det: {service} er satt på pause akkurat nå — {alt} er fortsatt mulig.",
    ordersPaused: "Bare så du vet det: vi tar ikke imot bestillinger akkurat nå, men jeg svarer gjerne på spørsmål.",
    ordersPausedReservations: "Bare så du vet det: vi tar ikke imot bestillinger akkurat nå, men jeg kan fortsatt bestille bord til deg eller svare på spørsmål.",
  },
  fi: {
    pickup: "nouto",
    delivery: "kotiinkuljetus",
    onePausedAlt: "Pieni huomio: {service} on juuri nyt tauolla — {alt} on edelleen käytettävissä.",
    ordersPaused: "Pieni huomio: emme ota tilauksia vastaan juuri nyt, mutta vastaan mielelläni kysymyksiin.",
    ordersPausedReservations: "Pieni huomio: emme ota tilauksia vastaan juuri nyt, mutta voin silti varata pöydän tai vastata kysymyksiin.",
  },
  pl: {
    pickup: "odbiór osobisty",
    delivery: "dostawa",
    onePausedAlt: "Drobna informacja: opcja {service} jest chwilowo wstrzymana — opcja {alt} działa normalnie.",
    ordersPaused: "Drobna informacja: w tej chwili nie przyjmujemy zamówień, ale chętnie odpowiem na pytania.",
    ordersPausedReservations: "Drobna informacja: w tej chwili nie przyjmujemy zamówień, ale nadal mogę zarezerwować stolik lub odpowiedzieć na pytania.",
  },
  cs: {
    pickup: "osobní odběr",
    delivery: "rozvoz",
    onePausedAlt: "Jen pro informaci: možnost {service} je momentálně pozastavena — možnost {alt} funguje dál.",
    ordersPaused: "Jen pro informaci: momentálně nepřijímáme objednávky, ale rád vám zodpovím dotazy.",
    ordersPausedReservations: "Jen pro informaci: momentálně nepřijímáme objednávky, ale stále mohu zarezervovat stůl nebo zodpovědět dotazy.",
  },
  sk: {
    pickup: "osobný odber",
    delivery: "rozvoz",
    onePausedAlt: "Len pre informáciu: možnosť {service} je momentálne pozastavená — možnosť {alt} funguje ďalej.",
    ordersPaused: "Len pre informáciu: momentálne neprijímame objednávky, ale rád odpoviem na vaše otázky.",
    ordersPausedReservations: "Len pre informáciu: momentálne neprijímame objednávky, ale stále môžem zarezervovať stôl alebo odpovedať na otázky.",
  },
  hu: {
    pickup: "a személyes átvétel",
    delivery: "a kiszállítás",
    onePausedAlt: "Csak jelzem: {service} jelenleg szünetel — {alt} továbbra is elérhető.",
    ordersPaused: "Csak jelzem: jelenleg nem veszünk fel rendelést, de szívesen válaszolok a kérdéseire.",
    ordersPausedReservations: "Csak jelzem: jelenleg nem veszünk fel rendelést, de asztalt továbbra is tudok foglalni, és kérdésekre is válaszolok.",
  },
  el: {
    pickup: "η παραλαβή",
    delivery: "η διανομή",
    onePausedAlt: "Μια ενημέρωση: {service} είναι προσωρινά σε παύση — {alt} είναι ακόμα διαθέσιμη.",
    ordersPaused: "Μια ενημέρωση: αυτή τη στιγμή δεν δεχόμαστε παραγγελίες, αλλά ευχαρίστως να απαντήσω σε ερωτήσεις.",
    ordersPausedReservations: "Μια ενημέρωση: αυτή τη στιγμή δεν δεχόμαστε παραγγελίες, αλλά μπορώ ακόμα να κλείσω τραπέζι ή να απαντήσω σε ερωτήσεις.",
  },
  bg: {
    pickup: "взимане от място",
    delivery: "доставка",
    onePausedAlt: "Само да отбележа: опцията {service} е временно спряна — опцията {alt} работи нормално.",
    ordersPaused: "Само да отбележа: в момента не приемаме поръчки, но с удоволствие ще отговоря на въпроси.",
    ordersPausedReservations: "Само да отбележа: в момента не приемаме поръчки, но все още мога да запазя маса или да отговоря на въпроси.",
  },
  hr: {
    pickup: "osobno preuzimanje",
    delivery: "dostava",
    onePausedAlt: "Samo napomena: opcija {service} trenutno je pauzirana — opcija {alt} i dalje radi.",
    ordersPaused: "Samo napomena: trenutno ne zaprimamo narudžbe, ali rado ću odgovoriti na pitanja.",
    ordersPausedReservations: "Samo napomena: trenutno ne zaprimamo narudžbe, ali i dalje mogu rezervirati stol ili odgovoriti na pitanja.",
  },
  sr: {
    pickup: "лично преузимање",
    delivery: "достава",
    onePausedAlt: "Само напомена: опција {service} је тренутно паузирана — опција {alt} и даље ради.",
    ordersPaused: "Само напомена: тренутно не примамо поруџбине, али радо ћу одговорити на питања.",
    ordersPausedReservations: "Само напомена: тренутно не примамо поруџбине, али и даље могу да резервишем сто или одговорим на питања.",
  },
  sl: {
    pickup: "osebni prevzem",
    delivery: "dostava",
    onePausedAlt: "Samo obvestilo: možnost {service} je trenutno zaustavljena — možnost {alt} še deluje.",
    ordersPaused: "Samo obvestilo: trenutno ne sprejemamo naročil, z veseljem pa odgovorim na vprašanja.",
    ordersPausedReservations: "Samo obvestilo: trenutno ne sprejemamo naročil, lahko pa še vedno rezerviram mizo ali odgovorim na vprašanja.",
  },
  et: {
    pickup: "kättesaamine",
    delivery: "kojuvedu",
    onePausedAlt: "Väike teade: {service} on hetkel peatatud — {alt} on endiselt saadaval.",
    ordersPaused: "Väike teade: hetkel me tellimusi vastu ei võta, kuid vastan hea meelega küsimustele.",
    ordersPausedReservations: "Väike teade: hetkel me tellimusi vastu ei võta, kuid saan siiski laua broneerida või küsimustele vastata.",
  },
  lv: {
    pickup: "saņemšana uz vietas",
    delivery: "piegāde",
    onePausedAlt: "Neliela piezīme: {service} šobrīd ir apturēta — {alt} joprojām darbojas.",
    ordersPaused: "Neliela piezīme: šobrīd pasūtījumus nepieņemam, bet labprāt atbildēšu uz jautājumiem.",
    ordersPausedReservations: "Neliela piezīme: šobrīd pasūtījumus nepieņemam, bet joprojām varu rezervēt galdiņu vai atbildēt uz jautājumiem.",
  },
  lt: {
    pickup: "atsiėmimas vietoje",
    delivery: "pristatymas",
    onePausedAlt: "Nedidelė pastaba: {service} šiuo metu sustabdytas — {alt} vis dar veikia.",
    ordersPaused: "Nedidelė pastaba: šiuo metu užsakymų nepriimame, bet mielai atsakysiu į klausimus.",
    ordersPausedReservations: "Nedidelė pastaba: šiuo metu užsakymų nepriimame, bet vis dar galiu rezervuoti staliuką arba atsakyti į klausimus.",
  },
  tr: {
    pickup: "gel-al",
    delivery: "paket servis",
    onePausedAlt: "Küçük bir not: {service} şu anda duraklatıldı — {alt} hâlâ mevcut.",
    ordersPaused: "Küçük bir not: şu anda sipariş almıyoruz ama sorularınızı memnuniyetle yanıtlarım.",
    ordersPausedReservations: "Küçük bir not: şu anda sipariş almıyoruz ama yine de masa ayırtabilir veya sorularınızı yanıtlayabilirim.",
  },
  ru: {
    pickup: "самовывоз",
    delivery: "доставка",
    onePausedAlt: "Небольшое уточнение: опция {service} сейчас приостановлена — опция {alt} работает как обычно.",
    ordersPaused: "Небольшое уточнение: сейчас мы не принимаем заказы, но я с удовольствием отвечу на вопросы.",
    ordersPausedReservations: "Небольшое уточнение: сейчас мы не принимаем заказы, но я всё ещё могу забронировать столик или ответить на вопросы.",
  },
  uk: {
    pickup: "самовивіз",
    delivery: "доставка",
    onePausedAlt: "Невелике уточнення: опція {service} зараз призупинена — опція {alt} працює як зазвичай.",
    ordersPaused: "Невелике уточнення: зараз ми не приймаємо замовлення, але я залюбки відповім на запитання.",
    ordersPausedReservations: "Невелике уточнення: зараз ми не приймаємо замовлення, але я все ще можу забронювати столик або відповісти на запитання.",
  },
  ca: {
    pickup: "la recollida",
    delivery: "el repartiment",
    onePausedAlt: "Un avís: {service} està en pausa ara mateix — {alt} continua disponible.",
    ordersPaused: "Un avís: ara mateix no prenem comandes, però amb molt de gust respondré les vostres preguntes.",
    ordersPausedReservations: "Un avís: ara mateix no prenem comandes, però encara puc reservar-vos una taula o respondre preguntes.",
  },
  id: {
    pickup: "ambil sendiri",
    delivery: "pesan antar",
    onePausedAlt: "Sekadar info: layanan {service} sedang dijeda — layanan {alt} masih tersedia.",
    ordersPaused: "Sekadar info: saat ini kami belum menerima pesanan, tapi saya senang menjawab pertanyaan Anda.",
    ordersPausedReservations: "Sekadar info: saat ini kami belum menerima pesanan, tapi saya masih bisa memesankan meja atau menjawab pertanyaan.",
  },
  vi: {
    pickup: "tự đến lấy",
    delivery: "giao hàng",
    onePausedAlt: "Xin lưu ý: dịch vụ {service} đang tạm dừng — dịch vụ {alt} vẫn hoạt động.",
    ordersPaused: "Xin lưu ý: hiện tại chúng tôi chưa nhận đơn hàng, nhưng tôi rất sẵn lòng giải đáp thắc mắc.",
    ordersPausedReservations: "Xin lưu ý: hiện tại chúng tôi chưa nhận đơn hàng, nhưng tôi vẫn có thể đặt bàn hoặc giải đáp thắc mắc.",
  },
  th: {
    pickup: "รับเองที่ร้าน",
    delivery: "จัดส่ง",
    onePausedAlt: "ขอแจ้งให้ทราบ: บริการ{service}หยุดชั่วคราวอยู่ตอนนี้ — บริการ{alt}ยังใช้ได้ตามปกติ",
    ordersPaused: "ขอแจ้งให้ทราบ: ตอนนี้เรายังไม่รับออเดอร์ แต่ยินดีตอบคำถาม",
    ordersPausedReservations: "ขอแจ้งให้ทราบ: ตอนนี้เรายังไม่รับออเดอร์ แต่ยังจองโต๊ะหรือตอบคำถามได้",
  },
  zh: {
    pickup: "自取",
    delivery: "外送",
    onePausedAlt: "温馨提示：{service}服务目前暂停——{alt}服务仍然可用。",
    ordersPaused: "温馨提示：我们目前暂不接单，但我很乐意回答您的问题。",
    ordersPausedReservations: "温馨提示：我们目前暂不接单，但仍然可以为您订位或解答问题。",
  },
  ja: {
    pickup: "お持ち帰り",
    delivery: "デリバリー",
    onePausedAlt: "お知らせです。ただいま{service}は一時休止中ですが、{alt}はご利用いただけます。",
    ordersPaused: "お知らせです。ただいまご注文の受付を一時休止していますが、ご質問には喜んでお答えします。",
    ordersPausedReservations: "お知らせです。ただいまご注文の受付を一時休止していますが、お席のご予約やご質問は引き続き承ります。",
  },
  ko: {
    pickup: "포장",
    delivery: "배달",
    onePausedAlt: "안내 말씀드립니다. 현재 {service} 서비스는 일시 중단 중이며, {alt} 서비스는 정상 이용 가능합니다.",
    ordersPaused: "안내 말씀드립니다. 현재 주문 접수가 일시 중단되었지만, 문의는 기꺼이 도와드리겠습니다.",
    ordersPausedReservations: "안내 말씀드립니다. 현재 주문 접수가 일시 중단되었지만, 테이블 예약이나 문의는 계속 도와드릴 수 있습니다.",
  },
  ar: {
    pickup: "الاستلام من المطعم",
    delivery: "التوصيل",
    onePausedAlt: "للعلم فقط: خدمة {service} متوقفة مؤقتًا الآن — خدمة {alt} لا تزال متاحة.",
    ordersPaused: "للعلم فقط: لا نستقبل الطلبات حاليًا، لكن يسعدني الإجابة عن أسئلتكم.",
    ordersPausedReservations: "للعلم فقط: لا نستقبل الطلبات حاليًا، لكن ما زال بإمكاني حجز طاولة أو الإجابة عن الأسئلة.",
  },
  he: {
    pickup: "איסוף עצמי",
    delivery: "משלוח",
    onePausedAlt: "רק שתדעו: שירות {service} מושהה כרגע — שירות {alt} עדיין זמין.",
    ordersPaused: "רק שתדעו: אנחנו לא מקבלים הזמנות כרגע, אבל אשמח לענות על שאלות.",
    ordersPausedReservations: "רק שתדעו: אנחנו לא מקבלים הזמנות כרגע, אבל עדיין אפשר להזמין שולחן או לשאול שאלות.",
  },
  hi: {
    pickup: "पिकअप",
    delivery: "डिलीवरी",
    onePausedAlt: "एक सूचना: {service} सेवा अभी कुछ समय के लिए रुकी हुई है — {alt} सेवा अभी भी उपलब्ध है।",
    ordersPaused: "एक सूचना: हम अभी ऑर्डर नहीं ले रहे हैं, लेकिन आपके सवालों के जवाब देने में मुझे खुशी होगी।",
    ordersPausedReservations: "एक सूचना: हम अभी ऑर्डर नहीं ले रहे हैं, लेकिन टेबल बुकिंग या सवालों में मदद अब भी उपलब्ध है।",
  },
};
/* eslint-enable @typescript-eslint/naming-convention */

/** "pt-BR" exact → "pt-BR"; otherwise region-stripped ("fr-CA" → "fr"); unknown → "en". */
export function resolvePausePhrases(lang: string | null | undefined): PausePhrases {
  const raw = (lang || "en").trim();
  if (P[raw]) return P[raw];
  const base = raw.toLowerCase().split(/[-_]/)[0];
  return P[base] ?? P.en;
}

type ChannelState = { offered: boolean; pausedUntil: Date | string | null };

export type PauseAnnouncementInput = {
  pickup: ChannelState;
  delivery: ChannelState;
  reservations: ChannelState;
  now?: Date;
  timezone?: string | null;
  hoursFormat: "12h" | "24h";
  lang?: string | null;
  /** VoiceAgentConfig.pauseGreeting — owner's own wording, replaces the auto sentence. */
  customGreeting?: string | null;
  canBookReservations?: boolean;
};

function pauseEnd(v: Date | string | null, now: Date): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime()) return null;
  return d;
}

/**
 * "" when no offered order channel is paused. Otherwise one short spoken
 * sentence (owner's custom message verbatim when set).
 */
export function buildPauseAnnouncement(input: PauseAnnouncementInput): string {
  const now = input.now ?? new Date();
  const pickupPause = input.pickup.offered ? pauseEnd(input.pickup.pausedUntil, now) : null;
  const deliveryPause = input.delivery.offered ? pauseEnd(input.delivery.pausedUntil, now) : null;
  if (!pickupPause && !deliveryPause) return "";

  const custom = (input.customGreeting || "").trim();
  if (custom) return custom.slice(0, 200);

  const t = resolvePausePhrases(input.lang);
  const remaining: Array<"pickup" | "delivery"> = [];
  if (input.pickup.offered && !pickupPause) remaining.push("pickup");
  if (input.delivery.offered && !deliveryPause) remaining.push("delivery");

  if (remaining.length === 0) {
    // Nothing orderable by phone. Offer the table only when it is real:
    // reservations offered, not themselves paused, and the agent may book.
    const reservationsOk =
      input.reservations.offered &&
      !pauseEnd(input.reservations.pausedUntil, now) &&
      input.canBookReservations !== false;
    return reservationsOk ? t.ordersPausedReservations : t.ordersPaused;
  }

  const paused: "pickup" | "delivery" = pickupPause ? "pickup" : "delivery";
  const pausedUntil = (pickupPause ?? deliveryPause)!;
  const alt = remaining[0];
  // Resume time in words, EN only (see header). describeNextOpen is the same
  // formatter the reopen time uses — a FACT computed here, never by the model.
  if (t.onePausedAltTime) {
    try {
      const time = describeNextOpen(pausedUntil, now, input.timezone || undefined, input.hoursFormat);
      return t.onePausedAltTime.replace("{service}", t[paused]).replace("{time}", time).replace("{alt}", t[alt]);
    } catch {
      /* fall through to the timeless line */
    }
  }
  return t.onePausedAlt.replace("{service}", t[paused]).replace("{alt}", t[alt]);
}
