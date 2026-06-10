/**
 * i18n: the drip-sequence editor strings (Luigi 2026-06-10) across all 38 locales.
 * Keys under admin.autopilotClient: stepsHint, stepLabel ({n}), stepDelayLabel,
 * stepDiscountLabel, stepAdd, stepsSave, stepsNeedOne. Other editor strings reuse
 * existing keys (unitDays, campaignSaved, networkError, savingButton,
 * emailSubjectLabel, emailBodyLabel, common.remove).
 *   npx tsx scripts/i18n-add-autopilot-steps.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.autopilotClient.stepLabel": {
    en: "Email {n}", fr: "E-mail {n}", es: "Correo {n}", it: "Email {n}", pt: "E-mail {n}", "pt-BR": "E-mail {n}",
    de: "E-Mail {n}", nl: "E-mail {n}", ro: "E-mail {n}", sv: "E-post {n}", da: "E-mail {n}", nb: "E-post {n}",
    fi: "Sähköposti {n}", pl: "E-mail {n}", cs: "E-mail {n}", sk: "E-mail {n}", hu: "{n}. e-mail", el: "Email {n}",
    bg: "Имейл {n}", hr: "E-pošta {n}", sr: "Имејл {n}", sl: "E-sporočilo {n}", et: "E-kiri {n}", lv: "E-pasts {n}",
    lt: "El. laiškas {n}", tr: "E-posta {n}", ru: "Письмо {n}", uk: "Лист {n}", ca: "Correu {n}", id: "Email {n}",
    vi: "Email {n}", th: "อีเมลที่ {n}", zh: "邮件 {n}", ja: "メール {n}", ko: "이메일 {n}", ar: "البريد {n}", he: "אימייל {n}", hi: "ईमेल {n}",
  },
  "admin.autopilotClient.stepDelayLabel": {
    en: "Send after", fr: "Envoyer après", es: "Enviar después de", it: "Invia dopo", pt: "Enviar após", "pt-BR": "Enviar após",
    de: "Senden nach", nl: "Verzenden na", ro: "Trimite după", sv: "Skicka efter", da: "Send efter", nb: "Send etter",
    fi: "Lähetä jälkeen", pl: "Wyślij po", cs: "Odeslat po", sk: "Odoslať po", hu: "Küldés ennyi után", el: "Αποστολή μετά από",
    bg: "Изпрати след", hr: "Pošalji nakon", sr: "Пошаљи након", sl: "Pošlji po", et: "Saada pärast", lv: "Sūtīt pēc",
    lt: "Siųsti po", tr: "Şu kadar sonra gönder", ru: "Отправить через", uk: "Надіслати через", ca: "Envia després de", id: "Kirim setelah",
    vi: "Gửi sau", th: "ส่งหลังจาก", zh: "发送间隔", ja: "送信タイミング", ko: "발송 시점", ar: "إرسال بعد", he: "שלח לאחר", hi: "इसके बाद भेजें",
  },
  "admin.autopilotClient.stepDiscountLabel": {
    en: "Discount", fr: "Remise", es: "Descuento", it: "Sconto", pt: "Desconto", "pt-BR": "Desconto",
    de: "Rabatt", nl: "Korting", ro: "Reducere", sv: "Rabatt", da: "Rabat", nb: "Rabatt",
    fi: "Alennus", pl: "Rabat", cs: "Sleva", sk: "Zľava", hu: "Kedvezmény", el: "Έκπτωση",
    bg: "Отстъпка", hr: "Popust", sr: "Попуст", sl: "Popust", et: "Allahindlus", lv: "Atlaide",
    lt: "Nuolaida", tr: "İndirim", ru: "Скидка", uk: "Знижка", ca: "Descompte", id: "Diskon",
    vi: "Giảm giá", th: "ส่วนลด", zh: "折扣", ja: "割引", ko: "할인", ar: "خصم", he: "הנחה", hi: "छूट",
  },
  "admin.autopilotClient.stepAdd": {
    en: "Add another email", fr: "Ajouter un autre e-mail", es: "Añadir otro correo", it: "Aggiungi un'altra email", pt: "Adicionar outro e-mail", "pt-BR": "Adicionar outro e-mail",
    de: "Weitere E-Mail hinzufügen", nl: "Nog een e-mail toevoegen", ro: "Adaugă alt e-mail", sv: "Lägg till ännu ett e-postmeddelande", da: "Tilføj endnu en e-mail", nb: "Legg til en e-post til",
    fi: "Lisää toinen sähköposti", pl: "Dodaj kolejny e-mail", cs: "Přidat další e-mail", sk: "Pridať ďalší e-mail", hu: "Másik e-mail hozzáadása", el: "Προσθήκη άλλου email",
    bg: "Добави още имейл", hr: "Dodaj još jednu e-poruku", sr: "Додај још један имејл", sl: "Dodaj še eno e-sporočilo", et: "Lisa veel üks e-kiri", lv: "Pievienot vēl vienu e-pastu",
    lt: "Pridėti dar vieną el. laišką", tr: "Başka bir e-posta ekle", ru: "Добавить ещё письмо", uk: "Додати ще лист", ca: "Afegeix un altre correu", id: "Tambah email lain",
    vi: "Thêm email khác", th: "เพิ่มอีเมลอีกฉบับ", zh: "添加另一封邮件", ja: "メールを追加", ko: "이메일 추가", ar: "إضافة بريد إلكتروني آخر", he: "הוסף אימייל נוסף", hi: "एक और ईमेल जोड़ें",
  },
  "admin.autopilotClient.stepsSave": {
    en: "Save sequence", fr: "Enregistrer la séquence", es: "Guardar secuencia", it: "Salva sequenza", pt: "Guardar sequência", "pt-BR": "Salvar sequência",
    de: "Sequenz speichern", nl: "Reeks opslaan", ro: "Salvează secvența", sv: "Spara sekvens", da: "Gem sekvens", nb: "Lagre sekvens",
    fi: "Tallenna sarja", pl: "Zapisz sekwencję", cs: "Uložit sekvenci", sk: "Uložiť sekvenciu", hu: "Sorozat mentése", el: "Αποθήκευση ακολουθίας",
    bg: "Запази последователността", hr: "Spremi niz", sr: "Сачувај низ", sl: "Shrani zaporedje", et: "Salvesta jada", lv: "Saglabāt secību",
    lt: "Išsaugoti seką", tr: "Diziyi kaydet", ru: "Сохранить последовательность", uk: "Зберегти послідовність", ca: "Desa la seqüència", id: "Simpan urutan",
    vi: "Lưu chuỗi", th: "บันทึกลำดับ", zh: "保存序列", ja: "シーケンスを保存", ko: "시퀀스 저장", ar: "حفظ التسلسل", he: "שמור רצף", hi: "अनुक्रम सहेजें",
  },
  "admin.autopilotClient.stepsNeedOne": {
    en: "Add at least one email.", fr: "Ajoutez au moins un e-mail.", es: "Añade al menos un correo.", it: "Aggiungi almeno un'email.", pt: "Adicione pelo menos um e-mail.", "pt-BR": "Adicione pelo menos um e-mail.",
    de: "Fügen Sie mindestens eine E-Mail hinzu.", nl: "Voeg minstens één e-mail toe.", ro: "Adaugă cel puțin un e-mail.", sv: "Lägg till minst ett e-postmeddelande.", da: "Tilføj mindst én e-mail.", nb: "Legg til minst én e-post.",
    fi: "Lisää vähintään yksi sähköposti.", pl: "Dodaj co najmniej jeden e-mail.", cs: "Přidejte alespoň jeden e-mail.", sk: "Pridajte aspoň jeden e-mail.", hu: "Adjon hozzá legalább egy e-mailt.", el: "Προσθέστε τουλάχιστον ένα email.",
    bg: "Добавете поне един имейл.", hr: "Dodajte barem jednu e-poruku.", sr: "Додајте барем један имејл.", sl: "Dodajte vsaj eno e-sporočilo.", et: "Lisa vähemalt üks e-kiri.", lv: "Pievienojiet vismaz vienu e-pastu.",
    lt: "Pridėkite bent vieną el. laišką.", tr: "En az bir e-posta ekleyin.", ru: "Добавьте хотя бы одно письмо.", uk: "Додайте хоча б один лист.", ca: "Afegeix almenys un correu.", id: "Tambahkan setidaknya satu email.",
    vi: "Thêm ít nhất một email.", th: "เพิ่มอีเมลอย่างน้อยหนึ่งฉบับ", zh: "请至少添加一封邮件。", ja: "メールを少なくとも1通追加してください。", ko: "이메일을 최소 하나 추가하세요.", ar: "أضف بريدًا إلكترونيًا واحدًا على الأقل.", he: "הוסף לפחות אימייל אחד.", hi: "कम से कम एक ईमेल जोड़ें।",
  },
  "admin.autopilotClient.stepsHint": {
    en: "Each email goes out further from their last order, with its own discount. The sequence stops automatically the moment they order again.",
    fr: "Chaque e-mail est envoyé plus tard après leur dernière commande, avec sa propre remise. La séquence s'arrête automatiquement dès qu'ils recommandent.",
    es: "Cada correo se envía más tarde tras su último pedido, con su propio descuento. La secuencia se detiene automáticamente en cuanto vuelven a pedir.",
    it: "Ogni email viene inviata più avanti rispetto all'ultimo ordine, con il proprio sconto. La sequenza si interrompe automaticamente non appena ordinano di nuovo.",
    pt: "Cada e-mail é enviado mais tarde após o último pedido, com o seu próprio desconto. A sequência para automaticamente assim que voltarem a encomendar.",
    "pt-BR": "Cada e-mail é enviado mais tarde após o último pedido, com seu próprio desconto. A sequência para automaticamente assim que o cliente pede de novo.",
    de: "Jede E-Mail wird später nach der letzten Bestellung gesendet, mit eigenem Rabatt. Die Sequenz stoppt automatisch, sobald wieder bestellt wird.",
    nl: "Elke e-mail wordt later na hun laatste bestelling verzonden, met een eigen korting. De reeks stopt automatisch zodra ze opnieuw bestellen.",
    ro: "Fiecare e-mail este trimis mai târziu după ultima comandă, cu propria reducere. Secvența se oprește automat în momentul în care comandă din nou.",
    sv: "Varje e-post skickas längre efter deras senaste beställning, med en egen rabatt. Sekvensen stoppas automatiskt så snart de beställer igen.",
    da: "Hver e-mail sendes længere efter deres seneste ordre, med sin egen rabat. Sekvensen stopper automatisk, så snart de bestiller igen.",
    nb: "Hver e-post sendes lenger etter den siste bestillingen, med sin egen rabatt. Sekvensen stopper automatisk så snart de bestiller igjen.",
    fi: "Jokainen sähköposti lähetetään myöhemmin viimeisestä tilauksesta, omalla alennuksellaan. Sarja pysähtyy automaattisesti heti, kun asiakas tilaa uudelleen.",
    pl: "Każdy e-mail jest wysyłany później po ostatnim zamówieniu, z własnym rabatem. Sekwencja zatrzymuje się automatycznie, gdy klient ponownie złoży zamówienie.",
    cs: "Každý e-mail se odešle déle po posledním objednání, s vlastní slevou. Sekvence se automaticky zastaví, jakmile zákazník znovu objedná.",
    sk: "Každý e-mail sa odošle neskôr po poslednej objednávke, s vlastnou zľavou. Sekvencia sa automaticky zastaví, hneď ako zákazník znova objedná.",
    hu: "Minden e-mail később megy ki az utolsó rendeléshez képest, saját kedvezménnyel. A sorozat automatikusan leáll, amint újra rendelnek.",
    el: "Κάθε email στέλνεται πιο μακριά από την τελευταία τους παραγγελία, με τη δική του έκπτωση. Η ακολουθία σταματά αυτόματα μόλις παραγγείλουν ξανά.",
    bg: "Всеки имейл се изпраща по-късно след последната им поръчка, със собствена отстъпка. Последователността спира автоматично, щом поръчат отново.",
    hr: "Svaka se e-poruka šalje kasnije od njihove zadnje narudžbe, s vlastitim popustom. Niz se automatski zaustavlja čim ponovno naruče.",
    sr: "Сваки имејл се шаље касније у односу на њихову последњу поруџбину, са сопственим попустом. Низ се аутоматски зауставља чим поново наруче.",
    sl: "Vsako e-sporočilo se pošlje pozneje po njihovem zadnjem naročilu, z lastnim popustom. Zaporedje se samodejno ustavi takoj, ko znova naročijo.",
    et: "Iga e-kiri saadetakse viimasest tellimusest hiljem, oma allahindlusega. Jada peatub automaatselt niipea, kui klient uuesti tellib.",
    lv: "Katrs e-pasts tiek nosūtīts vēlāk pēc pēdējā pasūtījuma, ar savu atlaidi. Secība automātiski apstājas, tiklīdz klients pasūta atkārtoti.",
    lt: "Kiekvienas el. laiškas siunčiamas vėliau po paskutinio užsakymo, su savo nuolaida. Seka automatiškai sustoja, kai klientas užsako dar kartą.",
    tr: "Her e-posta, son siparişlerinden daha sonra kendi indirimiyle gönderilir. Müşteri tekrar sipariş verdiği anda dizi otomatik olarak durur.",
    ru: "Каждое письмо отправляется позже после последнего заказа, со своей скидкой. Последовательность останавливается автоматически, как только клиент заказывает снова.",
    uk: "Кожен лист надсилається пізніше після останнього замовлення, з власною знижкою. Послідовність зупиняється автоматично, щойно клієнт замовляє знову.",
    ca: "Cada correu s'envia més tard després de la seva última comanda, amb el seu propi descompte. La seqüència s'atura automàticament en el moment que tornen a demanar.",
    id: "Setiap email dikirim lebih lama setelah pesanan terakhir mereka, dengan diskonnya sendiri. Urutan berhenti otomatis begitu mereka memesan lagi.",
    vi: "Mỗi email được gửi xa hơn so với đơn hàng gần nhất của họ, kèm ưu đãi riêng. Chuỗi tự động dừng ngay khi họ đặt hàng lại.",
    th: "อีเมลแต่ละฉบับจะถูกส่งห่างจากคำสั่งซื้อล่าสุดมากขึ้น พร้อมส่วนลดของตัวเอง ลำดับจะหยุดอัตโนมัติทันทีที่ลูกค้าสั่งซื้ออีกครั้ง",
    zh: "每封邮件会在客户上次下单后更久才发送，并带有各自的折扣。一旦客户再次下单，序列会自动停止。",
    ja: "各メールは前回の注文からさらに時間を空けて、それぞれの割引付きで送信されます。お客様が再度注文するとシーケンスは自動的に停止します。",
    ko: "각 이메일은 마지막 주문에서 더 시간이 지난 뒤 각자의 할인과 함께 발송됩니다. 고객이 다시 주문하는 순간 시퀀스가 자동으로 중단됩니다.",
    ar: "يُرسَل كل بريد إلكتروني بعد فترة أطول من آخر طلب لهم، مع خصمه الخاص. تتوقف السلسلة تلقائيًا بمجرد أن يطلبوا مرة أخرى.",
    he: "כל אימייל נשלח רחוק יותר מההזמנה האחרונה שלהם, עם הנחה משלו. הרצף נעצר אוטומטית ברגע שהם מזמינים שוב.",
    hi: "हर ईमेल उनके पिछले ऑर्डर से और बाद में भेजा जाता है, अपनी छूट के साथ। जैसे ही वे दोबारा ऑर्डर करते हैं, क्रम अपने आप रुक जाता है।",
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
  for (const [key, byLoc] of Object.entries(KEYS)) {
    setDeep(data, key, byLoc[loc] ?? byLoc.en);
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ autopilot-step editor strings added to ${n} locale(s).`);
