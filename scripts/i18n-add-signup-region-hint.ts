/**
 * Adds the signup address-block keys (marketing.signup.*) to all 38 locales.
 *
 * Why: the signup form's address block was hardcoded English while the rest of
 * the form used `marketing.signup.*`, and the Country select silently drove the
 * restaurant's CURRENCY and TIMEZONE with nothing on screen saying so — which is
 * how a real Islamabad restaurant was created as "Islamabad, CA" with Canadian
 * dollars and a Toronto clock. `regionHint` states the consequence before submit.
 *
 * Fails LOUD: any locale missing from the pack, or any translation that drops a
 * placeholder, aborts before a single file is written.
 *
 *   npx tsx scripts/i18n-add-signup-region-hint.ts          (dry run)
 *   npx tsx scripts/i18n-add-signup-region-hint.ts --write
 */
import fs from "node:fs";
import path from "node:path";

const WRITE = process.argv.includes("--write");
const DIR = path.join(process.cwd(), "src", "messages");

type Pack = Record<string, string>;

// key order is preserved as written here
const KEYS = ["addressSection", "streetAddress", "city", "stateProvince", "postalCode", "country", "regionHint"] as const;

const PACKS: Record<string, Pack> = {
  en: { addressSection: "Restaurant address", streetAddress: "Street address", city: "City", stateProvince: "State / Province", postalCode: "ZIP / Postal code", country: "Country", regionHint: "This sets your prices to {currency} and your clock to {timezone}. You can change both later in Settings." },
  ar: { addressSection: "عنوان المطعم", streetAddress: "عنوان الشارع", city: "المدينة", stateProvince: "الولاية / المحافظة", postalCode: "الرمز البريدي", country: "الدولة", regionHint: "يحدد هذا أسعارك بعملة {currency} وساعتك على {timezone}. يمكنك تغيير كليهما لاحقًا من الإعدادات." },
  bg: { addressSection: "Адрес на ресторанта", streetAddress: "Улица и номер", city: "Град", stateProvince: "Област", postalCode: "Пощенски код", country: "Държава", regionHint: "Това задава цените ви в {currency} и часовника ви на {timezone}. Можете да промените и двете по-късно в Настройки." },
  ca: { addressSection: "Adreça del restaurant", streetAddress: "Adreça", city: "Ciutat", stateProvince: "Estat / Província", postalCode: "Codi postal", country: "País", regionHint: "Això estableix els teus preus en {currency} i el teu rellotge a {timezone}. Pots canviar-ho més endavant a Configuració." },
  cs: { addressSection: "Adresa restaurace", streetAddress: "Ulice a číslo", city: "Město", stateProvince: "Kraj", postalCode: "PSČ", country: "Země", regionHint: "Tím se vaše ceny nastaví na {currency} a hodiny na {timezone}. Obojí můžete později změnit v Nastavení." },
  da: { addressSection: "Restaurantens adresse", streetAddress: "Vejnavn og nummer", city: "By", stateProvince: "Region", postalCode: "Postnummer", country: "Land", regionHint: "Dette sætter dine priser til {currency} og dit ur til {timezone}. Du kan ændre begge dele senere under Indstillinger." },
  de: { addressSection: "Adresse des Restaurants", streetAddress: "Straße und Hausnummer", city: "Stadt", stateProvince: "Bundesland", postalCode: "Postleitzahl", country: "Land", regionHint: "Damit werden deine Preise auf {currency} und deine Uhr auf {timezone} eingestellt. Beides kannst du später in den Einstellungen ändern." },
  el: { addressSection: "Διεύθυνση εστιατορίου", streetAddress: "Οδός και αριθμός", city: "Πόλη", stateProvince: "Περιφέρεια", postalCode: "Ταχυδρομικός κώδικας", country: "Χώρα", regionHint: "Αυτό ορίζει τις τιμές σας σε {currency} και το ρολόι σας σε {timezone}. Μπορείτε να αλλάξετε και τα δύο αργότερα στις Ρυθμίσεις." },
  es: { addressSection: "Dirección del restaurante", streetAddress: "Calle y número", city: "Ciudad", stateProvince: "Estado / Provincia", postalCode: "Código postal", country: "País", regionHint: "Esto establece tus precios en {currency} y tu reloj en {timezone}. Puedes cambiar ambos más adelante en Ajustes." },
  et: { addressSection: "Restorani aadress", streetAddress: "Tänav ja number", city: "Linn", stateProvince: "Maakond", postalCode: "Sihtnumber", country: "Riik", regionHint: "See seab teie hinnad valuutasse {currency} ja kella ajavööndisse {timezone}. Mõlemat saab hiljem seadetes muuta." },
  fi: { addressSection: "Ravintolan osoite", streetAddress: "Katuosoite", city: "Kaupunki", stateProvince: "Maakunta", postalCode: "Postinumero", country: "Maa", regionHint: "Tämä asettaa hintasi valuuttaan {currency} ja kellosi aikavyöhykkeeseen {timezone}. Voit muuttaa molempia myöhemmin asetuksissa." },
  fr: { addressSection: "Adresse du restaurant", streetAddress: "Numéro et rue", city: "Ville", stateProvince: "État / Province", postalCode: "Code postal", country: "Pays", regionHint: "Cela définit vos prix en {currency} et votre horloge sur {timezone}. Vous pourrez modifier les deux plus tard dans les Paramètres." },
  he: { addressSection: "כתובת המסעדה", streetAddress: "רחוב ומספר", city: "עיר", stateProvince: "מחוז", postalCode: "מיקוד", country: "מדינה", regionHint: "פעולה זו מגדירה את המחירים שלך ב-{currency} ואת השעון שלך ל-{timezone}. אפשר לשנות את שניהם מאוחר יותר בהגדרות." },
  hi: { addressSection: "रेस्टोरेंट का पता", streetAddress: "सड़क का पता", city: "शहर", stateProvince: "राज्य", postalCode: "पिन कोड", country: "देश", regionHint: "इससे आपकी कीमतें {currency} में और आपकी घड़ी {timezone} पर सेट हो जाएंगी। आप दोनों को बाद में सेटिंग्स में बदल सकते हैं।" },
  hr: { addressSection: "Adresa restorana", streetAddress: "Ulica i broj", city: "Grad", stateProvince: "Županija", postalCode: "Poštanski broj", country: "Država", regionHint: "Ovo postavlja vaše cijene na {currency} i vaš sat na {timezone}. Oboje možete promijeniti kasnije u Postavkama." },
  hu: { addressSection: "Az étterem címe", streetAddress: "Utca és házszám", city: "Város", stateProvince: "Megye", postalCode: "Irányítószám", country: "Ország", regionHint: "Ez {currency} pénznemre állítja az árakat, az órát pedig a következőre: {timezone}. Mindkettőt később módosíthatja a Beállításokban." },
  id: { addressSection: "Alamat restoran", streetAddress: "Nama jalan dan nomor", city: "Kota", stateProvince: "Provinsi", postalCode: "Kode pos", country: "Negara", regionHint: "Ini mengatur harga Anda ke {currency} dan jam Anda ke {timezone}. Anda dapat mengubah keduanya nanti di Pengaturan." },
  it: { addressSection: "Indirizzo del ristorante", streetAddress: "Via e numero civico", city: "Città", stateProvince: "Provincia", postalCode: "CAP", country: "Paese", regionHint: "Questo imposta i tuoi prezzi in {currency} e il tuo orologio su {timezone}. Puoi cambiare entrambi in seguito nelle Impostazioni." },
  ja: { addressSection: "レストランの住所", streetAddress: "番地・建物名", city: "市区町村", stateProvince: "都道府県", postalCode: "郵便番号", country: "国", regionHint: "これにより価格は{currency}、時刻は{timezone}に設定されます。どちらも後から設定で変更できます。" },
  ko: { addressSection: "레스토랑 주소", streetAddress: "도로명 주소", city: "시/군/구", stateProvince: "시/도", postalCode: "우편번호", country: "국가", regionHint: "이렇게 하면 가격이 {currency}(으)로, 시계가 {timezone}(으)로 설정됩니다. 두 가지 모두 나중에 설정에서 변경할 수 있습니다." },
  lt: { addressSection: "Restorano adresas", streetAddress: "Gatvė ir numeris", city: "Miestas", stateProvince: "Apskritis", postalCode: "Pašto kodas", country: "Šalis", regionHint: "Taip jūsų kainos nustatomos {currency} valiuta, o laikrodis – {timezone}. Abu galėsite pakeisti vėliau nustatymuose." },
  lv: { addressSection: "Restorāna adrese", streetAddress: "Iela un numurs", city: "Pilsēta", stateProvince: "Novads", postalCode: "Pasta indekss", country: "Valsts", regionHint: "Tādējādi jūsu cenas tiek iestatītas {currency} valūtā, bet pulkstenis — {timezone}. Abus varēsiet mainīt vēlāk iestatījumos." },
  nb: { addressSection: "Restaurantens adresse", streetAddress: "Gateadresse", city: "By", stateProvince: "Fylke", postalCode: "Postnummer", country: "Land", regionHint: "Dette setter prisene dine til {currency} og klokken din til {timezone}. Du kan endre begge senere under Innstillinger." },
  nl: { addressSection: "Adres van het restaurant", streetAddress: "Straat en huisnummer", city: "Plaats", stateProvince: "Provincie", postalCode: "Postcode", country: "Land", regionHint: "Hiermee worden je prijzen ingesteld op {currency} en je klok op {timezone}. Je kunt beide later wijzigen in Instellingen." },
  pl: { addressSection: "Adres restauracji", streetAddress: "Ulica i numer", city: "Miasto", stateProvince: "Województwo", postalCode: "Kod pocztowy", country: "Kraj", regionHint: "Spowoduje to ustawienie cen w walucie {currency} i zegara na {timezone}. Oba ustawienia możesz później zmienić w Ustawieniach." },
  pt: { addressSection: "Morada do restaurante", streetAddress: "Rua e número", city: "Cidade", stateProvince: "Distrito", postalCode: "Código postal", country: "País", regionHint: "Isto define os seus preços em {currency} e o seu relógio para {timezone}. Pode alterar ambos mais tarde nas Definições." },
  "pt-BR": { addressSection: "Endereço do restaurante", streetAddress: "Rua e número", city: "Cidade", stateProvince: "Estado", postalCode: "CEP", country: "País", regionHint: "Isso define seus preços em {currency} e seu relógio para {timezone}. Você pode alterar ambos depois nas Configurações." },
  ro: { addressSection: "Adresa restaurantului", streetAddress: "Stradă și număr", city: "Oraș", stateProvince: "Județ", postalCode: "Cod poștal", country: "Țară", regionHint: "Astfel prețurile tale sunt setate în {currency}, iar ceasul la {timezone}. Poți schimba ambele mai târziu în Setări." },
  ru: { addressSection: "Адрес ресторана", streetAddress: "Улица и дом", city: "Город", stateProvince: "Область", postalCode: "Почтовый индекс", country: "Страна", regionHint: "Это установит ваши цены в {currency}, а часы — на {timezone}. Оба параметра можно изменить позже в настройках." },
  sk: { addressSection: "Adresa reštaurácie", streetAddress: "Ulica a číslo", city: "Mesto", stateProvince: "Kraj", postalCode: "PSČ", country: "Krajina", regionHint: "Tým sa vaše ceny nastavia na {currency} a hodiny na {timezone}. Oboje môžete neskôr zmeniť v Nastaveniach." },
  sl: { addressSection: "Naslov restavracije", streetAddress: "Ulica in hišna številka", city: "Mesto", stateProvince: "Regija", postalCode: "Poštna številka", country: "Država", regionHint: "S tem se vaše cene nastavijo na {currency}, ura pa na {timezone}. Oboje lahko pozneje spremenite v nastavitvah." },
  sr: { addressSection: "Adresa restorana", streetAddress: "Ulica i broj", city: "Grad", stateProvince: "Okrug", postalCode: "Poštanski broj", country: "Država", regionHint: "Ovo postavlja vaše cene na {currency}, a sat na {timezone}. Oboje možete promeniti kasnije u Podešavanjima." },
  sv: { addressSection: "Restaurangens adress", streetAddress: "Gatuadress", city: "Ort", stateProvince: "Län", postalCode: "Postnummer", country: "Land", regionHint: "Detta ställer in dina priser till {currency} och din klocka till {timezone}. Du kan ändra båda senare under Inställningar." },
  th: { addressSection: "ที่อยู่ร้านอาหาร", streetAddress: "ที่อยู่", city: "เมือง", stateProvince: "จังหวัด", postalCode: "รหัสไปรษณีย์", country: "ประเทศ", regionHint: "การตั้งค่านี้จะกำหนดราคาของคุณเป็น {currency} และนาฬิกาเป็น {timezone} คุณสามารถเปลี่ยนทั้งสองอย่างได้ภายหลังในการตั้งค่า" },
  tr: { addressSection: "Restoran adresi", streetAddress: "Sokak ve numara", city: "Şehir", stateProvince: "İl", postalCode: "Posta kodu", country: "Ülke", regionHint: "Bu, fiyatlarınızı {currency} para birimine ve saatinizi {timezone} dilimine ayarlar. İkisini de daha sonra Ayarlar'dan değiştirebilirsiniz." },
  uk: { addressSection: "Адреса ресторану", streetAddress: "Вулиця та будинок", city: "Місто", stateProvince: "Область", postalCode: "Поштовий індекс", country: "Країна", regionHint: "Це встановить ваші ціни у валюті {currency}, а годинник — на {timezone}. Обидва параметри можна змінити пізніше в налаштуваннях." },
  vi: { addressSection: "Địa chỉ nhà hàng", streetAddress: "Số nhà và tên đường", city: "Thành phố", stateProvince: "Tỉnh", postalCode: "Mã bưu chính", country: "Quốc gia", regionHint: "Thao tác này đặt giá của bạn theo {currency} và đồng hồ theo {timezone}. Bạn có thể thay đổi cả hai sau trong phần Cài đặt." },
  zh: { addressSection: "餐厅地址", streetAddress: "街道地址", city: "城市", stateProvince: "省/直辖市", postalCode: "邮政编码", country: "国家/地区", regionHint: "这会将您的价格设置为 {currency}，并将时钟设置为 {timezone}。两者稍后都可在“设置”中更改。" },
};

const PLACEHOLDERS: Record<string, string[]> = { regionHint: ["{currency}", "{timezone}"] };

function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const locales = files.map((f) => f.replace(/\.json$/, ""));

  // ── Validate BEFORE writing anything ──────────────────────────────────
  const problems: string[] = [];
  for (const loc of locales) {
    const pack = PACKS[loc];
    if (!pack) { problems.push(`missing pack for locale "${loc}"`); continue; }
    for (const k of KEYS) {
      const v = pack[k];
      if (!v || !v.trim()) { problems.push(`${loc}.${k} is empty`); continue; }
      for (const ph of PLACEHOLDERS[k] ?? []) {
        if (!v.includes(ph)) problems.push(`${loc}.${k} lost placeholder ${ph}`);
      }
    }
  }
  for (const extra of Object.keys(PACKS).filter((l) => !locales.includes(l))) {
    problems.push(`pack "${extra}" has no matching messages file`);
  }
  if (problems.length) {
    console.error("❌ ABORTED — nothing written:");
    for (const p of problems) console.error("   " + p);
    process.exit(1);
  }

  let touched = 0;
  for (const loc of locales) {
    const file = path.join(DIR, `${loc}.json`);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    json.marketing ??= {};
    json.marketing.signup ??= {};
    for (const k of KEYS) json.marketing.signup[k] = PACKS[loc][k];
    if (WRITE) fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
    touched++;
  }

  console.log(`${WRITE ? "✅ wrote" : "🔍 dry run —"} ${KEYS.length} keys × ${touched} locales`);
  if (!WRITE) console.log("   re-run with --write to apply");
}

main();
