/** i18n × 38: gift-card promo-exclusion UI (admin.promotionsPage.exclude*).
 *  "No discounts on these items" editor on /admin/promotions — flags items/
 *  categories no promo/coupon may discount + that can't be paid with reward
 *  credit. Luigi 2026-07-02. Run: npx tsx scripts/i18n-add-promo-exclusions.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

// key -> { locale -> text }
const K: Record<string, Record<string, string>> = {
  "admin.promotionsPage.excludeTitle": {
    en: "No discounts on these items", fr: "Aucune remise sur ces articles", es: "Sin descuentos en estos artículos", it: "Nessuno sconto su questi articoli",
    pt: "Sem descontos nestes artigos", "pt-BR": "Sem descontos nestes itens", de: "Keine Rabatte auf diese Artikel", nl: "Geen korting op deze items",
    ro: "Fără reduceri la aceste articole", sv: "Inga rabatter på dessa varor", da: "Ingen rabatter på disse varer", nb: "Ingen rabatter på disse varene",
    fi: "Ei alennuksia näistä tuotteista", pl: "Brak zniżek na te produkty", cs: "Žádné slevy na tyto položky", sk: "Žiadne zľavy na tieto položky",
    hu: "Nincs kedvezmény ezekre a termékekre", el: "Χωρίς εκπτώσεις σε αυτά τα είδη", bg: "Без отстъпки за тези артикули", hr: "Bez popusta na ove stavke",
    sr: "Без попуста на ове ставке", sl: "Brez popustov za te izdelke", et: "Nendele toodetele allahindlusi ei ole", lv: "Šīm precēm atlaides netiek piemērotas",
    lt: "Šioms prekėms nuolaidos netaikomos", tr: "Bu ürünlerde indirim yok", ru: "Без скидок на эти товары", uk: "Без знижок на ці товари",
    ca: "Sense descomptes en aquests articles", id: "Tanpa diskon untuk item ini", vi: "Không giảm giá cho các mặt hàng này", th: "ไม่มีส่วนลดสำหรับรายการเหล่านี้",
    zh: "这些商品不参与折扣", ja: "これらの商品は割引対象外", ko: "이 항목에는 할인이 적용되지 않음", ar: "لا خصومات على هذه العناصر",
    he: "ללא הנחות על פריטים אלה", hi: "इन वस्तुओं पर कोई छूट नहीं",
  },
  "admin.promotionsPage.excludeHelp": {
    en: "Excluded items and categories (e.g. gift cards) never get a promotion or coupon discount, don't count toward a promo's minimum order, and can't be paid for with reward credit — so a $10 coupon can't buy a $10 gift card for free.",
    fr: "Les articles et catégories exclus (ex. cartes-cadeaux) ne reçoivent jamais de remise promo ou coupon, ne comptent pas pour le minimum d'une promo et ne peuvent pas être payés avec du crédit fidélité — un coupon de 10 $ ne peut donc pas acheter une carte-cadeau de 10 $ gratuitement.",
    es: "Los artículos y categorías excluidos (p. ej. tarjetas regalo) nunca reciben descuentos de promociones o cupones, no cuentan para el pedido mínimo de una promoción y no se pueden pagar con crédito de recompensas — así un cupón de 10 $ no puede comprar gratis una tarjeta regalo de 10 $.",
    it: "Gli articoli e le categorie esclusi (es. buoni regalo) non ricevono mai sconti da promozioni o coupon, non contano per l'ordine minimo di una promo e non possono essere pagati con credito premi — così un coupon da 10 $ non può comprare gratis un buono regalo da 10 $.",
    pt: "Os artigos e categorias excluídos (ex. cartões-presente) nunca recebem descontos de promoções ou cupões, não contam para o pedido mínimo de uma promoção e não podem ser pagos com crédito de recompensas — assim um cupão de 10 $ não pode comprar de graça um cartão-presente de 10 $.",
    "pt-BR": "Itens e categorias excluídos (ex. vales-presente) nunca recebem descontos de promoções ou cupons, não contam para o pedido mínimo de uma promoção e não podem ser pagos com crédito de recompensas — assim um cupom de R$10 não pode comprar de graça um vale-presente de R$10.",
    de: "Ausgeschlossene Artikel und Kategorien (z. B. Geschenkkarten) erhalten nie einen Aktions- oder Gutscheinrabatt, zählen nicht zum Mindestbestellwert einer Aktion und können nicht mit Prämienguthaben bezahlt werden — ein 10-$-Gutschein kann also keine 10-$-Geschenkkarte gratis kaufen.",
    nl: "Uitgesloten items en categorieën (bijv. cadeaubonnen) krijgen nooit een promotie- of couponkorting, tellen niet mee voor het minimumbedrag van een promotie en kunnen niet met spaartegoed worden betaald — zo kan een coupon van $10 geen cadeaubon van $10 gratis kopen.",
    ro: "Articolele și categoriile excluse (ex. carduri cadou) nu primesc niciodată reduceri din promoții sau cupoane, nu contează pentru comanda minimă a unei promoții și nu pot fi plătite cu credit de recompense — astfel un cupon de 10 $ nu poate cumpăra gratuit un card cadou de 10 $.",
    sv: "Undantagna varor och kategorier (t.ex. presentkort) får aldrig kampanj- eller kupongrabatt, räknas inte mot en kampanjs minimibelopp och kan inte betalas med belöningssaldo — så en kupong på 10 $ kan inte köpa ett presentkort på 10 $ gratis.",
    da: "Undtagne varer og kategorier (f.eks. gavekort) får aldrig kampagne- eller kuponrabat, tæller ikke med i en kampagnes minimumsordre og kan ikke betales med bonuskredit — så en kupon på 10 $ kan ikke købe et gavekort til 10 $ gratis.",
    nb: "Ekskluderte varer og kategorier (f.eks. gavekort) får aldri kampanje- eller kupongrabatt, teller ikke mot en kampanjes minstebestilling og kan ikke betales med bonuskreditt — så en kupong på 10 $ kan ikke kjøpe et gavekort på 10 $ gratis.",
    fi: "Suljetut tuotteet ja luokat (esim. lahjakortit) eivät koskaan saa kampanja- tai kuponkialennusta, eivät kerrytä kampanjan vähimmäistilausta eikä niitä voi maksaa palkkiosaldolla — joten 10 $ kuponki ei voi ostaa 10 $ lahjakorttia ilmaiseksi.",
    pl: "Wykluczone produkty i kategorie (np. karty podarunkowe) nigdy nie otrzymują zniżki z promocji ani kuponu, nie liczą się do minimalnego zamówienia promocji i nie można za nie płacić środkami z nagród — dzięki temu kupon 10 $ nie kupi karty podarunkowej za 10 $ za darmo.",
    cs: "Vyloučené položky a kategorie (např. dárkové karty) nikdy nedostanou slevu z akce ani kuponu, nepočítají se do minimální objednávky akce a nelze je platit odměnovým kreditem — kupon na 10 $ tak nemůže koupit dárkovou kartu za 10 $ zdarma.",
    sk: "Vylúčené položky a kategórie (napr. darčekové karty) nikdy nedostanú zľavu z akcie ani kupónu, nepočítajú sa do minimálnej objednávky akcie a nedajú sa platiť odmenovým kreditom — kupón na 10 $ tak nemôže kúpiť darčekovú kartu za 10 $ zadarmo.",
    hu: "A kizárt termékek és kategóriák (pl. ajándékkártyák) soha nem kapnak promóciós vagy kuponkedvezményt, nem számítanak bele a promóció minimális rendelésébe, és nem fizethetők jutalomegyenleggel — így egy 10 $-os kupon nem vehet meg ingyen egy 10 $-os ajándékkártyát.",
    el: "Τα εξαιρούμενα είδη και κατηγορίες (π.χ. δωροκάρτες) δεν παίρνουν ποτέ έκπτωση από προσφορά ή κουπόνι, δεν μετρούν στην ελάχιστη παραγγελία μιας προσφοράς και δεν πληρώνονται με πόντους επιβράβευσης — έτσι ένα κουπόνι 10 $ δεν μπορεί να αγοράσει δωρεάν μια δωροκάρτα 10 $.",
    bg: "Изключените артикули и категории (напр. ваучери) никога не получават отстъпка от промоция или купон, не се броят към минималната поръчка на промоция и не могат да се плащат с бонус кредит — така купон за 10 $ не може да купи безплатно ваучер за 10 $.",
    hr: "Isključene stavke i kategorije (npr. poklon-bonovi) nikad ne dobivaju popust promocije ili kupona, ne računaju se u minimalnu narudžbu promocije i ne mogu se platiti nagradnim kreditom — pa kupon od 10 $ ne može besplatno kupiti poklon-bon od 10 $.",
    sr: "Искључене ставке и категорије (нпр. поклон картице) никада не добијају попуст промоције или купона, не рачунају се у минималну поруџбину промоције и не могу се платити наградним кредитом — тако купон од 10 $ не може бесплатно купити поклон картицу од 10 $.",
    sl: "Izključeni izdelki in kategorije (npr. darilne kartice) nikoli ne dobijo popusta promocije ali kupona, ne štejejo v minimalno naročilo promocije in jih ni mogoče plačati z nagradnim dobroimetjem — tako kupon za 10 $ ne more brezplačno kupiti darilne kartice za 10 $.",
    et: "Välistatud tooted ja kategooriad (nt kinkekaardid) ei saa kunagi kampaania- ega kupongi allahindlust, ei loe kampaania miinimumtellimuse hulka ega ole makstavad preemiakrediidiga — nii ei saa 10 $ kupong osta 10 $ kinkekaarti tasuta.",
    lv: "Izslēgtās preces un kategorijas (piem., dāvanu kartes) nekad nesaņem akcijas vai kupona atlaidi, netiek ieskaitītas akcijas minimālajā pasūtījumā un nav apmaksājamas ar atlīdzības kredītu — tā 10 $ kupons nevar bez maksas nopirkt 10 $ dāvanu karti.",
    lt: "Neįtrauktos prekės ir kategorijos (pvz., dovanų kortelės) niekada negauna akcijos ar kupono nuolaidos, nesiskaičiuoja į akcijos minimalų užsakymą ir už jas negalima mokėti atlygio kreditu — tad 10 $ kuponas negali nemokamai nupirkti 10 $ dovanų kortelės.",
    tr: "Hariç tutulan ürün ve kategoriler (ör. hediye kartları) asla promosyon veya kupon indirimi almaz, bir promosyonun minimum sipariş tutarına sayılmaz ve ödül bakiyesiyle ödenemez — böylece 10 $ kupon 10 $ hediye kartını bedava alamaz.",
    ru: "Исключённые товары и категории (например, подарочные карты) никогда не получают скидку по акции или купону, не учитываются в минимальном заказе акции и не оплачиваются бонусным кредитом — так купон на 10 $ не купит подарочную карту на 10 $ бесплатно.",
    uk: "Виключені товари та категорії (напр., подарункові картки) ніколи не отримують знижку за акцією чи купоном, не враховуються в мінімальне замовлення акції та не оплачуються бонусним кредитом — тож купон на 10 $ не купить подарункову картку на 10 $ безкоштовно.",
    ca: "Els articles i categories exclosos (p. ex. targetes regal) mai no reben descompte de promocions o cupons, no compten per a la comanda mínima d'una promoció i no es poden pagar amb crèdit de recompenses — així un cupó de 10 $ no pot comprar gratis una targeta regal de 10 $.",
    id: "Item dan kategori yang dikecualikan (mis. kartu hadiah) tidak pernah mendapat diskon promosi atau kupon, tidak dihitung untuk pesanan minimum promo, dan tidak bisa dibayar dengan kredit hadiah — jadi kupon $10 tidak bisa membeli kartu hadiah $10 secara gratis.",
    vi: "Các mặt hàng và danh mục bị loại trừ (vd. thẻ quà tặng) không bao giờ được giảm giá từ khuyến mãi hay phiếu giảm giá, không tính vào đơn tối thiểu của khuyến mãi và không thể thanh toán bằng tín dụng thưởng — nên phiếu 10 $ không thể mua miễn phí thẻ quà tặng 10 $.",
    th: "รายการและหมวดที่ยกเว้น (เช่น บัตรของขวัญ) จะไม่ได้รับส่วนลดจากโปรโมชันหรือคูปอง ไม่ถูกนับรวมในยอดสั่งขั้นต่ำของโปรโมชัน และจ่ายด้วยเครดิตรางวัลไม่ได้ — คูปอง 10 $ จึงซื้อบัตรของขวัญ 10 $ ฟรีไม่ได้",
    zh: "被排除的商品和类别（如礼品卡）永远不会获得促销或优惠券折扣，不计入促销的最低订单金额，也不能用奖励余额支付——因此 10 美元的优惠券无法免费购买 10 美元的礼品卡。",
    ja: "対象外の商品やカテゴリ（ギフトカードなど）はプロモーションやクーポンの割引を受けず、プロモーションの最低注文額にも数えられず、リワード残高でも支払えません。10ドルのクーポンで10ドルのギフトカードを無料入手することはできません。",
    ko: "제외된 항목과 카테고리(예: 기프트 카드)는 프로모션·쿠폰 할인을 받지 않고, 프로모션 최소 주문 금액에 포함되지 않으며, 리워드 크레딧으로 결제할 수 없습니다. 따라서 10달러 쿠폰으로 10달러 기프트 카드를 무료로 살 수 없습니다.",
    ar: "العناصر والفئات المستثناة (مثل بطاقات الهدايا) لا تحصل أبدًا على خصم عرض أو قسيمة، ولا تُحتسب ضمن الحد الأدنى لطلب العرض، ولا يمكن دفع ثمنها برصيد المكافآت — فلا يمكن لقسيمة بقيمة 10 $ شراء بطاقة هدايا بقيمة 10 $ مجانًا.",
    he: "פריטים וקטגוריות שהוחרגו (למשל כרטיסי מתנה) לעולם לא מקבלים הנחת מבצע או קופון, לא נספרים במינימום ההזמנה של מבצע ולא ניתן לשלם עליהם ביתרת תגמולים — כך קופון של ‎10 $ לא יכול לקנות כרטיס מתנה של ‎10 $ בחינם.",
    hi: "बाहर रखी गई वस्तुएँ और श्रेणियाँ (जैसे गिफ्ट कार्ड) कभी भी प्रमोशन या कूपन छूट नहीं पातीं, प्रोमो के न्यूनतम ऑर्डर में नहीं गिनी जातीं, और रिवॉर्ड क्रेडिट से नहीं खरीदी जा सकतीं — इसलिए $10 का कूपन $10 का गिफ्ट कार्ड मुफ्त नहीं खरीद सकता।",
  },
  "admin.promotionsPage.excludeDesc": {
    en: "Pick categories or items no promotion or coupon may discount (e.g. gift cards).",
    fr: "Choisissez les catégories ou articles qu'aucune promotion ni coupon ne peut remiser (ex. cartes-cadeaux).",
    es: "Elige las categorías o artículos que ninguna promoción o cupón puede descontar (p. ej. tarjetas regalo).",
    it: "Scegli categorie o articoli che nessuna promozione o coupon può scontare (es. buoni regalo).",
    pt: "Escolha categorias ou artigos que nenhuma promoção ou cupão pode descontar (ex. cartões-presente).",
    "pt-BR": "Escolha categorias ou itens que nenhuma promoção ou cupom pode descontar (ex. vales-presente).",
    de: "Wählen Sie Kategorien oder Artikel, die keine Aktion und kein Gutschein rabattieren darf (z. B. Geschenkkarten).",
    nl: "Kies categorieën of items waarop geen enkele promotie of coupon korting mag geven (bijv. cadeaubonnen).",
    ro: "Alegeți categoriile sau articolele pe care nicio promoție sau cupon nu le poate reduce (ex. carduri cadou).",
    sv: "Välj kategorier eller varor som ingen kampanj eller kupong får rabattera (t.ex. presentkort).",
    da: "Vælg kategorier eller varer, som ingen kampagne eller kupon må give rabat på (f.eks. gavekort).",
    nb: "Velg kategorier eller varer som ingen kampanje eller kupong kan rabattere (f.eks. gavekort).",
    fi: "Valitse luokat tai tuotteet, joita mikään kampanja tai kuponki ei saa alentaa (esim. lahjakortit).",
    pl: "Wybierz kategorie lub produkty, których żadna promocja ani kupon nie może przeceniać (np. karty podarunkowe).",
    cs: "Vyberte kategorie nebo položky, které žádná akce ani kupon nesmí zlevnit (např. dárkové karty).",
    sk: "Vyberte kategórie alebo položky, ktoré žiadna akcia ani kupón nesmie zľaviť (napr. darčekové karty).",
    hu: "Válassza ki a kategóriákat vagy termékeket, amelyekre egyetlen promóció vagy kupon sem adhat kedvezményt (pl. ajándékkártyák).",
    el: "Επιλέξτε κατηγορίες ή είδη που καμία προσφορά ή κουπόνι δεν μπορεί να εκπτώσει (π.χ. δωροκάρτες).",
    bg: "Изберете категории или артикули, които никоя промоция или купон не може да намали (напр. ваучери).",
    hr: "Odaberite kategorije ili stavke koje nijedna promocija ili kupon ne smije sniziti (npr. poklon-bonovi).",
    sr: "Изаберите категорије или ставке које ниједна промоција или купон не сме да снизи (нпр. поклон картице).",
    sl: "Izberite kategorije ali izdelke, ki jih nobena promocija ali kupon ne sme znižati (npr. darilne kartice).",
    et: "Valige kategooriad või tooted, mida ükski kampaania ega kupong ei tohi allahinnata (nt kinkekaardid).",
    lv: "Izvēlieties kategorijas vai preces, kurām neviena akcija vai kupons nedrīkst piemērot atlaidi (piem., dāvanu kartes).",
    lt: "Pasirinkite kategorijas ar prekes, kurioms jokia akcija ar kuponas negali taikyti nuolaidos (pvz., dovanų kortelės).",
    tr: "Hiçbir promosyonun veya kuponun indirim yapamayacağı kategorileri veya ürünleri seçin (ör. hediye kartları).",
    ru: "Выберите категории или товары, которые не может уценить ни одна акция или купон (например, подарочные карты).",
    uk: "Виберіть категорії або товари, які жодна акція чи купон не може знижувати (напр., подарункові картки).",
    ca: "Tria les categories o articles que cap promoció ni cupó pot descomptar (p. ex. targetes regal).",
    id: "Pilih kategori atau item yang tidak boleh didiskon oleh promosi atau kupon apa pun (mis. kartu hadiah).",
    vi: "Chọn danh mục hoặc mặt hàng mà không khuyến mãi hay phiếu giảm giá nào được giảm giá (vd. thẻ quà tặng).",
    th: "เลือกหมวดหรือรายการที่โปรโมชันหรือคูปองใด ๆ ห้ามลดราคา (เช่น บัตรของขวัญ)",
    zh: "选择任何促销或优惠券都不得打折的类别或商品（如礼品卡）。",
    ja: "どのプロモーションやクーポンでも割引できないカテゴリや商品を選びます（ギフトカードなど）。",
    ko: "어떤 프로모션이나 쿠폰도 할인할 수 없는 카테고리나 항목을 선택하세요(예: 기프트 카드).",
    ar: "اختر الفئات أو العناصر التي لا يجوز لأي عرض أو قسيمة خصمها (مثل بطاقات الهدايا).",
    he: "בחרו קטגוריות או פריטים ששום מבצע או קופון לא רשאי להנחות (למשל כרטיסי מתנה).",
    hi: "वे श्रेणियाँ या आइटम चुनें जिन पर कोई प्रमोशन या कूपन छूट नहीं दे सकता (जैसे गिफ्ट कार्ड)।",
  },
  "admin.promotionsPage.excludeOn": {
    en: "Discountable", fr: "Remisable", es: "Con descuento", it: "Scontabile", pt: "Com desconto", "pt-BR": "Com desconto", de: "Rabattierbar", nl: "Kortbaar",
    ro: "Reductibil", sv: "Rabatterbar", da: "Kan rabatteres", nb: "Kan rabatteres", fi: "Alennettavissa", pl: "Podlega zniżkom", cs: "Lze zlevnit", sk: "Možno zľaviť",
    hu: "Kedvezményezhető", el: "Εκπτώσιμο", bg: "С отстъпка", hr: "Može se sniziti", sr: "Може се снизити", sl: "Dovoljen popust", et: "Allahinnatav", lv: "Atlaižams",
    lt: "Su nuolaida", tr: "İndirimli olabilir", ru: "Со скидкой", uk: "Зі знижкою", ca: "Descomptable", id: "Bisa didiskon", vi: "Được giảm giá", th: "ลดราคาได้",
    zh: "可打折", ja: "割引可", ko: "할인 가능", ar: "قابل للخصم", he: "ניתן להנחה", hi: "छूट योग्य",
  },
  "admin.promotionsPage.excludeOff": {
    en: "No discounts", fr: "Aucune remise", es: "Sin descuentos", it: "Nessuno sconto", pt: "Sem descontos", "pt-BR": "Sem descontos", de: "Keine Rabatte", nl: "Geen korting",
    ro: "Fără reduceri", sv: "Inga rabatter", da: "Ingen rabatter", nb: "Ingen rabatter", fi: "Ei alennuksia", pl: "Bez zniżek", cs: "Bez slev", sk: "Bez zliav",
    hu: "Nincs kedvezmény", el: "Χωρίς εκπτώσεις", bg: "Без отстъпки", hr: "Bez popusta", sr: "Без попуста", sl: "Brez popustov", et: "Allahindluseta", lv: "Bez atlaidēm",
    lt: "Be nuolaidų", tr: "İndirim yok", ru: "Без скидок", uk: "Без знижок", ca: "Sense descomptes", id: "Tanpa diskon", vi: "Không giảm giá", th: "ไม่มีส่วนลด",
    zh: "不打折", ja: "割引対象外", ko: "할인 없음", ar: "بدون خصومات", he: "ללא הנחות", hi: "कोई छूट नहीं",
  },
  "admin.promotionsPage.excludeViaCategory": {
    en: "Excluded via category", fr: "Exclu via la catégorie", es: "Excluido por categoría", it: "Escluso tramite categoria", pt: "Excluído pela categoria", "pt-BR": "Excluído pela categoria", de: "Über Kategorie ausgeschlossen", nl: "Uitgesloten via categorie",
    ro: "Exclus prin categorie", sv: "Undantagen via kategori", da: "Undtaget via kategori", nb: "Ekskludert via kategori", fi: "Suljettu luokan kautta", pl: "Wykluczone przez kategorię", cs: "Vyloučeno přes kategorii", sk: "Vylúčené cez kategóriu",
    hu: "Kategórián keresztül kizárva", el: "Εξαιρείται μέσω κατηγορίας", bg: "Изключено чрез категория", hr: "Isključeno putem kategorije", sr: "Искључено преко категорије", sl: "Izključeno prek kategorije", et: "Välistatud kategooria kaudu", lv: "Izslēgts caur kategoriju",
    lt: "Neįtraukta per kategoriją", tr: "Kategori üzerinden hariç", ru: "Исключено через категорию", uk: "Виключено через категорію", ca: "Exclòs per categoria", id: "Dikecualikan via kategori", vi: "Loại trừ theo danh mục", th: "ยกเว้นผ่านหมวด",
    zh: "通过类别排除", ja: "カテゴリで対象外", ko: "카테고리로 제외됨", ar: "مستثنى عبر الفئة", he: "הוחרג דרך הקטגוריה", hi: "श्रेणी द्वारा बाहर",
  },
  "admin.promotionsPage.excludeFailed": {
    en: "Couldn't save — try again.", fr: "Échec de l'enregistrement — réessayez.", es: "No se pudo guardar — inténtalo de nuevo.", it: "Salvataggio non riuscito — riprova.", pt: "Não foi possível guardar — tente novamente.", "pt-BR": "Não foi possível salvar — tente novamente.", de: "Speichern fehlgeschlagen — bitte erneut versuchen.", nl: "Opslaan mislukt — probeer opnieuw.",
    ro: "Salvarea a eșuat — încercați din nou.", sv: "Kunde inte spara — försök igen.", da: "Kunne ikke gemme — prøv igen.", nb: "Kunne ikke lagre — prøv igjen.", fi: "Tallennus epäonnistui — yritä uudelleen.", pl: "Nie udało się zapisać — spróbuj ponownie.", cs: "Uložení se nezdařilo — zkuste to znovu.", sk: "Uloženie zlyhalo — skúste znova.",
    hu: "A mentés sikertelen — próbálja újra.", el: "Αποτυχία αποθήκευσης — δοκιμάστε ξανά.", bg: "Неуспешно записване — опитайте отново.", hr: "Spremanje nije uspjelo — pokušajte ponovno.", sr: "Чување није успело — покушајте поново.", sl: "Shranjevanje ni uspelo — poskusite znova.", et: "Salvestamine ebaõnnestus — proovige uuesti.", lv: "Neizdevās saglabāt — mēģiniet vēlreiz.",
    lt: "Nepavyko išsaugoti — bandykite dar kartą.", tr: "Kaydedilemedi — tekrar deneyin.", ru: "Не удалось сохранить — попробуйте снова.", uk: "Не вдалося зберегти — спробуйте ще раз.", ca: "No s'ha pogut desar — torna-ho a provar.", id: "Gagal menyimpan — coba lagi.", vi: "Không lưu được — thử lại.", th: "บันทึกไม่สำเร็จ — ลองอีกครั้ง",
    zh: "保存失败 — 请重试。", ja: "保存できませんでした — もう一度お試しください。", ko: "저장하지 못했습니다 — 다시 시도하세요.", ar: "تعذّر الحفظ — حاول مرة أخرى.", he: "השמירה נכשלה — נסו שוב.", hi: "सहेजा नहीं जा सका — पुनः प्रयास करें।",
  },
  "admin.promotionsPage.excludeLoading": {
    en: "Loading your menu…", fr: "Chargement de votre menu…", es: "Cargando tu menú…", it: "Caricamento del menu…", pt: "A carregar o seu menu…", "pt-BR": "Carregando seu cardápio…", de: "Menü wird geladen…", nl: "Menu laden…",
    ro: "Se încarcă meniul…", sv: "Laddar din meny…", da: "Indlæser din menu…", nb: "Laster menyen…", fi: "Ladataan valikkoa…", pl: "Ładowanie menu…", cs: "Načítání menu…", sk: "Načítava sa menu…",
    hu: "Menü betöltése…", el: "Φόρτωση του μενού…", bg: "Зарежда се менюто…", hr: "Učitavanje jelovnika…", sr: "Учитавање менија…", sl: "Nalaganje menija…", et: "Menüü laadimine…", lv: "Ielādē ēdienkarti…",
    lt: "Įkeliamas meniu…", tr: "Menünüz yükleniyor…", ru: "Загрузка меню…", uk: "Завантаження меню…", ca: "Carregant el teu menú…", id: "Memuat menu Anda…", vi: "Đang tải thực đơn…", th: "กำลังโหลดเมนู…",
    zh: "正在加载您的菜单…", ja: "メニューを読み込み中…", ko: "메뉴 불러오는 중…", ar: "جارٍ تحميل قائمتك…", he: "טוען את התפריט…", hi: "आपका मेन्यू लोड हो रहा है…",
  },
  "admin.promotionsPage.excludeNone": {
    en: "No menu categories yet.", fr: "Aucune catégorie pour l'instant.", es: "Aún no hay categorías.", it: "Nessuna categoria ancora.", pt: "Ainda sem categorias.", "pt-BR": "Ainda sem categorias.", de: "Noch keine Kategorien.", nl: "Nog geen categorieën.",
    ro: "Încă nicio categorie.", sv: "Inga kategorier ännu.", da: "Ingen kategorier endnu.", nb: "Ingen kategorier ennå.", fi: "Ei vielä luokkia.", pl: "Brak kategorii.", cs: "Zatím žádné kategorie.", sk: "Zatiaľ žiadne kategórie.",
    hu: "Még nincsenek kategóriák.", el: "Δεν υπάρχουν κατηγορίες ακόμη.", bg: "Все още няма категории.", hr: "Još nema kategorija.", sr: "Још нема категорија.", sl: "Še ni kategorij.", et: "Veel pole kategooriaid.", lv: "Vēl nav kategoriju.",
    lt: "Kategorijų dar nėra.", tr: "Henüz kategori yok.", ru: "Категорий пока нет.", uk: "Категорій ще немає.", ca: "Encara no hi ha categories.", id: "Belum ada kategori.", vi: "Chưa có danh mục.", th: "ยังไม่มีหมวดหมู่",
    zh: "暂无菜单类别。", ja: "カテゴリはまだありません。", ko: "아직 카테고리가 없습니다.", ar: "لا توجد فئات بعد.", he: "עדיין אין קטגוריות.", hi: "अभी कोई श्रेणी नहीं।",
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
console.log(`✓ promo-exclusion strings added to ${n} locale(s).`);
