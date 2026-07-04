/** i18n × 38 (Luigi 2026-07-04): two new no-image category header styles
 *  (button card / modern accent) + rewritten hint covering banners on & off.
 *  Run: npx tsx scripts/i18n-add-category-header-styles.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.websiteThemeClient.categoryNoImageButton": {
    en: "Button card", fr: "Carte bouton", es: "Tarjeta botón", it: "Scheda pulsante",
    pt: "Cartão botão", "pt-BR": "Cartão botão", de: "Button-Karte", nl: "Knopkaart",
    ro: "Card buton", sv: "Knappkort", da: "Knapkort", nb: "Knappekort",
    fi: "Painikekortti", pl: "Karta-przycisk", cs: "Karta-tlačítko", sk: "Karta-tlačidlo",
    hu: "Gombkártya", el: "Κάρτα-κουμπί", bg: "Карта-бутон", hr: "Kartica-gumb",
    sr: "Картица-дугме", sl: "Kartica-gumb", et: "Nupukaart", lv: "Pogas kartīte",
    lt: "Mygtuko kortelė", tr: "Buton kart", ru: "Карточка-кнопка", uk: "Картка-кнопка",
    ca: "Targeta botó", id: "Kartu tombol", vi: "Thẻ nút", th: "การ์ดปุ่ม",
    zh: "按钮卡片", ja: "ボタンカード", ko: "버튼 카드", ar: "بطاقة زر", he: "כרטיס כפתור", hi: "बटन कार्ड",
  },
  "admin.websiteThemeClient.categoryNoImageModern": {
    en: "Modern accent", fr: "Accent moderne", es: "Acento moderno", it: "Accento moderno",
    pt: "Destaque moderno", "pt-BR": "Destaque moderno", de: "Moderner Akzent", nl: "Modern accent",
    ro: "Accent modern", sv: "Modern accent", da: "Moderne accent", nb: "Moderne aksent",
    fi: "Moderni korostus", pl: "Nowoczesny akcent", cs: "Moderní akcent", sk: "Moderný akcent",
    hu: "Modern hangsúly", el: "Μοντέρνα πινελιά", bg: "Модерен акцент", hr: "Moderni naglasak",
    sr: "Модерни акценат", sl: "Moderen poudarek", et: "Modernne aktsent", lv: "Moderns akcents",
    lt: "Modernus akcentas", tr: "Modern vurgu", ru: "Современный акцент", uk: "Сучасний акцент",
    ca: "Accent modern", id: "Aksen modern", vi: "Điểm nhấn hiện đại", th: "สำเนียงโมเดิร์น",
    zh: "现代强调", ja: "モダンアクセント", ko: "모던 액센트", ar: "لمسة عصرية", he: "מבטא מודרני", hi: "आधुनिक एक्सेंट",
  },
  "admin.websiteThemeClient.categoryNoImageStyleHint": {
    en: "Categories WITH a photo always get the big photo banner (when banners are on) — upload photos per category under Menu. This decides how categories WITHOUT one look: plain text, a solid band, a tappable button card, or a modern accent panel in your theme colour.",
    fr: "Les catégories AVEC photo ont toujours le grand bandeau photo (si les bannières sont activées) — ajoutez des photos par catégorie dans Menu. Ceci définit l'apparence des catégories SANS photo : texte simple, bandeau uni, carte-bouton cliquable ou panneau moderne à la couleur de votre thème.",
    es: "Las categorías CON foto siempre muestran el banner grande (si los banners están activados); sube fotos por categoría en Menú. Esto decide el aspecto de las que NO tienen: texto simple, banda de color, tarjeta-botón táctil o panel moderno con el color de tu tema.",
    it: "Le categorie CON foto hanno sempre il grande banner fotografico (con i banner attivi) — carica le foto per categoria in Menu. Questo decide l'aspetto di quelle SENZA: testo semplice, banda colorata, scheda-pulsante toccabile o pannello moderno nel colore del tema.",
    pt: "As categorias COM foto têm sempre o banner grande (com banners ativados) — carregue fotos por categoria no Menu. Isto define o aspeto das que NÃO têm: texto simples, banda de cor, cartão-botão tocável ou painel moderno na cor do tema.",
    "pt-BR": "Categorias COM foto sempre têm o banner grande (com banners ativados) — envie fotos por categoria no Menu. Isto define o visual das que NÃO têm: texto simples, faixa de cor, cartão-botão tocável ou painel moderno na cor do tema.",
    de: "Kategorien MIT Foto erhalten immer das große Fotobanner (bei aktivierten Bannern) — Fotos je Kategorie unter Menü hochladen. Dies bestimmt das Aussehen der Kategorien OHNE Foto: schlichter Text, farbiges Band, tippbare Button-Karte oder modernes Akzent-Panel in Ihrer Themenfarbe.",
    nl: "Categorieën MET foto krijgen altijd de grote fotobanner (bij ingeschakelde banners) — upload foto's per categorie onder Menu. Dit bepaalt hoe categorieën ZONDER foto eruitzien: platte tekst, effen band, aantikbare knopkaart of modern accentpaneel in je themakleur.",
    ro: "Categoriile CU fotografie primesc mereu bannerul foto mare (cu bannerele active) — încărcați fotografii pe categorie în Meniu. Aceasta decide aspectul celor FĂRĂ: text simplu, bandă colorată, card-buton tactil sau panou modern în culoarea temei.",
    sv: "Kategorier MED foto får alltid den stora fotobannern (när banners är på) — ladda upp foton per kategori under Meny. Detta avgör hur kategorier UTAN foto ser ut: ren text, färgband, tryckbart knappkort eller modern accentpanel i din temafärg.",
    da: "Kategorier MED foto får altid det store fotobanner (når bannere er slået til) — upload fotos pr. kategori under Menu. Dette bestemmer udseendet af kategorier UDEN: ren tekst, farvebånd, trykbart knapkort eller moderne accentpanel i din temafarve.",
    nb: "Kategorier MED foto får alltid det store fotobanneret (når bannere er på) — last opp bilder per kategori under Meny. Dette bestemmer utseendet til kategorier UTEN: ren tekst, fargebånd, trykkbart knappekort eller moderne aksentpanel i temafargen din.",
    fi: "Kuvalliset kategoriat saavat aina ison kuvabannerin (kun bannerit ovat käytössä) — lataa kuvat kategoriakohtaisesti Menu-osiossa. Tämä määrää kuvattomien ulkoasun: pelkkä teksti, värinauha, napautettava painikekortti tai moderni korostuspaneeli teemaväreissäsi.",
    pl: "Kategorie ZE zdjęciem zawsze mają duży baner (przy włączonych banerach) — dodawaj zdjęcia per kategoria w Menu. To decyduje o wyglądzie kategorii BEZ zdjęcia: zwykły tekst, kolorowy pas, dotykalna karta-przycisk lub nowoczesny panel akcentowy w kolorze motywu.",
    cs: "Kategorie S fotkou mají vždy velký fotobanner (při zapnutých bannerech) — fotky nahrávejte po kategoriích v Menu. Toto určuje vzhled kategorií BEZ fotky: prostý text, barevný pruh, klepnutelná karta-tlačítko nebo moderní akcentový panel v barvě motivu.",
    sk: "Kategórie S fotkou majú vždy veľký fotobanner (pri zapnutých banneroch) — fotky nahrávajte po kategóriách v Menu. Toto určuje vzhľad kategórií BEZ fotky: čistý text, farebný pruh, klepnuteľná karta-tlačidlo alebo moderný akcentový panel vo farbe témy.",
    hu: "A fotóVAL rendelkező kategóriák mindig a nagy fotóbannert kapják (bekapcsolt bannereknél) — töltsön fel fotókat kategóriánként a Menüben. Ez dönti el a fotó NÉLKÜLIEK kinézetét: sima szöveg, színes sáv, koppintható gombkártya vagy modern hangsúlypanel a téma színében.",
    el: "Οι κατηγορίες ΜΕ φωτογραφία έχουν πάντα το μεγάλο φωτογραφικό μπάνερ (με ενεργά μπάνερ) — ανεβάστε φωτογραφίες ανά κατηγορία στο Μενού. Αυτό καθορίζει την εμφάνιση όσων ΔΕΝ έχουν: απλό κείμενο, χρωματιστή λωρίδα, πατήσιμη κάρτα-κουμπί ή μοντέρνο πάνελ στο χρώμα του θέματος.",
    bg: "Категориите СЪС снимка винаги получават големия банер (при включени банери) — качвайте снимки по категория в Меню. Това определя вида на тези БЕЗ: обикновен текст, цветна лента, докосваема карта-бутон или модерен акцентен панел в цвета на темата.",
    hr: "Kategorije SA slikom uvijek dobivaju veliki foto-banner (kad su banneri uključeni) — slike učitavajte po kategoriji u Izborniku. Ovo određuje izgled onih BEZ slike: običan tekst, obojena traka, dodirljiva kartica-gumb ili moderni naglasni panel u boji teme.",
    sr: "Категорије СА сликом увек добијају велики фото-банер (када су банери укључени) — слике додајте по категорији у Менију. Ово одређује изглед оних БЕЗ слике: обичан текст, обојена трака, додирљива картица-дугме или модеран панел у боји теме.",
    sl: "Kategorije S sliko vedno dobijo velik foto pasico (ko so pasice vklopljene) — slike nalagajte po kategorijah v Meniju. To določa videz kategorij BREZ slike: navadno besedilo, barvni trak, tapljiva kartica-gumb ali moderen poudarjen panel v barvi teme.",
    et: "Fotoga kategooriad saavad alati suure fotobänneri (kui bännerid on sees) — laadige fotod kategooriate kaupa Menüüs. See määrab fotota kategooriate välimuse: lihttekst, värviriba, puudutatav nupukaart või modernne aktsentpaneel teie teemavärvis.",
    lv: "Kategorijas AR fotoattēlu vienmēr saņem lielo foto reklāmkarogu (kad karogi ieslēgti) — augšupielādējiet fotoattēlus pa kategorijām sadaļā Izvēlne. Tas nosaka, kā izskatās kategorijas BEZ fotoattēla: vienkāršs teksts, krāsu josla, pieskarama pogas kartīte vai moderns akcenta panelis jūsu tēmas krāsā.",
    lt: "Kategorijos SU nuotrauka visada gauna didelį foto baneris (kai baneriai įjungti) — nuotraukas kelkite pagal kategoriją Meniu. Tai lemia kategorijų BE nuotraukos išvaizdą: paprastas tekstas, spalvota juosta, paliečiama mygtuko kortelė arba modernus akcento skydelis temos spalva.",
    tr: "Fotoğrafı OLAN kategoriler her zaman büyük fotoğraf banner'ını alır (banner'lar açıkken) — fotoğrafları Menü'de kategori başına yükleyin. Bu, fotoğrafı OLMAYANLARIN görünümünü belirler: sade metin, düz renk bant, dokunulabilir buton kart veya tema renginizde modern vurgu paneli.",
    ru: "Категории С фото всегда получают большой фотобаннер (при включённых баннерах) — загружайте фото по категориям в Меню. Это определяет вид категорий БЕЗ фото: простой текст, цветная полоса, нажимаемая карточка-кнопка или современная акцентная панель в цвете темы.",
    uk: "Категорії З фото завжди отримують великий фотобанер (за увімкнених банерів) — завантажуйте фото за категоріями в Меню. Це визначає вигляд категорій БЕЗ фото: простий текст, кольорова смуга, натискна картка-кнопка або сучасна акцентна панель у кольорі теми.",
    ca: "Les categories AMB foto sempre tenen el bàner fotogràfic gran (amb bàners activats) — puja fotos per categoria a Menú. Això decideix l'aspecte de les que NO en tenen: text simple, banda de color, targeta-botó tocable o panell modern amb el color del tema.",
    id: "Kategori DENGAN foto selalu mendapat banner foto besar (saat banner aktif) — unggah foto per kategori di Menu. Ini menentukan tampilan kategori TANPA foto: teks polos, pita warna, kartu tombol yang bisa diketuk, atau panel aksen modern dengan warna tema Anda.",
    vi: "Danh mục CÓ ảnh luôn có banner ảnh lớn (khi bật banner) — tải ảnh theo từng danh mục trong Thực đơn. Mục này quyết định giao diện của danh mục KHÔNG có ảnh: chữ đơn giản, dải màu, thẻ nút chạm được, hoặc bảng điểm nhấn hiện đại theo màu chủ đề.",
    th: "หมวดหมู่ที่มีรูปจะได้แบนเนอร์รูปขนาดใหญ่เสมอ (เมื่อเปิดแบนเนอร์) — อัปโหลดรูปต่อหมวดหมู่ในเมนู ส่วนนี้กำหนดหน้าตาของหมวดหมู่ที่ไม่มีรูป: ข้อความล้วน แถบสี การ์ดปุ่มแบบแตะได้ หรือแผงสำเนียงโมเดิร์นตามสีธีมของคุณ",
    zh: "有照片的分类始终显示大图横幅（横幅开启时）——请在菜单中为每个分类上传照片。此设置决定无照片分类的外观：纯文字、纯色条带、可点按的按钮卡片，或使用主题色的现代强调面板。",
    ja: "写真のあるカテゴリーは常に大きな写真バナーになります（バナー有効時）。写真はメニューでカテゴリーごとにアップロードしてください。この設定は写真のないカテゴリーの見た目を決めます：プレーンテキスト、カラー帯、タップできるボタンカード、テーマカラーのモダンアクセントパネル。",
    ko: "사진이 있는 카테고리는 항상 큰 사진 배너로 표시됩니다(배너 사용 시) — 메뉴에서 카테고리별로 사진을 업로드하세요. 이 설정은 사진이 없는 카테고리의 모양을 결정합니다: 일반 텍스트, 단색 밴드, 탭 가능한 버튼 카드 또는 테마 색상의 모던 액센트 패널.",
    ar: "الفئات التي تحتوي على صورة تحصل دائمًا على البانر الكبير (عند تفعيل البانرات) — ارفع الصور لكل فئة من قائمة الطعام. يحدد هذا مظهر الفئات بدون صورة: نص بسيط، شريط لون، بطاقة زر قابلة للنقر، أو لوحة عصرية بلون سمتك.",
    he: "קטגוריות עם תמונה תמיד מקבלות את באנר התמונה הגדול (כשהבאנרים פעילים) — העלו תמונות לכל קטגוריה בתפריט. זה קובע את מראה הקטגוריות ללא תמונה: טקסט פשוט, פס צבע, כרטיס-כפתור לחיץ או פאנל מודרני בצבע ערכת הנושא.",
    hi: "फ़ोटो वाली श्रेणियों को हमेशा बड़ा फ़ोटो बैनर मिलता है (बैनर चालू होने पर) — मेनू में प्रति श्रेणी फ़ोटो अपलोड करें। यह तय करता है कि बिना फ़ोटो वाली श्रेणियाँ कैसी दिखें: सादा टेक्स्ट, रंगीन पट्टी, टैप करने योग्य बटन कार्ड, या आपकी थीम के रंग में आधुनिक एक्सेंट पैनल।",
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
console.log(`✓ Category header style strings added to ${n} locale(s).`);
