/** i18n × 38 for the driver app's background-location PROMINENT DISCLOSURE
 *  dialog — required by Google Play's Location Permissions policy to appear
 *  in-app BEFORE the OS background-location prompt (2026-07-16).
 *  Run: npx tsx scripts/i18n-add-bg-disclosure.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "driver.bgDisclosureTitle": {
    en: "Share your location for deliveries",
    fr: "Partagez votre position pour les livraisons",
    es: "Comparte tu ubicación para las entregas",
    it: "Condividi la tua posizione per le consegne",
    pt: "Partilhe a sua localização para as entregas",
    "pt-BR": "Compartilhe sua localização para as entregas",
    de: "Standort für Lieferungen freigeben",
    nl: "Deel je locatie voor bezorgingen",
    ro: "Partajează-ți locația pentru livrări",
    sv: "Dela din plats för leveranser",
    da: "Del din placering for leveringer",
    nb: "Del posisjonen din for leveringer",
    fi: "Jaa sijaintisi toimituksia varten",
    pl: "Udostępnij swoją lokalizację na potrzeby dostaw",
    cs: "Sdílejte svou polohu pro doručování",
    sk: "Zdieľajte svoju polohu pre doručovanie",
    hu: "Ossza meg helyzetét a kiszállításokhoz",
    el: "Κοινοποιήστε την τοποθεσία σας για τις παραδόσεις",
    bg: "Споделяйте местоположението си за доставките",
    hr: "Dijelite svoju lokaciju za dostave",
    sr: "Delite svoju lokaciju za dostave",
    sl: "Delite svojo lokacijo za dostave",
    et: "Jagage oma asukohta tarnete jaoks",
    lv: "Kopīgojiet savu atrašanās vietu piegādēm",
    lt: "Bendrinkite savo buvimo vietą pristatymams",
    tr: "Teslimatlar için konumunuzu paylaşın",
    ru: "Делитесь геопозицией для доставок",
    uk: "Діліться геопозицією для доставок",
    ca: "Comparteix la teva ubicació per als lliuraments",
    id: "Bagikan lokasi Anda untuk pengiriman",
    vi: "Chia sẻ vị trí của bạn cho các đơn giao hàng",
    th: "แชร์ตำแหน่งของคุณสำหรับการจัดส่ง",
    zh: "共享您的位置信息用于配送",
    ja: "配達のために位置情報を共有",
    ko: "배달을 위해 위치를 공유하세요",
    ar: "شارك موقعك لعمليات التوصيل",
    he: "שתפו את המיקום שלכם עבור משלוחים",
    hi: "डिलीवरी के लिए अपना स्थान साझा करें",
  },
  "driver.bgDisclosureBody": {
    en: "Fee Free Delivery collects location data while you have an active delivery, to share your live position with the customer and the restaurant — even when the app is in the background or closed, or the phone is locked. Tracking stops when the delivery is completed.",
    fr: "Fee Free Delivery collecte des données de localisation pendant une livraison active, afin de partager votre position en direct avec le client et le restaurant — même lorsque l'application est en arrière-plan, fermée, ou que le téléphone est verrouillé. Le suivi s'arrête à la fin de la livraison.",
    es: "Fee Free Delivery recopila datos de ubicación mientras tienes una entrega activa, para compartir tu posición en vivo con el cliente y el restaurante, incluso cuando la app está en segundo plano o cerrada, o el teléfono está bloqueado. El seguimiento se detiene al completar la entrega.",
    it: "Fee Free Delivery raccoglie dati sulla posizione mentre hai una consegna attiva, per condividere la tua posizione in tempo reale con il cliente e il ristorante — anche quando l'app è in background o chiusa, o il telefono è bloccato. Il tracciamento si interrompe al completamento della consegna.",
    pt: "A Fee Free Delivery recolhe dados de localização enquanto tem uma entrega ativa, para partilhar a sua posição em direto com o cliente e o restaurante — mesmo com a aplicação em segundo plano ou fechada, ou com o telemóvel bloqueado. O rastreio para quando a entrega é concluída.",
    "pt-BR": "O Fee Free Delivery coleta dados de localização enquanto você tem uma entrega ativa, para compartilhar sua posição ao vivo com o cliente e o restaurante — mesmo com o app em segundo plano ou fechado, ou com o telefone bloqueado. O rastreamento para quando a entrega é concluída.",
    de: "Fee Free Delivery erfasst Standortdaten, während du eine aktive Lieferung hast, um deine Live-Position mit dem Kunden und dem Restaurant zu teilen — auch wenn die App im Hintergrund läuft, geschlossen ist oder das Telefon gesperrt ist. Die Ortung endet, sobald die Lieferung abgeschlossen ist.",
    nl: "Fee Free Delivery verzamelt locatiegegevens terwijl je een actieve bezorging hebt, om je live positie te delen met de klant en het restaurant — ook wanneer de app op de achtergrond staat of gesloten is, of de telefoon vergrendeld is. Het volgen stopt zodra de bezorging is voltooid.",
    ro: "Fee Free Delivery colectează date de localizare cât timp ai o livrare activă, pentru a partaja poziția ta în timp real cu clientul și restaurantul — chiar și când aplicația este în fundal sau închisă, ori telefonul este blocat. Urmărirea se oprește la finalizarea livrării.",
    sv: "Fee Free Delivery samlar in platsdata medan du har en aktiv leverans, för att dela din liveposition med kunden och restaurangen — även när appen är i bakgrunden eller stängd, eller telefonen är låst. Spårningen upphör när leveransen är slutförd.",
    da: "Fee Free Delivery indsamler placeringsdata, mens du har en aktiv levering, for at dele din liveposition med kunden og restauranten — også når appen er i baggrunden eller lukket, eller telefonen er låst. Sporingen stopper, når leveringen er gennemført.",
    nb: "Fee Free Delivery samler inn posisjonsdata mens du har en aktiv levering, for å dele posisjonen din direkte med kunden og restauranten — selv når appen er i bakgrunnen eller lukket, eller telefonen er låst. Sporingen stopper når leveringen er fullført.",
    fi: "Fee Free Delivery kerää sijaintitietoja, kun sinulla on aktiivinen toimitus, jakaakseen live-sijaintisi asiakkaalle ja ravintolalle — myös kun sovellus on taustalla tai suljettu tai puhelin on lukittu. Seuranta päättyy, kun toimitus on valmis.",
    pl: "Fee Free Delivery zbiera dane o lokalizacji, gdy masz aktywną dostawę, aby udostępniać Twoją pozycję na żywo klientowi i restauracji — nawet gdy aplikacja działa w tle, jest zamknięta lub telefon jest zablokowany. Śledzenie kończy się po zrealizowaniu dostawy.",
    cs: "Fee Free Delivery shromažďuje údaje o poloze, když máte aktivní doručení, aby sdílela vaši polohu naživo se zákazníkem a restaurací — i když je aplikace na pozadí, zavřená, nebo je telefon uzamčen. Sledování končí dokončením doručení.",
    sk: "Fee Free Delivery zhromažďuje údaje o polohe, keď máte aktívne doručenie, aby zdieľala vašu polohu naživo so zákazníkom a reštauráciou — aj keď je aplikácia na pozadí, zatvorená, alebo je telefón uzamknutý. Sledovanie sa končí dokončením doručenia.",
    hu: "A Fee Free Delivery helyadatokat gyűjt, amíg aktív kiszállítása van, hogy élőben megossza pozícióját az ügyféllel és az étteremmel — akkor is, ha az alkalmazás a háttérben fut vagy be van zárva, illetve a telefon le van zárva. A követés a kiszállítás befejezésekor leáll.",
    el: "Το Fee Free Delivery συλλέγει δεδομένα τοποθεσίας όσο έχετε ενεργή παράδοση, για να κοινοποιεί τη ζωντανή θέση σας στον πελάτη και το εστιατόριο — ακόμη κι όταν η εφαρμογή είναι στο παρασκήνιο ή κλειστή, ή το τηλέφωνο είναι κλειδωμένο. Η παρακολούθηση σταματά όταν ολοκληρωθεί η παράδοση.",
    bg: "Fee Free Delivery събира данни за местоположението, докато имате активна доставка, за да споделя позицията ви на живо с клиента и ресторанта — дори когато приложението е във фонов режим или затворено, или телефонът е заключен. Проследяването спира при завършване на доставката.",
    hr: "Fee Free Delivery prikuplja podatke o lokaciji dok imate aktivnu dostavu, kako bi vašu poziciju uživo dijelio s kupcem i restoranom — čak i kada je aplikacija u pozadini ili zatvorena, ili je telefon zaključan. Praćenje prestaje po dovršetku dostave.",
    sr: "Fee Free Delivery prikuplja podatke o lokaciji dok imate aktivnu dostavu, kako bi vašu poziciju uživo delio sa kupcem i restoranom — čak i kada je aplikacija u pozadini ili zatvorena, ili je telefon zaključan. Praćenje prestaje po završetku dostave.",
    sl: "Fee Free Delivery zbira podatke o lokaciji, ko imate aktivno dostavo, da vašo lokacijo v živo deli s stranko in restavracijo — tudi ko je aplikacija v ozadju ali zaprta oziroma je telefon zaklenjen. Sledenje se ustavi ob zaključku dostave.",
    et: "Fee Free Delivery kogub asukohaandmeid, kui teil on aktiivne tarne, et jagada teie reaalajas asukohta kliendi ja restoraniga — ka siis, kui rakendus on taustal või suletud või telefon on lukus. Jälgimine lõpeb tarne lõpetamisel.",
    lv: "Fee Free Delivery vāc atrašanās vietas datus, kamēr jums ir aktīva piegāde, lai kopīgotu jūsu atrašanās vietu reāllaikā ar klientu un restorānu — arī tad, ja lietotne darbojas fonā vai ir aizvērta, vai tālrunis ir bloķēts. Izsekošana beidzas, kad piegāde ir pabeigta.",
    lt: "„Fee Free Delivery“ renka vietos duomenis, kol turite aktyvų pristatymą, kad jūsų buvimo vieta realiuoju laiku būtų bendrinama su klientu ir restoranu — net kai programa veikia fone, yra uždaryta arba telefonas užrakintas. Sekimas baigiasi užbaigus pristatymą.",
    tr: "Fee Free Delivery, aktif bir teslimatınız olduğunda canlı konumunuzu müşteri ve restoranla paylaşmak için konum verisi toplar — uygulama arka planda veya kapalıyken ya da telefon kilitliyken bile. Teslimat tamamlandığında izleme durur.",
    ru: "Fee Free Delivery собирает данные о местоположении, пока у вас есть активная доставка, чтобы делиться вашей позицией в реальном времени с клиентом и рестораном — даже когда приложение в фоновом режиме, закрыто или телефон заблокирован. Отслеживание прекращается после завершения доставки.",
    uk: "Fee Free Delivery збирає дані про місцезнаходження, поки у вас є активна доставка, щоб ділитися вашою позицією наживо з клієнтом і рестораном — навіть коли застосунок у фоновому режимі, закритий або телефон заблоковано. Відстеження припиняється після завершення доставки.",
    ca: "Fee Free Delivery recull dades d'ubicació mentre tens un lliurament actiu, per compartir la teva posició en directe amb el client i el restaurant — fins i tot quan l'aplicació és en segon pla o tancada, o el telèfon està bloquejat. El seguiment s'atura en completar el lliurament.",
    id: "Fee Free Delivery mengumpulkan data lokasi saat Anda memiliki pengiriman aktif, untuk membagikan posisi langsung Anda kepada pelanggan dan restoran — bahkan saat aplikasi di latar belakang atau ditutup, atau ponsel terkunci. Pelacakan berhenti saat pengiriman selesai.",
    vi: "Fee Free Delivery thu thập dữ liệu vị trí khi bạn có đơn giao hàng đang hoạt động, để chia sẻ vị trí trực tiếp của bạn với khách hàng và nhà hàng — ngay cả khi ứng dụng chạy nền, đã đóng hoặc điện thoại bị khóa. Việc theo dõi dừng lại khi đơn giao hàng hoàn tất.",
    th: "Fee Free Delivery เก็บข้อมูลตำแหน่งขณะที่คุณมีการจัดส่งที่กำลังดำเนินอยู่ เพื่อแชร์ตำแหน่งแบบเรียลไทม์ของคุณกับลูกค้าและร้านอาหาร แม้แอปจะทำงานอยู่เบื้องหลังหรือถูกปิด หรือโทรศัพท์ถูกล็อก การติดตามจะหยุดเมื่อการจัดส่งเสร็จสิ้น",
    zh: "Fee Free Delivery 会在您有进行中的配送时收集位置数据，以便与顾客和餐厅实时共享您的位置——即使应用在后台运行、已关闭或手机已锁定。配送完成后即停止追踪。",
    ja: "Fee Free Delivery は、配達中にお客様の現在地をお客様（注文者）とレストランへリアルタイムで共有するため、位置情報データを収集します。アプリがバックグラウンドにある場合や終了している場合、スマートフォンがロックされている場合も同様です。配達が完了すると追跡は停止します。",
    ko: "Fee Free Delivery는 진행 중인 배달이 있는 동안 위치 데이터를 수집하여 고객 및 레스토랑과 실시간 위치를 공유합니다. 앱이 백그라운드에 있거나 종료된 경우, 휴대폰이 잠긴 경우에도 마찬가지입니다. 배달이 완료되면 추적이 중지됩니다.",
    ar: "يجمع Fee Free Delivery بيانات الموقع أثناء وجود توصيل نشط لديك، لمشاركة موقعك المباشر مع العميل والمطعم — حتى عندما يكون التطبيق في الخلفية أو مغلقًا، أو يكون الهاتف مقفلًا. يتوقف التتبع عند اكتمال التوصيل.",
    he: "Fee Free Delivery אוסף נתוני מיקום בזמן שיש לכם משלוח פעיל, כדי לשתף את המיקום החי שלכם עם הלקוח והמסעדה — גם כשהאפליקציה ברקע או סגורה, או כשהטלפון נעול. המעקב נפסק עם השלמת המשלוח.",
    hi: "Fee Free Delivery आपकी सक्रिय डिलीवरी के दौरान स्थान डेटा एकत्र करता है, ताकि आपकी लाइव स्थिति ग्राहक और रेस्तरां के साथ साझा की जा सके — भले ही ऐप बैकग्राउंड में हो या बंद हो, या फ़ोन लॉक हो। डिलीवरी पूरी होने पर ट्रैकिंग बंद हो जाती है।",
  },
  "driver.bgDisclosureAllow": {
    en: "Continue",
    fr: "Continuer",
    es: "Continuar",
    it: "Continua",
    pt: "Continuar",
    "pt-BR": "Continuar",
    de: "Weiter",
    nl: "Doorgaan",
    ro: "Continuă",
    sv: "Fortsätt",
    da: "Fortsæt",
    nb: "Fortsett",
    fi: "Jatka",
    pl: "Kontynuuj",
    cs: "Pokračovat",
    sk: "Pokračovať",
    hu: "Folytatás",
    el: "Συνέχεια",
    bg: "Продължи",
    hr: "Nastavi",
    sr: "Nastavi",
    sl: "Nadaljuj",
    et: "Jätka",
    lv: "Turpināt",
    lt: "Tęsti",
    tr: "Devam",
    ru: "Продолжить",
    uk: "Продовжити",
    ca: "Continua",
    id: "Lanjutkan",
    vi: "Tiếp tục",
    th: "ดำเนินการต่อ",
    zh: "继续",
    ja: "続行",
    ko: "계속",
    ar: "متابعة",
    he: "המשך",
    hi: "जारी रखें",
  },
  "driver.bgDisclosureLater": {
    en: "Not now",
    fr: "Pas maintenant",
    es: "Ahora no",
    it: "Non ora",
    pt: "Agora não",
    "pt-BR": "Agora não",
    de: "Nicht jetzt",
    nl: "Niet nu",
    ro: "Nu acum",
    sv: "Inte nu",
    da: "Ikke nu",
    nb: "Ikke nå",
    fi: "Ei nyt",
    pl: "Nie teraz",
    cs: "Teď ne",
    sk: "Teraz nie",
    hu: "Most nem",
    el: "Όχι τώρα",
    bg: "Не сега",
    hr: "Ne sada",
    sr: "Ne sada",
    sl: "Ne zdaj",
    et: "Mitte praegu",
    lv: "Ne tagad",
    lt: "Ne dabar",
    tr: "Şimdi değil",
    ru: "Не сейчас",
    uk: "Не зараз",
    ca: "Ara no",
    id: "Nanti saja",
    vi: "Để sau",
    th: "ไว้ทีหลัง",
    zh: "暂不",
    ja: "今はしない",
    ko: "나중에",
    ar: "ليس الآن",
    he: "לא עכשיו",
    hi: "अभी नहीं",
  },
};

function setDeep(obj: Record<string, unknown>, key: string, value: string) {
  const parts = key.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

let count = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8"));
  for (const [key, byLoc] of Object.entries(K)) {
    if (!byLoc[loc]) console.warn(`  ⚠ ${loc} missing ${key} — falling back to en`);
    setDeep(data, key, byLoc[loc] ?? byLoc.en);
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  count++;
}
console.log(`✓ added ${Object.keys(K).length} keys to ${count} locale files`);
