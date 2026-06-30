/** i18n × 38: hardcoded English strings in CheckoutModal (guest sign-in CTA,
 *  PayPal notices, tip "Suggested" badge, coupon Apply/applied, email optional).
 *  Rich tags <link>/<mono> and the {couponCode} placeholder must be preserved in
 *  every locale; "PayPal" is a brand and stays as-is. Luigi 2026-06-30.
 *  Run: npx tsx scripts/i18n-add-checkout-strings.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "checkout.guestSigninMarketplace": {
    en: "Already have a marketplace account? <link>Sign in</link> to skip re-typing your details.",
    fr: "Vous avez déjà un compte marketplace ? <link>Connectez-vous</link> pour ne pas ressaisir vos informations.",
    es: "¿Ya tienes una cuenta de marketplace? <link>Inicia sesión</link> para no volver a escribir tus datos.",
    it: "Hai già un account marketplace? <link>Accedi</link> per non reinserire i tuoi dati.",
    pt: "Já tem uma conta marketplace? <link>Inicie sessão</link> para não voltar a escrever os seus dados.",
    "pt-BR": "Já tem uma conta no marketplace? <link>Entre</link> para não digitar seus dados de novo.",
    de: "Sie haben bereits ein Marketplace-Konto? <link>Anmelden</link>, um Ihre Daten nicht erneut einzugeben.",
    nl: "Heb je al een marketplace-account? <link>Meld je aan</link> om je gegevens niet opnieuw in te voeren.",
    ro: "Ai deja un cont marketplace? <link>Conectează-te</link> ca să nu reintroduci datele.",
    sv: "Har du redan ett marketplace-konto? <link>Logga in</link> för att slippa skriva in dina uppgifter igen.",
    da: "Har du allerede en marketplace-konto? <link>Log ind</link> for at slippe for at indtaste dine oplysninger igen.",
    nb: "Har du allerede en marketplace-konto? <link>Logg inn</link> for å slippe å skrive inn opplysningene på nytt.",
    fi: "Onko sinulla jo marketplace-tili? <link>Kirjaudu sisään</link> välttääksesi tietojen uudelleen syöttämisen.",
    pl: "Masz już konto marketplace? <link>Zaloguj się</link>, aby nie wpisywać danych ponownie.",
    cs: "Máte už účet marketplace? <link>Přihlaste se</link> a nemusíte zadávat údaje znovu.",
    sk: "Máte už účet marketplace? <link>Prihláste sa</link> a nemusíte zadávať údaje znova.",
    hu: "Van már marketplace-fiókja? <link>Jelentkezzen be</link>, hogy ne kelljen újra megadnia az adatait.",
    el: "Έχετε ήδη λογαριασμό marketplace; <link>Συνδεθείτε</link> για να μην ξαναπληκτρολογήσετε τα στοιχεία σας.",
    bg: "Вече имате marketplace акаунт? <link>Влезте</link>, за да не въвеждате данните си отново.",
    hr: "Već imate marketplace račun? <link>Prijavite se</link> da ne morate ponovno upisivati podatke.",
    sr: "Већ имате marketplace налог? <link>Пријавите се</link> да не уносите податке поново.",
    sl: "Že imate marketplace račun? <link>Prijavite se</link>, da vam ni treba znova vnašati podatkov.",
    et: "Kas teil on juba marketplace'i konto? <link>Logige sisse</link>, et oma andmeid uuesti mitte sisestada.",
    lv: "Vai jums jau ir marketplace konts? <link>Pierakstieties</link>, lai atkārtoti neievadītu savus datus.",
    lt: "Jau turite marketplace paskyrą? <link>Prisijunkite</link>, kad nereikėtų iš naujo įvesti duomenų.",
    tr: "Zaten bir marketplace hesabınız var mı? Bilgilerinizi yeniden yazmamak için <link>giriş yapın</link>.",
    ru: "Уже есть аккаунт marketplace? <link>Войдите</link>, чтобы не вводить данные заново.",
    uk: "Уже маєте акаунт marketplace? <link>Увійдіть</link>, щоб не вводити дані знову.",
    ca: "Ja tens un compte de marketplace? <link>Inicia la sessió</link> per no tornar a escriure les teves dades.",
    id: "Sudah punya akun marketplace? <link>Masuk</link> agar tidak perlu mengetik ulang data Anda.",
    vi: "Đã có tài khoản marketplace? <link>Đăng nhập</link> để khỏi nhập lại thông tin của bạn.",
    th: "มีบัญชี marketplace อยู่แล้ว? <link>เข้าสู่ระบบ</link> เพื่อไม่ต้องกรอกข้อมูลใหม่",
    zh: "已有 marketplace 账户？<link>登录</link>即可免去重新填写您的信息。",
    ja: "marketplace アカウントをお持ちですか？<link>サインイン</link>すれば情報を再入力せずに済みます。",
    ko: "이미 marketplace 계정이 있으신가요? <link>로그인</link>하면 정보를 다시 입력하지 않아도 됩니다.",
    ar: "هل لديك حساب marketplace بالفعل؟ <link>سجّل الدخول</link> لتجنّب إعادة كتابة بياناتك.",
    he: "כבר יש לך חשבון marketplace? <link>היכנס/י</link> כדי לא להקליד שוב את הפרטים.",
    hi: "क्या आपके पास पहले से marketplace खाता है? अपनी जानकारी दोबारा न लिखने के लिए <link>साइन इन करें</link>।",
  },
  "checkout.guestSigninRestaurant": {
    en: "Already have an account at this restaurant? <link>Sign in</link> to skip re-typing your details.",
    fr: "Vous avez déjà un compte dans ce restaurant ? <link>Connectez-vous</link> pour ne pas ressaisir vos informations.",
    es: "¿Ya tienes una cuenta en este restaurante? <link>Inicia sesión</link> para no volver a escribir tus datos.",
    it: "Hai già un account in questo ristorante? <link>Accedi</link> per non reinserire i tuoi dati.",
    pt: "Já tem uma conta neste restaurante? <link>Inicie sessão</link> para não voltar a escrever os seus dados.",
    "pt-BR": "Já tem uma conta neste restaurante? <link>Entre</link> para não digitar seus dados de novo.",
    de: "Sie haben bereits ein Konto bei diesem Restaurant? <link>Anmelden</link>, um Ihre Daten nicht erneut einzugeben.",
    nl: "Heb je al een account bij dit restaurant? <link>Meld je aan</link> om je gegevens niet opnieuw in te voeren.",
    ro: "Ai deja un cont la acest restaurant? <link>Conectează-te</link> ca să nu reintroduci datele.",
    sv: "Har du redan ett konto hos den här restaurangen? <link>Logga in</link> för att slippa skriva in dina uppgifter igen.",
    da: "Har du allerede en konto hos denne restaurant? <link>Log ind</link> for at slippe for at indtaste dine oplysninger igen.",
    nb: "Har du allerede en konto hos denne restauranten? <link>Logg inn</link> for å slippe å skrive inn opplysningene på nytt.",
    fi: "Onko sinulla jo tili tässä ravintolassa? <link>Kirjaudu sisään</link> välttääksesi tietojen uudelleen syöttämisen.",
    pl: "Masz już konto w tej restauracji? <link>Zaloguj się</link>, aby nie wpisywać danych ponownie.",
    cs: "Máte už účet v této restauraci? <link>Přihlaste se</link> a nemusíte zadávat údaje znovu.",
    sk: "Máte už účet v tejto reštaurácii? <link>Prihláste sa</link> a nemusíte zadávať údaje znova.",
    hu: "Van már fiókja ennél az étteremnél? <link>Jelentkezzen be</link>, hogy ne kelljen újra megadnia az adatait.",
    el: "Έχετε ήδη λογαριασμό σε αυτό το εστιατόριο; <link>Συνδεθείτε</link> για να μην ξαναπληκτρολογήσετε τα στοιχεία σας.",
    bg: "Вече имате акаунт в този ресторант? <link>Влезте</link>, за да не въвеждате данните си отново.",
    hr: "Već imate račun u ovom restoranu? <link>Prijavite se</link> da ne morate ponovno upisivati podatke.",
    sr: "Већ имате налог у овом ресторану? <link>Пријавите се</link> да не уносите податке поново.",
    sl: "Že imate račun pri tej restavraciji? <link>Prijavite se</link>, da vam ni treba znova vnašati podatkov.",
    et: "Kas teil on juba selle restorani konto? <link>Logige sisse</link>, et oma andmeid uuesti mitte sisestada.",
    lv: "Vai jums jau ir konts šajā restorānā? <link>Pierakstieties</link>, lai atkārtoti neievadītu savus datus.",
    lt: "Jau turite paskyrą šiame restorane? <link>Prisijunkite</link>, kad nereikėtų iš naujo įvesti duomenų.",
    tr: "Bu restoranda zaten bir hesabınız var mı? Bilgilerinizi yeniden yazmamak için <link>giriş yapın</link>.",
    ru: "Уже есть аккаунт в этом ресторане? <link>Войдите</link>, чтобы не вводить данные заново.",
    uk: "Уже маєте акаунт у цьому ресторані? <link>Увійдіть</link>, щоб не вводити дані знову.",
    ca: "Ja tens un compte en aquest restaurant? <link>Inicia la sessió</link> per no tornar a escriure les teves dades.",
    id: "Sudah punya akun di restoran ini? <link>Masuk</link> agar tidak perlu mengetik ulang data Anda.",
    vi: "Đã có tài khoản tại nhà hàng này? <link>Đăng nhập</link> để khỏi nhập lại thông tin của bạn.",
    th: "มีบัญชีกับร้านนี้อยู่แล้ว? <link>เข้าสู่ระบบ</link> เพื่อไม่ต้องกรอกข้อมูลใหม่",
    zh: "已在本餐厅有账户？<link>登录</link>即可免去重新填写您的信息。",
    ja: "このレストランのアカウントをお持ちですか？<link>サインイン</link>すれば情報を再入力せずに済みます。",
    ko: "이 레스토랑에 계정이 있으신가요? <link>로그인</link>하면 정보를 다시 입력하지 않아도 됩니다.",
    ar: "هل لديك حساب في هذا المطعم بالفعل؟ <link>سجّل الدخول</link> لتجنّب إعادة كتابة بياناتك.",
    he: "כבר יש לך חשבון במסעדה הזו? <link>היכנס/י</link> כדי לא להקליד שוב את הפרטים.",
    hi: "क्या इस रेस्तरां में आपका पहले से खाता है? अपनी जानकारी दोबारा न लिखने के लिए <link>साइन इन करें</link>।",
  },
  "checkout.couponAppliedLabel": {
    en: "Code <mono>{couponCode}</mono> applied",
    fr: "Code <mono>{couponCode}</mono> appliqué", es: "Código <mono>{couponCode}</mono> aplicado", it: "Codice <mono>{couponCode}</mono> applicato",
    pt: "Código <mono>{couponCode}</mono> aplicado", "pt-BR": "Código <mono>{couponCode}</mono> aplicado", de: "Code <mono>{couponCode}</mono> angewendet", nl: "Code <mono>{couponCode}</mono> toegepast",
    ro: "Cod <mono>{couponCode}</mono> aplicat", sv: "Kod <mono>{couponCode}</mono> tillämpad", da: "Kode <mono>{couponCode}</mono> anvendt", nb: "Kode <mono>{couponCode}</mono> brukt",
    fi: "Koodi <mono>{couponCode}</mono> käytetty", pl: "Kod <mono>{couponCode}</mono> zastosowany", cs: "Kód <mono>{couponCode}</mono> uplatněn", sk: "Kód <mono>{couponCode}</mono> uplatnený",
    hu: "<mono>{couponCode}</mono> kód alkalmazva", el: "Κωδικός <mono>{couponCode}</mono> εφαρμόστηκε", bg: "Код <mono>{couponCode}</mono> приложен", hr: "Kod <mono>{couponCode}</mono> primijenjen",
    sr: "Код <mono>{couponCode}</mono> примењен", sl: "Koda <mono>{couponCode}</mono> uporabljena", et: "Kood <mono>{couponCode}</mono> rakendatud", lv: "Kods <mono>{couponCode}</mono> piemērots",
    lt: "Kodas <mono>{couponCode}</mono> pritaikytas", tr: "<mono>{couponCode}</mono> kodu uygulandı", ru: "Код <mono>{couponCode}</mono> применён", uk: "Код <mono>{couponCode}</mono> застосовано",
    ca: "Codi <mono>{couponCode}</mono> aplicat", id: "Kode <mono>{couponCode}</mono> diterapkan", vi: "Đã áp dụng mã <mono>{couponCode}</mono>", th: "ใช้โค้ด <mono>{couponCode}</mono> แล้ว",
    zh: "已应用代码 <mono>{couponCode}</mono>", ja: "コード <mono>{couponCode}</mono> を適用しました", ko: "코드 <mono>{couponCode}</mono> 적용됨", ar: "تم تطبيق الرمز <mono>{couponCode}</mono>",
    he: "קוד <mono>{couponCode}</mono> הוחל", hi: "कोड <mono>{couponCode}</mono> लागू किया गया",
  },
  "checkout.paypalNotReady": {
    en: "This restaurant hasn't finished PayPal setup yet. Pick another payment method.",
    fr: "Ce restaurant n'a pas encore terminé la configuration de PayPal. Choisissez un autre moyen de paiement.",
    es: "Este restaurante aún no ha terminado de configurar PayPal. Elige otro método de pago.",
    it: "Questo ristorante non ha ancora completato la configurazione di PayPal. Scegli un altro metodo di pagamento.",
    pt: "Este restaurante ainda não concluiu a configuração do PayPal. Escolha outro método de pagamento.",
    "pt-BR": "Este restaurante ainda não concluiu a configuração do PayPal. Escolha outra forma de pagamento.",
    de: "Dieses Restaurant hat die PayPal-Einrichtung noch nicht abgeschlossen. Wählen Sie eine andere Zahlungsmethode.",
    nl: "Dit restaurant heeft de PayPal-instelling nog niet voltooid. Kies een andere betaalmethode.",
    ro: "Acest restaurant nu a terminat încă configurarea PayPal. Alegeți altă metodă de plată.",
    sv: "Den här restaurangen har inte slutfört PayPal-konfigurationen ännu. Välj en annan betalningsmetod.",
    da: "Denne restaurant har endnu ikke færdiggjort PayPal-opsætningen. Vælg en anden betalingsmetode.",
    nb: "Denne restauranten har ikke fullført PayPal-oppsettet ennå. Velg en annen betalingsmåte.",
    fi: "Tämä ravintola ei ole vielä saanut PayPal-määritystä valmiiksi. Valitse toinen maksutapa.",
    pl: "Ta restauracja nie zakończyła jeszcze konfiguracji PayPal. Wybierz inną metodę płatności.",
    cs: "Tato restaurace ještě nedokončila nastavení PayPal. Zvolte jiný způsob platby.",
    sk: "Táto reštaurácia ešte nedokončila nastavenie PayPal. Zvoľte iný spôsob platby.",
    hu: "Ez az étterem még nem fejezte be a PayPal beállítását. Válasszon másik fizetési módot.",
    el: "Αυτό το εστιατόριο δεν έχει ολοκληρώσει ακόμη τη ρύθμιση του PayPal. Επιλέξτε άλλον τρόπο πληρωμής.",
    bg: "Този ресторант още не е завършил настройката на PayPal. Изберете друг начин на плащане.",
    hr: "Ovaj restoran još nije dovršio postavljanje PayPala. Odaberite drugi način plaćanja.",
    sr: "Овај ресторан још није завршио подешавање PayPal-а. Изаберите други начин плаћања.",
    sl: "Ta restavracija še ni dokončala nastavitve PayPala. Izberite drug način plačila.",
    et: "See restoran pole veel PayPali seadistust lõpetanud. Valige muu makseviis.",
    lv: "Šis restorāns vēl nav pabeidzis PayPal iestatīšanu. Izvēlieties citu maksājuma veidu.",
    lt: "Šis restoranas dar nebaigė PayPal sąrankos. Pasirinkite kitą mokėjimo būdą.",
    tr: "Bu restoran PayPal kurulumunu henüz tamamlamadı. Başka bir ödeme yöntemi seçin.",
    ru: "Этот ресторан ещё не завершил настройку PayPal. Выберите другой способ оплаты.",
    uk: "Цей ресторан ще не завершив налаштування PayPal. Виберіть інший спосіб оплати.",
    ca: "Aquest restaurant encara no ha acabat de configurar PayPal. Tria un altre mètode de pagament.",
    id: "Restoran ini belum menyelesaikan pengaturan PayPal. Pilih metode pembayaran lain.",
    vi: "Nhà hàng này chưa hoàn tất thiết lập PayPal. Hãy chọn phương thức thanh toán khác.",
    th: "ร้านนี้ยังตั้งค่า PayPal ไม่เสร็จ กรุณาเลือกวิธีชำระเงินอื่น",
    zh: "本餐厅尚未完成 PayPal 设置。请选择其他付款方式。",
    ja: "このレストランは PayPal の設定をまだ完了していません。別の支払い方法を選んでください。",
    ko: "이 레스토랑은 아직 PayPal 설정을 완료하지 않았습니다. 다른 결제 수단을 선택하세요.",
    ar: "لم يُكمل هذا المطعم إعداد PayPal بعد. اختر طريقة دفع أخرى.",
    he: "המסעדה הזו עדיין לא סיימה את הגדרת PayPal. בחר/י אמצעי תשלום אחר.",
    hi: "इस रेस्तरां ने अभी PayPal सेटअप पूरा नहीं किया है। कोई दूसरा भुगतान तरीका चुनें।",
  },
  "checkout.paypalRedirectNotice": {
    en: "You'll be redirected to PayPal to approve the payment after placing your order.",
    fr: "Vous serez redirigé vers PayPal pour approuver le paiement après avoir passé votre commande.",
    es: "Se te redirigirá a PayPal para aprobar el pago después de realizar tu pedido.",
    it: "Verrai reindirizzato a PayPal per approvare il pagamento dopo aver effettuato l'ordine.",
    pt: "Será redirecionado para o PayPal para aprovar o pagamento depois de fazer o pedido.",
    "pt-BR": "Você será redirecionado ao PayPal para aprovar o pagamento depois de fazer o pedido.",
    de: "Nach der Bestellung werden Sie zu PayPal weitergeleitet, um die Zahlung zu genehmigen.",
    nl: "Je wordt na het plaatsen van je bestelling doorgestuurd naar PayPal om de betaling goed te keuren.",
    ro: "Veți fi redirecționat către PayPal pentru a aproba plata după plasarea comenzii.",
    sv: "Du omdirigeras till PayPal för att godkänna betalningen efter att du lagt din beställning.",
    da: "Du bliver omdirigeret til PayPal for at godkende betalingen, når du har afgivet din ordre.",
    nb: "Du blir omdirigert til PayPal for å godkjenne betalingen etter at du har lagt inn bestillingen.",
    fi: "Sinut ohjataan PayPaliin hyväksymään maksu tilauksen tekemisen jälkeen.",
    pl: "Po złożeniu zamówienia zostaniesz przekierowany do PayPal, aby zatwierdzić płatność.",
    cs: "Po odeslání objednávky budete přesměrováni na PayPal, kde platbu schválíte.",
    sk: "Po odoslaní objednávky budete presmerovaní na PayPal na schválenie platby.",
    hu: "A rendelés leadása után átirányítjuk a PayPalra a fizetés jóváhagyásához.",
    el: "Θα μεταφερθείτε στο PayPal για να εγκρίνετε την πληρωμή μετά την υποβολή της παραγγελίας σας.",
    bg: "След като направите поръчката, ще бъдете пренасочени към PayPal, за да одобрите плащането.",
    hr: "Nakon što pošaljete narudžbu, bit ćete preusmjereni na PayPal radi odobravanja plaćanja.",
    sr: "Након што пошаљете поруџбину, бићете преусмерени на PayPal ради одобравања плаћања.",
    sl: "Po oddaji naročila boste preusmerjeni na PayPal za potrditev plačila.",
    et: "Pärast tellimuse esitamist suunatakse teid makse kinnitamiseks PayPali.",
    lv: "Pēc pasūtījuma veikšanas jūs tiksiet novirzīts uz PayPal, lai apstiprinātu maksājumu.",
    lt: "Pateikę užsakymą būsite nukreipti į PayPal, kad patvirtintumėte mokėjimą.",
    tr: "Siparişinizi verdikten sonra ödemeyi onaylamak için PayPal'a yönlendirileceksiniz.",
    ru: "После оформления заказа вы будете перенаправлены в PayPal для подтверждения оплаты.",
    uk: "Після оформлення замовлення вас буде перенаправлено в PayPal для підтвердження оплати.",
    ca: "Se't redirigirà a PayPal per aprovar el pagament després de fer la comanda.",
    id: "Anda akan diarahkan ke PayPal untuk menyetujui pembayaran setelah memesan.",
    vi: "Bạn sẽ được chuyển đến PayPal để duyệt thanh toán sau khi đặt hàng.",
    th: "หลังจากสั่งซื้อ คุณจะถูกนำไปที่ PayPal เพื่ออนุมัติการชำระเงิน",
    zh: "下单后，您将被重定向到 PayPal 以批准付款。",
    ja: "注文後、支払いを承認するために PayPal にリダイレクトされます。",
    ko: "주문 후 결제를 승인하기 위해 PayPal로 이동합니다.",
    ar: "ستتم إعادة توجيهك إلى PayPal للموافقة على الدفع بعد تقديم طلبك.",
    he: "לאחר ביצוע ההזמנה תועבר/י ל-PayPal לאישור התשלום.",
    hi: "ऑर्डर देने के बाद भुगतान को मंज़ूरी देने के लिए आपको PayPal पर भेजा जाएगा।",
  },
};

const PLAIN: Record<string, Record<string, string>> = {
  "checkout.emailOptional": { en: "optional" },
  "checkout.tipBadgeSuggested": { en: "Suggested" },
  "checkout.couponApply": { en: "Apply" },
};
const PLAIN_T: Record<string, Record<string, string>> = {
  "checkout.emailOptional": { fr: "facultatif", es: "opcional", it: "facoltativo", pt: "opcional", "pt-BR": "opcional", de: "optional", nl: "optioneel", ro: "opțional", sv: "valfritt", da: "valgfrit", nb: "valgfritt", fi: "valinnainen", pl: "opcjonalnie", cs: "nepovinné", sk: "nepovinné", hu: "nem kötelező", el: "προαιρετικό", bg: "по избор", hr: "neobavezno", sr: "опционо", sl: "neobvezno", et: "valikuline", lv: "neobligāti", lt: "neprivaloma", tr: "isteğe bağlı", ru: "необязательно", uk: "необов'язково", ca: "opcional", id: "opsional", vi: "tùy chọn", th: "ไม่บังคับ", zh: "可选", ja: "任意", ko: "선택", ar: "اختياري", he: "אופציונלי", hi: "वैकल्पिक" },
  "checkout.tipBadgeSuggested": { fr: "Suggéré", es: "Sugerido", it: "Consigliato", pt: "Sugerido", "pt-BR": "Sugerido", de: "Empfohlen", nl: "Voorgesteld", ro: "Sugerat", sv: "Föreslagen", da: "Foreslået", nb: "Foreslått", fi: "Suositeltu", pl: "Sugerowane", cs: "Doporučeno", sk: "Odporúčané", hu: "Javasolt", el: "Προτεινόμενο", bg: "Препоръчано", hr: "Predloženo", sr: "Предложено", sl: "Predlagano", et: "Soovitatud", lv: "Ieteicams", lt: "Siūloma", tr: "Önerilen", ru: "Рекомендуется", uk: "Рекомендовано", ca: "Suggerit", id: "Disarankan", vi: "Đề xuất", th: "แนะนำ", zh: "推荐", ja: "おすすめ", ko: "추천", ar: "مقترح", he: "מומלץ", hi: "सुझाया गया" },
  "checkout.couponApply": { fr: "Appliquer", es: "Aplicar", it: "Applica", pt: "Aplicar", "pt-BR": "Aplicar", de: "Anwenden", nl: "Toepassen", ro: "Aplică", sv: "Använd", da: "Anvend", nb: "Bruk", fi: "Käytä", pl: "Zastosuj", cs: "Použít", sk: "Použiť", hu: "Alkalmaz", el: "Εφαρμογή", bg: "Приложи", hr: "Primijeni", sr: "Примени", sl: "Uporabi", et: "Rakenda", lv: "Lietot", lt: "Taikyti", tr: "Uygula", ru: "Применить", uk: "Застосувати", ca: "Aplica", id: "Terapkan", vi: "Áp dụng", th: "ใช้", zh: "应用", ja: "適用", ko: "적용", ar: "تطبيق", he: "החל", hi: "लागू करें" },
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
  for (const [key, byLoc] of Object.entries(K)) setDeep(data, key, byLoc[loc] ?? byLoc.en);
  for (const [key, enMap] of Object.entries(PLAIN)) setDeep(data, key, PLAIN_T[key]?.[loc] ?? enMap.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ checkout strings added to ${n} locale(s).`);
