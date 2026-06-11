/** i18n: menu-item visible-but-purchase-restricted mode × 38 locales.
 *   ordering.availableOnlyLabel ({window})
 *   admin.menuEditor.{availabilityModeLabel,availabilityModeHide,availabilityModeShow,availabilityModeHint}
 *   npx tsx scripts/i18n-add-availability-mode.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "ordering.availableOnlyLabel": {
    en: "Available {window}", fr: "Disponible {window}", es: "Disponible {window}", it: "Disponibile {window}", pt: "Disponível {window}", "pt-BR": "Disponível {window}",
    de: "Verfügbar {window}", nl: "Beschikbaar {window}", ro: "Disponibil {window}", sv: "Tillgänglig {window}", da: "Tilgængelig {window}", nb: "Tilgjengelig {window}",
    fi: "Saatavilla {window}", pl: "Dostępne {window}", cs: "K dispozici {window}", sk: "K dispozícii {window}", hu: "Elérhető: {window}", el: "Διαθέσιμο {window}",
    bg: "Налично {window}", hr: "Dostupno {window}", sr: "Доступно {window}", sl: "Na voljo {window}", et: "Saadaval {window}", lv: "Pieejams {window}",
    lt: "Galima {window}", tr: "Şu zamanlarda mevcut: {window}", ru: "Доступно {window}", uk: "Доступно {window}", ca: "Disponible {window}", id: "Tersedia {window}",
    vi: "Có sẵn {window}", th: "มีจำหน่าย {window}", zh: "供应时间 {window}", ja: "提供時間 {window}", ko: "이용 가능 {window}", ar: "متاح {window}", he: "זמין {window}", hi: "उपलब्ध {window}",
  },
  "admin.menuEditor.availabilityModeLabel": {
    en: "When not available", fr: "Quand indisponible", es: "Cuando no está disponible", it: "Quando non è disponibile", pt: "Quando indisponível", "pt-BR": "Quando indisponível",
    de: "Wenn nicht verfügbar", nl: "Wanneer niet beschikbaar", ro: "Când nu este disponibil", sv: "När den inte är tillgänglig", da: "Når ikke tilgængelig", nb: "Når ikke tilgjengelig",
    fi: "Kun ei saatavilla", pl: "Gdy niedostępne", cs: "Když není k dispozici", sk: "Keď nie je k dispozícii", hu: "Ha nem elérhető", el: "Όταν δεν είναι διαθέσιμο",
    bg: "Когато не е налично", hr: "Kad nije dostupno", sr: "Када није доступно", sl: "Ko ni na voljo", et: "Kui pole saadaval", lv: "Kad nav pieejams",
    lt: "Kai negalima", tr: "Mevcut olmadığında", ru: "Когда недоступно", uk: "Коли недоступно", ca: "Quan no està disponible", id: "Saat tidak tersedia",
    vi: "Khi không có sẵn", th: "เมื่อไม่พร้อมจำหน่าย", zh: "不可用时", ja: "提供時間外のとき", ko: "이용 불가 시간에는", ar: "عند عدم التوفر", he: "כשאינו זמין", hi: "जब उपलब्ध न हो",
  },
  "admin.menuEditor.availabilityModeHide": {
    en: "Hide from menu", fr: "Masquer du menu", es: "Ocultar del menú", it: "Nascondi dal menu", pt: "Ocultar do menu", "pt-BR": "Ocultar do cardápio",
    de: "Aus dem Menü ausblenden", nl: "Verbergen in menu", ro: "Ascunde din meniu", sv: "Dölj från menyn", da: "Skjul fra menuen", nb: "Skjul fra menyen",
    fi: "Piilota valikosta", pl: "Ukryj w menu", cs: "Skrýt z nabídky", sk: "Skryť z ponuky", hu: "Elrejtés az étlapról", el: "Απόκρυψη από το μενού",
    bg: "Скрий от менюто", hr: "Sakrij iz izbornika", sr: "Сакриј из менија", sl: "Skrij iz menija", et: "Peida menüüst", lv: "Slēpt no ēdienkartes",
    lt: "Slėpti iš meniu", tr: "Menüden gizle", ru: "Скрыть из меню", uk: "Сховати з меню", ca: "Amaga del menú", id: "Sembunyikan dari menu",
    vi: "Ẩn khỏi thực đơn", th: "ซ่อนจากเมนู", zh: "从菜单隐藏", ja: "メニューから非表示", ko: "메뉴에서 숨기기", ar: "إخفاء من القائمة", he: "הסתר מהתפריט", hi: "मेनू से छिपाएँ",
  },
  "admin.menuEditor.availabilityModeShow": {
    en: "Show, but block ordering", fr: "Afficher, mais bloquer la commande", es: "Mostrar, pero bloquear el pedido", it: "Mostra, ma blocca l'ordine", pt: "Mostrar, mas bloquear o pedido", "pt-BR": "Mostrar, mas bloquear o pedido",
    de: "Anzeigen, aber Bestellung sperren", nl: "Tonen, maar bestellen blokkeren", ro: "Afișează, dar blochează comanda", sv: "Visa, men blockera beställning", da: "Vis, men bloker bestilling", nb: "Vis, men blokker bestilling",
    fi: "Näytä, mutta estä tilaaminen", pl: "Pokaż, ale zablokuj zamawianie", cs: "Zobrazit, ale blokovat objednání", sk: "Zobraziť, ale blokovať objednanie", hu: "Mutasd, de tiltsd a rendelést", el: "Εμφάνιση, αλλά αποκλεισμός παραγγελίας",
    bg: "Показвай, но блокирай поръчката", hr: "Prikaži, ali blokiraj naručivanje", sr: "Прикажи, али блокирај наручивање", sl: "Prikaži, a prepreči naročanje", et: "Näita, kuid blokeeri tellimine", lv: "Rādīt, bet bloķēt pasūtīšanu",
    lt: "Rodyti, bet blokuoti užsakymą", tr: "Göster ama siparişi engelle", ru: "Показывать, но блокировать заказ", uk: "Показувати, але блокувати замовлення", ca: "Mostra, però bloqueja la comanda", id: "Tampilkan, tapi blokir pemesanan",
    vi: "Hiển thị nhưng chặn đặt món", th: "แสดงแต่ห้ามสั่ง", zh: "显示但禁止下单", ja: "表示するが注文は不可", ko: "표시하되 주문 차단", ar: "إظهار مع منع الطلب", he: "הצג אך חסום הזמנה", hi: "दिखाएँ, पर ऑर्डर रोकें",
  },
  "admin.menuEditor.availabilityModeHint": {
    en: "\"Show\" keeps the item visible with an \"Available …\" note so customers know when they can order it.", fr: "« Afficher » garde l'article visible avec une note « Disponible … » pour que les clients sachent quand le commander.", es: "\"Mostrar\" mantiene el artículo visible con una nota \"Disponible …\" para que los clientes sepan cuándo pedirlo.", it: "\"Mostra\" mantiene il piatto visibile con una nota \"Disponibile …\" così i clienti sanno quando ordinarlo.", pt: "\"Mostrar\" mantém o item visível com uma nota \"Disponível …\" para os clientes saberem quando o podem pedir.", "pt-BR": "\"Mostrar\" mantém o item visível com uma nota \"Disponível …\" para os clientes saberem quando pedir.",
    de: "\"Anzeigen\" hält das Gericht sichtbar mit dem Hinweis \"Verfügbar …\", damit Kunden wissen, wann sie es bestellen können.", nl: "\"Tonen\" houdt het item zichtbaar met een \"Beschikbaar …\"-melding zodat klanten weten wanneer ze het kunnen bestellen.", ro: "„Afișează” păstrează produsul vizibil cu o notă „Disponibil …”, ca să știe clienții când îl pot comanda.", sv: "\"Visa\" håller rätten synlig med en \"Tillgänglig …\"-notis så kunderna vet när de kan beställa.", da: "\"Vis\" holder retten synlig med en \"Tilgængelig …\"-note, så kunderne ved, hvornår de kan bestille.", nb: "\"Vis\" holder retten synlig med en \"Tilgjengelig …\"-merknad så kundene vet når de kan bestille.",
    fi: "\"Näytä\" pitää tuotteen näkyvissä \"Saatavilla …\" -merkinnällä, jotta asiakkaat tietävät milloin sen voi tilata.", pl: "„Pokaż” pozostawia pozycję widoczną z dopiskiem „Dostępne …”, aby klienci wiedzieli, kiedy mogą ją zamówić.", cs: "„Zobrazit“ ponechá položku viditelnou s poznámkou „K dispozici …“, aby zákazníci věděli, kdy ji lze objednat.", sk: "„Zobraziť“ ponechá položku viditeľnú s poznámkou „K dispozícii …“, aby zákazníci vedeli, kedy si ju môžu objednať.", hu: "A „Mutasd” láthatóan tartja a tételt egy „Elérhető …” jelzéssel, így a vendégek tudják, mikor rendelhetik.", el: "Η «Εμφάνιση» κρατά το πιάτο ορατό με σημείωση «Διαθέσιμο …» ώστε οι πελάτες να ξέρουν πότε μπορούν να το παραγγείλουν.",
    bg: "„Показвай“ оставя артикула видим с бележка „Налично …“, за да знаят клиентите кога могат да го поръчат.", hr: "\"Prikaži\" ostavlja artikl vidljivim s napomenom \"Dostupno …\" pa kupci znaju kada ga mogu naručiti.", sr: "„Прикажи“ оставља артикал видљивим уз напомену „Доступно …“ па купци знају када могу да га наруче.", sl: "»Prikaži« ohrani izdelek viden z opombo »Na voljo …«, da stranke vedo, kdaj ga lahko naročijo.", et: "„Näita” jätab toote nähtavaks märkega „Saadaval …”, et kliendid teaksid, millal saab tellida.", lv: "“Rādīt” saglabā ēdienu redzamu ar piezīmi “Pieejams …”, lai klienti zinātu, kad to var pasūtīt.",
    lt: "„Rodyti“ palieka patiekalą matomą su pastaba „Galima …“, kad klientai žinotų, kada jį galima užsisakyti.", tr: "\"Göster\" ürünü \"Mevcut …\" notuyla görünür tutar; müşteriler ne zaman sipariş verebileceklerini bilir.", ru: "«Показывать» оставляет блюдо видимым с пометкой «Доступно …», чтобы клиенты знали, когда его можно заказать.", uk: "«Показувати» залишає страву видимою з позначкою «Доступно …», щоб клієнти знали, коли її можна замовити.", ca: "\"Mostra\" manté l'article visible amb una nota \"Disponible …\" perquè els clients sàpiguen quan el poden demanar.", id: "\"Tampilkan\" membuat item tetap terlihat dengan catatan \"Tersedia …\" agar pelanggan tahu kapan bisa memesannya.",
    vi: "\"Hiển thị\" giữ món hiển thị kèm ghi chú \"Có sẵn …\" để khách biết khi nào có thể đặt.", th: "\"แสดง\" จะทำให้เมนูยังมองเห็นพร้อมหมายเหตุ \"มีจำหน่าย …\" เพื่อให้ลูกค้ารู้ว่าสั่งได้เมื่อใด", zh: "“显示”会保留菜品并附“供应时间 …”提示，让顾客知道何时可以下单。", ja: "「表示」を選ぶと「提供時間 …」の注記付きで表示され、注文できる時間が分かります。", ko: "\"표시\"를 선택하면 \"이용 가능 …\" 안내와 함께 메뉴에 계속 표시되어 고객이 주문 가능 시간을 알 수 있습니다.", ar: "\"إظهار\" يُبقي الصنف مرئيًا مع ملاحظة \"متاح …\" ليعرف العملاء متى يمكنهم طلبه.", he: "\"הצג\" משאיר את הפריט גלוי עם הערת \"זמין …\" כך שהלקוחות יודעים מתי אפשר להזמין.", hi: "\"दिखाएँ\" आइटम को \"उपलब्ध …\" नोट के साथ दिखाता रहता है ताकि ग्राहक जानें कि कब ऑर्डर कर सकते हैं।",
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
console.log(`✓ availability-mode strings (${Object.keys(KEYS).length} keys) added to ${n} locale(s).`);
