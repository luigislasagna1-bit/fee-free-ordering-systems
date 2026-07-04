/** i18n × 38: Delivery Zones editor — explain what a zone's "Std. Time" IS
 *  and WHERE it's used (Luigi + Fabrizio 2026-07-04: admins set 5 min
 *  thinking drive time; customers were promised 5-minute delivery).
 *  Run: npx tsx scripts/i18n-add-zone-minutes-hint.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.delivery.estimatedMinutesHint": {
    en: "TOTAL estimated delivery time (preparation + travel) for addresses in this zone. Customers here see this number at checkout and it sets the earliest \"order for later\" slot — it overrides the delivery service's default Estimated time. A realistic value is 30–60 min, not the drive time alone.",
    fr: "Temps de livraison TOTAL estimé (préparation + trajet) pour les adresses de cette zone. Les clients voient ce chiffre au paiement et il fixe le premier créneau « pour plus tard » — il remplace le temps estimé par défaut du service de livraison. Une valeur réaliste est de 30 à 60 min, pas seulement le trajet.",
    es: "Tiempo TOTAL estimado de entrega (preparación + trayecto) para las direcciones de esta zona. Los clientes ven este número al pagar y define la primera franja de \"pedir para más tarde\"; sustituye el tiempo estimado por defecto del servicio de reparto. Un valor realista es 30–60 min, no solo el trayecto.",
    it: "Tempo TOTALE stimato di consegna (preparazione + tragitto) per gli indirizzi di questa zona. I clienti vedono questo numero al checkout e determina il primo orario disponibile \"per dopo\" — sostituisce il tempo stimato predefinito del servizio di consegna. Un valore realistico è 30–60 min, non il solo tragitto.",
    pt: "Tempo TOTAL estimado de entrega (preparação + percurso) para moradas nesta zona. Os clientes veem este número no checkout e ele define o primeiro horário \"para mais tarde\" — substitui o tempo estimado padrão do serviço de entrega. Um valor realista é 30–60 min, não apenas o percurso.",
    "pt-BR": "Tempo TOTAL estimado de entrega (preparo + trajeto) para endereços nesta zona. Os clientes veem este número no checkout e ele define o primeiro horário \"para depois\" — substitui o tempo estimado padrão do serviço de entrega. Um valor realista é 30–60 min, não só o trajeto.",
    de: "GESAMTE geschätzte Lieferzeit (Zubereitung + Fahrt) für Adressen in dieser Zone. Kunden sehen diese Zahl beim Checkout, und sie bestimmt den frühesten \"später bestellen\"-Slot — sie überschreibt die Standard-Zeitschätzung des Lieferservice. Realistisch sind 30–60 Min., nicht nur die Fahrzeit.",
    nl: "TOTALE geschatte bezorgtijd (bereiding + rit) voor adressen in deze zone. Klanten zien dit getal bij het afrekenen en het bepaalt het vroegste \"later bestellen\"-tijdstip — het vervangt de standaard geschatte tijd van de bezorgservice. Realistisch is 30–60 min, niet alleen de rijtijd.",
    ro: "Timpul TOTAL estimat de livrare (preparare + drum) pentru adresele din această zonă. Clienții văd acest număr la finalizare și el stabilește primul interval \"pentru mai târziu\" — înlocuiește timpul estimat implicit al serviciului de livrare. O valoare realistă este 30–60 min, nu doar drumul.",
    sv: "TOTAL beräknad leveranstid (tillagning + resa) för adresser i denna zon. Kunder ser detta värde i kassan och det styr den tidigaste \"beställ till senare\"-tiden — det ersätter leveranstjänstens standardtid. Ett realistiskt värde är 30–60 min, inte bara körtiden.",
    da: "SAMLET anslået leveringstid (tilberedning + kørsel) for adresser i denne zone. Kunder ser dette tal ved checkout, og det sætter det tidligste \"bestil til senere\"-tidspunkt — det tilsidesætter leveringstjenestens standardtid. En realistisk værdi er 30–60 min., ikke kun køretiden.",
    nb: "TOTAL estimert leveringstid (tilberedning + kjøring) for adresser i denne sonen. Kundene ser dette tallet i kassen, og det setter tidligste \"bestill til senere\"-tidspunkt — det overstyrer leveringstjenestens standardtid. En realistisk verdi er 30–60 min, ikke bare kjøretiden.",
    fi: "Alueen osoitteiden KOKONAISarvio toimitusajasta (valmistus + matka). Asiakkaat näkevät tämän kassalla ja se määrää varhaisimman \"tilaa myöhemmäksi\" -ajan — se ohittaa toimituspalvelun oletusarvion. Realistinen arvo on 30–60 min, ei pelkkä ajomatka.",
    pl: "CAŁKOWITY szacowany czas dostawy (przygotowanie + dojazd) dla adresów w tej strefie. Klienci widzą tę liczbę przy kasie i wyznacza ona najwcześniejszy termin \"na później\" — zastępuje domyślny szacowany czas usługi dostawy. Realistyczna wartość to 30–60 min, nie sam dojazd.",
    cs: "CELKOVÝ odhad doby doručení (příprava + cesta) pro adresy v této zóně. Zákazníci toto číslo vidí u pokladny a určuje nejbližší slot \"na později\" — přepisuje výchozí odhad doručovací služby. Realistická hodnota je 30–60 min, ne jen cesta.",
    sk: "CELKOVÝ odhad času doručenia (príprava + cesta) pre adresy v tejto zóne. Zákazníci toto číslo vidia pri pokladni a určuje najskorší slot \"na neskôr\" — prepisuje predvolený odhad doručovacej služby. Realistická hodnota je 30–60 min, nie iba cesta.",
    hu: "TELJES becsült kiszállítási idő (elkészítés + út) a zóna címeire. A vásárlók ezt látják a pénztárnál, és ez adja a legkorábbi \"későbbre rendelés\" idősávot — felülírja a kiszállítási szolgáltatás alapértelmezett becslését. Reális érték 30–60 perc, nem csak az út.",
    el: "ΣΥΝΟΛΙΚΟΣ εκτιμώμενος χρόνος παράδοσης (προετοιμασία + διαδρομή) για διευθύνσεις αυτής της ζώνης. Οι πελάτες βλέπουν τον αριθμό στο ταμείο και ορίζει το νωρίτερο διαθέσιμο \"για αργότερα\" — αντικαθιστά την προεπιλεγμένη εκτίμηση της υπηρεσίας. Ρεαλιστική τιμή: 30–60 λεπτά, όχι μόνο η διαδρομή.",
    bg: "ОБЩО прогнозно време за доставка (приготвяне + път) за адресите в тази зона. Клиентите виждат това число при плащане и то определя най-ранния слот \"за по-късно\" — заменя стандартната прогноза на услугата за доставка. Реалистична стойност е 30–60 мин, не само пътят.",
    hr: "UKUPNO procijenjeno vrijeme dostave (priprema + put) za adrese u ovoj zoni. Kupci vide ovaj broj pri naplati i on određuje najraniji termin \"za kasnije\" — nadjačava zadanu procjenu usluge dostave. Realna vrijednost je 30–60 min, ne samo vožnja.",
    sr: "УКУПНО процењено време доставе (припрема + пут) за адресе у овој зони. Купци виде овај број при плаћању и он одређује најранији термин \"за касније\" — замењује подразумевану процену услуге доставе. Реална вредност је 30–60 мин, не само вожња.",
    sl: "SKUPNI ocenjeni čas dostave (priprava + pot) za naslove v tej coni. Stranke to številko vidijo ob plačilu in določa najzgodnejši termin \"za pozneje\" — prepiše privzeto oceno dostavne storitve. Realna vrednost je 30–60 min, ne le vožnja.",
    et: "KOGU hinnanguline tarneaeg (valmistamine + sõit) selle tsooni aadressidele. Kliendid näevad seda numbrit kassas ja see määrab varaseima \"telli hiljemaks\" aja — see asendab tarneteenuse vaikimisi hinnangu. Realistlik väärtus on 30–60 min, mitte ainult sõiduaeg.",
    lv: "KOPĒJAIS aplēstais piegādes laiks (gatavošana + ceļš) šīs zonas adresēm. Klienti šo skaitli redz norēķinos, un tas nosaka agrāko \"pasūtīt vēlāk\" laiku — tas aizstāj piegādes pakalpojuma noklusējuma aplēsi. Reāla vērtība ir 30–60 min, ne tikai ceļš.",
    lt: "BENDRAS numatomas pristatymo laikas (paruošimas + kelias) šios zonos adresams. Klientai šį skaičių mato atsiskaitydami, jis nustato anksčiausią \"užsakyti vėliau\" laiką — jis pakeičia numatytą pristatymo paslaugos įvertį. Reali reikšmė — 30–60 min., ne vien kelionė.",
    tr: "Bu bölgedeki adresler için TOPLAM tahmini teslimat süresi (hazırlık + yol). Müşteriler bu sayıyı ödeme sırasında görür ve en erken \"sonrası için sipariş\" saatini belirler — teslimat hizmetinin varsayılan tahminini geçersiz kılar. Gerçekçi değer 30–60 dk'dır, yalnızca yol süresi değil.",
    ru: "ОБЩЕЕ расчётное время доставки (приготовление + дорога) для адресов этой зоны. Покупатели видят это число при оформлении, и оно задаёт самый ранний слот \"на потом\" — оно заменяет стандартную оценку службы доставки. Реалистичное значение — 30–60 мин, а не только дорога.",
    uk: "ЗАГАЛЬНИЙ орієнтовний час доставки (приготування + дорога) для адрес цієї зони. Клієнти бачать це число при оформленні, і воно визначає найраніший слот \"на потім\" — воно замінює стандартну оцінку служби доставки. Реалістичне значення — 30–60 хв, а не лише дорога.",
    ca: "Temps TOTAL estimat de lliurament (preparació + trajecte) per a les adreces d'aquesta zona. Els clients veuen aquest número en pagar i fixa la primera franja \"per a més tard\" — substitueix el temps estimat per defecte del servei. Un valor realista és 30–60 min, no només el trajecte.",
    id: "TOTAL perkiraan waktu pengantaran (persiapan + perjalanan) untuk alamat di zona ini. Pelanggan melihat angka ini saat checkout dan menentukan slot \"pesan untuk nanti\" paling awal — menggantikan perkiraan bawaan layanan antar. Nilai realistis 30–60 mnt, bukan hanya perjalanan.",
    vi: "TỔNG thời gian giao hàng ước tính (chuẩn bị + di chuyển) cho địa chỉ trong khu vực này. Khách hàng thấy con số này khi thanh toán và nó quyết định khung \"đặt cho sau\" sớm nhất — nó thay thế ước tính mặc định của dịch vụ giao hàng. Giá trị hợp lý là 30–60 phút, không chỉ thời gian di chuyển.",
    th: "เวลาจัดส่งโดยประมาณรวม (เตรียมอาหาร + เดินทาง) สำหรับที่อยู่ในโซนนี้ ลูกค้าจะเห็นตัวเลขนี้ตอนชำระเงินและใช้กำหนดช่วง \"สั่งไว้ทีหลัง\" ที่เร็วที่สุด — แทนที่เวลาโดยประมาณเริ่มต้นของบริการจัดส่ง ค่าที่เหมาะสมคือ 30–60 นาที ไม่ใช่เวลาขับอย่างเดียว",
    zh: "该区域地址的总预计送达时间（备餐 + 路程）。顾客在结账时看到这个数字，它决定“稍后配送”的最早时段——它会覆盖配送服务的默认预计时间。合理值为 30–60 分钟，而非仅路程时间。",
    ja: "このゾーンの住所への合計配達予測時間（調理＋移動）。お客様は会計時にこの数字を目にし、「後で注文」の最も早い時間枠を決めます。配達サービスの既定の予測時間より優先されます。現実的な値は 30–60 分で、移動時間だけではありません。",
    ko: "이 구역 주소의 총 예상 배달 시간(조리 + 이동)입니다. 고객이 결제 시 이 숫자를 보며 가장 빠른 \"나중에 주문\" 시간대를 결정합니다 — 배달 서비스의 기본 예상 시간을 대체합니다. 현실적인 값은 이동 시간만이 아닌 30–60분입니다.",
    ar: "إجمالي وقت التوصيل المقدر (التحضير + الطريق) لعناوين هذه المنطقة. يرى العملاء هذا الرقم عند الدفع وهو يحدد أول موعد \"للطلب لاحقًا\" — ويحل محل التقدير الافتراضي لخدمة التوصيل. القيمة الواقعية 30–60 دقيقة، وليست مدة الطريق فقط.",
    he: "זמן המשלוח הכולל המשוער (הכנה + נסיעה) לכתובות באזור זה. לקוחות רואים את המספר בקופה והוא קובע את חלון \"הזמנה למועד מאוחר\" המוקדם ביותר — הוא גובר על ההערכה שבברירת המחדל של שירות המשלוחים. ערך מציאותי הוא 30–60 דק', לא זמן הנסיעה בלבד.",
    hi: "इस ज़ोन के पतों के लिए कुल अनुमानित डिलीवरी समय (तैयारी + यात्रा)। ग्राहक चेकआउट पर यह संख्या देखते हैं और यह सबसे पहला \"बाद के लिए ऑर्डर\" स्लॉट तय करती है — यह डिलीवरी सेवा के डिफ़ॉल्ट अनुमान की जगह लेती है। यथार्थ मान 30–60 मिनट है, केवल यात्रा समय नहीं।",
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
console.log(`✓ Zone Std.-Time hint added to ${n} locale(s).`);
