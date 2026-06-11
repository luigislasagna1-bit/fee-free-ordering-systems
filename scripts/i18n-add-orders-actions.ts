/** i18n: admin Orders page Accept/Reject actions × 38.
 *    admin.orders.{confirmReject, actionFailed}
 *    (accept / reject / rejectReason / accepted / rejected already exist.)
 *    npx tsx scripts/i18n-add-orders-actions.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.orders.confirmReject": {
    en: "Reject this order? The customer will be notified and any payment released or refunded. Add an optional reason:",
    fr: "Refuser cette commande ? Le client sera averti et tout paiement sera libéré ou remboursé. Ajoutez un motif (facultatif) :",
    es: "¿Rechazar este pedido? Se notificará al cliente y cualquier pago se liberará o reembolsará. Añade un motivo (opcional):",
    it: "Rifiutare questo ordine? Il cliente verrà avvisato e qualsiasi pagamento sarà rilasciato o rimborsato. Aggiungi un motivo (facoltativo):",
    pt: "Recusar este pedido? O cliente será notificado e qualquer pagamento será libertado ou reembolsado. Adicione um motivo (opcional):",
    "pt-BR": "Recusar este pedido? O cliente será notificado e qualquer pagamento será liberado ou reembolsado. Adicione um motivo (opcional):",
    de: "Diese Bestellung ablehnen? Der Kunde wird benachrichtigt und jede Zahlung wird freigegeben oder erstattet. Optionalen Grund hinzufügen:",
    nl: "Deze bestelling weigeren? De klant wordt op de hoogte gesteld en elke betaling wordt vrijgegeven of terugbetaald. Voeg een optionele reden toe:",
    ro: "Respingeți această comandă? Clientul va fi notificat și orice plată va fi eliberată sau rambursată. Adăugați un motiv (opțional):",
    sv: "Avvisa den här beställningen? Kunden meddelas och eventuell betalning frigörs eller återbetalas. Lägg till en valfri orsak:",
    da: "Afvis denne ordre? Kunden får besked, og enhver betaling frigives eller refunderes. Tilføj en valgfri årsag:",
    nb: "Avvis denne bestillingen? Kunden blir varslet, og enhver betaling frigis eller refunderes. Legg til en valgfri årsak:",
    fi: "Hylätäänkö tämä tilaus? Asiakkaalle ilmoitetaan ja mahdollinen maksu vapautetaan tai hyvitetään. Lisää valinnainen syy:",
    pl: "Odrzucić to zamówienie? Klient zostanie powiadomiony, a wszelkie płatności zostaną zwolnione lub zwrócone. Dodaj opcjonalny powód:",
    cs: "Odmítnout tuto objednávku? Zákazník bude upozorněn a jakákoli platba bude uvolněna nebo vrácena. Přidejte volitelný důvod:",
    sk: "Odmietnuť túto objednávku? Zákazník bude upozornený a akákoľvek platba bude uvoľnená alebo vrátená. Pridajte voliteľný dôvod:",
    hu: "Elutasítja ezt a rendelést? Az ügyfél értesítést kap, és minden fizetés feloldásra vagy visszatérítésre kerül. Adjon meg egy opcionális indokot:",
    el: "Απόρριψη αυτής της παραγγελίας; Ο πελάτης θα ειδοποιηθεί και κάθε πληρωμή θα αποδεσμευτεί ή θα επιστραφεί. Προσθέστε προαιρετικό λόγο:",
    bg: "Да се отхвърли ли тази поръчка? Клиентът ще бъде уведомен и всяко плащане ще бъде освободено или възстановено. Добавете незадължителна причина:",
    hr: "Odbiti ovu narudžbu? Kupac će biti obaviješten, a svako plaćanje bit će oslobođeno ili vraćeno. Dodajte neobavezni razlog:",
    sr: "Одбити ову поруџбину? Купац ће бити обавештен, а свако плаћање биће ослобођено или враћено. Додајте опциони разлог:",
    sl: "Zavrniti to naročilo? Stranka bo obveščena, vsako plačilo pa bo sproščeno ali vrnjeno. Dodajte neobvezen razlog:",
    et: "Kas lükata see tellimus tagasi? Klienti teavitatakse ja iga makse vabastatakse või tagastatakse. Lisage valikuline põhjus:",
    lv: "Noraidīt šo pasūtījumu? Klients tiks informēts, un jebkurš maksājums tiks atbrīvots vai atmaksāts. Pievienojiet neobligātu iemeslu:",
    lt: "Atmesti šį užsakymą? Klientas bus informuotas, o bet koks mokėjimas bus atlaisvintas arba grąžintas. Pridėkite neprivalomą priežastį:",
    tr: "Bu sipariş reddedilsin mi? Müşteri bilgilendirilecek ve her türlü ödeme serbest bırakılacak veya iade edilecek. İsteğe bağlı bir neden ekleyin:",
    ru: "Отклонить этот заказ? Клиент будет уведомлён, а любой платёж будет разблокирован или возвращён. Добавьте необязательную причину:",
    uk: "Відхилити це замовлення? Клієнта буде сповіщено, а будь-який платіж буде розблоковано або повернуто. Додайте необов'язкову причину:",
    ca: "Voleu rebutjar aquesta comanda? S'avisarà el client i qualsevol pagament s'alliberarà o es reemborsarà. Afegiu un motiu (opcional):",
    id: "Tolak pesanan ini? Pelanggan akan diberi tahu dan pembayaran apa pun akan dilepaskan atau dikembalikan. Tambahkan alasan opsional:",
    vi: "Từ chối đơn hàng này? Khách hàng sẽ được thông báo và mọi khoản thanh toán sẽ được giải phóng hoặc hoàn lại. Thêm lý do (tùy chọn):",
    th: "ปฏิเสธคำสั่งซื้อนี้หรือไม่? ลูกค้าจะได้รับการแจ้งเตือนและการชำระเงินใดๆ จะถูกปล่อยคืนหรือคืนเงิน เพิ่มเหตุผล (ไม่บังคับ):",
    zh: "拒绝此订单？将通知客户，任何付款都将释放或退款。添加可选原因：",
    ja: "この注文を拒否しますか？お客様に通知され、支払いは解除または返金されます。任意で理由を追加してください：",
    ko: "이 주문을 거부하시겠습니까? 고객에게 알림이 전송되며 모든 결제는 해제되거나 환불됩니다. 선택적으로 사유를 추가하세요:",
    ar: "رفض هذا الطلب؟ سيتم إخطار العميل وسيتم تحرير أي دفعة أو ردها. أضف سببًا اختياريًا:",
    he: "לדחות הזמנה זו? הלקוח יקבל הודעה וכל תשלום ישוחרר או יוחזר. הוסף סיבה (אופציונלי):",
    hi: "इस ऑर्डर को अस्वीकार करें? ग्राहक को सूचित किया जाएगा और कोई भी भुगतान जारी या वापस कर दिया जाएगा। वैकल्पिक कारण जोड़ें:",
  },
  "admin.orders.actionFailed": {
    en: "Couldn't update the order. Please try again.",
    fr: "Impossible de mettre à jour la commande. Veuillez réessayer.",
    es: "No se pudo actualizar el pedido. Inténtalo de nuevo.",
    it: "Impossibile aggiornare l'ordine. Riprova.",
    pt: "Não foi possível atualizar o pedido. Tente novamente.",
    "pt-BR": "Não foi possível atualizar o pedido. Tente novamente.",
    de: "Bestellung konnte nicht aktualisiert werden. Bitte erneut versuchen.",
    nl: "Kan de bestelling niet bijwerken. Probeer het opnieuw.",
    ro: "Comanda nu a putut fi actualizată. Încercați din nou.",
    sv: "Det gick inte att uppdatera beställningen. Försök igen.",
    da: "Kunne ikke opdatere ordren. Prøv igen.",
    nb: "Kunne ikke oppdatere bestillingen. Prøv igjen.",
    fi: "Tilauksen päivittäminen epäonnistui. Yritä uudelleen.",
    pl: "Nie udało się zaktualizować zamówienia. Spróbuj ponownie.",
    cs: "Objednávku se nepodařilo aktualizovat. Zkuste to znovu.",
    sk: "Objednávku sa nepodarilo aktualizovať. Skúste to znova.",
    hu: "A rendelést nem sikerült frissíteni. Próbálja újra.",
    el: "Δεν ήταν δυνατή η ενημέρωση της παραγγελίας. Δοκιμάστε ξανά.",
    bg: "Поръчката не можа да бъде актуализирана. Опитайте отново.",
    hr: "Narudžbu nije moguće ažurirati. Pokušajte ponovno.",
    sr: "Поруџбину није могуће ажурирати. Покушајте поново.",
    sl: "Naročila ni bilo mogoče posodobiti. Poskusite znova.",
    et: "Tellimust ei õnnestunud värskendada. Proovige uuesti.",
    lv: "Neizdevās atjaunināt pasūtījumu. Mēģiniet vēlreiz.",
    lt: "Nepavyko atnaujinti užsakymo. Bandykite dar kartą.",
    tr: "Sipariş güncellenemedi. Lütfen tekrar deneyin.",
    ru: "Не удалось обновить заказ. Попробуйте ещё раз.",
    uk: "Не вдалося оновити замовлення. Спробуйте ще раз.",
    ca: "No s'ha pogut actualitzar la comanda. Torneu-ho a provar.",
    id: "Tidak dapat memperbarui pesanan. Silakan coba lagi.",
    vi: "Không thể cập nhật đơn hàng. Vui lòng thử lại.",
    th: "ไม่สามารถอัปเดตคำสั่งซื้อได้ โปรดลองอีกครั้ง",
    zh: "无法更新订单，请重试。",
    ja: "注文を更新できませんでした。もう一度お試しください。",
    ko: "주문을 업데이트할 수 없습니다. 다시 시도해 주세요.",
    ar: "تعذّر تحديث الطلب. يرجى المحاولة مرة أخرى.",
    he: "לא ניתן לעדכן את ההזמנה. נסה שוב.",
    hi: "ऑर्डर अपडेट नहीं हो सका। कृपया पुनः प्रयास करें।",
  },
};

function setDeep(obj: Record<string, unknown>, key: string, value: string) {
  const parts = key.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

let n = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  for (const [k, byLoc] of Object.entries(KEYS)) setDeep(data, k, byLoc[loc] ?? byLoc.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ orders-actions strings (${Object.keys(KEYS).length} keys) added to ${n} locale(s).`);
