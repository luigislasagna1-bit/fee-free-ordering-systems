/**
 * i18n: mandatory login-email field on the Add-Location modal (Luigi 2026-06-10)
 * across all 38 locales. Keys: admin.locations.fieldEmail + fieldEmailHint.
 *   npx tsx scripts/i18n-add-location-email.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.locations.fieldEmail": {
    en: "Login email", fr: "E-mail de connexion", es: "Correo de inicio de sesión", it: "Email di accesso", pt: "E-mail de início de sessão", "pt-BR": "E-mail de login",
    de: "Anmelde-E-Mail", nl: "Inlog-e-mail", ro: "E-mail de conectare", sv: "Inloggnings-e-post", da: "Login-e-mail", nb: "Innloggings-e-post",
    fi: "Kirjautumissähköposti", pl: "E-mail logowania", cs: "Přihlašovací e-mail", sk: "Prihlasovací e-mail", hu: "Bejelentkezési e-mail", el: "Email σύνδεσης",
    bg: "Имейл за вход", hr: "E-pošta za prijavu", sr: "Имејл за пријаву", sl: "E-naslov za prijavo", et: "Sisselogimise e-post", lv: "Pieteikšanās e-pasts",
    lt: "Prisijungimo el. paštas", tr: "Giriş e-postası", ru: "Эл. почта для входа", uk: "Електронна пошта для входу", ca: "Correu d'inici de sessió", id: "Email login",
    vi: "Email đăng nhập", th: "อีเมลสำหรับเข้าสู่ระบบ", zh: "登录邮箱", ja: "ログイン用メール", ko: "로그인 이메일", ar: "البريد الإلكتروني لتسجيل الدخول", he: "אימייל להתחברות", hi: "लॉगिन ईमेल",
  },
  "admin.locations.fieldEmailHint": {
    en: "This becomes the location's own admin login — we'll email them a link to set a password.",
    fr: "Cela devient l'identifiant d'administration propre à l'établissement — nous lui enverrons un lien pour définir un mot de passe.",
    es: "Este será el acceso de administrador propio de la ubicación — le enviaremos un enlace para establecer una contraseña.",
    it: "Diventa l'accesso amministratore dedicato della sede — invieremo un link per impostare una password.",
    pt: "Torna-se o acesso de administrador próprio do local — enviaremos um link para definir uma palavra-passe.",
    "pt-BR": "Este será o login de administrador próprio do local — enviaremos um link para definir uma senha.",
    de: "Dies wird der eigene Admin-Login des Standorts — wir senden einen Link zum Festlegen eines Passworts.",
    nl: "Dit wordt de eigen beheerderslogin van de locatie — we sturen een link om een wachtwoord in te stellen.",
    ro: "Acesta devine contul de administrator propriu al locației — îi vom trimite un link pentru a seta o parolă.",
    sv: "Detta blir platsens egna admininloggning — vi mejlar en länk för att ange ett lösenord.",
    da: "Dette bliver lokationens egen admin-login — vi sender et link til at oprette en adgangskode.",
    nb: "Dette blir stedets egen admin-pålogging — vi sender en lenke for å sette et passord.",
    fi: "Tästä tulee toimipisteen oma järjestelmänvalvojan kirjautuminen — lähetämme linkin salasanan asettamiseksi.",
    pl: "To będzie własny login administratora lokalu — wyślemy link do ustawienia hasła.",
    cs: "Toto se stane vlastním administrátorským přihlášením pobočky — pošleme odkaz pro nastavení hesla.",
    sk: "Toto sa stane vlastným administrátorským prihlásením prevádzky — pošleme odkaz na nastavenie hesla.",
    hu: "Ez lesz a helyszín saját rendszergazdai bejelentkezése — küldünk egy linket a jelszó beállításához.",
    el: "Αυτό γίνεται το δικό του διαχειριστικό login της τοποθεσίας — θα στείλουμε σύνδεσμο για ορισμό κωδικού.",
    bg: "Това става собственият администраторски вход на обекта — ще изпратим връзка за задаване на парола.",
    hr: "Ovo postaje vlastiti administratorski login lokacije — poslat ćemo poveznicu za postavljanje lozinke.",
    sr: "Ово постаје сопствена администраторска пријава локације — послаћемо везу за постављање лозинке.",
    sl: "To postane lastna skrbniška prijava lokacije — poslali bomo povezavo za nastavitev gesla.",
    et: "Sellest saab asukoha oma administraatori sisselogimine — saadame lingi parooli määramiseks.",
    lv: "Tas kļūst par atrašanās vietas savu administratora pieteikšanos — nosūtīsim saiti paroles iestatīšanai.",
    lt: "Tai taps vietos administratoriaus prisijungimu — atsiųsime nuorodą slaptažodžiui nustatyti.",
    tr: "Bu, konumun kendi yönetici girişi olur — şifre belirlemeleri için bir bağlantı e-postayla göndereceğiz.",
    ru: "Это станет собственным входом администратора для точки — мы отправим ссылку для установки пароля.",
    uk: "Це стане власним входом адміністратора для точки — ми надішлемо посилання для встановлення пароля.",
    ca: "Aquest serà l'accés d'administrador propi de la ubicació — li enviarem un enllaç per definir una contrasenya.",
    id: "Ini menjadi login admin lokasi tersebut — kami akan mengirim tautan untuk mengatur kata sandi.",
    vi: "Đây sẽ là tài khoản quản trị riêng của địa điểm — chúng tôi sẽ gửi liên kết để đặt mật khẩu.",
    th: "อีเมลนี้จะกลายเป็นบัญชีผู้ดูแลของสาขานี้เอง — เราจะส่งลิงก์ให้ตั้งรหัสผ่าน",
    zh: "这将成为该门店自己的管理员登录账号——我们会发送设置密码的链接。",
    ja: "これはその店舗専用の管理者ログインになります。パスワード設定用のリンクをメールで送信します。",
    ko: "이 이메일은 해당 매장 전용 관리자 로그인이 됩니다 — 비밀번호 설정 링크를 보내드립니다.",
    ar: "يصبح هذا تسجيل دخول المسؤول الخاص بالموقع — سنرسل رابطًا لتعيين كلمة مرور.",
    he: "זה הופך לכניסת המנהל הייחודית של הסניף — נשלח קישור להגדרת סיסמה.",
    hi: "यह उस लोकेशन का अपना एडमिन लॉगिन बन जाता है — हम पासवर्ड सेट करने के लिए एक लिंक ईमेल करेंगे।",
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
console.log(`✓ location login-email strings added to ${n} locale(s).`);
