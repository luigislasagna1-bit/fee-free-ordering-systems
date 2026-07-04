/** i18n × 38: time-selection multi-choice (Luigi 2026-07-04) — customer chip
 *  for the ranges style + admin hint under the 3 checkboxes.
 *  Run: npx tsx scripts/i18n-add-slot-multi-choice.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "checkout.scheduleModeRanges": {
    en: "Time ranges", fr: "Plages horaires", es: "Rangos horarios", it: "Fasce orarie",
    pt: "Intervalos", "pt-BR": "Faixas de horário", de: "Zeitfenster", nl: "Tijdvakken",
    ro: "Intervale orare", sv: "Tidsintervall", da: "Tidsintervaller", nb: "Tidsintervaller",
    fi: "Aikavälit", pl: "Przedziały czasowe", cs: "Časová rozmezí", sk: "Časové rozpätia",
    hu: "Idősávok", el: "Χρονικά διαστήματα", bg: "Часови диапазони", hr: "Vremenski rasponi",
    sr: "Временски опсези", sl: "Časovni razponi", et: "Ajavahemikud", lv: "Laika diapazoni",
    lt: "Laiko intervalai", tr: "Zaman aralıkları", ru: "Диапазоны времени", uk: "Часові діапазони",
    ca: "Franges horàries", id: "Rentang waktu", vi: "Khoảng thời gian", th: "ช่วงเวลา",
    zh: "时间段", ja: "時間帯", ko: "시간대", ar: "نطاقات زمنية", he: "טווחי זמן", hi: "समय सीमाएँ",
  },
  "admin.services.timeSelectionMultiHint": {
    en: "Check every style customers may use — with more than one, they choose at checkout. Range windows are capped at 15 minutes.",
    fr: "Cochez chaque style proposé aux clients — s'il y en a plusieurs, ils choisissent au paiement. Les plages sont limitées à 15 minutes.",
    es: "Marca cada estilo disponible para los clientes; con más de uno, eligen al pagar. Las ventanas de rango se limitan a 15 minutos.",
    it: "Spunta ogni stile disponibile per i clienti — con più di uno, scelgono al checkout. Le finestre sono limitate a 15 minuti.",
    pt: "Assinale cada estilo disponível para os clientes — com mais de um, escolhem no checkout. As janelas de intervalo estão limitadas a 15 minutos.",
    "pt-BR": "Marque cada estilo disponível aos clientes — com mais de um, eles escolhem no checkout. As janelas de faixa são limitadas a 15 minutos.",
    de: "Aktivieren Sie jeden Stil, den Kunden nutzen dürfen — bei mehreren wählen sie beim Checkout. Zeitfenster sind auf 15 Minuten begrenzt.",
    nl: "Vink elke stijl aan die klanten mogen gebruiken — bij meerdere kiezen ze bij het afrekenen. Tijdvakken zijn beperkt tot 15 minuten.",
    ro: "Bifați fiecare stil disponibil clienților — cu mai multe, aleg la finalizare. Ferestrele de interval sunt limitate la 15 minute.",
    sv: "Markera varje stil kunderna får använda — vid flera väljer de i kassan. Intervallfönster är begränsade till 15 minuter.",
    da: "Markér hver stil, kunderne må bruge — ved flere vælger de ved kassen. Intervalvinduer er begrænset til 15 minutter.",
    nb: "Huk av hver stil kundene kan bruke — med flere velger de i kassen. Intervallvinduer er begrenset til 15 minutter.",
    fi: "Valitse jokainen asiakkaiden käytettävissä oleva tyyli — jos niitä on useita, he valitsevat kassalla. Aikaväli-ikkunat on rajattu 15 minuuttiin.",
    pl: "Zaznacz każdy styl dostępny dla klientów — przy kilku wybierają przy kasie. Okna przedziałów są ograniczone do 15 minut.",
    cs: "Zaškrtněte každý styl, který mohou zákazníci použít — u více si vyberou při pokladně. Okna rozmezí jsou omezena na 15 minut.",
    sk: "Zaškrtnite každý štýl, ktorý môžu zákazníci použiť — pri viacerých si vyberú pri pokladni. Okná rozpätí sú obmedzené na 15 minút.",
    hu: "Jelölje be az ügyfelek számára elérhető minden stílust — többnél a pénztárnál választanak. Az idősáv-ablakok legfeljebb 15 percesek.",
    el: "Επιλέξτε κάθε στυλ που μπορούν να χρησιμοποιούν οι πελάτες — με περισσότερα, επιλέγουν στο ταμείο. Τα παράθυρα διαστημάτων περιορίζονται στα 15 λεπτά.",
    bg: "Отметнете всеки стил, достъпен за клиентите — при няколко избират при плащане. Прозорците на диапазоните са ограничени до 15 минути.",
    hr: "Označite svaki stil koji kupci smiju koristiti — s više njih biraju pri naplati. Prozori raspona ograničeni su na 15 minuta.",
    sr: "Означите сваки стил доступан купцима — са више њих бирају при наплати. Прозори опсега су ограничени на 15 минута.",
    sl: "Označite vsak slog, ki ga stranke lahko uporabijo — pri več izbirajo ob plačilu. Okna razponov so omejena na 15 minut.",
    et: "Märkige iga stiil, mida kliendid võivad kasutada — mitme puhul valivad nad kassas. Vahemikuaknad on piiratud 15 minutiga.",
    lv: "Atzīmējiet katru klientiem pieejamo stilu — ja to ir vairāki, viņi izvēlas norēķinos. Diapazona logi ir ierobežoti līdz 15 minūtēm.",
    lt: "Pažymėkite kiekvieną klientams leidžiamą stilių — kai jų keli, jie renkasi atsiskaitydami. Intervalų langai ribojami iki 15 minučių.",
    tr: "Müşterilerin kullanabileceği her stili işaretleyin — birden fazlaysa ödeme sırasında seçerler. Aralık pencereleri 15 dakikayla sınırlıdır.",
    ru: "Отметьте каждый стиль, доступный клиентам — при нескольких они выбирают при оформлении. Окна диапазонов ограничены 15 минутами.",
    uk: "Позначте кожен стиль, доступний клієнтам — за кількох вони обирають при оформленні. Вікна діапазонів обмежені 15 хвилинами.",
    ca: "Marca cada estil disponible per als clients — amb més d'un, trien en pagar. Les finestres de franja es limiten a 15 minuts.",
    id: "Centang setiap gaya yang boleh digunakan pelanggan — jika lebih dari satu, mereka memilih saat checkout. Jendela rentang dibatasi 15 menit.",
    vi: "Đánh dấu mọi kiểu khách có thể dùng — nếu nhiều hơn một, họ chọn khi thanh toán. Khung khoảng thời gian giới hạn 15 phút.",
    th: "เลือกทุกแบบที่ลูกค้าใช้ได้ — หากมีมากกว่าหนึ่ง ลูกค้าจะเลือกตอนชำระเงิน หน้าต่างช่วงเวลาจำกัดที่ 15 นาที",
    zh: "勾选允许顾客使用的每种方式——多于一种时由顾客在结账时选择。时间段窗口上限为 15 分钟。",
    ja: "顧客が使えるスタイルをすべてチェックしてください。複数ある場合は会計時に顧客が選びます。時間帯の幅は最大 15 分です。",
    ko: "고객이 사용할 수 있는 방식을 모두 선택하세요. 여러 개면 결제 시 고객이 선택합니다. 시간대 창은 최대 15분입니다.",
    ar: "حدد كل نمط يمكن للعملاء استخدامه — مع أكثر من نمط، يختارون عند الدفع. نوافذ النطاقات محدودة بـ 15 دقيقة.",
    he: "סמנו כל סגנון שהלקוחות רשאים להשתמש בו — עם יותר מאחד, הם בוחרים בקופה. חלונות הטווח מוגבלים ל‑15 דקות.",
    hi: "हर वह शैली चुनें जो ग्राहक उपयोग कर सकते हैं — एक से अधिक होने पर वे चेकआउट पर चुनते हैं। रेंज विंडो अधिकतम 15 मिनट की होती हैं।",
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
console.log(`✓ Slot multi-choice strings added to ${n} locale(s).`);
