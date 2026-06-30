/** i18n: "sign up to earn" banner (Luigi 2026-06-30) × 38 locales.
 *   ordering.rewardSignupBannerText  (banner headline, {label})
 *   ordering.rewardSignupBannerCta   (button)
 *   admin.rewards.signupBannerTitle  (toggle, {label})
 *   admin.rewards.signupBannerHelp   ({label})
 *   admin.rewards.signupBannerDesc   ({label})
 *  {label} = the store's reward name (e.g. "Pizza Bucks") — keep the placeholder.
 *  Run: npx tsx scripts/i18n-add-reward-signup-banner.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const TEXT: Record<string, string> = {
  en: "Sign up to start earning {label}", fr: "Inscrivez-vous pour gagner des {label}", es: "Regístrate para ganar {label}", it: "Iscriviti per guadagnare {label}",
  pt: "Inscreva-se para ganhar {label}", "pt-BR": "Cadastre-se para ganhar {label}", de: "Registrieren und {label} sammeln", nl: "Meld je aan en spaar {label}",
  ro: "Înscrie-te ca să câștigi {label}", sv: "Registrera dig och tjäna {label}", da: "Tilmeld dig og optjen {label}", nb: "Registrer deg og tjen {label}",
  fi: "Rekisteröidy ja ansaitse {label}", pl: "Zarejestruj się i zbieraj {label}", cs: "Zaregistrujte se a získejte {label}", sk: "Zaregistrujte sa a získajte {label}",
  hu: "Regisztrálj és gyűjts {label}", el: "Εγγραφείτε για να κερδίζετε {label}", bg: "Регистрирайте се, за да печелите {label}", hr: "Registrirajte se i skupljajte {label}",
  sr: "Региструјте се и скупљајте {label}", sl: "Registrirajte se in zbirajte {label}", et: "Registreeru ja teeni {label}", lv: "Reģistrējieties un pelniet {label}",
  lt: "Užsiregistruokite ir kaupkite {label}", tr: "Kaydolun ve {label} kazanın", ru: "Зарегистрируйтесь и зарабатывайте {label}", uk: "Зареєструйтесь і заробляйте {label}",
  ca: "Registra't per guanyar {label}", id: "Daftar untuk mendapatkan {label}", vi: "Đăng ký để bắt đầu kiếm {label}", th: "ลงทะเบียนเพื่อเริ่มรับ {label}",
  zh: "注册即可赚取{label}", ja: "登録して{label}を貯めよう", ko: "가입하고 {label} 적립을 시작하세요", ar: "سجّل لتبدأ في كسب {label}",
  he: "הירשמו כדי לצבור {label}", hi: "{label} कमाना शुरू करने के लिए साइन अप करें",
};

const CTA: Record<string, string> = {
  en: "Sign up", fr: "S'inscrire", es: "Registrarse", it: "Iscriviti", pt: "Inscrever-se", "pt-BR": "Cadastrar", de: "Registrieren", nl: "Aanmelden",
  ro: "Înscrie-te", sv: "Registrera dig", da: "Tilmeld dig", nb: "Registrer deg", fi: "Rekisteröidy", pl: "Zarejestruj się", cs: "Registrovat", sk: "Registrovať",
  hu: "Regisztráció", el: "Εγγραφή", bg: "Регистрация", hr: "Registracija", sr: "Регистрација", sl: "Registracija", et: "Registreeru", lv: "Reģistrēties",
  lt: "Registruotis", tr: "Kaydol", ru: "Регистрация", uk: "Зареєструватися", ca: "Registra't", id: "Daftar", vi: "Đăng ký", th: "ลงทะเบียน",
  zh: "注册", ja: "登録", ko: "가입하기", ar: "سجّل", he: "הרשמה", hi: "साइन अप करें",
};

const TITLE: Record<string, string> = {
  en: "Invite guests to sign up for {label}", fr: "Inviter les visiteurs à s'inscrire pour les {label}", es: "Invitar a los visitantes a registrarse para {label}", it: "Invita gli ospiti a iscriversi per i {label}",
  pt: "Convidar visitantes a inscrever-se para {label}", "pt-BR": "Convidar visitantes a se cadastrar para {label}", de: "Gäste einladen, sich für {label} zu registrieren", nl: "Nodig gasten uit om zich aan te melden voor {label}",
  ro: "Invită vizitatorii să se înscrie pentru {label}", sv: "Bjud in gäster att registrera sig för {label}", da: "Inviter gæster til at tilmelde sig {label}", nb: "Inviter gjester til å registrere seg for {label}",
  fi: "Kutsu vieraat rekisteröitymään {label}-etuun", pl: "Zaproś gości do rejestracji po {label}", cs: "Pozvěte hosty k registraci pro {label}", sk: "Pozvite hostí, aby sa zaregistrovali pre {label}",
  hu: "Hívd meg a vendégeket, hogy regisztráljanak a {label} programra", el: "Προσκαλέστε επισκέπτες να εγγραφούν για {label}", bg: "Поканете гостите да се регистрират за {label}", hr: "Pozovite goste da se registriraju za {label}",
  sr: "Позовите госте да се региструју за {label}", sl: "Povabite goste, da se registrirajo za {label}", et: "Kutsu külalised registreeruma {label} jaoks", lv: "Aiciniet viesus reģistrēties {label}",
  lt: "Pakvieskite svečius užsiregistruoti dėl {label}", tr: "Misafirleri {label} için kaydolmaya davet edin", ru: "Пригласите гостей зарегистрироваться для {label}", uk: "Запросіть гостей зареєструватися для {label}",
  ca: "Convida els visitants a registrar-se per a {label}", id: "Ajak tamu mendaftar untuk {label}", vi: "Mời khách đăng ký để nhận {label}", th: "เชิญชวนผู้เยี่ยมชมให้ลงทะเบียนเพื่อรับ {label}",
  zh: "邀请访客注册以获得{label}", ja: "ゲストに{label}への登録を促す", ko: "방문객에게 {label} 가입을 권유", ar: "ادعُ الزوار للتسجيل للحصول على {label}",
  he: "הזמינו אורחים להירשם ל-{label}", hi: "मेहमानों को {label} के लिए साइन अप करने के लिए आमंत्रित करें",
};

const HELP: Record<string, string> = {
  en: "Guests can only earn and spend {label} with an account. This shows a sign-up banner on your order page.",
  fr: "Les visiteurs ne peuvent gagner et dépenser des {label} qu'avec un compte. Ceci affiche une bannière d'inscription sur votre page de commande.",
  es: "Los visitantes solo pueden ganar y usar {label} con una cuenta. Esto muestra un banner de registro en tu página de pedidos.",
  it: "Gli ospiti possono guadagnare e usare i {label} solo con un account. Mostra un banner di iscrizione sulla pagina degli ordini.",
  pt: "Os visitantes só podem ganhar e usar {label} com uma conta. Isto mostra um banner de inscrição na sua página de pedidos.",
  "pt-BR": "Os visitantes só podem ganhar e usar {label} com uma conta. Isto exibe um banner de cadastro na sua página de pedidos.",
  de: "Gäste können {label} nur mit einem Konto sammeln und einlösen. Dies zeigt ein Registrierungs-Banner auf Ihrer Bestellseite.",
  nl: "Gasten kunnen {label} alleen sparen en gebruiken met een account. Dit toont een aanmeldbanner op je bestelpagina.",
  ro: "Vizitatorii pot câștiga și folosi {label} doar cu un cont. Aceasta afișează un banner de înscriere pe pagina de comandă.",
  sv: "Gäster kan bara tjäna och använda {label} med ett konto. Detta visar en registreringsbanner på din beställningssida.",
  da: "Gæster kan kun optjene og bruge {label} med en konto. Dette viser et tilmeldingsbanner på din bestillingsside.",
  nb: "Gjester kan bare tjene og bruke {label} med en konto. Dette viser et registreringsbanner på bestillingssiden din.",
  fi: "Vieraat voivat ansaita ja käyttää {label}-etua vain tilillä. Tämä näyttää rekisteröitymisbannerin tilaussivullasi.",
  pl: "Goście mogą zdobywać i wydawać {label} tylko z kontem. To pokazuje baner rejestracji na stronie zamówień.",
  cs: "Hosté mohou {label} získávat a utrácet jen s účtem. Toto zobrazí registrační banner na vaší stránce objednávek.",
  sk: "Hostia môžu {label} získavať a míňať len s účtom. Toto zobrazí registračný baner na vašej stránke objednávok.",
  hu: "A vendégek csak fiókkal gyűjthetnek és költhetnek {label}. Ez egy regisztrációs bannert jelenít meg a rendelési oldaladon.",
  el: "Οι επισκέπτες μπορούν να κερδίζουν και να εξαργυρώνουν {label} μόνο με λογαριασμό. Εμφανίζει ένα banner εγγραφής στη σελίδα παραγγελιών.",
  bg: "Гостите могат да печелят и харчат {label} само с акаунт. Това показва банер за регистрация на страницата за поръчки.",
  hr: "Gosti mogu skupljati i trošiti {label} samo s računom. Ovo prikazuje banner za registraciju na vašoj stranici za narudžbe.",
  sr: "Гости могу да скупљају и троше {label} само са налогом. Ово приказује банер за регистрацију на страници за поруџбине.",
  sl: "Gostje lahko {label} zbirajo in porabijo le z računom. To prikaže pasico za registracijo na vaši strani za naročila.",
  et: "Külalised saavad {label} teenida ja kulutada ainult kontoga. See näitab tellimislehel registreerumisbännerit.",
  lv: "Viesi var nopelnīt un tērēt {label} tikai ar kontu. Tas rāda reģistrācijas reklāmkarogu jūsu pasūtījumu lapā.",
  lt: "Svečiai gali kaupti ir leisti {label} tik turėdami paskyrą. Tai rodo registracijos reklamjuostę jūsų užsakymų puslapyje.",
  tr: "Misafirler {label} yalnızca hesapla kazanıp harcayabilir. Bu, sipariş sayfanızda bir kayıt afişi gösterir.",
  ru: "Гости могут зарабатывать и тратить {label} только с аккаунтом. Это показывает баннер регистрации на странице заказа.",
  uk: "Гості можуть заробляти та витрачати {label} лише з обліковим записом. Це показує банер реєстрації на сторінці замовлення.",
  ca: "Els visitants només poden guanyar i gastar {label} amb un compte. Això mostra un bàner de registre a la pàgina de comandes.",
  id: "Tamu hanya bisa mendapatkan dan memakai {label} dengan akun. Ini menampilkan banner pendaftaran di halaman pesanan Anda.",
  vi: "Khách chỉ có thể kiếm và dùng {label} khi có tài khoản. Tùy chọn này hiển thị biểu ngữ đăng ký trên trang đặt hàng của bạn.",
  th: "แขกจะรับและใช้ {label} ได้เฉพาะเมื่อมีบัญชี ตัวเลือกนี้จะแสดงแบนเนอร์ลงทะเบียนบนหน้าสั่งซื้อของคุณ",
  zh: "访客只有注册账户后才能赚取和使用{label}。此选项会在您的点餐页面显示注册横幅。",
  ja: "ゲストはアカウントがある場合のみ{label}を貯めて使えます。注文ページに登録バナーを表示します。",
  ko: "게스트는 계정이 있어야만 {label}을(를) 적립하고 사용할 수 있습니다. 주문 페이지에 가입 배너를 표시합니다.",
  ar: "لا يمكن للزوار كسب {label} وإنفاقها إلا بحساب. يعرض هذا لافتة تسجيل على صفحة الطلب.",
  he: "אורחים יכולים לצבור ולממש {label} רק עם חשבון. אפשרות זו מציגה באנר הרשמה בעמוד ההזמנות.",
  hi: "मेहमान केवल खाते के साथ ही {label} कमा और खर्च कर सकते हैं। यह आपके ऑर्डर पेज पर साइन-अप बैनर दिखाता है।",
};

const DESC: Record<string, string> = {
  en: "Logged-out customers see a banner inviting them to create an account and start earning {label}.",
  fr: "Les clients déconnectés voient une bannière les invitant à créer un compte et à gagner des {label}.",
  es: "Los clientes sin sesión ven un banner que los invita a crear una cuenta y empezar a ganar {label}.",
  it: "I clienti non connessi vedono un banner che li invita a creare un account e iniziare a guadagnare {label}.",
  pt: "Os clientes não autenticados veem um banner que os convida a criar uma conta e começar a ganhar {label}.",
  "pt-BR": "Clientes não logados veem um banner convidando a criar uma conta e começar a ganhar {label}.",
  de: "Abgemeldete Kunden sehen ein Banner, das sie einlädt, ein Konto zu erstellen und {label} zu sammeln.",
  nl: "Uitgelogde klanten zien een banner die hen uitnodigt een account aan te maken en {label} te sparen.",
  ro: "Clienții deconectați văd un banner care îi invită să creeze un cont și să câștige {label}.",
  sv: "Utloggade kunder ser en banner som bjuder in dem att skapa ett konto och tjäna {label}.",
  da: "Udloggede kunder ser et banner, der inviterer dem til at oprette en konto og optjene {label}.",
  nb: "Utloggede kunder ser et banner som inviterer dem til å opprette en konto og tjene {label}.",
  fi: "Uloskirjautuneet asiakkaat näkevät bannerin, joka kutsuu luomaan tilin ja ansaitsemaan {label}.",
  pl: "Wylogowani klienci widzą baner zachęcający do założenia konta i zbierania {label}.",
  cs: "Odhlášení zákazníci uvidí banner, který je vyzývá k vytvoření účtu a získávání {label}.",
  sk: "Odhlásení zákazníci uvidia baner, ktorý ich vyzýva vytvoriť si účet a získavať {label}.",
  hu: "A kijelentkezett vásárlók egy bannert látnak, amely fiók létrehozására és {label} gyűjtésére hívja őket.",
  el: "Οι αποσυνδεδεμένοι πελάτες βλέπουν ένα banner που τους καλεί να δημιουργήσουν λογαριασμό και να κερδίζουν {label}.",
  bg: "Излезлите клиенти виждат банер, който ги кани да създадат акаунт и да печелят {label}.",
  hr: "Odjavljeni kupci vide banner koji ih poziva da otvore račun i počnu skupljati {label}.",
  sr: "Одјављени купци виде банер који их позива да направе налог и почну да скупљају {label}.",
  sl: "Odjavljene stranke vidijo pasico, ki jih vabi k ustvarjanju računa in zbiranju {label}.",
  et: "Välja logitud kliendid näevad bännerit, mis kutsub looma konto ja teenima {label}.",
  lv: "Izrakstījušies klienti redz reklāmkarogu, kas aicina izveidot kontu un pelnīt {label}.",
  lt: "Atsijungę klientai mato reklamjuostę, kviečiančią susikurti paskyrą ir kaupti {label}.",
  tr: "Oturumu kapalı müşteriler, hesap oluşturup {label} kazanmaya davet eden bir afiş görür.",
  ru: "Вышедшие из аккаунта клиенты видят баннер с приглашением создать аккаунт и зарабатывать {label}.",
  uk: "Клієнти без входу бачать банер із запрошенням створити обліковий запис і заробляти {label}.",
  ca: "Els clients sense sessió veuen un bàner que els convida a crear un compte i començar a guanyar {label}.",
  id: "Pelanggan yang belum masuk melihat banner yang mengajak membuat akun dan mulai mendapatkan {label}.",
  vi: "Khách chưa đăng nhập thấy biểu ngữ mời tạo tài khoản và bắt đầu kiếm {label}.",
  th: "ลูกค้าที่ยังไม่ได้เข้าสู่ระบบจะเห็นแบนเนอร์เชิญชวนให้สร้างบัญชีและเริ่มรับ {label}",
  zh: "未登录的顾客会看到一个横幅，邀请他们创建账户并开始赚取{label}。",
  ja: "ログアウト中のお客様には、アカウント作成と{label}獲得を促すバナーが表示されます。",
  ko: "로그아웃한 고객에게 계정을 만들고 {label} 적립을 시작하도록 권하는 배너가 표시됩니다.",
  ar: "يرى العملاء غير المسجّلين لافتة تدعوهم لإنشاء حساب وبدء كسب {label}.",
  he: "לקוחות שאינם מחוברים רואים באנר שמזמין אותם ליצור חשבון ולהתחיל לצבור {label}.",
  hi: "लॉग-आउट ग्राहक एक बैनर देखते हैं जो उन्हें खाता बनाने और {label} कमाना शुरू करने के लिए आमंत्रित करता है।",
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
  setDeep(data, "ordering.rewardSignupBannerText", TEXT[loc] ?? TEXT.en);
  setDeep(data, "ordering.rewardSignupBannerCta", CTA[loc] ?? CTA.en);
  setDeep(data, "admin.rewards.signupBannerTitle", TITLE[loc] ?? TITLE.en);
  setDeep(data, "admin.rewards.signupBannerHelp", HELP[loc] ?? HELP.en);
  setDeep(data, "admin.rewards.signupBannerDesc", DESC[loc] ?? DESC.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ reward signup-banner strings added to ${n} locale(s).`);
