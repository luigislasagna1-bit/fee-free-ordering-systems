/**
 * Crop-before-upload modal strings (Luigi 2026-07-04) ×38 — admin.imageCrop.*
 *   npx tsx scripts/i18n-add-image-crop.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Pack = { title: string; square: string; standard: string; wide: string; useOriginal: string; cancel: string; cropAndUpload: string };

const T: Record<string, Pack> = {
  en: { title: "Adjust your photo", square: "Square", standard: "Standard", wide: "Wide", useOriginal: "Use original", cancel: "Cancel", cropAndUpload: "Crop & upload" },
  fr: { title: "Ajustez votre photo", square: "Carré", standard: "Standard", wide: "Large", useOriginal: "Utiliser l'original", cancel: "Annuler", cropAndUpload: "Recadrer et téléverser" },
  es: { title: "Ajusta tu foto", square: "Cuadrado", standard: "Estándar", wide: "Ancho", useOriginal: "Usar original", cancel: "Cancelar", cropAndUpload: "Recortar y subir" },
  it: { title: "Regola la foto", square: "Quadrato", standard: "Standard", wide: "Panoramico", useOriginal: "Usa originale", cancel: "Annulla", cropAndUpload: "Ritaglia e carica" },
  pt: { title: "Ajuste a sua foto", square: "Quadrado", standard: "Padrão", wide: "Largo", useOriginal: "Usar original", cancel: "Cancelar", cropAndUpload: "Recortar e enviar" },
  "pt-BR": { title: "Ajuste sua foto", square: "Quadrado", standard: "Padrão", wide: "Largo", useOriginal: "Usar original", cancel: "Cancelar", cropAndUpload: "Recortar e enviar" },
  de: { title: "Foto anpassen", square: "Quadratisch", standard: "Standard", wide: "Breit", useOriginal: "Original verwenden", cancel: "Abbrechen", cropAndUpload: "Zuschneiden & hochladen" },
  nl: { title: "Pas je foto aan", square: "Vierkant", standard: "Standaard", wide: "Breed", useOriginal: "Origineel gebruiken", cancel: "Annuleren", cropAndUpload: "Bijsnijden en uploaden" },
  ro: { title: "Ajustați fotografia", square: "Pătrat", standard: "Standard", wide: "Lat", useOriginal: "Folosiți originalul", cancel: "Anulare", cropAndUpload: "Decupați și încărcați" },
  sv: { title: "Justera ditt foto", square: "Kvadrat", standard: "Standard", wide: "Bred", useOriginal: "Använd original", cancel: "Avbryt", cropAndUpload: "Beskär och ladda upp" },
  da: { title: "Tilpas dit foto", square: "Kvadrat", standard: "Standard", wide: "Bred", useOriginal: "Brug original", cancel: "Annuller", cropAndUpload: "Beskær og upload" },
  nb: { title: "Juster bildet ditt", square: "Kvadrat", standard: "Standard", wide: "Bred", useOriginal: "Bruk original", cancel: "Avbryt", cropAndUpload: "Beskjær og last opp" },
  fi: { title: "Säädä kuvaa", square: "Neliö", standard: "Vakio", wide: "Leveä", useOriginal: "Käytä alkuperäistä", cancel: "Peruuta", cropAndUpload: "Rajaa ja lataa" },
  pl: { title: "Dopasuj zdjęcie", square: "Kwadrat", standard: "Standard", wide: "Szeroki", useOriginal: "Użyj oryginału", cancel: "Anuluj", cropAndUpload: "Przytnij i prześlij" },
  cs: { title: "Upravte fotografii", square: "Čtverec", standard: "Standard", wide: "Široký", useOriginal: "Použít originál", cancel: "Zrušit", cropAndUpload: "Oříznout a nahrát" },
  sk: { title: "Upravte fotografiu", square: "Štvorec", standard: "Štandard", wide: "Široký", useOriginal: "Použiť originál", cancel: "Zrušiť", cropAndUpload: "Orezať a nahrať" },
  hu: { title: "Fotó igazítása", square: "Négyzet", standard: "Normál", wide: "Széles", useOriginal: "Eredeti használata", cancel: "Mégse", cropAndUpload: "Kivágás és feltöltés" },
  el: { title: "Προσαρμόστε τη φωτογραφία", square: "Τετράγωνο", standard: "Κανονικό", wide: "Ευρύ", useOriginal: "Χρήση πρωτότυπου", cancel: "Άκυρο", cropAndUpload: "Περικοπή και μεταφόρτωση" },
  bg: { title: "Настройте снимката", square: "Квадрат", standard: "Стандарт", wide: "Широк", useOriginal: "Използвай оригинала", cancel: "Отказ", cropAndUpload: "Изрежи и качи" },
  hr: { title: "Prilagodite fotografiju", square: "Kvadrat", standard: "Standard", wide: "Široko", useOriginal: "Koristi original", cancel: "Odustani", cropAndUpload: "Izreži i prenesi" },
  sr: { title: "Prilagodite fotografiju", square: "Kvadrat", standard: "Standard", wide: "Široko", useOriginal: "Koristi original", cancel: "Otkaži", cropAndUpload: "Iseci i otpremi" },
  sl: { title: "Prilagodite fotografijo", square: "Kvadrat", standard: "Standardno", wide: "Široko", useOriginal: "Uporabi izvirnik", cancel: "Prekliči", cropAndUpload: "Obreži in naloži" },
  et: { title: "Kohanda fotot", square: "Ruut", standard: "Tavaline", wide: "Lai", useOriginal: "Kasuta originaali", cancel: "Tühista", cropAndUpload: "Kärbi ja laadi üles" },
  lv: { title: "Pielāgojiet foto", square: "Kvadrāts", standard: "Standarta", wide: "Plats", useOriginal: "Izmantot oriģinālu", cancel: "Atcelt", cropAndUpload: "Apgriezt un augšupielādēt" },
  lt: { title: "Koreguokite nuotrauką", square: "Kvadratas", standard: "Standartinis", wide: "Platus", useOriginal: "Naudoti originalą", cancel: "Atšaukti", cropAndUpload: "Apkirpti ir įkelti" },
  tr: { title: "Fotoğrafınızı ayarlayın", square: "Kare", standard: "Standart", wide: "Geniş", useOriginal: "Orijinali kullan", cancel: "İptal", cropAndUpload: "Kırp ve yükle" },
  ru: { title: "Настройте фото", square: "Квадрат", standard: "Стандарт", wide: "Широкий", useOriginal: "Использовать оригинал", cancel: "Отмена", cropAndUpload: "Обрезать и загрузить" },
  uk: { title: "Налаштуйте фото", square: "Квадрат", standard: "Стандарт", wide: "Широкий", useOriginal: "Використати оригінал", cancel: "Скасувати", cropAndUpload: "Обрізати та завантажити" },
  ca: { title: "Ajusta la foto", square: "Quadrat", standard: "Estàndard", wide: "Ample", useOriginal: "Fes servir l'original", cancel: "Cancel·la", cropAndUpload: "Retalla i puja" },
  id: { title: "Sesuaikan foto Anda", square: "Persegi", standard: "Standar", wide: "Lebar", useOriginal: "Gunakan asli", cancel: "Batal", cropAndUpload: "Pangkas & unggah" },
  vi: { title: "Điều chỉnh ảnh của bạn", square: "Vuông", standard: "Chuẩn", wide: "Rộng", useOriginal: "Dùng ảnh gốc", cancel: "Hủy", cropAndUpload: "Cắt và tải lên" },
  th: { title: "ปรับรูปภาพของคุณ", square: "จัตุรัส", standard: "มาตรฐาน", wide: "กว้าง", useOriginal: "ใช้รูปต้นฉบับ", cancel: "ยกเลิก", cropAndUpload: "ครอบตัดและอัปโหลด" },
  zh: { title: "调整您的照片", square: "正方形", standard: "标准", wide: "宽幅", useOriginal: "使用原图", cancel: "取消", cropAndUpload: "裁剪并上传" },
  ja: { title: "写真を調整", square: "正方形", standard: "標準", wide: "ワイド", useOriginal: "元の画像を使う", cancel: "キャンセル", cropAndUpload: "切り抜いてアップロード" },
  ko: { title: "사진 조정", square: "정사각형", standard: "표준", wide: "와이드", useOriginal: "원본 사용", cancel: "취소", cropAndUpload: "자르고 업로드" },
  ar: { title: "اضبط صورتك", square: "مربع", standard: "قياسي", wide: "عريض", useOriginal: "استخدام الأصل", cancel: "إلغاء", cropAndUpload: "اقتصاص ورفع" },
  he: { title: "התאימו את התמונה", square: "ריבוע", standard: "רגיל", wide: "רחב", useOriginal: "השתמשו במקור", cancel: "ביטול", cropAndUpload: "חיתוך והעלאה" },
  hi: { title: "अपनी फ़ोटो समायोजित करें", square: "वर्गाकार", standard: "मानक", wide: "चौड़ा", useOriginal: "मूल का उपयोग करें", cancel: "रद्द करें", cropAndUpload: "क्रॉप करें और अपलोड करें" },
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = T[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const ic = ((json.admin ??= {}).imageCrop ??= {});
  ic.title = pack.title;
  ic.aspect_square = pack.square;
  ic.aspect_standard = pack.standard;
  ic.aspect_wide = pack.wide;
  ic.useOriginal = pack.useOriginal;
  ic.cancel = pack.cancel;
  ic.cropAndUpload = pack.cropAndUpload;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ 7 keys added in ${changed} locale file(s)`);
