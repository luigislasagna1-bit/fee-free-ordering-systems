/** Add awaitingPayment i18n keys to all 38 locale files. */
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";

const LOCALES = readdirSync("src/messages").filter(f => f.endsWith(".json") && f !== "en.json").map(f => f.replace(".json", ""));

const translations: Record<string, Record<string, string>> = {
  en: { awaitingPayment: "Awaiting Payment", awaitingPaymentHelp: "Customer didn't finish checkout — no payment taken, not sent to kitchen." },
  ar: { awaitingPayment: "في انتظار الدفع", awaitingPaymentHelp: "لم ينه العميل عملية الدفع — لم يتم أخذ أي دفعة، لم يتم الإرسال إلى المطبخ." },
  bg: { awaitingPayment: "Чакане на плащане", awaitingPaymentHelp: "Клиентът не завърши касата — не е взета плащане, не е изпратено на кухнята." },
  ca: { awaitingPayment: "Esperant pagament", awaitingPaymentHelp: "El client no va acabar el checkout — no s'ha pres cap pagament, no s'ha enviat a la cuina." },
  cs: { awaitingPayment: "Čekání na platbu", awaitingPaymentHelp: "Zákazník nedokončil platbu — nebyla odebrána žádná platba, nebyla odeslána do kuchyně." },
  da: { awaitingPayment: "Venter på betaling", awaitingPaymentHelp: "Kunden gennemførte ikke betaling — ingen betaling opkrævet, ikke sendt til køkkenet." },
  de: { awaitingPayment: "Zahlungsausstehend", awaitingPaymentHelp: "Kunde hat Bestellung nicht abgeschlossen — keine Zahlung eingezogen, nicht an die Küche gesendet." },
  el: { awaitingPayment: "Αναμένεται Πληρωμή", awaitingPaymentHelp: "Ο πελάτης δεν ολοκλήρωσε την τιμολόγηση — δεν ληφθηκε καμία πληρωμή, δεν στάλθηκε στην κουζίνα." },
  es: { awaitingPayment: "Esperando pago", awaitingPaymentHelp: "El cliente no completó la compra — sin pago capturado, no enviado a la cocina." },
  et: { awaitingPayment: "Maksega ootel", awaitingPaymentHelp: "Klient ei lõpetanud maksmist — makset ei võetud, kutsele ei saadetud." },
  fi: { awaitingPayment: "Odottaa maksua", awaitingPaymentHelp: "Asiakas ei suorittanut kassaa — maksua ei otettu, ei lähetetty keittiöön." },
  fr: { awaitingPayment: "En attente de paiement", awaitingPaymentHelp: "Le client n'a pas terminé le paiement — aucun paiement capturé, non envoyé à la cuisine." },
  he: { awaitingPayment: "מחכה לתשלום", awaitingPaymentHelp: "הלקוח לא סיים את התשלום — לא בוצע כל תשלום, לא נשלח למטבח." },
  hi: { awaitingPayment: "भुगतान की प्रतीक्षा में", awaitingPaymentHelp: "ग्राहक ने चेकआउट पूरा नहीं किया — कोई भुगतान नहीं लिया गया, रसोई को नहीं भेजा गया।" },
  hr: { awaitingPayment: "U čekanju na plaćanje", awaitingPaymentHelp: "Kupac nije završio plaćanje — bez uplata, nije poslano u kuhinju." },
  hu: { awaitingPayment: "Fizetésre vár", awaitingPaymentHelp: "Az ügyfél nem fejezte be a fizetést — nem számított fel fizetés, nem küldve a konyhára." },
  id: { awaitingPayment: "Menunggu Pembayaran", awaitingPaymentHelp: "Pelanggan tidak menyelesaikan checkout — pembayaran tidak ditangkap, tidak dikirim ke dapur." },
  it: { awaitingPayment: "In attesa di pagamento", awaitingPaymentHelp: "Il cliente non ha completato il pagamento — nessun pagamento catturato, non inviato in cucina." },
  ja: { awaitingPayment: "支払い待ちです", awaitingPaymentHelp: "お客様がチェックアウトを完了していません — 支払いは取得されていませんが、キッチンには送信されていません。" },
  ko: { awaitingPayment: "결제 대기 중", awaitingPaymentHelp: "고객이 결제를 완료하지 않음 — 결제가 캡처되지 않음, 주방으로 전송되지 않음." },
  lt: { awaitingPayment: "Laukiama mokėjimo", awaitingPaymentHelp: "Klientas nebaigė kasoje — nebuvo atliktas mokėjimas, neišsiųsta į virtuvę." },
  lv: { awaitingPayment: "Gaida maksājumu", awaitingPaymentHelp: "Klients nepabeigja norēķināšanos — maksājums netika ņemts, nav nosūtīts virtuvē." },
  nb: { awaitingPayment: "Venter på betaling", awaitingPaymentHelp: "Kunden fullførte ikke betaling — ingen betaling oppkrevd, ikke sendt til kjøkkenet." },
  nl: { awaitingPayment: "Wacht op betaling", awaitingPaymentHelp: "Klant heeft kassa niet afgerond — geen betaling vastgelegd, niet naar keuken verzonden." },
  pl: { awaitingPayment: "Oczekiwanie na płatność", awaitingPaymentHelp: "Klient nie ukończył płatności — nie pobrano żadnej płatności, nie wysłano do kuchni." },
  "pt-BR": { awaitingPayment: "Aguardando pagamento", awaitingPaymentHelp: "Cliente não completou o checkout — nenhum pagamento capturado, não enviado para a cozinha." },
  pt: { awaitingPayment: "Aguardando pagamento", awaitingPaymentHelp: "Cliente não completou o checkout — nenhum pagamento capturado, não enviado para a cozinha." },
  ro: { awaitingPayment: "În așteptarea plății", awaitingPaymentHelp: "Clientul nu a finalizat plata — nicio plată capturată, nu a fost trimis la bucătărie." },
  ru: { awaitingPayment: "Ожидание платежа", awaitingPaymentHelp: "Клиент не завершил оформление заказа — платеж не снят, не отправлено на кухню." },
  sk: { awaitingPayment: "Čakanie na úhradu", awaitingPaymentHelp: "Zákazník nedokončil platbu — nebola zložená úhrada, nebola poslaná do kuchyne." },
  sl: { awaitingPayment: "Čakanje na plačilo", awaitingPaymentHelp: "Stranka ni zaključila plačila — brez zajete plačila, ni poslano v kuhinjo." },
  sr: { awaitingPayment: "Чека се плаћање", awaitingPaymentHelp: "Купац није завршио плаћање — без захваћеног плаћања, није послано у кухињу." },
  sv: { awaitingPayment: "Väntar på betalning", awaitingPaymentHelp: "Kunden avslutade inte betalningen — ingen betalning inhemtad, inte skickad till köket." },
  th: { awaitingPayment: "รอการชำระเงิน", awaitingPaymentHelp: "ลูกค้าไม่ได้ดำเนินการชำระเงิน — ไม่มีการเก็บเงิน ไม่ได้ส่งไปที่ครัว" },
  tr: { awaitingPayment: "Ödeme Bekleniyor", awaitingPaymentHelp: "Müşteri ödemeyi tamamlamadı — ödeme alınmadı, mutfağa gönderilmedi." },
  uk: { awaitingPayment: "Очікування на платіж", awaitingPaymentHelp: "Клієнт не завершив оформлення замовлення — платіж не припинений, не надіслано на кухню." },
  vi: { awaitingPayment: "Chờ thanh toán", awaitingPaymentHelp: "Khách hàng chưa hoàn tất thanh toán — không có khoản thanh toán nào bị chụp, không gửi đến nhà bếp." },
  zh: { awaitingPayment: "等待付款", awaitingPaymentHelp: "客户未完成结账 — 未捕获任何付款，未发送到厨房。" },
};

for (const locale of ["en", ...LOCALES]) {
  const path = `src/messages/${locale}.json`;
  const data = JSON.parse(readFileSync(path, "utf8"));

  if (!data.admin) data.admin = {};
  if (!data.admin.orders) data.admin.orders = {};
  const trans = translations[locale] || translations.en;
  data.admin.orders.awaitingPayment = trans.awaitingPayment;
  data.admin.orders.awaitingPaymentHelp = trans.awaitingPaymentHelp;

  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(locale);
}
console.log("done");
