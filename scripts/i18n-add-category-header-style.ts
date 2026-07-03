/** i18n × 38: category no-image header style setting (Luigi 2026-07-03).
 *  Run: npx tsx scripts/i18n-add-category-header-style.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.websiteThemeClient.categoryNoImageStyle": {
    en: "Categories without a photo show as", fr: "Les catégories sans photo s'affichent comme", es: "Las categorías sin foto se muestran como", it: "Le categorie senza foto appaiono come",
    pt: "Categorias sem foto aparecem como", "pt-BR": "Categorias sem foto aparecem como", de: "Kategorien ohne Foto erscheinen als", nl: "Categorieën zonder foto tonen als",
    ro: "Categoriile fără fotografie apar ca", sv: "Kategorier utan foto visas som", da: "Kategorier uden foto vises som", nb: "Kategorier uten foto vises som",
    fi: "Kuvattomat kategoriat näkyvät muodossa", pl: "Kategorie bez zdjęcia wyświetlają się jako", cs: "Kategorie bez fotky se zobrazí jako", sk: "Kategórie bez fotky sa zobrazia ako",
    hu: "Fotó nélküli kategóriák megjelenése", el: "Οι κατηγορίες χωρίς φωτογραφία εμφανίζονται ως", bg: "Категориите без снимка се показват като", hr: "Kategorije bez fotografije prikazuju se kao",
    sr: "Категорије без фотографије се приказују као", sl: "Kategorije brez fotografije so prikazane kot", et: "Fotota kategooriad kuvatakse kui", lv: "Kategorijas bez foto tiek rādītas kā",
    lt: "Kategorijos be nuotraukos rodomos kaip", tr: "Fotoğrafsız kategoriler şöyle görünür", ru: "Категории без фото отображаются как", uk: "Категорії без фото відображаються як",
    ca: "Les categories sense foto es mostren com", id: "Kategori tanpa foto tampil sebagai", vi: "Danh mục không có ảnh hiển thị dạng", th: "หมวดหมู่ที่ไม่มีรูปแสดงเป็น",
    zh: "无图片的分类显示为", ja: "写真のないカテゴリの表示", ko: "사진 없는 카테고리 표시 방식", ar: "تظهر الفئات بدون صورة كـ",
    he: "קטגוריות ללא תמונה מוצגות כ", hi: "बिना फोटो वाली श्रेणियाँ ऐसे दिखें",
  },
  "admin.websiteThemeClient.categoryNoImageBand": {
    en: "Color banner", fr: "Bannière colorée", es: "Banner de color", it: "Banner colorato", pt: "Faixa colorida", "pt-BR": "Banner colorido", de: "Farbbanner", nl: "Kleurenbanner",
    ro: "Banner colorat", sv: "Färgbanner", da: "Farvebanner", nb: "Fargebanner", fi: "Väribanneri", pl: "Kolorowy baner", cs: "Barevný banner", sk: "Farebný banner",
    hu: "Színes banner", el: "Έγχρωμο μπάνερ", bg: "Цветен банер", hr: "Traka u boji", sr: "Трака у боји", sl: "Barvna pasica", et: "Värviline bänner", lv: "Krāsains baneris",
    lt: "Spalvota juosta", tr: "Renkli banner", ru: "Цветной баннер", uk: "Кольоровий банер", ca: "Bàner de color", id: "Banner warna", vi: "Băng-rôn màu", th: "แบนเนอร์สี",
    zh: "彩色横幅", ja: "カラーバナー", ko: "컬러 배너", ar: "شريط ملوّن", he: "באנר צבעוני", hi: "रंगीन बैनर",
  },
  "admin.websiteThemeClient.categoryNoImagePlain": {
    en: "Simple header (classic)", fr: "En-tête simple (classique)", es: "Encabezado simple (clásico)", it: "Intestazione semplice (classica)", pt: "Cabeçalho simples (clássico)", "pt-BR": "Cabeçalho simples (clássico)", de: "Einfache Überschrift (klassisch)", nl: "Eenvoudige kop (klassiek)",
    ro: "Antet simplu (clasic)", sv: "Enkel rubrik (klassisk)", da: "Enkel overskrift (klassisk)", nb: "Enkel overskrift (klassisk)", fi: "Pelkkä otsikko (klassinen)", pl: "Prosty nagłówek (klasyczny)", cs: "Jednoduchý nadpis (klasický)", sk: "Jednoduchý nadpis (klasický)",
    hu: "Egyszerű fejléc (klasszikus)", el: "Απλή επικεφαλίδα (κλασική)", bg: "Обикновено заглавие (класическо)", hr: "Jednostavan naslov (klasični)", sr: "Једноставан наслов (класични)", sl: "Preprost naslov (klasičen)", et: "Lihtne pealkiri (klassikaline)", lv: "Vienkāršs virsraksts (klasisks)",
    lt: "Paprasta antraštė (klasikinė)", tr: "Sade başlık (klasik)", ru: "Простой заголовок (классика)", uk: "Простий заголовок (класика)", ca: "Capçalera simple (clàssica)", id: "Judul sederhana (klasik)", vi: "Tiêu đề đơn giản (cổ điển)", th: "หัวข้อแบบเรียบ (คลาสสิก)",
    zh: "简洁标题（经典）", ja: "シンプルな見出し（クラシック）", ko: "간단한 헤더(클래식)", ar: "عنوان بسيط (كلاسيكي)", he: "כותרת פשוטה (קלאסית)", hi: "सादा शीर्षक (क्लासिक)",
  },
  "admin.websiteThemeClient.categoryNoImageStyleHint": {
    en: "Categories WITH a photo always get the big photo banner. This only decides the look of categories that don't have one — upload photos per category under Menu.",
    fr: "Les catégories AVEC photo ont toujours la grande bannière photo. Ce choix ne concerne que celles qui n'en ont pas — ajoutez des photos par catégorie dans Menu.",
    es: "Las categorías CON foto siempre tienen el banner grande con imagen. Esto solo decide el aspecto de las que no tienen — sube fotos por categoría en Menú.",
    it: "Le categorie CON foto hanno sempre il grande banner fotografico. Questo decide solo l'aspetto di quelle senza foto — carica le foto per categoria in Menu.",
    pt: "As categorias COM foto têm sempre a grande faixa fotográfica. Isto só decide o aspeto das que não têm — carregue fotos por categoria em Menu.",
    "pt-BR": "As categorias COM foto sempre têm o banner grande com imagem. Isto só decide o visual das que não têm — envie fotos por categoria em Menu.",
    de: "Kategorien MIT Foto erhalten immer das große Fotobanner. Dies bestimmt nur das Aussehen der Kategorien ohne Foto — Fotos je Kategorie unter Menü hochladen.",
    nl: "Categorieën MET foto krijgen altijd de grote fotobanner. Dit bepaalt alleen de weergave van categorieën zonder foto — upload foto's per categorie onder Menu.",
    ro: "Categoriile CU fotografie primesc mereu bannerul foto mare. Aceasta decide doar aspectul celor fără — încărcați fotografii pe categorie în Meniu.",
    sv: "Kategorier MED foto får alltid den stora fotobannern. Detta avgör bara utseendet för dem utan — ladda upp foton per kategori under Meny.",
    da: "Kategorier MED foto får altid det store fotobanner. Dette bestemmer kun udseendet af dem uden — upload fotos pr. kategori under Menu.",
    nb: "Kategorier MED foto får alltid det store fotobanneret. Dette bestemmer bare utseendet til dem uten — last opp bilder per kategori under Meny.",
    fi: "Kuvalliset kategoriat saavat aina ison kuvabannerin. Tämä valinta koskee vain kuvattomia — lisää kuvia kategorioittain Menu-osiossa.",
    pl: "Kategorie ZE zdjęciem zawsze mają duży baner ze zdjęciem. To decyduje tylko o wyglądzie tych bez — dodaj zdjęcia kategorii w Menu.",
    cs: "Kategorie S fotkou mají vždy velký fotobanner. Toto určuje jen vzhled těch bez fotky — fotky nahrajete u kategorií v Menu.",
    sk: "Kategórie S fotkou majú vždy veľký fotobanner. Toto určuje len vzhľad tých bez fotky — fotky nahráte pri kategóriách v Menu.",
    hu: "A fotóVAL rendelkező kategóriák mindig a nagy fotóbannert kapják. Ez csak a fotó nélküliek megjelenését szabja meg — képeket a Menü alatt tölthet fel.",
    el: "Οι κατηγορίες ΜΕ φωτογραφία έχουν πάντα το μεγάλο φωτογραφικό μπάνερ. Αυτό καθορίζει μόνο την εμφάνιση όσων δεν έχουν — ανεβάστε φωτογραφίες ανά κατηγορία στο Μενού.",
    bg: "Категориите СЪС снимка винаги получават големия фото банер. Това определя само вида на тези без — качете снимки по категория в Меню.",
    hr: "Kategorije SA fotografijom uvijek dobivaju veliki fotobanner. Ovo određuje samo izgled onih bez — prenesite fotografije po kategoriji u Izborniku.",
    sr: "Категорије СА фотографијом увек добијају велики фото банер. Ово одређује само изглед оних без — додајте фотографије по категорији у Менију.",
    sl: "Kategorije S fotografijo vedno dobijo veliko foto pasico. To določa le videz tistih brez — fotografije naložite pri kategorijah v Meniju.",
    et: "Fotoga kategooriad saavad alati suure fotobänneri. See määrab vaid fotota kategooriate välimuse — laadige fotod üles Menüü all.",
    lv: "Kategorijas AR foto vienmēr saņem lielo foto baneri. Tas nosaka tikai to izskatu, kurām foto nav — augšupielādējiet foto pie kategorijām sadaļā Izvēlne.",
    lt: "Kategorijos SU nuotrauka visada gauna didelę foto juostą. Tai lemia tik neturinčių išvaizdą — nuotraukas įkelkite prie kategorijų Meniu.",
    tr: "Fotoğraflı kategoriler her zaman büyük fotoğraflı banner alır. Bu yalnızca fotoğrafı olmayanların görünümünü belirler — fotoğrafları Menü altında kategori başına yükleyin.",
    ru: "Категории С фото всегда получают большой фотобаннер. Это определяет только вид категорий без фото — загрузите фото в разделе Меню.",
    uk: "Категорії З фото завжди отримують великий фотобанер. Це визначає лише вигляд тих, що без фото — завантажте фото в розділі Меню.",
    ca: "Les categories AMB foto sempre tenen el gran bàner fotogràfic. Això només decideix l'aspecte de les que no en tenen — puja fotos per categoria a Menú.",
    id: "Kategori DENGAN foto selalu mendapat banner foto besar. Ini hanya menentukan tampilan yang tanpa foto — unggah foto per kategori di Menu.",
    vi: "Danh mục CÓ ảnh luôn hiển thị băng-rôn ảnh lớn. Cài đặt này chỉ quyết định giao diện của danh mục không có ảnh — tải ảnh cho từng danh mục trong Menu.",
    th: "หมวดหมู่ที่มีรูปจะได้แบนเนอร์รูปใหญ่เสมอ ตัวเลือกนี้กำหนดเฉพาะหมวดที่ไม่มีรูป — อัปโหลดรูปต่อหมวดได้ที่เมนู",
    zh: "有图片的分类始终显示大图横幅。此设置只决定无图片分类的样式——可在“菜单”中为每个分类上传图片。",
    ja: "写真のあるカテゴリは常に大きな写真バナーで表示されます。これは写真のないカテゴリの見た目のみを決めます — 写真はメニューでカテゴリごとにアップロードできます。",
    ko: "사진이 있는 카테고리는 항상 큰 사진 배너로 표시됩니다. 이 설정은 사진이 없는 카테고리의 모양만 결정합니다 — 메뉴에서 카테고리별로 사진을 업로드하세요.",
    ar: "الفئات التي لها صورة تحصل دائمًا على الشريط الكبير بالصورة. هذا يحدد فقط مظهر الفئات بدون صورة — ارفع الصور لكل فئة من قائمة الطعام.",
    he: "קטגוריות עם תמונה תמיד מקבלות את באנר התמונה הגדול. זה קובע רק את מראה הקטגוריות בלי תמונה — העלו תמונות לכל קטגוריה בתפריט.",
    hi: "फोटो वाली श्रेणियों को हमेशा बड़ा फोटो बैनर मिलता है। यह केवल बिना फोटो वाली श्रेणियों का रूप तय करता है — मेनू में प्रति श्रेणी फोटो अपलोड करें।",
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
console.log(`✓ Category header-style strings added to ${n} locale(s).`);
