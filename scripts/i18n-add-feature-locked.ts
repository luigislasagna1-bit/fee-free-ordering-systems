/** i18n: generic FeatureLockedView framing strings × 38.
 *    admin.featureLocked.{badge, subtitle, cta, footerNote}
 *    npx tsx scripts/i18n-add-feature-locked.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.featureLocked.badge": {
    en: "Paid add-on", fr: "Module payant", es: "Complemento de pago", it: "Componente aggiuntivo a pagamento", pt: "Extra pago", "pt-BR": "Complemento pago",
    de: "Kostenpflichtiges Add-on", nl: "Betaalde add-on", ro: "Supliment cu plată", sv: "Betalt tillägg", da: "Betalt tilføjelse", nb: "Betalt tillegg",
    fi: "Maksullinen lisäosa", pl: "Płatny dodatek", cs: "Placený doplněk", sk: "Platený doplnok", hu: "Fizetős bővítmény", el: "Πληρωμένο πρόσθετο",
    bg: "Платена добавка", hr: "Plaćeni dodatak", sr: "Плаћени додатак", sl: "Plačljiv dodatek", et: "Tasuline lisa", lv: "Maksas papildinājums",
    lt: "Mokamas priedas", tr: "Ücretli eklenti", ru: "Платное дополнение", uk: "Платне доповнення", ca: "Complement de pagament", id: "Add-on berbayar",
    vi: "Tiện ích trả phí", th: "ส่วนเสริมแบบชำระเงิน", zh: "付费附加功能", ja: "有料アドオン", ko: "유료 부가 기능", ar: "إضافة مدفوعة", he: "תוסף בתשלום", hi: "सशुल्क ऐड-ऑन",
  },
  "admin.featureLocked.subtitle": {
    en: "This premium feature isn't included on your current plan. Subscribe to the add-on to unlock it for your restaurant.",
    fr: "Cette fonctionnalité premium n'est pas incluse dans votre forfait actuel. Abonnez-vous au module pour la débloquer pour votre restaurant.",
    es: "Esta función premium no está incluida en tu plan actual. Suscríbete al complemento para desbloquearla para tu restaurante.",
    it: "Questa funzione premium non è inclusa nel tuo piano attuale. Abbonati al componente aggiuntivo per sbloccarla per il tuo ristorante.",
    pt: "Esta funcionalidade premium não está incluída no seu plano atual. Subscreva o extra para a desbloquear para o seu restaurante.",
    "pt-BR": "Este recurso premium não está incluído no seu plano atual. Assine o complemento para desbloqueá-lo para o seu restaurante.",
    de: "Diese Premium-Funktion ist in Ihrem aktuellen Tarif nicht enthalten. Abonnieren Sie das Add-on, um sie für Ihr Restaurant freizuschalten.",
    nl: "Deze premiumfunctie zit niet in je huidige abonnement. Abonneer je op de add-on om deze te ontgrendelen voor je restaurant.",
    ro: "Această funcție premium nu este inclusă în planul tău actual. Abonează-te la supliment pentru a o debloca pentru restaurantul tău.",
    sv: "Den här premiumfunktionen ingår inte i din nuvarande plan. Prenumerera på tillägget för att låsa upp den för din restaurang.",
    da: "Denne premium-funktion er ikke inkluderet i din nuværende plan. Abonner på tilføjelsen for at låse den op for din restaurant.",
    nb: "Denne premiumfunksjonen er ikke inkludert i din nåværende plan. Abonner på tillegget for å låse den opp for restauranten din.",
    fi: "Tämä premium-ominaisuus ei sisälly nykyiseen tilaukseesi. Tilaa lisäosa avataksesi sen ravintolallesi.",
    pl: "Ta funkcja premium nie jest objęta Twoim obecnym planem. Subskrybuj dodatek, aby odblokować ją dla swojej restauracji.",
    cs: "Tato prémiová funkce není součástí vašeho aktuálního plánu. Předplaťte si doplněk a odemkněte ji pro svou restauraci.",
    sk: "Táto prémiová funkcia nie je súčasťou vášho aktuálneho plánu. Predplaťte si doplnok a odomknite ju pre svoju reštauráciu.",
    hu: "Ez a prémium funkció nem része a jelenlegi csomagodnak. Fizess elő a bővítményre, hogy feloldd az éttermed számára.",
    el: "Αυτή η premium λειτουργία δεν περιλαμβάνεται στο τρέχον πρόγραμμά σας. Εγγραφείτε στο πρόσθετο για να την ξεκλειδώσετε για το εστιατόριό σας.",
    bg: "Тази премиум функция не е включена в текущия ви план. Абонирайте се за добавката, за да я отключите за вашия ресторант.",
    hr: "Ova premium značajka nije uključena u vaš trenutni plan. Pretplatite se na dodatak da biste je otključali za svoj restoran.",
    sr: "Ова премиум функција није укључена у ваш тренутни план. Претплатите се на додатак да бисте је откључали за свој ресторан.",
    sl: "Ta vrhunska funkcija ni vključena v vaš trenutni paket. Naročite se na dodatek, da jo odklenete za svojo restavracijo.",
    et: "See lisafunktsioon ei sisaldu teie praeguses paketis. Tellige lisa, et see oma restorani jaoks avada.",
    lv: "Šī premium funkcija nav iekļauta jūsu pašreizējā plānā. Abonējiet papildinājumu, lai to atbloķētu savam restorānam.",
    lt: "Ši aukščiausios klasės funkcija neįtraukta į jūsų dabartinį planą. Užsiprenumeruokite priedą, kad atrakintumėte ją savo restoranui.",
    tr: "Bu premium özellik mevcut planınıza dahil değil. Restoranınız için kilidini açmak üzere eklentiye abone olun.",
    ru: "Эта премиум-функция не входит в ваш текущий тариф. Подпишитесь на дополнение, чтобы разблокировать её для вашего ресторана.",
    uk: "Ця преміум-функція не входить до вашого поточного плану. Підпишіться на доповнення, щоб розблокувати її для вашого ресторану.",
    ca: "Aquesta funció premium no s'inclou en el teu pla actual. Subscriu-te al complement per desbloquejar-la per al teu restaurant.",
    id: "Fitur premium ini tidak termasuk dalam paket Anda saat ini. Berlangganan add-on untuk membukanya bagi restoran Anda.",
    vi: "Tính năng cao cấp này không có trong gói hiện tại của bạn. Đăng ký tiện ích để mở khóa nó cho nhà hàng của bạn.",
    th: "ฟีเจอร์พรีเมียมนี้ไม่รวมอยู่ในแผนปัจจุบันของคุณ สมัครส่วนเสริมเพื่อปลดล็อกสำหรับร้านอาหารของคุณ",
    zh: "此高级功能不包含在您当前的套餐中。订阅此附加功能即可为您的餐厅解锁。",
    ja: "このプレミアム機能は現在のプランには含まれていません。アドオンを購読してレストランで利用できるようにしましょう。",
    ko: "이 프리미엄 기능은 현재 요금제에 포함되어 있지 않습니다. 부가 기능을 구독하여 레스토랑에서 사용해 보세요.",
    ar: "هذه الميزة المتميزة غير مضمّنة في خطتك الحالية. اشترك في الإضافة لتفعيلها لمطعمك.",
    he: "תכונת הפרימיום הזו אינה כלולה בתוכנית הנוכחית שלך. הירשם לתוסף כדי לפתוח אותה עבור המסעדה שלך.",
    hi: "यह प्रीमियम सुविधा आपकी मौजूदा योजना में शामिल नहीं है। इसे अपने रेस्तरां के लिए अनलॉक करने हेतु ऐड-ऑन की सदस्यता लें।",
  },
  "admin.featureLocked.cta": {
    en: "Unlock this add-on", fr: "Débloquer ce module", es: "Desbloquear este complemento", it: "Sblocca questo componente aggiuntivo", pt: "Desbloquear este extra", "pt-BR": "Desbloquear este complemento",
    de: "Dieses Add-on freischalten", nl: "Deze add-on ontgrendelen", ro: "Deblochează acest supliment", sv: "Lås upp detta tillägg", da: "Lås denne tilføjelse op", nb: "Lås opp dette tillegget",
    fi: "Avaa tämä lisäosa", pl: "Odblokuj ten dodatek", cs: "Odemknout tento doplněk", sk: "Odomknúť tento doplnok", hu: "Bővítmény feloldása", el: "Ξεκλείδωμα αυτού του πρόσθετου",
    bg: "Отключи тази добавка", hr: "Otključaj ovaj dodatak", sr: "Откључај овај додатак", sl: "Odkleni ta dodatek", et: "Ava see lisa", lv: "Atbloķēt šo papildinājumu",
    lt: "Atrakinti šį priedą", tr: "Bu eklentinin kilidini aç", ru: "Разблокировать это дополнение", uk: "Розблокувати це доповнення", ca: "Desbloqueja aquest complement", id: "Buka add-on ini",
    vi: "Mở khóa tiện ích này", th: "ปลดล็อกส่วนเสริมนี้", zh: "解锁此附加功能", ja: "このアドオンを解除", ko: "이 부가 기능 잠금 해제", ar: "تفعيل هذه الإضافة", he: "פתח תוסף זה", hi: "इस ऐड-ऑन को अनलॉक करें",
  },
  "admin.featureLocked.footerNote": {
    en: "Billing is handled securely through Stripe. Cancel anytime.",
    fr: "La facturation est gérée en toute sécurité via Stripe. Annulez à tout moment.",
    es: "La facturación se gestiona de forma segura a través de Stripe. Cancela cuando quieras.",
    it: "La fatturazione è gestita in modo sicuro tramite Stripe. Annulla quando vuoi.",
    pt: "A faturação é processada de forma segura através do Stripe. Cancele quando quiser.",
    "pt-BR": "A cobrança é processada com segurança pelo Stripe. Cancele quando quiser.",
    de: "Die Abrechnung erfolgt sicher über Stripe. Jederzeit kündbar.",
    nl: "Facturering verloopt veilig via Stripe. Altijd opzegbaar.",
    ro: "Facturarea este gestionată în siguranță prin Stripe. Anulează oricând.",
    sv: "Faktureringen hanteras säkert via Stripe. Avbryt när som helst.",
    da: "Betaling håndteres sikkert via Stripe. Opsig når som helst.",
    nb: "Faktureringen håndteres sikkert via Stripe. Si opp når som helst.",
    fi: "Laskutus hoidetaan turvallisesti Stripen kautta. Peru milloin tahansa.",
    pl: "Płatności są obsługiwane bezpiecznie przez Stripe. Anuluj w dowolnym momencie.",
    cs: "Fakturace probíhá bezpečně přes Stripe. Zrušit můžete kdykoli.",
    sk: "Fakturácia prebieha bezpečne cez Stripe. Zrušiť môžete kedykoľvek.",
    hu: "A számlázás biztonságosan a Stripe-on keresztül történik. Bármikor lemondható.",
    el: "Η χρέωση γίνεται με ασφάλεια μέσω Stripe. Ακυρώστε οποιαδήποτε στιγμή.",
    bg: "Таксуването се обработва сигурно чрез Stripe. Отменете по всяко време.",
    hr: "Naplata se sigurno obrađuje putem Stripea. Otkažite bilo kada.",
    sr: "Наплата се безбедно обрађује преко Stripe-а. Откажите било кад.",
    sl: "Obračun poteka varno prek Stripe. Prekličete lahko kadar koli.",
    et: "Arveldus toimub turvaliselt Stripe'i kaudu. Tühista igal ajal.",
    lv: "Norēķini tiek droši apstrādāti, izmantojot Stripe. Atceliet jebkurā laikā.",
    lt: "Atsiskaitymai saugiai tvarkomi per Stripe. Atšaukite bet kada.",
    tr: "Faturalandırma Stripe üzerinden güvenle yapılır. İstediğiniz zaman iptal edin.",
    ru: "Оплата безопасно обрабатывается через Stripe. Отмена в любое время.",
    uk: "Оплата безпечно обробляється через Stripe. Скасуйте будь-коли.",
    ca: "La facturació es gestiona de manera segura a través de Stripe. Cancel·la quan vulguis.",
    id: "Penagihan ditangani dengan aman melalui Stripe. Batalkan kapan saja.",
    vi: "Việc thanh toán được xử lý an toàn qua Stripe. Hủy bất cứ lúc nào.",
    th: "การเรียกเก็บเงินดำเนินการอย่างปลอดภัยผ่าน Stripe ยกเลิกได้ทุกเมื่อ",
    zh: "账单通过 Stripe 安全处理。随时可取消。",
    ja: "請求は Stripe を通じて安全に処理されます。いつでもキャンセルできます。",
    ko: "결제는 Stripe를 통해 안전하게 처리됩니다. 언제든지 취소할 수 있습니다.",
    ar: "تتم معالجة الفوترة بأمان عبر Stripe. يمكنك الإلغاء في أي وقت.",
    he: "החיוב מטופל באופן מאובטח דרך Stripe. ניתן לבטל בכל עת.",
    hi: "बिलिंग Stripe के माध्यम से सुरक्षित रूप से होती है। कभी भी रद्द करें।",
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
console.log(`✓ feature-locked strings (${Object.keys(KEYS).length} keys) added to ${n} locale(s).`);
