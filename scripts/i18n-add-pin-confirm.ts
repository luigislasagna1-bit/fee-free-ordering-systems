/**
 * Adds checkout.confirmPinCta / pinConfirmedLabel / adjustPin across 38 locales.
 *
 * Luigi 2026-08-12: "once we move the pin there should be a DONE or CONFIRM
 * button". Without one the map just sits there — the customer has no way to say
 * "yes, that's my door", so they scroll past and nothing is settled.
 *
 * Kept short: these sit on one line under a 180px map, often on a phone.
 */
import { readFileSync, writeFileSync } from "node:fs";

const T: Record<string, { confirmPinCta: string; pinConfirmedLabel: string; adjustPin: string }> = {
  en: { confirmPinCta: "Use this spot", pinConfirmedLabel: "Delivery spot confirmed", adjustPin: "Adjust" },
  ar: { confirmPinCta: "استخدم هذا الموقع", pinConfirmedLabel: "تم تأكيد موقع التوصيل", adjustPin: "تعديل" },
  bg: { confirmPinCta: "Използвай това място", pinConfirmedLabel: "Мястото за доставка е потвърдено", adjustPin: "Промени" },
  ca: { confirmPinCta: "Usa aquest punt", pinConfirmedLabel: "Punt de lliurament confirmat", adjustPin: "Ajusta" },
  cs: { confirmPinCta: "Použít toto místo", pinConfirmedLabel: "Místo doručení potvrzeno", adjustPin: "Upravit" },
  da: { confirmPinCta: "Brug dette sted", pinConfirmedLabel: "Leveringssted bekræftet", adjustPin: "Juster" },
  de: { confirmPinCta: "Diesen Punkt verwenden", pinConfirmedLabel: "Lieferort bestätigt", adjustPin: "Ändern" },
  el: { confirmPinCta: "Χρήση αυτού του σημείου", pinConfirmedLabel: "Το σημείο παράδοσης επιβεβαιώθηκε", adjustPin: "Αλλαγή" },
  es: { confirmPinCta: "Usar este punto", pinConfirmedLabel: "Punto de entrega confirmado", adjustPin: "Ajustar" },
  et: { confirmPinCta: "Kasuta seda kohta", pinConfirmedLabel: "Kohaletoimetamise koht kinnitatud", adjustPin: "Muuda" },
  fi: { confirmPinCta: "Käytä tätä paikkaa", pinConfirmedLabel: "Toimituspaikka vahvistettu", adjustPin: "Muuta" },
  fr: { confirmPinCta: "Utiliser ce point", pinConfirmedLabel: "Point de livraison confirmé", adjustPin: "Modifier" },
  he: { confirmPinCta: "השתמשו במיקום הזה", pinConfirmedLabel: "מיקום המשלוח אושר", adjustPin: "שינוי" },
  hi: { confirmPinCta: "यही जगह चुनें", pinConfirmedLabel: "डिलीवरी की जगह तय हो गई", adjustPin: "बदलें" },
  hr: { confirmPinCta: "Koristi ovo mjesto", pinConfirmedLabel: "Mjesto dostave potvrđeno", adjustPin: "Promijeni" },
  hu: { confirmPinCta: "Ezt a pontot használom", pinConfirmedLabel: "Kiszállítási pont megerősítve", adjustPin: "Módosítás" },
  id: { confirmPinCta: "Gunakan lokasi ini", pinConfirmedLabel: "Lokasi pengiriman dikonfirmasi", adjustPin: "Ubah" },
  it: { confirmPinCta: "Usa questo punto", pinConfirmedLabel: "Punto di consegna confermato", adjustPin: "Modifica" },
  ja: { confirmPinCta: "この場所にする", pinConfirmedLabel: "配達場所を確認しました", adjustPin: "変更" },
  ko: { confirmPinCta: "이 위치로 설정", pinConfirmedLabel: "배달 위치 확인됨", adjustPin: "변경" },
  lt: { confirmPinCta: "Naudoti šią vietą", pinConfirmedLabel: "Pristatymo vieta patvirtinta", adjustPin: "Keisti" },
  lv: { confirmPinCta: "Izmantot šo vietu", pinConfirmedLabel: "Piegādes vieta apstiprināta", adjustPin: "Mainīt" },
  nb: { confirmPinCta: "Bruk dette stedet", pinConfirmedLabel: "Leveringssted bekreftet", adjustPin: "Juster" },
  nl: { confirmPinCta: "Gebruik deze plek", pinConfirmedLabel: "Bezorglocatie bevestigd", adjustPin: "Aanpassen" },
  pl: { confirmPinCta: "Użyj tego miejsca", pinConfirmedLabel: "Miejsce dostawy potwierdzone", adjustPin: "Zmień" },
  "pt-BR": { confirmPinCta: "Usar este ponto", pinConfirmedLabel: "Local de entrega confirmado", adjustPin: "Ajustar" },
  pt: { confirmPinCta: "Usar este ponto", pinConfirmedLabel: "Local de entrega confirmado", adjustPin: "Ajustar" },
  ro: { confirmPinCta: "Folosește acest punct", pinConfirmedLabel: "Punct de livrare confirmat", adjustPin: "Modifică" },
  ru: { confirmPinCta: "Использовать это место", pinConfirmedLabel: "Место доставки подтверждено", adjustPin: "Изменить" },
  sk: { confirmPinCta: "Použiť toto miesto", pinConfirmedLabel: "Miesto doručenia potvrdené", adjustPin: "Upraviť" },
  sl: { confirmPinCta: "Uporabi to mesto", pinConfirmedLabel: "Mesto dostave potrjeno", adjustPin: "Spremeni" },
  sr: { confirmPinCta: "Користи ово место", pinConfirmedLabel: "Место доставе потврђено", adjustPin: "Измени" },
  sv: { confirmPinCta: "Använd denna plats", pinConfirmedLabel: "Leveransplats bekräftad", adjustPin: "Justera" },
  th: { confirmPinCta: "ใช้จุดนี้", pinConfirmedLabel: "ยืนยันจุดจัดส่งแล้ว", adjustPin: "แก้ไข" },
  tr: { confirmPinCta: "Bu noktayı kullan", pinConfirmedLabel: "Teslimat noktası onaylandı", adjustPin: "Değiştir" },
  uk: { confirmPinCta: "Використати це місце", pinConfirmedLabel: "Місце доставки підтверджено", adjustPin: "Змінити" },
  vi: { confirmPinCta: "Dùng vị trí này", pinConfirmedLabel: "Đã xác nhận vị trí giao hàng", adjustPin: "Chỉnh lại" },
  zh: { confirmPinCta: "使用此位置", pinConfirmedLabel: "配送位置已确认", adjustPin: "调整" },
};

let changed = 0;
for (const [locale, vals] of Object.entries(T)) {
  const path = `src/messages/${locale}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  if (!json.checkout) throw new Error(`${locale}: no checkout namespace`);
  Object.assign(json.checkout, vals);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`Added 3 pin-confirm keys to ${changed} locales.`);
