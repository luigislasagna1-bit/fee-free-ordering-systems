/**
 * One-shot i18n patch (Luigi 2026-06-10):
 *  1. admin.autopilotClient.emailNotConfiguredBody — drop the never-used
 *     EMAIL_SERVER/EMAIL_FROM rich-tags (the send path uses Resend). Now plain
 *     text, so the component renders it with t() not t.rich().
 *  2. admin.autopilotClient.campaign_cart_abandonment_description — remove the
 *     hardcoded "~90 minutes" that contradicted the owner-configurable delay.
 * No placeholders / no rich tags in either new string.
 *   npx tsx scripts/i18n-fix-autopilot-copy.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const BODY: Record<string, string> = {
  en: "Campaign settings are saved, but emails won't be sent until email delivery is set up for your account.",
  fr: "Les paramètres de la campagne sont enregistrés, mais aucun e-mail ne sera envoyé tant que l'envoi d'e-mails n'est pas configuré pour votre compte.",
  es: "La configuración de la campaña se guarda, pero no se enviarán correos hasta que se configure el envío de correos en tu cuenta.",
  it: "Le impostazioni della campagna vengono salvate, ma le email non verranno inviate finché l'invio email non è configurato per il tuo account.",
  pt: "As definições da campanha são guardadas, mas os e-mails não serão enviados até que o envio de e-mails esteja configurado na sua conta.",
  "pt-BR": "As configurações da campanha são salvas, mas os e-mails não serão enviados até que o envio de e-mails esteja configurado na sua conta.",
  de: "Die Kampagneneinstellungen werden gespeichert, aber es werden keine E-Mails gesendet, bis der E-Mail-Versand für Ihr Konto eingerichtet ist.",
  nl: "De campagne-instellingen worden opgeslagen, maar er worden geen e-mails verzonden totdat e-mailbezorging voor je account is ingesteld.",
  ro: "Setările campaniei sunt salvate, dar e-mailurile nu vor fi trimise până când trimiterea e-mailurilor nu este configurată pentru contul tău.",
  sv: "Kampanjinställningarna sparas, men inga e-postmeddelanden skickas förrän e-postutskick har konfigurerats för ditt konto.",
  da: "Kampagneindstillingerne gemmes, men der sendes ingen e-mails, før e-mailafsendelse er konfigureret til din konto.",
  nb: "Kampanjeinnstillingene lagres, men ingen e-poster sendes før e-postsending er konfigurert for kontoen din.",
  fi: "Kampanjan asetukset tallennetaan, mutta sähköposteja ei lähetetä, ennen kuin sähköpostin lähetys on määritetty tilillesi.",
  pl: "Ustawienia kampanii są zapisywane, ale e-maile nie będą wysyłane, dopóki wysyłka e-maili nie zostanie skonfigurowana dla Twojego konta.",
  cs: "Nastavení kampaně se uloží, ale e-maily se nebudou odesílat, dokud nebude pro váš účet nastaveno odesílání e-mailů.",
  sk: "Nastavenia kampane sa uložia, ale e-maily sa nebudú odosielať, kým nebude pre váš účet nastavené odosielanie e-mailov.",
  hu: "A kampánybeállítások mentésre kerülnek, de e-mailek nem lesznek elküldve, amíg az e-mail-küldés nincs beállítva a fiókjához.",
  el: "Οι ρυθμίσεις της καμπάνιας αποθηκεύονται, αλλά δεν θα σταλούν email μέχρι να ρυθμιστεί η αποστολή email για τον λογαριασμό σας.",
  bg: "Настройките на кампанията се запазват, но имейли няма да се изпращат, докато изпращането на имейли не бъде настроено за вашия акаунт.",
  hr: "Postavke kampanje su spremljene, ali e-poruke se neće slati dok slanje e-pošte ne bude postavljeno za vaš račun.",
  sr: "Подешавања кампање су сачувана, али имејлови неће бити послати док слање имејлова не буде подешено за ваш налог.",
  sl: "Nastavitve kampanje so shranjene, vendar e-poštna sporočila ne bodo poslana, dokler pošiljanje e-pošte ni nastavljeno za vaš račun.",
  et: "Kampaania seaded salvestatakse, kuid e-kirju ei saadeta enne, kui teie kontole on seadistatud e-kirjade saatmine.",
  lv: "Kampaņas iestatījumi tiek saglabāti, taču e-pasta ziņojumi netiks sūtīti, kamēr jūsu kontam nebūs iestatīta e-pasta sūtīšana.",
  lt: "Kampanijos nustatymai išsaugomi, bet el. laiškai nebus siunčiami, kol jūsų paskyrai nebus nustatytas el. laiškų siuntimas.",
  tr: "Kampanya ayarları kaydedilir, ancak hesabınız için e-posta gönderimi ayarlanana kadar e-postalar gönderilmez.",
  ru: "Настройки кампании сохраняются, но письма не будут отправляться, пока для вашего аккаунта не настроена отправка электронной почты.",
  uk: "Налаштування кампанії зберігаються, але листи не надсилатимуться, доки для вашого облікового запису не налаштовано надсилання електронної пошти.",
  ca: "La configuració de la campanya es desa, però no s'enviaran correus fins que l'enviament de correus estigui configurat al teu compte.",
  id: "Pengaturan kampanye disimpan, tetapi email tidak akan dikirim sampai pengiriman email disiapkan untuk akun Anda.",
  vi: "Cài đặt chiến dịch được lưu, nhưng email sẽ không được gửi cho đến khi việc gửi email được thiết lập cho tài khoản của bạn.",
  th: "ระบบบันทึกการตั้งค่าแคมเปญแล้ว แต่จะไม่ส่งอีเมลจนกว่าจะตั้งค่าการส่งอีเมลสำหรับบัญชีของคุณ",
  zh: "活动设置已保存，但在为您的账户设置好电子邮件发送之前，邮件不会发出。",
  ja: "キャンペーン設定は保存されますが、アカウントでメール送信が設定されるまでメールは送信されません。",
  ko: "캠페인 설정은 저장되지만, 계정에 이메일 발송이 설정될 때까지 이메일이 전송되지 않습니다.",
  ar: "يتم حفظ إعدادات الحملة، لكن لن يتم إرسال رسائل البريد الإلكتروني حتى يتم إعداد إرسال البريد الإلكتروني لحسابك.",
  he: "הגדרות הקמפיין נשמרות, אך הודעות אימייל לא יישלחו עד שתגדיר שליחת אימייל לחשבון שלך.",
  hi: "अभियान सेटिंग्स सहेजी जाती हैं, लेकिन जब तक आपके खाते के लिए ईमेल भेजना सेट नहीं किया जाता, तब तक ईमेल नहीं भेजे जाएंगे।",
};

const CARTDESC: Record<string, string> = {
  en: "Sends a reminder to customers who added items to their cart and entered their email but didn't complete their order, after the delay you set below.",
  fr: "Envoie un rappel aux clients qui ont ajouté des articles à leur panier et saisi leur e-mail mais n'ont pas finalisé leur commande, après le délai défini ci-dessous.",
  es: "Envía un recordatorio a los clientes que agregaron artículos a su carrito e ingresaron su correo pero no completaron su pedido, tras el tiempo que definas a continuación.",
  it: "Invia un promemoria ai clienti che hanno aggiunto articoli al carrello e inserito la loro email ma non hanno completato l'ordine, dopo il ritardo impostato qui sotto.",
  pt: "Envia um lembrete aos clientes que adicionaram itens ao carrinho e introduziram o e-mail mas não concluíram o pedido, após o atraso que definir abaixo.",
  "pt-BR": "Envia um lembrete aos clientes que adicionaram itens ao carrinho e inseriram o e-mail mas não concluíram o pedido, após o tempo que você definir abaixo.",
  de: "Sendet eine Erinnerung an Kunden, die Artikel in den Warenkorb gelegt und ihre E-Mail eingegeben, aber die Bestellung nicht abgeschlossen haben – nach der unten festgelegten Verzögerung.",
  nl: "Stuurt een herinnering naar klanten die artikelen aan hun winkelwagen toevoegden en hun e-mail invulden maar hun bestelling niet afrondden, na de vertraging die je hieronder instelt.",
  ro: "Trimite un memento clienților care au adăugat produse în coș și și-au introdus e-mailul, dar nu au finalizat comanda, după întârzierea setată mai jos.",
  sv: "Skickar en påminnelse till kunder som lade varor i kundvagnen och angav sin e-post men inte slutförde sin beställning, efter fördröjningen du anger nedan.",
  da: "Sender en påmindelse til kunder, der lagde varer i kurven og indtastede deres e-mail, men ikke gennemførte deres ordre, efter den forsinkelse du angiver nedenfor.",
  nb: "Sender en påminnelse til kunder som la varer i handlekurven og oppga e-posten sin, men ikke fullførte bestillingen, etter forsinkelsen du angir nedenfor.",
  fi: "Lähettää muistutuksen asiakkaille, jotka lisäsivät tuotteita ostoskoriin ja syöttivät sähköpostinsa mutta eivät viimeistelleet tilaustaan, alla asettamasi viiveen jälkeen.",
  pl: "Wysyła przypomnienie klientom, którzy dodali produkty do koszyka i podali swój e-mail, ale nie dokończyli zamówienia, po ustawionym poniżej opóźnieniu.",
  cs: "Odešle připomenutí zákazníkům, kteří přidali položky do košíku a zadali svůj e-mail, ale nedokončili objednávku, po prodlevě, kterou nastavíte níže.",
  sk: "Odošle pripomenutie zákazníkom, ktorí pridali položky do košíka a zadali svoj e-mail, ale nedokončili objednávku, po oneskorení, ktoré nastavíte nižšie.",
  hu: "Emlékeztetőt küld azoknak az ügyfeleknek, akik termékeket tettek a kosarukba és megadták az e-mailjüket, de nem fejezték be a rendelést, az alább beállított késleltetés után.",
  el: "Στέλνει υπενθύμιση στους πελάτες που πρόσθεσαν προϊόντα στο καλάθι τους και καταχώρισαν το email τους αλλά δεν ολοκλήρωσαν την παραγγελία τους, μετά την καθυστέρηση που ορίζετε παρακάτω.",
  bg: "Изпраща напомняне на клиентите, които са добавили артикули в количката си и са въвели имейла си, но не са завършили поръчката си, след зададеното по-долу забавяне.",
  hr: "Šalje podsjetnik kupcima koji su dodali artikle u košaricu i unijeli svoju e-poštu, ali nisu dovršili narudžbu, nakon odgode koju postavite u nastavku.",
  sr: "Шаље подсетник купцима који су додали артикле у корпу и унели своју имејл адресу, али нису завршили поруџбину, након кашњења које подесите испод.",
  sl: "Pošlje opomnik strankam, ki so dodale izdelke v košarico in vnesle svoj e-naslov, a niso dokončale naročila, po zamiku, ki ga nastavite spodaj.",
  et: "Saadab meeldetuletuse klientidele, kes lisasid tooteid ostukorvi ja sisestasid oma e-posti, kuid ei vormistanud tellimust, pärast allpool määratud viivitust.",
  lv: "Nosūta atgādinājumu klientiem, kuri pievienoja preces grozam un ievadīja savu e-pastu, bet nepabeidza pasūtījumu, pēc zemāk iestatītās aizkaves.",
  lt: "Siunčia priminimą klientams, kurie įdėjo prekes į krepšelį ir įvedė savo el. paštą, bet nebaigė užsakymo, praėjus žemiau nustatytam uždelsimui.",
  tr: "Sepete ürün ekleyen ve e-postasını giren ancak siparişini tamamlamayan müşterilere, aşağıda belirlediğiniz gecikmeden sonra bir hatırlatma gönderir.",
  ru: "Отправляет напоминание клиентам, которые добавили товары в корзину и ввели свой адрес электронной почты, но не оформили заказ, после заданной ниже задержки.",
  uk: "Надсилає нагадування клієнтам, які додали товари в кошик і ввели свою електронну пошту, але не оформили замовлення, після заданої нижче затримки.",
  ca: "Envia un recordatori als clients que han afegit articles al carretó i han introduït el seu correu però no han completat la comanda, després del retard que defineixis a continuació.",
  id: "Mengirim pengingat kepada pelanggan yang menambahkan item ke keranjang dan memasukkan email mereka tetapi tidak menyelesaikan pesanan, setelah jeda yang Anda atur di bawah.",
  vi: "Gửi lời nhắc đến những khách hàng đã thêm sản phẩm vào giỏ hàng và nhập email nhưng chưa hoàn tất đơn hàng, sau khoảng thời gian trễ bạn đặt bên dưới.",
  th: "ส่งการแจ้งเตือนถึงลูกค้าที่เพิ่มสินค้าลงตะกร้าและกรอกอีเมลแล้วแต่ยังไม่ได้สั่งซื้อให้เสร็จ หลังจากระยะเวลาที่คุณตั้งไว้ด้านล่าง",
  zh: "在您下方设置的延迟后，向已将商品加入购物车并输入电子邮件但未完成订单的顾客发送提醒。",
  ja: "商品をカートに追加してメールアドレスを入力したものの注文を完了しなかったお客様に、下で設定した時間の経過後にリマインダーを送信します。",
  ko: "장바구니에 상품을 담고 이메일을 입력했지만 주문을 완료하지 않은 고객에게 아래에서 설정한 지연 시간 후에 알림을 보냅니다.",
  ar: "يرسل تذكيرًا للعملاء الذين أضافوا عناصر إلى سلتهم وأدخلوا بريدهم الإلكتروني لكنهم لم يكملوا طلبهم، بعد التأخير الذي تحدده أدناه.",
  he: "שולח תזכורת ללקוחות שהוסיפו פריטים לעגלה והזינו את האימייל שלהם אך לא השלימו את ההזמנה, לאחר ההשהיה שתגדיר למטה.",
  hi: "उन ग्राहकों को अनुस्मारक भेजता है जिन्होंने अपनी कार्ट में आइटम जोड़े और अपना ईमेल दर्ज किया लेकिन अपना ऑर्डर पूरा नहीं किया, नीचे आपके द्वारा निर्धारित देरी के बाद।",
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
  setDeep(data, "admin.autopilotClient.emailNotConfiguredBody", BODY[loc] ?? BODY.en);
  setDeep(data, "admin.autopilotClient.campaign_cart_abandonment_description", CARTDESC[loc] ?? CARTDESC.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ autopilot copy fixed in ${n} locale(s).`);
