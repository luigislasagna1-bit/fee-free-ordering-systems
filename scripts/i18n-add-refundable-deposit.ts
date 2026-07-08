/**
 * Refundable-deposit item (Luigi 2026-07-07) ×38:
 *   admin.menuEditor.refundableDeposit      — item-editor toggle label
 *   admin.menuEditor.refundableDepositHint  — explainer shown when it's ON
 *   ordering.refundableDeposit              — customer-facing badge on the line
 *   npx tsx scripts/i18n-add-refundable-deposit.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Pack = { label: string; hint: string };

const T: Record<string, Pack> = {
  en: { label: "Refundable deposit", hint: "Charged to the customer but not taxed. Never discounted or eligible for rewards, and fully refundable." },
  fr: { label: "Caution remboursable", hint: "Facturée au client mais non taxée. Jamais remisée ni éligible aux récompenses, et entièrement remboursable." },
  es: { label: "Depósito reembolsable", hint: "Se cobra al cliente pero no lleva impuestos. Nunca se descuenta ni es elegible para recompensas, y es totalmente reembolsable." },
  it: { label: "Cauzione rimborsabile", hint: "Addebitata al cliente ma non tassata. Mai scontata né idonea ai premi, e completamente rimborsabile." },
  pt: { label: "Depósito reembolsável", hint: "Cobrado ao cliente mas sem impostos. Nunca descontado nem elegível para recompensas, e totalmente reembolsável." },
  "pt-BR": { label: "Depósito reembolsável", hint: "Cobrado do cliente mas sem impostos. Nunca com desconto nem elegível para recompensas, e totalmente reembolsável." },
  de: { label: "Erstattbare Kaution", hint: "Wird dem Kunden berechnet, aber nicht besteuert. Nie rabattiert oder prämienberechtigt und vollständig erstattbar." },
  nl: { label: "Terugbetaalbare borg", hint: "Wordt aan de klant in rekening gebracht maar niet belast. Nooit met korting of in aanmerking voor beloningen, en volledig terugbetaalbaar." },
  ro: { label: "Depozit rambursabil", hint: "Se percepe clientului dar nu se impozitează. Niciodată redus sau eligibil pentru recompense, și complet rambursabil." },
  sv: { label: "Återbetalbar deposition", hint: "Debiteras kunden men beskattas inte. Aldrig rabatterad eller berättigad till belöningar, och helt återbetalbar." },
  da: { label: "Refunderbart depositum", hint: "Opkræves hos kunden men beskattes ikke. Aldrig rabatteret eller berettiget til belønninger, og fuldt refunderbart." },
  nb: { label: "Refunderbart depositum", hint: "Belastes kunden, men beskattes ikke. Aldri rabattert eller kvalifisert for belønninger, og fullt refunderbart." },
  fi: { label: "Palautettava pantti", hint: "Veloitetaan asiakkaalta mutta ei veroteta. Ei koskaan alennettu tai palkintoihin oikeutettu, ja täysin palautettavissa." },
  pl: { label: "Zwrotna kaucja", hint: "Pobierana od klienta, ale nieopodatkowana. Nigdy nie objęta rabatem ani nagrodami i w pełni zwrotna." },
  cs: { label: "Vratná záloha", hint: "Účtuje se zákazníkovi, ale nedaní se. Nikdy se neslevňuje ani není způsobilá k odměnám a je plně vratná." },
  sk: { label: "Vratná záloha", hint: "Účtuje sa zákazníkovi, ale nezdaňuje sa. Nikdy sa nezľavňuje ani nie je oprávnená na odmeny a je plne vratná." },
  hu: { label: "Visszatérítendő letét", hint: "A vevőnek felszámítjuk, de nem adózik. Soha nem kedvezményes, jutalomra sem jogosít, és teljesen visszatéríthető." },
  el: { label: "Επιστρεπτέα εγγύηση", hint: "Χρεώνεται στον πελάτη αλλά δεν φορολογείται. Ποτέ με έκπτωση ούτε επιλέξιμη για ανταμοιβές, και πλήρως επιστρεπτέα." },
  bg: { label: "Възстановим депозит", hint: "Начислява се на клиента, но не се облага с данък. Никога не се намалява, нито дава право на награди, и подлежи на пълно възстановяване." },
  hr: { label: "Povratni polog", hint: "Naplaćuje se kupcu, ali se ne oporezuje. Nikada se ne umanjuje niti daje pravo na nagrade te je u potpunosti povratni." },
  sr: { label: "Povratni depozit", hint: "Naplaćuje se kupcu, ali se ne oporezuje. Nikada se ne umanjuje niti daje pravo na nagrade i u potpunosti je povratan." },
  sl: { label: "Vračljiva varščina", hint: "Zaračuna se stranki, a ni obdavčena. Nikoli ni znižana ali upravičena do nagrad in je v celoti vračljiva." },
  et: { label: "Tagastatav tagatis", hint: "Kliendile esitatakse arve, kuid seda ei maksustata. Kunagi ei allahinnata ega anna õigust preemiatele ning on täielikult tagastatav." },
  lv: { label: "Atmaksājama drošības nauda", hint: "Tiek iekasēta no klienta, bet netiek aplikta ar nodokli. Nekad netiek atlaista vai kvalificēta atlīdzībām, un ir pilnībā atmaksājama." },
  lt: { label: "Grąžinamas užstatas", hint: "Priskaičiuojamas klientui, bet neapmokestinamas. Niekada netaikoma nuolaida ar apdovanojimai, ir visiškai grąžinamas." },
  tr: { label: "İade edilebilir depozito", hint: "Müşteriden tahsil edilir ancak vergilendirilmez. Asla indirim veya ödül kapsamına girmez ve tamamen iade edilebilir." },
  ru: { label: "Возвратный депозит", hint: "Взимается с клиента, но не облагается налогом. Никогда не участвует в скидках и вознаграждениях, полностью возвращается." },
  uk: { label: "Поворотний депозит", hint: "Стягується з клієнта, але не оподатковується. Ніколи не знижується та не дає право на винагороди, повністю повертається." },
  ca: { label: "Dipòsit reemborsable", hint: "Es cobra al client però no té impostos. Mai no es descompta ni és elegible per a recompenses, i és totalment reemborsable." },
  id: { label: "Deposit yang dapat dikembalikan", hint: "Dibebankan ke pelanggan tetapi tidak dikenai pajak. Tidak pernah didiskon atau memenuhi syarat hadiah, dan sepenuhnya dapat dikembalikan." },
  vi: { label: "Tiền đặt cọc hoàn lại", hint: "Được tính cho khách nhưng không chịu thuế. Không bao giờ được giảm giá hay đủ điều kiện nhận thưởng, và hoàn lại đầy đủ." },
  th: { label: "เงินมัดจำที่คืนได้", hint: "เรียกเก็บจากลูกค้าแต่ไม่คิดภาษี ไม่มีส่วนลดหรือสิทธิ์รับรางวัล และคืนเงินได้เต็มจำนวน" },
  zh: { label: "可退押金", hint: "向顾客收取但不计税。永不打折，也不参与奖励，可全额退还。" },
  ja: { label: "返金可能なデポジット", hint: "お客様に請求されますが課税されません。割引や特典の対象にはならず、全額返金できます。" },
  ko: { label: "환불 가능한 보증금", hint: "고객에게 청구되지만 과세되지 않습니다. 할인이나 보상 대상이 아니며 전액 환불됩니다." },
  ar: { label: "وديعة قابلة للاسترداد", hint: "تُحصَّل من العميل لكنها غير خاضعة للضريبة. لا تُخصَّم أبدًا ولا تؤهّل للمكافآت، وقابلة للاسترداد بالكامل." },
  he: { label: "פיקדון בר-החזר", hint: "מחויב מהלקוח אך אינו ממוסה. לעולם אינו מוזל או זכאי לתגמולים, וניתן להחזר מלא." },
  hi: { label: "वापसी योग्य जमा", hint: "ग्राहक से लिया जाता है लेकिन कर नहीं लगता। कभी छूट या पुरस्कार के योग्य नहीं, और पूरी तरह वापसी योग्य।" },
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = T[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const me = ((json.admin ??= {}).menuEditor ??= {});
  me.refundableDeposit = pack.label;
  me.refundableDepositHint = pack.hint;
  (json.ordering ??= {}).refundableDeposit = pack.label;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ 3 keys added in ${changed} locale file(s)`);
