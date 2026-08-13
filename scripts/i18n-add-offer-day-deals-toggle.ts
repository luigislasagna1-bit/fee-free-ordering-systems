/**
 * admin.phoneOrderingPage.config.offerDayDeals + offerDayDealsHint, ×38.
 *
 * Day Deals was fully built and service-wired but had NO admin toggle: the API
 * accepted offerDayDeals, the voice service read it, and the only way to change
 * it was a database edit. Finished work nobody could reach (Luigi 2026-08-12).
 *
 * The hint has to be honest that this DOWN-SELLS — Nabil volunteers a cheaper
 * equivalent — because that is a margin decision the owner must make knowingly.
 */
import { readFileSync, writeFileSync } from "node:fs";

const T: Record<string, { offerDayDeals: string; offerDayDealsHint: string }> = {
  en: { offerDayDeals: "Offer today's deals unprompted", offerDayDealsHint: "Off by default. When on, if a caller orders something that has a cheaper same-size deal running today, Nabil mentions it without being asked. It wins goodwill and costs margin — your call." },
  ar: { offerDayDeals: "اعرض عروض اليوم دون طلب", offerDayDealsHint: "مغلق افتراضيًا. عند التفعيل، إذا طلب المتصل صنفًا له عرض أرخص بالحجم نفسه اليوم، يذكره نبيل دون أن يُسأل. يكسب ودّ العميل ويقلّل هامش الربح — القرار لك." },
  bg: { offerDayDeals: "Предлагай днешните оферти без подкана", offerDayDealsHint: "Изключено по подразбиране. Когато е включено и клиентът поръча нещо, за което днес има по-евтина оферта в същия размер, Nabil я споменава сам. Печели добро отношение и струва марж — вие решавате." },
  ca: { offerDayDeals: "Oferir les ofertes d'avui sense que ho demanin", offerDayDealsHint: "Desactivat per defecte. Quan està actiu, si algú demana un producte que avui té una oferta més barata de la mateixa mida, en Nabil ho diu sense que li ho preguntin. Guanya simpatia i costa marge — tu decideixes." },
  cs: { offerDayDeals: "Nabízet dnešní akce bez vyzvání", offerDayDealsHint: "Ve výchozím stavu vypnuto. Když je zapnuto a volající si objedná něco, na co dnes běží levnější akce ve stejné velikosti, Nabil to sám zmíní. Získá to přízeň a stojí to marži — rozhodnutí je na vás." },
  da: { offerDayDeals: "Tilbyd dagens tilbud uopfordret", offerDayDealsHint: "Slået fra som standard. Når det er slået til, og en kunde bestiller noget, der har et billigere tilbud i samme størrelse i dag, nævner Nabil det uopfordret. Det giver goodwill og koster margin — dit valg." },
  de: { offerDayDeals: "Tagesangebote von sich aus nennen", offerDayDealsHint: "Standardmäßig aus. Wenn aktiviert und ein Anrufer etwas bestellt, für das es heute ein günstigeres Angebot in derselben Größe gibt, weist Nabil unaufgefordert darauf hin. Das schafft Sympathie und kostet Marge — Ihre Entscheidung." },
  el: { offerDayDeals: "Πρότεινε τις σημερινές προσφορές χωρίς ερώτηση", offerDayDealsHint: "Ανενεργό από προεπιλογή. Όταν είναι ενεργό και ο πελάτης παραγγείλει κάτι που έχει σήμερα φθηνότερη προσφορά στο ίδιο μέγεθος, ο Nabil το αναφέρει από μόνος του. Κερδίζει συμπάθεια και κοστίζει περιθώριο — δική σας απόφαση." },
  es: { offerDayDeals: "Ofrecer las ofertas de hoy sin que las pidan", offerDayDealsHint: "Desactivado por defecto. Cuando está activo, si alguien pide algo que hoy tiene una oferta más barata del mismo tamaño, Nabil lo menciona sin que se lo pregunten. Gana simpatía y cuesta margen — tú decides." },
  et: { offerDayDeals: "Paku tänaseid pakkumisi ise", offerDayDealsHint: "Vaikimisi väljas. Kui sisse lülitatud ja helistaja tellib midagi, millel on täna sama suurusega odavam pakkumine, mainib Nabil seda ise. Võidab poolehoidu ja maksab marginaali — otsus on teie." },
  fi: { offerDayDeals: "Tarjoa päivän tarjouksia oma-aloitteisesti", offerDayDealsHint: "Oletuksena pois. Kun päällä ja soittaja tilaa jotain, josta on tänään halvempi samankokoinen tarjous, Nabil mainitsee sen pyytämättä. Tuo hyvää tahtoa ja maksaa katetta — sinun päätöksesi." },
  fr: { offerDayDeals: "Proposer les offres du jour spontanément", offerDayDealsHint: "Désactivé par défaut. Lorsque c'est activé et qu'un client commande un article ayant aujourd'hui une offre moins chère de même taille, Nabil le signale sans qu'on le lui demande. Cela crée de la sympathie et coûte de la marge — à vous de voir." },
  he: { offerDayDeals: "הצע את מבצעי היום מיוזמתך", offerDayDealsHint: "כבוי כברירת מחדל. כשמופעל, אם מתקשר מזמין פריט שיש לו היום מבצע זול יותר באותו גודל, נביל יציין זאת מיוזמתו. זה קונה רצון טוב ועולה ברווחיות — ההחלטה שלך." },
  hi: { offerDayDeals: "आज के ऑफ़र बिना पूछे बताएँ", offerDayDealsHint: "डिफ़ॉल्ट रूप से बंद। चालू होने पर, अगर ग्राहक ऐसी चीज़ मँगाए जिसका आज उसी साइज़ में सस्ता ऑफ़र चल रहा हो, तो Nabil बिना पूछे बता देगा। इससे ग्राहक खुश होते हैं और मुनाफ़ा घटता है — फ़ैसला आपका।" },
  hr: { offerDayDeals: "Ponudi današnje akcije bez pitanja", offerDayDealsHint: "Isključeno prema zadanome. Kada je uključeno i pozivatelj naruči nešto što danas ima jeftiniju ponudu iste veličine, Nabil to sam spomene. Donosi naklonost i košta marže — vaša odluka." },
  hu: { offerDayDeals: "Ajánlja fel a mai akciókat magától", offerDayDealsHint: "Alapból kikapcsolva. Ha be van kapcsolva, és a hívó olyat rendel, amire ma ugyanabban a méretben olcsóbb ajánlat fut, Nabil magától szól. Jóindulatot szerez és árrésbe kerül — az Ön döntése." },
  id: { offerDayDeals: "Tawarkan promo hari ini tanpa diminta", offerDayDealsHint: "Nonaktif secara bawaan. Saat aktif, jika penelepon memesan sesuatu yang hari ini punya promo lebih murah dengan ukuran sama, Nabil menyebutkannya tanpa diminta. Menambah simpati dan mengurangi margin — keputusan Anda." },
  it: { offerDayDeals: "Proporre le offerte di oggi spontaneamente", offerDayDealsHint: "Disattivo di default. Quando è attivo e un cliente ordina qualcosa che oggi ha un'offerta più economica della stessa misura, Nabil lo segnala senza che glielo chiedano. Guadagna simpatia e costa margine — decidi tu." },
  ja: { offerDayDeals: "本日のお得情報を自分から伝える", offerDayDealsHint: "既定ではオフ。オンにすると、同じサイズでより安い本日のお得商品がある場合、Nabil が聞かれなくても案内します。好感度は上がり、利益率は下がります — ご判断ください。" },
  ko: { offerDayDeals: "오늘의 특가를 먼저 안내", offerDayDealsHint: "기본값은 꺼짐. 켜면 같은 크기로 더 저렴한 오늘의 특가가 있을 때 Nabil이 묻지 않아도 알려줍니다. 호감은 얻고 마진은 줄어듭니다 — 사장님 선택입니다." },
  lt: { offerDayDeals: "Siūlyti šiandienos pasiūlymus be raginimo", offerDayDealsHint: "Pagal numatytuosius išjungta. Įjungus, jei skambinantysis užsisako tai, kam šiandien galioja pigesnis to paties dydžio pasiūlymas, Nabil tai pamini pats. Laimi palankumą ir kainuoja maržos — jūsų sprendimas." },
  lv: { offerDayDeals: "Piedāvāt šodienas akcijas bez jautājuma", offerDayDealsHint: "Pēc noklusējuma izslēgts. Kad ieslēgts un zvanītājs pasūta ko tādu, kam šodien ir lētāks tāda paša izmēra piedāvājums, Nabil to pats piemin. Iegūst labvēlību un maksā maržu — jūsu izvēle." },
  nb: { offerDayDeals: "Tilby dagens tilbud uoppfordret", offerDayDealsHint: "Av som standard. Når det er på og en kunde bestiller noe som har et billigere tilbud i samme størrelse i dag, nevner Nabil det uoppfordret. Det gir goodwill og koster margin — ditt valg." },
  nl: { offerDayDeals: "Aanbiedingen van vandaag uit zichzelf noemen", offerDayDealsHint: "Standaard uit. Als dit aanstaat en een beller iets bestelt waarvoor vandaag een goedkopere aanbieding in hetzelfde formaat loopt, noemt Nabil die ongevraagd. Levert goodwill op en kost marge — jouw keuze." },
  pl: { offerDayDeals: "Proponuj dzisiejsze okazje bez pytania", offerDayDealsHint: "Domyślnie wyłączone. Gdy włączone, a dzwoniący zamawia coś, na co dziś jest tańsza oferta w tym samym rozmiarze, Nabil sam o niej wspomni. Zyskuje przychylność i kosztuje marżę — Twoja decyzja." },
  "pt-BR": { offerDayDeals: "Oferecer as promoções de hoje sem que peçam", offerDayDealsHint: "Desativado por padrão. Quando ativo, se alguém pedir algo que hoje tem uma promoção mais barata do mesmo tamanho, o Nabil menciona sem ser perguntado. Gera simpatia e custa margem — você decide." },
  pt: { offerDayDeals: "Oferecer as promoções de hoje sem que peçam", offerDayDealsHint: "Desativado por predefinição. Quando ativo, se alguém pedir algo que hoje tem uma promoção mais barata do mesmo tamanho, o Nabil menciona sem lhe perguntarem. Gera simpatia e custa margem — a decisão é sua." },
  ro: { offerDayDeals: "Propune ofertele de azi din proprie inițiativă", offerDayDealsHint: "Dezactivat implicit. Când e activ și apelantul comandă ceva ce are azi o ofertă mai ieftină la aceeași mărime, Nabil o menționează singur. Câștigă simpatie și costă marjă — decizia vă aparține." },
  ru: { offerDayDeals: "Предлагать акции дня без просьбы", offerDayDealsHint: "По умолчанию выключено. Когда включено и звонящий заказывает то, на что сегодня действует более дешёвое предложение того же размера, Nabil сам об этом скажет. Это располагает клиента и снижает маржу — решение за вами." },
  sk: { offerDayDeals: "Ponúkať dnešné akcie bez vyzvania", offerDayDealsHint: "Predvolene vypnuté. Keď je zapnuté a volajúci si objedná niečo, na čo dnes beží lacnejšia akcia v rovnakej veľkosti, Nabil to sám spomenie. Získa priazeň a stojí to maržu — rozhodnutie je na vás." },
  sl: { offerDayDeals: "Ponudi današnje akcije brez vprašanja", offerDayDealsHint: "Privzeto izklopljeno. Ko je vklopljeno in klicatelj naroči nekaj, za kar danes velja cenejša ponudba iste velikosti, Nabil to omeni sam. Prinese naklonjenost in stane maržo — vaša odločitev." },
  sr: { offerDayDeals: "Понуди данашње акције без питања", offerDayDealsHint: "Подразумевано искључено. Када је укључено и позивалац наручи нешто што данас има јефтинију понуду исте величине, Nabil то сам помене. Доноси наклоност и кошта марже — ваша одлука." },
  sv: { offerDayDeals: "Erbjud dagens erbjudanden självmant", offerDayDealsHint: "Av som standard. När det är på och en kund beställer något som i dag har ett billigare erbjudande i samma storlek nämner Nabil det självmant. Ger goodwill och kostar marginal — ditt val." },
  th: { offerDayDeals: "เสนอดีลของวันนี้โดยไม่ต้องถาม", offerDayDealsHint: "ปิดไว้เป็นค่าเริ่มต้น เมื่อเปิด หากลูกค้าสั่งสิ่งที่วันนี้มีดีลถูกกว่าในขนาดเดียวกัน Nabil จะบอกให้เองโดยไม่ต้องถาม ได้ใจลูกค้าแต่เสียกำไร — คุณเป็นคนตัดสินใจ" },
  tr: { offerDayDeals: "Bugünün fırsatlarını kendiliğinden söyle", offerDayDealsHint: "Varsayılan olarak kapalı. Açıkken, arayan kişi bugün aynı boyutta daha ucuz fırsatı olan bir ürün sipariş ederse Nabil bunu sorulmadan söyler. Müşteri memnuniyeti kazandırır, kârdan götürür — karar sizin." },
  uk: { offerDayDeals: "Пропонувати сьогоднішні акції без запиту", offerDayDealsHint: "Типово вимкнено. Коли ввімкнено і той, хто телефонує, замовляє щось, на що сьогодні діє дешевша пропозиція того самого розміру, Nabil скаже про неї сам. Здобуває прихильність і коштує маржі — вирішувати вам." },
  vi: { offerDayDeals: "Chủ động giới thiệu ưu đãi hôm nay", offerDayDealsHint: "Mặc định tắt. Khi bật, nếu khách gọi đặt món mà hôm nay có ưu đãi rẻ hơn cùng kích cỡ, Nabil sẽ chủ động nhắc. Được lòng khách nhưng giảm lợi nhuận — bạn quyết định." },
  zh: { offerDayDeals: "主动介绍今日优惠", offerDayDealsHint: "默认关闭。开启后，若来电者点的商品今天有同规格更便宜的优惠，Nabil 会主动告知。赢得好感但会减少利润——由您决定。" },
};

let changed = 0;
for (const [locale, vals] of Object.entries(T)) {
  const path = `src/messages/${locale}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  const cfg = json?.admin?.phoneOrderingPage?.config;
  if (!cfg) throw new Error(`${locale}: admin.phoneOrderingPage.config missing`);
  Object.assign(cfg, vals);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`Added offerDayDeals + hint to ${changed} locales.`);
