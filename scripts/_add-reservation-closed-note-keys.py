# -*- coding: utf-8 -*-
"""Add email.reservationConfirmed.closedNote + closedNoteWithTime to all 38 locales
(polish batch: the reservation closed-hours email gets the concrete opening time —
orders got this in cms0gyexp #8). Wording adapted per-locale from each locale's OWN
email.orderConfirmed.closedNote/WithTime so the voice stays consistent.
Idempotent: skips keys already present."""
import json

KEYS = {
    "en": {
        "closedNote": "The restaurant is currently closed — your reservation request is queued and you'll get an update as soon as they open.",
        "closedNoteWithTime": "The restaurant is currently closed — your reservation request is queued and you'll get an update as soon as they open. Check your email on {openingTime}.",
    },
    "fr": {
        "closedNote": "Le restaurant est actuellement fermé — votre demande de réservation est en attente et vous recevrez une mise à jour dès l'ouverture.",
        "closedNoteWithTime": "Le restaurant est actuellement fermé — votre demande de réservation est en attente et vous recevrez une mise à jour dès l'ouverture. Consultez vos e-mails à partir de {openingTime}.",
    },
    "es": {
        "closedNote": "El restaurante está cerrado en este momento — tu solicitud de reserva queda en espera y recibirás una actualización en cuanto abran.",
        "closedNoteWithTime": "El restaurante está cerrado en este momento — tu solicitud de reserva queda en espera y recibirás una actualización en cuanto abran. Revisa tu correo a partir de {openingTime}.",
    },
    "it": {
        "closedNote": "Il ristorante è al momento chiuso — la tua richiesta di prenotazione è in coda e riceverai un aggiornamento non appena il locale riaprirà.",
        "closedNoteWithTime": "Il ristorante è al momento chiuso — la tua richiesta di prenotazione è in coda e riceverai un aggiornamento non appena il locale riaprirà. Controlla l'email a partire da {openingTime}.",
    },
    "de": {
        "closedNote": "Das Restaurant ist gerade geschlossen — deine Reservierungsanfrage ist vorgemerkt und du bekommst ein Update, sobald es wieder öffnet.",
        "closedNoteWithTime": "Das Restaurant ist gerade geschlossen — deine Reservierungsanfrage ist vorgemerkt und du bekommst ein Update, sobald es wieder öffnet. Wirf ab {openingTime} einen Blick in dein E-Mail-Postfach.",
    },
    "pt": {
        "closedNote": "O restaurante está fechado neste momento — o seu pedido de reserva fica em fila de espera e receberá uma atualização assim que abrirem.",
        "closedNoteWithTime": "O restaurante está fechado neste momento — o seu pedido de reserva fica em fila de espera e receberá uma atualização assim que abrirem. Verifique o seu email a partir de {openingTime}.",
    },
    "pt-BR": {
        "closedNote": "O restaurante está fechado no momento — sua solicitação de reserva fica na fila e você receberá uma atualização assim que ele abrir.",
        "closedNoteWithTime": "O restaurante está fechado no momento — sua solicitação de reserva fica na fila e você receberá uma atualização assim que ele abrir. Confira seu e-mail a partir de {openingTime}.",
    },
    "nl": {
        "closedNote": "Het restaurant is momenteel gesloten — je reserveringsaanvraag staat in de wachtrij en je krijgt een update zodra ze weer opengaan.",
        "closedNoteWithTime": "Het restaurant is momenteel gesloten — je reserveringsaanvraag staat in de wachtrij en je krijgt een update zodra ze weer opengaan. Houd vanaf {openingTime} je e-mail in de gaten.",
    },
    "ro": {
        "closedNote": "Restaurantul este momentan închis — cererea ta de rezervare este în așteptare și vei primi vești imediat ce se deschide.",
        "closedNoteWithTime": "Restaurantul este momentan închis — cererea ta de rezervare este în așteptare și vei primi vești imediat ce se deschide. Verifică-ți e-mailul la {openingTime}.",
    },
    "sv": {
        "closedNote": "Restaurangen är stängd just nu — din bokningsförfrågan ligger i kö och du får en uppdatering så snart de öppnar igen.",
        "closedNoteWithTime": "Restaurangen är stängd just nu — din bokningsförfrågan ligger i kö och du får en uppdatering så snart de öppnar igen. Håll utkik i din mejl från {openingTime}.",
    },
    "da": {
        "closedNote": "Restauranten er lukket lige nu — din reservationsanmodning er i kø, og du får en opdatering, så snart de åbner igen.",
        "closedNoteWithTime": "Restauranten er lukket lige nu — din reservationsanmodning er i kø, og du får en opdatering, så snart de åbner igen. Hold øje med din mail fra {openingTime}.",
    },
    "nb": {
        "closedNote": "Restauranten er stengt akkurat nå — reservasjonsforespørselen din ligger i kø, og du får en oppdatering så snart de åpner igjen.",
        "closedNoteWithTime": "Restauranten er stengt akkurat nå — reservasjonsforespørselen din ligger i kø, og du får en oppdatering så snart de åpner igjen. Følg med på e-posten din fra {openingTime}.",
    },
    "fi": {
        "closedNote": "Ravintola on juuri nyt suljettu — varauspyyntösi on jonossa ja saat päivityksen heti, kun ravintola aukeaa.",
        "closedNoteWithTime": "Ravintola on juuri nyt suljettu — varauspyyntösi on jonossa ja saat päivityksen heti, kun ravintola aukeaa. Tarkista sähköpostisi: {openingTime}.",
    },
    "pl": {
        "closedNote": "Restauracja jest w tej chwili zamknięta — Twoja prośba o rezerwację czeka w kolejce i dostaniesz wiadomość, gdy tylko lokal się otworzy.",
        "closedNoteWithTime": "Restauracja jest w tej chwili zamknięta — Twoja prośba o rezerwację czeka w kolejce i dostaniesz wiadomość, gdy tylko lokal się otworzy. Sprawdź e-mail: {openingTime}.",
    },
    "cs": {
        "closedNote": "Restaurace má právě zavřeno — vaše žádost o rezervaci čeká ve frontě a jakmile restaurace otevře, dáme vám vědět.",
        "closedNoteWithTime": "Restaurace je právě zavřená — vaše žádost o rezervaci čeká ve frontě a jakmile restaurace otevře, pošleme vám aktualizaci. Podívejte se do e-mailu: {openingTime}.",
    },
    "sk": {
        "closedNote": "Reštaurácia má momentálne zatvorené — vaša žiadosť o rezerváciu čaká v poradí a hneď, ako reštaurácia otvorí, dáme vám vedieť.",
        "closedNoteWithTime": "Reštaurácia je práve zatvorená — vaša žiadosť o rezerváciu čaká v poradí a hneď, ako otvoria, pošleme vám aktualizáciu. Pozrite si e-mail: {openingTime}.",
    },
    "hu": {
        "closedNote": "Az étterem jelenleg zárva van — a foglalási kérésed sorban áll, és amint kinyitnak, azonnal értesítünk.",
        "closedNoteWithTime": "Az étterem jelenleg zárva tart — a foglalási kérésed sorban áll, és amint kinyitnak, azonnal értesítést kapsz. Nézd meg az e-mailedet ekkor: {openingTime}.",
    },
    "el": {
        "closedNote": "Το εστιατόριο είναι αυτή τη στιγμή κλειστό — το αίτημα κράτησής σας έχει μπει στη σειρά και θα λάβετε ενημέρωση μόλις ανοίξει.",
        "closedNoteWithTime": "Το εστιατόριο είναι αυτή τη στιγμή κλειστό — το αίτημα κράτησής σας έχει μπει στη σειρά και θα λάβετε ενημέρωση μόλις ανοίξει. Ελέγξτε το email σας στις {openingTime}.",
    },
    "bg": {
        "closedNote": "В момента ресторантът е затворен — заявката ви за резервация е в изчакване и ще получите известие веднага щом отворят.",
        "closedNoteWithTime": "В момента ресторантът е затворен — заявката ви за резервация е в изчакване и ще получите известие веднага щом отворят. Проверете имейла си в {openingTime}.",
    },
    "hr": {
        "closedNote": "Restoran je trenutačno zatvoren — vaš zahtjev za rezervaciju čeka u redu i dobit ćete obavijest čim otvore.",
        "closedNoteWithTime": "Restoran je trenutačno zatvoren — vaš zahtjev za rezervaciju čeka u redu i dobit ćete obavijest čim otvore. Provjerite e-poštu u {openingTime}.",
    },
    "sr": {
        "closedNote": "Ресторан је тренутно затворен — ваш захтев за резервацију је на чекању и добићете обавештење чим се отвори.",
        "closedNoteWithTime": "Ресторан је тренутно затворен — ваш захтев за резервацију је на чекању и добићете обавештење чим се отвори. Проверите имејл у {openingTime}.",
    },
    "sl": {
        "closedNote": "Restavracija je trenutno zaprta — vaša zahteva za rezervacijo čaka v vrsti in obvestilo prejmete takoj, ko odprejo.",
        "closedNoteWithTime": "Restavracija je trenutno zaprta — vaša zahteva za rezervacijo čaka v vrsti in obvestilo prejmete takoj, ko odprejo. Preverite e-pošto ob {openingTime}.",
    },
    "ru": {
        "closedNote": "Ресторан сейчас закрыт — ваш запрос на бронирование поставлен в очередь, и вы получите обновление, как только ресторан откроется.",
        "closedNoteWithTime": "Ресторан сейчас закрыт — ваш запрос на бронирование поставлен в очередь, и вы получите обновление, как только ресторан откроется. Проверьте почту: {openingTime}.",
    },
    "uk": {
        "closedNote": "Ресторан зараз зачинений — ваш запит на бронювання в черзі, і щойно ресторан відкриється, ви отримаєте оновлення.",
        "closedNoteWithTime": "Ресторан зараз зачинений — ваш запит на бронювання в черзі, і щойно ресторан відкриється, ви отримаєте оновлення. Перевірте пошту: {openingTime}.",
    },
    "lt": {
        "closedNote": "Restoranas šiuo metu uždarytas — jūsų rezervacijos užklausa laukia eilėje, o vos tik restoranas atsidarys, gausite žinutę.",
        "closedNoteWithTime": "Restoranas šiuo metu uždarytas — jūsų rezervacijos užklausa laukia eilėje, o vos tik restoranas atsidarys, gausite žinutę. Patikrinkite savo el. paštą: {openingTime}.",
    },
    "lv": {
        "closedNote": "Restorāns šobrīd ir slēgts — jūsu rezervācijas pieprasījums ir rindā, un jūs saņemsiet ziņu, tiklīdz restorāns atvērsies.",
        "closedNoteWithTime": "Restorāns šobrīd ir slēgts — jūsu rezervācijas pieprasījums ir rindā, un jūs saņemsiet ziņu, tiklīdz restorāns atvērsies. Pārbaudiet savu e-pastu: {openingTime}.",
    },
    "et": {
        "closedNote": "Restoran on praegu suletud — sinu broneeringusoov on järjekorras ja saadame sulle teate kohe, kui restoran avaneb.",
        "closedNoteWithTime": "Restoran on praegu suletud — sinu broneeringusoov on järjekorras ja saadame sulle teate kohe, kui restoran avaneb. Vaata oma e-posti: {openingTime}.",
    },
    "tr": {
        "closedNote": "Restoran şu anda kapalı — rezervasyon talebiniz sırada, restoran açılır açılmaz size haber vereceğiz.",
        "closedNoteWithTime": "Restoran şu anda kapalı — rezervasyon talebiniz sıraya alındı ve restoran açılır açılmaz size güncelleme göndereceğiz. {openingTime} itibarıyla e-postanızı kontrol edin.",
    },
    "ca": {
        "closedNote": "El restaurant ara mateix està tancat — la teva sol·licitud de reserva ha quedat en cua i rebràs una actualització tan bon punt obrin.",
        "closedNoteWithTime": "El restaurant ara mateix està tancat — la teva sol·licitud de reserva ha quedat en cua i rebràs una actualització tan bon punt obrin. Revisa el teu correu: {openingTime}.",
    },
    "ar": {
        "closedNote": "المطعم مغلق حاليًا — طلب الحجز الخاص بك في قائمة الانتظار وستصلك آخر المستجدات فور فتح المطعم.",
        "closedNoteWithTime": "المطعم مغلق حاليًا — طلب الحجز الخاص بك في قائمة الانتظار وستصلك رسالة تحديث فور فتح المطعم. تفقّد بريدك الإلكتروني في {openingTime}.",
    },
    "he": {
        "closedNote": "המסעדה סגורה כרגע — בקשת ההזמנה שלך ממתינה בתור ועדכון יישלח אליך ברגע שהמסעדה תיפתח.",
        "closedNoteWithTime": "המסעדה סגורה כרגע — בקשת ההזמנה שלך ממתינה בתור ועדכון יישלח אליך ברגע שהמסעדה תיפתח. כדאי לבדוק את המייל ב-{openingTime}.",
    },
    "hi": {
        "closedNote": "रेस्टोरेंट अभी बंद है — आपका रिज़र्वेशन अनुरोध कतार में है और रेस्टोरेंट खुलते ही आपको अपडेट मिल जाएगा।",
        "closedNoteWithTime": "रेस्टोरेंट अभी बंद है — आपका रिज़र्वेशन अनुरोध कतार में है और रेस्टोरेंट खुलते ही आपको अपडेट मिल जाएगा। {openingTime} पर अपना ईमेल देखें।",
    },
    "ja": {
        "closedNote": "ただいま店舗は営業時間外です。ご予約リクエストは受付待ちの状態で、開店し次第すぐにお知らせします。",
        "closedNoteWithTime": "ただいま店舗は営業時間外です。ご予約リクエストは受付済みで、開店しだいすぐにお知らせします。{openingTime}にメールをご確認ください。",
    },
    "zh": {
        "closedNote": "餐厅目前已打烊——您的预订请求已进入队列，餐厅一开门就会为您更新状态。",
        "closedNoteWithTime": "餐厅目前已打烊——您的预订请求已排入队列，餐厅一开门就会通知您。请在 {openingTime} 查看您的邮箱。",
    },
    "ko": {
        "closedNote": "지금은 매장 영업시간이 아니에요 — 예약 요청은 접수 대기 중이며, 매장이 문을 열면 바로 소식을 알려 드릴게요.",
        "closedNoteWithTime": "지금은 매장 영업시간이 아니에요. 예약 요청은 대기열에 등록되었고, 매장이 문을 여는 대로 바로 알려드릴게요. {openingTime}에 이메일을 확인해 주세요.",
    },
    "th": {
        "closedNote": "ขณะนี้ร้านปิดอยู่ — คำขอจองโต๊ะของคุณอยู่ในคิวแล้ว และคุณจะได้รับการอัปเดตทันทีที่ร้านเปิด",
        "closedNoteWithTime": "ขณะนี้ร้านปิดอยู่ — คำขอจองโต๊ะของคุณเข้าคิวไว้แล้ว และคุณจะได้รับข่าวทันทีที่ร้านเปิด โปรดตรวจสอบอีเมลของคุณเมื่อถึงเวลา {openingTime}",
    },
    "vi": {
        "closedNote": "Nhà hàng hiện đang đóng cửa — yêu cầu đặt bàn của bạn đã được xếp vào hàng chờ và bạn sẽ nhận được cập nhật ngay khi nhà hàng mở cửa.",
        "closedNoteWithTime": "Nhà hàng hiện đang đóng cửa — yêu cầu đặt bàn của bạn đã được xếp vào hàng chờ và bạn sẽ nhận được cập nhật ngay khi nhà hàng mở cửa. Hãy kiểm tra email của bạn vào {openingTime}.",
    },
    "id": {
        "closedNote": "Restoran saat ini tutup — permintaan reservasi Anda sudah masuk antrean dan Anda akan menerima kabar begitu restoran buka.",
        "closedNoteWithTime": "Restoran saat ini tutup — permintaan reservasi Anda sudah masuk antrean dan Anda akan menerima kabar begitu restoran buka. Cek email Anda pada {openingTime}.",
    },
}

added = 0
for code, keys in KEYS.items():
    path = f"src/messages/{code}.json"
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    ns = d["email"]["reservationConfirmed"]
    changed = False
    for k, v in keys.items():
        if k not in ns:
            ns[k] = v
            changed = True
            added += 1
    if changed:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"{code}: ok")
    else:
        print(f"{code}: already present, skipped")
print(f"done — {added} keys added across {len(KEYS)} locales")
