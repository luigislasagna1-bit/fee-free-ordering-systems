/** i18n × 38: EU VAT / VIES strings — billing fiscal card badges + the invoice
 *  reverse-charge disclosure (Fabrizio cmr1ty0lc, 2026-07-03). {date}/{rate}
 *  placeholders must survive. Run: npx tsx scripts/i18n-add-vies-vat.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.billing.viesValid": {
    en: "VIES: valid VAT number (checked {date})", fr: "VIES : numéro de TVA valide (vérifié le {date})", es: "VIES: número de IVA válido (comprobado el {date})", it: "VIES: partita IVA valida (verificata il {date})",
    pt: "VIES: número de IVA válido (verificado em {date})", "pt-BR": "VIES: número de IVA válido (verificado em {date})", de: "VIES: gültige USt-IdNr. (geprüft am {date})", nl: "VIES: geldig btw-nummer (gecontroleerd op {date})",
    ro: "VIES: număr de TVA valid (verificat la {date})", sv: "VIES: giltigt momsnummer (kontrollerat {date})", da: "VIES: gyldigt momsnummer (kontrolleret {date})", nb: "VIES: gyldig MVA-nummer (kontrollert {date})",
    fi: "VIES: voimassa oleva ALV-numero (tarkistettu {date})", pl: "VIES: prawidłowy numer VAT (sprawdzono {date})", cs: "VIES: platné DIČ (ověřeno {date})", sk: "VIES: platné IČ DPH (overené {date})",
    hu: "VIES: érvényes adószám (ellenőrizve: {date})", el: "VIES: έγκυρος ΑΦΜ/ΦΠΑ (ελέγχθηκε {date})", bg: "VIES: валиден ДДС номер (проверен на {date})", hr: "VIES: valjan PDV broj (provjereno {date})",
    sr: "VIES: важећи ПДВ број (проверено {date})", sl: "VIES: veljavna ID za DDV (preverjeno {date})", et: "VIES: kehtiv KMKR number (kontrollitud {date})", lv: "VIES: derīgs PVN numurs (pārbaudīts {date})",
    lt: "VIES: galiojantis PVM numeris (patikrinta {date})", tr: "VIES: geçerli KDV numarası ({date} tarihinde kontrol edildi)", ru: "VIES: действительный номер НДС (проверено {date})", uk: "VIES: дійсний номер ПДВ (перевірено {date})",
    ca: "VIES: número d'IVA vàlid (comprovat el {date})", id: "VIES: nomor PPN valid (diperiksa {date})", vi: "VIES: mã số VAT hợp lệ (kiểm tra {date})", th: "VIES: หมายเลข VAT ถูกต้อง (ตรวจสอบ {date})",
    zh: "VIES：增值税号有效（{date} 已核验）", ja: "VIES：有効なVAT番号（{date}確認済み）", ko: "VIES: 유효한 VAT 번호({date} 확인됨)", ar: "VIES: رقم ضريبة قيمة مضافة صالح (تم التحقق {date})",
    he: "VIES: מספר מע\"מ תקף (נבדק {date})", hi: "VIES: मान्य VAT नंबर ({date} को जाँचा गया)",
  },
  "admin.billing.viesInvalid": {
    en: "Not registered with VIES for cross-border transactions", fr: "Non enregistré dans VIES pour les transactions transfrontalières", es: "No registrado en VIES para operaciones transfronterizas", it: "Non registrato in VIES per operazioni transfrontaliere",
    pt: "Não registado no VIES para transações transfronteiriças", "pt-BR": "Não registrado no VIES para transações internacionais", de: "Nicht im VIES für grenzüberschreitende Umsätze registriert", nl: "Niet in VIES geregistreerd voor grensoverschrijdende transacties",
    ro: "Neînregistrat în VIES pentru tranzacții transfrontaliere", sv: "Inte registrerat i VIES för gränsöverskridande transaktioner", da: "Ikke registreret i VIES til grænseoverskridende transaktioner", nb: "Ikke registrert i VIES for grensekryssende transaksjoner",
    fi: "Ei rekisteröity VIES-järjestelmään rajat ylittäviä liiketoimia varten", pl: "Niezarejestrowany w VIES dla transakcji transgranicznych", cs: "Není registrováno ve VIES pro přeshraniční transakce", sk: "Nie je registrované vo VIES pre cezhraničné transakcie",
    hu: "Nincs regisztrálva a VIES-ben határon átnyúló ügyletekhez", el: "Μη εγγεγραμμένος στο VIES για διασυνοριακές συναλλαγές", bg: "Не е регистриран във VIES за трансгранични сделки", hr: "Nije registriran u VIES-u za prekogranične transakcije",
    sr: "Није регистрован у VIES-у за прекограничне трансакције", sl: "Ni registriran v VIES za čezmejne transakcije", et: "Ei ole VIES-is registreeritud piiriüleste tehingute jaoks", lv: "Nav reģistrēts VIES pārrobežu darījumiem",
    lt: "Neregistruotas VIES tarpvalstybiniams sandoriams", tr: "Sınır ötesi işlemler için VIES'te kayıtlı değil", ru: "Не зарегистрирован в VIES для трансграничных операций", uk: "Не зареєстрований у VIES для транскордонних операцій",
    ca: "No registrat a VIES per a operacions transfrontereres", id: "Tidak terdaftar di VIES untuk transaksi lintas negara", vi: "Chưa đăng ký VIES cho giao dịch xuyên biên giới", th: "ไม่ได้ลงทะเบียน VIES สำหรับธุรกรรมข้ามพรมแดน",
    zh: "未在 VIES 注册跨境交易资格", ja: "越境取引についてVIESに未登録です", ko: "국경 간 거래용 VIES에 등록되어 있지 않음", ar: "غير مسجّل في VIES للمعاملات عبر الحدود",
    he: "לא רשום ב-VIES לעסקאות חוצות גבולות", hi: "सीमा-पार लेनदेन के लिए VIES में पंजीकृत नहीं",
  },
  "admin.billing.viesUnverified": {
    en: "Not verified with VIES yet", fr: "Pas encore vérifié dans VIES", es: "Aún no verificado en VIES", it: "Non ancora verificato in VIES",
    pt: "Ainda não verificado no VIES", "pt-BR": "Ainda não verificado no VIES", de: "Noch nicht über VIES geprüft", nl: "Nog niet via VIES gecontroleerd",
    ro: "Încă neverificat în VIES", sv: "Ännu inte kontrollerat i VIES", da: "Endnu ikke kontrolleret i VIES", nb: "Ennå ikke kontrollert i VIES",
    fi: "Ei vielä tarkistettu VIES-järjestelmästä", pl: "Jeszcze nie zweryfikowano w VIES", cs: "Zatím neověřeno ve VIES", sk: "Zatiaľ neoverené vo VIES",
    hu: "Még nincs ellenőrizve a VIES-ben", el: "Δεν έχει επαληθευτεί ακόμη στο VIES", bg: "Все още не е проверено във VIES", hr: "Još nije provjereno u VIES-u",
    sr: "Још није проверено у VIES-у", sl: "Še ni preverjeno v VIES", et: "VIES-is veel kontrollimata", lv: "Vēl nav pārbaudīts VIES",
    lt: "Dar nepatikrinta VIES", tr: "Henüz VIES ile doğrulanmadı", ru: "Ещё не проверено в VIES", uk: "Ще не перевірено у VIES",
    ca: "Encara no verificat a VIES", id: "Belum diverifikasi dengan VIES", vi: "Chưa xác minh với VIES", th: "ยังไม่ได้ตรวจสอบกับ VIES",
    zh: "尚未通过 VIES 核验", ja: "まだVIESで未確認です", ko: "아직 VIES로 확인되지 않음", ar: "لم يتم التحقق منه عبر VIES بعد",
    he: "טרם אומת מול VIES", hi: "अभी VIES से सत्यापित नहीं",
  },
  "admin.billing.viesVerifyNow": {
    en: "Verify now", fr: "Vérifier maintenant", es: "Verificar ahora", it: "Verifica ora", pt: "Verificar agora", "pt-BR": "Verificar agora", de: "Jetzt prüfen", nl: "Nu controleren",
    ro: "Verifică acum", sv: "Kontrollera nu", da: "Kontrollér nu", nb: "Kontroller nå", fi: "Tarkista nyt", pl: "Zweryfikuj teraz", cs: "Ověřit nyní", sk: "Overiť teraz",
    hu: "Ellenőrzés most", el: "Επαλήθευση τώρα", bg: "Провери сега", hr: "Provjeri sada", sr: "Провери одмах", sl: "Preveri zdaj", et: "Kontrolli kohe", lv: "Pārbaudīt tagad",
    lt: "Patikrinti dabar", tr: "Şimdi doğrula", ru: "Проверить сейчас", uk: "Перевірити зараз", ca: "Verifica ara", id: "Verifikasi sekarang", vi: "Xác minh ngay", th: "ตรวจสอบเลย",
    zh: "立即核验", ja: "今すぐ確認", ko: "지금 확인", ar: "تحقق الآن", he: "אמתו עכשיו", hi: "अभी सत्यापित करें",
  },
  "admin.billing.viesUnreachable": {
    en: "The VIES service is temporarily unavailable — try again in a few minutes.", fr: "Le service VIES est temporairement indisponible — réessayez dans quelques minutes.", es: "El servicio VIES no está disponible temporalmente — inténtalo de nuevo en unos minutos.", it: "Il servizio VIES è temporaneamente non disponibile — riprova tra qualche minuto.",
    pt: "O serviço VIES está temporariamente indisponível — tente novamente dentro de minutos.", "pt-BR": "O serviço VIES está temporariamente indisponível — tente novamente em alguns minutos.", de: "Der VIES-Dienst ist vorübergehend nicht erreichbar — bitte in ein paar Minuten erneut versuchen.", nl: "De VIES-dienst is tijdelijk niet beschikbaar — probeer het over enkele minuten opnieuw.",
    ro: "Serviciul VIES este temporar indisponibil — încercați din nou peste câteva minute.", sv: "VIES-tjänsten är tillfälligt otillgänglig — försök igen om några minuter.", da: "VIES-tjenesten er midlertidigt utilgængelig — prøv igen om et par minutter.", nb: "VIES-tjenesten er midlertidig utilgjengelig — prøv igjen om noen minutter.",
    fi: "VIES-palvelu on tilapäisesti poissa käytöstä — yritä uudelleen muutaman minuutin kuluttua.", pl: "Usługa VIES jest chwilowo niedostępna — spróbuj ponownie za kilka minut.", cs: "Služba VIES je dočasně nedostupná — zkuste to za pár minut.", sk: "Služba VIES je dočasne nedostupná — skúste o pár minút.",
    hu: "A VIES szolgáltatás átmenetileg nem érhető el — próbálja újra néhány perc múlva.", el: "Η υπηρεσία VIES είναι προσωρινά μη διαθέσιμη — δοκιμάστε ξανά σε λίγα λεπτά.", bg: "Услугата VIES е временно недостъпна — опитайте отново след няколко минути.", hr: "Usluga VIES trenutačno nije dostupna — pokušajte ponovno za nekoliko minuta.",
    sr: "VIES услуга је привремено недоступна — покушајте поново за неколико минута.", sl: "Storitev VIES je začasno nedosegljiva — poskusite znova čez nekaj minut.", et: "VIES-teenus pole ajutiselt kättesaadav — proovige mõne minuti pärast uuesti.", lv: "VIES pakalpojums īslaicīgi nav pieejams — mēģiniet vēlreiz pēc dažām minūtēm.",
    lt: "VIES paslauga laikinai nepasiekiama — bandykite dar kartą po kelių minučių.", tr: "VIES hizmeti geçici olarak kullanılamıyor — birkaç dakika sonra tekrar deneyin.", ru: "Сервис VIES временно недоступен — попробуйте снова через несколько минут.", uk: "Сервіс VIES тимчасово недоступний — спробуйте ще раз за кілька хвилин.",
    ca: "El servei VIES no està disponible temporalment — torna-ho a provar d'aquí a uns minuts.", id: "Layanan VIES sementara tidak tersedia — coba lagi dalam beberapa menit.", vi: "Dịch vụ VIES tạm thời không khả dụng — thử lại sau vài phút.", th: "บริการ VIES ใช้งานไม่ได้ชั่วคราว — ลองอีกครั้งในอีกไม่กี่นาที",
    zh: "VIES 服务暂时不可用——请几分钟后重试。", ja: "VIESサービスが一時的に利用できません — 数分後にもう一度お試しください。", ko: "VIES 서비스를 일시적으로 사용할 수 없습니다 — 몇 분 후 다시 시도하세요.", ar: "خدمة VIES غير متاحة مؤقتًا — حاول مجددًا بعد دقائق.",
    he: "שירות VIES אינו זמין זמנית — נסו שוב בעוד כמה דקות.", hi: "VIES सेवा अस्थायी रूप से अनुपलब्ध है — कुछ मिनट बाद पुनः प्रयास करें।",
  },
  "admin.billing.euVatNote": {
    en: "EU businesses: a VIES-registered VAT number is required for paid subscriptions. Validated numbers are invoiced at 0% VAT (reverse charge).",
    fr: "Entreprises de l'UE : un numéro de TVA enregistré dans VIES est requis pour les abonnements payants. Les numéros validés sont facturés à 0 % de TVA (autoliquidation).",
    es: "Empresas de la UE: se requiere un número de IVA registrado en VIES para las suscripciones de pago. Los números validados se facturan al 0 % de IVA (inversión del sujeto pasivo).",
    it: "Aziende UE: per gli abbonamenti a pagamento è richiesta una partita IVA registrata in VIES. I numeri convalidati sono fatturati con IVA 0% (reverse charge).",
    pt: "Empresas da UE: é necessário um número de IVA registado no VIES para subscrições pagas. Os números validados são faturados a 0% de IVA (autoliquidação).",
    "pt-BR": "Empresas da UE: é necessário um número de IVA registrado no VIES para assinaturas pagas. Números validados são faturados com 0% de IVA (reverse charge).",
    de: "EU-Unternehmen: Für kostenpflichtige Abos ist eine im VIES registrierte USt-IdNr. erforderlich. Validierte Nummern werden mit 0 % USt (Reverse Charge) fakturiert.",
    nl: "EU-bedrijven: voor betaalde abonnementen is een in VIES geregistreerd btw-nummer vereist. Gevalideerde nummers worden gefactureerd met 0% btw (verleggingsregeling).",
    ro: "Companii din UE: pentru abonamente plătite este necesar un număr de TVA înregistrat în VIES. Numerele validate sunt facturate cu TVA 0% (taxare inversă).",
    sv: "EU-företag: ett VIES-registrerat momsnummer krävs för betalda prenumerationer. Validerade nummer faktureras med 0 % moms (omvänd skattskyldighet).",
    da: "EU-virksomheder: et VIES-registreret momsnummer kræves til betalte abonnementer. Validerede numre faktureres med 0 % moms (omvendt betalingspligt).",
    nb: "EU-bedrifter: et VIES-registrert MVA-nummer kreves for betalte abonnementer. Validerte numre faktureres med 0 % MVA (omvendt avgiftsplikt).",
    fi: "EU-yritykset: maksullisiin tilauksiin vaaditaan VIES-rekisteröity ALV-numero. Vahvistetut numerot laskutetaan 0 %:n ALV:lla (käännetty verovelvollisuus).",
    pl: "Firmy z UE: do płatnych subskrypcji wymagany jest numer VAT zarejestrowany w VIES. Zweryfikowane numery są fakturowane z 0% VAT (odwrotne obciążenie).",
    cs: "Firmy z EU: pro placené předplatné je nutné DIČ registrované ve VIES. Ověřená čísla fakturujeme s 0% DPH (přenesená daňová povinnost).",
    sk: "Firmy z EÚ: pre platené predplatné je potrebné IČ DPH registrované vo VIES. Overené čísla fakturujeme s 0 % DPH (prenesenie daňovej povinnosti).",
    hu: "EU-s vállalkozások: a fizetős előfizetésekhez VIES-ben regisztrált adószám szükséges. Az érvényesített számokat 0% áfával számlázzuk (fordított adózás).",
    el: "Επιχειρήσεις ΕΕ: για συνδρομές επί πληρωμή απαιτείται ΑΦΜ/ΦΠΑ εγγεγραμμένος στο VIES. Οι επικυρωμένοι αριθμοί τιμολογούνται με ΦΠΑ 0% (αντίστροφη επιβάρυνση).",
    bg: "Фирми от ЕС: за платени абонаменти се изисква ДДС номер, регистриран във VIES. Валидираните номера се фактурират с 0% ДДС (обратно начисляване).",
    hr: "Tvrtke iz EU: za plaćene pretplate potreban je PDV broj registriran u VIES-u. Provjereni brojevi fakturiraju se s 0% PDV-a (prijenos porezne obveze).",
    sr: "Фирме из ЕУ: за плаћене претплате потребан је ПДВ број регистрован у VIES-у. Потврђени бројеви се фактуришу са 0% ПДВ-а (обрнута наплата).",
    sl: "Podjetja iz EU: za plačljive naročnine je potrebna ID za DDV, registrirana v VIES. Potrjene številke fakturiramo z 0% DDV (obrnjena davčna obveznost).",
    et: "EL-i ettevõtted: tasuliste tellimuste jaoks on vajalik VIES-is registreeritud KMKR number. Kinnitatud numbrid arveldatakse 0% käibemaksuga (pöördmaksustamine).",
    lv: "ES uzņēmumi: maksas abonementiem nepieciešams VIES reģistrēts PVN numurs. Apstiprināti numuri tiek rēķināti ar 0% PVN (apgrieztā maksāšana).",
    lt: "ES įmonės: mokamoms prenumeratoms reikalingas VIES registruotas PVM numeris. Patvirtinti numeriai apmokestinami 0% PVM (atvirkštinis apmokestinimas).",
    tr: "AB işletmeleri: ücretli abonelikler için VIES'te kayıtlı bir KDV numarası gerekir. Doğrulanmış numaralar %0 KDV ile faturalandırılır (ters vergilendirme).",
    ru: "Компании из ЕС: для платных подписок требуется номер НДС, зарегистрированный в VIES. Подтверждённые номера выставляются с НДС 0% (обратное начисление).",
    uk: "Компанії з ЄС: для платних підписок потрібен номер ПДВ, зареєстрований у VIES. Підтверджені номери виставляються з ПДВ 0% (зворотне нарахування).",
    ca: "Empreses de la UE: cal un número d'IVA registrat a VIES per a subscripcions de pagament. Els números validats es facturen amb IVA del 0% (inversió del subjecte passiu).",
    id: "Bisnis UE: nomor PPN terdaftar VIES diperlukan untuk langganan berbayar. Nomor tervalidasi ditagih dengan PPN 0% (reverse charge).",
    vi: "Doanh nghiệp EU: cần mã số VAT đăng ký VIES cho gói trả phí. Mã hợp lệ được xuất hóa đơn 0% VAT (thuế đảo chiều).",
    th: "ธุรกิจใน EU: ต้องมีหมายเลข VAT ที่ลงทะเบียน VIES สำหรับการสมัครแบบชำระเงิน หมายเลขที่ตรวจสอบแล้วจะออกใบแจ้งหนี้ที่ VAT 0% (reverse charge)",
    zh: "欧盟企业：付费订阅需要在 VIES 注册的增值税号。已验证的税号按 0% 增值税开票（反向征收）。",
    ja: "EU企業の方へ：有料サブスクリプションにはVIES登録済みのVAT番号が必要です。検証済み番号はVAT 0%（リバースチャージ）で請求されます。",
    ko: "EU 사업자: 유료 구독에는 VIES에 등록된 VAT 번호가 필요합니다. 검증된 번호는 VAT 0%(대리납부)로 청구됩니다.",
    ar: "شركات الاتحاد الأوروبي: يلزم رقم ضريبة قيمة مضافة مسجّل في VIES للاشتراكات المدفوعة. تُفوتر الأرقام المتحقق منها بضريبة 0% (الاحتساب العكسي).",
    he: "עסקים באיחוד האירופי: נדרש מספר מע\"מ רשום ב-VIES למינויים בתשלום. מספרים מאומתים מחויבים במע\"מ 0% (חיוב הפוך).",
    hi: "EU व्यवसाय: सशुल्क सदस्यता के लिए VIES-पंजीकृत VAT नंबर आवश्यक है। सत्यापित नंबरों का चालान 0% VAT (रिवर्स चार्ज) पर बनता है।",
  },
  "admin.invoice.taxRateAmount": {
    en: "Tax rate & amount ({rate}%)", fr: "Taux et montant de la taxe ({rate} %)", es: "Tipo e importe del impuesto ({rate}%)", it: "Aliquota e importo imposta ({rate}%)",
    pt: "Taxa e valor do imposto ({rate}%)", "pt-BR": "Alíquota e valor do imposto ({rate}%)", de: "Steuersatz & Betrag ({rate} %)", nl: "Btw-tarief & bedrag ({rate}%)",
    ro: "Cota și valoarea taxei ({rate}%)", sv: "Skattesats & belopp ({rate}%)", da: "Skattesats & beløb ({rate}%)", nb: "Skattesats og beløp ({rate}%)",
    fi: "Verokanta ja määrä ({rate} %)", pl: "Stawka i kwota podatku ({rate}%)", cs: "Sazba a částka daně ({rate}%)", sk: "Sadzba a suma dane ({rate}%)",
    hu: "Adókulcs és összeg ({rate}%)", el: "Συντελεστής & ποσό φόρου ({rate}%)", bg: "Данъчна ставка и сума ({rate}%)", hr: "Porezna stopa i iznos ({rate}%)",
    sr: "Пореска стопа и износ ({rate}%)", sl: "Davčna stopnja in znesek ({rate}%)", et: "Maksumäär ja summa ({rate}%)", lv: "Nodokļa likme un summa ({rate}%)",
    lt: "Mokesčio tarifas ir suma ({rate}%)", tr: "Vergi oranı ve tutarı (%{rate})", ru: "Ставка и сумма налога ({rate}%)", uk: "Ставка та сума податку ({rate}%)",
    ca: "Tipus i import de l'impost ({rate}%)", id: "Tarif & jumlah pajak ({rate}%)", vi: "Thuế suất & số tiền ({rate}%)", th: "อัตราและจำนวนภาษี ({rate}%)",
    zh: "税率与税额（{rate}%）", ja: "税率・税額（{rate}%）", ko: "세율 및 세액({rate}%)", ar: "نسبة الضريبة ومبلغها ({rate}%)",
    he: "שיעור וסכום המס ({rate}%)", hi: "कर दर व राशि ({rate}%)",
  },
  "admin.invoice.reverseChargeNote": {
    en: "Non-taxable transaction in accordance with Article 44 of Directive 2006/112/EC — reverse charge: VAT to be accounted for by the recipient.",
    fr: "Opération non imposable conformément à l'article 44 de la directive 2006/112/CE — autoliquidation : TVA due par le preneur.",
    es: "Operación no sujeta conforme al artículo 44 de la Directiva 2006/112/CE — inversión del sujeto pasivo: el IVA corre a cargo del destinatario.",
    it: "Operazione non imponibile ai sensi dell'articolo 44 della Direttiva 2006/112/CE — reverse charge: IVA a carico del destinatario.",
    pt: "Transação não tributável nos termos do artigo 44.º da Diretiva 2006/112/CE — autoliquidação: IVA a cargo do destinatário.",
    "pt-BR": "Transação não tributável conforme o artigo 44 da Diretiva 2006/112/CE — reverse charge: IVA por conta do destinatário.",
    de: "Nicht steuerbarer Umsatz gemäß Artikel 44 der Richtlinie 2006/112/EG — Reverse Charge: Steuerschuldnerschaft des Leistungsempfängers.",
    nl: "Niet-belastbare handeling overeenkomstig artikel 44 van Richtlijn 2006/112/EG — btw verlegd: btw verschuldigd door de afnemer.",
    ro: "Tranzacție neimpozabilă în conformitate cu articolul 44 al Directivei 2006/112/CE — taxare inversă: TVA în sarcina beneficiarului.",
    sv: "Icke skattepliktig transaktion enligt artikel 44 i direktiv 2006/112/EG — omvänd skattskyldighet: moms redovisas av mottagaren.",
    da: "Ikke-afgiftspligtig transaktion i henhold til artikel 44 i direktiv 2006/112/EF — omvendt betalingspligt: momsen afregnes af modtageren.",
    nb: "Ikke-avgiftspliktig transaksjon i henhold til artikkel 44 i direktiv 2006/112/EF — omvendt avgiftsplikt: MVA beregnes av mottakeren.",
    fi: "Veroton liiketoimi direktiivin 2006/112/EY 44 artiklan mukaisesti — käännetty verovelvollisuus: vastaanottaja tilittää ALV:n.",
    pl: "Transakcja niepodlegająca opodatkowaniu zgodnie z art. 44 dyrektywy 2006/112/WE — odwrotne obciążenie: VAT rozlicza nabywca.",
    cs: "Nezdanitelné plnění podle článku 44 směrnice 2006/112/ES — přenesená daňová povinnost: DPH odvede příjemce.",
    sk: "Nezdaniteľné plnenie podľa článku 44 smernice 2006/112/ES — prenesenie daňovej povinnosti: DPH odvedie príjemca.",
    hu: "Adómentes ügylet a 2006/112/EK irányelv 44. cikke alapján — fordított adózás: az áfát a szolgáltatás igénybevevője számolja el.",
    el: "Μη φορολογητέα συναλλαγή σύμφωνα με το άρθρο 44 της Οδηγίας 2006/112/ΕΚ — αντίστροφη επιβάρυνση: ο ΦΠΑ αποδίδεται από τον λήπτη.",
    bg: "Необлагаема сделка съгласно член 44 от Директива 2006/112/ЕО — обратно начисляване: ДДС се начислява от получателя.",
    hr: "Neoporeziva transakcija u skladu s člankom 44. Direktive 2006/112/EZ — prijenos porezne obveze: PDV obračunava primatelj.",
    sr: "Неопорезива трансакција у складу са чланом 44 Директиве 2006/112/ЕЗ — обрнута наплата: ПДВ обрачунава прималац.",
    sl: "Neobdavčljiva transakcija v skladu s 44. členom Direktive 2006/112/ES — obrnjena davčna obveznost: DDV obračuna prejemnik.",
    et: "Mittemaksustatav tehing vastavalt direktiivi 2006/112/EÜ artiklile 44 — pöördmaksustamine: käibemaksu arvestab saaja.",
    lv: "Ar nodokli neapliekams darījums saskaņā ar Direktīvas 2006/112/EK 44. pantu — apgrieztā maksāšana: PVN uzskaita saņēmējs.",
    lt: "Neapmokestinamasis sandoris pagal Direktyvos 2006/112/EB 44 straipsnį — atvirkštinis apmokestinimas: PVM apskaito gavėjas.",
    tr: "2006/112/AT sayılı Direktifin 44. maddesi uyarınca vergiye tabi olmayan işlem — ters vergilendirme: KDV alıcı tarafından beyan edilir.",
    ru: "Необлагаемая операция в соответствии со статьёй 44 Директивы 2006/112/ЕС — обратное начисление: НДС уплачивает получатель.",
    uk: "Неоподатковувана операція відповідно до статті 44 Директиви 2006/112/ЄС — зворотне нарахування: ПДВ сплачує отримувач.",
    ca: "Operació no subjecta d'acord amb l'article 44 de la Directiva 2006/112/CE — inversió del subjecte passiu: l'IVA va a càrrec del destinatari.",
    id: "Transaksi tidak kena pajak sesuai Pasal 44 Direktif 2006/112/EC — reverse charge: PPN diperhitungkan oleh penerima.",
    vi: "Giao dịch không chịu thuế theo Điều 44 Chỉ thị 2006/112/EC — thuế đảo chiều: bên nhận tự kê khai VAT.",
    th: "ธุรกรรมไม่ต้องเสียภาษีตามมาตรา 44 ของ Directive 2006/112/EC — reverse charge: ผู้รับเป็นผู้รับผิดชอบ VAT",
    zh: "根据 2006/112/EC 指令第 44 条为免税交易——反向征收：增值税由接收方申报。",
    ja: "指令2006/112/EC第44条に基づく非課税取引 — リバースチャージ：VATは受領者が申告します。",
    ko: "지침 2006/112/EC 제44조에 따른 비과세 거래 — 대리납부: VAT는 수령자가 신고합니다.",
    ar: "معاملة غير خاضعة للضريبة وفقًا للمادة 44 من التوجيه 2006/112/EC — احتساب عكسي: يتولى المستلم احتساب ضريبة القيمة المضافة.",
    he: "עסקה שאינה חייבת במס בהתאם לסעיף 44 של דירקטיבה 2006/112/EC — חיוב הפוך: המע\"מ ידווח על ידי המקבל.",
    hi: "निर्देश 2006/112/EC के अनुच्छेद 44 के अनुसार कर-मुक्त लेनदेन — रिवर्स चार्ज: VAT का लेखा प्राप्तकर्ता करेगा।",
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
  for (const [key, byLoc] of Object.entries(K)) setDeep(data, key, byLoc[loc] ?? byLoc.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ VIES / reverse-charge strings added to ${n} locale(s).`);
