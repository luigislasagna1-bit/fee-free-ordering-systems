/**
 * i18n: Marketing Studio P1 strings (Luigi 2026-06-10) across all 38 locales.
 * admin.sidebar.marketingStudio + the admin.marketingStudio.* dashboard keys.
 * Generic words (cancel/delete/name/active/off) reuse the `common` namespace.
 * "Marketing Studio" is a brand name → identical in every locale.
 *   npx tsx scripts/i18n-add-marketing-studio.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");
const LOCALES = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));

// Brand name — same string everywhere.
const BRAND = "Marketing Studio";
const brandAll = (): Record<string, string> => Object.fromEntries(LOCALES.map((l) => [l, BRAND]));

const KEYS: Record<string, Record<string, string>> = {
  "admin.sidebar.marketingStudio": brandAll(),
  "admin.marketingStudio.pageTitle": brandAll(),
  "admin.marketingStudio.createTitle": {
    en: "New smart link", fr: "Nouveau lien intelligent", es: "Nuevo enlace inteligente", it: "Nuovo link intelligente", pt: "Novo link inteligente", "pt-BR": "Novo link inteligente",
    de: "Neuer Smart-Link", nl: "Nieuwe slimme link", ro: "Link inteligent nou", sv: "Ny smart länk", da: "Nyt smart link", nb: "Ny smartlenke",
    fi: "Uusi älylinkki", pl: "Nowy inteligentny link", cs: "Nový chytrý odkaz", sk: "Nový inteligentný odkaz", hu: "Új okos link", el: "Νέος έξυπνος σύνδεσμος",
    bg: "Нова умна връзка", hr: "Nova pametna poveznica", sr: "Нова паметна веза", sl: "Nova pametna povezava", et: "Uus nutilink", lv: "Jauna vieda saite",
    lt: "Nauja išmanioji nuoroda", tr: "Yeni akıllı bağlantı", ru: "Новая умная ссылка", uk: "Нове розумне посилання", ca: "Nou enllaç intel·ligent", id: "Tautan pintar baru",
    vi: "Liên kết thông minh mới", th: "ลิงก์อัจฉริยะใหม่", zh: "新建智能链接", ja: "新しいスマートリンク", ko: "새 스마트 링크", ar: "رابط ذكي جديد", he: "קישור חכם חדש", hi: "नया स्मार्ट लिंक",
  },
  "admin.marketingStudio.newLink": {
    en: "New smart link", fr: "Nouveau lien", es: "Nuevo enlace", it: "Nuovo link", pt: "Novo link", "pt-BR": "Novo link",
    de: "Neuer Smart-Link", nl: "Nieuwe link", ro: "Link nou", sv: "Ny länk", da: "Nyt link", nb: "Ny lenke",
    fi: "Uusi linkki", pl: "Nowy link", cs: "Nový odkaz", sk: "Nový odkaz", hu: "Új link", el: "Νέος σύνδεσμος",
    bg: "Нова връзка", hr: "Nova poveznica", sr: "Нова веза", sl: "Nova povezava", et: "Uus link", lv: "Jauna saite",
    lt: "Nauja nuoroda", tr: "Yeni bağlantı", ru: "Новая ссылка", uk: "Нове посилання", ca: "Nou enllaç", id: "Tautan baru",
    vi: "Liên kết mới", th: "ลิงก์ใหม่", zh: "新建链接", ja: "新しいリンク", ko: "새 링크", ar: "رابط جديد", he: "קישור חדש", hi: "नया लिंक",
  },
  "admin.marketingStudio.createButton": {
    en: "Create link", fr: "Créer le lien", es: "Crear enlace", it: "Crea link", pt: "Criar link", "pt-BR": "Criar link",
    de: "Link erstellen", nl: "Link maken", ro: "Creează link", sv: "Skapa länk", da: "Opret link", nb: "Opprett lenke",
    fi: "Luo linkki", pl: "Utwórz link", cs: "Vytvořit odkaz", sk: "Vytvoriť odkaz", hu: "Link létrehozása", el: "Δημιουργία συνδέσμου",
    bg: "Създай връзка", hr: "Stvori poveznicu", sr: "Направи везу", sl: "Ustvari povezavo", et: "Loo link", lv: "Izveidot saiti",
    lt: "Sukurti nuorodą", tr: "Bağlantı oluştur", ru: "Создать ссылку", uk: "Створити посилання", ca: "Crea l'enllaç", id: "Buat tautan",
    vi: "Tạo liên kết", th: "สร้างลิงก์", zh: "创建链接", ja: "リンクを作成", ko: "링크 만들기", ar: "إنشاء رابط", he: "צור קישור", hi: "लिंक बनाएँ",
  },
  "admin.marketingStudio.namePlaceholder": {
    en: "e.g. Front-door flyer", fr: "ex. Prospectus d'entrée", es: "p. ej. Folleto de la entrada", it: "es. Volantino all'ingresso", pt: "ex. Panfleto da porta", "pt-BR": "ex. Panfleto da porta",
    de: "z. B. Flyer am Eingang", nl: "bijv. Flyer bij de deur", ro: "ex. Pliant la intrare", sv: "t.ex. Flygblad vid dörren", da: "f.eks. Folder ved døren", nb: "f.eks. Flygeblad ved døren",
    fi: "esim. Oven esite", pl: "np. Ulotka przy drzwiach", cs: "např. Leták u dveří", sk: "napr. Leták pri dverách", hu: "pl. Bejárati szórólap", el: "π.χ. Φυλλάδιο εισόδου",
    bg: "напр. Флаер на входа", hr: "npr. Letak na vratima", sr: "нпр. Летак на улазу", sl: "npr. Letak pri vhodu", et: "nt Ukse flaier", lv: "piem. Durvju buklets",
    lt: "pvz. Durų skrajutė", tr: "örn. Kapı broşürü", ru: "напр. Листовка у входа", uk: "напр. Листівка біля входу", ca: "p. ex. Fullet de l'entrada", id: "mis. Selebaran pintu depan",
    vi: "vd. Tờ rơi cửa trước", th: "เช่น ใบปลิวหน้าร้าน", zh: "例如：门口传单", ja: "例：店頭チラシ", ko: "예: 출입문 전단지", ar: "مثل: نشرة الباب الأمامي", he: "למשל עלון בכניסה", hi: "उदा. दरवाज़े का फ़्लायर",
  },
  "admin.marketingStudio.copyUrl": {
    en: "Copy link", fr: "Copier le lien", es: "Copiar enlace", it: "Copia link", pt: "Copiar link", "pt-BR": "Copiar link",
    de: "Link kopieren", nl: "Link kopiëren", ro: "Copiază linkul", sv: "Kopiera länk", da: "Kopiér link", nb: "Kopier lenke",
    fi: "Kopioi linkki", pl: "Kopiuj link", cs: "Kopírovat odkaz", sk: "Kopírovať odkaz", hu: "Link másolása", el: "Αντιγραφή συνδέσμου",
    bg: "Копирай връзката", hr: "Kopiraj poveznicu", sr: "Копирај везу", sl: "Kopiraj povezavo", et: "Kopeeri link", lv: "Kopēt saiti",
    lt: "Kopijuoti nuorodą", tr: "Bağlantıyı kopyala", ru: "Копировать ссылку", uk: "Копіювати посилання", ca: "Copia l'enllaç", id: "Salin tautan",
    vi: "Sao chép liên kết", th: "คัดลอกลิงก์", zh: "复制链接", ja: "リンクをコピー", ko: "링크 복사", ar: "نسخ الرابط", he: "העתק קישור", hi: "लिंक कॉपी करें",
  },
  "admin.marketingStudio.created": {
    en: "Smart link created", fr: "Lien créé", es: "Enlace creado", it: "Link creato", pt: "Link criado", "pt-BR": "Link criado",
    de: "Link erstellt", nl: "Link gemaakt", ro: "Link creat", sv: "Länk skapad", da: "Link oprettet", nb: "Lenke opprettet",
    fi: "Linkki luotu", pl: "Link utworzony", cs: "Odkaz vytvořen", sk: "Odkaz vytvorený", hu: "Link létrehozva", el: "Ο σύνδεσμος δημιουργήθηκε",
    bg: "Връзката е създадена", hr: "Poveznica stvorena", sr: "Веза је направљена", sl: "Povezava ustvarjena", et: "Link loodud", lv: "Saite izveidota",
    lt: "Nuoroda sukurta", tr: "Bağlantı oluşturuldu", ru: "Ссылка создана", uk: "Посилання створено", ca: "Enllaç creat", id: "Tautan dibuat",
    vi: "Đã tạo liên kết", th: "สร้างลิงก์แล้ว", zh: "链接已创建", ja: "リンクを作成しました", ko: "링크가 생성되었습니다", ar: "تم إنشاء الرابط", he: "הקישור נוצר", hi: "लिंक बन गया",
  },
  "admin.marketingStudio.createError": {
    en: "Couldn't create — try again", fr: "Échec de la création — réessayez", es: "No se pudo crear — inténtalo de nuevo", it: "Creazione non riuscita — riprova", pt: "Não foi possível criar — tente novamente", "pt-BR": "Não foi possível criar — tente de novo",
    de: "Erstellung fehlgeschlagen — erneut versuchen", nl: "Aanmaken mislukt — probeer opnieuw", ro: "Crearea a eșuat — încearcă din nou", sv: "Kunde inte skapa — försök igen", da: "Kunne ikke oprette — prøv igen", nb: "Kunne ikke opprette — prøv igjen",
    fi: "Luonti epäonnistui — yritä uudelleen", pl: "Nie udało się utworzyć — spróbuj ponownie", cs: "Nepodařilo se vytvořit — zkuste znovu", sk: "Nepodarilo sa vytvoriť — skúste znova", hu: "Nem sikerült létrehozni — próbáld újra", el: "Αποτυχία δημιουργίας — δοκιμάστε ξανά",
    bg: "Неуспешно създаване — опитайте отново", hr: "Stvaranje nije uspjelo — pokušajte ponovno", sr: "Прављење није успело — покушајте поново", sl: "Ustvarjanje ni uspelo — poskusite znova", et: "Loomine ebaõnnestus — proovige uuesti", lv: "Neizdevās izveidot — mēģiniet vēlreiz",
    lt: "Nepavyko sukurti — bandykite dar kartą", tr: "Oluşturulamadı — tekrar deneyin", ru: "Не удалось создать — попробуйте снова", uk: "Не вдалося створити — спробуйте ще раз", ca: "No s'ha pogut crear — torna-ho a provar", id: "Gagal membuat — coba lagi",
    vi: "Không thể tạo — thử lại", th: "สร้างไม่สำเร็จ — ลองอีกครั้ง", zh: "创建失败——请重试", ja: "作成できませんでした — もう一度お試しください", ko: "생성하지 못했습니다 — 다시 시도하세요", ar: "تعذر الإنشاء — حاول مرة أخرى", he: "היצירה נכשלה — נסה שוב", hi: "नहीं बना सके — पुनः प्रयास करें",
  },
  "admin.marketingStudio.copyError": {
    en: "Couldn't copy", fr: "Échec de la copie", es: "No se pudo copiar", it: "Copia non riuscita", pt: "Não foi possível copiar", "pt-BR": "Não foi possível copiar",
    de: "Kopieren fehlgeschlagen", nl: "Kopiëren mislukt", ro: "Copierea a eșuat", sv: "Kunde inte kopiera", da: "Kunne ikke kopiere", nb: "Kunne ikke kopiere",
    fi: "Kopiointi epäonnistui", pl: "Nie udało się skopiować", cs: "Nepodařilo se zkopírovat", sk: "Nepodarilo sa skopírovať", hu: "Nem sikerült másolni", el: "Αποτυχία αντιγραφής",
    bg: "Неуспешно копиране", hr: "Kopiranje nije uspjelo", sr: "Копирање није успело", sl: "Kopiranje ni uspelo", et: "Kopeerimine ebaõnnestus", lv: "Neizdevās kopēt",
    lt: "Nepavyko nukopijuoti", tr: "Kopyalanamadı", ru: "Не удалось скопировать", uk: "Не вдалося скопіювати", ca: "No s'ha pogut copiar", id: "Gagal menyalin",
    vi: "Không thể sao chép", th: "คัดลอกไม่สำเร็จ", zh: "复制失败", ja: "コピーできませんでした", ko: "복사하지 못했습니다", ar: "تعذر النسخ", he: "ההעתקה נכשלה", hi: "कॉपी नहीं हो सका",
  },
  "admin.marketingStudio.colScans": {
    en: "Scans", fr: "Scans", es: "Escaneos", it: "Scansioni", pt: "Leituras", "pt-BR": "Leituras",
    de: "Scans", nl: "Scans", ro: "Scanări", sv: "Skanningar", da: "Scanninger", nb: "Skanninger",
    fi: "Skannaukset", pl: "Skany", cs: "Skeny", sk: "Skeny", hu: "Beolvasások", el: "Σαρώσεις",
    bg: "Сканирания", hr: "Skeniranja", sr: "Скенирања", sl: "Skeniranja", et: "Skannimised", lv: "Skenēšanas",
    lt: "Nuskaitymai", tr: "Taramalar", ru: "Сканирования", uk: "Сканування", ca: "Escanejos", id: "Pemindaian",
    vi: "Lượt quét", th: "การสแกน", zh: "扫描", ja: "スキャン", ko: "스캔", ar: "عمليات المسح", he: "סריקות", hi: "स्कैन",
  },
  "admin.marketingStudio.colOrders": {
    en: "Orders", fr: "Commandes", es: "Pedidos", it: "Ordini", pt: "Pedidos", "pt-BR": "Pedidos",
    de: "Bestellungen", nl: "Bestellingen", ro: "Comenzi", sv: "Beställningar", da: "Ordrer", nb: "Bestillinger",
    fi: "Tilaukset", pl: "Zamówienia", cs: "Objednávky", sk: "Objednávky", hu: "Rendelések", el: "Παραγγελίες",
    bg: "Поръчки", hr: "Narudžbe", sr: "Поруџбине", sl: "Naročila", et: "Tellimused", lv: "Pasūtījumi",
    lt: "Užsakymai", tr: "Siparişler", ru: "Заказы", uk: "Замовлення", ca: "Comandes", id: "Pesanan",
    vi: "Đơn hàng", th: "ออเดอร์", zh: "订单", ja: "注文", ko: "주문", ar: "الطلبات", he: "הזמנות", hi: "ऑर्डर",
  },
  "admin.marketingStudio.colRevenue": {
    en: "Revenue", fr: "Revenus", es: "Ingresos", it: "Ricavi", pt: "Receita", "pt-BR": "Receita",
    de: "Umsatz", nl: "Omzet", ro: "Venit", sv: "Intäkter", da: "Omsætning", nb: "Inntekt",
    fi: "Tuotot", pl: "Przychód", cs: "Tržby", sk: "Tržby", hu: "Bevétel", el: "Έσοδα",
    bg: "Приходи", hr: "Prihod", sr: "Приход", sl: "Prihodek", et: "Tulu", lv: "Ieņēmumi",
    lt: "Pajamos", tr: "Gelir", ru: "Доход", uk: "Дохід", ca: "Ingressos", id: "Pendapatan",
    vi: "Doanh thu", th: "รายได้", zh: "收入", ja: "売上", ko: "매출", ar: "الإيرادات", he: "הכנסה", hi: "राजस्व",
  },
  "admin.marketingStudio.colConversion": {
    en: "Conv.", fr: "Conv.", es: "Conv.", it: "Conv.", pt: "Conv.", "pt-BR": "Conv.",
    de: "Konv.", nl: "Conv.", ro: "Conv.", sv: "Konv.", da: "Konv.", nb: "Konv.",
    fi: "Konv.", pl: "Konw.", cs: "Konv.", sk: "Konv.", hu: "Konv.", el: "Μετατρ.",
    bg: "Конв.", hr: "Konv.", sr: "Конв.", sl: "Konv.", et: "Konv.", lv: "Konv.",
    lt: "Konv.", tr: "Dönş.", ru: "Конв.", uk: "Конв.", ca: "Conv.", id: "Konv.",
    vi: "Chuyển đổi", th: "อัตราแปลง", zh: "转化", ja: "転換率", ko: "전환", ar: "التحويل", he: "המרה", hi: "रूपांतरण",
  },
  "admin.marketingStudio.emptyTitle": {
    en: "No smart links yet", fr: "Aucun lien intelligent", es: "Aún no hay enlaces inteligentes", it: "Ancora nessun link intelligente", pt: "Ainda sem links inteligentes", "pt-BR": "Ainda sem links inteligentes",
    de: "Noch keine Smart-Links", nl: "Nog geen slimme links", ro: "Încă niciun link inteligent", sv: "Inga smarta länkar ännu", da: "Ingen smarte links endnu", nb: "Ingen smartlenker ennå",
    fi: "Ei vielä älylinkkejä", pl: "Brak inteligentnych linków", cs: "Zatím žádné chytré odkazy", sk: "Zatiaľ žiadne inteligentné odkazy", hu: "Még nincs okos link", el: "Δεν υπάρχουν έξυπνοι σύνδεσμοι ακόμη",
    bg: "Все още няма умни връзки", hr: "Još nema pametnih poveznica", sr: "Још нема паметних веза", sl: "Še ni pametnih povezav", et: "Nutilinke veel pole", lv: "Pagaidām nav viedo saišu",
    lt: "Kol kas nėra išmaniųjų nuorodų", tr: "Henüz akıllı bağlantı yok", ru: "Пока нет умных ссылок", uk: "Поки немає розумних посилань", ca: "Encara no hi ha enllaços intel·ligents", id: "Belum ada tautan pintar",
    vi: "Chưa có liên kết thông minh", th: "ยังไม่มีลิงก์อัจฉริยะ", zh: "暂无智能链接", ja: "スマートリンクはまだありません", ko: "아직 스마트 링크가 없습니다", ar: "لا توجد روابط ذكية بعد", he: "אין עדיין קישורים חכמים", hi: "अभी कोई स्मार्ट लिंक नहीं",
  },
  "admin.marketingStudio.emptyBody": {
    en: "Create a trackable link, put its QR on a flyer or post, and watch scans turn into orders.",
    fr: "Créez un lien traçable, mettez son QR sur un prospectus ou une publication, et regardez les scans devenir des commandes.",
    es: "Crea un enlace rastreable, pon su QR en un folleto o publicación y observa cómo los escaneos se convierten en pedidos.",
    it: "Crea un link tracciabile, metti il suo QR su un volantino o post e guarda le scansioni trasformarsi in ordini.",
    pt: "Crie um link rastreável, coloque o QR num panfleto ou publicação e veja as leituras tornarem-se pedidos.",
    "pt-BR": "Crie um link rastreável, coloque o QR em um panfleto ou post e veja as leituras virarem pedidos.",
    de: "Erstellen Sie einen nachverfolgbaren Link, setzen Sie seinen QR auf einen Flyer oder Post und sehen Sie, wie Scans zu Bestellungen werden.",
    nl: "Maak een volgbare link, zet de QR op een flyer of post en zie scans veranderen in bestellingen.",
    ro: "Creează un link urmăribil, pune-i codul QR pe un pliant sau o postare și vezi cum scanările devin comenzi.",
    sv: "Skapa en spårbar länk, sätt dess QR på ett flygblad eller inlägg och se skanningar bli beställningar.",
    da: "Opret et sporbart link, sæt dets QR på en folder eller et opslag, og se scanninger blive til ordrer.",
    nb: "Lag en sporbar lenke, sett QR-koden på et flygeblad eller innlegg, og se skanninger bli til bestillinger.",
    fi: "Luo seurattava linkki, lisää sen QR esitteeseen tai julkaisuun ja katso, kuinka skannaukset muuttuvat tilauksiksi.",
    pl: "Utwórz śledzony link, umieść jego kod QR na ulotce lub poście i obserwuj, jak skany zamieniają się w zamówienia.",
    cs: "Vytvořte sledovatelný odkaz, umístěte jeho QR na leták nebo příspěvek a sledujte, jak se skeny mění v objednávky.",
    sk: "Vytvorte sledovateľný odkaz, umiestnite jeho QR na leták alebo príspevok a sledujte, ako sa skeny menia na objednávky.",
    hu: "Hozzon létre egy követhető linket, tegye a QR-kódját szórólapra vagy posztra, és nézze, ahogy a beolvasások rendelésekké válnak.",
    el: "Δημιουργήστε έναν παρακολουθήσιμο σύνδεσμο, βάλτε το QR του σε φυλλάδιο ή ανάρτηση και δείτε τις σαρώσεις να γίνονται παραγγελίες.",
    bg: "Създайте проследима връзка, поставете нейния QR на флаер или публикация и гледайте как сканиранията се превръщат в поръчки.",
    hr: "Stvorite pratljivu poveznicu, stavite njezin QR na letak ili objavu i gledajte kako se skeniranja pretvaraju u narudžbe.",
    sr: "Направите пратљиву везу, ставите њен QR на летак или објаву и гледајте како се скенирања претварају у поруџбине.",
    sl: "Ustvarite sledljivo povezavo, postavite njeno kodo QR na letak ali objavo in glejte, kako se skeniranja spremenijo v naročila.",
    et: "Loo jälgitav link, pane selle QR flaierile või postitusele ja vaata, kuidas skannimised muutuvad tellimusteks.",
    lv: "Izveidojiet izsekojamu saiti, ievietojiet tās QR uz bukleta vai ziņas un vērojiet, kā skenēšanas kļūst par pasūtījumiem.",
    lt: "Sukurkite stebimą nuorodą, įdėkite jos QR ant skrajutės ar įrašo ir stebėkite, kaip nuskaitymai virsta užsakymais.",
    tr: "Takip edilebilir bir bağlantı oluşturun, QR'ını bir broşüre veya paylaşıma koyun ve taramaların siparişe dönüşmesini izleyin.",
    ru: "Создайте отслеживаемую ссылку, разместите её QR на листовке или в посте и смотрите, как сканирования превращаются в заказы.",
    uk: "Створіть відстежуване посилання, розмістіть його QR на листівці чи дописі та спостерігайте, як сканування стають замовленнями.",
    ca: "Crea un enllaç rastrejable, posa el seu QR en un fullet o publicació i mira com els escanejos es converteixen en comandes.",
    id: "Buat tautan terlacak, pasang QR-nya di selebaran atau postingan, dan lihat pemindaian berubah menjadi pesanan.",
    vi: "Tạo một liên kết theo dõi được, đặt mã QR của nó lên tờ rơi hoặc bài đăng, và xem lượt quét biến thành đơn hàng.",
    th: "สร้างลิงก์ที่ติดตามได้ นำคิวอาร์โค้ดไปติดบนใบปลิวหรือโพสต์ แล้วดูการสแกนกลายเป็นออเดอร์",
    zh: "创建一个可追踪链接，将其二维码放在传单或帖子上，看着扫描变成订单。",
    ja: "追跡可能なリンクを作成し、そのQRをチラシや投稿に載せて、スキャンが注文に変わる様子を見ましょう。",
    ko: "추적 가능한 링크를 만들고 QR을 전단지나 게시물에 넣어 스캔이 주문으로 이어지는 것을 확인하세요.",
    ar: "أنشئ رابطًا قابلًا للتتبع، وضع رمز QR الخاص به على نشرة أو منشور، وشاهد عمليات المسح تتحول إلى طلبات.",
    he: "צור קישור למעקב, הצב את ה-QR שלו על עלון או פוסט, וצפה בסריקות הופכות להזמנות.",
    hi: "एक ट्रैक करने योग्य लिंक बनाएँ, उसका QR किसी फ़्लायर या पोस्ट पर लगाएँ, और स्कैन को ऑर्डर में बदलते देखें।",
  },
  "admin.marketingStudio.pageSubtitle": {
    en: "Trackable links + QR codes — see which flyers and posts drive real orders.",
    fr: "Liens traçables + QR codes — voyez quels prospectus et publications génèrent de vraies commandes.",
    es: "Enlaces rastreables + códigos QR: descubre qué folletos y publicaciones generan pedidos reales.",
    it: "Link tracciabili + codici QR: scopri quali volantini e post generano ordini reali.",
    pt: "Links rastreáveis + códigos QR — veja que panfletos e publicações geram pedidos reais.",
    "pt-BR": "Links rastreáveis + QR codes — veja quais panfletos e posts geram pedidos reais.",
    de: "Nachverfolgbare Links + QR-Codes — sehen Sie, welche Flyer und Posts echte Bestellungen bringen.",
    nl: "Volgbare links + QR-codes — zie welke flyers en posts echte bestellingen opleveren.",
    ro: "Linkuri urmăribile + coduri QR — vezi ce pliante și postări aduc comenzi reale.",
    sv: "Spårbara länkar + QR-koder — se vilka flygblad och inlägg som ger riktiga beställningar.",
    da: "Sporbare links + QR-koder — se hvilke foldere og opslag der giver rigtige ordrer.",
    nb: "Sporbare lenker + QR-koder — se hvilke flygeblader og innlegg som gir ekte bestillinger.",
    fi: "Seurattavat linkit + QR-koodit — näe, mitkä esitteet ja julkaisut tuovat oikeita tilauksia.",
    pl: "Śledzone linki + kody QR — zobacz, które ulotki i posty generują prawdziwe zamówienia.",
    cs: "Sledovatelné odkazy + QR kódy — zjistěte, které letáky a příspěvky přinášejí skutečné objednávky.",
    sk: "Sledovateľné odkazy + QR kódy — zistite, ktoré letáky a príspevky prinášajú skutočné objednávky.",
    hu: "Követhető linkek + QR-kódok — nézze meg, mely szórólapok és posztok hoznak valódi rendeléseket.",
    el: "Παρακολουθήσιμοι σύνδεσμοι + κωδικοί QR — δείτε ποια φυλλάδια και αναρτήσεις φέρνουν πραγματικές παραγγελίες.",
    bg: "Проследими връзки + QR кодове — вижте кои флаери и публикации носят реални поръчки.",
    hr: "Pratljive poveznice + QR kodovi — vidite koji letci i objave donose prave narudžbe.",
    sr: "Пратљиве везе + QR кодови — видите који леци и објаве доносе праве поруџбине.",
    sl: "Sledljive povezave + kode QR — poglejte, kateri letaki in objave prinašajo prava naročila.",
    et: "Jälgitavad lingid + QR-koodid — vaadake, millised flaierid ja postitused toovad päris tellimusi.",
    lv: "Izsekojamas saites + QR kodi — uzziniet, kuri bukleti un ziņas dod reālus pasūtījumus.",
    lt: "Stebimos nuorodos + QR kodai — sužinokite, kurios skrajutės ir įrašai duoda tikrų užsakymų.",
    tr: "Takip edilebilir bağlantılar + QR kodları — hangi broşür ve paylaşımların gerçek sipariş getirdiğini görün.",
    ru: "Отслеживаемые ссылки + QR-коды — узнайте, какие листовки и посты приносят реальные заказы.",
    uk: "Відстежувані посилання + QR-коди — дізнайтеся, які листівки та дописи приносять реальні замовлення.",
    ca: "Enllaços rastrejables + codis QR: descobreix quins fullets i publicacions generen comandes reals.",
    id: "Tautan terlacak + kode QR — lihat selebaran dan postingan mana yang menghasilkan pesanan nyata.",
    vi: "Liên kết theo dõi được + mã QR — xem tờ rơi và bài đăng nào tạo ra đơn hàng thực.",
    th: "ลิงก์ที่ติดตามได้ + คิวอาร์โค้ด — ดูว่าใบปลิวและโพสต์ใดสร้างออเดอร์จริง",
    zh: "可追踪链接 + 二维码——看看哪些传单和帖子带来真实订单。",
    ja: "追跡可能なリンク + QRコード — どのチラシや投稿が実際の注文につながるかを確認。",
    ko: "추적 가능한 링크 + QR 코드 — 어떤 전단지와 게시물이 실제 주문으로 이어지는지 확인하세요.",
    ar: "روابط قابلة للتتبع + رموز QR — اعرف أي النشرات والمنشورات تجلب طلبات حقيقية.",
    he: "קישורים למעקב + קודי QR — ראה אילו עלונים ופוסטים מביאים הזמנות אמיתיות.",
    hi: "ट्रैक करने योग्य लिंक + QR कोड — देखें कौन से फ़्लायर और पोस्ट असली ऑर्डर लाते हैं।",
  },
  "admin.marketingStudio.pointsToHint": {
    en: "Points to your menu. You'll get a share link + QR to track scans and orders.",
    fr: "Pointe vers votre menu. Vous obtiendrez un lien de partage + QR pour suivre les scans et les commandes.",
    es: "Apunta a tu menú. Obtendrás un enlace para compartir + QR para seguir escaneos y pedidos.",
    it: "Punta al tuo menu. Otterrai un link da condividere + QR per tracciare scansioni e ordini.",
    pt: "Aponta para o seu menu. Receberá um link de partilha + QR para acompanhar leituras e pedidos.",
    "pt-BR": "Aponta para o seu cardápio. Você recebe um link de compartilhamento + QR para acompanhar leituras e pedidos.",
    de: "Verweist auf Ihr Menü. Sie erhalten einen Teilen-Link + QR, um Scans und Bestellungen zu verfolgen.",
    nl: "Verwijst naar je menu. Je krijgt een deellink + QR om scans en bestellingen te volgen.",
    ro: "Trimite către meniul tău. Vei primi un link de partajare + QR pentru a urmări scanările și comenzile.",
    sv: "Pekar på din meny. Du får en delningslänk + QR för att spåra skanningar och beställningar.",
    da: "Peger på dit menukort. Du får et delingslink + QR til at spore scanninger og ordrer.",
    nb: "Peker til menyen din. Du får en delingslenke + QR for å spore skanninger og bestillinger.",
    fi: "Osoittaa ruokalistaasi. Saat jakolinkin + QR:n skannausten ja tilausten seuraamiseen.",
    pl: "Prowadzi do Twojego menu. Otrzymasz link do udostępniania + QR, aby śledzić skany i zamówienia.",
    cs: "Odkazuje na vaše menu. Získáte odkaz ke sdílení + QR pro sledování skenů a objednávek.",
    sk: "Odkazuje na vaše menu. Získate odkaz na zdieľanie + QR na sledovanie skenov a objednávok.",
    hu: "Az étlapodra mutat. Kapsz egy megosztható linket + QR-t a beolvasások és rendelések követéséhez.",
    el: "Δείχνει στο μενού σας. Θα λάβετε σύνδεσμο κοινοποίησης + QR για παρακολούθηση σαρώσεων και παραγγελιών.",
    bg: "Сочи към вашето меню. Ще получите връзка за споделяне + QR за проследяване на сканирания и поръчки.",
    hr: "Vodi na vaš jelovnik. Dobit ćete poveznicu za dijeljenje + QR za praćenje skeniranja i narudžbi.",
    sr: "Води на ваш јеловник. Добићете везу за дељење + QR за праћење скенирања и поруџбина.",
    sl: "Kaže na vaš meni. Dobili boste povezavo za deljenje + QR za sledenje skeniranj in naročil.",
    et: "Viitab teie menüüle. Saate jagamislingi + QR-i skannimiste ja tellimuste jälgimiseks.",
    lv: "Norāda uz jūsu ēdienkarti. Saņemsiet kopīgošanas saiti + QR, lai sekotu skenēšanām un pasūtījumiem.",
    lt: "Nukreipia į jūsų meniu. Gausite bendrinimo nuorodą + QR nuskaitymams ir užsakymams sekti.",
    tr: "Menünüze yönlendirir. Taramaları ve siparişleri izlemek için bir paylaşım bağlantısı + QR alırsınız.",
    ru: "Ведёт в ваше меню. Вы получите ссылку для обмена + QR для отслеживания сканирований и заказов.",
    uk: "Веде до вашого меню. Ви отримаєте посилання для поширення + QR для відстеження сканувань і замовлень.",
    ca: "Apunta al teu menú. Obtindràs un enllaç per compartir + QR per fer el seguiment d'escanejos i comandes.",
    id: "Mengarah ke menu Anda. Anda akan mendapat tautan berbagi + QR untuk melacak pemindaian dan pesanan.",
    vi: "Trỏ đến thực đơn của bạn. Bạn sẽ nhận được liên kết chia sẻ + QR để theo dõi lượt quét và đơn hàng.",
    th: "ชี้ไปยังเมนูของคุณ คุณจะได้ลิงก์แชร์ + คิวอาร์โค้ดเพื่อติดตามการสแกนและออเดอร์",
    zh: "指向您的菜单。您将获得一个分享链接 + 二维码，用于追踪扫描和订单。",
    ja: "あなたのメニューにリンクします。スキャンと注文を追跡できる共有リンクとQRが手に入ります。",
    ko: "메뉴로 연결됩니다. 스캔과 주문을 추적할 수 있는 공유 링크와 QR을 받게 됩니다.",
    ar: "يشير إلى قائمتك. ستحصل على رابط مشاركة + رمز QR لتتبع عمليات المسح والطلبات.",
    he: "מפנה לתפריט שלך. תקבל קישור לשיתוף + QR למעקב אחר סריקות והזמנות.",
    hi: "आपके मेन्यू पर ले जाता है। स्कैन और ऑर्डर ट्रैक करने के लिए आपको शेयर लिंक + QR मिलेगा।",
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
  for (const [key, byLoc] of Object.entries(KEYS)) setDeep(data, key, byLoc[loc] ?? byLoc.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ Marketing Studio strings added to ${n} locale(s).`);
