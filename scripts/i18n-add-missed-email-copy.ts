/** i18n × 38 (Fabrizio cmr6meaaq, 2026-07-04): MISSED order email copy —
 *  distinct from "rejected" (manual refusal). Missed = not accepted in time.
 *  Run: npx tsx scripts/i18n-add-missed-email-copy.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "email.orderStatus.missedTitle": {
    en: "Order not accepted in time",
    fr: "Commande non acceptée à temps",
    es: "Pedido no aceptado a tiempo",
    it: "Ordine non accettato in tempo",
    pt: "Pedido não aceite a tempo",
    "pt-BR": "Pedido não aceito a tempo",
    de: "Bestellung nicht rechtzeitig angenommen",
    nl: "Bestelling niet op tijd geaccepteerd",
    ro: "Comandă neacceptată la timp",
    sv: "Beställningen accepterades inte i tid",
    da: "Ordren blev ikke accepteret i tide",
    nb: "Bestillingen ble ikke akseptert i tide",
    fi: "Tilausta ei hyväksytty ajoissa",
    pl: "Zamówienie nie zostało przyjęte na czas",
    cs: "Objednávka nebyla přijata včas",
    sk: "Objednávka nebola prijatá včas",
    hu: "A rendelést nem fogadták el időben",
    el: "Η παραγγελία δεν έγινε αποδεκτή εγκαίρως",
    bg: "Поръчката не беше приета навреме",
    hr: "Narudžba nije prihvaćena na vrijeme",
    sr: "Поруџбина није прихваћена на време",
    sl: "Naročilo ni bilo sprejeto pravočasno",
    et: "Tellimust ei võetud õigel ajal vastu",
    lv: "Pasūtījums netika pieņemts laikā",
    lt: "Užsakymas nebuvo priimtas laiku",
    tr: "Sipariş zamanında kabul edilmedi",
    ru: "Заказ не был принят вовремя",
    uk: "Замовлення не було прийнято вчасно",
    ca: "Comanda no acceptada a temps",
    id: "Pesanan tidak diterima tepat waktu",
    vi: "Đơn hàng không được chấp nhận kịp thời",
    th: "ร้านไม่ได้รับออเดอร์ทันเวลา",
    zh: "订单未能及时被接受",
    ja: "ご注文は時間内に受け付けられませんでした",
    ko: "주문이 제시간에 접수되지 않았습니다",
    ar: "لم يُقبل الطلب في الوقت المناسب",
    he: "ההזמנה לא אושרה בזמן",
    hi: "ऑर्डर समय पर स्वीकार नहीं हुआ",
  },
  "email.orderStatus.missedBody": {
    en: "Unfortunately the restaurant wasn't able to accept your order in time, so it didn't go through. If you paid online, any authorization is released automatically — you won't be charged.",
    fr: "Malheureusement, le restaurant n'a pas pu accepter votre commande à temps ; elle n'a donc pas été prise en compte. Si vous avez payé en ligne, toute autorisation est libérée automatiquement — vous ne serez pas débité.",
    es: "Lamentablemente el restaurante no pudo aceptar tu pedido a tiempo, por lo que no se procesó. Si pagaste en línea, cualquier autorización se libera automáticamente: no se te cobrará.",
    it: "Purtroppo il ristorante non è riuscito ad accettare il tuo ordine in tempo, quindi non è andato a buon fine. Se hai pagato online, l'eventuale autorizzazione viene rilasciata automaticamente — non ti verrà addebitato nulla.",
    pt: "Infelizmente o restaurante não conseguiu aceitar o seu pedido a tempo, pelo que não foi processado. Se pagou online, qualquer autorização é libertada automaticamente — não será cobrado.",
    "pt-BR": "Infelizmente o restaurante não conseguiu aceitar seu pedido a tempo, então ele não foi processado. Se você pagou online, qualquer autorização é liberada automaticamente — você não será cobrado.",
    de: "Leider konnte das Restaurant Ihre Bestellung nicht rechtzeitig annehmen, daher wurde sie nicht ausgeführt. Falls Sie online bezahlt haben, wird jede Autorisierung automatisch freigegeben — Ihnen wird nichts berechnet.",
    nl: "Helaas kon het restaurant uw bestelling niet op tijd accepteren, dus is deze niet doorgegaan. Als u online heeft betaald, wordt elke reservering automatisch vrijgegeven — er wordt niets afgeschreven.",
    ro: "Din păcate, restaurantul nu a putut accepta comanda la timp, așa că nu a fost procesată. Dacă ați plătit online, orice autorizare este eliberată automat — nu veți fi taxat.",
    sv: "Tyvärr kunde restaurangen inte acceptera din beställning i tid, så den gick inte igenom. Om du betalade online släpps eventuell auktorisering automatiskt — du debiteras inte.",
    da: "Desværre kunne restauranten ikke acceptere din ordre i tide, så den gik ikke igennem. Hvis du betalte online, frigives enhver godkendelse automatisk — du bliver ikke opkrævet.",
    nb: "Dessverre klarte ikke restauranten å akseptere bestillingen din i tide, så den gikk ikke gjennom. Hvis du betalte på nett, frigis eventuell autorisasjon automatisk — du blir ikke belastet.",
    fi: "Valitettavasti ravintola ei ehtinyt hyväksyä tilaustasi ajoissa, joten se ei mennyt läpi. Jos maksoit verkossa, mahdollinen varaus vapautetaan automaattisesti — sinulta ei veloiteta mitään.",
    pl: "Niestety restauracja nie zdążyła przyjąć Twojego zamówienia na czas, więc nie zostało zrealizowane. Jeśli płaciłeś online, wszelkie autoryzacje są zwalniane automatycznie — nic nie zostanie pobrane.",
    cs: "Restaurace bohužel nestihla vaši objednávku včas přijmout, takže neproběhla. Pokud jste platili online, případná autorizace se automaticky uvolní — nic vám nebude účtováno.",
    sk: "Reštaurácia bohužiaľ nestihla vašu objednávku včas prijať, takže neprebehla. Ak ste platili online, prípadná autorizácia sa automaticky uvoľní — nič vám nebude účtované.",
    hu: "Sajnos az étterem nem tudta időben elfogadni a rendelését, így az nem valósult meg. Ha online fizetett, az esetleges zárolás automatikusan feloldódik — nem terheljük meg.",
    el: "Δυστυχώς το εστιατόριο δεν πρόλαβε να αποδεχθεί την παραγγελία σας εγκαίρως, οπότε δεν ολοκληρώθηκε. Αν πληρώσατε online, τυχόν δέσμευση αποδεσμεύεται αυτόματα — δεν θα χρεωθείτε.",
    bg: "За съжаление ресторантът не успя да приеме поръчката ви навреме, затова тя не беше изпълнена. Ако сте платили онлайн, всяка авторизация се освобождава автоматично — няма да бъдете таксувани.",
    hr: "Nažalost, restoran nije stigao prihvatiti vašu narudžbu na vrijeme pa nije provedena. Ako ste platili online, svaka autorizacija se automatski oslobađa — nećete biti terećeni.",
    sr: "Нажалост, ресторан није стигао да прихвати вашу поруџбину на време, па није реализована. Ако сте платили онлајн, свака ауторизација се аутоматски ослобађа — нећете бити наплаћени.",
    sl: "Restavracija žal ni uspela pravočasno sprejeti vašega naročila, zato ni bilo izvedeno. Če ste plačali prek spleta, se morebitna avtorizacija samodejno sprosti — bremenitve ne bo.",
    et: "Kahjuks ei jõudnud restoran teie tellimust õigel ajal vastu võtta, seega see ei läinud läbi. Kui maksite veebis, vabastatakse võimalik broneering automaatselt — teilt ei võeta tasu.",
    lv: "Diemžēl restorāns nepaspēja laikā pieņemt jūsu pasūtījumu, tāpēc tas netika izpildīts. Ja maksājāt tiešsaistē, jebkura autorizācija tiek automātiski atbrīvota — nauda netiks ieturēta.",
    lt: "Deja, restoranas nespėjo laiku priimti jūsų užsakymo, todėl jis neįvyko. Jei mokėjote internetu, bet kokia autorizacija atlaisvinama automatiškai — pinigai nebus nuskaityti.",
    tr: "Maalesef restoran siparişinizi zamanında kabul edemedi, bu yüzden sipariş gerçekleşmedi. Çevrimiçi ödediyseniz, tüm ön provizyonlar otomatik olarak serbest bırakılır — sizden ücret alınmaz.",
    ru: "К сожалению, ресторан не успел принять ваш заказ вовремя, поэтому он не был выполнен. Если вы платили онлайн, любая авторизация снимается автоматически — деньги не спишутся.",
    uk: "На жаль, ресторан не встиг прийняти ваше замовлення вчасно, тому воно не відбулося. Якщо ви платили онлайн, будь-яка авторизація знімається автоматично — кошти не спишуться.",
    ca: "Malauradament el restaurant no ha pogut acceptar la comanda a temps, així que no s'ha processat. Si has pagat en línia, qualsevol autorització s'allibera automàticament — no se't cobrarà.",
    id: "Sayangnya restoran tidak sempat menerima pesanan Anda tepat waktu, jadi pesanan tidak diproses. Jika Anda membayar online, otorisasi apa pun dilepas otomatis — Anda tidak akan ditagih.",
    vi: "Rất tiếc, nhà hàng không kịp chấp nhận đơn hàng của bạn nên đơn không được thực hiện. Nếu bạn thanh toán trực tuyến, mọi khoản tạm giữ sẽ tự động được giải phóng — bạn sẽ không bị trừ tiền.",
    th: "ขออภัย ร้านอาหารไม่สามารถรับออเดอร์ของคุณได้ทันเวลา ออเดอร์จึงไม่สำเร็จ หากคุณชำระเงินออนไลน์ วงเงินที่ถูกกันไว้จะถูกคืนโดยอัตโนมัติ — คุณจะไม่ถูกเรียกเก็บเงิน",
    zh: "很抱歉，餐厅未能及时接受您的订单，因此订单未成立。如您已在线支付，任何预授权都会自动解除——不会向您收费。",
    ja: "申し訳ありませんが、レストランが時間内にご注文を受け付けられなかったため、ご注文は成立しませんでした。オンラインでお支払いの場合、与信は自動的に解除され、請求は発生しません。",
    ko: "죄송합니다. 레스토랑이 주문을 제시간에 접수하지 못해 주문이 진행되지 않았습니다. 온라인으로 결제하셨다면 승인 금액은 자동으로 해제되며 청구되지 않습니다.",
    ar: "للأسف لم يتمكن المطعم من قبول طلبك في الوقت المناسب، لذلك لم يكتمل الطلب. إذا دفعت إلكترونيًا، يتم تحرير أي تفويض تلقائيًا — ولن يُخصم منك شيء.",
    he: "לצערנו המסעדה לא הספיקה לאשר את הזמנתכם בזמן, ולכן היא לא בוצעה. אם שילמתם אונליין, כל הרשאה משוחררת אוטומטית — לא תחויבו.",
    hi: "क्षमा करें, रेस्तरां आपका ऑर्डर समय पर स्वीकार नहीं कर सका, इसलिए वह पूरा नहीं हुआ। यदि आपने ऑनलाइन भुगतान किया है, तो कोई भी प्राधिकरण स्वतः रिलीज़ हो जाता है — आपसे शुल्क नहीं लिया जाएगा।",
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
  for (const [key, byLoc] of Object.entries(K)) setDeep(data, key, byLoc[loc] ?? byLoc.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ Missed-email copy added to ${n} locale(s).`);
