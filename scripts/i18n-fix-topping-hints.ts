/** i18n × 38: correct the misleading pizza pricing-engine hints (Luigi 2026-07-06).
 *  True semantics (now enforced server-side too): a Price per Extra Topping > 0
 *  activates flat per-topping pricing (halves × multiplier) with Included
 *  Toppings free; leaving it 0 charges each topping option's own price.
 *  Run: npx tsx scripts/i18n-fix-topping-hints.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.menuEditor.includedToppingsHint": {
    en: "Free toppings included in the base price",
    fr: "Garnitures gratuites incluses dans le prix de base",
    es: "Ingredientes gratis incluidos en el precio base",
    it: "Condimenti gratuiti inclusi nel prezzo base",
    pt: "Coberturas grátis incluídas no preço base",
    "pt-BR": "Coberturas grátis incluídas no preço base",
    de: "Im Grundpreis enthaltene Gratis-Beläge",
    nl: "Gratis toppings inbegrepen in de basisprijs",
    ro: "Topping-uri gratuite incluse în prețul de bază",
    sv: "Gratis toppings som ingår i grundpriset",
    da: "Gratis toppings inkluderet i grundprisen",
    nb: "Gratis toppinger inkludert i grunnprisen",
    fi: "Perushintaan sisältyvät ilmaiset täytteet",
    pl: "Darmowe dodatki wliczone w cenę podstawową",
    cs: "Přílohy zdarma zahrnuté v základní ceně",
    sk: "Prílohy zadarmo zahrnuté v základnej cene",
    hu: "Az alapárban foglalt ingyenes feltétek",
    el: "Δωρεάν υλικά που περιλαμβάνονται στη βασική τιμή",
    bg: "Безплатни топинги, включени в основната цена",
    hr: "Besplatni dodaci uključeni u osnovnu cijenu",
    sr: "Бесплатни додаци укључени у основну цену",
    sl: "Brezplačni dodatki, vključeni v osnovno ceno",
    et: "Põhihinnas sisalduvad tasuta lisandid",
    lv: "Bezmaksas piedevas, kas iekļautas pamatcenā",
    lt: "Nemokami priedai, įskaičiuoti į bazinę kainą",
    tr: "Taban fiyata dahil ücretsiz malzemeler",
    ru: "Бесплатные топпинги, включённые в базовую цену",
    uk: "Безкоштовні топінги, включені в базову ціну",
    ca: "Ingredients gratuïts inclosos en el preu base",
    id: "Topping gratis termasuk dalam harga dasar",
    vi: "Số topping miễn phí đã gồm trong giá gốc",
    th: "ท็อปปิงฟรีที่รวมในราคาพื้นฐาน",
    zh: "基础价格中包含的免费配料数",
    ja: "基本価格に含まれる無料トッピング数",
    ko: "기본 가격에 포함된 무료 토핑 수",
    ar: "إضافات مجانية مشمولة في السعر الأساسي",
    he: "תוספות חינם הכלולות במחיר הבסיס",
    hi: "मूल कीमत में शामिल मुफ़्त टॉपिंग",
  },
  "admin.menuEditor.extraToppingPriceHint": {
    en: "Charged per topping beyond the included count (halves cost the half-price share). Leave 0 to charge each topping option's own price instead.",
    fr: "Facturé par garniture au-delà du nombre inclus (les moitiés coûtent la part demi-prix). Laissez 0 pour facturer le prix propre de chaque option.",
    es: "Se cobra por ingrediente más allá de los incluidos (las mitades cuestan la parte proporcional). Deja 0 para cobrar el precio propio de cada opción.",
    it: "Addebitato per condimento oltre quelli inclusi (le metà costano la quota a metà prezzo). Lascia 0 per addebitare il prezzo proprio di ogni opzione.",
    pt: "Cobrado por cobertura além das incluídas (metades custam a parte proporcional). Deixe 0 para cobrar o preço próprio de cada opção.",
    "pt-BR": "Cobrado por cobertura além das incluídas (metades custam a parte proporcional). Deixe 0 para cobrar o preço próprio de cada opção.",
    de: "Pro Belag über die inklusiven hinaus berechnet (Hälften kosten den halben Anteil). Bei 0 gilt stattdessen der eigene Preis jeder Option.",
    nl: "Per topping boven het inbegrepen aantal (halve pizza's kosten het halve deel). Laat 0 staan om de eigen prijs van elke optie te rekenen.",
    ro: "Taxat per topping peste numărul inclus (jumătățile costă partea proporțională). Lăsați 0 pentru a taxa prețul propriu al fiecărei opțiuni.",
    sv: "Debiteras per topping utöver de inkluderade (halvor kostar halva andelen). Lämna 0 för att debitera varje alternativs eget pris.",
    da: "Opkræves pr. topping ud over de inkluderede (halvdele koster den halve andel). Lad stå 0 for at opkræve hver muligheds egen pris.",
    nb: "Belastes per topping utover de inkluderte (halvdeler koster halv andel). La stå 0 for å belaste hvert alternativs egen pris.",
    fi: "Veloitetaan täytteeltä sisältyvien lisäksi (puolikkaat maksavat puolikkaan osuuden). Jätä 0, jos haluat veloittaa kunkin vaihtoehdon oman hinnan.",
    pl: "Naliczane za dodatek ponad wliczone (połówki kosztują połowę). Zostaw 0, aby naliczać własną cenę każdej opcji.",
    cs: "Účtováno za přílohu nad zahrnutý počet (poloviny stojí poloviční podíl). Ponechte 0 pro účtování vlastní ceny každé možnosti.",
    sk: "Účtované za prílohu nad zahrnutý počet (polovice stoja polovičný podiel). Nechajte 0 pre účtovanie vlastnej ceny každej možnosti.",
    hu: "A benne foglalt darabszám feletti feltétenként számítjuk (a felek a fél árat fizetik). Hagyja 0-n, hogy minden opció a saját árát számítsa.",
    el: "Χρεώνεται ανά υλικό πέρα από τα περιλαμβανόμενα (τα μισά κοστίζουν το μισό μερίδιο). Αφήστε 0 για να χρεώνεται η δική του τιμή κάθε επιλογής.",
    bg: "Таксува се на топинг над включените (половинките струват половин дял). Оставете 0, за да се таксува собствената цена на всяка опция.",
    hr: "Naplaćuje se po dodatku iznad uključenih (polovice koštaju pola udjela). Ostavite 0 za naplatu vlastite cijene svake opcije.",
    sr: "Наплаћује се по додатку изнад укључених (половине коштају пола удела). Оставите 0 да се наплаћује сопствена цена сваке опције.",
    sl: "Zaračuna se na dodatek nad vključenimi (polovice stanejo polovični delež). Pustite 0 za zaračunavanje lastne cene vsake možnosti.",
    et: "Võetakse lisandi kohta üle sisalduva arvu (pooled maksavad poole osa). Jätke 0, et võtta iga valiku enda hind.",
    lv: "Tiek iekasēts par piedevu virs iekļautā skaita (puses maksā pusi). Atstājiet 0, lai iekasētu katras opcijas savu cenu.",
    lt: "Imama už priedą virš įskaičiuoto skaičiaus (pusės kainuoja pusę dalies). Palikite 0, kad būtų imama kiekvienos parinkties sava kaina.",
    tr: "Dahil sayının üzerindeki her malzeme için alınır (yarımlar yarı pay öder). Her seçeneğin kendi fiyatını almak için 0 bırakın.",
    ru: "Взимается за топпинг сверх включённых (половинки стоят половину). Оставьте 0, чтобы брать собственную цену каждой опции.",
    uk: "Стягується за топінг понад включені (половинки коштують половину). Залиште 0, щоб стягувати власну ціну кожної опції.",
    ca: "Es cobra per ingredient més enllà dels inclosos (les meitats costen la part proporcional). Deixeu 0 per cobrar el preu propi de cada opció.",
    id: "Dikenakan per topping melebihi jumlah yang termasuk (setengah membayar separuh). Biarkan 0 untuk mengenakan harga masing-masing opsi.",
    vi: "Tính cho mỗi topping vượt số lượng đã gồm (nửa bánh tính nửa giá). Để 0 nếu muốn tính giá riêng của từng lựa chọn.",
    th: "คิดต่อท็อปปิงที่เกินจำนวนที่รวม (ครึ่งถาดคิดครึ่งราคา) ใส่ 0 เพื่อคิดราคาของแต่ละตัวเลือกแทน",
    zh: "超出包含数量后每个配料按此收费（半张按半价）。填 0 则按每个配料选项自身的价格收费。",
    ja: "含まれる数を超えたトッピングごとに課金（ハーフは半額分）。0 のままにすると各オプション自身の価格で課金されます。",
    ko: "포함 수량을 초과한 토핑마다 부과됩니다(반판은 절반 요금). 0으로 두면 각 토핑 옵션의 자체 가격이 부과됩니다.",
    ar: "يُحتسب لكل إضافة تتجاوز العدد المشمول (الأنصاف تكلف نصف الحصة). اترك 0 لاحتساب سعر كل خيار نفسه.",
    he: "מחויב לכל תוספת מעבר לכמות הכלולה (חצאים עולים מחצית). השאירו 0 כדי לחייב את המחיר של כל אפשרות עצמה.",
    hi: "शामिल संख्या से अधिक प्रत्येक टॉपिंग पर शुल्क (आधे पर आधा मूल्य)। प्रत्येक विकल्प की अपनी कीमत लेने के लिए 0 छोड़ें।",
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
console.log(`✓ topping-hint corrections applied to ${n} locale(s).`);
