/**
 * Refundable-deposit redesign (Luigi 2026-07-08) ×38:
 *   ordering.refundableDepositNotice    — customer notice; keeps {amount}
 *   ordering.refundableDepositBadge     — price-line badge; keeps {amount}
 *   ordering.refundableDepositNotTaxed  — receipt / breakdown line
 *   admin.menuEditor.depositAmountLabel — NEW field label (deposit-item editor)
 *   admin.menuEditor.refundableDepositHint — OVERWRITE existing hint copy
 *
 * Idempotent: safe to re-run; only sets these five keys, never reorders or
 * drops siblings. Leaves ordering.refundableDeposit,
 * admin.menuEditor.refundableDeposit and admin.reservations.depositAmount
 * untouched.
 *
 *   npx tsx scripts/i18n-add-deposit-redesign.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Pack = {
  notice: string; // ordering.refundableDepositNotice   — {amount}
  badge: string; // ordering.refundableDepositBadge      — {amount}
  notTaxed: string; // ordering.refundableDepositNotTaxed
  depositLabel: string; // admin.menuEditor.depositAmountLabel
  hint: string; // admin.menuEditor.refundableDepositHint (overwrite)
};

const T: Record<string, Pack> = {
  en: {
    notice: "Includes a {amount} refundable deposit, returned when you bring it back.",
    badge: "+ {amount} refundable deposit",
    notTaxed: "Refundable deposit (not taxed)",
    depositLabel: "Deposit amount",
    hint: "Adds a returnable deposit on top of the price — charged to the customer but not taxed, never discounted or reward-eligible, and fully refundable.",
  },
  fr: {
    notice: "Comprend une caution remboursable de {amount}, restituée lorsque vous la rapportez.",
    badge: "+ {amount} de caution remboursable",
    notTaxed: "Caution remboursable (non taxée)",
    depositLabel: "Montant de la caution",
    hint: "Ajoute une caution consignée au prix — facturée au client mais non taxée, jamais remisée ni éligible aux récompenses, et entièrement remboursable.",
  },
  es: {
    notice: "Incluye un depósito reembolsable de {amount}, devuelto cuando lo traes de vuelta.",
    badge: "+ {amount} de depósito reembolsable",
    notTaxed: "Depósito reembolsable (sin impuestos)",
    depositLabel: "Importe del depósito",
    hint: "Añade un depósito retornable sobre el precio — se cobra al cliente pero no tributa, nunca se descuenta ni es válido para recompensas, y es totalmente reembolsable.",
  },
  it: {
    notice: "Include una cauzione rimborsabile di {amount}, restituita quando la riporti.",
    badge: "+ {amount} di cauzione rimborsabile",
    notTaxed: "Cauzione rimborsabile (non tassata)",
    depositLabel: "Importo della cauzione",
    hint: "Aggiunge una cauzione a rendere sopra il prezzo — addebitata al cliente ma non tassata, mai scontata né valida per i premi, e completamente rimborsabile.",
  },
  pt: {
    notice: "Inclui um depósito reembolsável de {amount}, devolvido quando o trouxer de volta.",
    badge: "+ {amount} de depósito reembolsável",
    notTaxed: "Depósito reembolsável (sem imposto)",
    depositLabel: "Valor do depósito",
    hint: "Adiciona um depósito retornável ao preço — cobrado ao cliente mas não tributado, nunca com desconto nem elegível para recompensas, e totalmente reembolsável.",
  },
  "pt-BR": {
    notice: "Inclui um depósito reembolsável de {amount}, devolvido quando você o traz de volta.",
    badge: "+ {amount} de depósito reembolsável",
    notTaxed: "Depósito reembolsável (sem imposto)",
    depositLabel: "Valor do depósito",
    hint: "Adiciona um depósito retornável ao preço — cobrado do cliente, mas não tributado, nunca com desconto nem elegível para recompensas, e totalmente reembolsável.",
  },
  de: {
    notice: "Enthält eine erstattbare Kaution von {amount}, die bei Rückgabe zurückerstattet wird.",
    badge: "+ {amount} erstattbare Kaution",
    notTaxed: "Erstattbare Kaution (nicht besteuert)",
    depositLabel: "Kautionsbetrag",
    hint: "Fügt dem Preis eine rückgabefähige Kaution hinzu — wird dem Kunden berechnet, aber nicht besteuert, nie rabattiert oder prämienberechtigt und vollständig erstattbar.",
  },
  nl: {
    notice: "Bevat een terugbetaalbare borg van {amount}, die wordt terugbetaald wanneer u deze terugbrengt.",
    badge: "+ {amount} terugbetaalbare borg",
    notTaxed: "Terugbetaalbare borg (niet belast)",
    depositLabel: "Borgbedrag",
    hint: "Voegt een statiegeldborg toe boven op de prijs — wordt aan de klant in rekening gebracht maar niet belast, nooit met korting of in aanmerking voor beloningen, en volledig terugbetaalbaar.",
  },
  ro: {
    notice: "Include un depozit rambursabil de {amount}, returnat când îl aduceți înapoi.",
    badge: "+ {amount} depozit rambursabil",
    notTaxed: "Depozit rambursabil (fără taxe)",
    depositLabel: "Sumă depozit",
    hint: "Adaugă un depozit returnabil peste preț — facturat clientului, dar netaxat, niciodată redus sau eligibil pentru recompense, și complet rambursabil.",
  },
  sv: {
    notice: "Inkluderar en återbetalbar deposition på {amount}, som återlämnas när du lämnar tillbaka den.",
    badge: "+ {amount} återbetalbar deposition",
    notTaxed: "Återbetalbar deposition (ej beskattad)",
    depositLabel: "Depositionsbelopp",
    hint: "Lägger till en pant utöver priset — debiteras kunden men beskattas inte, ges aldrig rabatt eller belöning, och återbetalas helt.",
  },
  da: {
    notice: "Inkluderer et refunderbart depositum på {amount}, som returneres, når du bringer det tilbage.",
    badge: "+ {amount} refunderbart depositum",
    notTaxed: "Refunderbart depositum (ikke beskattet)",
    depositLabel: "Depositumbeløb",
    hint: "Tilføjer et returnerbart depositum oven i prisen — opkræves hos kunden, men beskattes ikke, gives aldrig rabat eller belønning, og refunderes fuldt ud.",
  },
  nb: {
    notice: "Inkluderer et refunderbart depositum på {amount}, som returneres når du leverer det tilbake.",
    badge: "+ {amount} refunderbart depositum",
    notTaxed: "Refunderbart depositum (ikke beskattet)",
    depositLabel: "Depositumbeløp",
    hint: "Legger til et returnerbart depositum i tillegg til prisen — belastes kunden, men beskattes ikke, gis aldri rabatt eller belønning, og refunderes fullt ut.",
  },
  fi: {
    notice: "Sisältää {amount} palautettavan pantin, joka palautetaan, kun tuot sen takaisin.",
    badge: "+ {amount} palautettava pantti",
    notTaxed: "Palautettava pantti (veroton)",
    depositLabel: "Pantin määrä",
    hint: "Lisää hintaan palautettavan pantin — veloitetaan asiakkaalta, mutta sitä ei veroteta, siihen ei koskaan anneta alennusta eikä se oikeuta palkintoihin, ja se palautetaan kokonaan.",
  },
  pl: {
    notice: "Zawiera zwrotną kaucję w wysokości {amount}, zwracaną po jej oddaniu.",
    badge: "+ {amount} zwrotnej kaucji",
    notTaxed: "Zwrotna kaucja (bez podatku)",
    depositLabel: "Kwota kaucji",
    hint: "Dodaje zwrotną kaucję do ceny — pobierana od klienta, ale nieopodatkowana, nigdy nierabatowana ani uprawniająca do nagród, i w pełni zwracana.",
  },
  cs: {
    notice: "Zahrnuje vratnou zálohu {amount}, která se vrací při jejím vrácení.",
    badge: "+ {amount} vratná záloha",
    notTaxed: "Vratná záloha (nezdaněná)",
    depositLabel: "Výše zálohy",
    hint: "Přidává k ceně vratnou zálohu — účtuje se zákazníkovi, ale nezdaňuje se, nikdy se neslevuje ani neopravňuje k odměnám a plně se vrací.",
  },
  sk: {
    notice: "Zahŕňa vratnú zálohu {amount}, ktorá sa vráti pri jej vrátení.",
    badge: "+ {amount} vratná záloha",
    notTaxed: "Vratná záloha (nezdanená)",
    depositLabel: "Výška zálohy",
    hint: "Pridáva k cene vratnú zálohu — účtuje sa zákazníkovi, ale nezdaňuje sa, nikdy sa nezľavňuje ani neoprávňuje na odmeny a plne sa vracia.",
  },
  hu: {
    notice: "Tartalmaz egy {amount} összegű visszatérítendő letétet, amelyet visszahozatalkor visszakap.",
    badge: "+ {amount} visszatérítendő letét",
    notTaxed: "Visszatérítendő letét (adómentes)",
    depositLabel: "Letét összege",
    hint: "Visszaváltható letétet ad az árhoz — a vásárlónak felszámítjuk, de nem adózik, soha nem kedvezményezhető és nem jogosít jutalomra, és teljes mértékben visszatérítendő.",
  },
  el: {
    notice: "Περιλαμβάνει επιστρεπτέα εγγύηση {amount}, που επιστρέφεται όταν την φέρετε πίσω.",
    badge: "+ {amount} επιστρεπτέα εγγύηση",
    notTaxed: "Επιστρεπτέα εγγύηση (χωρίς φόρο)",
    depositLabel: "Ποσό εγγύησης",
    hint: "Προσθέτει μια επιστρεπτέα εγγύηση πάνω από την τιμή — χρεώνεται στον πελάτη αλλά δεν φορολογείται, δεν εκπίπτει ποτέ ούτε είναι επιλέξιμη για επιβραβεύσεις, και επιστρέφεται πλήρως.",
  },
  bg: {
    notice: "Включва възстановим депозит от {amount}, който се връща, когато го върнете.",
    badge: "+ {amount} възстановим депозит",
    notTaxed: "Възстановим депозит (без данък)",
    depositLabel: "Сума на депозита",
    hint: "Добавя възстановим депозит върху цената — начислява се на клиента, но не се облага с данък, никога не се отстъпва и не дава право на награди, и се възстановява напълно.",
  },
  hr: {
    notice: "Uključuje povratni polog od {amount}, koji se vraća kada ga donesete natrag.",
    badge: "+ {amount} povratnog pologa",
    notTaxed: "Povratni polog (bez poreza)",
    depositLabel: "Iznos pologa",
    hint: "Dodaje povratni polog na cijenu — naplaćuje se kupcu, ali se ne oporezuje, nikada se ne popušta niti daje pravo na nagrade, i u potpunosti se vraća.",
  },
  sr: {
    notice: "Uključuje povratni depozit od {amount}, koji se vraća kada ga donesete nazad.",
    badge: "+ {amount} povratnog depozita",
    notTaxed: "Povratni depozit (bez poreza)",
    depositLabel: "Iznos depozita",
    hint: "Dodaje povratni depozit na cenu — naplaćuje se kupcu, ali se ne oporezuje, nikada se ne umanjuje niti daje pravo na nagrade, i u potpunosti se vraća.",
  },
  sl: {
    notice: "Vključuje vračljivo varščino v višini {amount}, ki se povrne, ko jo prinesete nazaj.",
    badge: "+ {amount} vračljive varščine",
    notTaxed: "Vračljiva varščina (neobdavčena)",
    depositLabel: "Znesek varščine",
    hint: "Ceni doda vračljivo varščino — zaračuna se kupcu, a se ne obdavči, nikoli se ne zniža niti ne omogoča nagrad in se v celoti povrne.",
  },
  et: {
    notice: "Sisaldab {amount} tagastatavat tagatist, mis tagastatakse, kui selle tagasi toote.",
    badge: "+ {amount} tagastatav tagatis",
    notTaxed: "Tagastatav tagatis (maksuvaba)",
    depositLabel: "Tagatise summa",
    hint: "Lisab hinnale tagastatava tagatise — võetakse kliendilt, kuid seda ei maksustata, sellele ei tehta kunagi allahindlust ega anna preemiaõigust ja see tagastatakse täielikult.",
  },
  lv: {
    notice: "Ietver atmaksājamu drošības naudu {amount} apmērā, kas tiek atmaksāta, kad to atgriežat.",
    badge: "+ {amount} atmaksājama drošības nauda",
    notTaxed: "Atmaksājama drošības nauda (bez nodokļa)",
    depositLabel: "Drošības naudas summa",
    hint: "Pievieno cenai atmaksājamu drošības naudu — tiek iekasēta no klienta, bet netiek aplikta ar nodokli, nekad netiek atlaista un nedod tiesības uz atlīdzību, un tiek pilnībā atmaksāta.",
  },
  lt: {
    notice: "Įskaičiuotas grąžinamas {amount} užstatas, grąžinamas, kai jį atnešate atgal.",
    badge: "+ {amount} grąžinamas užstatas",
    notTaxed: "Grąžinamas užstatas (neapmokestinamas)",
    depositLabel: "Užstato suma",
    hint: "Prie kainos prideda grąžinamą užstatą — imamas iš kliento, bet neapmokestinamas, niekada nenuolaidžiaujamas ir nesuteikia teisės į atlygį, ir visiškai grąžinamas.",
  },
  tr: {
    notice: "{amount} tutarında iade edilebilir bir depozito içerir, geri getirdiğinizde iade edilir.",
    badge: "+ {amount} iade edilebilir depozito",
    notTaxed: "İade edilebilir depozito (vergiye tabi değil)",
    depositLabel: "Depozito tutarı",
    hint: "Fiyatın üzerine iade edilebilir bir depozito ekler — müşteriden alınır ancak vergilendirilmez, asla indirim uygulanmaz veya ödül kazandırmaz ve tamamen iade edilir.",
  },
  ru: {
    notice: "Включает возвратный депозит {amount}, который возвращается, когда вы приносите его обратно.",
    badge: "+ {amount} возвратный депозит",
    notTaxed: "Возвратный депозит (не облагается налогом)",
    depositLabel: "Сумма депозита",
    hint: "Добавляет к цене возвратный депозит — взимается с клиента, но не облагается налогом, никогда не скидывается и не даёт права на вознаграждение, и полностью возвращается.",
  },
  uk: {
    notice: "Включає поворотний депозит {amount}, який повертається, коли ви приносите його назад.",
    badge: "+ {amount} поворотний депозит",
    notTaxed: "Поворотний депозит (без податку)",
    depositLabel: "Сума депозиту",
    hint: "Додає до ціни поворотний депозит — стягується з клієнта, але не оподатковується, ніколи не знижується та не дає права на винагороду, і повністю повертається.",
  },
  ca: {
    notice: "Inclou un dipòsit reemborsable de {amount}, retornat quan el tornes.",
    badge: "+ {amount} de dipòsit reemborsable",
    notTaxed: "Dipòsit reemborsable (sense impostos)",
    depositLabel: "Import del dipòsit",
    hint: "Afegeix un dipòsit retornable sobre el preu — es cobra al client però no tributa, mai no es descompta ni és elegible per a recompenses, i és totalment reemborsable.",
  },
  id: {
    notice: "Termasuk deposit yang dapat dikembalikan sebesar {amount}, dikembalikan saat Anda membawanya kembali.",
    badge: "+ {amount} deposit yang dapat dikembalikan",
    notTaxed: "Deposit yang dapat dikembalikan (tanpa pajak)",
    depositLabel: "Jumlah deposit",
    hint: "Menambahkan deposit yang dapat dikembalikan di atas harga — dibebankan kepada pelanggan tetapi tidak dikenai pajak, tidak pernah didiskon atau memenuhi syarat hadiah, dan dapat dikembalikan sepenuhnya.",
  },
  vi: {
    notice: "Bao gồm tiền đặt cọc hoàn lại {amount}, được hoàn khi bạn mang trả lại.",
    badge: "+ {amount} tiền đặt cọc hoàn lại",
    notTaxed: "Tiền đặt cọc hoàn lại (không tính thuế)",
    depositLabel: "Số tiền đặt cọc",
    hint: "Thêm khoản đặt cọc hoàn lại vào giá — tính cho khách nhưng không chịu thuế, không bao giờ được giảm giá hoặc đủ điều kiện nhận thưởng, và được hoàn lại toàn bộ.",
  },
  th: {
    notice: "รวมเงินมัดจำที่คืนได้ {amount} ซึ่งจะคืนให้เมื่อคุณนำกลับมาคืน",
    badge: "+ เงินมัดจำที่คืนได้ {amount}",
    notTaxed: "เงินมัดจำที่คืนได้ (ไม่คิดภาษี)",
    depositLabel: "จำนวนมัดจำ",
    hint: "เพิ่มเงินมัดจำที่คืนได้จากราคาสินค้า — เรียกเก็บจากลูกค้าแต่ไม่คิดภาษี ไม่มีส่วนลดหรือสิทธิ์รับรางวัลใด ๆ และคืนเต็มจำนวน",
  },
  zh: {
    notice: "包含 {amount} 可退押金，归还时退回。",
    badge: "+ {amount} 可退押金",
    notTaxed: "可退押金（不计税）",
    depositLabel: "押金金额",
    hint: "在价格之外加收可退押金——向顾客收取但不计税，永不打折也不参与奖励，可全额退还。",
  },
  ja: {
    notice: "{amount} の返金可能なデポジットを含みます。返却時に返金されます。",
    badge: "+ {amount} 返金可能なデポジット",
    notTaxed: "返金可能なデポジット（非課税）",
    depositLabel: "デポジット金額",
    hint: "価格に返却式のデポジットを追加します。お客様に請求されますが課税されず、割引や特典の対象にもならず、全額返金されます。",
  },
  ko: {
    notice: "{amount}의 환불 가능한 보증금이 포함되며, 반납 시 환불됩니다.",
    badge: "+ {amount} 환불 가능한 보증금",
    notTaxed: "환불 가능한 보증금 (비과세)",
    depositLabel: "보증금 금액",
    hint: "가격에 반환식 보증금을 추가합니다 — 고객에게 청구되지만 과세되지 않으며, 할인이나 리워드 대상이 되지 않고 전액 환불됩니다.",
  },
  ar: {
    notice: "يشمل وديعة قابلة للاسترداد بقيمة {amount}، تُعاد عند إرجاعها.",
    badge: "+ {amount} وديعة قابلة للاسترداد",
    notTaxed: "وديعة قابلة للاسترداد (غير خاضعة للضريبة)",
    depositLabel: "مبلغ الوديعة",
    hint: "يضيف وديعة قابلة للإرجاع فوق السعر — تُحصَّل من العميل لكنها غير خاضعة للضريبة، ولا تُخصم أبدًا ولا تؤهل للمكافآت، وتُسترد بالكامل.",
  },
  he: {
    notice: "כולל פיקדון בר-החזר בסך {amount}, המוחזר כאשר אתם מחזירים אותו.",
    badge: "+ {amount} פיקדון בר-החזר",
    notTaxed: "פיקדון בר-החזר (ללא מס)",
    depositLabel: "סכום הפיקדון",
    hint: "מוסיף פיקדון בר-החזר על גבי המחיר — נגבה מהלקוח אך אינו חייב במס, לעולם אינו מוזל או זכאי לתגמולים, ומוחזר במלואו.",
  },
  hi: {
    notice: "इसमें {amount} की वापसी योग्य जमा राशि शामिल है, जो वापस लाने पर लौटा दी जाती है।",
    badge: "+ {amount} वापसी योग्य जमा",
    notTaxed: "वापसी योग्य जमा (कर रहित)",
    depositLabel: "जमा राशि",
    hint: "कीमत के ऊपर एक लौटाने योग्य जमा जोड़ता है — ग्राहक से लिया जाता है लेकिन इस पर कर नहीं लगता, इस पर कभी छूट नहीं मिलती और न ही यह इनाम के योग्य होता है, और यह पूरी तरह वापसी योग्य है।",
  },
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = T[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  const ordering = (json.ordering ??= {});
  ordering.refundableDepositNotice = pack.notice;
  ordering.refundableDepositBadge = pack.badge;
  ordering.refundableDepositNotTaxed = pack.notTaxed;

  const me = ((json.admin ??= {}).menuEditor ??= {});
  me.depositAmountLabel = pack.depositLabel;
  me.refundableDepositHint = pack.hint; // overwrite existing copy

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ deposit-redesign keys written in ${changed} locale file(s)`);
