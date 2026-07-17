/**
 * Driver-app login "two doors" clarity (Luigi 2026-07-16, first iOS session):
 * he typed his RESTAURANT credentials into the DRIVER form and got a generic
 * "invalid password" — proof the doors are indistinguishable.
 *  1. feefreeApp.restaurantLoginCta — reword: the old "Sign in with your
 *     dashboard login" read like it leaves the app.
 *  2. driver.invalidDriverLogin — NEW: driver-form failure now points
 *     restaurant folks to the right door.
 * Run: npx tsx scripts/i18n-add-driver-login-doors.ts   (then parity audit)
 */
import { readFileSync, writeFileSync } from "node:fs";

const CTA: Record<string, string> = {
  en: "Restaurant? Sign in here to manage your deliveries",
  fr: "Restaurant ? Connectez-vous ici pour gérer vos livraisons",
  es: "¿Restaurante? Inicia sesión aquí para gestionar tus entregas",
  it: "Ristorante? Accedi qui per gestire le tue consegne",
  pt: "Restaurante? Inicie sessão aqui para gerir as suas entregas",
  "pt-BR": "Restaurante? Entre aqui para gerenciar suas entregas",
  de: "Restaurant? Hier anmelden, um Ihre Lieferungen zu verwalten",
  nl: "Restaurant? Log hier in om je bezorgingen te beheren",
  ro: "Restaurant? Autentifică-te aici pentru a-ți gestiona livrările",
  sv: "Restaurang? Logga in här för att hantera dina leveranser",
  da: "Restaurant? Log ind her for at administrere dine leveringer",
  nb: "Restaurant? Logg inn her for å administrere leveringene dine",
  fi: "Ravintola? Kirjaudu tästä hallitaksesi toimituksiasi",
  pl: "Restauracja? Zaloguj się tutaj, aby zarządzać dostawami",
  cs: "Restaurace? Přihlaste se zde a spravujte svá doručení",
  sk: "Reštaurácia? Prihláste sa tu a spravujte svoje doručenia",
  hu: "Étterem? Jelentkezzen be itt a kiszállítások kezeléséhez",
  el: "Εστιατόριο; Συνδεθείτε εδώ για να διαχειριστείτε τις παραδόσεις σας",
  bg: "Ресторант? Влезте тук, за да управлявате доставките си",
  hr: "Restoran? Prijavite se ovdje za upravljanje dostavama",
  sr: "Restoran? Prijavite se ovde da upravljate dostavama",
  sl: "Restavracija? Prijavite se tukaj za upravljanje dostav",
  et: "Restoran? Logi siia sisse, et hallata oma tarneid",
  lv: "Restorāns? Piesakieties šeit, lai pārvaldītu piegādes",
  lt: "Restoranas? Prisijunkite čia ir valdykite pristatymus",
  tr: "Restoran mı? Teslimatlarınızı yönetmek için buradan giriş yapın",
  ru: "Ресторан? Войдите здесь, чтобы управлять доставками",
  uk: "Ресторан? Увійдіть тут, щоб керувати доставками",
  ca: "Restaurant? Inicia sessió aquí per gestionar els teus lliuraments",
  id: "Restoran? Masuk di sini untuk mengelola pengiriman Anda",
  vi: "Nhà hàng? Đăng nhập tại đây để quản lý đơn giao hàng",
  th: "ร้านอาหาร? เข้าสู่ระบบที่นี่เพื่อจัดการการจัดส่งของคุณ",
  zh: "餐厅？在此登录以管理您的配送",
  ja: "レストランの方はこちらからログインして配達を管理",
  ko: "레스토랑이신가요? 여기에서 로그인하여 배달을 관리하세요",
  ar: "مطعم؟ سجّل الدخول هنا لإدارة توصيلاتك",
  he: "מסעדה? התחברו כאן לניהול המשלוחים שלכם",
  hi: "रेस्टोरेंट? अपनी डिलीवरी प्रबंधित करने के लिए यहां साइन इन करें",
};

const INVALID: Record<string, string> = {
  en: "No driver account matches these details. Restaurant owner or staff? Use the restaurant sign-in below.",
  fr: "Aucun compte livreur ne correspond à ces informations. Propriétaire ou personnel d'un restaurant ? Utilisez la connexion restaurant ci-dessous.",
  es: "Ningún repartidor coincide con estos datos. ¿Dueño o personal de un restaurante? Usa el acceso para restaurantes más abajo.",
  it: "Nessun account autista corrisponde a questi dati. Titolare o staff di un ristorante? Usa l'accesso ristorante qui sotto.",
  pt: "Nenhuma conta de estafeta corresponde a estes dados. Dono ou funcionário de restaurante? Use o acesso de restaurante abaixo.",
  "pt-BR": "Nenhuma conta de entregador corresponde a esses dados. Dono ou equipe de restaurante? Use o acesso de restaurante abaixo.",
  de: "Kein Fahrerkonto passt zu diesen Angaben. Restaurantinhaber oder -personal? Nutzen Sie die Restaurant-Anmeldung unten.",
  nl: "Geen bezorgersaccount komt overeen met deze gegevens. Restauranteigenaar of -medewerker? Gebruik de restaurant-login hieronder.",
  ro: "Niciun cont de livrator nu corespunde acestor date. Proprietar sau angajat de restaurant? Folosește autentificarea pentru restaurante de mai jos.",
  sv: "Inget förarkonto matchar dessa uppgifter. Restaurangägare eller personal? Använd restauranginloggningen nedan.",
  da: "Ingen chaufførkonto matcher disse oplysninger. Restaurantejer eller personale? Brug restaurant-login nedenfor.",
  nb: "Ingen sjåførkonto samsvarer med disse opplysningene. Restauranteier eller ansatt? Bruk restaurantinnloggingen nedenfor.",
  fi: "Näillä tiedoilla ei löytynyt kuljettajatiliä. Ravintolan omistaja tai työntekijä? Käytä alla olevaa ravintolakirjautumista.",
  pl: "Brak konta kierowcy pasującego do tych danych. Właściciel lub pracownik restauracji? Użyj logowania dla restauracji poniżej.",
  cs: "Těmto údajům neodpovídá žádný účet řidiče. Majitel nebo personál restaurace? Použijte přihlášení pro restaurace níže.",
  sk: "Týmto údajom nezodpovedá žiadny účet vodiča. Majiteľ alebo personál reštaurácie? Použite prihlásenie pre reštaurácie nižšie.",
  hu: "Ezekkel az adatokkal nem található futárfiók. Étterem-tulajdonos vagy alkalmazott? Használja az alábbi éttermi bejelentkezést.",
  el: "Δεν βρέθηκε λογαριασμός οδηγού με αυτά τα στοιχεία. Ιδιοκτήτης ή προσωπικό εστιατορίου; Χρησιμοποιήστε τη σύνδεση εστιατορίου παρακάτω.",
  bg: "Няма шофьорски акаунт с тези данни. Собственик или персонал на ресторант? Използвайте входа за ресторанти по-долу.",
  hr: "Nijedan vozački račun ne odgovara ovim podacima. Vlasnik ili osoblje restorana? Koristite prijavu za restorane u nastavku.",
  sr: "Nijedan vozački nalog ne odgovara ovim podacima. Vlasnik ili osoblje restorana? Koristite prijavu za restorane ispod.",
  sl: "Noben voznikov račun ne ustreza tem podatkom. Lastnik ali osebje restavracije? Uporabite prijavo za restavracije spodaj.",
  et: "Nendele andmetele ei vasta ükski juhikonto. Restorani omanik või töötaja? Kasutage allolevat restorani sisselogimist.",
  lv: "Neviens kurjera konts neatbilst šiem datiem. Restorāna īpašnieks vai darbinieks? Izmantojiet restorāna pieteikšanos zemāk.",
  lt: "Šių duomenų neatitinka jokia vairuotojo paskyra. Restorano savininkas ar darbuotojas? Naudokitės restorano prisijungimu žemiau.",
  tr: "Bu bilgilerle eşleşen sürücü hesabı yok. Restoran sahibi veya çalışanı mısınız? Aşağıdaki restoran girişini kullanın.",
  ru: "Аккаунт водителя с такими данными не найден. Владелец или сотрудник ресторана? Используйте вход для ресторанов ниже.",
  uk: "Обліковий запис водія з такими даними не знайдено. Власник або працівник ресторану? Скористайтеся входом для ресторанів нижче.",
  ca: "Cap compte de repartidor coincideix amb aquestes dades. Propietari o personal d'un restaurant? Fes servir l'accés per a restaurants de sota.",
  id: "Tidak ada akun pengemudi yang cocok dengan data ini. Pemilik atau staf restoran? Gunakan login restoran di bawah.",
  vi: "Không có tài khoản tài xế nào khớp với thông tin này. Chủ hoặc nhân viên nhà hàng? Hãy dùng đăng nhập nhà hàng bên dưới.",
  th: "ไม่พบบัญชีคนขับที่ตรงกับข้อมูลนี้ เจ้าของหรือพนักงานร้านอาหาร? ใช้การเข้าสู่ระบบร้านอาหารด้านล่าง",
  zh: "没有与这些信息匹配的骑手账号。餐厅老板或员工？请使用下方的餐厅登录。",
  ja: "この情報に一致するドライバーアカウントがありません。レストランのオーナー・スタッフの方は下のレストランログインをご利用ください。",
  ko: "이 정보와 일치하는 기사 계정이 없습니다. 레스토랑 사장님 또는 직원이신가요? 아래의 레스토랑 로그인을 이용하세요.",
  ar: "لا يوجد حساب سائق يطابق هذه البيانات. صاحب مطعم أو موظف؟ استخدم تسجيل دخول المطعم أدناه.",
  he: "לא נמצא חשבון נהג התואם לפרטים אלה. בעלים או צוות של מסעדה? השתמשו בכניסת המסעדה למטה.",
  hi: "इन विवरणों से मेल खाता कोई ड्राइवर खाता नहीं मिला। रेस्टोरेंट मालिक या स्टाफ? नीचे रेस्टोरेंट साइन-इन का उपयोग करें।",
};

const locales = Object.keys(CTA);
if (locales.length !== 38) throw new Error(`expected 38 locales, got ${locales.length}`);

for (const code of locales) {
  const f = `src/messages/${code}.json`;
  const m = JSON.parse(readFileSync(f, "utf8"));
  if (!m.feefreeApp) throw new Error(`${code}: no feefreeApp namespace`);
  if (!m.driver) throw new Error(`${code}: no driver namespace`);
  m.feefreeApp.restaurantLoginCta = CTA[code];
  m.driver.invalidDriverLogin = INVALID[code];
  writeFileSync(f, JSON.stringify(m, null, 2) + "\n", "utf8");
  console.log(`${code} ✓`);
}
console.log("done — run the parity audit next");
