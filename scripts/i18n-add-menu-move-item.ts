/**
 * Menu editor cross-category item drag (Luigi 2026-07-04) ×38:
 *   admin.menuEditor.dropToMoveItemHere   — hint on the category header
 *   admin.menuEditor.itemMovedToCategory  — success toast {name} {category}
 *   admin.menuEditor.moveItemFailed       — failure toast
 *   npx tsx scripts/i18n-add-menu-move-item.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Pack = { hint: string; moved: string; failed: string };

const T: Record<string, Pack> = {
  en: { hint: "Drop to move the item into this category", moved: "Moved “{name}” to {category}", failed: "Couldn't move the item — please try again." },
  fr: { hint: "Déposez pour déplacer l'article dans cette catégorie", moved: "« {name} » déplacé vers {category}", failed: "Impossible de déplacer l'article — veuillez réessayer." },
  es: { hint: "Suelta para mover el artículo a esta categoría", moved: "«{name}» movido a {category}", failed: "No se pudo mover el artículo — inténtalo de nuevo." },
  it: { hint: "Rilascia per spostare il piatto in questa categoria", moved: "“{name}” spostato in {category}", failed: "Impossibile spostare il piatto — riprova." },
  pt: { hint: "Largue para mover o item para esta categoria", moved: "“{name}” movido para {category}", failed: "Não foi possível mover o item — tente novamente." },
  "pt-BR": { hint: "Solte para mover o item para esta categoria", moved: "“{name}” movido para {category}", failed: "Não foi possível mover o item — tente novamente." },
  de: { hint: "Loslassen, um den Artikel in diese Kategorie zu verschieben", moved: "„{name}“ nach {category} verschoben", failed: "Artikel konnte nicht verschoben werden — bitte erneut versuchen." },
  nl: { hint: "Laat los om het item naar deze categorie te verplaatsen", moved: "“{name}” verplaatst naar {category}", failed: "Kon het item niet verplaatsen — probeer het opnieuw." },
  ro: { hint: "Eliberați pentru a muta produsul în această categorie", moved: "„{name}” mutat în {category}", failed: "Produsul nu a putut fi mutat — încercați din nou." },
  sv: { hint: "Släpp för att flytta artikeln till den här kategorin", moved: "”{name}” flyttad till {category}", failed: "Kunde inte flytta artikeln — försök igen." },
  da: { hint: "Slip for at flytte varen til denne kategori", moved: "”{name}” flyttet til {category}", failed: "Kunne ikke flytte varen — prøv igen." },
  nb: { hint: "Slipp for å flytte varen til denne kategorien", moved: "“{name}” flyttet til {category}", failed: "Kunne ikke flytte varen — prøv igjen." },
  fi: { hint: "Pudota siirtääksesi tuotteen tähän kategoriaan", moved: "”{name}” siirretty kategoriaan {category}", failed: "Tuotetta ei voitu siirtää — yritä uudelleen." },
  pl: { hint: "Upuść, aby przenieść pozycję do tej kategorii", moved: "Przeniesiono „{name}” do {category}", failed: "Nie udało się przenieść pozycji — spróbuj ponownie." },
  cs: { hint: "Přetažením sem přesunete položku do této kategorie", moved: "„{name}“ přesunuto do {category}", failed: "Položku se nepodařilo přesunout — zkuste to znovu." },
  sk: { hint: "Pustením sem presuniete položku do tejto kategórie", moved: "„{name}“ presunuté do {category}", failed: "Položku sa nepodarilo presunúť — skúste to znova." },
  hu: { hint: "Engedje el, hogy a tételt ebbe a kategóriába helyezze", moved: "„{name}” áthelyezve ide: {category}", failed: "A tételt nem sikerült áthelyezni — próbálja újra." },
  el: { hint: "Αφήστε για να μετακινήσετε το προϊόν σε αυτήν την κατηγορία", moved: "Το “{name}” μετακινήθηκε στην κατηγορία {category}", failed: "Δεν ήταν δυνατή η μετακίνηση του προϊόντος — δοκιμάστε ξανά." },
  bg: { hint: "Пуснете, за да преместите артикула в тази категория", moved: "„{name}“ е преместен в {category}", failed: "Артикулът не можа да бъде преместен — опитайте отново." },
  hr: { hint: "Otpustite da premjestite stavku u ovu kategoriju", moved: "„{name}“ premješteno u {category}", failed: "Stavku nije bilo moguće premjestiti — pokušajte ponovno." },
  sr: { hint: "Otpustite da premestite stavku u ovu kategoriju", moved: "„{name}“ premešteno u {category}", failed: "Stavku nije bilo moguće premestiti — pokušajte ponovo." },
  sl: { hint: "Spustite, da premaknete izdelek v to kategorijo", moved: "„{name}“ premaknjeno v {category}", failed: "Izdelka ni bilo mogoče premakniti — poskusite znova." },
  et: { hint: "Lase lahti, et tõsta toode sellesse kategooriasse", moved: "„{name}” tõstetud kategooriasse {category}", failed: "Toodet ei õnnestunud teisaldada — proovi uuesti." },
  lv: { hint: "Atlaidiet, lai pārvietotu produktu uz šo kategoriju", moved: "“{name}” pārvietots uz {category}", failed: "Produktu neizdevās pārvietot — mēģiniet vēlreiz." },
  lt: { hint: "Paleiskite, kad perkeltumėte patiekalą į šią kategoriją", moved: "„{name}“ perkelta į {category}", failed: "Nepavyko perkelti patiekalo — bandykite dar kartą." },
  tr: { hint: "Ürünü bu kategoriye taşımak için bırakın", moved: "“{name}” {category} kategorisine taşındı", failed: "Ürün taşınamadı — lütfen tekrar deneyin." },
  ru: { hint: "Отпустите, чтобы переместить позицию в эту категорию", moved: "«{name}» перемещено в {category}", failed: "Не удалось переместить позицию — попробуйте ещё раз." },
  uk: { hint: "Відпустіть, щоб перемістити позицію в цю категорію", moved: "«{name}» переміщено до {category}", failed: "Не вдалося перемістити позицію — спробуйте ще раз." },
  ca: { hint: "Deixa anar per moure l'article a aquesta categoria", moved: "«{name}» mogut a {category}", failed: "No s'ha pogut moure l'article — torna-ho a provar." },
  id: { hint: "Lepas untuk memindahkan item ke kategori ini", moved: "“{name}” dipindahkan ke {category}", failed: "Tidak dapat memindahkan item — coba lagi." },
  vi: { hint: "Thả để chuyển món vào danh mục này", moved: "Đã chuyển “{name}” sang {category}", failed: "Không thể chuyển món — vui lòng thử lại." },
  th: { hint: "วางเพื่อย้ายรายการไปยังหมวดหมู่นี้", moved: "ย้าย “{name}” ไปที่ {category} แล้ว", failed: "ย้ายรายการไม่สำเร็จ — โปรดลองอีกครั้ง" },
  zh: { hint: "松开即可将菜品移动到此分类", moved: "已将“{name}”移动到 {category}", failed: "无法移动菜品——请重试。" },
  ja: { hint: "ここにドロップするとこのカテゴリーに移動します", moved: "「{name}」を{category}に移動しました", failed: "商品を移動できませんでした — もう一度お試しください。" },
  ko: { hint: "여기에 놓으면 이 카테고리로 이동합니다", moved: "“{name}”을(를) {category}(으)로 이동했습니다", failed: "항목을 이동하지 못했습니다 — 다시 시도해 주세요." },
  ar: { hint: "أفلت لنقل الصنف إلى هذه الفئة", moved: "تم نقل “{name}” إلى {category}", failed: "تعذر نقل الصنف — يرجى المحاولة مرة أخرى." },
  he: { hint: "שחררו כדי להעביר את הפריט לקטגוריה זו", moved: "“{name}” הועבר אל {category}", failed: "לא ניתן להעביר את הפריט — נסו שוב." },
  hi: { hint: "आइटम को इस श्रेणी में ले जाने के लिए छोड़ें", moved: "“{name}” को {category} में ले जाया गया", failed: "आइटम स्थानांतरित नहीं हो सका — कृपया फिर से प्रयास करें।" },
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = T[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const me = ((json.admin ??= {}).menuEditor ??= {});
  me.dropToMoveItemHere = pack.hint;
  me.itemMovedToCategory = pack.moved;
  me.moveItemFailed = pack.failed;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ 3 keys added in ${changed} locale file(s)`);
