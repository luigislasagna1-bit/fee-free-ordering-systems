/** i18n × 38: kitchen delivery-tile lead-line setting (Luigi 2026-07-03).
 *  The two preview strings are literal examples (proper nouns) — identical in
 *  every locale on purpose. Run: npx tsx scripts/i18n-add-delivery-lead.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.kitchenWorkflowToggle.deliveryLeadLabel": {
    en: "What shows on the top line of a delivery order", fr: "Ce qui apparaît sur la première ligne d'une commande en livraison", es: "Qué se muestra en la primera línea de un pedido a domicilio", it: "Cosa appare sulla prima riga di un ordine a domicilio",
    pt: "O que aparece na primeira linha de um pedido de entrega", "pt-BR": "O que aparece na primeira linha de um pedido de entrega", de: "Was in der ersten Zeile einer Lieferbestellung steht", nl: "Wat op de bovenste regel van een bezorgorder staat",
    ro: "Ce apare pe primul rând al unei comenzi cu livrare", sv: "Vad som visas på översta raden för en leveransorder", da: "Hvad der vises på øverste linje af en leveringsordre", nb: "Hva som vises på øverste linje av en leveringsordre",
    fi: "Mitä toimitustilauksen ylimmällä rivillä näkyy", pl: "Co widać w górnym wierszu zamówienia z dostawą", cs: "Co se zobrazí na horním řádku objednávky s rozvozem", sk: "Čo sa zobrazí v hornom riadku objednávky s donáškou",
    hu: "Mi jelenjen meg a kiszállításos rendelés felső sorában", el: "Τι εμφανίζεται στην πρώτη γραμμή μιας παραγγελίας διανομής", bg: "Какво се показва на горния ред на поръчка с доставка", hr: "Što se prikazuje u gornjem retku narudžbe s dostavom",
    sr: "Шта се приказује у горњем реду поруџбине са доставом", sl: "Kaj je prikazano v zgornji vrstici naročila z dostavo", et: "Mis kuvatakse kohaletoimetamistellimuse ülemisel real", lv: "Kas redzams piegādes pasūtījuma augšējā rindā",
    lt: "Kas rodoma pristatymo užsakymo viršutinėje eilutėje", tr: "Teslimat siparişinin üst satırında ne gösterilir", ru: "Что показывать в верхней строке заказа с доставкой", uk: "Що показувати у верхньому рядку замовлення з доставкою",
    ca: "Què es mostra a la primera línia d'una comanda a domicili", id: "Apa yang tampil di baris atas pesanan antar", vi: "Hiển thị gì ở dòng trên cùng của đơn giao hàng", th: "สิ่งที่แสดงบนบรรทัดบนสุดของออเดอร์เดลิเวอรี",
    zh: "外送订单顶行显示的内容", ja: "配達注文の最上行に表示する内容", ko: "배달 주문 맨 윗줄에 표시할 내용", ar: "ما يظهر في السطر العلوي لطلب التوصيل",
    he: "מה מוצג בשורה העליונה של הזמנת משלוח", hi: "डिलीवरी ऑर्डर की शीर्ष पंक्ति में क्या दिखे",
  },
  "admin.kitchenWorkflowToggle.deliveryLeadHelp": {
    en: "The top line of a delivery tile is always big and bold; the second line is lighter. This only chooses WHICH goes on top — the customer's name or the delivery address.",
    fr: "La première ligne d'une carte de livraison est toujours grande et en gras ; la seconde est plus discrète. Ce choix détermine seulement CE QUI apparaît en haut : le nom du client ou l'adresse de livraison.",
    es: "La primera línea de una tarjeta de reparto siempre es grande y en negrita; la segunda es más tenue. Esto solo decide QUÉ va arriba: el nombre del cliente o la dirección de entrega.",
    it: "La prima riga di una scheda di consegna è sempre grande e in grassetto; la seconda è più leggera. Qui scegli solo COSA va in alto: il nome del cliente o l'indirizzo di consegna.",
    pt: "A primeira linha de um cartão de entrega é sempre grande e a negrito; a segunda é mais leve. Isto só decide O QUE fica em cima: o nome do cliente ou a morada de entrega.",
    "pt-BR": "A primeira linha de um cartão de entrega é sempre grande e em negrito; a segunda é mais leve. Isto só decide O QUE fica em cima: o nome do cliente ou o endereço de entrega.",
    de: "Die oberste Zeile einer Lieferkachel ist immer groß und fett; die zweite Zeile ist dezenter. Hier wird nur gewählt, WAS oben steht — der Kundenname oder die Lieferadresse.",
    nl: "De bovenste regel van een bezorgtegel is altijd groot en vet; de tweede regel is lichter. Dit bepaalt alleen WAT bovenaan staat: de naam van de klant of het bezorgadres.",
    ro: "Primul rând al unui card de livrare este mereu mare și îngroșat; al doilea este mai discret. Aici alegeți doar CE apare sus: numele clientului sau adresa de livrare.",
    sv: "Översta raden på en leveransruta är alltid stor och fet; andra raden är ljusare. Detta väljer bara VAD som hamnar överst — kundens namn eller leveransadressen.",
    da: "Øverste linje på en leveringsbrik er altid stor og fed; anden linje er lysere. Dette vælger kun, HVAD der står øverst — kundens navn eller leveringsadressen.",
    nb: "Øverste linje på en leveringsflis er alltid stor og fet; andre linje er lysere. Dette velger bare HVA som står øverst — kundens navn eller leveringsadressen.",
    fi: "Toimitusruudun ylin rivi on aina iso ja lihavoitu; toinen rivi on vaaleampi. Tämä valitsee vain, KUMPI on ylhäällä — asiakkaan nimi vai toimitusosoite.",
    pl: "Górny wiersz kafelka dostawy jest zawsze duży i pogrubiony; drugi wiersz jest jaśniejszy. To ustawienie decyduje tylko, CO jest na górze — nazwisko klienta czy adres dostawy.",
    cs: "Horní řádek dlaždice rozvozu je vždy velký a tučný; druhý řádek je světlejší. Zde volíte jen, CO bude nahoře — jméno zákazníka, nebo doručovací adresa.",
    sk: "Horný riadok dlaždice donášky je vždy veľký a tučný; druhý riadok je svetlejší. Tu volíte len, ČO bude hore — meno zákazníka alebo adresa doručenia.",
    hu: "A kiszállítási csempe felső sora mindig nagy és félkövér; a második sor halványabb. Itt csak azt választja ki, MI kerüljön felülre — az ügyfél neve vagy a szállítási cím.",
    el: "Η πρώτη γραμμή ενός πλακιδίου διανομής είναι πάντα μεγάλη και έντονη· η δεύτερη πιο διακριτική. Εδώ επιλέγετε μόνο ΤΙ πάει επάνω — το όνομα του πελάτη ή η διεύθυνση παράδοσης.",
    bg: "Горният ред на плочка за доставка винаги е голям и удебелен; вторият е по-блед. Тук избирате само КАКВО да е отгоре — името на клиента или адресът за доставка.",
    hr: "Gornji redak pločice dostave uvijek je velik i podebljan; drugi je svjetliji. Ovdje birate samo ŠTO ide gore — ime kupca ili adresa dostave.",
    sr: "Горњи ред плочице доставе увек је велики и подебљан; други је светлији. Овде бирате само ШТА иде горе — име купца или адреса доставе.",
    sl: "Zgornja vrstica ploščice dostave je vedno velika in krepka; druga je svetlejša. Tu izberete le, KAJ je zgoraj — ime stranke ali naslov dostave.",
    et: "Kohaletoimetamise paani ülemine rida on alati suur ja rasvane; teine rida heledam. Siin valite vaid, MIS on üleval — kliendi nimi või tarneaadress.",
    lv: "Piegādes plāksnītes augšējā rinda vienmēr ir liela un treknrakstā; otrā ir gaišāka. Šeit tikai izvēlaties, KAS ir augšā — klienta vārds vai piegādes adrese.",
    lt: "Pristatymo plytelės viršutinė eilutė visada didelė ir paryškinta; antroji — šviesesnė. Čia pasirenkate tik, KAS viršuje — kliento vardas ar pristatymo adresas.",
    tr: "Teslimat kutucuğunun üst satırı her zaman büyük ve kalındır; ikinci satır daha soluktur. Bu yalnızca üstte NEYİN olacağını seçer — müşterinin adı mı, teslimat adresi mi.",
    ru: "Верхняя строка плитки доставки всегда крупная и жирная; вторая — светлее. Здесь выбирается только ЧТО сверху — имя клиента или адрес доставки.",
    uk: "Верхній рядок плитки доставки завжди великий і жирний; другий — світліший. Тут обирається лише ЩО зверху — ім'я клієнта чи адреса доставки.",
    ca: "La primera línia d'una targeta de repartiment sempre és gran i en negreta; la segona és més tènue. Això només tria QUÈ va a dalt: el nom del client o l'adreça de lliurament.",
    id: "Baris atas ubin pengantaran selalu besar dan tebal; baris kedua lebih ringan. Ini hanya memilih APA yang di atas — nama pelanggan atau alamat antar.",
    vi: "Dòng trên cùng của thẻ giao hàng luôn to và đậm; dòng thứ hai nhạt hơn. Cài đặt này chỉ chọn CÁI GÌ ở trên — tên khách hàng hay địa chỉ giao hàng.",
    th: "บรรทัดบนสุดของการ์ดเดลิเวอรีจะใหญ่และหนาเสมอ ส่วนบรรทัดที่สองจางกว่า ตัวเลือกนี้กำหนดเพียงว่าอะไรอยู่ด้านบน — ชื่อลูกค้าหรือที่อยู่จัดส่ง",
    zh: "外送卡片的顶行始终大号加粗；第二行较浅。此设置只决定哪一项在上面——客户姓名还是配送地址。",
    ja: "配達タイルの最上行は常に大きく太字、2行目は薄めです。この設定では上に来る内容（顧客名か配達先住所か）だけを選びます。",
    ko: "배달 타일의 맨 윗줄은 항상 크고 굵으며, 둘째 줄은 연합니다. 이 설정은 위에 올 내용만 선택합니다 — 고객 이름 또는 배달 주소.",
    ar: "السطر العلوي لبطاقة التوصيل كبير وغامق دائمًا؛ والسطر الثاني أفتح. هذا الخيار يحدد فقط ما يظهر في الأعلى — اسم العميل أو عنوان التوصيل.",
    he: "השורה העליונה של אריח משלוח תמיד גדולה ומודגשת; השנייה בהירה יותר. כאן בוחרים רק מה יופיע למעלה — שם הלקוח או כתובת המשלוח.",
    hi: "डिलीवरी टाइल की शीर्ष पंक्ति हमेशा बड़ी और बोल्ड होती है; दूसरी पंक्ति हल्की। यह केवल चुनता है कि ऊपर क्या रहे — ग्राहक का नाम या डिलीवरी पता।",
  },
  "admin.kitchenWorkflowToggle.deliveryLeadNameOption": {
    en: "Customer name on top", fr: "Nom du client en haut", es: "Nombre del cliente arriba", it: "Nome del cliente in alto", pt: "Nome do cliente em cima", "pt-BR": "Nome do cliente em cima", de: "Kundenname oben", nl: "Klantnaam bovenaan",
    ro: "Numele clientului sus", sv: "Kundens namn överst", da: "Kundens navn øverst", nb: "Kundens navn øverst", fi: "Asiakkaan nimi ylhäällä", pl: "Nazwisko klienta na górze", cs: "Jméno zákazníka nahoře", sk: "Meno zákazníka hore",
    hu: "Ügyfél neve felül", el: "Όνομα πελάτη επάνω", bg: "Име на клиента отгоре", hr: "Ime kupca gore", sr: "Име купца горе", sl: "Ime stranke zgoraj", et: "Kliendi nimi üleval", lv: "Klienta vārds augšā",
    lt: "Kliento vardas viršuje", tr: "Müşteri adı üstte", ru: "Имя клиента сверху", uk: "Ім'я клієнта зверху", ca: "Nom del client a dalt", id: "Nama pelanggan di atas", vi: "Tên khách ở trên", th: "ชื่อลูกค้าอยู่บน",
    zh: "客户姓名在上", ja: "顧客名を上に", ko: "고객 이름 위", ar: "اسم العميل في الأعلى", he: "שם הלקוח למעלה", hi: "ग्राहक का नाम ऊपर",
  },
  "admin.kitchenWorkflowToggle.deliveryLeadAddressOption": {
    en: "Address on top", fr: "Adresse en haut", es: "Dirección arriba", it: "Indirizzo in alto", pt: "Morada em cima", "pt-BR": "Endereço em cima", de: "Adresse oben", nl: "Adres bovenaan",
    ro: "Adresa sus", sv: "Adressen överst", da: "Adressen øverst", nb: "Adressen øverst", fi: "Osoite ylhäällä", pl: "Adres na górze", cs: "Adresa nahoře", sk: "Adresa hore",
    hu: "Cím felül", el: "Διεύθυνση επάνω", bg: "Адресът отгоре", hr: "Adresa gore", sr: "Адреса горе", sl: "Naslov zgoraj", et: "Aadress üleval", lv: "Adrese augšā",
    lt: "Adresas viršuje", tr: "Adres üstte", ru: "Адрес сверху", uk: "Адреса зверху", ca: "Adreça a dalt", id: "Alamat di atas", vi: "Địa chỉ ở trên", th: "ที่อยู่อยู่บน",
    zh: "地址在上", ja: "住所を上に", ko: "주소 위", ar: "العنوان في الأعلى", he: "הכתובת למעלה", hi: "पता ऊपर",
  },
  // Literal layout examples — the same in every language on purpose.
  "admin.kitchenWorkflowToggle.deliveryLeadNamePreview": {
    en: "Mario Rossi ▸ Via Mazzini 13, Varedo",
  },
  "admin.kitchenWorkflowToggle.deliveryLeadAddressPreview": {
    en: "Via Mazzini 13, Varedo ▸ Mario Rossi",
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
console.log(`✓ Delivery-lead strings added to ${n} locale(s).`);
