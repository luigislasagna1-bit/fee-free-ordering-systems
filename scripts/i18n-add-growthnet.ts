/** i18n: GrowthNet tab framing strings × 38. "GrowthNet" itself is a brand
 *  name and stays untranslated everywhere.
 *    admin.growthnet.{tagline,heroBody,savingsBadge,individualValue,
 *                     ctaSubscribe,activeBanner,includedViaBundle,
 *                     enableIndividually,soldSeparately,futureNote,
 *                     whatsInside,moreChannels}
 *    admin.featureLocked.growthNetHint
 *    npx tsx scripts/i18n-add-growthnet.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.growthnet.tagline": {
    en: "Fee Free's Restaurant Growth System", fr: "Le système de croissance pour restaurants de Fee Free", es: "El sistema de crecimiento para restaurantes de Fee Free", it: "Il sistema di crescita per ristoranti di Fee Free", pt: "O sistema de crescimento para restaurantes da Fee Free", "pt-BR": "O sistema de crescimento para restaurantes da Fee Free",
    de: "Das Restaurant-Wachstumssystem von Fee Free", nl: "Het restaurantgroeisysteem van Fee Free", ro: "Sistemul de creștere pentru restaurante de la Fee Free", sv: "Fee Frees tillväxtsystem för restauranger", da: "Fee Frees vækstsystem til restauranter", nb: "Fee Frees vekstsystem for restauranter",
    fi: "Fee Freen ravintoloiden kasvujärjestelmä", pl: "System rozwoju restauracji od Fee Free", cs: "Růstový systém pro restaurace od Fee Free", sk: "Rastový systém pre reštaurácie od Fee Free", hu: "A Fee Free éttermi növekedési rendszere", el: "Το σύστημα ανάπτυξης εστιατορίων της Fee Free",
    bg: "Системата за растеж на ресторанти на Fee Free", hr: "Sustav rasta restorana tvrtke Fee Free", sr: "Систем раста ресторана компаније Fee Free", sl: "Sistem rasti restavracij podjetja Fee Free", et: "Fee Free restoranide kasvusüsteem", lv: "Fee Free restorānu izaugsmes sistēma",
    lt: "„Fee Free“ restoranų augimo sistema", tr: "Fee Free'nin Restoran Büyüme Sistemi", ru: "Система роста ресторанов от Fee Free", uk: "Система зростання ресторанів від Fee Free", ca: "El sistema de creixement per a restaurants de Fee Free", id: "Sistem Pertumbuhan Restoran dari Fee Free",
    vi: "Hệ thống tăng trưởng nhà hàng của Fee Free", th: "ระบบการเติบโตของร้านอาหารจาก Fee Free", zh: "Fee Free 餐厅增长系统", ja: "Fee Free のレストラン成長システム", ko: "Fee Free의 레스토랑 성장 시스템", ar: "نظام نمو المطاعم من Fee Free", he: "מערכת הצמיחה למסעדות של Fee Free", hi: "Fee Free का रेस्तरां ग्रोथ सिस्टम",
  },
  "admin.growthnet.heroBody": {
    en: "Every paid marketing, retention and customer-acquisition tool in one bundle — at one discounted price. We recommend it to maximize growth and sales for your restaurant.",
    fr: "Tous les outils payants de marketing, de fidélisation et d'acquisition de clients dans une seule offre groupée — à un prix réduit. Nous la recommandons pour maximiser la croissance et les ventes de votre restaurant.",
    es: "Todas las herramientas de pago de marketing, retención y captación de clientes en un solo paquete, a un precio con descuento. Lo recomendamos para maximizar el crecimiento y las ventas de tu restaurante.",
    it: "Tutti gli strumenti a pagamento di marketing, fidelizzazione e acquisizione clienti in un unico pacchetto — a un prezzo scontato. Lo consigliamo per massimizzare crescita e vendite del tuo ristorante.",
    pt: "Todas as ferramentas pagas de marketing, retenção e aquisição de clientes num único pacote — a um preço com desconto. Recomendamo-lo para maximizar o crescimento e as vendas do seu restaurante.",
    "pt-BR": "Todas as ferramentas pagas de marketing, retenção e aquisição de clientes em um único pacote — a um preço com desconto. Recomendamos para maximizar o crescimento e as vendas do seu restaurante.",
    de: "Alle kostenpflichtigen Tools für Marketing, Kundenbindung und Neukundengewinnung in einem Paket — zu einem vergünstigten Preis. Wir empfehlen es, um Wachstum und Umsatz Ihres Restaurants zu maximieren.",
    nl: "Alle betaalde tools voor marketing, retentie en klantenwerving in één bundel — tegen één gereduceerde prijs. We raden het aan om de groei en omzet van je restaurant te maximaliseren.",
    ro: "Toate instrumentele plătite de marketing, fidelizare și atragere de clienți într-un singur pachet — la un preț redus. Îl recomandăm pentru a maximiza creșterea și vânzările restaurantului tău.",
    sv: "Alla betalda verktyg för marknadsföring, kundlojalitet och kundanskaffning i ett paket — till ett rabatterat pris. Vi rekommenderar det för att maximera din restaurangs tillväxt och försäljning.",
    da: "Alle betalte værktøjer til marketing, fastholdelse og kundetilgang i én pakke — til én rabatteret pris. Vi anbefaler den for at maksimere din restaurants vækst og salg.",
    nb: "Alle betalte verktøy for markedsføring, kundelojalitet og kundeanskaffelse i én pakke — til én rabattert pris. Vi anbefaler den for å maksimere restaurantens vekst og salg.",
    fi: "Kaikki maksulliset markkinoinnin, asiakaspysyvyyden ja asiakashankinnan työkalut yhdessä paketissa — yhteen alennettuun hintaan. Suosittelemme sitä ravintolasi kasvun ja myynnin maksimoimiseksi.",
    pl: "Wszystkie płatne narzędzia marketingu, utrzymania i pozyskiwania klientów w jednym pakiecie — w obniżonej cenie. Polecamy go, aby zmaksymalizować wzrost i sprzedaż Twojej restauracji.",
    cs: "Všechny placené nástroje pro marketing, udržení a získávání zákazníků v jednom balíčku — za zvýhodněnou cenu. Doporučujeme ho pro maximalizaci růstu a tržeb vaší restaurace.",
    sk: "Všetky platené nástroje pre marketing, udržanie a získavanie zákazníkov v jednom balíku — za zvýhodnenú cenu. Odporúčame ho na maximalizáciu rastu a tržieb vašej reštaurácie.",
    hu: "Minden fizetős marketing-, megtartási és ügyfélszerzési eszköz egyetlen csomagban — kedvezményes áron. Ajánljuk éttermed növekedésének és eladásainak maximalizálásához.",
    el: "Όλα τα επί πληρωμή εργαλεία μάρκετινγκ, διατήρησης και απόκτησης πελατών σε ένα πακέτο — σε μειωμένη τιμή. Το συνιστούμε για να μεγιστοποιήσετε την ανάπτυξη και τις πωλήσεις του εστιατορίου σας.",
    bg: "Всички платени инструменти за маркетинг, задържане и привличане на клиенти в един пакет — на намалена цена. Препоръчваме го, за да увеличите максимално растежа и продажбите на вашия ресторант.",
    hr: "Svi plaćeni alati za marketing, zadržavanje i privlačenje kupaca u jednom paketu — po sniženoj cijeni. Preporučujemo ga za maksimalan rast i prodaju vašeg restorana.",
    sr: "Сви плаћени алати за маркетинг, задржавање и привлачење купаца у једном пакету — по сниженој цени. Препоручујемо га за максималан раст и продају вашег ресторана.",
    sl: "Vsa plačljiva orodja za trženje, zadrževanje in pridobivanje strank v enem paketu — po znižani ceni. Priporočamo ga za čim večjo rast in prodajo vaše restavracije.",
    et: "Kõik tasulised turunduse, hoidmise ja klientide hankimise tööriistad ühes paketis — soodushinnaga. Soovitame seda teie restorani kasvu ja müügi maksimeerimiseks.",
    lv: "Visi maksas mārketinga, noturēšanas un klientu piesaistes rīki vienā komplektā — par atlaides cenu. Mēs to iesakām, lai maksimāli palielinātu jūsu restorāna izaugsmi un pārdošanu.",
    lt: "Visi mokami rinkodaros, išlaikymo ir klientų pritraukimo įrankiai viename rinkinyje — už nuolaidos kainą. Rekomenduojame jį, kad maksimaliai padidintumėte savo restorano augimą ir pardavimus.",
    tr: "Tüm ücretli pazarlama, müşteri tutma ve müşteri kazanma araçları tek pakette — indirimli tek fiyata. Restoranınızın büyümesini ve satışlarını en üst düzeye çıkarmak için öneriyoruz.",
    ru: "Все платные инструменты маркетинга, удержания и привлечения клиентов в одном наборе — по сниженной цене. Рекомендуем его, чтобы максимизировать рост и продажи вашего ресторана.",
    uk: "Усі платні інструменти маркетингу, утримання та залучення клієнтів в одному пакеті — за зниженою ціною. Рекомендуємо його, щоб максимізувати зростання та продажі вашого ресторану.",
    ca: "Totes les eines de pagament de màrqueting, retenció i captació de clients en un sol paquet — a un preu rebaixat. El recomanem per maximitzar el creixement i les vendes del teu restaurant.",
    id: "Semua alat berbayar untuk pemasaran, retensi, dan akuisisi pelanggan dalam satu paket — dengan satu harga diskon. Kami merekomendasikannya untuk memaksimalkan pertumbuhan dan penjualan restoran Anda.",
    vi: "Tất cả công cụ trả phí về tiếp thị, giữ chân và thu hút khách hàng trong một gói — với một mức giá ưu đãi. Chúng tôi khuyên dùng để tối đa hóa tăng trưởng và doanh số cho nhà hàng của bạn.",
    th: "เครื่องมือการตลาด การรักษาลูกค้า และการหาลูกค้าใหม่แบบชำระเงินทั้งหมดในแพ็กเกจเดียว — ในราคาส่วนลดเดียว เราแนะนำเพื่อเพิ่มการเติบโตและยอดขายของร้านคุณให้สูงสุด",
    zh: "所有付费营销、客户留存和获客工具集于一个套餐——一个优惠价。我们推荐它以最大化您餐厅的增长和销售。",
    ja: "マーケティング・リピーター獲得・新規顧客獲得の有料ツールをすべて1つのバンドルに — 割引価格でご提供。レストランの成長と売上を最大化するためにおすすめです。",
    ko: "마케팅, 고객 유지, 신규 고객 확보를 위한 모든 유료 도구를 하나의 번들로 — 할인된 가격에. 레스토랑의 성장과 매출을 극대화하기 위해 추천합니다.",
    ar: "جميع أدوات التسويق والاحتفاظ بالعملاء واكتساب عملاء جدد المدفوعة في حزمة واحدة — بسعر مخفّض واحد. نوصي بها لتعظيم نمو ومبيعات مطعمك.",
    he: "כל כלי השיווק, השימור וגיוס הלקוחות בתשלום בחבילה אחת — במחיר מוזל אחד. אנו ממליצים עליה כדי למקסם את הצמיחה והמכירות של המסעדה שלך.",
    hi: "मार्केटिंग, ग्राहक प्रतिधारण और नए ग्राहक प्राप्ति के सभी सशुल्क टूल एक बंडल में — एक रियायती मूल्य पर। हम आपके रेस्तरां की वृद्धि और बिक्री को अधिकतम करने के लिए इसकी सलाह देते हैं।",
  },
  "admin.growthnet.savingsBadge": {
    en: "Save {percent}%", fr: "Économisez {percent} %", es: "Ahorra un {percent}%", it: "Risparmia il {percent}%", pt: "Poupe {percent}%", "pt-BR": "Economize {percent}%",
    de: "{percent}% sparen", nl: "Bespaar {percent}%", ro: "Economisești {percent}%", sv: "Spara {percent}%", da: "Spar {percent}%", nb: "Spar {percent}%",
    fi: "Säästä {percent} %", pl: "Oszczędź {percent}%", cs: "Ušetřete {percent} %", sk: "Ušetrite {percent} %", hu: "Spórolj {percent}%-ot", el: "Εξοικονομήστε {percent}%",
    bg: "Спестете {percent}%", hr: "Uštedite {percent}%", sr: "Уштедите {percent}%", sl: "Prihranite {percent}%", et: "Säästa {percent}%", lv: "Ietaupiet {percent}%",
    lt: "Sutaupykite {percent}%", tr: "%{percent} tasarruf edin", ru: "Экономия {percent}%", uk: "Заощаджуйте {percent}%", ca: "Estalvia un {percent}%", id: "Hemat {percent}%",
    vi: "Tiết kiệm {percent}%", th: "ประหยัด {percent}%", zh: "节省 {percent}%", ja: "{percent}%お得", ko: "{percent}% 절약", ar: "وفّر {percent}%", he: "חסוך {percent}%", hi: "{percent}% बचाएं",
  },
  "admin.growthnet.individualValue": {
    en: "{amount} value if purchased individually", fr: "Valeur de {amount} si acheté séparément", es: "Valor de {amount} si se compra por separado", it: "Valore di {amount} se acquistati singolarmente", pt: "Valor de {amount} se comprado individualmente", "pt-BR": "Valor de {amount} se comprado individualmente",
    de: "{amount} Wert bei Einzelkauf", nl: "{amount} waarde bij losse aanschaf", ro: "Valoare de {amount} dacă sunt cumpărate individual", sv: "Värde {amount} vid köp var för sig", da: "Værdi på {amount} ved køb enkeltvis", nb: "Verdi på {amount} ved kjøp enkeltvis",
    fi: "{amount} arvo erikseen ostettuna", pl: "Wartość {amount} przy zakupie osobno", cs: "Hodnota {amount} při samostatném nákupu", sk: "Hodnota {amount} pri samostatnom nákupe", hu: "{amount} érték külön-külön megvásárolva", el: "Αξία {amount} αν αγοραστούν μεμονωμένα",
    bg: "Стойност {amount} при закупуване поотделно", hr: "Vrijednost od {amount} pri pojedinačnoj kupnji", sr: "Вредност од {amount} при појединачној куповини", sl: "Vrednost {amount} pri posamičnem nakupu", et: "{amount} väärtus eraldi ostes", lv: "{amount} vērtība, pērkot atsevišķi",
    lt: "{amount} vertė perkant atskirai", tr: "Tek tek satın alındığında {amount} değerinde", ru: "Стоимость {amount} при покупке по отдельности", uk: "Вартість {amount} у разі купівлі окремо", ca: "Valor de {amount} si es compra per separat", id: "Senilai {amount} jika dibeli satuan",
    vi: "Trị giá {amount} nếu mua riêng lẻ", th: "มูลค่า {amount} หากซื้อแยกชิ้น", zh: "单独购买价值 {amount}", ja: "個別購入なら{amount}相当", ko: "개별 구매 시 {amount} 상당", ar: "بقيمة {amount} عند الشراء بشكل منفصل", he: "בשווי {amount} ברכישה בנפרד", hi: "अलग-अलग खरीदने पर {amount} का मूल्य",
  },
  "admin.growthnet.ctaSubscribe": {
    en: "Get GrowthNet", fr: "Obtenir GrowthNet", es: "Obtener GrowthNet", it: "Ottieni GrowthNet", pt: "Obter o GrowthNet", "pt-BR": "Obter o GrowthNet",
    de: "GrowthNet holen", nl: "GrowthNet nemen", ro: "Obține GrowthNet", sv: "Skaffa GrowthNet", da: "Få GrowthNet", nb: "Skaff GrowthNet",
    fi: "Hanki GrowthNet", pl: "Zdobądź GrowthNet", cs: "Získat GrowthNet", sk: "Získať GrowthNet", hu: "GrowthNet beszerzése", el: "Αποκτήστε το GrowthNet",
    bg: "Вземете GrowthNet", hr: "Nabavite GrowthNet", sr: "Набавите GrowthNet", sl: "Pridobite GrowthNet", et: "Hangi GrowthNet", lv: "Iegūt GrowthNet",
    lt: "Gauti „GrowthNet“", tr: "GrowthNet'i edinin", ru: "Получить GrowthNet", uk: "Отримати GrowthNet", ca: "Obtén GrowthNet", id: "Dapatkan GrowthNet",
    vi: "Nhận GrowthNet", th: "รับ GrowthNet", zh: "获取 GrowthNet", ja: "GrowthNet を入手", ko: "GrowthNet 시작하기", ar: "احصل على GrowthNet", he: "קבל את GrowthNet", hi: "GrowthNet प्राप्त करें",
  },
  "admin.growthnet.activeBanner": {
    en: "GrowthNet is active — every tool below is unlocked.", fr: "GrowthNet est actif — tous les outils ci-dessous sont débloqués.", es: "GrowthNet está activo: todas las herramientas de abajo están desbloqueadas.", it: "GrowthNet è attivo — tutti gli strumenti qui sotto sono sbloccati.", pt: "O GrowthNet está ativo — todas as ferramentas abaixo estão desbloqueadas.", "pt-BR": "O GrowthNet está ativo — todas as ferramentas abaixo estão desbloqueadas.",
    de: "GrowthNet ist aktiv — alle Tools unten sind freigeschaltet.", nl: "GrowthNet is actief — alle tools hieronder zijn ontgrendeld.", ro: "GrowthNet este activ — toate instrumentele de mai jos sunt deblocate.", sv: "GrowthNet är aktivt — alla verktyg nedan är upplåsta.", da: "GrowthNet er aktivt — alle værktøjer nedenfor er låst op.", nb: "GrowthNet er aktivt — alle verktøyene nedenfor er låst opp.",
    fi: "GrowthNet on käytössä — kaikki alla olevat työkalut on avattu.", pl: "GrowthNet jest aktywny — wszystkie narzędzia poniżej są odblokowane.", cs: "GrowthNet je aktivní — všechny nástroje níže jsou odemčené.", sk: "GrowthNet je aktívny — všetky nástroje nižšie sú odomknuté.", hu: "A GrowthNet aktív — az összes alábbi eszköz fel van oldva.", el: "Το GrowthNet είναι ενεργό — όλα τα παρακάτω εργαλεία είναι ξεκλείδωτα.",
    bg: "GrowthNet е активен — всички инструменти по-долу са отключени.", hr: "GrowthNet je aktivan — svi alati u nastavku su otključani.", sr: "GrowthNet је активан — сви алати испод су откључани.", sl: "GrowthNet je aktiven — vsa spodnja orodja so odklenjena.", et: "GrowthNet on aktiivne — kõik allolevad tööriistad on avatud.", lv: "GrowthNet ir aktīvs — visi tālāk norādītie rīki ir atbloķēti.",
    lt: "„GrowthNet“ aktyvus — visi toliau pateikti įrankiai atrakinti.", tr: "GrowthNet etkin — aşağıdaki tüm araçların kilidi açık.", ru: "GrowthNet активен — все инструменты ниже разблокированы.", uk: "GrowthNet активний — усі інструменти нижче розблоковано.", ca: "GrowthNet està actiu — totes les eines de sota estan desbloquejades.", id: "GrowthNet aktif — semua alat di bawah ini terbuka.",
    vi: "GrowthNet đang hoạt động — mọi công cụ bên dưới đã được mở khóa.", th: "GrowthNet ใช้งานอยู่ — เครื่องมือทั้งหมดด้านล่างปลดล็อกแล้ว", zh: "GrowthNet 已激活——以下所有工具均已解锁。", ja: "GrowthNet は有効です — 以下のすべてのツールが利用可能です。", ko: "GrowthNet이 활성화되어 있습니다 — 아래 모든 도구가 잠금 해제되었습니다.", ar: "GrowthNet مفعّل — جميع الأدوات أدناه غير مقفلة.", he: "GrowthNet פעיל — כל הכלים שלמטה פתוחים.", hi: "GrowthNet सक्रिय है — नीचे दिए सभी टूल अनलॉक हैं।",
  },
  "admin.growthnet.includedViaBundle": {
    en: "Included in GrowthNet", fr: "Inclus dans GrowthNet", es: "Incluido en GrowthNet", it: "Incluso in GrowthNet", pt: "Incluído no GrowthNet", "pt-BR": "Incluído no GrowthNet",
    de: "In GrowthNet enthalten", nl: "Inbegrepen in GrowthNet", ro: "Inclus în GrowthNet", sv: "Ingår i GrowthNet", da: "Inkluderet i GrowthNet", nb: "Inkludert i GrowthNet",
    fi: "Sisältyy GrowthNetiin", pl: "Zawarte w GrowthNet", cs: "Součást GrowthNet", sk: "Súčasť GrowthNet", hu: "A GrowthNet része", el: "Περιλαμβάνεται στο GrowthNet",
    bg: "Включено в GrowthNet", hr: "Uključeno u GrowthNet", sr: "Укључено у GrowthNet", sl: "Vključeno v GrowthNet", et: "Sisaldub GrowthNetis", lv: "Iekļauts GrowthNet",
    lt: "Įtraukta į „GrowthNet“", tr: "GrowthNet'e dahil", ru: "Входит в GrowthNet", uk: "Входить до GrowthNet", ca: "Inclòs a GrowthNet", id: "Termasuk dalam GrowthNet",
    vi: "Bao gồm trong GrowthNet", th: "รวมอยู่ใน GrowthNet", zh: "包含在 GrowthNet 中", ja: "GrowthNet に含まれます", ko: "GrowthNet에 포함됨", ar: "مضمّن في GrowthNet", he: "כלול ב-GrowthNet", hi: "GrowthNet में शामिल",
  },
  "admin.growthnet.enableIndividually": {
    en: "Enable individually", fr: "Activer séparément", es: "Activar por separado", it: "Attiva singolarmente", pt: "Ativar individualmente", "pt-BR": "Ativar individualmente",
    de: "Einzeln aktivieren", nl: "Los activeren", ro: "Activează individual", sv: "Aktivera separat", da: "Aktivér enkeltvis", nb: "Aktiver enkeltvis",
    fi: "Ota käyttöön erikseen", pl: "Włącz osobno", cs: "Aktivovat samostatně", sk: "Aktivovať samostatne", hu: "Aktiválás külön", el: "Ενεργοποίηση μεμονωμένα",
    bg: "Активиране поотделно", hr: "Aktiviraj pojedinačno", sr: "Активирај појединачно", sl: "Aktiviraj posamično", et: "Aktiveeri eraldi", lv: "Aktivizēt atsevišķi",
    lt: "Įjungti atskirai", tr: "Tek tek etkinleştir", ru: "Включить отдельно", uk: "Увімкнути окремо", ca: "Activa per separat", id: "Aktifkan satuan",
    vi: "Bật riêng lẻ", th: "เปิดใช้แยกรายการ", zh: "单独启用", ja: "個別に有効化", ko: "개별 사용 설정", ar: "تفعيل بشكل منفصل", he: "הפעל בנפרד", hi: "अलग से सक्षम करें",
  },
  "admin.growthnet.soldSeparately": {
    en: "Sold separately", fr: "Vendu séparément", es: "Se vende por separado", it: "Venduto separatamente", pt: "Vendido separadamente", "pt-BR": "Vendido separadamente",
    de: "Separat erhältlich", nl: "Apart verkrijgbaar", ro: "Vândut separat", sv: "Säljs separat", da: "Sælges separat", nb: "Selges separat",
    fi: "Myydään erikseen", pl: "Sprzedawane osobno", cs: "Prodáváno samostatně", sk: "Predávané samostatne", hu: "Külön kapható", el: "Πωλείται ξεχωριστά",
    bg: "Продава се отделно", hr: "Prodaje se zasebno", sr: "Продаје се засебно", sl: "Naprodaj ločeno", et: "Müüakse eraldi", lv: "Pārdod atsevišķi",
    lt: "Parduodama atskirai", tr: "Ayrı satılır", ru: "Продаётся отдельно", uk: "Продається окремо", ca: "Es ven per separat", id: "Dijual terpisah",
    vi: "Bán riêng", th: "จำหน่ายแยกต่างหาก", zh: "单独出售", ja: "別売り", ko: "별도 판매", ar: "يُباع بشكل منفصل", he: "נמכר בנפרד", hi: "अलग से बेचा जाता है",
  },
  "admin.growthnet.futureNote": {
    en: "New growth tools are added to GrowthNet as we ship them — subscribers get every new addition automatically, at no extra cost.",
    fr: "De nouveaux outils de croissance sont ajoutés à GrowthNet au fil de leur sortie — les abonnés reçoivent automatiquement chaque nouveauté, sans frais supplémentaires.",
    es: "Se añaden nuevas herramientas de crecimiento a GrowthNet a medida que las lanzamos: los suscriptores reciben cada novedad automáticamente, sin coste adicional.",
    it: "Nuovi strumenti di crescita vengono aggiunti a GrowthNet man mano che li rilasciamo — gli abbonati ricevono ogni novità automaticamente, senza costi aggiuntivi.",
    pt: "Novas ferramentas de crescimento são adicionadas ao GrowthNet à medida que as lançamos — os subscritores recebem cada novidade automaticamente, sem custo extra.",
    "pt-BR": "Novas ferramentas de crescimento são adicionadas ao GrowthNet conforme as lançamos — os assinantes recebem cada novidade automaticamente, sem custo extra.",
    de: "Neue Wachstums-Tools werden laufend zu GrowthNet hinzugefügt — Abonnenten erhalten jede Neuerung automatisch, ohne Aufpreis.",
    nl: "Nieuwe groeitools worden aan GrowthNet toegevoegd zodra we ze uitbrengen — abonnees krijgen elke toevoeging automatisch, zonder extra kosten.",
    ro: "Instrumente noi de creștere sunt adăugate în GrowthNet pe măsură ce le lansăm — abonații primesc automat fiecare noutate, fără costuri suplimentare.",
    sv: "Nya tillväxtverktyg läggs till i GrowthNet allteftersom vi lanserar dem — prenumeranter får varje nyhet automatiskt, utan extra kostnad.",
    da: "Nye vækstværktøjer føjes til GrowthNet, efterhånden som vi udgiver dem — abonnenter får hver nyhed automatisk, uden ekstra omkostninger.",
    nb: "Nye vekstverktøy legges til i GrowthNet etter hvert som vi lanserer dem — abonnenter får hver nyhet automatisk, uten ekstra kostnad.",
    fi: "Uusia kasvutyökaluja lisätään GrowthNetiin sitä mukaa kuin julkaisemme niitä — tilaajat saavat jokaisen uutuuden automaattisesti ilman lisämaksua.",
    pl: "Nowe narzędzia rozwoju są dodawane do GrowthNet w miarę ich wydawania — subskrybenci otrzymują każdą nowość automatycznie, bez dodatkowych opłat.",
    cs: "Nové růstové nástroje přidáváme do GrowthNet průběžně — předplatitelé dostávají každou novinku automaticky a bez příplatku.",
    sk: "Nové rastové nástroje pridávame do GrowthNet priebežne — predplatitelia dostávajú každú novinku automaticky a bez príplatku.",
    hu: "Új növekedési eszközök kerülnek a GrowthNetbe, ahogy kiadjuk őket — az előfizetők minden újdonságot automatikusan, felár nélkül megkapnak.",
    el: "Νέα εργαλεία ανάπτυξης προστίθενται στο GrowthNet καθώς τα κυκλοφορούμε — οι συνδρομητές λαμβάνουν κάθε νέα προσθήκη αυτόματα, χωρίς επιπλέον κόστος.",
    bg: "Нови инструменти за растеж се добавят към GrowthNet с пускането им — абонатите получават всяка новост автоматично, без допълнително заплащане.",
    hr: "Novi alati za rast dodaju se u GrowthNet kako ih objavljujemo — pretplatnici svaku novost dobivaju automatski, bez dodatnih troškova.",
    sr: "Нови алати за раст додају се у GrowthNet како их објављујемо — претплатници сваку новину добијају аутоматски, без додатних трошкова.",
    sl: "Nova orodja za rast dodajamo v GrowthNet sproti — naročniki vsako novost prejmejo samodejno, brez doplačila.",
    et: "Uusi kasvutööriistu lisatakse GrowthNetti jooksvalt — tellijad saavad iga uuenduse automaatselt, lisatasuta.",
    lv: "Jauni izaugsmes rīki tiek pievienoti GrowthNet, tiklīdz tos izlaižam — abonenti katru jaunumu saņem automātiski, bez papildu maksas.",
    lt: "Nauji augimo įrankiai į „GrowthNet“ pridedami juos išleidus — prenumeratoriai kiekvieną naujovę gauna automatiškai, be papildomo mokesčio.",
    tr: "Yeni büyüme araçları yayınladıkça GrowthNet'e eklenir — aboneler her yeniliği otomatik olarak, ek ücret ödemeden alır.",
    ru: "Новые инструменты роста добавляются в GrowthNet по мере выпуска — подписчики получают каждое новшество автоматически и без доплаты.",
    uk: "Нові інструменти зростання додаються до GrowthNet у міру випуску — підписники отримують кожну новинку автоматично, без додаткової плати.",
    ca: "S'afegeixen noves eines de creixement a GrowthNet a mesura que les llancem — els subscriptors reben cada novetat automàticament, sense cost addicional.",
    id: "Alat pertumbuhan baru ditambahkan ke GrowthNet saat kami merilisnya — pelanggan mendapatkan setiap tambahan baru secara otomatis, tanpa biaya ekstra.",
    vi: "Các công cụ tăng trưởng mới được thêm vào GrowthNet khi chúng tôi ra mắt — người đăng ký tự động nhận mọi bổ sung mới mà không tốn thêm phí.",
    th: "เครื่องมือการเติบโตใหม่ๆ จะถูกเพิ่มเข้า GrowthNet เมื่อเราเปิดตัว — สมาชิกจะได้รับทุกฟีเจอร์ใหม่โดยอัตโนมัติ โดยไม่มีค่าใช้จ่ายเพิ่มเติม",
    zh: "新的增长工具会随发布持续加入 GrowthNet——订阅者自动获得每项新增功能，无需额外付费。",
    ja: "新しい成長ツールはリリースのたびに GrowthNet に追加されます — 加入者は追加料金なしで自動的に利用できます。",
    ko: "새로운 성장 도구는 출시되는 대로 GrowthNet에 추가됩니다 — 구독자는 추가 비용 없이 모든 신규 기능을 자동으로 받습니다.",
    ar: "تُضاف أدوات نمو جديدة إلى GrowthNet فور إطلاقها — يحصل المشتركون على كل إضافة جديدة تلقائيًا دون أي تكلفة إضافية.",
    he: "כלי צמיחה חדשים מתווספים ל-GrowthNet עם השקתם — מנויים מקבלים כל תוספת חדשה אוטומטית, ללא עלות נוספת.",
    hi: "नए ग्रोथ टूल जारी होते ही GrowthNet में जुड़ते हैं — सदस्यों को हर नई सुविधा स्वचालित रूप से, बिना अतिरिक्त लागत के मिलती है।",
  },
  "admin.growthnet.whatsInside": {
    en: "What's inside", fr: "Ce qui est inclus", es: "Qué incluye", it: "Cosa include", pt: "O que está incluído", "pt-BR": "O que está incluído",
    de: "Das ist enthalten", nl: "Wat zit erin", ro: "Ce conține", sv: "Vad som ingår", da: "Hvad er inkluderet", nb: "Hva som er inkludert",
    fi: "Mitä sisältyy", pl: "Co zawiera", cs: "Co obsahuje", sk: "Čo obsahuje", hu: "Mit tartalmaz", el: "Τι περιλαμβάνει",
    bg: "Какво включва", hr: "Što uključuje", sr: "Шта укључује", sl: "Kaj vsebuje", et: "Mida sisaldab", lv: "Kas iekļauts",
    lt: "Kas viduje", tr: "İçinde neler var", ru: "Что входит", uk: "Що всередині", ca: "Què inclou", id: "Apa saja isinya",
    vi: "Bao gồm những gì", th: "มีอะไรอยู่ข้างใน", zh: "包含内容", ja: "含まれるもの", ko: "포함된 항목", ar: "ماذا يتضمن", he: "מה כלול", hi: "इसमें क्या शामिल है",
  },
  "admin.growthnet.moreChannels": {
    en: "More growth channels", fr: "Autres canaux de croissance", es: "Más canales de crecimiento", it: "Altri canali di crescita", pt: "Mais canais de crescimento", "pt-BR": "Mais canais de crescimento",
    de: "Weitere Wachstumskanäle", nl: "Meer groeikanalen", ro: "Mai multe canale de creștere", sv: "Fler tillväxtkanaler", da: "Flere vækstkanaler", nb: "Flere vekstkanaler",
    fi: "Lisää kasvukanavia", pl: "Więcej kanałów rozwoju", cs: "Další růstové kanály", sk: "Ďalšie rastové kanály", hu: "További növekedési csatornák", el: "Περισσότερα κανάλια ανάπτυξης",
    bg: "Още канали за растеж", hr: "Više kanala rasta", sr: "Још канала раста", sl: "Več kanalov rasti", et: "Veel kasvukanaleid", lv: "Vairāk izaugsmes kanālu",
    lt: "Daugiau augimo kanalų", tr: "Daha fazla büyüme kanalı", ru: "Другие каналы роста", uk: "Інші канали зростання", ca: "Més canals de creixement", id: "Saluran pertumbuhan lainnya",
    vi: "Các kênh tăng trưởng khác", th: "ช่องทางการเติบโตเพิ่มเติม", zh: "更多增长渠道", ja: "その他の成長チャネル", ko: "더 많은 성장 채널", ar: "قنوات نمو إضافية", he: "ערוצי צמיחה נוספים", hi: "अन्य ग्रोथ चैनल",
  },
  "admin.featureLocked.growthNetHint": {
    en: "Or unlock every marketing tool at once — at a discount — with",
    fr: "Ou débloquez tous les outils marketing d'un coup — à prix réduit — avec",
    es: "O desbloquea todas las herramientas de marketing a la vez, con descuento, con",
    it: "Oppure sblocca tutti gli strumenti di marketing in una volta — a prezzo scontato — con",
    pt: "Ou desbloqueie todas as ferramentas de marketing de uma vez — com desconto — com o",
    "pt-BR": "Ou desbloqueie todas as ferramentas de marketing de uma vez — com desconto — com o",
    de: "Oder schalten Sie alle Marketing-Tools auf einmal frei — vergünstigt — mit",
    nl: "Of ontgrendel alle marketingtools in één keer — met korting — via",
    ro: "Sau deblochează toate instrumentele de marketing deodată — cu reducere — cu",
    sv: "Eller lås upp alla marknadsföringsverktyg på en gång — till rabatterat pris — med",
    da: "Eller lås alle marketingværktøjer op på én gang — med rabat — med",
    nb: "Eller lås opp alle markedsføringsverktøyene på én gang — med rabatt — med",
    fi: "Tai avaa kaikki markkinointityökalut kerralla — alennettuun hintaan —",
    pl: "Lub odblokuj wszystkie narzędzia marketingowe naraz — w obniżonej cenie — dzięki",
    cs: "Nebo odemkněte všechny marketingové nástroje najednou — se slevou — s",
    sk: "Alebo odomknite všetky marketingové nástroje naraz — so zľavou — s",
    hu: "Vagy oldd fel az összes marketingeszközt egyszerre — kedvezménnyel — a",
    el: "Ή ξεκλειδώστε όλα τα εργαλεία μάρκετινγκ με τη μία — με έκπτωση — με το",
    bg: "Или отключете всички маркетингови инструменти наведнъж — с отстъпка — чрез",
    hr: "Ili otključajte sve marketinške alate odjednom — uz popust — uz",
    sr: "Или откључајте све маркетиншке алате одједном — уз попуст — уз",
    sl: "Ali pa odklenite vsa orodja za trženje naenkrat — s popustom — z",
    et: "Või ava kõik turundustööriistad korraga — soodushinnaga —",
    lv: "Vai atbloķējiet visus mārketinga rīkus uzreiz — ar atlaidi — ar",
    lt: "Arba atrakinkite visus rinkodaros įrankius iš karto — su nuolaida — su",
    tr: "Ya da tüm pazarlama araçlarının kilidini tek seferde — indirimli olarak — açın:",
    ru: "Или разблокируйте все маркетинговые инструменты сразу — со скидкой — с",
    uk: "Або розблокуйте всі маркетингові інструменти одразу — зі знижкою — з",
    ca: "O desbloqueja totes les eines de màrqueting alhora — amb descompte — amb",
    id: "Atau buka semua alat pemasaran sekaligus — dengan diskon — lewat",
    vi: "Hoặc mở khóa mọi công cụ tiếp thị cùng lúc — với giá ưu đãi — bằng",
    th: "หรือปลดล็อกเครื่องมือการตลาดทั้งหมดในครั้งเดียว — ในราคาส่วนลด — ด้วย",
    zh: "或者以折扣价一次解锁所有营销工具——",
    ja: "またはすべてのマーケティングツールを割引価格で一括解除 —",
    ko: "또는 모든 마케팅 도구를 할인된 가격에 한 번에 잠금 해제하세요 —",
    ar: "أو افتح جميع أدوات التسويق دفعة واحدة — بسعر مخفّض — مع",
    he: "או פתח את כל כלי השיווק בבת אחת — בהנחה — עם",
    hi: "या सभी मार्केटिंग टूल एक साथ — छूट पर — अनलॉक करें",
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
  for (const [k, byLoc] of Object.entries(KEYS)) setDeep(data, k, byLoc[loc] ?? byLoc.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ growthnet strings (${Object.keys(KEYS).length} keys) added to ${n} locale(s).`);
