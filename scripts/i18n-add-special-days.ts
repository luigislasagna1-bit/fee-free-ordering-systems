/** i18n: Gloriafood-parity special days (holiday system) × 38 locales.
 *   ordering.{holidayClosedToday,holidaySpecialHours,holidayNotAvailableToday,holidayOrderLater}
 *   admin.hours.{holidaysTitle,holidaysSubtitle,startDate,endDateOpt,reasonOpt,reasonPlaceholder,
 *     messageOpt,messagePlaceholder,affectedServices,allServices,svcPickup,svcDelivery,svcDineIn,
 *     svcTakeOut,svcCatering,svcReservation,modeClosed,modeOpen,addHours,addRule,addSpecialDay,
 *     noUpcoming,holidaySaved,holidaySaveFailed,between}
 *   npx tsx scripts/i18n-add-special-days.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "ordering.holidayClosedToday": {
    en: "We're closed today", fr: "Nous sommes fermés aujourd'hui", es: "Hoy estamos cerrados", it: "Oggi siamo chiusi", pt: "Hoje estamos fechados", "pt-BR": "Hoje estamos fechados",
    de: "Heute geschlossen", nl: "Vandaag gesloten", ro: "Astăzi suntem închiși", sv: "Vi har stängt idag", da: "Vi har lukket i dag", nb: "Vi har stengt i dag",
    fi: "Olemme tänään suljettu", pl: "Dziś zamknięte", cs: "Dnes máme zavřeno", sk: "Dnes máme zatvorené", hu: "Ma zárva vagyunk", el: "Σήμερα είμαστε κλειστά",
    bg: "Днес сме затворени", hr: "Danas smo zatvoreni", sr: "Данас смо затворени", sl: "Danes smo zaprti", et: "Täna oleme suletud", lv: "Šodien esam slēgti",
    lt: "Šiandien nedirbame", tr: "Bugün kapalıyız", ru: "Сегодня мы закрыты", uk: "Сьогодні ми зачинені", ca: "Avui estem tancats", id: "Hari ini kami tutup",
    vi: "Hôm nay chúng tôi đóng cửa", th: "วันนี้เราปิดทำการ", zh: "今天休息", ja: "本日は休業日です", ko: "오늘은 휴무입니다", ar: "نحن مغلقون اليوم", he: "אנחנו סגורים היום", hi: "आज हम बंद हैं",
  },
  "ordering.holidaySpecialHours": {
    en: "Special hours today", fr: "Horaires spéciaux aujourd'hui", es: "Horario especial hoy", it: "Orari speciali oggi", pt: "Horário especial hoje", "pt-BR": "Horário especial hoje",
    de: "Heute Sonderöffnungszeiten", nl: "Vandaag speciale openingstijden", ro: "Program special astăzi", sv: "Specialtider idag", da: "Særlige åbningstider i dag", nb: "Spesielle åpningstider i dag",
    fi: "Erityisaukioloajat tänään", pl: "Dziś specjalne godziny", cs: "Dnes zvláštní otevírací doba", sk: "Dnes špeciálne otváracie hodiny", hu: "Ma rendkívüli nyitvatartás", el: "Ειδικό ωράριο σήμερα",
    bg: "Специално работно време днес", hr: "Danas posebno radno vrijeme", sr: "Данас посебно радно време", sl: "Danes poseben delovni čas", et: "Täna eriline lahtiolekuaeg", lv: "Šodien īpašs darba laiks",
    lt: "Šiandien ypatingos darbo valandos", tr: "Bugün özel çalışma saatleri", ru: "Сегодня особый график", uk: "Сьогодні особливий графік", ca: "Horari especial avui", id: "Jam khusus hari ini",
    vi: "Giờ đặc biệt hôm nay", th: "เวลาพิเศษวันนี้", zh: "今日特殊营业时间", ja: "本日は特別営業時間です", ko: "오늘은 특별 영업시간입니다", ar: "ساعات عمل خاصة اليوم", he: "שעות מיוחדות היום", hi: "आज विशेष समय",
  },
  "ordering.holidayNotAvailableToday": {
    en: "Not available today: {services}", fr: "Indisponible aujourd'hui : {services}", es: "No disponible hoy: {services}", it: "Non disponibile oggi: {services}", pt: "Indisponível hoje: {services}", "pt-BR": "Indisponível hoje: {services}",
    de: "Heute nicht verfügbar: {services}", nl: "Vandaag niet beschikbaar: {services}", ro: "Indisponibil astăzi: {services}", sv: "Inte tillgängligt idag: {services}", da: "Ikke tilgængelig i dag: {services}", nb: "Ikke tilgjengelig i dag: {services}",
    fi: "Ei saatavilla tänään: {services}", pl: "Niedostępne dzisiaj: {services}", cs: "Dnes není k dispozici: {services}", sk: "Dnes nie je k dispozícii: {services}", hu: "Ma nem elérhető: {services}", el: "Μη διαθέσιμο σήμερα: {services}",
    bg: "Не е налично днес: {services}", hr: "Danas nije dostupno: {services}", sr: "Данас није доступно: {services}", sl: "Danes ni na voljo: {services}", et: "Täna pole saadaval: {services}", lv: "Šodien nav pieejams: {services}",
    lt: "Šiandien negalima: {services}", tr: "Bugün kullanılamıyor: {services}", ru: "Сегодня недоступно: {services}", uk: "Сьогодні недоступно: {services}", ca: "No disponible avui: {services}", id: "Tidak tersedia hari ini: {services}",
    vi: "Hôm nay không khả dụng: {services}", th: "วันนี้ไม่พร้อมให้บริการ: {services}", zh: "今日不可用：{services}", ja: "本日はご利用いただけません：{services}", ko: "오늘 이용 불가: {services}", ar: "غير متاح اليوم: {services}", he: "לא זמין היום: {services}", hi: "आज उपलब्ध नहीं: {services}",
  },
  "ordering.holidayOrderLater": {
    en: "You can still place an order for a later date.", fr: "Vous pouvez quand même commander pour une date ultérieure.", es: "Aún puedes hacer un pedido para otra fecha.", it: "Puoi comunque ordinare per una data successiva.", pt: "Ainda pode encomendar para uma data posterior.", "pt-BR": "Você ainda pode pedir para uma data futura.",
    de: "Du kannst trotzdem für einen späteren Termin bestellen.", nl: "Je kunt nog steeds bestellen voor een latere datum.", ro: "Poți totuși plasa o comandă pentru o dată ulterioară.", sv: "Du kan fortfarande beställa till ett senare datum.", da: "Du kan stadig bestille til en senere dato.", nb: "Du kan fortsatt bestille til en senere dato.",
    fi: "Voit silti tilata myöhemmälle päivälle.", pl: "Nadal możesz złożyć zamówienie na późniejszy termin.", cs: "Stále můžete objednat na pozdější datum.", sk: "Stále môžete objednať na neskorší dátum.", hu: "Későbbi időpontra továbbra is rendelhetsz.", el: "Μπορείτε ακόμη να παραγγείλετε για άλλη ημερομηνία.",
    bg: "Все пак можете да поръчате за по-късна дата.", hr: "I dalje možete naručiti za kasniji datum.", sr: "И даље можете наручити за каснији датум.", sl: "Še vedno lahko naročite za poznejši datum.", et: "Saad siiski tellida hilisemaks kuupäevaks.", lv: "Jūs joprojām varat pasūtīt vēlākam datumam.",
    lt: "Vis tiek galite užsisakyti vėlesnei datai.", tr: "Yine de ileri bir tarih için sipariş verebilirsiniz.", ru: "Вы всё ещё можете оформить заказ на другую дату.", uk: "Ви все одно можете замовити на пізнішу дату.", ca: "Encara pots fer una comanda per a una data posterior.", id: "Anda tetap dapat memesan untuk tanggal lain.",
    vi: "Bạn vẫn có thể đặt hàng cho ngày khác.", th: "คุณยังสั่งล่วงหน้าสำหรับวันอื่นได้", zh: "您仍可预订其他日期。", ja: "後日の注文は引き続き可能です。", ko: "다른 날짜로는 주문하실 수 있습니다.", ar: "لا يزال بإمكانك الطلب لتاريخ لاحق.", he: "עדיין אפשר להזמין לתאריך מאוחר יותר.", hi: "आप बाद की तारीख़ के लिए ऑर्डर कर सकते हैं।",
  },
  "admin.hours.holidaysTitle": {
    en: "Holidays & special days", fr: "Jours fériés et jours spéciaux", es: "Festivos y días especiales", it: "Festività e giorni speciali", pt: "Feriados e dias especiais", "pt-BR": "Feriados e dias especiais",
    de: "Feiertage & besondere Tage", nl: "Feestdagen & speciale dagen", ro: "Sărbători și zile speciale", sv: "Helgdagar & specialdagar", da: "Helligdage & særlige dage", nb: "Helligdager & spesielle dager",
    fi: "Pyhäpäivät ja erikoispäivät", pl: "Święta i dni specjalne", cs: "Svátky a zvláštní dny", sk: "Sviatky a špeciálne dni", hu: "Ünnepek és különleges napok", el: "Αργίες & ειδικές ημέρες",
    bg: "Празници и специални дни", hr: "Praznici i posebni dani", sr: "Празници и посебни дани", sl: "Prazniki in posebni dnevi", et: "Pühad ja eripäevad", lv: "Svētku un īpašās dienas",
    lt: "Šventės ir ypatingos dienos", tr: "Tatiller ve özel günler", ru: "Праздники и особые дни", uk: "Свята та особливі дні", ca: "Festius i dies especials", id: "Hari libur & hari khusus",
    vi: "Ngày lễ & ngày đặc biệt", th: "วันหยุดและวันพิเศษ", zh: "节假日与特殊日期", ja: "休業日・特別営業日", ko: "휴일 및 특별 영업일", ar: "العطلات والأيام الخاصة", he: "חגים וימים מיוחדים", hi: "छुट्टियाँ और विशेष दिन",
  },
  "admin.hours.holidaysSubtitle": {
    en: "close fully, close specific services, or set special hours for a date or period", fr: "fermez complètement, fermez certains services ou définissez des horaires spéciaux pour une date ou une période", es: "cierra por completo, cierra servicios específicos o define horarios especiales para una fecha o período", it: "chiudi completamente, chiudi servizi specifici o imposta orari speciali per una data o un periodo", pt: "feche totalmente, feche serviços específicos ou defina horários especiais para uma data ou período", "pt-BR": "feche totalmente, feche serviços específicos ou defina horários especiais para uma data ou período",
    de: "ganz schließen, einzelne Services schließen oder Sonderzeiten für ein Datum oder einen Zeitraum festlegen", nl: "volledig sluiten, specifieke diensten sluiten of speciale tijden instellen voor een datum of periode", ro: "închide complet, închide anumite servicii sau setează program special pentru o dată sau o perioadă", sv: "stäng helt, stäng specifika tjänster eller ange specialtider för ett datum eller en period", da: "luk helt, luk bestemte services eller angiv særlige tider for en dato eller periode", nb: "steng helt, steng enkelte tjenester eller angi spesialtider for en dato eller periode",
    fi: "sulje kokonaan, sulje tietyt palvelut tai aseta erikoisajat päivälle tai jaksolle", pl: "zamknij całkowicie, zamknij wybrane usługi lub ustaw specjalne godziny dla daty lub okresu", cs: "zavřete úplně, zavřete vybrané služby nebo nastavte zvláštní hodiny pro datum či období", sk: "zavrite úplne, zavrite vybrané služby alebo nastavte špeciálne hodiny pre dátum či obdobie", hu: "zárj be teljesen, zárj be egyes szolgáltatásokat, vagy állíts be rendkívüli nyitvatartást egy napra vagy időszakra", el: "κλείστε πλήρως, κλείστε συγκεκριμένες υπηρεσίες ή ορίστε ειδικό ωράριο για ημερομηνία ή περίοδο",
    bg: "затворете напълно, затворете определени услуги или задайте специално работно време за дата или период", hr: "zatvorite potpuno, zatvorite pojedine usluge ili postavite posebno radno vrijeme za datum ili razdoblje", sr: "затворите потпуно, затворите поједине услуге или поставите посебно радно време за датум или период", sl: "zaprite v celoti, zaprite posamezne storitve ali nastavite poseben delovni čas za datum ali obdobje", et: "sulge täielikult, sulge kindlad teenused või määra eriline lahtiolekuaeg kuupäevaks või perioodiks", lv: "aizveriet pilnībā, aizveriet konkrētus pakalpojumus vai iestatiet īpašu darba laiku datumam vai periodam",
    lt: "uždarykite visiškai, uždarykite tam tikras paslaugas arba nustatykite ypatingas valandas datai ar laikotarpiui", tr: "tamamen kapatın, belirli hizmetleri kapatın veya bir tarih ya da dönem için özel saatler belirleyin", ru: "закройтесь полностью, закройте отдельные услуги или задайте особый график на дату или период", uk: "закрийтеся повністю, закрийте окремі послуги або задайте особливий графік на дату чи період", ca: "tanca del tot, tanca serveis concrets o defineix horaris especials per a una data o període", id: "tutup sepenuhnya, tutup layanan tertentu, atau atur jam khusus untuk tanggal atau periode",
    vi: "đóng hoàn toàn, đóng từng dịch vụ hoặc đặt giờ đặc biệt cho một ngày hay khoảng thời gian", th: "ปิดทั้งหมด ปิดบางบริการ หรือกำหนดเวลาพิเศษสำหรับวันหรือช่วงเวลา", zh: "完全停业、关闭特定服务，或为某个日期/时段设置特殊营业时间", ja: "全休、特定サービスのみ休止、または日付・期間の特別営業時間を設定", ko: "전체 휴무, 특정 서비스 중단 또는 날짜/기간에 특별 영업시간 설정", ar: "أغلق كليًا، أو أغلق خدمات محددة، أو حدد ساعات خاصة لتاريخ أو فترة", he: "סגירה מלאה, סגירת שירותים מסוימים או שעות מיוחדות לתאריך או תקופה", hi: "पूरी तरह बंद करें, कुछ सेवाएँ बंद करें, या किसी तिथि/अवधि के लिए विशेष समय सेट करें",
  },
  "admin.hours.startDate": {
    en: "Start date", fr: "Date de début", es: "Fecha de inicio", it: "Data di inizio", pt: "Data de início", "pt-BR": "Data de início",
    de: "Startdatum", nl: "Startdatum", ro: "Data de început", sv: "Startdatum", da: "Startdato", nb: "Startdato",
    fi: "Alkamispäivä", pl: "Data rozpoczęcia", cs: "Datum zahájení", sk: "Dátum začiatku", hu: "Kezdő dátum", el: "Ημερομηνία έναρξης",
    bg: "Начална дата", hr: "Datum početka", sr: "Датум почетка", sl: "Začetni datum", et: "Alguskuupäev", lv: "Sākuma datums",
    lt: "Pradžios data", tr: "Başlangıç tarihi", ru: "Дата начала", uk: "Дата початку", ca: "Data d'inici", id: "Tanggal mulai",
    vi: "Ngày bắt đầu", th: "วันที่เริ่มต้น", zh: "开始日期", ja: "開始日", ko: "시작일", ar: "تاريخ البدء", he: "תאריך התחלה", hi: "प्रारंभ तिथि",
  },
  "admin.hours.endDateOpt": {
    en: "End date (optional)", fr: "Date de fin (facultatif)", es: "Fecha de fin (opcional)", it: "Data di fine (facoltativa)", pt: "Data de fim (opcional)", "pt-BR": "Data de término (opcional)",
    de: "Enddatum (optional)", nl: "Einddatum (optioneel)", ro: "Data de sfârșit (opțional)", sv: "Slutdatum (valfritt)", da: "Slutdato (valgfri)", nb: "Sluttdato (valgfritt)",
    fi: "Päättymispäivä (valinnainen)", pl: "Data zakończenia (opcjonalnie)", cs: "Datum ukončení (volitelné)", sk: "Dátum ukončenia (voliteľné)", hu: "Záró dátum (opcionális)", el: "Ημερομηνία λήξης (προαιρετικό)",
    bg: "Крайна дата (по избор)", hr: "Datum završetka (neobavezno)", sr: "Датум завршетка (опционо)", sl: "Končni datum (neobvezno)", et: "Lõppkuupäev (valikuline)", lv: "Beigu datums (neobligāti)",
    lt: "Pabaigos data (neprivaloma)", tr: "Bitiş tarihi (isteğe bağlı)", ru: "Дата окончания (необязательно)", uk: "Дата завершення (необов'язково)", ca: "Data de fi (opcional)", id: "Tanggal selesai (opsional)",
    vi: "Ngày kết thúc (tùy chọn)", th: "วันที่สิ้นสุด (ไม่บังคับ)", zh: "结束日期（可选）", ja: "終了日（任意）", ko: "종료일 (선택)", ar: "تاريخ الانتهاء (اختياري)", he: "תאריך סיום (אופציונלי)", hi: "समाप्ति तिथि (वैकल्पिक)",
  },
  "admin.hours.reasonOpt": {
    en: "Name (optional)", fr: "Nom (facultatif)", es: "Nombre (opcional)", it: "Nome (facoltativo)", pt: "Nome (opcional)", "pt-BR": "Nome (opcional)",
    de: "Name (optional)", nl: "Naam (optioneel)", ro: "Nume (opțional)", sv: "Namn (valfritt)", da: "Navn (valgfri)", nb: "Navn (valgfritt)",
    fi: "Nimi (valinnainen)", pl: "Nazwa (opcjonalnie)", cs: "Název (volitelné)", sk: "Názov (voliteľné)", hu: "Név (opcionális)", el: "Όνομα (προαιρετικό)",
    bg: "Име (по избор)", hr: "Naziv (neobavezno)", sr: "Назив (опционо)", sl: "Ime (neobvezno)", et: "Nimi (valikuline)", lv: "Nosaukums (neobligāti)",
    lt: "Pavadinimas (neprivaloma)", tr: "Ad (isteğe bağlı)", ru: "Название (необязательно)", uk: "Назва (необов'язково)", ca: "Nom (opcional)", id: "Nama (opsional)",
    vi: "Tên (tùy chọn)", th: "ชื่อ (ไม่บังคับ)", zh: "名称（可选）", ja: "名前（任意）", ko: "이름 (선택)", ar: "الاسم (اختياري)", he: "שם (אופציונלי)", hi: "नाम (वैकल्पिक)",
  },
  "admin.hours.reasonPlaceholder": {
    en: "Christmas Day", fr: "Jour de Noël", es: "Día de Navidad", it: "Natale", pt: "Dia de Natal", "pt-BR": "Dia de Natal",
    de: "1. Weihnachtstag", nl: "Eerste kerstdag", ro: "Ziua de Crăciun", sv: "Juldagen", da: "Juledag", nb: "Første juledag",
    fi: "Joulupäivä", pl: "Boże Narodzenie", cs: "Boží hod vánoční", sk: "Prvý sviatok vianočný", hu: "Karácsony napja", el: "Ημέρα των Χριστουγέννων",
    bg: "Коледа", hr: "Božić", sr: "Божић", sl: "Božič", et: "Esimene jõulupüha", lv: "Ziemassvētku diena",
    lt: "Kalėdų diena", tr: "Noel Günü", ru: "Рождество", uk: "Різдво", ca: "Dia de Nadal", id: "Hari Natal",
    vi: "Ngày Giáng sinh", th: "วันคริสต์มาส", zh: "圣诞节", ja: "クリスマス", ko: "크리스마스", ar: "يوم عيد الميلاد", he: "חג המולד", hi: "क्रिसमस का दिन",
  },
  "admin.hours.messageOpt": {
    en: "Customer message (optional)", fr: "Message client (facultatif)", es: "Mensaje para clientes (opcional)", it: "Messaggio per i clienti (facoltativo)", pt: "Mensagem para clientes (opcional)", "pt-BR": "Mensagem para clientes (opcional)",
    de: "Kundennachricht (optional)", nl: "Bericht aan klanten (optioneel)", ro: "Mesaj pentru clienți (opțional)", sv: "Kundmeddelande (valfritt)", da: "Kundebesked (valgfri)", nb: "Kundemelding (valgfritt)",
    fi: "Viesti asiakkaille (valinnainen)", pl: "Wiadomość dla klientów (opcjonalnie)", cs: "Zpráva zákazníkům (volitelné)", sk: "Správa zákazníkom (voliteľné)", hu: "Üzenet a vendégeknek (opcionális)", el: "Μήνυμα προς πελάτες (προαιρετικό)",
    bg: "Съобщение до клиентите (по избор)", hr: "Poruka kupcima (neobavezno)", sr: "Порука купцима (опционо)", sl: "Sporočilo strankam (neobvezno)", et: "Sõnum klientidele (valikuline)", lv: "Ziņa klientiem (neobligāti)",
    lt: "Žinutė klientams (neprivaloma)", tr: "Müşteri mesajı (isteğe bağlı)", ru: "Сообщение клиентам (необязательно)", uk: "Повідомлення клієнтам (необов'язково)", ca: "Missatge per als clients (opcional)", id: "Pesan untuk pelanggan (opsional)",
    vi: "Tin nhắn cho khách (tùy chọn)", th: "ข้อความถึงลูกค้า (ไม่บังคับ)", zh: "客户提示信息（可选）", ja: "お客様向けメッセージ（任意）", ko: "고객 메시지 (선택)", ar: "رسالة للعملاء (اختياري)", he: "הודעה ללקוחות (אופציונלי)", hi: "ग्राहक संदेश (वैकल्पिक)",
  },
  "admin.hours.messagePlaceholder": {
    en: "We're closed for the holidays — see you soon!", fr: "Nous sommes fermés pour les fêtes — à bientôt !", es: "Cerramos por vacaciones — ¡hasta pronto!", it: "Siamo chiusi per le festività — a presto!", pt: "Estamos fechados para as festas — até breve!", "pt-BR": "Estamos fechados para as festas — até breve!",
    de: "Wir haben über die Feiertage geschlossen — bis bald!", nl: "We zijn gesloten voor de feestdagen — tot snel!", ro: "Suntem închiși de sărbători — pe curând!", sv: "Vi har stängt över helgerna — vi ses snart!", da: "Vi holder lukket i helligdagene — vi ses snart!", nb: "Vi holder stengt i høytiden — ses snart!",
    fi: "Olemme suljettuna pyhien ajan — nähdään pian!", pl: "Zamknięte na święta — do zobaczenia wkrótce!", cs: "Přes svátky máme zavřeno — brzy na viděnou!", sk: "Cez sviatky máme zatvorené — dovidenia čoskoro!", hu: "Az ünnepek alatt zárva vagyunk — hamarosan találkozunk!", el: "Είμαστε κλειστά για τις γιορτές — τα λέμε σύντομα!",
    bg: "Затворени сме за празниците — до скоро!", hr: "Zatvoreni smo za blagdane — vidimo se uskoro!", sr: "Затворени смо за празнике — видимо се ускоро!", sl: "Med prazniki smo zaprti — se vidimo kmalu!", et: "Oleme pühade ajal suletud — varsti näeme!", lv: "Svētkos esam slēgti — uz drīzu tikšanos!",
    lt: "Per šventes nedirbame — iki greito!", tr: "Tatil nedeniyle kapalıyız — yakında görüşürüz!", ru: "Мы закрыты на праздники — до скорого!", uk: "Ми зачинені на свята — до зустрічі!", ca: "Tanquem per festes — fins aviat!", id: "Kami tutup untuk liburan — sampai jumpa!",
    vi: "Chúng tôi nghỉ lễ — hẹn gặp lại!", th: "เราปิดช่วงวันหยุด — แล้วพบกันเร็วๆ นี้!", zh: "节假日休息——回头见！", ja: "祝日のため休業します — またのお越しを！", ko: "연휴 휴무입니다 — 곧 만나요!", ar: "نحن مغلقون في العطلات — نراكم قريبًا!", he: "סגורים לרגל החגים — נתראה בקרוב!", hi: "हम छुट्टियों के लिए बंद हैं — जल्द मिलेंगे!",
  },
  "admin.hours.affectedServices": {
    en: "Affected services", fr: "Services concernés", es: "Servicios afectados", it: "Servizi interessati", pt: "Serviços afetados", "pt-BR": "Serviços afetados",
    de: "Betroffene Services", nl: "Betrokken diensten", ro: "Servicii afectate", sv: "Berörda tjänster", da: "Berørte services", nb: "Berørte tjenester",
    fi: "Koskee palveluita", pl: "Dotyczy usług", cs: "Dotčené služby", sk: "Dotknuté služby", hu: "Érintett szolgáltatások", el: "Επηρεαζόμενες υπηρεσίες",
    bg: "Засегнати услуги", hr: "Obuhvaćene usluge", sr: "Обухваћене услуге", sl: "Zadevne storitve", et: "Mõjutatud teenused", lv: "Skartie pakalpojumi",
    lt: "Paveiktos paslaugos", tr: "Etkilenen hizmetler", ru: "Затронутые услуги", uk: "Залучені послуги", ca: "Serveis afectats", id: "Layanan yang terdampak",
    vi: "Dịch vụ bị ảnh hưởng", th: "บริการที่ได้รับผลกระทบ", zh: "受影响的服务", ja: "対象サービス", ko: "해당 서비스", ar: "الخدمات المتأثرة", he: "שירותים מושפעים", hi: "प्रभावित सेवाएँ",
  },
  "admin.hours.allServices": {
    en: "All services", fr: "Tous les services", es: "Todos los servicios", it: "Tutti i servizi", pt: "Todos os serviços", "pt-BR": "Todos os serviços",
    de: "Alle Services", nl: "Alle diensten", ro: "Toate serviciile", sv: "Alla tjänster", da: "Alle services", nb: "Alle tjenester",
    fi: "Kaikki palvelut", pl: "Wszystkie usługi", cs: "Všechny služby", sk: "Všetky služby", hu: "Minden szolgáltatás", el: "Όλες οι υπηρεσίες",
    bg: "Всички услуги", hr: "Sve usluge", sr: "Све услуге", sl: "Vse storitve", et: "Kõik teenused", lv: "Visi pakalpojumi",
    lt: "Visos paslaugos", tr: "Tüm hizmetler", ru: "Все услуги", uk: "Усі послуги", ca: "Tots els serveis", id: "Semua layanan",
    vi: "Tất cả dịch vụ", th: "ทุกบริการ", zh: "所有服务", ja: "すべてのサービス", ko: "모든 서비스", ar: "جميع الخدمات", he: "כל השירותים", hi: "सभी सेवाएँ",
  },
  "admin.hours.svcPickup": {
    en: "Pickup", fr: "À emporter", es: "Recogida", it: "Ritiro", pt: "Levantamento", "pt-BR": "Retirada",
    de: "Abholung", nl: "Afhalen", ro: "Ridicare", sv: "Avhämtning", da: "Afhentning", nb: "Henting",
    fi: "Nouto", pl: "Odbiór", cs: "Vyzvednutí", sk: "Vyzdvihnutie", hu: "Elvitel", el: "Παραλαβή",
    bg: "Вземане", hr: "Preuzimanje", sr: "Преузимање", sl: "Prevzem", et: "Järeletulemine", lv: "Saņemšana",
    lt: "Atsiėmimas", tr: "Gel-Al", ru: "Самовывоз", uk: "Самовивіз", ca: "Recollida", id: "Ambil sendiri",
    vi: "Tự đến lấy", th: "รับเอง", zh: "自取", ja: "テイクアウト", ko: "픽업", ar: "استلام", he: "איסוף עצמי", hi: "पिकअप",
  },
  "admin.hours.svcDelivery": {
    en: "Delivery", fr: "Livraison", es: "Entrega", it: "Consegna", pt: "Entrega", "pt-BR": "Entrega",
    de: "Lieferung", nl: "Bezorging", ro: "Livrare", sv: "Leverans", da: "Levering", nb: "Levering",
    fi: "Toimitus", pl: "Dostawa", cs: "Rozvoz", sk: "Donáška", hu: "Kiszállítás", el: "Διανομή",
    bg: "Доставка", hr: "Dostava", sr: "Достава", sl: "Dostava", et: "Kohaletoimetamine", lv: "Piegāde",
    lt: "Pristatymas", tr: "Teslimat", ru: "Доставка", uk: "Доставка", ca: "Lliurament", id: "Pengantaran",
    vi: "Giao hàng", th: "จัดส่ง", zh: "外送", ja: "デリバリー", ko: "배달", ar: "توصيل", he: "משלוח", hi: "डिलीवरी",
  },
  "admin.hours.svcDineIn": {
    en: "Dine-in", fr: "Sur place", es: "En el local", it: "Al tavolo", pt: "No restaurante", "pt-BR": "No restaurante",
    de: "Vor Ort", nl: "Ter plaatse", ro: "În restaurant", sv: "Äta på plats", da: "Spis her", nb: "Spis her",
    fi: "Paikan päällä", pl: "Na miejscu", cs: "Na místě", sk: "Na mieste", hu: "Helyben", el: "Στο κατάστημα",
    bg: "На място", hr: "U restoranu", sr: "У ресторану", sl: "V restavraciji", et: "Kohapeal", lv: "Uz vietas",
    lt: "Vietoje", tr: "Restoranda", ru: "В зале", uk: "У залі", ca: "Al local", id: "Makan di tempat",
    vi: "Ăn tại chỗ", th: "ทานที่ร้าน", zh: "堂食", ja: "イートイン", ko: "매장 식사", ar: "تناول في المطعم", he: "ישיבה במקום", hi: "डाइन-इन",
  },
  "admin.hours.svcTakeOut": {
    en: "Take-out", fr: "À emporter (take-out)", es: "Para llevar", it: "Da asporto", pt: "Take-away", "pt-BR": "Para viagem",
    de: "Zum Mitnehmen", nl: "Meenemen", ro: "La pachet", sv: "Take away", da: "Take away", nb: "Take away",
    fi: "Mukaan", pl: "Na wynos", cs: "S sebou", sk: "So sebou", hu: "Elvitelre", el: "Πακέτο",
    bg: "За вкъщи", hr: "Za van", sr: "За понети", sl: "Za s seboj", et: "Kaasa", lv: "Līdzņemšanai",
    lt: "Išsinešimui", tr: "Paket", ru: "Навынос", uk: "На виніс", ca: "Per emportar", id: "Bawa pulang",
    vi: "Mang đi", th: "กลับบ้าน", zh: "外带", ja: "お持ち帰り", ko: "테이크아웃", ar: "سفري", he: "טייק אווי", hi: "टेक-आउट",
  },
  "admin.hours.svcCatering": {
    en: "Catering", fr: "Traiteur", es: "Catering", it: "Catering", pt: "Catering", "pt-BR": "Catering",
    de: "Catering", nl: "Catering", ro: "Catering", sv: "Catering", da: "Catering", nb: "Catering",
    fi: "Catering", pl: "Catering", cs: "Catering", sk: "Catering", hu: "Catering", el: "Catering",
    bg: "Кетъринг", hr: "Catering", sr: "Кетеринг", sl: "Catering", et: "Catering", lv: "Ēdināšana",
    lt: "Maitinimas", tr: "Catering", ru: "Кейтеринг", uk: "Кейтеринг", ca: "Càtering", id: "Katering",
    vi: "Tiệc đặt", th: "จัดเลี้ยง", zh: "宴会订餐", ja: "ケータリング", ko: "케이터링", ar: "تموين الحفلات", he: "קייטרינג", hi: "कैटरिंग",
  },
  "admin.hours.svcReservation": {
    en: "Reservations", fr: "Réservations", es: "Reservas", it: "Prenotazioni", pt: "Reservas", "pt-BR": "Reservas",
    de: "Reservierungen", nl: "Reserveringen", ro: "Rezervări", sv: "Bokningar", da: "Reservationer", nb: "Reservasjoner",
    fi: "Varaukset", pl: "Rezerwacje", cs: "Rezervace", sk: "Rezervácie", hu: "Foglalások", el: "Κρατήσεις",
    bg: "Резервации", hr: "Rezervacije", sr: "Резервације", sl: "Rezervacije", et: "Broneeringud", lv: "Rezervācijas",
    lt: "Rezervacijos", tr: "Rezervasyonlar", ru: "Бронирования", uk: "Бронювання", ca: "Reserves", id: "Reservasi",
    vi: "Đặt bàn", th: "การจอง", zh: "订座", ja: "予約", ko: "예약", ar: "الحجوزات", he: "הזמנות מקום", hi: "आरक्षण",
  },
  "admin.hours.modeClosed": {
    en: "Closed", fr: "Fermé", es: "Cerrado", it: "Chiuso", pt: "Fechado", "pt-BR": "Fechado",
    de: "Geschlossen", nl: "Gesloten", ro: "Închis", sv: "Stängt", da: "Lukket", nb: "Stengt",
    fi: "Suljettu", pl: "Zamknięte", cs: "Zavřeno", sk: "Zatvorené", hu: "Zárva", el: "Κλειστά",
    bg: "Затворено", hr: "Zatvoreno", sr: "Затворено", sl: "Zaprto", et: "Suletud", lv: "Slēgts",
    lt: "Uždaryta", tr: "Kapalı", ru: "Закрыто", uk: "Зачинено", ca: "Tancat", id: "Tutup",
    vi: "Đóng cửa", th: "ปิด", zh: "停业", ja: "休業", ko: "휴무", ar: "مغلق", he: "סגור", hi: "बंद",
  },
  "admin.hours.modeOpen": {
    en: "Open — custom hours", fr: "Ouvert — horaires spéciaux", es: "Abierto — horario especial", it: "Aperto — orari speciali", pt: "Aberto — horário especial", "pt-BR": "Aberto — horário especial",
    de: "Geöffnet — Sonderzeiten", nl: "Open — aangepaste tijden", ro: "Deschis — program special", sv: "Öppet — specialtider", da: "Åbent — særlige tider", nb: "Åpent — spesialtider",
    fi: "Auki — erikoisajat", pl: "Otwarte — specjalne godziny", cs: "Otevřeno — zvláštní hodiny", sk: "Otvorené — špeciálne hodiny", hu: "Nyitva — rendkívüli nyitvatartás", el: "Ανοιχτά — ειδικό ωράριο",
    bg: "Отворено — специално време", hr: "Otvoreno — posebno vrijeme", sr: "Отворено — посебно време", sl: "Odprto — poseben čas", et: "Avatud — eriline aeg", lv: "Atvērts — īpašs laiks",
    lt: "Atidaryta — ypatingos valandos", tr: "Açık — özel saatler", ru: "Открыто — особый график", uk: "Відчинено — особливий графік", ca: "Obert — horari especial", id: "Buka — jam khusus",
    vi: "Mở — giờ đặc biệt", th: "เปิด — เวลาพิเศษ", zh: "营业——特殊时间", ja: "営業 — 特別時間", ko: "영업 — 특별 시간", ar: "مفتوح — ساعات خاصة", he: "פתוח — שעות מיוחדות", hi: "खुला — विशेष समय",
  },
  "admin.hours.addHours": {
    en: "Add hours", fr: "Ajouter des horaires", es: "Añadir horario", it: "Aggiungi orari", pt: "Adicionar horário", "pt-BR": "Adicionar horário",
    de: "Zeiten hinzufügen", nl: "Tijden toevoegen", ro: "Adaugă ore", sv: "Lägg till tider", da: "Tilføj tider", nb: "Legg til tider",
    fi: "Lisää ajat", pl: "Dodaj godziny", cs: "Přidat hodiny", sk: "Pridať hodiny", hu: "Időpont hozzáadása", el: "Προσθήκη ωρών",
    bg: "Добави часове", hr: "Dodaj sate", sr: "Додај сате", sl: "Dodaj ure", et: "Lisa kellaajad", lv: "Pievienot stundas",
    lt: "Pridėti valandas", tr: "Saat ekle", ru: "Добавить часы", uk: "Додати години", ca: "Afegeix horari", id: "Tambah jam",
    vi: "Thêm giờ", th: "เพิ่มเวลา", zh: "添加时段", ja: "時間帯を追加", ko: "시간 추가", ar: "إضافة ساعات", he: "הוסף שעות", hi: "समय जोड़ें",
  },
  "admin.hours.addRule": {
    en: "Add another rule", fr: "Ajouter une autre règle", es: "Añadir otra regla", it: "Aggiungi un'altra regola", pt: "Adicionar outra regra", "pt-BR": "Adicionar outra regra",
    de: "Weitere Regel hinzufügen", nl: "Nog een regel toevoegen", ro: "Adaugă altă regulă", sv: "Lägg till en regel till", da: "Tilføj endnu en regel", nb: "Legg til en regel til",
    fi: "Lisää toinen sääntö", pl: "Dodaj kolejną regułę", cs: "Přidat další pravidlo", sk: "Pridať ďalšie pravidlo", hu: "Másik szabály hozzáadása", el: "Προσθήκη άλλου κανόνα",
    bg: "Добави друго правило", hr: "Dodaj još jedno pravilo", sr: "Додај још једно правило", sl: "Dodaj še eno pravilo", et: "Lisa veel üks reegel", lv: "Pievienot vēl vienu noteikumu",
    lt: "Pridėti dar vieną taisyklę", tr: "Başka kural ekle", ru: "Добавить ещё правило", uk: "Додати ще одне правило", ca: "Afegeix una altra regla", id: "Tambah aturan lain",
    vi: "Thêm quy tắc khác", th: "เพิ่มกฎอีกข้อ", zh: "再添加一条规则", ja: "ルールを追加", ko: "규칙 추가", ar: "إضافة قاعدة أخرى", he: "הוסף כלל נוסף", hi: "एक और नियम जोड़ें",
  },
  "admin.hours.addSpecialDay": {
    en: "Add", fr: "Ajouter", es: "Añadir", it: "Aggiungi", pt: "Adicionar", "pt-BR": "Adicionar",
    de: "Hinzufügen", nl: "Toevoegen", ro: "Adaugă", sv: "Lägg till", da: "Tilføj", nb: "Legg til",
    fi: "Lisää", pl: "Dodaj", cs: "Přidat", sk: "Pridať", hu: "Hozzáadás", el: "Προσθήκη",
    bg: "Добави", hr: "Dodaj", sr: "Додај", sl: "Dodaj", et: "Lisa", lv: "Pievienot",
    lt: "Pridėti", tr: "Ekle", ru: "Добавить", uk: "Додати", ca: "Afegeix", id: "Tambah",
    vi: "Thêm", th: "เพิ่ม", zh: "添加", ja: "追加", ko: "추가", ar: "إضافة", he: "הוסף", hi: "जोड़ें",
  },
  "admin.hours.noUpcoming": {
    en: "No upcoming special days. Add one above.", fr: "Aucun jour spécial à venir. Ajoutez-en un ci-dessus.", es: "No hay días especiales próximos. Añade uno arriba.", it: "Nessun giorno speciale in programma. Aggiungine uno sopra.", pt: "Sem dias especiais próximos. Adicione um acima.", "pt-BR": "Sem dias especiais próximos. Adicione um acima.",
    de: "Keine anstehenden besonderen Tage. Füge oben einen hinzu.", nl: "Geen aankomende speciale dagen. Voeg er hierboven een toe.", ro: "Nicio zi specială viitoare. Adaugă una mai sus.", sv: "Inga kommande specialdagar. Lägg till en ovan.", da: "Ingen kommende særlige dage. Tilføj en ovenfor.", nb: "Ingen kommende spesielle dager. Legg til en ovenfor.",
    fi: "Ei tulevia erikoispäiviä. Lisää yksi yllä.", pl: "Brak nadchodzących dni specjalnych. Dodaj powyżej.", cs: "Žádné nadcházející zvláštní dny. Přidejte výše.", sk: "Žiadne nadchádzajúce špeciálne dni. Pridajte vyššie.", hu: "Nincsenek közelgő különleges napok. Adj hozzá fentebb.", el: "Δεν υπάρχουν επερχόμενες ειδικές ημέρες. Προσθέστε μία παραπάνω.",
    bg: "Няма предстоящи специални дни. Добавете по-горе.", hr: "Nema nadolazećih posebnih dana. Dodajte jedan iznad.", sr: "Нема предстојећих посебних дана. Додајте један изнад.", sl: "Ni prihajajočih posebnih dni. Dodajte enega zgoraj.", et: "Tulevasi eripäevi pole. Lisa üks ülal.", lv: "Nav gaidāmu īpašo dienu. Pievienojiet augstāk.",
    lt: "Nėra artėjančių ypatingų dienų. Pridėkite aukščiau.", tr: "Yaklaşan özel gün yok. Yukarıdan ekleyin.", ru: "Нет предстоящих особых дней. Добавьте выше.", uk: "Немає майбутніх особливих днів. Додайте вище.", ca: "No hi ha dies especials propers. Afegeix-ne un a dalt.", id: "Tidak ada hari khusus mendatang. Tambahkan di atas.",
    vi: "Không có ngày đặc biệt sắp tới. Thêm ở trên.", th: "ไม่มีวันพิเศษที่จะมาถึง เพิ่มได้ด้านบน", zh: "没有即将到来的特殊日期。请在上方添加。", ja: "今後の特別日はありません。上で追加できます。", ko: "예정된 특별일이 없습니다. 위에서 추가하세요.", ar: "لا توجد أيام خاصة قادمة. أضف واحدًا أعلاه.", he: "אין ימים מיוחדים קרובים. הוסף אחד למעלה.", hi: "कोई आगामी विशेष दिन नहीं। ऊपर जोड़ें।",
  },
  "admin.hours.holidaySaved": {
    en: "Special day saved", fr: "Jour spécial enregistré", es: "Día especial guardado", it: "Giorno speciale salvato", pt: "Dia especial guardado", "pt-BR": "Dia especial salvo",
    de: "Besonderer Tag gespeichert", nl: "Speciale dag opgeslagen", ro: "Zi specială salvată", sv: "Specialdag sparad", da: "Særlig dag gemt", nb: "Spesiell dag lagret",
    fi: "Erikoispäivä tallennettu", pl: "Dzień specjalny zapisany", cs: "Zvláštní den uložen", sk: "Špeciálny deň uložený", hu: "Különleges nap mentve", el: "Η ειδική ημέρα αποθηκεύτηκε",
    bg: "Специалният ден е запазен", hr: "Poseban dan spremljen", sr: "Посебан дан сачуван", sl: "Poseben dan shranjen", et: "Eripäev salvestatud", lv: "Īpašā diena saglabāta",
    lt: "Ypatinga diena išsaugota", tr: "Özel gün kaydedildi", ru: "Особый день сохранён", uk: "Особливий день збережено", ca: "Dia especial desat", id: "Hari khusus disimpan",
    vi: "Đã lưu ngày đặc biệt", th: "บันทึกวันพิเศษแล้ว", zh: "特殊日期已保存", ja: "特別日を保存しました", ko: "특별일이 저장되었습니다", ar: "تم حفظ اليوم الخاص", he: "היום המיוחד נשמר", hi: "विशेष दिन सहेजा गया",
  },
  "admin.hours.holidaySaveFailed": {
    en: "Failed to save", fr: "Échec de l'enregistrement", es: "No se pudo guardar", it: "Salvataggio non riuscito", pt: "Falha ao guardar", "pt-BR": "Falha ao salvar",
    de: "Speichern fehlgeschlagen", nl: "Opslaan mislukt", ro: "Salvarea a eșuat", sv: "Det gick inte att spara", da: "Kunne ikke gemme", nb: "Kunne ikke lagre",
    fi: "Tallennus epäonnistui", pl: "Nie udało się zapisać", cs: "Uložení se nezdařilo", sk: "Uloženie zlyhalo", hu: "A mentés nem sikerült", el: "Η αποθήκευση απέτυχε",
    bg: "Записът не бе успешен", hr: "Spremanje nije uspjelo", sr: "Чување није успело", sl: "Shranjevanje ni uspelo", et: "Salvestamine ebaõnnestus", lv: "Neizdevās saglabāt",
    lt: "Nepavyko išsaugoti", tr: "Kaydedilemedi", ru: "Не удалось сохранить", uk: "Не вдалося зберегти", ca: "No s'ha pogut desar", id: "Gagal menyimpan",
    vi: "Lưu thất bại", th: "บันทึกไม่สำเร็จ", zh: "保存失败", ja: "保存に失敗しました", ko: "저장하지 못했습니다", ar: "فشل الحفظ", he: "השמירה נכשלה", hi: "सहेजने में विफल",
  },
  "admin.hours.between": {
    en: "between", fr: "entre", es: "entre", it: "tra", pt: "entre", "pt-BR": "entre",
    de: "zwischen", nl: "tussen", ro: "între", sv: "mellan", da: "mellem", nb: "mellom",
    fi: "välillä", pl: "między", cs: "mezi", sk: "medzi", hu: "ekkor", el: "μεταξύ",
    bg: "между", hr: "između", sr: "између", sl: "med", et: "vahemikus", lv: "no līdz",
    lt: "tarp", tr: "arasında", ru: "с", uk: "з", ca: "entre", id: "antara",
    vi: "từ", th: "ระหว่าง", zh: "时间段", ja: "時間帯", ko: "시간", ar: "بين", he: "בין", hi: "के बीच",
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
console.log(`✓ special-days strings (${Object.keys(KEYS).length} keys) added to ${n} locale(s).`);
