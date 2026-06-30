/** i18n × 38: earning-exclusion UI (admin.rewards.exclude*), customer note
 *  (customer.accountPage.reward.someExcluded), and the per-group member-label hint
 *  (admin.customerGroups.memberLabelGroupHint). {label} = reward name — keep it.
 *  Luigi 2026-06-30. Run: npx tsx scripts/i18n-add-reward-exclusions.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

// key -> { locale -> text }
const K: Record<string, Record<string, string>> = {
  "admin.rewards.excludeTitle": {
    en: "Items that don't earn {label}", fr: "Articles qui ne rapportent pas de {label}", es: "Artículos que no ganan {label}", it: "Articoli che non generano {label}",
    pt: "Artigos que não ganham {label}", "pt-BR": "Itens que não ganham {label}", de: "Artikel, die keine {label} verdienen", nl: "Items die geen {label} verdienen",
    ro: "Articole care nu acumulează {label}", sv: "Varor som inte tjänar {label}", da: "Varer der ikke optjener {label}", nb: "Varer som ikke tjener {label}",
    fi: "Tuotteet, jotka eivät kerrytä {label}", pl: "Produkty, które nie zarabiają {label}", cs: "Položky, které nezískávají {label}", sk: "Položky, ktoré nezískavajú {label}",
    hu: "Termékek, amelyek nem gyűjtenek {label}", el: "Είδη που δεν κερδίζουν {label}", bg: "Артикули, които не печелят {label}", hr: "Stavke koje ne zarađuju {label}",
    sr: "Ставке које не зарађују {label}", sl: "Izdelki, ki ne prinašajo {label}", et: "Tooted, mis ei teeni {label}", lv: "Preces, kas nenopelna {label}",
    lt: "Prekės, kurios neuždirba {label}", tr: "{label} kazandırmayan ürünler", ru: "Товары, не приносящие {label}", uk: "Товари, що не приносять {label}",
    ca: "Articles que no guanyen {label}", id: "Item yang tidak mendapatkan {label}", vi: "Mặt hàng không tích {label}", th: "รายการที่ไม่สะสม {label}",
    zh: "不赚取{label}的商品", ja: "{label}が貯まらない商品", ko: "{label}이(가) 적립되지 않는 항목", ar: "العناصر التي لا تكسب {label}",
    he: "פריטים שלא צוברים {label}", hi: "ऐसी वस्तुएँ जो {label} नहीं कमातीं",
  },
  "admin.rewards.excludeHelp": {
    en: "Customers won't earn {label} on excluded items or categories (e.g. gift cards). They can still SPEND {label} on any order.",
    fr: "Les clients ne gagneront pas de {label} sur les articles ou catégories exclus (ex. cartes-cadeaux). Ils peuvent toujours DÉPENSER des {label} sur n'importe quelle commande.",
    es: "Los clientes no ganarán {label} en artículos o categorías excluidos (p. ej. tarjetas regalo). Pueden seguir GASTANDO {label} en cualquier pedido.",
    it: "I clienti non guadagneranno {label} su articoli o categorie esclusi (es. buoni regalo). Possono comunque USARE i {label} su qualsiasi ordine.",
    pt: "Os clientes não ganharão {label} em artigos ou categorias excluídos (ex. cartões-presente). Podem continuar a GASTAR {label} em qualquer pedido.",
    "pt-BR": "Os clientes não ganharão {label} em itens ou categorias excluídos (ex. vales-presente). Eles ainda podem GASTAR {label} em qualquer pedido.",
    de: "Kunden verdienen keine {label} bei ausgeschlossenen Artikeln oder Kategorien (z. B. Geschenkkarten). Sie können {label} weiterhin bei jeder Bestellung AUSGEBEN.",
    nl: "Klanten verdienen geen {label} op uitgesloten items of categorieën (bijv. cadeaubonnen). Ze kunnen {label} nog steeds bij elke bestelling UITGEVEN.",
    ro: "Clienții nu vor acumula {label} pentru articolele sau categoriile excluse (ex. carduri cadou). Pot CHELTUI în continuare {label} la orice comandă.",
    sv: "Kunder tjänar inga {label} på undantagna varor eller kategorier (t.ex. presentkort). De kan fortfarande ANVÄNDA {label} på alla beställningar.",
    da: "Kunder optjener ikke {label} på undtagne varer eller kategorier (f.eks. gavekort). De kan stadig BRUGE {label} på enhver ordre.",
    nb: "Kunder tjener ikke {label} på ekskluderte varer eller kategorier (f.eks. gavekort). De kan fortsatt BRUKE {label} på enhver bestilling.",
    fi: "Asiakkaat eivät kerrytä {label} suljetuista tuotteista tai luokista (esim. lahjakortit). He voivat silti KÄYTTÄÄ {label} mihin tahansa tilaukseen.",
    pl: "Klienci nie zdobędą {label} za wykluczone produkty lub kategorie (np. karty podarunkowe). Nadal mogą WYDAWAĆ {label} na dowolne zamówienie.",
    cs: "Zákazníci nezískají {label} za vyloučené položky nebo kategorie (např. dárkové karty). {label} mohou stále UTRÁCET u jakékoli objednávky.",
    sk: "Zákazníci nezískajú {label} za vylúčené položky alebo kategórie (napr. darčekové karty). {label} môžu stále MÍŇAŤ pri akejkoľvek objednávke.",
    hu: "Az ügyfelek nem gyűjtenek {label} a kizárt termékek vagy kategóriák után (pl. ajándékkártyák). A {label} továbbra is ELKÖLTHETŐ bármely rendelésnél.",
    el: "Οι πελάτες δεν θα κερδίζουν {label} σε εξαιρούμενα είδη ή κατηγορίες (π.χ. δωροκάρτες). Μπορούν ακόμα να ΞΟΔΕΥΟΥΝ {label} σε κάθε παραγγελία.",
    bg: "Клиентите няма да печелят {label} за изключени артикули или категории (напр. ваучери). Все още могат да ХАРЧАТ {label} за всяка поръчка.",
    hr: "Kupci neće zaraditi {label} na isključenim stavkama ili kategorijama (npr. poklon-bonovi). I dalje mogu POTROŠITI {label} na bilo koju narudžbu.",
    sr: "Купци неће зарадити {label} на искљученим ставкама или категоријама (нпр. поклон картице). И даље могу ТРОШИТИ {label} на било коју поруџбину.",
    sl: "Stranke ne bodo prislužile {label} pri izključenih izdelkih ali kategorijah (npr. darilne kartice). {label} lahko še vedno PORABIJO pri katerem koli naročilu.",
    et: "Kliendid ei teeni {label} välistatud toodetelt või kategooriatelt (nt kinkekaardid). Nad saavad {label} siiski KULUTADA igale tellimusele.",
    lv: "Klienti nenopelnīs {label} par izslēgtām precēm vai kategorijām (piem., dāvanu kartēm). Viņi joprojām var TĒRĒT {label} jebkurā pasūtījumā.",
    lt: "Klientai neuždirbs {label} už neįtrauktas prekes ar kategorijas (pvz., dovanų korteles). Jie vis tiek gali LEISTI {label} bet kuriam užsakymui.",
    tr: "Müşteriler hariç tutulan ürün veya kategorilerde (ör. hediye kartları) {label} kazanmaz. {label} her siparişte yine de HARCAYABİLİR.",
    ru: "Клиенты не будут получать {label} за исключённые товары или категории (например, подарочные карты). Они по-прежнему могут ТРАТИТЬ {label} на любой заказ.",
    uk: "Клієнти не отримуватимуть {label} за виключені товари чи категорії (напр., подарункові картки). Вони все ще можуть ВИТРАЧАТИ {label} на будь-яке замовлення.",
    ca: "Els clients no guanyaran {label} en articles o categories exclosos (p. ex. targetes regal). Encara poden GASTAR {label} en qualsevol comanda.",
    id: "Pelanggan tidak akan mendapatkan {label} pada item atau kategori yang dikecualikan (mis. kartu hadiah). Mereka tetap bisa MEMBELANJAKAN {label} di pesanan mana pun.",
    vi: "Khách sẽ không tích {label} cho các mặt hàng hoặc danh mục bị loại trừ (vd. thẻ quà tặng). Họ vẫn có thể DÙNG {label} cho bất kỳ đơn hàng nào.",
    th: "ลูกค้าจะไม่สะสม {label} สำหรับรายการหรือหมวดที่ยกเว้น (เช่น บัตรของขวัญ) แต่ยังใช้ {label} กับคำสั่งซื้อใดก็ได้",
    zh: "顾客在被排除的商品或类别（如礼品卡）上不会赚取{label}，但仍可在任何订单中使用{label}。",
    ja: "対象外の商品やカテゴリ（ギフトカードなど）では{label}は貯まりません。どの注文でも{label}は引き続き利用できます。",
    ko: "제외된 항목이나 카테고리(예: 기프트 카드)에서는 {label}이(가) 적립되지 않습니다. {label}은(는) 어떤 주문에서든 사용할 수 있습니다.",
    ar: "لن يكسب العملاء {label} على العناصر أو الفئات المستثناة (مثل بطاقات الهدايا). لا يزال بإمكانهم إنفاق {label} على أي طلب.",
    he: "לקוחות לא יצברו {label} על פריטים או קטגוריות שהוחרגו (למשל כרטיסי מתנה). הם עדיין יכולים להוציא {label} בכל הזמנה.",
    hi: "ग्राहक बाहर रखे गए आइटम या श्रेणियों (जैसे गिफ्ट कार्ड) पर {label} नहीं कमाएँगे। वे फिर भी किसी भी ऑर्डर पर {label} खर्च कर सकते हैं।",
  },
  "admin.rewards.excludeDesc": {
    en: "Pick categories or items that shouldn't earn {label}.", fr: "Choisissez les catégories ou articles qui ne doivent pas rapporter de {label}.", es: "Elige las categorías o artículos que no deben ganar {label}.", it: "Scegli categorie o articoli che non devono generare {label}.",
    pt: "Escolha categorias ou artigos que não devem ganhar {label}.", "pt-BR": "Escolha categorias ou itens que não devem ganhar {label}.", de: "Wählen Sie Kategorien oder Artikel, die keine {label} verdienen sollen.", nl: "Kies categorieën of items die geen {label} mogen verdienen.",
    ro: "Alegeți categoriile sau articolele care nu trebuie să acumuleze {label}.", sv: "Välj kategorier eller varor som inte ska tjäna {label}.", da: "Vælg kategorier eller varer, der ikke skal optjene {label}.", nb: "Velg kategorier eller varer som ikke skal tjene {label}.",
    fi: "Valitse luokat tai tuotteet, jotka eivät saa kerryttää {label}.", pl: "Wybierz kategorie lub produkty, które nie powinny zarabiać {label}.", cs: "Vyberte kategorie nebo položky, které nemají získávat {label}.", sk: "Vyberte kategórie alebo položky, ktoré nemajú získavať {label}.",
    hu: "Válassza ki a kategóriákat vagy termékeket, amelyek nem gyűjthetnek {label}.", el: "Επιλέξτε κατηγορίες ή είδη που δεν πρέπει να κερδίζουν {label}.", bg: "Изберете категории или артикули, които не трябва да печелят {label}.", hr: "Odaberite kategorije ili stavke koje ne bi trebale zarađivati {label}.",
    sr: "Изаберите категорије или ставке које не би требало да зарађују {label}.", sl: "Izberite kategorije ali izdelke, ki ne smejo prinašati {label}.", et: "Valige kategooriad või tooted, mis ei tohiks teenida {label}.", lv: "Izvēlieties kategorijas vai preces, kurām nevajadzētu nopelnīt {label}.",
    lt: "Pasirinkite kategorijas ar prekes, kurios neturėtų uždirbti {label}.", tr: "{label} kazandırmaması gereken kategorileri veya ürünleri seçin.", ru: "Выберите категории или товары, которые не должны приносить {label}.", uk: "Виберіть категорії або товари, які не повинні приносити {label}.",
    ca: "Tria les categories o articles que no han de guanyar {label}.", id: "Pilih kategori atau item yang tidak boleh mendapatkan {label}.", vi: "Chọn danh mục hoặc mặt hàng không nên tích {label}.", th: "เลือกหมวดหรือรายการที่ไม่ควรสะสม {label}",
    zh: "选择不应赚取{label}的类别或商品。", ja: "{label}を貯めるべきでないカテゴリや商品を選びます。", ko: "{label}이(가) 적립되지 않아야 할 카테고리나 항목을 선택하세요.", ar: "اختر الفئات أو العناصر التي لا ينبغي أن تكسب {label}.",
    he: "בחרו קטגוריות או פריטים שלא אמורים לצבור {label}.", hi: "वे श्रेणियाँ या आइटम चुनें जिन्हें {label} नहीं कमाना चाहिए।",
  },
  "customer.accountPage.reward.someExcluded": {
    en: "Some items (like gift cards) don't earn {label}.", fr: "Certains articles (comme les cartes-cadeaux) ne rapportent pas de {label}.", es: "Algunos artículos (como las tarjetas regalo) no ganan {label}.", it: "Alcuni articoli (come i buoni regalo) non generano {label}.",
    pt: "Alguns artigos (como cartões-presente) não ganham {label}.", "pt-BR": "Alguns itens (como vales-presente) não ganham {label}.", de: "Manche Artikel (z. B. Geschenkkarten) verdienen keine {label}.", nl: "Sommige items (zoals cadeaubonnen) verdienen geen {label}.",
    ro: "Unele articole (precum cardurile cadou) nu acumulează {label}.", sv: "Vissa varor (som presentkort) tjänar inte {label}.", da: "Nogle varer (som gavekort) optjener ikke {label}.", nb: "Noen varer (som gavekort) tjener ikke {label}.",
    fi: "Jotkin tuotteet (kuten lahjakortit) eivät kerrytä {label}.", pl: "Niektóre produkty (np. karty podarunkowe) nie zarabiają {label}.", cs: "Některé položky (např. dárkové karty) nezískávají {label}.", sk: "Niektoré položky (napr. darčekové karty) nezískavajú {label}.",
    hu: "Egyes termékek (például ajándékkártyák) nem gyűjtenek {label}.", el: "Ορισμένα είδη (όπως δωροκάρτες) δεν κερδίζουν {label}.", bg: "Някои артикули (като ваучери) не печелят {label}.", hr: "Neke stavke (poput poklon-bonova) ne zarađuju {label}.",
    sr: "Неке ставке (попут поклон картица) не зарађују {label}.", sl: "Nekateri izdelki (npr. darilne kartice) ne prinašajo {label}.", et: "Mõned tooted (nt kinkekaardid) ei teeni {label}.", lv: "Dažas preces (piemēram, dāvanu kartes) nenopelna {label}.",
    lt: "Kai kurios prekės (pvz., dovanų kortelės) neuždirba {label}.", tr: "Bazı ürünler (örn. hediye kartları) {label} kazandırmaz.", ru: "Некоторые товары (например, подарочные карты) не приносят {label}.", uk: "Деякі товари (наприклад, подарункові картки) не приносять {label}.",
    ca: "Alguns articles (com les targetes regal) no guanyen {label}.", id: "Beberapa item (seperti kartu hadiah) tidak mendapatkan {label}.", vi: "Một số mặt hàng (như thẻ quà tặng) không tích {label}.", th: "บางรายการ (เช่น บัตรของขวัญ) ไม่สะสม {label}",
    zh: "部分商品（如礼品卡）不赚取{label}。", ja: "一部の商品（ギフトカードなど）は{label}が貯まりません。", ko: "일부 항목(예: 기프트 카드)은 {label}이(가) 적립되지 않습니다.", ar: "بعض العناصر (مثل بطاقات الهدايا) لا تكسب {label}.",
    he: "פריטים מסוימים (כמו כרטיסי מתנה) לא צוברים {label}.", hi: "कुछ आइटम (जैसे गिफ्ट कार्ड) {label} नहीं कमाते।",
  },
};

// Plain (no {label}) short strings.
const PLAIN: Record<string, Record<string, string>> = {
  "admin.rewards.excludeOn": { en: "Earns" }, // shown when the item DOES earn (tap to exclude)
  "admin.rewards.excludeOff": { en: "No rewards" }, // shown when excluded (tap to re-include)
  "admin.rewards.excludeViaCategory": { en: "Excluded via category" },
  "admin.rewards.excludeFailed": { en: "Couldn't save — try again." },
  "admin.rewards.excludeLoading": { en: "Loading your menu…" },
  "admin.rewards.excludeNone": { en: "No menu categories yet." },
  "admin.customerGroups.memberLabelGroupHint": { en: "Overrides the default for this group only." },
};
const PLAIN_T: Record<string, Record<string, string>> = {
  "admin.rewards.excludeOn": { fr: "Rapporte", es: "Gana", it: "Genera", pt: "Ganha", "pt-BR": "Ganha", de: "Verdient", nl: "Verdient", ro: "Acumulează", sv: "Tjänar", da: "Optjener", nb: "Tjener", fi: "Kerryttää", pl: "Zarabia", cs: "Získává", sk: "Získava", hu: "Gyűjt", el: "Κερδίζει", bg: "Печели", hr: "Zarađuje", sr: "Зарађује", sl: "Prinaša", et: "Teenib", lv: "Nopelna", lt: "Uždirba", tr: "Kazandırır", ru: "Начисляет", uk: "Нараховує", ca: "Guanya", id: "Mendapatkan", vi: "Tích", th: "สะสม", zh: "可赚取", ja: "貯まる", ko: "적립", ar: "يكسب", he: "צובר", hi: "कमाता है" },
  "admin.rewards.excludeOff": { fr: "Aucune récompense", es: "Sin recompensas", it: "Nessun premio", pt: "Sem recompensas", "pt-BR": "Sem recompensas", de: "Keine Prämien", nl: "Geen beloning", ro: "Fără recompense", sv: "Inga belöningar", da: "Ingen belønning", nb: "Ingen belønning", fi: "Ei palkkioita", pl: "Bez nagród", cs: "Bez odměn", sk: "Bez odmien", hu: "Nincs jutalom", el: "Χωρίς επιβράβευση", bg: "Без награди", hr: "Bez nagrada", sr: "Без награда", sl: "Brez nagrad", et: "Tasudeta", lv: "Bez atlīdzības", lt: "Be atlygio", tr: "Ödül yok", ru: "Без награды", uk: "Без винагород", ca: "Sense recompenses", id: "Tanpa hadiah", vi: "Không thưởng", th: "ไม่มีรางวัล", zh: "不赚取", ja: "対象外", ko: "적립 안 함", ar: "بدون مكافآت", he: "ללא תגמול", hi: "कोई रिवॉर्ड नहीं" },
  "admin.rewards.excludeViaCategory": { fr: "Exclu via la catégorie", es: "Excluido por categoría", it: "Escluso tramite categoria", pt: "Excluído pela categoria", "pt-BR": "Excluído pela categoria", de: "Über Kategorie ausgeschlossen", nl: "Uitgesloten via categorie", ro: "Exclus prin categorie", sv: "Undantagen via kategori", da: "Undtaget via kategori", nb: "Ekskludert via kategori", fi: "Suljettu luokan kautta", pl: "Wykluczone przez kategorię", cs: "Vyloučeno přes kategorii", sk: "Vylúčené cez kategóriu", hu: "Kategórián keresztül kizárva", el: "Εξαιρείται μέσω κατηγορίας", bg: "Изключено чрез категория", hr: "Isključeno putem kategorije", sr: "Искључено преко категорије", sl: "Izključeno prek kategorije", et: "Välistatud kategooria kaudu", lv: "Izslēgts caur kategoriju", lt: "Neįtraukta per kategoriją", tr: "Kategori üzerinden hariç", ru: "Исключено через категорию", uk: "Виключено через категорію", ca: "Exclòs per categoria", id: "Dikecualikan via kategori", vi: "Loại trừ theo danh mục", th: "ยกเว้นผ่านหมวด", zh: "通过类别排除", ja: "カテゴリで対象外", ko: "카테고리로 제외됨", ar: "مستثنى عبر الفئة", he: "הוחרג דרך הקטגוריה", hi: "श्रेणी द्वारा बाहर" },
  "admin.rewards.excludeFailed": { fr: "Échec de l'enregistrement — réessayez.", es: "No se pudo guardar — inténtalo de nuevo.", it: "Salvataggio non riuscito — riprova.", pt: "Não foi possível guardar — tente novamente.", "pt-BR": "Não foi possível salvar — tente novamente.", de: "Speichern fehlgeschlagen — bitte erneut versuchen.", nl: "Opslaan mislukt — probeer opnieuw.", ro: "Salvarea a eșuat — încercați din nou.", sv: "Kunde inte spara — försök igen.", da: "Kunne ikke gemme — prøv igen.", nb: "Kunne ikke lagre — prøv igjen.", fi: "Tallennus epäonnistui — yritä uudelleen.", pl: "Nie udało się zapisać — spróbuj ponownie.", cs: "Uložení se nezdařilo — zkuste to znovu.", sk: "Uloženie zlyhalo — skúste znova.", hu: "A mentés sikertelen — próbálja újra.", el: "Αποτυχία αποθήκευσης — δοκιμάστε ξανά.", bg: "Неуспешно записване — опитайте отново.", hr: "Spremanje nije uspjelo — pokušajte ponovno.", sr: "Чување није успело — покушајте поново.", sl: "Shranjevanje ni uspelo — poskusite znova.", et: "Salvestamine ebaõnnestus — proovige uuesti.", lv: "Neizdevās saglabāt — mēģiniet vēlreiz.", lt: "Nepavyko išsaugoti — bandykite dar kartą.", tr: "Kaydedilemedi — tekrar deneyin.", ru: "Не удалось сохранить — попробуйте снова.", uk: "Не вдалося зберегти — спробуйте ще раз.", ca: "No s'ha pogut desar — torna-ho a provar.", id: "Gagal menyimpan — coba lagi.", vi: "Không lưu được — thử lại.", th: "บันทึกไม่สำเร็จ — ลองอีกครั้ง", zh: "保存失败 — 请重试。", ja: "保存できませんでした — もう一度お試しください。", ko: "저장하지 못했습니다 — 다시 시도하세요.", ar: "تعذّر الحفظ — حاول مرة أخرى.", he: "השמירה נכשלה — נסו שוב.", hi: "सहेजा नहीं जा सका — पुनः प्रयास करें।" },
  "admin.rewards.excludeLoading": { fr: "Chargement de votre menu…", es: "Cargando tu menú…", it: "Caricamento del menu…", pt: "A carregar o seu menu…", "pt-BR": "Carregando seu cardápio…", de: "Menü wird geladen…", nl: "Menu laden…", ro: "Se încarcă meniul…", sv: "Laddar din meny…", da: "Indlæser din menu…", nb: "Laster menyen…", fi: "Ladataan valikkoa…", pl: "Ładowanie menu…", cs: "Načítání menu…", sk: "Načítava sa menu…", hu: "Menü betöltése…", el: "Φόρτωση του μενού…", bg: "Зарежда се менюто…", hr: "Učitavanje jelovnika…", sr: "Учитавање менија…", sl: "Nalaganje menija…", et: "Menüü laadimine…", lv: "Ielādē ēdienkarti…", lt: "Įkeliamas meniu…", tr: "Menünüz yükleniyor…", ru: "Загрузка меню…", uk: "Завантаження меню…", ca: "Carregant el teu menú…", id: "Memuat menu Anda…", vi: "Đang tải thực đơn…", th: "กำลังโหลดเมนู…", zh: "正在加载您的菜单…", ja: "メニューを読み込み中…", ko: "메뉴 불러오는 중…", ar: "جارٍ تحميل قائمتك…", he: "טוען את התפריט…", hi: "आपका मेन्यू लोड हो रहा है…" },
  "admin.rewards.excludeNone": { fr: "Aucune catégorie pour l'instant.", es: "Aún no hay categorías.", it: "Nessuna categoria ancora.", pt: "Ainda sem categorias.", "pt-BR": "Ainda sem categorias.", de: "Noch keine Kategorien.", nl: "Nog geen categorieën.", ro: "Încă nicio categorie.", sv: "Inga kategorier ännu.", da: "Ingen kategorier endnu.", nb: "Ingen kategorier ennå.", fi: "Ei vielä luokkia.", pl: "Brak kategorii.", cs: "Zatím žádné kategorie.", sk: "Zatiaľ žiadne kategórie.", hu: "Még nincsenek kategóriák.", el: "Δεν υπάρχουν κατηγορίες ακόμη.", bg: "Все още няма категории.", hr: "Još nema kategorija.", sr: "Још нема категорија.", sl: "Še ni kategorij.", et: "Veel pole kategooriaid.", lv: "Vēl nav kategoriju.", lt: "Kategorijų dar nėra.", tr: "Henüz kategori yok.", ru: "Категорий пока нет.", uk: "Категорій ще немає.", ca: "Encara no hi ha categories.", id: "Belum ada kategori.", vi: "Chưa có danh mục.", th: "ยังไม่มีหมวดหมู่", zh: "暂无菜单类别。", ja: "カテゴリはまだありません。", ko: "아직 카테고리가 없습니다.", ar: "لا توجد فئات بعد.", he: "עדיין אין קטגוריות.", hi: "अभी कोई श्रेणी नहीं।" },
  "admin.customerGroups.memberLabelGroupHint": { fr: "Remplace la valeur par défaut pour ce groupe uniquement.", es: "Anula el valor predeterminado solo para este grupo.", it: "Sostituisce l'impostazione predefinita solo per questo gruppo.", pt: "Substitui o padrão apenas para este grupo.", "pt-BR": "Substitui o padrão apenas para este grupo.", de: "Überschreibt die Standardeinstellung nur für diese Gruppe.", nl: "Overschrijft de standaard alleen voor deze groep.", ro: "Înlocuiește valoarea implicită doar pentru acest grup.", sv: "Åsidosätter standardvärdet endast för denna grupp.", da: "Tilsidesætter standarden kun for denne gruppe.", nb: "Overstyrer standarden bare for denne gruppen.", fi: "Korvaa oletuksen vain tälle ryhmälle.", pl: "Zastępuje wartość domyślną tylko dla tej grupy.", cs: "Přepíše výchozí hodnotu jen pro tuto skupinu.", sk: "Prepíše predvolenú hodnotu len pre túto skupinu.", hu: "Csak ehhez a csoporthoz írja felül az alapértelmezést.", el: "Παρακάμπτει την προεπιλογή μόνο για αυτήν την ομάδα.", bg: "Замества стойността по подразбиране само за тази група.", hr: "Nadjačava zadano samo za ovu grupu.", sr: "Замењује подразумевано само за ову групу.", sl: "Razveljavi privzeto samo za to skupino.", et: "Alistab vaikeväärtuse ainult selle rühma jaoks.", lv: "Aizstāj noklusējumu tikai šai grupai.", lt: "Pakeičia numatytąją reikšmę tik šiai grupei.", tr: "Yalnızca bu grup için varsayılanı geçersiz kılar.", ru: "Переопределяет значение по умолчанию только для этой группы.", uk: "Перевизначає значення за замовчуванням лише для цієї групи.", ca: "Substitueix el valor predeterminat només per a aquest grup.", id: "Mengganti default hanya untuk grup ini.", vi: "Ghi đè mặc định chỉ cho nhóm này.", th: "แทนที่ค่าเริ่มต้นเฉพาะกลุ่มนี้", zh: "仅为该组覆盖默认值。", ja: "このグループのみ既定値を上書きします。", ko: "이 그룹에만 기본값을 재정의합니다.", ar: "يتجاوز الإعداد الافتراضي لهذه المجموعة فقط.", he: "עוקף את ברירת המחדל לקבוצה זו בלבד.", hi: "केवल इस समूह के लिए डिफ़ॉल्ट को बदलता है।" },
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
  for (const [key, enMap] of Object.entries(PLAIN)) setDeep(data, key, PLAIN_T[key]?.[loc] ?? enMap.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ reward-exclusion + group-label-hint strings added to ${n} locale(s).`);
