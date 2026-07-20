/** i18n × 38 for the /admin/orders latest-100 honesty + history links
 *  (Luigi 2026-07-19, approval item #1):
 *  - header "Latest {shown} of {total}" count
 *  - footer link to the full order history (reports list)
 *  - search-miss link carrying the query into the reports list
 *  Run: npx tsx scripts/i18n-add-orders-history-links.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.orders.latestOfTotal": {
    en: "Latest {shown} of {total}",
    fr: "Les {shown} dernières sur {total}",
    es: "Últimas {shown} de {total}",
    it: "Ultime {shown} di {total}",
    pt: "Últimas {shown} de {total}",
    "pt-BR": "Últimos {shown} de {total}",
    de: "Neueste {shown} von {total}",
    nl: "Laatste {shown} van {total}",
    ro: "Ultimele {shown} din {total}",
    sv: "Senaste {shown} av {total}",
    da: "Seneste {shown} af {total}",
    nb: "Siste {shown} av {total}",
    fi: "Viimeisimmät {shown}/{total}",
    pl: "Ostatnie {shown} z {total}",
    cs: "Posledních {shown} z {total}",
    sk: "Posledných {shown} z {total}",
    hu: "Legutóbbi {shown} / {total}",
    el: "Τελευταίες {shown} από {total}",
    bg: "Последните {shown} от {total}",
    hr: "Zadnjih {shown} od {total}",
    sr: "Poslednjih {shown} od {total}",
    sl: "Zadnjih {shown} od {total}",
    et: "Viimased {shown}/{total}",
    lv: "Pēdējie {shown} no {total}",
    lt: "Naujausi {shown} iš {total}",
    tr: "Son {shown}/{total}",
    ru: "Последние {shown} из {total}",
    uk: "Останні {shown} з {total}",
    ca: "Últimes {shown} de {total}",
    id: "{shown} terbaru dari {total}",
    vi: "{shown} đơn mới nhất trong {total}",
    th: "ล่าสุด {shown} จาก {total}",
    zh: "最新 {shown} 条，共 {total} 条",
    ja: "最新{shown}件（全{total}件）",
    ko: "최신 {shown}개 / 전체 {total}개",
    ar: "أحدث {shown} من أصل {total}",
    he: "{shown} האחרונות מתוך {total}",
    hi: "{total} में से नवीनतम {shown}",
  },
  "admin.orders.fullHistoryLink": {
    en: "See the full order history — older orders, date ranges & export",
    fr: "Voir tout l'historique des commandes — commandes plus anciennes, périodes et export",
    es: "Ver el historial completo de pedidos — pedidos antiguos, rangos de fechas y exportación",
    it: "Vedi lo storico completo degli ordini — ordini più vecchi, intervalli di date ed esportazione",
    pt: "Ver o histórico completo de pedidos — pedidos antigos, intervalos de datas e exportação",
    "pt-BR": "Ver o histórico completo de pedidos — pedidos antigos, períodos e exportação",
    de: "Vollständigen Bestellverlauf ansehen — ältere Bestellungen, Zeiträume & Export",
    nl: "Bekijk de volledige bestelgeschiedenis — oudere bestellingen, datumbereiken & export",
    ro: "Vezi istoricul complet al comenzilor — comenzi mai vechi, intervale de date și export",
    sv: "Se hela orderhistoriken — äldre beställningar, datumintervall & export",
    da: "Se hele ordrehistorikken — ældre ordrer, datointervaller & eksport",
    nb: "Se hele ordrehistorikken — eldre ordrer, datoperioder og eksport",
    fi: "Näytä koko tilaushistoria — vanhemmat tilaukset, aikavälit ja vienti",
    pl: "Zobacz pełną historię zamówień — starsze zamówienia, zakresy dat i eksport",
    cs: "Zobrazit celou historii objednávek — starší objednávky, období a export",
    sk: "Zobraziť celú históriu objednávok — staršie objednávky, obdobia a export",
    hu: "Teljes rendelési előzmények — régebbi rendelések, dátumtartományok és exportálás",
    el: "Δείτε το πλήρες ιστορικό παραγγελιών — παλαιότερες παραγγελίες, εύρη ημερομηνιών και εξαγωγή",
    bg: "Вижте пълната история на поръчките — по-стари поръчки, периоди и експорт",
    hr: "Pogledaj cijelu povijest narudžbi — starije narudžbe, rasponi datuma i izvoz",
    sr: "Pogledaj celu istoriju porudžbina — starije porudžbine, opsezi datuma i izvoz",
    sl: "Ogled celotne zgodovine naročil — starejša naročila, datumska obdobja in izvoz",
    et: "Vaata kogu tellimuste ajalugu — vanemad tellimused, kuupäevavahemikud ja eksport",
    lv: "Skatīt visu pasūtījumu vēsturi — vecāki pasūtījumi, datumu diapazoni un eksports",
    lt: "Peržiūrėti visą užsakymų istoriją — senesni užsakymai, datų intervalai ir eksportas",
    tr: "Tüm sipariş geçmişini gör — eski siparişler, tarih aralıkları ve dışa aktarma",
    ru: "Смотреть всю историю заказов — старые заказы, диапазоны дат и экспорт",
    uk: "Переглянути всю історію замовлень — старіші замовлення, діапазони дат та експорт",
    ca: "Veure tot l'historial de comandes — comandes antigues, rangs de dates i exportació",
    id: "Lihat riwayat pesanan lengkap — pesanan lama, rentang tanggal & ekspor",
    vi: "Xem toàn bộ lịch sử đơn hàng — đơn cũ hơn, khoảng ngày & xuất dữ liệu",
    th: "ดูประวัติคำสั่งซื้อทั้งหมด — คำสั่งซื้อเก่า ช่วงวันที่ และการส่งออก",
    zh: "查看完整订单历史 — 更早的订单、日期范围和导出",
    ja: "全注文履歴を見る — 過去の注文・期間指定・エクスポート",
    ko: "전체 주문 내역 보기 — 이전 주문, 기간 지정 및 내보내기",
    ar: "عرض سجل الطلبات الكامل — الطلبات الأقدم ونطاقات التواريخ والتصدير",
    he: "צפייה בהיסטוריית ההזמנות המלאה — הזמנות ישנות, טווחי תאריכים וייצוא",
    hi: "पूरा ऑर्डर इतिहास देखें — पुराने ऑर्डर, तिथि सीमाएँ और निर्यात",
  },
  "admin.orders.searchAllHistory": {
    en: "Search all order history for “{query}”",
    fr: "Rechercher « {query} » dans tout l'historique des commandes",
    es: "Buscar “{query}” en todo el historial de pedidos",
    it: "Cerca “{query}” in tutto lo storico degli ordini",
    pt: "Pesquisar “{query}” em todo o histórico de pedidos",
    "pt-BR": "Buscar “{query}” em todo o histórico de pedidos",
    de: "Im gesamten Bestellverlauf nach „{query}“ suchen",
    nl: "Zoek “{query}” in de volledige bestelgeschiedenis",
    ro: "Caută „{query}” în tot istoricul comenzilor",
    sv: "Sök efter ”{query}” i hela orderhistoriken",
    da: "Søg efter ”{query}” i hele ordrehistorikken",
    nb: "Søk etter «{query}» i hele ordrehistorikken",
    fi: "Hae ”{query}” koko tilaushistoriasta",
    pl: "Szukaj „{query}” w całej historii zamówień",
    cs: "Hledat „{query}“ v celé historii objednávek",
    sk: "Hľadať „{query}“ v celej histórii objednávok",
    hu: "„{query}” keresése a teljes rendelési előzményekben",
    el: "Αναζήτηση «{query}» σε όλο το ιστορικό παραγγελιών",
    bg: "Търсене на „{query}“ в цялата история на поръчките",
    hr: "Pretraži „{query}” u cijeloj povijesti narudžbi",
    sr: "Pretraži „{query}” u celoj istoriji porudžbina",
    sl: "Išči »{query}« po celotni zgodovini naročil",
    et: "Otsi „{query}” kogu tellimuste ajaloost",
    lv: "Meklēt “{query}” visā pasūtījumu vēsturē",
    lt: "Ieškoti „{query}“ visoje užsakymų istorijoje",
    tr: "Tüm sipariş geçmişinde “{query}” ara",
    ru: "Искать «{query}» во всей истории заказов",
    uk: "Шукати «{query}» в усій історії замовлень",
    ca: "Cerca «{query}» a tot l'historial de comandes",
    id: "Cari “{query}” di seluruh riwayat pesanan",
    vi: "Tìm “{query}” trong toàn bộ lịch sử đơn hàng",
    th: "ค้นหา “{query}” ในประวัติคำสั่งซื้อทั้งหมด",
    zh: "在全部订单历史中搜索“{query}”",
    ja: "全注文履歴から「{query}」を検索",
    ko: "전체 주문 내역에서 “{query}” 검색",
    ar: "البحث عن ”{query}“ في كامل سجل الطلبات",
    he: "חיפוש ”{query}“ בכל היסטוריית ההזמנות",
    hi: "पूरे ऑर्डर इतिहास में “{query}” खोजें",
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
console.log(`✓ orders history-link strings added to ${n} locale(s).`);
