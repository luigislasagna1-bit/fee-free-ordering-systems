/**
 * The quoted-vs-charged banner on the Nabil call detail page → all 38 locales.
 *
 * Two keys under admin.phoneOrderingPage.callDetail. Fully translated (not an
 * English baseline) so the 38-locale parity audit passes with 0 missing / 0
 * extra / 0 placeholder-arg / 0 rich-tag mismatches on the first run.
 *
 * The {quoted} and {charged} placeholders are already-formatted currency
 * strings — every translation must keep both, spelled exactly.
 *
 *   npx tsx scripts/i18n-add-voice-total-mismatch.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Pair = { totalMismatchTitle: string; totalMismatchBody: string };

const T: Record<string, Pair> = {
  en: {
    totalMismatchTitle: "The total changed after the caller said yes",
    totalMismatchBody:
      "Nabil quoted {quoted} and the order was placed at {charged}. The caller agreed to the first number. Check this order before it becomes a complaint.",
  },
  fr: {
    totalMismatchTitle: "Le total a changé après l'accord du client",
    totalMismatchBody:
      "Nabil a annoncé {quoted} et la commande a été enregistrée à {charged}. Le client a accepté le premier montant. Vérifiez cette commande avant qu'elle ne devienne une réclamation.",
  },
  es: {
    totalMismatchTitle: "El total cambió después de que el cliente aceptara",
    totalMismatchBody:
      "Nabil indicó {quoted} y el pedido se registró por {charged}. El cliente aceptó el primer importe. Revise este pedido antes de que se convierta en una reclamación.",
  },
  it: {
    totalMismatchTitle: "Il totale è cambiato dopo il sì del cliente",
    totalMismatchBody:
      "Nabil ha detto {quoted} e l'ordine è stato registrato a {charged}. Il cliente ha accettato la prima cifra. Controlla questo ordine prima che diventi un reclamo.",
  },
  pt: {
    totalMismatchTitle: "O total mudou depois de o cliente aceitar",
    totalMismatchBody:
      "O Nabil indicou {quoted} e o pedido foi registado por {charged}. O cliente aceitou o primeiro valor. Verifique este pedido antes que se torne uma reclamação.",
  },
  "pt-BR": {
    totalMismatchTitle: "O total mudou depois que o cliente aceitou",
    totalMismatchBody:
      "O Nabil informou {quoted} e o pedido foi registrado por {charged}. O cliente aceitou o primeiro valor. Verifique este pedido antes que vire uma reclamação.",
  },
  de: {
    totalMismatchTitle: "Der Gesamtbetrag hat sich nach der Zusage geändert",
    totalMismatchBody:
      "Nabil nannte {quoted}, die Bestellung wurde mit {charged} angelegt. Der Anrufer hat dem ersten Betrag zugestimmt. Prüfen Sie diese Bestellung, bevor daraus eine Beschwerde wird.",
  },
  nl: {
    totalMismatchTitle: "Het totaal veranderde nadat de beller ja zei",
    totalMismatchBody:
      "Nabil noemde {quoted} en de bestelling is geplaatst voor {charged}. De beller ging akkoord met het eerste bedrag. Controleer deze bestelling voordat het een klacht wordt.",
  },
  ro: {
    totalMismatchTitle: "Totalul s-a schimbat după ce clientul a acceptat",
    totalMismatchBody:
      "Nabil a spus {quoted}, iar comanda a fost înregistrată la {charged}. Clientul a acceptat prima sumă. Verificați această comandă înainte să devină o reclamație.",
  },
  sv: {
    totalMismatchTitle: "Summan ändrades efter att kunden sagt ja",
    totalMismatchBody:
      "Nabil sa {quoted} och beställningen lades till {charged}. Kunden godkände det första beloppet. Kontrollera ordern innan den blir ett klagomål.",
  },
  da: {
    totalMismatchTitle: "Totalen ændrede sig, efter kunden sagde ja",
    totalMismatchBody:
      "Nabil sagde {quoted}, og ordren blev oprettet til {charged}. Kunden accepterede det første beløb. Tjek denne ordre, før den bliver til en klage.",
  },
  nb: {
    totalMismatchTitle: "Totalen endret seg etter at kunden sa ja",
    totalMismatchBody:
      "Nabil sa {quoted}, og bestillingen ble lagt inn til {charged}. Kunden godtok det første beløpet. Sjekk denne bestillingen før den blir en klage.",
  },
  fi: {
    totalMismatchTitle: "Summa muuttui sen jälkeen, kun asiakas hyväksyi",
    totalMismatchBody:
      "Nabil ilmoitti {quoted} ja tilaus kirjattiin hintaan {charged}. Asiakas hyväksyi ensimmäisen summan. Tarkista tämä tilaus, ennen kuin siitä tulee reklamaatio.",
  },
  pl: {
    totalMismatchTitle: "Suma zmieniła się po zgodzie klienta",
    totalMismatchBody:
      "Nabil podał {quoted}, a zamówienie złożono na {charged}. Klient zgodził się na pierwszą kwotę. Sprawdź to zamówienie, zanim stanie się reklamacją.",
  },
  cs: {
    totalMismatchTitle: "Celková částka se změnila poté, co zákazník souhlasil",
    totalMismatchBody:
      "Nabil uvedl {quoted} a objednávka byla založena za {charged}. Zákazník souhlasil s první částkou. Zkontrolujte tuto objednávku, než se z ní stane stížnost.",
  },
  sk: {
    totalMismatchTitle: "Celková suma sa zmenila po súhlase zákazníka",
    totalMismatchBody:
      "Nabil uviedol {quoted} a objednávka bola vytvorená za {charged}. Zákazník súhlasil s prvou sumou. Skontrolujte túto objednávku, kým sa z nej nestane sťažnosť.",
  },
  hu: {
    totalMismatchTitle: "A végösszeg a vevő igenje után megváltozott",
    totalMismatchBody:
      "A Nabil {quoted} összeget mondott, a rendelés viszont {charged} összeggel készült. A hívó az elsőt fogadta el. Nézze át ezt a rendelést, mielőtt panasz lesz belőle.",
  },
  el: {
    totalMismatchTitle: "Το σύνολο άλλαξε αφού ο πελάτης συμφώνησε",
    totalMismatchBody:
      "Ο Nabil ανέφερε {quoted} και η παραγγελία καταχωρήθηκε στα {charged}. Ο πελάτης συμφώνησε με το πρώτο ποσό. Ελέγξτε αυτή την παραγγελία πριν γίνει παράπονο.",
  },
  bg: {
    totalMismatchTitle: "Сумата се промени, след като клиентът се съгласи",
    totalMismatchBody:
      "Nabil каза {quoted}, а поръчката е създадена за {charged}. Клиентът се съгласи с първата сума. Проверете тази поръчка, преди да се превърне в оплакване.",
  },
  hr: {
    totalMismatchTitle: "Ukupan iznos promijenio se nakon što je kupac pristao",
    totalMismatchBody:
      "Nabil je rekao {quoted}, a narudžba je zaprimljena na {charged}. Kupac je pristao na prvi iznos. Provjerite ovu narudžbu prije nego postane pritužba.",
  },
  sr: {
    totalMismatchTitle: "Укупан износ се променио након што је купац пристао",
    totalMismatchBody:
      "Nabil је рекао {quoted}, а поруџбина је евидентирана на {charged}. Купац је пристао на први износ. Проверите ову поруџбину пре него што постане жалба.",
  },
  sl: {
    totalMismatchTitle: "Skupni znesek se je spremenil po strankinem soglasju",
    totalMismatchBody:
      "Nabil je povedal {quoted}, naročilo pa je bilo oddano za {charged}. Stranka je pristala na prvi znesek. Preverite to naročilo, preden postane pritožba.",
  },
  et: {
    totalMismatchTitle: "Summa muutus pärast seda, kui klient nõustus",
    totalMismatchBody:
      "Nabil ütles {quoted} ja tellimus vormistati hinnaga {charged}. Klient nõustus esimese summaga. Kontrollige seda tellimust, enne kui sellest saab kaebus.",
  },
  lv: {
    totalMismatchTitle: "Kopsumma mainījās pēc klienta piekrišanas",
    totalMismatchBody:
      "Nabil nosauca {quoted}, bet pasūtījums tika izveidots par {charged}. Klients piekrita pirmajai summai. Pārbaudiet šo pasūtījumu, pirms tas kļūst par sūdzību.",
  },
  lt: {
    totalMismatchTitle: "Suma pasikeitė po to, kai klientas sutiko",
    totalMismatchBody:
      "Nabil nurodė {quoted}, o užsakymas įformintas už {charged}. Klientas sutiko su pirmąja suma. Patikrinkite šį užsakymą, kol jis netapo skundu.",
  },
  tr: {
    totalMismatchTitle: "Müşteri onay verdikten sonra toplam değişti",
    totalMismatchBody:
      "Nabil {quoted} tutarını söyledi, sipariş ise {charged} olarak oluşturuldu. Müşteri ilk tutarı kabul etmişti. Bir şikâyete dönüşmeden bu siparişi kontrol edin.",
  },
  ru: {
    totalMismatchTitle: "Сумма изменилась после согласия клиента",
    totalMismatchBody:
      "Nabil назвал {quoted}, а заказ оформлен на {charged}. Клиент согласился на первую сумму. Проверьте этот заказ, пока он не превратился в жалобу.",
  },
  uk: {
    totalMismatchTitle: "Сума змінилася після згоди клієнта",
    totalMismatchBody:
      "Nabil назвав {quoted}, а замовлення оформлено на {charged}. Клієнт погодився на першу суму. Перевірте це замовлення, доки воно не стало скаргою.",
  },
  ca: {
    totalMismatchTitle: "El total va canviar després que el client hi accedís",
    totalMismatchBody:
      "El Nabil va dir {quoted} i la comanda es va registrar per {charged}. El client va acceptar el primer import. Reviseu aquesta comanda abans que es converteixi en una reclamació.",
  },
  id: {
    totalMismatchTitle: "Total berubah setelah pelanggan menyetujuinya",
    totalMismatchBody:
      "Nabil menyebut {quoted} dan pesanan dibuat seharga {charged}. Pelanggan menyetujui angka yang pertama. Periksa pesanan ini sebelum menjadi keluhan.",
  },
  vi: {
    totalMismatchTitle: "Tổng tiền đã thay đổi sau khi khách đồng ý",
    totalMismatchBody:
      "Nabil báo {quoted} nhưng đơn hàng được tạo với {charged}. Khách đã đồng ý với số tiền đầu tiên. Hãy kiểm tra đơn này trước khi nó thành khiếu nại.",
  },
  th: {
    totalMismatchTitle: "ยอดรวมเปลี่ยนไปหลังจากลูกค้าตกลงแล้ว",
    totalMismatchBody:
      "Nabil แจ้งยอด {quoted} แต่ออร์เดอร์ถูกบันทึกที่ {charged} ลูกค้าตกลงตามยอดแรก โปรดตรวจสอบออร์เดอร์นี้ก่อนที่จะกลายเป็นข้อร้องเรียน",
  },
  zh: {
    totalMismatchTitle: "顾客确认后总金额发生了变化",
    totalMismatchBody:
      "Nabil 报的是 {quoted}，但订单以 {charged} 生成。顾客同意的是前一个金额。请在演变成投诉之前核对这笔订单。",
  },
  ja: {
    totalMismatchTitle: "お客様の了承後に合計金額が変わりました",
    totalMismatchBody:
      "Nabil は {quoted} と伝えましたが、注文は {charged} で作成されました。お客様が了承したのは最初の金額です。クレームになる前にこの注文をご確認ください。",
  },
  ko: {
    totalMismatchTitle: "고객이 동의한 뒤 총액이 바뀌었습니다",
    totalMismatchBody:
      "Nabil은 {quoted}(으)로 안내했지만 주문은 {charged}(으)로 접수되었습니다. 고객이 동의한 금액은 처음 것입니다. 불만으로 번지기 전에 이 주문을 확인하세요.",
  },
  ar: {
    totalMismatchTitle: "تغيّر الإجمالي بعد موافقة المتصل",
    totalMismatchBody:
      "ذكر Nabil مبلغ {quoted} بينما سُجِّل الطلب بمبلغ {charged}. وافق المتصل على المبلغ الأول. راجع هذا الطلب قبل أن يتحوّل إلى شكوى.",
  },
  he: {
    totalMismatchTitle: "הסכום השתנה אחרי שהלקוח אישר",
    totalMismatchBody:
      "‏Nabil אמר {quoted} וההזמנה נפתחה על {charged}. הלקוח אישר את הסכום הראשון. בדקו את ההזמנה הזאת לפני שתהפוך לתלונה.",
  },
  hi: {
    totalMismatchTitle: "ग्राहक की सहमति के बाद कुल राशि बदल गई",
    totalMismatchBody:
      "Nabil ने {quoted} बताया था और ऑर्डर {charged} पर दर्ज हुआ। ग्राहक ने पहली राशि पर सहमति दी थी। शिकायत बनने से पहले इस ऑर्डर की जाँच करें।",
  },
};

const MESSAGES_DIR = path.join(process.cwd(), "src", "messages");

let changed = 0;
for (const locale of SUPPORTED_LOCALES) {
  const pair = T[locale];
  if (!pair) {
    console.error(`✗ ${locale}: NO TRANSLATION — refusing to write an English fallback.`);
    process.exitCode = 1;
    continue;
  }
  // Both placeholders must survive, or the banner renders a bare key at the
  // exact moment an owner needs to read a number.
  for (const [key, value] of Object.entries(pair)) {
    if (key === "totalMismatchBody" && !(value.includes("{quoted}") && value.includes("{charged}"))) {
      console.error(`✗ ${locale}: ${key} lost a placeholder`);
      process.exitCode = 1;
    }
  }

  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const detail = json?.admin?.phoneOrderingPage?.callDetail;
  if (!detail) {
    console.error(`✗ ${locale}: admin.phoneOrderingPage.callDetail missing`);
    process.exitCode = 1;
    continue;
  }
  detail.totalMismatchTitle = pair.totalMismatchTitle;
  detail.totalMismatchBody = pair.totalMismatchBody;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}

console.log(`✓ wrote 2 keys into ${changed}/${SUPPORTED_LOCALES.length} locales`);
