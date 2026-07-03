/** i18n × 38: invoice-completeness labels (GloriaFood/Oracle parity — Luigi
 *  2026-07-03): customer no, payment ref, Nr/Qty/Unit-price columns, Sub-Total,
 *  restaurant identification inside the line, license-terms footer.
 *  Run: npx tsx scripts/i18n-add-invoice-completeness.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.invoice.customerNo": {
    en: "Customer number", fr: "Numéro de client", es: "Número de cliente", it: "Numero cliente", pt: "Número de cliente", "pt-BR": "Número do cliente", de: "Kundennummer", nl: "Klantnummer",
    ro: "Număr client", sv: "Kundnummer", da: "Kundenummer", nb: "Kundenummer", fi: "Asiakasnumero", pl: "Numer klienta", cs: "Číslo zákazníka", sk: "Číslo zákazníka",
    hu: "Ügyfélszám", el: "Αριθμός πελάτη", bg: "Клиентски номер", hr: "Broj kupca", sr: "Број купца", sl: "Številka stranke", et: "Kliendinumber", lv: "Klienta numurs",
    lt: "Kliento numeris", tr: "Müşteri numarası", ru: "Номер клиента", uk: "Номер клієнта", ca: "Número de client", id: "Nomor pelanggan", vi: "Mã khách hàng", th: "หมายเลขลูกค้า",
    zh: "客户编号", ja: "顧客番号", ko: "고객 번호", ar: "رقم العميل", he: "מספר לקוח", hi: "ग्राहक संख्या",
  },
  "admin.invoice.paymentRef": {
    en: "Payment reference", fr: "Référence de paiement", es: "Referencia de pago", it: "Riferimento pagamento", pt: "Referência de pagamento", "pt-BR": "Referência de pagamento", de: "Zahlungsreferenz", nl: "Betalingsreferentie",
    ro: "Referință de plată", sv: "Betalningsreferens", da: "Betalingsreference", nb: "Betalingsreferanse", fi: "Maksuviite", pl: "Referencja płatności", cs: "Reference platby", sk: "Referencia platby",
    hu: "Fizetési hivatkozás", el: "Αναφορά πληρωμής", bg: "Референция за плащане", hr: "Referenca plaćanja", sr: "Референца плаћања", sl: "Sklic plačila", et: "Makseviide", lv: "Maksājuma atsauce",
    lt: "Mokėjimo nuoroda", tr: "Ödeme referansı", ru: "Референс платежа", uk: "Референс платежу", ca: "Referència de pagament", id: "Referensi pembayaran", vi: "Mã tham chiếu thanh toán", th: "รหัสอ้างอิงการชำระเงิน",
    zh: "付款参考号", ja: "支払い参照番号", ko: "결제 참조 번호", ar: "مرجع الدفع", he: "אסמכתת תשלום", hi: "भुगतान संदर्भ",
  },
  "admin.invoice.lineNo": {
    en: "Nr", fr: "N°", es: "N.º", it: "Nr", pt: "N.º", "pt-BR": "Nº", de: "Nr.", nl: "Nr.",
    ro: "Nr.", sv: "Nr", da: "Nr.", nb: "Nr.", fi: "Nro", pl: "Nr", cs: "Č.", sk: "Č.",
    hu: "Ssz.", el: "Αρ.", bg: "№", hr: "Br.", sr: "Бр.", sl: "Št.", et: "Nr", lv: "Nr.",
    lt: "Nr.", tr: "No", ru: "№", uk: "№", ca: "Núm.", id: "No.", vi: "STT", th: "ลำดับ",
    zh: "序号", ja: "番号", ko: "번호", ar: "رقم", he: "מס'", hi: "क्र.",
  },
  "admin.invoice.qty": {
    en: "Qty", fr: "Qté", es: "Cant.", it: "Q.tà", pt: "Qtd.", "pt-BR": "Qtd.", de: "Menge", nl: "Aant.",
    ro: "Cant.", sv: "Antal", da: "Antal", nb: "Antall", fi: "Määrä", pl: "Ilość", cs: "Množ.", sk: "Množ.",
    hu: "Menny.", el: "Ποσ.", bg: "Кол.", hr: "Kol.", sr: "Кол.", sl: "Kol.", et: "Kogus", lv: "Daudz.",
    lt: "Kiekis", tr: "Adet", ru: "Кол-во", uk: "К-сть", ca: "Quant.", id: "Jml", vi: "SL", th: "จำนวน",
    zh: "数量", ja: "数量", ko: "수량", ar: "الكمية", he: "כמות", hi: "मात्रा",
  },
  "admin.invoice.unitPrice": {
    en: "Unit price", fr: "Prix unitaire", es: "Precio unitario", it: "Prezzo unitario", pt: "Preço unitário", "pt-BR": "Preço unitário", de: "Einzelpreis", nl: "Stukprijs",
    ro: "Preț unitar", sv: "Styckpris", da: "Enhedspris", nb: "Enhetspris", fi: "Yksikköhinta", pl: "Cena jedn.", cs: "Jedn. cena", sk: "Jedn. cena",
    hu: "Egységár", el: "Τιμή μονάδας", bg: "Единична цена", hr: "Jedinična cijena", sr: "Јединична цена", sl: "Cena na enoto", et: "Ühikuhind", lv: "Vienības cena",
    lt: "Vieneto kaina", tr: "Birim fiyat", ru: "Цена за единицу", uk: "Ціна за одиницю", ca: "Preu unitari", id: "Harga satuan", vi: "Đơn giá", th: "ราคาต่อหน่วย",
    zh: "单价", ja: "単価", ko: "단가", ar: "سعر الوحدة", he: "מחיר ליחידה", hi: "इकाई मूल्य",
  },
  "admin.invoice.subTotal": {
    en: "Sub-Total", fr: "Sous-total", es: "Subtotal", it: "Subtotale", pt: "Subtotal", "pt-BR": "Subtotal", de: "Zwischensumme", nl: "Subtotaal",
    ro: "Subtotal", sv: "Delsumma", da: "Subtotal", nb: "Delsum", fi: "Välisumma", pl: "Suma częściowa", cs: "Mezisoučet", sk: "Medzisúčet",
    hu: "Részösszeg", el: "Μερικό σύνολο", bg: "Междинна сума", hr: "Međuzbroj", sr: "Међузбир", sl: "Vmesni seštevek", et: "Vahesumma", lv: "Starpsumma",
    lt: "Tarpinė suma", tr: "Ara toplam", ru: "Промежуточный итог", uk: "Проміжний підсумок", ca: "Subtotal", id: "Subtotal", vi: "Tạm tính", th: "ยอดรวมย่อย",
    zh: "小计", ja: "小計", ko: "소계", ar: "المجموع الفرعي", he: "סכום ביניים", hi: "उप-योग",
  },
  "admin.invoice.restaurantIdLabel": {
    en: "Restaurant ID", fr: "ID du restaurant", es: "ID del restaurante", it: "ID ristorante", pt: "ID do restaurante", "pt-BR": "ID do restaurante", de: "Restaurant-ID", nl: "Restaurant-ID",
    ro: "ID restaurant", sv: "Restaurang-ID", da: "Restaurant-ID", nb: "Restaurant-ID", fi: "Ravintolan tunnus", pl: "ID restauracji", cs: "ID restaurace", sk: "ID reštaurácie",
    hu: "Étterem-azonosító", el: "Αναγνωριστικό εστιατορίου", bg: "ID на ресторанта", hr: "ID restorana", sr: "ID ресторана", sl: "ID restavracije", et: "Restorani ID", lv: "Restorāna ID",
    lt: "Restorano ID", tr: "Restoran kimliği", ru: "ID ресторана", uk: "ID ресторану", ca: "ID del restaurant", id: "ID restoran", vi: "Mã nhà hàng", th: "รหัสร้านอาหาร",
    zh: "餐厅 ID", ja: "レストランID", ko: "레스토랑 ID", ar: "معرّف المطعم", he: "מזהה מסעדה", hi: "रेस्टोरेंट ID",
  },
  "admin.invoice.restaurantNameLabel": {
    en: "Restaurant name", fr: "Nom du restaurant", es: "Nombre del restaurante", it: "Nome ristorante", pt: "Nome do restaurante", "pt-BR": "Nome do restaurante", de: "Restaurantname", nl: "Restaurantnaam",
    ro: "Numele restaurantului", sv: "Restaurangnamn", da: "Restaurantnavn", nb: "Restaurantnavn", fi: "Ravintolan nimi", pl: "Nazwa restauracji", cs: "Název restaurace", sk: "Názov reštaurácie",
    hu: "Étterem neve", el: "Όνομα εστιατορίου", bg: "Име на ресторанта", hr: "Naziv restorana", sr: "Назив ресторана", sl: "Ime restavracije", et: "Restorani nimi", lv: "Restorāna nosaukums",
    lt: "Restorano pavadinimas", tr: "Restoran adı", ru: "Название ресторана", uk: "Назва ресторану", ca: "Nom del restaurant", id: "Nama restoran", vi: "Tên nhà hàng", th: "ชื่อร้านอาหาร",
    zh: "餐厅名称", ja: "レストラン名", ko: "레스토랑 이름", ar: "اسم المطعم", he: "שם המסעדה", hi: "रेस्टोरेंट का नाम",
  },
  "admin.invoice.restaurantAddressLabel": {
    en: "Restaurant address", fr: "Adresse du restaurant", es: "Dirección del restaurante", it: "Indirizzo ristorante", pt: "Endereço do restaurante", "pt-BR": "Endereço do restaurante", de: "Restaurantadresse", nl: "Restaurantadres",
    ro: "Adresa restaurantului", sv: "Restaurangadress", da: "Restaurantadresse", nb: "Restaurantadresse", fi: "Ravintolan osoite", pl: "Adres restauracji", cs: "Adresa restaurace", sk: "Adresa reštaurácie",
    hu: "Étterem címe", el: "Διεύθυνση εστιατορίου", bg: "Адрес на ресторанта", hr: "Adresa restorana", sr: "Адреса ресторана", sl: "Naslov restavracije", et: "Restorani aadress", lv: "Restorāna adrese",
    lt: "Restorano adresas", tr: "Restoran adresi", ru: "Адрес ресторана", uk: "Адреса ресторану", ca: "Adreça del restaurant", id: "Alamat restoran", vi: "Địa chỉ nhà hàng", th: "ที่อยู่ร้านอาหาร",
    zh: "餐厅地址", ja: "レストラン住所", ko: "레스토랑 주소", ar: "عنوان المطعم", he: "כתובת המסעדה", hi: "रेस्टोरेंट का पता",
  },
  "admin.invoice.licenseNote": {
    en: "This invoice was issued in accordance with the terms of service accepted when the account was created.",
    fr: "Cette facture a été émise conformément aux conditions d'utilisation acceptées lors de la création du compte.",
    es: "Esta factura se emitió de conformidad con los términos del servicio aceptados al crear la cuenta.",
    it: "Questa fattura è stata emessa in conformità con i termini di servizio accettati alla creazione dell'account.",
    pt: "Esta fatura foi emitida em conformidade com os termos de serviço aceites na criação da conta.",
    "pt-BR": "Esta fatura foi emitida de acordo com os termos de serviço aceitos na criação da conta.",
    de: "Diese Rechnung wurde gemäß den bei der Kontoerstellung akzeptierten Nutzungsbedingungen ausgestellt.",
    nl: "Deze factuur is opgesteld in overeenstemming met de servicevoorwaarden die bij het aanmaken van het account zijn geaccepteerd.",
    ro: "Această factură a fost emisă în conformitate cu termenii serviciului acceptați la crearea contului.",
    sv: "Denna faktura utfärdades i enlighet med de användarvillkor som godkändes när kontot skapades.",
    da: "Denne faktura er udstedt i overensstemmelse med de servicevilkår, der blev accepteret ved oprettelsen af kontoen.",
    nb: "Denne fakturaen ble utstedt i samsvar med tjenestevilkårene som ble akseptert da kontoen ble opprettet.",
    fi: "Tämä lasku on laadittu tilin luonnin yhteydessä hyväksyttyjen käyttöehtojen mukaisesti.",
    pl: "Niniejsza faktura została wystawiona zgodnie z warunkami usługi zaakceptowanymi przy tworzeniu konta.",
    cs: "Tato faktura byla vystavena v souladu s podmínkami služby přijatými při vytvoření účtu.",
    sk: "Táto faktúra bola vystavená v súlade s podmienkami služby prijatými pri vytvorení účtu.",
    hu: "Ez a számla a fiók létrehozásakor elfogadott szolgáltatási feltételeknek megfelelően készült.",
    el: "Το παρόν τιμολόγιο εκδόθηκε σύμφωνα με τους όρους υπηρεσίας που έγιναν αποδεκτοί κατά τη δημιουργία του λογαριασμού.",
    bg: "Тази фактура е издадена в съответствие с условията за ползване, приети при създаването на акаунта.",
    hr: "Ovaj je račun izdan u skladu s uvjetima usluge prihvaćenima prilikom izrade računa korisnika.",
    sr: "Ова фактура је издата у складу са условима услуге прихваћеним при креирању налога.",
    sl: "Ta račun je bil izdan v skladu s pogoji storitve, sprejetimi ob ustvarjanju računa.",
    et: "See arve on väljastatud vastavalt konto loomisel aktsepteeritud teenusetingimustele.",
    lv: "Šis rēķins ir izrakstīts saskaņā ar pakalpojuma noteikumiem, kas pieņemti konta izveides brīdī.",
    lt: "Ši sąskaita faktūra išrašyta pagal paslaugų teikimo sąlygas, priimtas kuriant paskyrą.",
    tr: "Bu fatura, hesap oluşturulurken kabul edilen hizmet şartlarına uygun olarak düzenlenmiştir.",
    ru: "Этот счёт выставлен в соответствии с условиями обслуживания, принятыми при создании аккаунта.",
    uk: "Цей рахунок виставлено відповідно до умов обслуговування, прийнятих під час створення облікового запису.",
    ca: "Aquesta factura s'ha emès d'acord amb les condicions del servei acceptades en crear el compte.",
    id: "Faktur ini diterbitkan sesuai dengan ketentuan layanan yang disetujui saat akun dibuat.",
    vi: "Hóa đơn này được phát hành theo điều khoản dịch vụ đã chấp nhận khi tạo tài khoản.",
    th: "ใบแจ้งหนี้นี้ออกตามข้อกำหนดการให้บริการที่ยอมรับเมื่อสร้างบัญชี",
    zh: "本发票根据创建账户时接受的服务条款开具。",
    ja: "この請求書は、アカウント作成時に同意された利用規約に基づいて発行されました。",
    ko: "이 인보이스는 계정 생성 시 동의한 서비스 약관에 따라 발행되었습니다.",
    ar: "صدرت هذه الفاتورة وفقًا لشروط الخدمة المقبولة عند إنشاء الحساب.",
    he: "חשבונית זו הונפקה בהתאם לתנאי השירות שאושרו בעת יצירת החשבון.",
    hi: "यह चालान खाता बनाते समय स्वीकृत सेवा शर्तों के अनुसार जारी किया गया है।",
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
console.log(`✓ Invoice-completeness strings added to ${n} locale(s).`);
