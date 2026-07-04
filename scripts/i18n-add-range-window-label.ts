/** i18n × 38 (Luigi 2026-07-04, one-control decision): interval label when
 *  Time ranges are on (interval = window length) + REWRITE the multi-choice
 *  hint (old text claimed a 15-min cap; now the interval IS the length).
 *  Run: npx tsx scripts/i18n-add-range-window-label.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.services.slotIntervalRangeLabel": {
    en: "Window length & spacing",
    fr: "Durée et espacement des plages",
    es: "Duración y espaciado de las ventanas",
    it: "Durata e cadenza delle fasce",
    pt: "Duração e espaçamento das janelas",
    "pt-BR": "Duração e espaçamento das janelas",
    de: "Fensterlänge & Abstand",
    nl: "Lengte en interval van tijdvakken",
    ro: "Durata și distanțarea ferestrelor",
    sv: "Fönsterlängd & intervall",
    da: "Vindueslængde & interval",
    nb: "Vinduslengde og intervall",
    fi: "Ikkunan pituus ja väli",
    pl: "Długość i odstęp okien",
    cs: "Délka a rozestup oken",
    sk: "Dĺžka a rozostup okien",
    hu: "Ablakhossz és időköz",
    el: "Διάρκεια και βήμα παραθύρων",
    bg: "Дължина и стъпка на прозорците",
    hr: "Trajanje i razmak prozora",
    sr: "Трајање и размак прозора",
    sl: "Dolžina in razmik oken",
    et: "Akna pikkus ja samm",
    lv: "Loga garums un solis",
    lt: "Lango trukmė ir žingsnis",
    tr: "Pencere uzunluğu ve aralığı",
    ru: "Длина и шаг окон",
    uk: "Довжина та крок вікон",
    ca: "Durada i espaiat de les finestres",
    id: "Durasi & jarak jendela",
    vi: "Độ dài & khoảng cách khung",
    th: "ความยาวและระยะห่างของหน้าต่างเวลา",
    zh: "时间段长度与间隔",
    ja: "時間帯の長さと間隔",
    ko: "시간대 길이 및 간격",
    ar: "طول النوافذ والمباعدة بينها",
    he: "אורך החלונות והמרווח ביניהם",
    hi: "विंडो की लंबाई और अंतराल",
  },
  "admin.services.timeSelectionMultiHint": {
    en: "Check every style customers may use — with more than one, they choose at checkout. For time ranges, the interval below is each window's length (default 15 min).",
    fr: "Cochez chaque style proposé aux clients — s'il y en a plusieurs, ils choisissent au paiement. Pour les plages, l'intervalle ci-dessous est la durée de chaque fenêtre (15 min par défaut).",
    es: "Marca cada estilo disponible para los clientes; con más de uno, eligen al pagar. Para los rangos, el intervalo de abajo es la duración de cada ventana (15 min por defecto).",
    it: "Spunta ogni stile disponibile per i clienti — con più di uno, scelgono al checkout. Per le fasce, l'intervallo qui sotto è la durata di ogni finestra (15 min di default).",
    pt: "Assinale cada estilo disponível para os clientes — com mais de um, escolhem no checkout. Para intervalos, o valor abaixo é a duração de cada janela (15 min por defeito).",
    "pt-BR": "Marque cada estilo disponível aos clientes — com mais de um, eles escolhem no checkout. Para faixas, o intervalo abaixo é a duração de cada janela (padrão 15 min).",
    de: "Aktivieren Sie jeden Stil, den Kunden nutzen dürfen — bei mehreren wählen sie beim Checkout. Bei Zeitfenstern ist das Intervall unten die Länge jedes Fensters (Standard 15 Min.).",
    nl: "Vink elke stijl aan die klanten mogen gebruiken — bij meerdere kiezen ze bij het afrekenen. Bij tijdvakken is het interval hieronder de lengte van elk vak (standaard 15 min).",
    ro: "Bifați fiecare stil disponibil clienților — cu mai multe, aleg la finalizare. Pentru intervale, valoarea de mai jos este durata fiecărei ferestre (implicit 15 min).",
    sv: "Markera varje stil kunderna får använda — vid flera väljer de i kassan. För tidsintervall är intervallet nedan varje fönsters längd (standard 15 min).",
    da: "Markér hver stil, kunderne må bruge — ved flere vælger de ved kassen. For tidsintervaller er intervallet nedenfor hvert vindues længde (standard 15 min).",
    nb: "Huk av hver stil kundene kan bruke — med flere velger de i kassen. For tidsintervaller er intervallet nedenfor hvert vindus lengde (standard 15 min).",
    fi: "Valitse jokainen asiakkaiden käytettävissä oleva tyyli — jos niitä on useita, he valitsevat kassalla. Aikaväleissä alla oleva väli on kunkin ikkunan pituus (oletus 15 min).",
    pl: "Zaznacz każdy styl dostępny dla klientów — przy kilku wybierają przy kasie. Dla przedziałów interwał poniżej to długość każdego okna (domyślnie 15 min).",
    cs: "Zaškrtněte každý styl, který mohou zákazníci použít — u více si vyberou při pokladně. U rozmezí je interval níže délkou každého okna (výchozí 15 min).",
    sk: "Zaškrtnite každý štýl, ktorý môžu zákazníci použiť — pri viacerých si vyberú pri pokladni. Pri rozpätiach je interval nižšie dĺžkou každého okna (predvolene 15 min).",
    hu: "Jelölje be az ügyfelek számára elérhető minden stílust — többnél a pénztárnál választanak. Idősávoknál a lenti időköz az egyes ablakok hossza (alapértelmezés: 15 perc).",
    el: "Επιλέξτε κάθε στυλ που μπορούν να χρησιμοποιούν οι πελάτες — με περισσότερα, επιλέγουν στο ταμείο. Για τα διαστήματα, το βήμα παρακάτω είναι η διάρκεια κάθε παραθύρου (προεπιλογή 15 λεπτά).",
    bg: "Отметнете всеки стил, достъпен за клиентите — при няколко избират при плащане. За диапазоните интервалът по-долу е дължината на всеки прозорец (по подразбиране 15 мин).",
    hr: "Označite svaki stil koji kupci smiju koristiti — s više njih biraju pri naplati. Za raspone, interval ispod je trajanje svakog prozora (zadano 15 min).",
    sr: "Означите сваки стил доступан купцима — са више њих бирају при наплати. За опсеге, интервал испод је трајање сваког прозора (подразумевано 15 мин).",
    sl: "Označite vsak slog, ki ga stranke lahko uporabijo — pri več izbirajo ob plačilu. Pri razponih je spodnji interval dolžina vsakega okna (privzeto 15 min).",
    et: "Märkige iga stiil, mida kliendid võivad kasutada — mitme puhul valivad nad kassas. Vahemike puhul on allolev intervall iga akna pikkus (vaikimisi 15 min).",
    lv: "Atzīmējiet katru klientiem pieejamo stilu — ja to ir vairāki, viņi izvēlas norēķinos. Diapazoniem zemāk esošais intervāls ir katra loga garums (noklusējums 15 min).",
    lt: "Pažymėkite kiekvieną klientams leidžiamą stilių — kai jų keli, jie renkasi atsiskaitydami. Intervalams žemiau esantis žingsnis yra kiekvieno lango trukmė (numatytoji 15 min.).",
    tr: "Müşterilerin kullanabileceği her stili işaretleyin — birden fazlaysa ödeme sırasında seçerler. Zaman aralıklarında aşağıdaki aralık her pencerenin uzunluğudur (varsayılan 15 dk).",
    ru: "Отметьте каждый стиль, доступный клиентам — при нескольких они выбирают при оформлении. Для диапазонов интервал ниже — это длина каждого окна (по умолчанию 15 мин).",
    uk: "Позначте кожен стиль, доступний клієнтам — за кількох вони обирають при оформленні. Для діапазонів інтервал нижче — це довжина кожного вікна (типово 15 хв).",
    ca: "Marca cada estil disponible per als clients — amb més d'un, trien en pagar. Per a les franges, l'interval de sota és la durada de cada finestra (per defecte 15 min).",
    id: "Centang setiap gaya yang boleh digunakan pelanggan — jika lebih dari satu, mereka memilih saat checkout. Untuk rentang, interval di bawah adalah durasi tiap jendela (bawaan 15 mnt).",
    vi: "Đánh dấu mọi kiểu khách có thể dùng — nếu nhiều hơn một, họ chọn khi thanh toán. Với khoảng thời gian, khoảng cách bên dưới là độ dài mỗi khung (mặc định 15 phút).",
    th: "เลือกทุกแบบที่ลูกค้าใช้ได้ — หากมีมากกว่าหนึ่ง ลูกค้าจะเลือกตอนชำระเงิน สำหรับช่วงเวลา ช่วงห่างด้านล่างคือความยาวของแต่ละหน้าต่าง (ค่าเริ่มต้น 15 นาที)",
    zh: "勾选允许顾客使用的每种方式——多于一种时由顾客在结账时选择。对于时间段，下方的间隔即每个窗口的长度（默认 15 分钟）。",
    ja: "顧客が使えるスタイルをすべてチェックしてください。複数ある場合は会計時に顧客が選びます。時間帯では、下の間隔が各枠の長さになります（既定 15 分）。",
    ko: "고객이 사용할 수 있는 방식을 모두 선택하세요. 여러 개면 결제 시 고객이 선택합니다. 시간대의 경우 아래 간격이 각 창의 길이입니다(기본 15분).",
    ar: "حدد كل نمط يمكن للعملاء استخدامه — مع أكثر من نمط، يختارون عند الدفع. بالنسبة للنطاقات، الفاصل أدناه هو طول كل نافذة (الافتراضي 15 دقيقة).",
    he: "סמנו כל סגנון שהלקוחות רשאים להשתמש בו — עם יותר מאחד, הם בוחרים בקופה. בטווחים, המרווח שלמטה הוא אורך כל חלון (ברירת מחדל 15 דק').",
    hi: "हर वह शैली चुनें जो ग्राहक उपयोग कर सकते हैं — एक से अधिक होने पर वे चेकआउट पर चुनते हैं। रेंज के लिए, नीचे का अंतराल हर विंडो की लंबाई है (डिफ़ॉल्ट 15 मिनट)।",
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
console.log(`✓ Range-window label + hint rewrite applied to ${n} locale(s).`);
