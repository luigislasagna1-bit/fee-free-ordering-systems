/**
 * Copy for the two surfaces that used to lie to a customer whose card payment
 * never completed (Luigi 2026-08-11):
 *
 *   customer.confirmation.paymentNotCompleted*  — the confirmation page used to
 *     render a green "Order Placed!" no matter what. Sharon Craven read her
 *     order number off that screen for an order the store never received.
 *   customer.payment.preparingPayment / couldNotStartPayment / backToRestaurant
 *     — the payment page now re-derives the intent from the order id instead of
 *     needing it in the URL, so it has a real loading and failure state.
 *
 *   npx tsx scripts/i18n-add-payment-not-completed.ts
 *
 * Idempotent — never overwrites an existing value.
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Confirm = { paymentNotCompleted: string; paymentNotCompletedBody: string; paymentNotCompletedPaidAlready: string };
type Pay = { preparingPayment: string; couldNotStartPayment: string; backToRestaurant: string };
type Bundle = { confirmation: Confirm; payment: Pay };

const T: Record<string, Bundle> = {
  en: {
    confirmation: {
      paymentNotCompleted: "Payment not completed",
      paymentNotCompletedBody: "{restaurantName} has not received this order, because the payment wasn't completed. You have not been charged — any amount held on your card is released automatically.",
      paymentNotCompletedPaidAlready: "Already paid? Wait a moment and refresh this page — we confirm payments automatically. If it still shows this, contact {restaurantName} and quote order number {orderNumber}.",
    },
    payment: { preparingPayment: "Preparing secure payment…", couldNotStartPayment: "We couldn't start the payment for this order. Please go back and try again.", backToRestaurant: "Back to restaurant" },
  },
  it: {
    confirmation: {
      paymentNotCompleted: "Pagamento non completato",
      paymentNotCompletedBody: "{restaurantName} non ha ricevuto questo ordine perché il pagamento non è stato completato. Non ti è stato addebitato nulla: qualsiasi importo bloccato sulla tua carta viene rilasciato automaticamente.",
      paymentNotCompletedPaidAlready: "Hai già pagato? Attendi un momento e aggiorna questa pagina: confermiamo i pagamenti automaticamente. Se continui a vedere questo messaggio, contatta {restaurantName} indicando il numero d'ordine {orderNumber}.",
    },
    payment: { preparingPayment: "Preparazione del pagamento sicuro…", couldNotStartPayment: "Non siamo riusciti ad avviare il pagamento per questo ordine. Torna indietro e riprova.", backToRestaurant: "Torna al ristorante" },
  },
  fr: {
    confirmation: {
      paymentNotCompleted: "Paiement non finalisé",
      paymentNotCompletedBody: "{restaurantName} n'a pas reçu cette commande, car le paiement n'a pas été finalisé. Vous n'avez pas été débité — tout montant bloqué sur votre carte est libéré automatiquement.",
      paymentNotCompletedPaidAlready: "Déjà payé ? Patientez un instant puis actualisez cette page — nous confirmons les paiements automatiquement. Si ce message persiste, contactez {restaurantName} en indiquant le numéro de commande {orderNumber}.",
    },
    payment: { preparingPayment: "Préparation du paiement sécurisé…", couldNotStartPayment: "Nous n'avons pas pu démarrer le paiement de cette commande. Veuillez revenir en arrière et réessayer.", backToRestaurant: "Retour au restaurant" },
  },
  es: {
    confirmation: {
      paymentNotCompleted: "Pago no completado",
      paymentNotCompletedBody: "{restaurantName} no ha recibido este pedido porque el pago no se completó. No se te ha cobrado nada: cualquier importe retenido en tu tarjeta se libera automáticamente.",
      paymentNotCompletedPaidAlready: "¿Ya pagaste? Espera un momento y actualiza esta página: confirmamos los pagos automáticamente. Si sigue apareciendo esto, contacta con {restaurantName} e indica el número de pedido {orderNumber}.",
    },
    payment: { preparingPayment: "Preparando el pago seguro…", couldNotStartPayment: "No pudimos iniciar el pago de este pedido. Vuelve atrás e inténtalo de nuevo.", backToRestaurant: "Volver al restaurante" },
  },
  de: {
    confirmation: {
      paymentNotCompleted: "Zahlung nicht abgeschlossen",
      paymentNotCompletedBody: "{restaurantName} hat diese Bestellung nicht erhalten, weil die Zahlung nicht abgeschlossen wurde. Dir wurde nichts berechnet — ein eventuell auf deiner Karte reservierter Betrag wird automatisch freigegeben.",
      paymentNotCompletedPaidAlready: "Schon bezahlt? Warte einen Moment und lade diese Seite neu — wir bestätigen Zahlungen automatisch. Wenn das weiterhin angezeigt wird, wende dich an {restaurantName} und nenne die Bestellnummer {orderNumber}.",
    },
    payment: { preparingPayment: "Sichere Zahlung wird vorbereitet…", couldNotStartPayment: "Die Zahlung für diese Bestellung konnte nicht gestartet werden. Bitte geh zurück und versuche es erneut.", backToRestaurant: "Zurück zum Restaurant" },
  },
  pt: {
    confirmation: {
      paymentNotCompleted: "Pagamento não concluído",
      paymentNotCompletedBody: "O {restaurantName} não recebeu este pedido porque o pagamento não foi concluído. Não lhe foi cobrado nada — qualquer valor retido no seu cartão é libertado automaticamente.",
      paymentNotCompletedPaidAlready: "Já pagou? Aguarde um momento e atualize esta página — confirmamos os pagamentos automaticamente. Se continuar a ver esta mensagem, contacte o {restaurantName} e indique o número de pedido {orderNumber}.",
    },
    payment: { preparingPayment: "A preparar o pagamento seguro…", couldNotStartPayment: "Não foi possível iniciar o pagamento deste pedido. Volte atrás e tente novamente.", backToRestaurant: "Voltar ao restaurante" },
  },
  "pt-BR": {
    confirmation: {
      paymentNotCompleted: "Pagamento não concluído",
      paymentNotCompletedBody: "O {restaurantName} não recebeu este pedido porque o pagamento não foi concluído. Nada foi cobrado de você — qualquer valor reservado no seu cartão é liberado automaticamente.",
      paymentNotCompletedPaidAlready: "Já pagou? Aguarde um momento e atualize esta página — confirmamos os pagamentos automaticamente. Se continuar aparecendo isso, entre em contato com o {restaurantName} e informe o número do pedido {orderNumber}.",
    },
    payment: { preparingPayment: "Preparando pagamento seguro…", couldNotStartPayment: "Não conseguimos iniciar o pagamento deste pedido. Volte e tente novamente.", backToRestaurant: "Voltar ao restaurante" },
  },
  nl: {
    confirmation: {
      paymentNotCompleted: "Betaling niet voltooid",
      paymentNotCompletedBody: "{restaurantName} heeft deze bestelling niet ontvangen, omdat de betaling niet is voltooid. Er is niets afgeschreven — een eventueel gereserveerd bedrag op je kaart wordt automatisch vrijgegeven.",
      paymentNotCompletedPaidAlready: "Al betaald? Wacht even en vernieuw deze pagina — we bevestigen betalingen automatisch. Als dit blijft staan, neem dan contact op met {restaurantName} en noem bestelnummer {orderNumber}.",
    },
    payment: { preparingPayment: "Veilige betaling voorbereiden…", couldNotStartPayment: "We konden de betaling voor deze bestelling niet starten. Ga terug en probeer het opnieuw.", backToRestaurant: "Terug naar restaurant" },
  },
  pl: {
    confirmation: {
      paymentNotCompleted: "Płatność nie została zakończona",
      paymentNotCompletedBody: "{restaurantName} nie otrzymał tego zamówienia, ponieważ płatność nie została zakończona. Nie pobraliśmy żadnych środków — każda kwota zablokowana na karcie zostanie zwolniona automatycznie.",
      paymentNotCompletedPaidAlready: "Już zapłacono? Odczekaj chwilę i odśwież tę stronę — płatności potwierdzamy automatycznie. Jeśli komunikat nadal się wyświetla, skontaktuj się z {restaurantName} i podaj numer zamówienia {orderNumber}.",
    },
    payment: { preparingPayment: "Przygotowywanie bezpiecznej płatności…", couldNotStartPayment: "Nie udało się rozpocząć płatności za to zamówienie. Wróć i spróbuj ponownie.", backToRestaurant: "Wróć do restauracji" },
  },
  ro: {
    confirmation: {
      paymentNotCompleted: "Plata nu a fost finalizată",
      paymentNotCompletedBody: "{restaurantName} nu a primit această comandă, deoarece plata nu a fost finalizată. Nu ți s-a debitat nimic — orice sumă blocată pe card este eliberată automat.",
      paymentNotCompletedPaidAlready: "Ai plătit deja? Așteaptă un moment și reîmprospătează această pagină — confirmăm plățile automat. Dacă mesajul persistă, contactează {restaurantName} și menționează numărul comenzii {orderNumber}.",
    },
    payment: { preparingPayment: "Se pregătește plata securizată…", couldNotStartPayment: "Nu am putut iniția plata pentru această comandă. Întoarce-te și încearcă din nou.", backToRestaurant: "Înapoi la restaurant" },
  },
  hu: {
    confirmation: {
      paymentNotCompleted: "A fizetés nem fejeződött be",
      paymentNotCompletedBody: "A(z) {restaurantName} nem kapta meg ezt a rendelést, mert a fizetés nem fejeződött be. Nem terheltünk meg — a kártyán zárolt összeg automatikusan felszabadul.",
      paymentNotCompletedPaidAlready: "Már fizetett? Várjon egy pillanatot, és frissítse az oldalt — a fizetéseket automatikusan megerősítjük. Ha továbbra is ezt látja, keresse a(z) {restaurantName} éttermet, és adja meg a(z) {orderNumber} rendelésszámot.",
    },
    payment: { preparingPayment: "Biztonságos fizetés előkészítése…", couldNotStartPayment: "Nem tudtuk elindítani a fizetést ehhez a rendeléshez. Lépjen vissza, és próbálja újra.", backToRestaurant: "Vissza az étteremhez" },
  },
  cs: {
    confirmation: {
      paymentNotCompleted: "Platba nebyla dokončena",
      paymentNotCompletedBody: "{restaurantName} tuto objednávku neobdržel, protože platba nebyla dokončena. Nic vám nebylo účtováno — jakákoli částka blokovaná na kartě se automaticky uvolní.",
      paymentNotCompletedPaidAlready: "Už jste zaplatili? Chvíli počkejte a obnovte tuto stránku — platby potvrzujeme automaticky. Pokud se zpráva stále zobrazuje, kontaktujte {restaurantName} a uveďte číslo objednávky {orderNumber}.",
    },
    payment: { preparingPayment: "Připravujeme zabezpečenou platbu…", couldNotStartPayment: "Platbu pro tuto objednávku se nepodařilo zahájit. Vraťte se prosím zpět a zkuste to znovu.", backToRestaurant: "Zpět na restauraci" },
  },
  sk: {
    confirmation: {
      paymentNotCompleted: "Platba nebola dokončená",
      paymentNotCompletedBody: "{restaurantName} túto objednávku nedostal, pretože platba nebola dokončená. Nič sme vám nestrhli — akákoľvek suma blokovaná na karte sa automaticky uvoľní.",
      paymentNotCompletedPaidAlready: "Už ste zaplatili? Chvíľu počkajte a obnovte túto stránku — platby potvrdzujeme automaticky. Ak sa správa stále zobrazuje, kontaktujte {restaurantName} a uveďte číslo objednávky {orderNumber}.",
    },
    payment: { preparingPayment: "Pripravuje sa zabezpečená platba…", couldNotStartPayment: "Platbu za túto objednávku sa nepodarilo spustiť. Vráťte sa späť a skúste to znova.", backToRestaurant: "Späť na reštauráciu" },
  },
  sl: {
    confirmation: {
      paymentNotCompleted: "Plačilo ni bilo dokončano",
      paymentNotCompletedBody: "{restaurantName} tega naročila ni prejel, ker plačilo ni bilo dokončano. Nič vam ni bilo zaračunano — morebitni zadržani znesek na kartici se samodejno sprosti.",
      paymentNotCompletedPaidAlready: "Ste že plačali? Počakajte trenutek in osvežite to stran — plačila potrjujemo samodejno. Če se sporočilo še vedno prikazuje, se obrnite na {restaurantName} in navedite številko naročila {orderNumber}.",
    },
    payment: { preparingPayment: "Pripravljamo varno plačilo…", couldNotStartPayment: "Plačila za to naročilo ni bilo mogoče začeti. Vrnite se nazaj in poskusite znova.", backToRestaurant: "Nazaj na restavracijo" },
  },
  hr: {
    confirmation: {
      paymentNotCompleted: "Plaćanje nije dovršeno",
      paymentNotCompletedBody: "{restaurantName} nije primio ovu narudžbu jer plaćanje nije dovršeno. Nije vam ništa naplaćeno — svaki iznos rezerviran na kartici automatski se oslobađa.",
      paymentNotCompletedPaidAlready: "Već ste platili? Pričekajte trenutak i osvježite ovu stranicu — plaćanja potvrđujemo automatski. Ako se poruka i dalje prikazuje, obratite se restoranu {restaurantName} i navedite broj narudžbe {orderNumber}.",
    },
    payment: { preparingPayment: "Priprema sigurnog plaćanja…", couldNotStartPayment: "Nismo mogli pokrenuti plaćanje za ovu narudžbu. Vratite se i pokušajte ponovno.", backToRestaurant: "Natrag na restoran" },
  },
  sr: {
    confirmation: {
      paymentNotCompleted: "Plaćanje nije završeno",
      paymentNotCompletedBody: "{restaurantName} nije primio ovu narudžbinu jer plaćanje nije završeno. Ništa vam nije naplaćeno — svaki iznos rezervisan na kartici automatski se oslobađa.",
      paymentNotCompletedPaidAlready: "Već ste platili? Sačekajte trenutak i osvežite ovu stranicu — plaćanja potvrđujemo automatski. Ako se poruka i dalje prikazuje, kontaktirajte {restaurantName} i navedite broj narudžbine {orderNumber}.",
    },
    payment: { preparingPayment: "Priprema bezbednog plaćanja…", couldNotStartPayment: "Nismo mogli da pokrenemo plaćanje za ovu narudžbinu. Vratite se i pokušajte ponovo.", backToRestaurant: "Nazad na restoran" },
  },
  bg: {
    confirmation: {
      paymentNotCompleted: "Плащането не е завършено",
      paymentNotCompletedBody: "{restaurantName} не е получил тази поръчка, защото плащането не беше завършено. Не сте таксувани — всяка сума, блокирана по картата ви, се освобождава автоматично.",
      paymentNotCompletedPaidAlready: "Вече платихте? Изчакайте момент и опреснете тази страница — потвърждаваме плащанията автоматично. Ако съобщението остане, свържете се с {restaurantName} и посочете номер на поръчка {orderNumber}.",
    },
    payment: { preparingPayment: "Подготвяне на сигурно плащане…", couldNotStartPayment: "Не успяхме да стартираме плащането за тази поръчка. Моля, върнете се и опитайте отново.", backToRestaurant: "Обратно към ресторанта" },
  },
  el: {
    confirmation: {
      paymentNotCompleted: "Η πληρωμή δεν ολοκληρώθηκε",
      paymentNotCompletedBody: "Το {restaurantName} δεν έλαβε αυτή την παραγγελία, επειδή η πληρωμή δεν ολοκληρώθηκε. Δεν χρεωθήκατε — οποιοδήποτε ποσό δεσμεύτηκε στην κάρτα σας αποδεσμεύεται αυτόματα.",
      paymentNotCompletedPaidAlready: "Πληρώσατε ήδη; Περιμένετε λίγο και ανανεώστε αυτή τη σελίδα — επιβεβαιώνουμε τις πληρωμές αυτόματα. Αν εξακολουθεί να εμφανίζεται αυτό, επικοινωνήστε με το {restaurantName} αναφέροντας τον αριθμό παραγγελίας {orderNumber}.",
    },
    payment: { preparingPayment: "Προετοιμασία ασφαλούς πληρωμής…", couldNotStartPayment: "Δεν μπορέσαμε να ξεκινήσουμε την πληρωμή για αυτή την παραγγελία. Επιστρέψτε και δοκιμάστε ξανά.", backToRestaurant: "Επιστροφή στο εστιατόριο" },
  },
  tr: {
    confirmation: {
      paymentNotCompleted: "Ödeme tamamlanmadı",
      paymentNotCompletedBody: "Ödeme tamamlanmadığı için {restaurantName} bu siparişi almadı. Sizden ücret alınmadı — kartınızda bloke edilen tutar otomatik olarak serbest bırakılır.",
      paymentNotCompletedPaidAlready: "Zaten ödediniz mi? Biraz bekleyip bu sayfayı yenileyin — ödemeleri otomatik olarak doğruluyoruz. Bu mesaj hâlâ görünüyorsa {restaurantName} ile iletişime geçin ve {orderNumber} sipariş numarasını belirtin.",
    },
    payment: { preparingPayment: "Güvenli ödeme hazırlanıyor…", couldNotStartPayment: "Bu sipariş için ödemeyi başlatamadık. Lütfen geri dönüp tekrar deneyin.", backToRestaurant: "Restorana dön" },
  },
  uk: {
    confirmation: {
      paymentNotCompleted: "Платіж не завершено",
      paymentNotCompletedBody: "{restaurantName} не отримав це замовлення, оскільки платіж не було завершено. З вас нічого не списано — будь-яка заблокована на картці сума розблоковується автоматично.",
      paymentNotCompletedPaidAlready: "Уже оплатили? Зачекайте хвилинку й оновіть цю сторінку — ми підтверджуємо платежі автоматично. Якщо повідомлення не зникає, зверніться до {restaurantName} і назвіть номер замовлення {orderNumber}.",
    },
    payment: { preparingPayment: "Готуємо безпечну оплату…", couldNotStartPayment: "Не вдалося розпочати оплату цього замовлення. Поверніться назад і спробуйте ще раз.", backToRestaurant: "Повернутися до ресторану" },
  },
  ru: {
    confirmation: {
      paymentNotCompleted: "Платёж не завершён",
      paymentNotCompletedBody: "{restaurantName} не получил этот заказ, потому что платёж не был завершён. С вас ничего не списано — любая заблокированная на карте сумма разблокируется автоматически.",
      paymentNotCompletedPaidAlready: "Уже оплатили? Подождите немного и обновите страницу — мы подтверждаем платежи автоматически. Если сообщение остаётся, свяжитесь с {restaurantName} и назовите номер заказа {orderNumber}.",
    },
    payment: { preparingPayment: "Подготовка безопасной оплаты…", couldNotStartPayment: "Не удалось начать оплату этого заказа. Вернитесь назад и попробуйте снова.", backToRestaurant: "Вернуться в ресторан" },
  },
  da: {
    confirmation: {
      paymentNotCompleted: "Betalingen blev ikke gennemført",
      paymentNotCompletedBody: "{restaurantName} har ikke modtaget denne ordre, fordi betalingen ikke blev gennemført. Du er ikke blevet opkrævet — et eventuelt reserveret beløb på dit kort frigives automatisk.",
      paymentNotCompletedPaidAlready: "Har du allerede betalt? Vent et øjeblik, og opdater siden — vi bekræfter betalinger automatisk. Hvis beskeden stadig vises, så kontakt {restaurantName} og oplys ordrenummer {orderNumber}.",
    },
    payment: { preparingPayment: "Forbereder sikker betaling…", couldNotStartPayment: "Vi kunne ikke starte betalingen for denne ordre. Gå tilbage, og prøv igen.", backToRestaurant: "Tilbage til restauranten" },
  },
  sv: {
    confirmation: {
      paymentNotCompleted: "Betalningen slutfördes inte",
      paymentNotCompletedBody: "{restaurantName} har inte fått den här beställningen eftersom betalningen inte slutfördes. Du har inte debiterats — eventuellt reserverat belopp på ditt kort frisläpps automatiskt.",
      paymentNotCompletedPaidAlready: "Har du redan betalat? Vänta en stund och uppdatera sidan — vi bekräftar betalningar automatiskt. Om det här fortfarande visas, kontakta {restaurantName} och uppge ordernummer {orderNumber}.",
    },
    payment: { preparingPayment: "Förbereder säker betalning…", couldNotStartPayment: "Vi kunde inte starta betalningen för den här beställningen. Gå tillbaka och försök igen.", backToRestaurant: "Tillbaka till restaurangen" },
  },
  nb: {
    confirmation: {
      paymentNotCompleted: "Betalingen ble ikke fullført",
      paymentNotCompletedBody: "{restaurantName} har ikke mottatt denne bestillingen, fordi betalingen ikke ble fullført. Du er ikke belastet — et eventuelt reservert beløp på kortet frigjøres automatisk.",
      paymentNotCompletedPaidAlready: "Har du allerede betalt? Vent et øyeblikk og oppdater denne siden — vi bekrefter betalinger automatisk. Hvis dette fortsatt vises, kontakt {restaurantName} og oppgi ordrenummer {orderNumber}.",
    },
    payment: { preparingPayment: "Forbereder sikker betaling…", couldNotStartPayment: "Vi kunne ikke starte betalingen for denne bestillingen. Gå tilbake og prøv igjen.", backToRestaurant: "Tilbake til restauranten" },
  },
  fi: {
    confirmation: {
      paymentNotCompleted: "Maksua ei viimeistelty",
      paymentNotCompletedBody: "{restaurantName} ei ole saanut tätä tilausta, koska maksua ei viimeistelty. Sinulta ei ole veloitettu mitään — mahdollinen kortille varattu summa vapautuu automaattisesti.",
      paymentNotCompletedPaidAlready: "Maksoitko jo? Odota hetki ja päivitä tämä sivu — vahvistamme maksut automaattisesti. Jos tämä näkyy edelleen, ota yhteyttä ravintolaan {restaurantName} ja mainitse tilausnumero {orderNumber}.",
    },
    payment: { preparingPayment: "Valmistellaan turvallista maksua…", couldNotStartPayment: "Tämän tilauksen maksua ei voitu aloittaa. Palaa takaisin ja yritä uudelleen.", backToRestaurant: "Takaisin ravintolaan" },
  },
  et: {
    confirmation: {
      paymentNotCompleted: "Makse jäi lõpetamata",
      paymentNotCompletedBody: "{restaurantName} ei ole seda tellimust saanud, sest makse jäi lõpetamata. Sinult ei ole raha võetud — kaardil broneeritud summa vabastatakse automaatselt.",
      paymentNotCompletedPaidAlready: "Kas maksid juba? Oota hetk ja värskenda lehte — kinnitame maksed automaatselt. Kui teade püsib, võta ühendust restoraniga {restaurantName} ja nimeta tellimuse number {orderNumber}.",
    },
    payment: { preparingPayment: "Turvalise makse ettevalmistamine…", couldNotStartPayment: "Selle tellimuse makset ei õnnestunud alustada. Mine tagasi ja proovi uuesti.", backToRestaurant: "Tagasi restorani juurde" },
  },
  lv: {
    confirmation: {
      paymentNotCompleted: "Maksājums nav pabeigts",
      paymentNotCompletedBody: "{restaurantName} nav saņēmis šo pasūtījumu, jo maksājums netika pabeigts. No jums nekas nav ieturēts — jebkura kartē rezervētā summa tiek atbrīvota automātiski.",
      paymentNotCompletedPaidAlready: "Jau samaksājāt? Uzgaidiet mirkli un atsvaidziniet šo lapu — maksājumus apstiprinām automātiski. Ja šis paziņojums joprojām parādās, sazinieties ar {restaurantName} un norādiet pasūtījuma numuru {orderNumber}.",
    },
    payment: { preparingPayment: "Tiek sagatavots drošs maksājums…", couldNotStartPayment: "Neizdevās sākt šī pasūtījuma apmaksu. Lūdzu, atgriezieties un mēģiniet vēlreiz.", backToRestaurant: "Atpakaļ uz restorānu" },
  },
  lt: {
    confirmation: {
      paymentNotCompleted: "Mokėjimas nebaigtas",
      paymentNotCompletedBody: "{restaurantName} negavo šio užsakymo, nes mokėjimas nebuvo baigtas. Iš jūsų nieko nenuskaičiuota — bet kokia kortelėje rezervuota suma atlaisvinama automatiškai.",
      paymentNotCompletedPaidAlready: "Jau sumokėjote? Palaukite akimirką ir atnaujinkite šį puslapį — mokėjimus patvirtiname automatiškai. Jei pranešimas vis dar rodomas, susisiekite su {restaurantName} ir nurodykite užsakymo numerį {orderNumber}.",
    },
    payment: { preparingPayment: "Ruošiamas saugus mokėjimas…", couldNotStartPayment: "Nepavyko pradėti šio užsakymo mokėjimo. Grįžkite atgal ir bandykite dar kartą.", backToRestaurant: "Grįžti į restoraną" },
  },
  ca: {
    confirmation: {
      paymentNotCompleted: "Pagament no completat",
      paymentNotCompletedBody: "{restaurantName} no ha rebut aquesta comanda perquè el pagament no s'ha completat. No se t'ha cobrat res: qualsevol import retingut a la teva targeta s'allibera automàticament.",
      paymentNotCompletedPaidAlready: "Ja has pagat? Espera un moment i actualitza aquesta pàgina: confirmem els pagaments automàticament. Si continua apareixent això, contacta amb {restaurantName} i indica el número de comanda {orderNumber}.",
    },
    payment: { preparingPayment: "Preparant el pagament segur…", couldNotStartPayment: "No hem pogut iniciar el pagament d'aquesta comanda. Torna enrere i prova-ho de nou.", backToRestaurant: "Torna al restaurant" },
  },
  id: {
    confirmation: {
      paymentNotCompleted: "Pembayaran belum selesai",
      paymentNotCompletedBody: "{restaurantName} belum menerima pesanan ini karena pembayaran belum selesai. Anda tidak dikenai biaya — jumlah apa pun yang ditahan di kartu Anda akan dilepaskan otomatis.",
      paymentNotCompletedPaidAlready: "Sudah membayar? Tunggu sebentar lalu muat ulang halaman ini — kami mengonfirmasi pembayaran secara otomatis. Jika pesan ini masih muncul, hubungi {restaurantName} dan sebutkan nomor pesanan {orderNumber}.",
    },
    payment: { preparingPayment: "Menyiapkan pembayaran aman…", couldNotStartPayment: "Kami tidak dapat memulai pembayaran untuk pesanan ini. Silakan kembali dan coba lagi.", backToRestaurant: "Kembali ke restoran" },
  },
  vi: {
    confirmation: {
      paymentNotCompleted: "Thanh toán chưa hoàn tất",
      paymentNotCompletedBody: "{restaurantName} chưa nhận được đơn hàng này vì thanh toán chưa hoàn tất. Bạn chưa bị tính phí — mọi khoản tạm giữ trên thẻ sẽ được hoàn lại tự động.",
      paymentNotCompletedPaidAlready: "Bạn đã thanh toán rồi? Hãy đợi một lát rồi tải lại trang này — chúng tôi xác nhận thanh toán tự động. Nếu vẫn hiển thị như vậy, hãy liên hệ {restaurantName} và cung cấp mã đơn hàng {orderNumber}.",
    },
    payment: { preparingPayment: "Đang chuẩn bị thanh toán an toàn…", couldNotStartPayment: "Chúng tôi không thể bắt đầu thanh toán cho đơn hàng này. Vui lòng quay lại và thử lại.", backToRestaurant: "Quay lại nhà hàng" },
  },
  th: {
    confirmation: {
      paymentNotCompleted: "การชำระเงินยังไม่เสร็จสมบูรณ์",
      paymentNotCompletedBody: "{restaurantName} ยังไม่ได้รับคำสั่งซื้อนี้ เนื่องจากการชำระเงินยังไม่เสร็จสมบูรณ์ คุณยังไม่ถูกเรียกเก็บเงิน — ยอดเงินที่ถูกกันไว้บนบัตรของคุณจะถูกปล่อยคืนโดยอัตโนมัติ",
      paymentNotCompletedPaidAlready: "ชำระเงินแล้วใช่ไหม? รอสักครู่แล้วรีเฟรชหน้านี้ — เรายืนยันการชำระเงินโดยอัตโนมัติ หากยังแสดงข้อความนี้อยู่ กรุณาติดต่อ {restaurantName} พร้อมแจ้งหมายเลขคำสั่งซื้อ {orderNumber}",
    },
    payment: { preparingPayment: "กำลังเตรียมการชำระเงินที่ปลอดภัย…", couldNotStartPayment: "เราไม่สามารถเริ่มการชำระเงินสำหรับคำสั่งซื้อนี้ได้ กรุณากลับไปแล้วลองใหม่อีกครั้ง", backToRestaurant: "กลับไปที่ร้านอาหาร" },
  },
  zh: {
    confirmation: {
      paymentNotCompleted: "支付未完成",
      paymentNotCompletedBody: "由于支付未完成，{restaurantName} 尚未收到此订单。我们没有向您收费——您卡上冻结的任何金额都会自动释放。",
      paymentNotCompletedPaidAlready: "已经付款了？请稍候片刻并刷新本页——我们会自动确认付款。如果仍显示此提示，请联系 {restaurantName} 并提供订单号 {orderNumber}。",
    },
    payment: { preparingPayment: "正在准备安全支付…", couldNotStartPayment: "无法为此订单启动支付。请返回后重试。", backToRestaurant: "返回餐厅" },
  },
  ja: {
    confirmation: {
      paymentNotCompleted: "お支払いが完了していません",
      paymentNotCompletedBody: "お支払いが完了しなかったため、{restaurantName}にこのご注文は届いていません。請求は発生していません。カードで確保された金額は自動的に解除されます。",
      paymentNotCompletedPaidAlready: "すでにお支払い済みですか？少し待ってからこのページを再読み込みしてください。お支払いは自動で確認されます。それでもこの表示が続く場合は、注文番号 {orderNumber} をお伝えのうえ{restaurantName}までご連絡ください。",
    },
    payment: { preparingPayment: "安全なお支払いを準備しています…", couldNotStartPayment: "このご注文のお支払いを開始できませんでした。前の画面に戻ってもう一度お試しください。", backToRestaurant: "レストランに戻る" },
  },
  ko: {
    confirmation: {
      paymentNotCompleted: "결제가 완료되지 않았습니다",
      paymentNotCompletedBody: "결제가 완료되지 않아 {restaurantName}에 이 주문이 전달되지 않았습니다. 요금은 청구되지 않았으며, 카드에 승인된 금액은 자동으로 취소됩니다.",
      paymentNotCompletedPaidAlready: "이미 결제하셨나요? 잠시 기다린 후 이 페이지를 새로고침해 주세요. 결제는 자동으로 확인됩니다. 계속 이 화면이 표시되면 주문번호 {orderNumber}와 함께 {restaurantName}에 문의해 주세요.",
    },
    payment: { preparingPayment: "안전한 결제를 준비하고 있습니다…", couldNotStartPayment: "이 주문의 결제를 시작할 수 없습니다. 이전 화면으로 돌아가 다시 시도해 주세요.", backToRestaurant: "레스토랑으로 돌아가기" },
  },
  ar: {
    confirmation: {
      paymentNotCompleted: "لم تكتمل عملية الدفع",
      paymentNotCompletedBody: "لم يستلم {restaurantName} هذا الطلب لأن عملية الدفع لم تكتمل. لم يتم خصم أي مبلغ منك — وأي مبلغ محجوز على بطاقتك سيُفرج عنه تلقائيًا.",
      paymentNotCompletedPaidAlready: "هل دفعت بالفعل؟ انتظر لحظة وأعد تحميل هذه الصفحة — نحن نؤكد المدفوعات تلقائيًا. إذا استمر ظهور هذه الرسالة، تواصل مع {restaurantName} واذكر رقم الطلب {orderNumber}.",
    },
    payment: { preparingPayment: "جارٍ تجهيز دفع آمن…", couldNotStartPayment: "تعذّر بدء عملية الدفع لهذا الطلب. يرجى العودة والمحاولة مرة أخرى.", backToRestaurant: "العودة إلى المطعم" },
  },
  he: {
    confirmation: {
      paymentNotCompleted: "התשלום לא הושלם",
      paymentNotCompletedBody: "{restaurantName} לא קיבל את ההזמנה הזו מכיוון שהתשלום לא הושלם. לא חויבת — כל סכום שנתפס בכרטיס שלך משוחרר אוטומטית.",
      paymentNotCompletedPaidAlready: "כבר שילמת? המתן רגע ורענן את הדף — אנחנו מאשרים תשלומים אוטומטית. אם ההודעה עדיין מופיעה, פנה אל {restaurantName} וציין את מספר ההזמנה {orderNumber}.",
    },
    payment: { preparingPayment: "מכינים תשלום מאובטח…", couldNotStartPayment: "לא הצלחנו להתחיל את התשלום עבור ההזמנה הזו. חזור אחורה ונסה שוב.", backToRestaurant: "חזרה למסעדה" },
  },
  hi: {
    confirmation: {
      paymentNotCompleted: "भुगतान पूरा नहीं हुआ",
      paymentNotCompletedBody: "{restaurantName} को यह ऑर्डर नहीं मिला, क्योंकि भुगतान पूरा नहीं हुआ। आपसे कोई शुल्क नहीं लिया गया है — आपके कार्ड पर रोकी गई कोई भी राशि अपने आप जारी हो जाएगी।",
      paymentNotCompletedPaidAlready: "पहले ही भुगतान कर दिया? थोड़ा इंतज़ार करें और यह पेज रिफ़्रेश करें — हम भुगतान अपने आप सत्यापित करते हैं। अगर फिर भी यही दिखे, तो {restaurantName} से संपर्क करें और ऑर्डर नंबर {orderNumber} बताएं।",
    },
    payment: { preparingPayment: "सुरक्षित भुगतान तैयार किया जा रहा है…", couldNotStartPayment: "हम इस ऑर्डर के लिए भुगतान शुरू नहीं कर सके। कृपया वापस जाएँ और दोबारा कोशिश करें।", backToRestaurant: "रेस्तरां पर वापस जाएँ" },
  },
};

const DIR = path.join(process.cwd(), "src", "messages");
let touched = 0;
const gaps: string[] = [];

for (const locale of SUPPORTED_LOCALES) {
  const file = path.join(DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, any>;
  const b = T[locale];
  if (!b) { gaps.push(locale); continue; }
  json.customer = json.customer ?? {};
  json.customer.confirmation = json.customer.confirmation ?? {};
  json.customer.payment = json.customer.payment ?? {};
  let n = 0;
  for (const [k, v] of Object.entries(b.confirmation)) {
    if (typeof json.customer.confirmation[k] !== "string") { json.customer.confirmation[k] = v; n++; }
  }
  for (const [k, v] of Object.entries(b.payment)) {
    if (typeof json.customer.payment[k] !== "string") { json.customer.payment[k] = v; n++; }
  }
  if (n > 0) { fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8"); touched++; }
  console.log(`  ${locale.padEnd(6)} +${n}`);
}

if (gaps.length) console.error(`\n⚠️  missing bundle for: ${gaps.join(", ")}`);
console.log(`\n✅ ${touched}/${SUPPORTED_LOCALES.length} locale files updated.`);
