/** i18n × 38: redeem-exclusion picker (admin.rewards.redeemExclude*) — which
 *  items can't be PAID FOR with Reward Dollars; separate switch from the
 *  earn/promo exclusions (Luigi 2026-07-02). {label} = reward name — keep it.
 *  Run: npx tsx scripts/i18n-add-redeem-exclusions.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.rewards.redeemExcludeTitle": {
    en: "Items that can't be paid with {label}", fr: "Articles non payables en {label}", es: "Artículos que no se pueden pagar con {label}", it: "Articoli non pagabili con {label}",
    pt: "Artigos que não podem ser pagos com {label}", "pt-BR": "Itens que não podem ser pagos com {label}", de: "Artikel, die nicht mit {label} bezahlt werden können", nl: "Items die niet met {label} betaald kunnen worden",
    ro: "Articole care nu pot fi plătite cu {label}", sv: "Varor som inte kan betalas med {label}", da: "Varer der ikke kan betales med {label}", nb: "Varer som ikke kan betales med {label}",
    fi: "Tuotteet, joita ei voi maksaa {label}", pl: "Produkty, za które nie można płacić {label}", cs: "Položky, které nelze platit {label}", sk: "Položky, ktoré nemožno platiť {label}",
    hu: "Termékek, amelyek nem fizethetők {label} egyenleggel", el: "Είδη που δεν πληρώνονται με {label}", bg: "Артикули, които не могат да се плащат с {label}", hr: "Stavke koje se ne mogu platiti s {label}",
    sr: "Ставке које се не могу платити са {label}", sl: "Izdelki, ki jih ni mogoče plačati z {label}", et: "Tooted, mida ei saa maksta {label}", lv: "Preces, ko nevar apmaksāt ar {label}",
    lt: "Prekės, už kurias negalima mokėti {label}", tr: "{label} ile ödenemeyen ürünler", ru: "Товары, которые нельзя оплатить {label}", uk: "Товари, які не можна оплатити {label}",
    ca: "Articles que no es poden pagar amb {label}", id: "Item yang tidak bisa dibayar dengan {label}", vi: "Mặt hàng không thể thanh toán bằng {label}", th: "รายการที่จ่ายด้วย {label} ไม่ได้",
    zh: "不能用{label}支付的商品", ja: "{label}で支払えない商品", ko: "{label}(으)로 결제할 수 없는 항목", ar: "عناصر لا يمكن دفع ثمنها بـ {label}",
    he: "פריטים שאי אפשר לשלם עליהם ב-{label}", hi: "ऐसी वस्तुएँ जिन्हें {label} से नहीं खरीदा जा सकता",
  },
  "admin.rewards.redeemExcludeHelp": {
    en: "Customers can't spend {label} on excluded items or categories (e.g. gift cards — store credit shouldn't buy store credit). The checkout automatically lowers the amount of {label} they can apply. This is separate from the earning exclusion above and from the promo-discount exclusion on the Promotions page.",
    fr: "Les clients ne peuvent pas dépenser de {label} sur les articles ou catégories exclus (ex. cartes-cadeaux — le crédit ne doit pas acheter du crédit). Le paiement réduit automatiquement le montant de {label} applicable. Indépendant de l'exclusion de gains ci-dessus et de l'exclusion de remises de la page Promotions.",
    es: "Los clientes no pueden gastar {label} en artículos o categorías excluidos (p. ej. tarjetas regalo — el crédito no debe comprar crédito). El pago reduce automáticamente la cantidad de {label} aplicable. Es independiente de la exclusión de ganancia de arriba y de la exclusión de descuentos de la página de Promociones.",
    it: "I clienti non possono spendere {label} su articoli o categorie esclusi (es. buoni regalo — il credito non deve comprare credito). Il checkout riduce automaticamente l'importo di {label} applicabile. Indipendente dall'esclusione dei guadagni sopra e dall'esclusione sconti della pagina Promozioni.",
    pt: "Os clientes não podem gastar {label} em artigos ou categorias excluídos (ex. cartões-presente — o crédito não deve comprar crédito). O checkout reduz automaticamente o montante de {label} aplicável. Independente da exclusão de ganhos acima e da exclusão de descontos da página de Promoções.",
    "pt-BR": "Os clientes não podem gastar {label} em itens ou categorias excluídos (ex. vales-presente — crédito não deve comprar crédito). O checkout reduz automaticamente o valor de {label} aplicável. Independente da exclusão de ganhos acima e da exclusão de descontos da página de Promoções.",
    de: "Kunden können {label} nicht für ausgeschlossene Artikel oder Kategorien ausgeben (z. B. Geschenkkarten — Guthaben soll kein Guthaben kaufen). Der Checkout senkt automatisch den einsetzbaren {label}-Betrag. Unabhängig vom Verdienst-Ausschluss oben und vom Rabatt-Ausschluss auf der Aktionsseite.",
    nl: "Klanten kunnen geen {label} uitgeven aan uitgesloten items of categorieën (bijv. cadeaubonnen — tegoed hoort geen tegoed te kopen). De checkout verlaagt automatisch het toepasbare {label}-bedrag. Los van de verdien-uitsluiting hierboven en de kortingsuitsluiting op de Promotiepagina.",
    ro: "Clienții nu pot cheltui {label} pe articolele sau categoriile excluse (ex. carduri cadou — creditul nu trebuie să cumpere credit). Checkout-ul reduce automat suma de {label} aplicabilă. Separată de excluderea acumulării de mai sus și de excluderea reducerilor din pagina Promoții.",
    sv: "Kunder kan inte spendera {label} på undantagna varor eller kategorier (t.ex. presentkort — saldo ska inte köpa saldo). Kassan sänker automatiskt beloppet {label} som kan användas. Separat från intjänings-undantaget ovan och rabatt-undantaget på kampanjsidan.",
    da: "Kunder kan ikke bruge {label} på undtagne varer eller kategorier (f.eks. gavekort — kredit skal ikke købe kredit). Kassen sænker automatisk det anvendelige {label}-beløb. Adskilt fra optjenings-undtagelsen ovenfor og rabat-undtagelsen på kampagnesiden.",
    nb: "Kunder kan ikke bruke {label} på ekskluderte varer eller kategorier (f.eks. gavekort — kreditt skal ikke kjøpe kreditt). Kassen senker automatisk {label}-beløpet som kan brukes. Uavhengig av opptjenings-ekskluderingen over og rabatt-ekskluderingen på kampanjesiden.",
    fi: "Asiakkaat eivät voi käyttää {label} suljettuihin tuotteisiin tai luokkiin (esim. lahjakortit — saldolla ei pidä ostaa saldoa). Kassa pienentää automaattisesti käytettävissä olevaa {label}-määrää. Erillinen yllä olevasta kerryttämisen poissulusta ja Kampanjat-sivun alennuspoissulusta.",
    pl: "Klienci nie mogą wydawać {label} na wykluczone produkty lub kategorie (np. karty podarunkowe — środki nie powinny kupować środków). Kasa automatycznie obniża kwotę {label} do wykorzystania. Niezależne od wykluczenia zdobywania powyżej i wykluczenia zniżek na stronie Promocje.",
    cs: "Zákazníci nemohou utrácet {label} za vyloučené položky nebo kategorie (např. dárkové karty — kredit nemá kupovat kredit). Pokladna automaticky sníží uplatnitelnou částku {label}. Nezávislé na vyloučení získávání výše i na vyloučení slev na stránce Akce.",
    sk: "Zákazníci nemôžu míňať {label} na vylúčené položky alebo kategórie (napr. darčekové karty — kredit nemá kupovať kredit). Pokladňa automaticky zníži uplatniteľnú sumu {label}. Nezávislé od vylúčenia získavania vyššie aj od vylúčenia zliav na stránke Akcie.",
    hu: "Az ügyfelek nem költhetnek {label} egyenleget a kizárt termékekre vagy kategóriákra (pl. ajándékkártyák — egyenleg ne vásároljon egyenleget). A pénztár automatikusan csökkenti a felhasználható {label} összegét. Független a fenti gyűjtési kizárástól és a Promóciók oldal kedvezmény-kizárásától.",
    el: "Οι πελάτες δεν μπορούν να ξοδέψουν {label} σε εξαιρούμενα είδη ή κατηγορίες (π.χ. δωροκάρτες — το υπόλοιπο δεν πρέπει να αγοράζει υπόλοιπο). Το ταμείο μειώνει αυτόματα το ποσό {label} που εφαρμόζεται. Ανεξάρτητο από την εξαίρεση κερδών παραπάνω και την εξαίρεση εκπτώσεων στη σελίδα Προσφορών.",
    bg: "Клиентите не могат да харчат {label} за изключени артикули или категории (напр. ваучери — кредитът не бива да купува кредит). Плащането автоматично намалява приложимата сума {label}. Отделно от изключването на печеленето по-горе и от изключването на отстъпки в страницата Промоции.",
    hr: "Kupci ne mogu trošiti {label} na isključene stavke ili kategorije (npr. poklon-bonovi — kredit ne smije kupovati kredit). Naplata automatski smanjuje primjenjivi iznos {label}. Odvojeno od isključenja zarade iznad i isključenja popusta na stranici Promocije.",
    sr: "Купци не могу трошити {label} на искључене ставке или категорије (нпр. поклон картице — кредит не треба да купује кредит). Наплата аутоматски смањује применљив износ {label}. Одвојено од искључења зараде изнад и искључења попуста на страници Промоције.",
    sl: "Stranke ne morejo porabiti {label} za izključene izdelke ali kategorije (npr. darilne kartice — dobroimetje naj ne kupuje dobroimetja). Blagajna samodejno zniža uporabni znesek {label}. Ločeno od izključitve pridobivanja zgoraj in izključitve popustov na strani Promocije.",
    et: "Kliendid ei saa kulutada {label} välistatud toodetele või kategooriatele (nt kinkekaardid — krediit ei tohiks osta krediiti). Kassa vähendab automaatselt rakendatavat {label} summat. Eraldi ülaltoodud teenimise välistusest ja Promotsioonide lehe allahindluse välistusest.",
    lv: "Klienti nevar tērēt {label} izslēgtām precēm vai kategorijām (piem., dāvanu kartēm — kredītam nevajadzētu pirkt kredītu). Norēķins automātiski samazina piemērojamo {label} summu. Atsevišķi no pelnīšanas izslēgšanas augstāk un atlaižu izslēgšanas lapā Akcijas.",
    lt: "Klientai negali leisti {label} neįtrauktoms prekėms ar kategorijoms (pvz., dovanų kortelėms — kreditas neturėtų pirkti kredito). Kasoje automatiškai sumažinama pritaikoma {label} suma. Atskira nuo aukščiau esančio uždirbimo neįtraukimo ir nuolaidų neįtraukimo Akcijų puslapyje.",
    tr: "Müşteriler hariç tutulan ürün veya kategorilerde {label} harcayamaz (ör. hediye kartları — bakiye bakiye satın almamalı). Ödeme adımı uygulanabilir {label} tutarını otomatik düşürür. Yukarıdaki kazanma hariç tutmasından ve Promosyonlar sayfasındaki indirim hariç tutmasından bağımsızdır.",
    ru: "Клиенты не могут тратить {label} на исключённые товары или категории (например, подарочные карты — кредит не должен покупать кредит). Касса автоматически уменьшает применимую сумму {label}. Отдельно от исключения начисления выше и исключения скидок на странице «Акции».",
    uk: "Клієнти не можуть витрачати {label} на виключені товари чи категорії (напр., подарункові картки — кредит не має купувати кредит). Каса автоматично зменшує застосовну суму {label}. Окремо від виключення нарахування вище та виключення знижок на сторінці «Акції».",
    ca: "Els clients no poden gastar {label} en articles o categories exclosos (p. ex. targetes regal — el crèdit no ha de comprar crèdit). El pagament redueix automàticament l'import de {label} aplicable. Independent de l'exclusió de guanys de dalt i de l'exclusió de descomptes de la pàgina de Promocions.",
    id: "Pelanggan tidak bisa membelanjakan {label} untuk item atau kategori yang dikecualikan (mis. kartu hadiah — kredit tidak boleh membeli kredit). Checkout otomatis menurunkan jumlah {label} yang bisa dipakai. Terpisah dari pengecualian perolehan di atas dan pengecualian diskon di halaman Promosi.",
    vi: "Khách không thể dùng {label} cho các mặt hàng hoặc danh mục bị loại trừ (vd. thẻ quà tặng — tín dụng không nên mua tín dụng). Thanh toán tự động giảm số {label} có thể áp dụng. Tách biệt với loại trừ tích lũy ở trên và loại trừ giảm giá ở trang Khuyến mãi.",
    th: "ลูกค้าใช้ {label} กับรายการหรือหมวดที่ยกเว้นไม่ได้ (เช่น บัตรของขวัญ — เครดิตไม่ควรซื้อเครดิต) หน้าชำระเงินจะลดจำนวน {label} ที่ใช้ได้โดยอัตโนมัติ แยกจากการยกเว้นการสะสมด้านบนและการยกเว้นส่วนลดในหน้าโปรโมชัน",
    zh: "顾客不能用{label}购买被排除的商品或类别（如礼品卡——余额不应购买余额）。结账时会自动降低可使用的{label}金额。与上方的赚取排除和促销页的折扣排除相互独立。",
    ja: "対象外の商品やカテゴリ（ギフトカードなど — 残高で残高を買わせない）には{label}を使えません。チェックアウトで利用可能な{label}額が自動的に下がります。上の獲得除外やプロモーションページの割引除外とは別の設定です。",
    ko: "제외된 항목이나 카테고리(예: 기프트 카드 — 크레딧으로 크레딧을 사면 안 됨)에는 {label}을(를) 사용할 수 없습니다. 결제 시 적용 가능한 {label} 금액이 자동으로 줄어듭니다. 위의 적립 제외 및 프로모션 페이지의 할인 제외와는 별개입니다.",
    ar: "لا يمكن للعملاء إنفاق {label} على العناصر أو الفئات المستثناة (مثل بطاقات الهدايا — لا ينبغي أن يشتري الرصيد رصيدًا). يخفّض الدفع تلقائيًا مبلغ {label} القابل للاستخدام. منفصل عن استثناء الكسب أعلاه وعن استثناء الخصومات في صفحة العروض.",
    he: "לקוחות לא יכולים להוציא {label} על פריטים או קטגוריות שהוחרגו (למשל כרטיסי מתנה — יתרה לא אמורה לקנות יתרה). הקופה מפחיתה אוטומטית את סכום ה-{label} שניתן להחיל. נפרד מהחרגת הצבירה למעלה ומהחרגת ההנחות בעמוד המבצעים.",
    hi: "ग्राहक बाहर रखी गई वस्तुओं या श्रेणियों पर {label} खर्च नहीं कर सकते (जैसे गिफ्ट कार्ड — क्रेडिट से क्रेडिट नहीं खरीदना चाहिए)। चेकआउट लागू होने वाली {label} राशि अपने आप घटा देता है। यह ऊपर की कमाई-छूट और प्रमोशन पेज की छूट-अपवर्जन से अलग है।",
  },
  "admin.rewards.redeemExcludeDesc": {
    en: "Pick categories or items customers can't pay for with {label}.", fr: "Choisissez les catégories ou articles que les clients ne peuvent pas payer en {label}.", es: "Elige las categorías o artículos que los clientes no pueden pagar con {label}.", it: "Scegli categorie o articoli che i clienti non possono pagare con {label}.",
    pt: "Escolha categorias ou artigos que os clientes não podem pagar com {label}.", "pt-BR": "Escolha categorias ou itens que os clientes não podem pagar com {label}.", de: "Wählen Sie Kategorien oder Artikel, die Kunden nicht mit {label} bezahlen können.", nl: "Kies categorieën of items die klanten niet met {label} kunnen betalen.",
    ro: "Alegeți categoriile sau articolele pe care clienții nu le pot plăti cu {label}.", sv: "Välj kategorier eller varor som kunder inte kan betala med {label}.", da: "Vælg kategorier eller varer, som kunder ikke kan betale med {label}.", nb: "Velg kategorier eller varer som kunder ikke kan betale med {label}.",
    fi: "Valitse luokat tai tuotteet, joita asiakkaat eivät voi maksaa {label}.", pl: "Wybierz kategorie lub produkty, za które klienci nie mogą płacić {label}.", cs: "Vyberte kategorie nebo položky, které zákazníci nemohou platit {label}.", sk: "Vyberte kategórie alebo položky, ktoré zákazníci nemôžu platiť {label}.",
    hu: "Válassza ki a kategóriákat vagy termékeket, amelyeket az ügyfelek nem fizethetnek {label} egyenleggel.", el: "Επιλέξτε κατηγορίες ή είδη που οι πελάτες δεν μπορούν να πληρώσουν με {label}.", bg: "Изберете категории или артикули, които клиентите не могат да плащат с {label}.", hr: "Odaberite kategorije ili stavke koje kupci ne mogu platiti s {label}.",
    sr: "Изаберите категорије или ставке које купци не могу платити са {label}.", sl: "Izberite kategorije ali izdelke, ki jih stranke ne morejo plačati z {label}.", et: "Valige kategooriad või tooted, mida kliendid ei saa maksta {label}.", lv: "Izvēlieties kategorijas vai preces, ko klienti nevar apmaksāt ar {label}.",
    lt: "Pasirinkite kategorijas ar prekes, už kurias klientai negali mokėti {label}.", tr: "Müşterilerin {label} ile ödeyemeyeceği kategorileri veya ürünleri seçin.", ru: "Выберите категории или товары, которые клиенты не могут оплатить {label}.", uk: "Виберіть категорії або товари, які клієнти не можуть оплатити {label}.",
    ca: "Tria les categories o articles que els clients no poden pagar amb {label}.", id: "Pilih kategori atau item yang tidak bisa dibayar pelanggan dengan {label}.", vi: "Chọn danh mục hoặc mặt hàng khách không thể thanh toán bằng {label}.", th: "เลือกหมวดหรือรายการที่ลูกค้าจ่ายด้วย {label} ไม่ได้",
    zh: "选择顾客不能用{label}支付的类别或商品。", ja: "顧客が{label}で支払えないカテゴリや商品を選びます。", ko: "고객이 {label}(으)로 결제할 수 없는 카테고리나 항목을 선택하세요.", ar: "اختر الفئات أو العناصر التي لا يمكن للعملاء دفع ثمنها بـ {label}.",
    he: "בחרו קטגוריות או פריטים שלקוחות לא יכולים לשלם עליהם ב-{label}.", hi: "वे श्रेणियाँ या आइटम चुनें जिन्हें ग्राहक {label} से नहीं खरीद सकते।",
  },
  "admin.rewards.redeemExcludeOn": {
    en: "Payable", fr: "Payable", es: "Pagable", it: "Pagabile", pt: "Pagável", "pt-BR": "Pagável", de: "Bezahlbar", nl: "Betaalbaar",
    ro: "Plătibil", sv: "Betalbar", da: "Kan betales", nb: "Kan betales", fi: "Maksettavissa", pl: "Płatne", cs: "Lze platit", sk: "Možno platiť",
    hu: "Fizethető", el: "Πληρώνεται", bg: "Платимо", hr: "Plativo", sr: "Плативо", sl: "Plačljivo", et: "Makstav", lv: "Apmaksājams",
    lt: "Apmokama", tr: "Ödenebilir", ru: "Можно оплатить", uk: "Можна оплатити", ca: "Pagable", id: "Bisa dibayar", vi: "Thanh toán được", th: "จ่ายได้",
    zh: "可支付", ja: "支払い可", ko: "결제 가능", ar: "قابل للدفع", he: "ניתן לתשלום", hi: "देय",
  },
  "admin.rewards.redeemExcludeOff": {
    en: "Not payable", fr: "Non payable", es: "No pagable", it: "Non pagabile", pt: "Não pagável", "pt-BR": "Não pagável", de: "Nicht bezahlbar", nl: "Niet betaalbaar",
    ro: "Nu se plătește", sv: "Ej betalbar", da: "Kan ikke betales", nb: "Kan ikke betales", fi: "Ei maksettavissa", pl: "Nie do zapłaty", cs: "Nelze platit", sk: "Nemožno platiť",
    hu: "Nem fizethető", el: "Δεν πληρώνεται", bg: "Не се плаща", hr: "Nije plativo", sr: "Није плативо", sl: "Ni plačljivo", et: "Ei ole makstav", lv: "Nav apmaksājams",
    lt: "Neapmokama", tr: "Ödenemez", ru: "Нельзя оплатить", uk: "Не можна оплатити", ca: "No pagable", id: "Tidak bisa dibayar", vi: "Không thanh toán được", th: "จ่ายไม่ได้",
    zh: "不可支付", ja: "支払い不可", ko: "결제 불가", ar: "غير قابل للدفع", he: "לא ניתן לתשלום", hi: "देय नहीं",
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
console.log(`✓ redeem-exclusion strings added to ${n} locale(s).`);
