/** i18n × 38 for the admin search/export batch (Luigi 2026-07-19):
 *  - /admin/promotions name+coupon-code search placeholder
 *  - MenuExclusionsPanel item/category search placeholder (shared namespace)
 *  - /admin/locations name/city search placeholder
 *  - VIP group member CSV export 1000-row cap note
 *  Run: npx tsx scripts/i18n-add-admin-search-batch.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.promotionsList.searchPlaceholder": {
    en: "Search by name or coupon code…",
    fr: "Rechercher par nom ou code promo…",
    es: "Buscar por nombre o código de cupón…",
    it: "Cerca per nome o codice coupon…",
    pt: "Pesquisar por nome ou código de cupão…",
    "pt-BR": "Buscar por nome ou código de cupom…",
    de: "Nach Name oder Gutscheincode suchen…",
    nl: "Zoeken op naam of couponcode…",
    ro: "Caută după nume sau cod cupon…",
    sv: "Sök på namn eller kupongkod…",
    da: "Søg på navn eller kuponkode…",
    nb: "Søk på navn eller kupongkode…",
    fi: "Hae nimellä tai kuponkikoodilla…",
    pl: "Szukaj po nazwie lub kodzie kuponu…",
    cs: "Hledat podle názvu nebo kódu kuponu…",
    sk: "Hľadať podľa názvu alebo kódu kupónu…",
    hu: "Keresés név vagy kuponkód alapján…",
    el: "Αναζήτηση με όνομα ή κωδικό κουπονιού…",
    bg: "Търсене по име или код на купон…",
    hr: "Pretraži po nazivu ili kodu kupona…",
    sr: "Pretraži po nazivu ili kodu kupona…",
    sl: "Išči po imenu ali kodi kupona…",
    et: "Otsi nime või kupongikoodi järgi…",
    lv: "Meklēt pēc nosaukuma vai kupona koda…",
    lt: "Ieškoti pagal pavadinimą ar kupono kodą…",
    tr: "Ada veya kupon koduna göre ara…",
    ru: "Поиск по названию или коду купона…",
    uk: "Пошук за назвою або кодом купона…",
    ca: "Cerca per nom o codi de cupó…",
    id: "Cari berdasarkan nama atau kode kupon…",
    vi: "Tìm theo tên hoặc mã giảm giá…",
    th: "ค้นหาตามชื่อหรือรหัสคูปอง…",
    zh: "按名称或优惠码搜索…",
    ja: "名前またはクーポンコードで検索…",
    ko: "이름 또는 쿠폰 코드로 검색…",
    ar: "ابحث بالاسم أو رمز القسيمة…",
    he: "חיפוש לפי שם או קוד קופון…",
    hi: "नाम या कूपन कोड से खोजें…",
  },
  "admin.menuExclusions.searchPlaceholder": {
    en: "Search items and categories…",
    fr: "Rechercher des articles et catégories…",
    es: "Buscar artículos y categorías…",
    it: "Cerca piatti e categorie…",
    pt: "Pesquisar itens e categorias…",
    "pt-BR": "Buscar itens e categorias…",
    de: "Artikel und Kategorien durchsuchen…",
    nl: "Zoek items en categorieën…",
    ro: "Caută produse și categorii…",
    sv: "Sök artiklar och kategorier…",
    da: "Søg i varer og kategorier…",
    nb: "Søk i varer og kategorier…",
    fi: "Hae tuotteita ja kategorioita…",
    pl: "Szukaj pozycji i kategorii…",
    cs: "Hledat položky a kategorie…",
    sk: "Hľadať položky a kategórie…",
    hu: "Tételek és kategóriák keresése…",
    el: "Αναζήτηση προϊόντων και κατηγοριών…",
    bg: "Търсене на артикули и категории…",
    hr: "Pretraži stavke i kategorije…",
    sr: "Pretraži stavke i kategorije…",
    sl: "Išči artikle in kategorije…",
    et: "Otsi tooteid ja kategooriaid…",
    lv: "Meklēt produktus un kategorijas…",
    lt: "Ieškoti patiekalų ir kategorijų…",
    tr: "Ürün ve kategorilerde ara…",
    ru: "Поиск блюд и категорий…",
    uk: "Пошук страв і категорій…",
    ca: "Cerca articles i categories…",
    id: "Cari item dan kategori…",
    vi: "Tìm món và danh mục…",
    th: "ค้นหาเมนูและหมวดหมู่…",
    zh: "搜索菜品和分类…",
    ja: "商品・カテゴリを検索…",
    ko: "메뉴와 카테고리 검색…",
    ar: "ابحث في الأصناف والفئات…",
    he: "חיפוש פריטים וקטגוריות…",
    hi: "आइटम और श्रेणियाँ खोजें…",
  },
  "admin.locations.searchPlaceholder": {
    en: "Search by name or city…",
    fr: "Rechercher par nom ou ville…",
    es: "Buscar por nombre o ciudad…",
    it: "Cerca per nome o città…",
    pt: "Pesquisar por nome ou cidade…",
    "pt-BR": "Buscar por nome ou cidade…",
    de: "Nach Name oder Stadt suchen…",
    nl: "Zoeken op naam of stad…",
    ro: "Caută după nume sau oraș…",
    sv: "Sök på namn eller stad…",
    da: "Søg på navn eller by…",
    nb: "Søk på navn eller by…",
    fi: "Hae nimellä tai kaupungilla…",
    pl: "Szukaj po nazwie lub mieście…",
    cs: "Hledat podle názvu nebo města…",
    sk: "Hľadať podľa názvu alebo mesta…",
    hu: "Keresés név vagy város alapján…",
    el: "Αναζήτηση με όνομα ή πόλη…",
    bg: "Търсене по име или град…",
    hr: "Pretraži po nazivu ili gradu…",
    sr: "Pretraži po nazivu ili gradu…",
    sl: "Išči po imenu ali mestu…",
    et: "Otsi nime või linna järgi…",
    lv: "Meklēt pēc nosaukuma vai pilsētas…",
    lt: "Ieškoti pagal pavadinimą ar miestą…",
    tr: "Ada veya şehre göre ara…",
    ru: "Поиск по названию или городу…",
    uk: "Пошук за назвою або містом…",
    ca: "Cerca per nom o ciutat…",
    id: "Cari berdasarkan nama atau kota…",
    vi: "Tìm theo tên hoặc thành phố…",
    th: "ค้นหาตามชื่อหรือเมือง…",
    zh: "按名称或城市搜索…",
    ja: "名前または都市で検索…",
    ko: "이름 또는 도시로 검색…",
    ar: "ابحث بالاسم أو المدينة…",
    he: "חיפוש לפי שם או עיר…",
    hi: "नाम या शहर से खोजें…",
  },
  "admin.customerGroups.membersCsvCapNote": {
    en: "Note: only the first 1000 members are exported (server limit).",
    fr: "Remarque : seuls les 1000 premiers membres sont exportés (limite du serveur).",
    es: "Nota: solo se exportan los primeros 1000 miembros (límite del servidor).",
    it: "Nota: vengono esportati solo i primi 1000 membri (limite del server).",
    pt: "Nota: apenas os primeiros 1000 membros são exportados (limite do servidor).",
    "pt-BR": "Observação: apenas os primeiros 1000 membros são exportados (limite do servidor).",
    de: "Hinweis: Es werden nur die ersten 1000 Mitglieder exportiert (Serverlimit).",
    nl: "Let op: alleen de eerste 1000 leden worden geëxporteerd (serverlimiet).",
    ro: "Notă: doar primii 1000 de membri sunt exportați (limita serverului).",
    sv: "Obs: endast de första 1000 medlemmarna exporteras (servergräns).",
    da: "Bemærk: kun de første 1000 medlemmer eksporteres (servergrænse).",
    nb: "Merk: bare de første 1000 medlemmene eksporteres (servergrense).",
    fi: "Huom: vain ensimmäiset 1000 jäsentä viedään (palvelinraja).",
    pl: "Uwaga: eksportowanych jest tylko pierwszych 1000 członków (limit serwera).",
    cs: "Poznámka: exportuje se pouze prvních 1000 členů (limit serveru).",
    sk: "Poznámka: exportuje sa iba prvých 1000 členov (limit servera).",
    hu: "Megjegyzés: csak az első 1000 tag kerül exportálásra (szerverkorlát).",
    el: "Σημείωση: εξάγονται μόνο τα πρώτα 1000 μέλη (όριο διακομιστή).",
    bg: "Забележка: експортират се само първите 1000 членове (лимит на сървъра).",
    hr: "Napomena: izvozi se samo prvih 1000 članova (ograničenje poslužitelja).",
    sr: "Napomena: izvozi se samo prvih 1000 članova (ograničenje servera).",
    sl: "Opomba: izvozi se samo prvih 1000 članov (omejitev strežnika).",
    et: "Märkus: eksporditakse ainult esimesed 1000 liiget (serveri piirang).",
    lv: "Piezīme: tiek eksportēti tikai pirmie 1000 dalībnieki (servera ierobežojums).",
    lt: "Pastaba: eksportuojama tik pirmųjų 1000 narių (serverio riba).",
    tr: "Not: yalnızca ilk 1000 üye dışa aktarılır (sunucu sınırı).",
    ru: "Примечание: экспортируются только первые 1000 участников (ограничение сервера).",
    uk: "Примітка: експортуються лише перші 1000 учасників (обмеження сервера).",
    ca: "Nota: només s'exporten els primers 1000 membres (límit del servidor).",
    id: "Catatan: hanya 1000 anggota pertama yang diekspor (batas server).",
    vi: "Lưu ý: chỉ 1000 thành viên đầu tiên được xuất (giới hạn máy chủ).",
    th: "หมายเหตุ: ส่งออกได้เฉพาะสมาชิก 1000 คนแรกเท่านั้น (ขีดจำกัดของเซิร์ฟเวอร์)",
    zh: "注意：仅导出前 1000 名会员（服务器上限）。",
    ja: "注：エクスポートされるのは最初の1000名のメンバーのみです（サーバー上限）。",
    ko: "참고: 처음 1000명의 회원만 내보내집니다(서버 제한).",
    ar: "ملاحظة: يتم تصدير أول 1000 عضو فقط (حد الخادم).",
    he: "הערה: מיוצאים רק 1000 החברים הראשונים (מגבלת השרת).",
    hi: "नोट: केवल पहले 1000 सदस्य ही निर्यात किए जाते हैं (सर्वर सीमा)।",
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
console.log(`✓ admin search batch strings added to ${n} locale(s).`);
