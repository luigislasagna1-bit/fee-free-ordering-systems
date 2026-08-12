/**
 * One-shot i18n patch for the WIN1 fix (Luigi 2026-08-11, Ben Bilton's report).
 *
 *   admin.promotionsList.titleCampaignLocked  — tooltip on the locked power button
 *   admin.promotionsList.toggleFailed          — generic toggle failure toast
 *   admin.autopilotClient.codeNotLiveTitle     — "campaign is on, its code isn't"
 *   admin.autopilotClient.codeNotLiveBody
 *
 * "Autopilot" is a product name and is never translated (same rule as
 * campaignLabel() in PromotionsClient.tsx). German uses the formal "Sie" the
 * rest of the admin uses; Serbian is Latin ekavian.
 *
 *   npx tsx scripts/i18n-add-campaign-code-guard.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

// [titleCampaignLocked, toggleFailed, codeNotLiveTitle, codeNotLiveBody]
const T: Record<string, [string, string, string, string]> = {
  en: [
    "This code is being emailed by a running Autopilot campaign. Turn the campaign off in Marketing → Autopilot to retire it.",
    "Couldn't change this promotion. Please try again.",
    "This campaign has no working offer code.",
    "Its coupon is switched off or expired, so these emails go out without a discount. Turn the code back on under Promotions & Coupons.",
  ],
  fr: [
    "Ce code est envoyé par e-mail par une campagne Autopilot active. Désactivez la campagne dans Marketing → Autopilot pour le retirer.",
    "Impossible de modifier cette promotion. Veuillez réessayer.",
    "Cette campagne n'a aucun code promo fonctionnel.",
    "Son coupon est désactivé ou expiré : ces e-mails partent donc sans réduction. Réactivez le code dans Promotions et coupons.",
  ],
  es: [
    "Una campaña de Autopilot activa está enviando este código por correo. Desactiva la campaña en Marketing → Autopilot para retirarlo.",
    "No se pudo cambiar esta promoción. Inténtalo de nuevo.",
    "Esta campaña no tiene ningún código de oferta que funcione.",
    "Su cupón está desactivado o caducado, así que estos correos salen sin descuento. Vuelve a activar el código en Promociones y cupones.",
  ],
  it: [
    "Questo codice viene inviato via e-mail da una campagna Autopilot attiva. Disattiva la campagna in Marketing → Autopilot per ritirarlo.",
    "Impossibile modificare questa promozione. Riprova.",
    "Questa campagna non ha un codice offerta funzionante.",
    "Il suo coupon è disattivato o scaduto, quindi queste e-mail partono senza sconto. Riattiva il codice in Promozioni e coupon.",
  ],
  pt: [
    "Este código está a ser enviado por e-mail por uma campanha Autopilot ativa. Desative a campanha em Marketing → Autopilot para o retirar.",
    "Não foi possível alterar esta promoção. Tente novamente.",
    "Esta campanha não tem nenhum código de oferta funcional.",
    "O cupão está desativado ou expirado, por isso estes e-mails seguem sem desconto. Reative o código em Promoções e cupões.",
  ],
  "pt-BR": [
    "Este código está sendo enviado por e-mail por uma campanha Autopilot ativa. Desative a campanha em Marketing → Autopilot para retirá-lo.",
    "Não foi possível alterar esta promoção. Tente novamente.",
    "Esta campanha não tem nenhum código de oferta funcionando.",
    "O cupom está desativado ou expirado, então estes e-mails saem sem desconto. Reative o código em Promoções e cupons.",
  ],
  de: [
    "Dieser Code wird von einer laufenden Autopilot-Kampagne per E-Mail versendet. Schalten Sie die Kampagne unter Marketing → Autopilot ab, um ihn zurückzuziehen.",
    "Diese Aktion konnte nicht geändert werden. Bitte versuchen Sie es erneut.",
    "Diese Kampagne hat keinen funktionierenden Angebotscode.",
    "Ihr Gutschein ist deaktiviert oder abgelaufen, daher gehen diese E-Mails ohne Rabatt raus. Aktivieren Sie den Code unter Aktionen und Gutscheine wieder.",
  ],
  nl: [
    "Deze code wordt gemaild door een actieve Autopilot-campagne. Zet de campagne uit bij Marketing → Autopilot om hem in te trekken.",
    "Deze actie kon niet worden gewijzigd. Probeer het opnieuw.",
    "Deze campagne heeft geen werkende aanbiedingscode.",
    "De coupon staat uit of is verlopen, dus deze e-mails gaan zonder korting de deur uit. Zet de code weer aan bij Acties en coupons.",
  ],
  ro: [
    "Acest cod este trimis pe e-mail de o campanie Autopilot activă. Dezactivează campania din Marketing → Autopilot pentru a-l retrage.",
    "Promoția nu a putut fi modificată. Încearcă din nou.",
    "Această campanie nu are niciun cod de ofertă funcțional.",
    "Cuponul este dezactivat sau expirat, deci aceste e-mailuri pleacă fără reducere. Reactivează codul din Promoții și cupoane.",
  ],
  sv: [
    "Den här koden mejlas ut av en pågående Autopilot-kampanj. Stäng av kampanjen under Marknadsföring → Autopilot för att dra tillbaka den.",
    "Kunde inte ändra erbjudandet. Försök igen.",
    "Den här kampanjen har ingen fungerande erbjudandekod.",
    "Kupongen är avstängd eller har gått ut, så mejlen skickas utan rabatt. Slå på koden igen under Erbjudanden och kuponger.",
  ],
  da: [
    "Denne kode sendes på mail af en kørende Autopilot-kampagne. Slå kampagnen fra under Markedsføring → Autopilot for at trække den tilbage.",
    "Tilbuddet kunne ikke ændres. Prøv igen.",
    "Denne kampagne har ingen fungerende tilbudskode.",
    "Kuponen er slået fra eller udløbet, så disse mails sendes uden rabat. Slå koden til igen under Tilbud og kuponer.",
  ],
  nb: [
    "Denne koden sendes på e-post av en aktiv Autopilot-kampanje. Slå av kampanjen under Markedsføring → Autopilot for å trekke den tilbake.",
    "Kunne ikke endre tilbudet. Prøv igjen.",
    "Denne kampanjen har ingen fungerende tilbudskode.",
    "Kupongen er slått av eller utløpt, så disse e-postene sendes uten rabatt. Slå på koden igjen under Tilbud og kuponger.",
  ],
  fi: [
    "Käynnissä oleva Autopilot-kampanja lähettää tätä koodia sähköpostitse. Poista kampanja käytöstä kohdassa Markkinointi → Autopilot, jos haluat vetää sen pois.",
    "Tarjouksen muuttaminen epäonnistui. Yritä uudelleen.",
    "Tällä kampanjalla ei ole toimivaa tarjouskoodia.",
    "Sen kuponki on poistettu käytöstä tai vanhentunut, joten nämä sähköpostit lähtevät ilman alennusta. Ota koodi takaisin käyttöön kohdassa Tarjoukset ja kupongit.",
  ],
  pl: [
    "Ten kod jest wysyłany e-mailem przez działającą kampanię Autopilot. Wyłącz kampanię w Marketing → Autopilot, aby go wycofać.",
    "Nie udało się zmienić tej promocji. Spróbuj ponownie.",
    "Ta kampania nie ma działającego kodu oferty.",
    "Jej kupon jest wyłączony lub wygasł, więc te e-maile wychodzą bez rabatu. Włącz kod ponownie w Promocje i kupony.",
  ],
  cs: [
    "Tento kód rozesílá e-mailem běžící kampaň Autopilot. Vypněte kampaň v Marketing → Autopilot, pokud ji chcete ukončit.",
    "Akci se nepodařilo změnit. Zkuste to znovu.",
    "Tato kampaň nemá funkční slevový kód.",
    "Její kupon je vypnutý nebo vypršel, takže tyto e-maily odcházejí bez slevy. Zapněte kód zpět v Akce a kupony.",
  ],
  sk: [
    "Tento kód rozposiela e-mailom bežiaca kampaň Autopilot. Vypnite kampaň v Marketing → Autopilot, ak ju chcete ukončiť.",
    "Akciu sa nepodarilo zmeniť. Skúste to znova.",
    "Táto kampaň nemá funkčný zľavový kód.",
    "Jej kupón je vypnutý alebo vypršal, takže tieto e-maily odchádzajú bez zľavy. Zapnite kód späť v Akcie a kupóny.",
  ],
  hu: [
    "Ezt a kódot egy futó Autopilot kampány küldi e-mailben. A visszavonásához kapcsolja ki a kampányt a Marketing → Autopilot menüpontban.",
    "Az akciót nem sikerült módosítani. Próbálja újra.",
    "Ennek a kampánynak nincs működő ajánlatkódja.",
    "A kuponja ki van kapcsolva vagy lejárt, így ezek az e-mailek kedvezmény nélkül mennek ki. Kapcsolja vissza a kódot az Akciók és kuponok alatt.",
  ],
  el: [
    "Αυτός ο κωδικός αποστέλλεται με email από μια ενεργή καμπάνια Autopilot. Απενεργοποιήστε την καμπάνια στο Μάρκετινγκ → Autopilot για να τον αποσύρετε.",
    "Δεν ήταν δυνατή η αλλαγή της προσφοράς. Δοκιμάστε ξανά.",
    "Αυτή η καμπάνια δεν έχει κωδικό προσφοράς που να λειτουργεί.",
    "Το κουπόνι της είναι απενεργοποιημένο ή έχει λήξει, οπότε αυτά τα email φεύγουν χωρίς έκπτωση. Ενεργοποιήστε ξανά τον κωδικό στις Προσφορές και κουπόνια.",
  ],
  bg: [
    "Този код се изпраща по имейл от активна кампания Autopilot. Изключете кампанията в Маркетинг → Autopilot, за да го оттеглите.",
    "Промоцията не можа да бъде променена. Опитайте отново.",
    "Тази кампания няма работещ код за оферта.",
    "Купонът ѝ е изключен или изтекъл, затова тези имейли излизат без отстъпка. Включете кода отново в Промоции и купони.",
  ],
  hr: [
    "Ovaj kod e-poštom šalje aktivna Autopilot kampanja. Isključite kampanju u Marketing → Autopilot da biste ga povukli.",
    "Promociju nije bilo moguće promijeniti. Pokušajte ponovno.",
    "Ova kampanja nema ispravan kod ponude.",
    "Njezin je kupon isključen ili istekao pa ovi e-mailovi odlaze bez popusta. Ponovno uključite kod u Promocije i kuponi.",
  ],
  sr: [
    "Ovaj kod e-poštom šalje aktivna Autopilot kampanja. Isključite kampanju u Marketing → Autopilot da biste ga povukli.",
    "Promociju nije bilo moguće promeniti. Pokušajte ponovo.",
    "Ova kampanja nema ispravan kod ponude.",
    "Njen kupon je isključen ili je istekao pa ovi mejlovi odlaze bez popusta. Ponovo uključite kod u Promocije i kuponi.",
  ],
  sl: [
    "To kodo po e-pošti pošilja aktivna kampanja Autopilot. Če jo želite umakniti, izklopite kampanjo v Trženje → Autopilot.",
    "Promocije ni bilo mogoče spremeniti. Poskusite znova.",
    "Ta kampanja nima delujoče kode ponudbe.",
    "Njen kupon je izklopljen ali potekel, zato ta e-poštna sporočila odhajajo brez popusta. Kodo znova vklopite v Promocije in kuponi.",
  ],
  et: [
    "Seda koodi saadab e-postiga töötav Autopilot kampaania. Selle tagasivõtmiseks lülitage kampaania välja jaotises Turundus → Autopilot.",
    "Pakkumist ei õnnestunud muuta. Proovige uuesti.",
    "Sellel kampaanial pole toimivat pakkumiskoodi.",
    "Selle kupong on välja lülitatud või aegunud, seega lähevad need e-kirjad välja ilma soodustuseta. Lülitage kood uuesti sisse jaotises Pakkumised ja kupongid.",
  ],
  lv: [
    "Šo kodu e-pastā izsūta aktīva Autopilot kampaņa. Lai to atsauktu, izslēdziet kampaņu sadaļā Mārketings → Autopilot.",
    "Neizdevās mainīt šo piedāvājumu. Mēģiniet vēlreiz.",
    "Šai kampaņai nav derīga piedāvājuma koda.",
    "Tās kupons ir izslēgts vai beidzies, tāpēc šie e-pasti tiek sūtīti bez atlaides. Ieslēdziet kodu atpakaļ sadaļā Piedāvājumi un kuponi.",
  ],
  lt: [
    "Šį kodą el. paštu siunčia veikianti Autopilot kampanija. Norėdami jį atšaukti, išjunkite kampaniją skiltyje Rinkodara → Autopilot.",
    "Nepavyko pakeisti šio pasiūlymo. Bandykite dar kartą.",
    "Ši kampanija neturi veikiančio pasiūlymo kodo.",
    "Jos kuponas išjungtas arba nebegalioja, todėl šie el. laiškai išsiunčiami be nuolaidos. Vėl įjunkite kodą skiltyje Pasiūlymai ir kuponai.",
  ],
  tr: [
    "Bu kod, çalışan bir Autopilot kampanyası tarafından e-postayla gönderiliyor. Geri çekmek için kampanyayı Pazarlama → Autopilot bölümünden kapatın.",
    "Bu kampanya değiştirilemedi. Lütfen tekrar deneyin.",
    "Bu kampanyanın çalışan bir teklif kodu yok.",
    "Kuponu kapalı veya süresi dolmuş, bu yüzden bu e-postalar indirimsiz gidiyor. Kodu Kampanyalar ve kuponlar bölümünden yeniden açın.",
  ],
  ru: [
    "Этот код рассылает по электронной почте активная кампания Autopilot. Чтобы отозвать его, отключите кампанию в разделе Маркетинг → Autopilot.",
    "Не удалось изменить эту акцию. Попробуйте ещё раз.",
    "У этой кампании нет работающего промокода.",
    "Её купон отключён или истёк, поэтому письма уходят без скидки. Включите код снова в разделе Акции и купоны.",
  ],
  uk: [
    "Цей код розсилає електронною поштою активна кампанія Autopilot. Щоб відкликати його, вимкніть кампанію в розділі Маркетинг → Autopilot.",
    "Не вдалося змінити цю акцію. Спробуйте ще раз.",
    "У цієї кампанії немає робочого промокоду.",
    "Її купон вимкнено або він закінчився, тому ці листи надходять без знижки. Увімкніть код знову в розділі Акції та купони.",
  ],
  ca: [
    "Una campanya d'Autopilot activa està enviant aquest codi per correu. Desactiva la campanya a Màrqueting → Autopilot per retirar-lo.",
    "No s'ha pogut canviar aquesta promoció. Torna-ho a provar.",
    "Aquesta campanya no té cap codi d'oferta que funcioni.",
    "El seu cupó està desactivat o caducat, així que aquests correus surten sense descompte. Torna a activar el codi a Promocions i cupons.",
  ],
  id: [
    "Kode ini sedang dikirim lewat email oleh kampanye Autopilot yang aktif. Matikan kampanye di Pemasaran → Autopilot untuk menariknya.",
    "Promosi ini tidak dapat diubah. Silakan coba lagi.",
    "Kampanye ini tidak punya kode penawaran yang berfungsi.",
    "Kuponnya dimatikan atau kedaluwarsa, jadi email ini terkirim tanpa diskon. Aktifkan lagi kodenya di Promosi dan kupon.",
  ],
  vi: [
    "Mã này đang được một chiến dịch Autopilot đang chạy gửi qua email. Tắt chiến dịch trong Tiếp thị → Autopilot để thu hồi mã.",
    "Không thể thay đổi khuyến mãi này. Vui lòng thử lại.",
    "Chiến dịch này không có mã ưu đãi nào hoạt động.",
    "Phiếu giảm giá của nó đã tắt hoặc hết hạn, nên các email này gửi đi mà không có giảm giá. Bật lại mã trong Khuyến mãi và phiếu giảm giá.",
  ],
  th: [
    "โค้ดนี้กำลังถูกส่งทางอีเมลโดยแคมเปญ Autopilot ที่กำลังทำงานอยู่ หากต้องการยกเลิก ให้ปิดแคมเปญที่ การตลาด → Autopilot",
    "เปลี่ยนโปรโมชันนี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    "แคมเปญนี้ไม่มีโค้ดข้อเสนอที่ใช้งานได้",
    "คูปองของแคมเปญถูกปิดหรือหมดอายุแล้ว อีเมลเหล่านี้จึงถูกส่งออกไปโดยไม่มีส่วนลด เปิดโค้ดอีกครั้งได้ที่ โปรโมชันและคูปอง",
  ],
  zh: [
    "此优惠码正由一个正在运行的 Autopilot 营销活动通过邮件发送。如需停用，请在“营销 → Autopilot”中关闭该活动。",
    "无法修改此促销。请重试。",
    "此营销活动没有可用的优惠码。",
    "它的优惠券已关闭或过期，因此这些邮件发出时不含折扣。请在“促销与优惠券”中重新启用该优惠码。",
  ],
  ja: [
    "このコードは実行中の Autopilot キャンペーンがメールで配信しています。停止するには、マーケティング → Autopilot でキャンペーンをオフにしてください。",
    "このプロモーションを変更できませんでした。もう一度お試しください。",
    "このキャンペーンには有効なクーポンコードがありません。",
    "クーポンがオフまたは期限切れのため、これらのメールは割引なしで送信されます。「プロモーションとクーポン」でコードを再度オンにしてください。",
  ],
  ko: [
    "이 코드는 실행 중인 Autopilot 캠페인이 이메일로 발송하고 있습니다. 중단하려면 마케팅 → Autopilot에서 캠페인을 끄세요.",
    "이 프로모션을 변경하지 못했습니다. 다시 시도해 주세요.",
    "이 캠페인에는 사용 가능한 할인 코드가 없습니다.",
    "쿠폰이 꺼져 있거나 만료되어 이 이메일은 할인 없이 발송됩니다. 프로모션 및 쿠폰에서 코드를 다시 켜세요.",
  ],
  ar: [
    "يجري إرسال هذا الرمز بالبريد الإلكتروني عبر حملة Autopilot نشطة. لسحبه، أوقف الحملة من التسويق ← Autopilot.",
    "تعذّر تغيير هذا العرض. يُرجى المحاولة مرة أخرى.",
    "لا يوجد لهذه الحملة رمز عرض صالح.",
    "قسيمتها موقوفة أو منتهية الصلاحية، لذا تُرسل هذه الرسائل بدون خصم. أعِد تفعيل الرمز من العروض والقسائم.",
  ],
  he: [
    "הקוד הזה נשלח במייל על ידי קמפיין Autopilot פעיל. כדי לבטל אותו, כבו את הקמפיין בשיווק ← Autopilot.",
    "לא ניתן היה לשנות את המבצע. נסו שוב.",
    "לקמפיין הזה אין קוד הטבה תקין.",
    "הקופון שלו כבוי או פג תוקף, ולכן המיילים האלה יוצאים ללא הנחה. הפעילו את הקוד מחדש במבצעים וקופונים.",
  ],
  hi: [
    "यह कोड एक चालू Autopilot कैंपेन द्वारा ईमेल से भेजा जा रहा है। इसे बंद करने के लिए मार्केटिंग → Autopilot में कैंपेन बंद करें।",
    "यह प्रमोशन बदला नहीं जा सका। कृपया फिर से कोशिश करें।",
    "इस कैंपेन के पास कोई काम करने वाला ऑफ़र कोड नहीं है।",
    "इसका कूपन बंद है या उसकी समय-सीमा खत्म हो गई है, इसलिए ये ईमेल बिना छूट के जाते हैं। कोड को प्रमोशन और कूपन में फिर से चालू करें।",
  ],
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
const missing: string[] = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const tr = T[loc];
  if (!tr) { missing.push(loc); continue; }
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  setDeep(data, "admin.promotionsList.titleCampaignLocked", tr[0]);
  setDeep(data, "admin.promotionsList.toggleFailed", tr[1]);
  setDeep(data, "admin.autopilotClient.codeNotLiveTitle", tr[2]);
  setDeep(data, "admin.autopilotClient.codeNotLiveBody", tr[3]);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
if (missing.length) {
  console.error(`✗ NO TRANSLATION for: ${missing.join(", ")} — parity would break. Add them and re-run.`);
  process.exit(1);
}
console.log(`✓ campaign-code guard keys added to ${n} locale(s).`);
