/** i18n: Preview & test ordering × 38 locales.
 *   admin.menuEditor.previewTestOrdering, ordering.testModeBanner, ordering.testModeHint
 *   npx tsx scripts/i18n-add-test-ordering.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.menuEditor.previewTestOrdering": {
    en: "Preview & test ordering", fr: "Aperçu et commande test", es: "Vista previa y pedido de prueba", it: "Anteprima e ordine di prova", pt: "Pré-visualizar e testar pedidos", "pt-BR": "Visualizar e testar pedidos",
    de: "Vorschau & Testbestellung", nl: "Voorbeeld & testbestelling", ro: "Previzualizare și comandă de test", sv: "Förhandsgranska & testbeställ", da: "Forhåndsvis & testbestil", nb: "Forhåndsvis & testbestill",
    fi: "Esikatsele ja testitilaa", pl: "Podgląd i zamówienie testowe", cs: "Náhled a testovací objednávka", sk: "Náhľad a testovacia objednávka", hu: "Előnézet és tesztrendelés", el: "Προεπισκόπηση & δοκιμαστική παραγγελία",
    bg: "Преглед и тестова поръчка", hr: "Pregled i testna narudžba", sr: "Преглед и тест наруџба", sl: "Predogled in testno naročilo", et: "Eelvaade ja testtellimus", lv: "Priekšskatījums un testa pasūtījums",
    lt: "Peržiūra ir bandomasis užsakymas", tr: "Önizleme ve test siparişi", ru: "Предпросмотр и тестовый заказ", uk: "Попередній перегляд і тестове замовлення", ca: "Previsualitza i comanda de prova", id: "Pratinjau & pesanan uji",
    vi: "Xem trước & đặt thử", th: "ดูตัวอย่างและสั่งทดสอบ", zh: "预览并测试下单", ja: "プレビュー＆テスト注文", ko: "미리보기 및 테스트 주문", ar: "معاينة وطلب تجريبي", he: "תצוגה מקדימה והזמנת ניסיון", hi: "पूर्वावलोकन और परीक्षण ऑर्डर",
  },
  "ordering.testModeBanner": {
    en: "Test mode — you're previewing your own store", fr: "Mode test — vous prévisualisez votre propre boutique", es: "Modo de prueba — estás previsualizando tu propia tienda", it: "Modalità test — stai visualizzando il tuo negozio", pt: "Modo de teste — está a pré-visualizar a sua loja", "pt-BR": "Modo de teste — você está visualizando sua própria loja",
    de: "Testmodus — du siehst die Vorschau deines eigenen Shops", nl: "Testmodus — je bekijkt je eigen winkel", ro: "Mod de test — previzualizezi propriul magazin", sv: "Testläge — du förhandsgranskar din egen butik", da: "Testtilstand — du forhåndsviser din egen butik", nb: "Testmodus — du forhåndsviser din egen butikk",
    fi: "Testitila — esikatselet omaa kauppaasi", pl: "Tryb testowy — przeglądasz własny sklep", cs: "Testovací režim — prohlížíte si vlastní podnik", sk: "Testovací režim — prezeráte si vlastný podnik", hu: "Tesztmód — a saját éttermedet nézed", el: "Λειτουργία δοκιμής — προεπισκοπείτε το δικό σας κατάστημα",
    bg: "Тестов режим — преглеждате собствения си магазин", hr: "Testni način — pregledavate vlastitu trgovinu", sr: "Тест режим — прегледате сопствену радњу", sl: "Testni način — predogled lastne trgovine", et: "Testrežiim — vaatad omaenda poodi", lv: "Testa režīms — skatāt savu veikalu",
    lt: "Bandomasis režimas — peržiūrite savo parduotuvę", tr: "Test modu — kendi mağazanızı önizliyorsunuz", ru: "Тестовый режим — вы просматриваете собственный магазин", uk: "Тестовий режим — ви переглядаєте власний заклад", ca: "Mode de prova — estàs previsualitzant la teva botiga", id: "Mode uji — Anda melihat pratinjau toko sendiri",
    vi: "Chế độ thử — bạn đang xem trước cửa hàng của mình", th: "โหมดทดสอบ — คุณกำลังดูร้านของคุณเอง", zh: "测试模式——您正在预览自己的店铺", ja: "テストモード — 自分の店舗をプレビュー中", ko: "테스트 모드 — 내 매장을 미리보고 있습니다", ar: "وضع الاختبار — أنت تعاين متجرك", he: "מצב בדיקה — אתה צופה בחנות שלך", hi: "परीक्षण मोड — आप अपनी ही दुकान का पूर्वावलोकन कर रहे हैं",
  },
  "ordering.testModeHint": {
    en: "Orders you place here are marked TEST: they ring the kitchen and print normally but never count in reports or revenue.", fr: "Les commandes passées ici sont marquées TEST : elles sonnent en cuisine et s'impriment normalement, mais ne comptent jamais dans les rapports ni le chiffre d'affaires.", es: "Los pedidos que hagas aquí se marcan como TEST: suenan en cocina y se imprimen con normalidad, pero nunca cuentan en informes ni ingresos.", it: "Gli ordini effettuati qui sono contrassegnati TEST: suonano in cucina e si stampano normalmente, ma non contano mai nei report né nei ricavi.", pt: "Os pedidos feitos aqui são marcados como TEST: tocam na cozinha e imprimem normalmente, mas nunca contam nos relatórios nem na receita.", "pt-BR": "Pedidos feitos aqui são marcados como TEST: tocam na cozinha e imprimem normalmente, mas nunca contam nos relatórios nem na receita.",
    de: "Hier aufgegebene Bestellungen sind als TEST markiert: Sie klingeln in der Küche und drucken normal, zählen aber nie in Berichten oder Umsätzen.", nl: "Bestellingen die je hier plaatst zijn gemarkeerd als TEST: ze rinkelen in de keuken en printen normaal, maar tellen nooit mee in rapporten of omzet.", ro: "Comenzile plasate aici sunt marcate TEST: sună în bucătărie și se tipăresc normal, dar nu se numără niciodată în rapoarte sau venituri.", sv: "Beställningar här markeras som TEST: de ringer i köket och skrivs ut normalt men räknas aldrig i rapporter eller intäkter.", da: "Bestillinger her markeres som TEST: de ringer i køkkenet og printes normalt, men tæller aldrig i rapporter eller omsætning.", nb: "Bestillinger her merkes TEST: de ringer på kjøkkenet og skrives ut normalt, men telles aldri i rapporter eller omsetning.",
    fi: "Täällä tehdyt tilaukset merkitään TEST: ne soivat keittiössä ja tulostuvat normaalisti, mutta eivät koskaan näy raporteissa tai liikevaihdossa.", pl: "Zamówienia złożone tutaj są oznaczone jako TEST: dzwonią w kuchni i drukują się normalnie, ale nigdy nie liczą się w raportach ani przychodach.", cs: "Objednávky zadané zde jsou označeny TEST: v kuchyni zazvoní a normálně se vytisknou, ale nikdy se nepočítají do reportů ani tržeb.", sk: "Objednávky zadané tu sú označené TEST: v kuchyni zazvonia a normálne sa vytlačia, ale nikdy sa nepočítajú do reportov ani tržieb.", hu: "Az itt leadott rendelések TEST jelölést kapnak: csörögnek a konyhán és normálisan nyomtatódnak, de soha nem számítanak a riportokba vagy a bevételbe.", el: "Οι παραγγελίες εδώ επισημαίνονται TEST: χτυπούν στην κουζίνα και εκτυπώνονται κανονικά, αλλά δεν μετρούν ποτέ σε αναφορές ή έσοδα.",
    bg: "Поръчките тук се маркират като TEST: звънят в кухнята и се печатат нормално, но никога не се броят в отчети или приходи.", hr: "Narudžbe ovdje označene su TEST: zvone u kuhinji i ispisuju se normalno, ali se nikad ne računaju u izvještaje ni prihod.", sr: "Наруџбе овде су означене TEST: звоне у кухињи и штампају се нормално, али се никад не рачунају у извештаје или приход.", sl: "Naročila tukaj so označena TEST: zvonijo v kuhinji in se natisnejo normalno, a se nikoli ne štejejo v poročila ali prihodek.", et: "Siin tehtud tellimused märgitakse TEST: need helisevad köögis ja prinditakse tavapäraselt, kuid ei lähe kunagi aruannetesse ega tulusse.", lv: "Šeit veiktie pasūtījumi tiek atzīmēti TEST: tie zvana virtuvē un drukājas kā parasti, bet nekad netiek ieskaitīti atskaitēs vai ieņēmumos.",
    lt: "Čia pateikti užsakymai pažymimi TEST: jie skamba virtuvėje ir spausdinami įprastai, bet niekada neįskaičiuojami į ataskaitas ar pajamas.", tr: "Burada verilen siparişler TEST olarak işaretlenir: mutfakta çalar ve normal yazdırılır ama raporlara veya gelire asla sayılmaz.", ru: "Заказы здесь помечаются TEST: они звонят на кухне и печатаются как обычно, но никогда не попадают в отчёты и выручку.", uk: "Замовлення тут позначаються TEST: вони дзвонять на кухні та друкуються як завжди, але ніколи не враховуються у звітах чи виручці.", ca: "Les comandes fetes aquí es marquen com a TEST: sonen a la cuina i s'imprimeixen normalment, però mai no compten en informes ni ingressos.", id: "Pesanan di sini ditandai TEST: berdering di dapur dan dicetak seperti biasa, tetapi tidak pernah dihitung dalam laporan atau pendapatan.",
    vi: "Đơn đặt ở đây được đánh dấu TEST: vẫn reo ở bếp và in bình thường nhưng không bao giờ tính vào báo cáo hay doanh thu.", th: "ออเดอร์ที่สั่งที่นี่จะถูกทำเครื่องหมาย TEST: จะดังที่ครัวและพิมพ์ตามปกติ แต่จะไม่ถูกนับในรายงานหรือรายได้", zh: "在此下的订单会标记为 TEST：厨房正常响铃和打印，但绝不会计入报表或营业额。", ja: "ここで行った注文は TEST と表示されます。キッチンには通常どおり通知・印刷されますが、レポートや売上には一切計上されません。", ko: "여기서 주문하면 TEST로 표시됩니다. 주방 벨과 인쇄는 정상 작동하지만 보고서나 매출에는 절대 집계되지 않습니다.", ar: "الطلبات هنا تُوسم TEST: ترن في المطبخ وتُطبع كالمعتاد لكنها لا تُحتسب أبدًا في التقارير أو الإيرادات.", he: "הזמנות כאן מסומנות TEST: הן מצלצלות במטבח ומודפסות כרגיל אך לעולם לא נספרות בדוחות או בהכנסות.", hi: "यहाँ किए गए ऑर्डर TEST चिह्नित होते हैं: किचन में सामान्य रूप से बजते और प्रिंट होते हैं, पर रिपोर्ट या आय में कभी नहीं गिने जाते।",
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
console.log(`✓ test-ordering strings (${Object.keys(KEYS).length} keys) added to ${n} locale(s).`);
