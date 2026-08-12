/**
 * Adds checkout.checkPinHint across all 38 locales.
 *
 * Shown under the delivery map while the pin is still the GEOCODER'S GUESS —
 * i.e. the customer typed an address but never picked a suggestion or moved the
 * pin. That spot decides their delivery zone and therefore their delivery fee,
 * and until now nothing ever asked them to look at it: the map only opened for
 * a customer who picked from the dropdown. Ben Bilton was charged $7.99 on an
 * order that qualified for free delivery precisely down this path.
 *
 * Deliberately phrased as a request, not a warning — the location is probably
 * right, and most customers should be able to glance at it and move on.
 */
import { readFileSync, writeFileSync } from "node:fs";

const KEY_PATH = ["checkout", "checkPinHint"];

const T: Record<string, string> = {
  en: "This is where we think you are. Drag the pin to your exact door so your delivery price is right.",
  ar: "هذا هو المكان الذي نعتقد أنك فيه. اسحب الدبوس إلى باب منزلك بالضبط ليكون سعر التوصيل صحيحًا.",
  bg: "Това е мястото, на което смятаме, че сте. Плъзнете карфицата точно до входа си, за да е вярна цената за доставка.",
  ca: "Aquí és on creiem que ets. Arrossega el marcador fins a la teva porta exacta perquè el preu del lliurament sigui correcte.",
  cs: "Tady si myslíme, že jste. Přetáhněte špendlík přesně ke svým dveřím, aby cena za doručení seděla.",
  da: "Det er her, vi tror, du er. Træk nålen hen til din præcise dør, så leveringsprisen bliver rigtig.",
  de: "Hier vermuten wir Sie. Ziehen Sie die Markierung genau an Ihre Tür, damit der Lieferpreis stimmt.",
  el: "Εδώ πιστεύουμε ότι βρίσκεστε. Σύρετε την πινέζα ακριβώς στην πόρτα σας για να είναι σωστή η τιμή παράδοσης.",
  es: "Aquí es donde creemos que estás. Arrastra el marcador hasta tu puerta exacta para que el precio de envío sea correcto.",
  et: "Arvame, et olete siin. Lohistage nõel täpselt oma ukseni, et kohaletoimetamise hind oleks õige.",
  fi: "Arvelemme sinun olevan täällä. Vedä nasta tarkalleen ovellesi, jotta toimitushinta on oikea.",
  fr: "C'est là que nous pensons que vous êtes. Faites glisser le repère jusqu'à votre porte exacte pour que le prix de livraison soit juste.",
  he: "כאן אנחנו חושבים שאתם נמצאים. גררו את הסמן לדלת המדויקת שלכם כדי שמחיר המשלוח יהיה נכון.",
  hi: "हमें लगता है कि आप यहाँ हैं। पिन को अपने सटीक दरवाज़े तक खींचें ताकि डिलीवरी की कीमत सही रहे।",
  hr: "Mislimo da ste ovdje. Povucite oznaku točno do svojih vrata kako bi cijena dostave bila točna.",
  hu: "Szerintünk itt van. Húzza a jelölőt pontosan az ajtajához, hogy a szállítási díj helyes legyen.",
  id: "Ini perkiraan lokasi Anda. Geser pin ke pintu Anda yang tepat agar biaya pengiriman benar.",
  it: "Qui è dove pensiamo che tu sia. Trascina il segnaposto esattamente alla tua porta perché il prezzo di consegna sia corretto.",
  ja: "こちらがお客様の場所だと思われます。配達料金を正しく計算するため、ピンを正確な玄関までドラッグしてください。",
  ko: "여기가 고객님의 위치로 추정됩니다. 배달 요금이 정확하도록 핀을 정확한 문 앞으로 끌어 주세요.",
  lt: "Manome, kad esate čia. Nutempkite žymeklį tiksliai iki savo durų, kad pristatymo kaina būtų teisinga.",
  lv: "Domājam, ka esat šeit. Velciet atzīmi tieši līdz savām durvīm, lai piegādes cena būtu pareiza.",
  nb: "Det er her vi tror du er. Dra nålen til nøyaktig døren din, så leveringsprisen blir riktig.",
  nl: "Dit is waar wij denken dat je bent. Sleep de speld naar je exacte deur zodat de bezorgprijs klopt.",
  pl: "Sądzimy, że jesteś tutaj. Przeciągnij pinezkę dokładnie pod swoje drzwi, aby cena dostawy była prawidłowa.",
  "pt-BR": "É aqui que achamos que você está. Arraste o marcador até a sua porta exata para que o preço da entrega fique certo.",
  pt: "É aqui que achamos que está. Arraste o marcador até à sua porta exacta para que o preço de entrega fique certo.",
  ro: "Aici credem că vă aflați. Trageți indicatorul exact la ușa dumneavoastră pentru ca prețul livrării să fie corect.",
  ru: "Мы думаем, что вы здесь. Перетащите метку точно к вашей двери, чтобы стоимость доставки была верной.",
  sk: "Myslíme si, že ste tu. Potiahnite špendlík presne k svojim dverám, aby bola cena za doručenie správna.",
  sl: "Mislimo, da ste tukaj. Povlecite oznako natanko do svojih vrat, da bo cena dostave pravilna.",
  sr: "Мислимо да сте овде. Превуците ознаку тачно до својих врата да би цена доставе била тачна.",
  sv: "Det är här vi tror att du är. Dra nålen till din exakta dörr så att leveranspriset blir rätt.",
  th: "นี่คือตำแหน่งที่เราคาดว่าคุณอยู่ ลากหมุดไปยังหน้าประตูของคุณให้ตรงจุด เพื่อให้ค่าจัดส่งถูกต้อง",
  tr: "Burada olduğunuzu düşünüyoruz. Teslimat ücretinin doğru olması için iğneyi tam kapınıza sürükleyin.",
  uk: "Ми вважаємо, що ви тут. Перетягніть позначку точно до ваших дверей, щоб вартість доставки була правильною.",
  vi: "Đây là nơi chúng tôi nghĩ bạn đang ở. Kéo ghim đến đúng cửa nhà bạn để phí giao hàng được tính chính xác.",
  zh: "这是我们推测的您的位置。请将图钉拖到您家门口的准确位置，以便正确计算配送费。",
};

let changed = 0;
for (const [locale, value] of Object.entries(T)) {
  const path = `src/messages/${locale}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  let node: any = json;
  for (const k of KEY_PATH.slice(0, -1)) {
    if (!node[k]) throw new Error(`${locale}: missing namespace ${k}`);
    node = node[k];
  }
  node[KEY_PATH[KEY_PATH.length - 1]] = value;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`Added checkout.checkPinHint to ${changed} locales.`);
