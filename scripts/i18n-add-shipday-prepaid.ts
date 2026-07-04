/**
 * ShipDay prepaid-delivery enforcement strings (Luigi 2026-07-04) ×38:
 *   checkout.prepaidDeliveryNote          — note under the payment picker
 *   checkout.prepaidDeliveryUnavailable   — no online method usable (edge)
 *   ordering.toasts.deliveryPrepaidRequired — server 400 toast
 *   admin.driverPool.toastOnlinePaymentRequired — admin gate toast
 *   npx tsx scripts/i18n-add-shipday-prepaid.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Pack = { note: string; unavailable: string; toast: string; admin: string };

const T: Record<string, Pack> = {
  en: {
    note: "Delivery is paid online — the delivery driver can't take payment at the door.",
    unavailable: "Online payment isn't available right now, so delivery orders can't be placed. Please choose pickup instead.",
    toast: "Delivery orders must be paid online at this restaurant — please choose an online payment method.",
    admin: "Add an online payment method first — ShipDay drivers only pick up and drop off, they can't collect payment at the door. Enable card payments or connect PayPal, then turn ShipDay on.",
  },
  fr: {
    note: "La livraison se paie en ligne — le livreur ne peut pas encaisser à la porte.",
    unavailable: "Le paiement en ligne n'est pas disponible pour le moment, la commande en livraison est donc impossible. Veuillez choisir le retrait.",
    toast: "Les commandes en livraison de ce restaurant doivent être payées en ligne — choisissez un mode de paiement en ligne.",
    admin: "Ajoutez d'abord un moyen de paiement en ligne — les livreurs ShipDay ne font que récupérer et livrer, ils ne peuvent pas encaisser à la porte. Activez le paiement par carte ou connectez PayPal, puis activez ShipDay.",
  },
  es: {
    note: "El envío se paga en línea — el repartidor no puede cobrar en la puerta.",
    unavailable: "El pago en línea no está disponible ahora mismo, así que no se pueden hacer pedidos a domicilio. Elige recogida.",
    toast: "Los pedidos a domicilio de este restaurante deben pagarse en línea — elige un método de pago en línea.",
    admin: "Añade primero un método de pago en línea — los repartidores de ShipDay solo recogen y entregan, no pueden cobrar en la puerta. Activa el pago con tarjeta o conecta PayPal y luego activa ShipDay.",
  },
  it: {
    note: "La consegna si paga online — il fattorino non può incassare alla porta.",
    unavailable: "Il pagamento online non è disponibile al momento, quindi non è possibile ordinare con consegna. Scegli il ritiro.",
    toast: "Gli ordini con consegna di questo ristorante vanno pagati online — scegli un metodo di pagamento online.",
    admin: "Aggiungi prima un metodo di pagamento online — i driver ShipDay ritirano e consegnano soltanto, non possono incassare alla porta. Attiva i pagamenti con carta o collega PayPal, poi attiva ShipDay.",
  },
  pt: {
    note: "A entrega é paga online — o estafeta não pode receber pagamento à porta.",
    unavailable: "O pagamento online não está disponível neste momento, pelo que não é possível encomendar com entrega. Escolha levantamento.",
    toast: "As encomendas com entrega deste restaurante devem ser pagas online — escolha um método de pagamento online.",
    admin: "Adicione primeiro um método de pagamento online — os estafetas ShipDay apenas recolhem e entregam, não podem cobrar à porta. Ative pagamentos com cartão ou ligue o PayPal e depois ative o ShipDay.",
  },
  "pt-BR": {
    note: "A entrega é paga online — o entregador não pode receber pagamento na porta.",
    unavailable: "O pagamento online não está disponível no momento, então pedidos com entrega não podem ser feitos. Escolha retirada.",
    toast: "Pedidos com entrega deste restaurante devem ser pagos online — escolha um método de pagamento online.",
    admin: "Adicione primeiro um método de pagamento online — os entregadores ShipDay apenas coletam e entregam, não podem cobrar na porta. Ative pagamentos com cartão ou conecte o PayPal e depois ative o ShipDay.",
  },
  de: {
    note: "Lieferungen werden online bezahlt — der Fahrer kann an der Tür kein Geld annehmen.",
    unavailable: "Online-Zahlung ist derzeit nicht verfügbar, daher sind Lieferbestellungen nicht möglich. Bitte Abholung wählen.",
    toast: "Lieferbestellungen bei diesem Restaurant müssen online bezahlt werden — bitte eine Online-Zahlungsart wählen.",
    admin: "Fügen Sie zuerst eine Online-Zahlungsart hinzu — ShipDay-Fahrer holen nur ab und liefern aus, sie können an der Tür kein Geld kassieren. Aktivieren Sie Kartenzahlungen oder verbinden Sie PayPal, dann ShipDay einschalten.",
  },
  nl: {
    note: "Bezorging wordt online betaald — de bezorger kan aan de deur geen betaling aannemen.",
    unavailable: "Online betalen is momenteel niet beschikbaar, dus bezorgbestellingen zijn niet mogelijk. Kies afhalen.",
    toast: "Bezorgbestellingen bij dit restaurant moeten online worden betaald — kies een online betaalmethode.",
    admin: "Voeg eerst een online betaalmethode toe — ShipDay-bezorgers halen alleen op en bezorgen, ze kunnen aan de deur niet incasseren. Schakel kaartbetalingen in of koppel PayPal en zet dan ShipDay aan.",
  },
  ro: {
    note: "Livrarea se plătește online — curierul nu poate încasa la ușă.",
    unavailable: "Plata online nu este disponibilă momentan, deci comenzile cu livrare nu pot fi plasate. Alegeți ridicarea.",
    toast: "Comenzile cu livrare la acest restaurant trebuie plătite online — alegeți o metodă de plată online.",
    admin: "Adăugați mai întâi o metodă de plată online — curierii ShipDay doar preiau și livrează, nu pot încasa la ușă. Activați plățile cu cardul sau conectați PayPal, apoi porniți ShipDay.",
  },
  sv: {
    note: "Leverans betalas online — budet kan inte ta betalt vid dörren.",
    unavailable: "Onlinebetalning är inte tillgänglig just nu, så leveransbeställningar kan inte läggas. Välj avhämtning.",
    toast: "Leveransbeställningar hos den här restaurangen måste betalas online — välj en onlinebetalningsmetod.",
    admin: "Lägg först till en onlinebetalningsmetod — ShipDay-buden hämtar bara upp och lämnar av, de kan inte ta betalt vid dörren. Aktivera kortbetalningar eller anslut PayPal och slå sedan på ShipDay.",
  },
  da: {
    note: "Levering betales online — buddet kan ikke modtage betaling ved døren.",
    unavailable: "Onlinebetaling er ikke tilgængelig lige nu, så leveringsordrer kan ikke afgives. Vælg afhentning.",
    toast: "Leveringsordrer hos denne restaurant skal betales online — vælg en onlinebetalingsmetode.",
    admin: "Tilføj først en onlinebetalingsmetode — ShipDay-buddene henter kun og afleverer, de kan ikke opkræve betaling ved døren. Aktivér kortbetaling eller forbind PayPal, og slå derefter ShipDay til.",
  },
  nb: {
    note: "Levering betales på nett — budet kan ikke ta betalt på døren.",
    unavailable: "Nettbetaling er ikke tilgjengelig akkurat nå, så leveringsbestillinger kan ikke legges inn. Velg henting.",
    toast: "Leveringsbestillinger hos denne restauranten må betales på nett — velg en nettbetalingsmetode.",
    admin: "Legg først til en nettbetalingsmetode — ShipDay-budene henter bare og leverer, de kan ikke ta betalt på døren. Aktiver kortbetaling eller koble til PayPal, og slå deretter på ShipDay.",
  },
  fi: {
    note: "Toimitus maksetaan verkossa — kuljettaja ei voi ottaa maksua ovella.",
    unavailable: "Verkkomaksu ei ole juuri nyt käytettävissä, joten toimitustilauksia ei voi tehdä. Valitse nouto.",
    toast: "Tämän ravintolan toimitustilaukset on maksettava verkossa — valitse verkkomaksutapa.",
    admin: "Lisää ensin verkkomaksutapa — ShipDay-kuljettajat vain noutavat ja toimittavat, he eivät voi periä maksua ovella. Ota korttimaksut käyttöön tai yhdistä PayPal ja kytke sitten ShipDay päälle.",
  },
  pl: {
    note: "Dostawa jest opłacana online — kurier nie może przyjąć płatności pod drzwiami.",
    unavailable: "Płatność online jest obecnie niedostępna, więc nie można złożyć zamówienia z dostawą. Wybierz odbiór.",
    toast: "Zamówienia z dostawą w tej restauracji muszą być opłacone online — wybierz metodę płatności online.",
    admin: "Najpierw dodaj metodę płatności online — kurierzy ShipDay tylko odbierają i dostarczają, nie mogą pobierać płatności pod drzwiami. Włącz płatności kartą lub podłącz PayPal, a następnie włącz ShipDay.",
  },
  cs: {
    note: "Rozvoz se platí online — kurýr nemůže přijmout platbu u dveří.",
    unavailable: "Online platba není momentálně dostupná, objednávky s rozvozem proto nelze zadat. Zvolte vyzvednutí.",
    toast: "Objednávky s rozvozem v této restauraci musí být zaplaceny online — zvolte online platební metodu.",
    admin: "Nejprve přidejte online platební metodu — kurýři ShipDay pouze vyzvedávají a doručují, nemohou vybírat platbu u dveří. Zapněte platby kartou nebo připojte PayPal a poté zapněte ShipDay.",
  },
  sk: {
    note: "Rozvoz sa platí online — kuriér nemôže prijať platbu pri dverách.",
    unavailable: "Online platba momentálne nie je dostupná, objednávky s rozvozom preto nie je možné zadať. Zvoľte vyzdvihnutie.",
    toast: "Objednávky s rozvozom v tejto reštaurácii musia byť zaplatené online — zvoľte online platobnú metódu.",
    admin: "Najprv pridajte online platobnú metódu — kuriéri ShipDay iba vyzdvihujú a doručujú, nemôžu vyberať platbu pri dverách. Zapnite platby kartou alebo pripojte PayPal a potom zapnite ShipDay.",
  },
  hu: {
    note: "A kiszállítást online kell fizetni — a futár nem tud fizetést átvenni az ajtóban.",
    unavailable: "Az online fizetés jelenleg nem érhető el, így kiszállításos rendelés nem adható le. Válassza az átvételt.",
    toast: "Ennél az étteremnél a kiszállításos rendeléseket online kell fizetni — válasszon online fizetési módot.",
    admin: "Először adjon hozzá online fizetési módot — a ShipDay futárok csak átveszik és kiszállítják a rendelést, az ajtóban nem tudnak fizetést beszedni. Kapcsolja be a kártyás fizetést vagy kösse össze a PayPalt, majd kapcsolja be a ShipDay-t.",
  },
  el: {
    note: "Η παράδοση πληρώνεται online — ο διανομέας δεν μπορεί να εισπράξει στην πόρτα.",
    unavailable: "Η online πληρωμή δεν είναι διαθέσιμη αυτή τη στιγμή, οπότε δεν γίνονται παραγγελίες με παράδοση. Επιλέξτε παραλαβή.",
    toast: "Οι παραγγελίες με παράδοση σε αυτό το εστιατόριο πληρώνονται online — επιλέξτε online τρόπο πληρωμής.",
    admin: "Προσθέστε πρώτα έναν online τρόπο πληρωμής — οι διανομείς ShipDay μόνο παραλαμβάνουν και παραδίδουν, δεν εισπράττουν στην πόρτα. Ενεργοποιήστε πληρωμές με κάρτα ή συνδέστε το PayPal και μετά ενεργοποιήστε το ShipDay.",
  },
  bg: {
    note: "Доставката се плаща онлайн — куриерът не може да приема плащане на вратата.",
    unavailable: "Онлайн плащането в момента не е налично, затова поръчки с доставка не могат да се правят. Изберете вземане на място.",
    toast: "Поръчките с доставка в този ресторант трябва да се плащат онлайн — изберете онлайн метод на плащане.",
    admin: "Първо добавете онлайн метод на плащане — куриерите на ShipDay само вземат и доставят, не могат да събират плащане на вратата. Активирайте картови плащания или свържете PayPal, след което включете ShipDay.",
  },
  hr: {
    note: "Dostava se plaća online — dostavljač ne može naplatiti na vratima.",
    unavailable: "Online plaćanje trenutno nije dostupno pa narudžbe s dostavom nisu moguće. Odaberite preuzimanje.",
    toast: "Narudžbe s dostavom u ovom restoranu moraju se platiti online — odaberite online način plaćanja.",
    admin: "Najprije dodajte online način plaćanja — ShipDay dostavljači samo preuzimaju i dostavljaju, ne mogu naplatiti na vratima. Uključite kartično plaćanje ili povežite PayPal, zatim uključite ShipDay.",
  },
  sr: {
    note: "Dostava se plaća onlajn — dostavljač ne može da naplati na vratima.",
    unavailable: "Onlajn plaćanje trenutno nije dostupno pa porudžbine sa dostavom nisu moguće. Izaberite preuzimanje.",
    toast: "Porudžbine sa dostavom u ovom restoranu moraju se platiti onlajn — izaberite onlajn način plaćanja.",
    admin: "Prvo dodajte onlajn način plaćanja — ShipDay dostavljači samo preuzimaju i dostavljaju, ne mogu da naplate na vratima. Uključite plaćanje karticom ili povežite PayPal, a zatim uključite ShipDay.",
  },
  sl: {
    note: "Dostava se plača prek spleta — dostavljavec ne more sprejeti plačila na vratih.",
    unavailable: "Spletno plačilo trenutno ni na voljo, zato naročil z dostavo ni mogoče oddati. Izberite prevzem.",
    toast: "Naročila z dostavo v tej restavraciji je treba plačati prek spleta — izberite spletni način plačila.",
    admin: "Najprej dodajte spletni način plačila — dostavljavci ShipDay samo prevzamejo in dostavijo, plačila na vratih ne morejo sprejeti. Vklopite kartična plačila ali povežite PayPal, nato vklopite ShipDay.",
  },
  et: {
    note: "Kohaletoimetamine makstakse veebis — kuller ei saa ukse peal makset vastu võtta.",
    unavailable: "Veebimakse pole praegu saadaval, seega kohaletoimetamisega tellimusi esitada ei saa. Valige järeletulemine.",
    toast: "Selle restorani kohaletoimetamisega tellimused tuleb maksta veebis — valige veebimakseviis.",
    admin: "Lisage esmalt veebimakseviis — ShipDay kullerid ainult võtavad peale ja toovad kohale, ukse peal nad makset vastu võtta ei saa. Lubage kaardimaksed või ühendage PayPal, seejärel lülitage ShipDay sisse.",
  },
  lv: {
    note: "Piegāde tiek apmaksāta tiešsaistē — kurjers nevar pieņemt maksājumu pie durvīm.",
    unavailable: "Tiešsaistes maksājums šobrīd nav pieejams, tāpēc piegādes pasūtījumus nevar veikt. Izvēlieties saņemšanu uz vietas.",
    toast: "Šī restorāna piegādes pasūtījumi jāapmaksā tiešsaistē — izvēlieties tiešsaistes maksājuma veidu.",
    admin: "Vispirms pievienojiet tiešsaistes maksājuma veidu — ShipDay kurjeri tikai paņem un piegādā, viņi nevar iekasēt maksājumu pie durvīm. Ieslēdziet karšu maksājumus vai pievienojiet PayPal, pēc tam ieslēdziet ShipDay.",
  },
  lt: {
    note: "Pristatymas apmokamas internetu — kurjeris negali priimti mokėjimo prie durų.",
    unavailable: "Mokėjimas internetu šiuo metu negalimas, todėl užsakymų su pristatymu pateikti negalima. Pasirinkite atsiėmimą.",
    toast: "Šio restorano užsakymai su pristatymu turi būti apmokėti internetu — pasirinkite mokėjimo internetu būdą.",
    admin: "Pirmiausia pridėkite mokėjimo internetu būdą — ShipDay kurjeriai tik paima ir pristato, jie negali priimti mokėjimo prie durų. Įjunkite mokėjimus kortele arba prijunkite PayPal, tada įjunkite ShipDay.",
  },
  tr: {
    note: "Teslimat online ödenir — kurye kapıda ödeme alamaz.",
    unavailable: "Online ödeme şu anda kullanılamıyor, bu yüzden teslimatlı sipariş verilemiyor. Lütfen gel-al'ı seçin.",
    toast: "Bu restoranda teslimatlı siparişler online ödenmelidir — lütfen bir online ödeme yöntemi seçin.",
    admin: "Önce bir online ödeme yöntemi ekleyin — ShipDay kuryeleri yalnızca alır ve teslim eder, kapıda ödeme tahsil edemezler. Kartla ödemeyi etkinleştirin veya PayPal'ı bağlayın, sonra ShipDay'i açın.",
  },
  ru: {
    note: "Доставка оплачивается онлайн — курьер не может принять оплату у двери.",
    unavailable: "Онлайн-оплата сейчас недоступна, поэтому заказы с доставкой оформить нельзя. Выберите самовывоз.",
    toast: "Заказы с доставкой в этом ресторане оплачиваются онлайн — выберите онлайн-способ оплаты.",
    admin: "Сначала добавьте онлайн-способ оплаты — курьеры ShipDay только забирают и доставляют, они не могут принимать оплату у двери. Включите оплату картой или подключите PayPal, затем включите ShipDay.",
  },
  uk: {
    note: "Доставка оплачується онлайн — кур'єр не може прийняти оплату біля дверей.",
    unavailable: "Онлайн-оплата зараз недоступна, тому замовлення з доставкою неможливі. Оберіть самовивіз.",
    toast: "Замовлення з доставкою в цьому ресторані оплачуються онлайн — оберіть онлайн-спосіб оплати.",
    admin: "Спочатку додайте онлайн-спосіб оплати — кур'єри ShipDay лише забирають і доставляють, вони не можуть приймати оплату біля дверей. Увімкніть оплату карткою або підключіть PayPal, потім увімкніть ShipDay.",
  },
  ca: {
    note: "El lliurament es paga en línia — el repartidor no pot cobrar a la porta.",
    unavailable: "El pagament en línia no està disponible ara mateix, així que no es poden fer comandes a domicili. Trieu la recollida.",
    toast: "Les comandes a domicili d'aquest restaurant s'han de pagar en línia — trieu un mètode de pagament en línia.",
    admin: "Afegiu primer un mètode de pagament en línia — els repartidors de ShipDay només recullen i lliuren, no poden cobrar a la porta. Activeu els pagaments amb targeta o connecteu PayPal i després activeu ShipDay.",
  },
  id: {
    note: "Pengantaran dibayar online — kurir tidak bisa menerima pembayaran di pintu.",
    unavailable: "Pembayaran online sedang tidak tersedia, jadi pesanan antar tidak bisa dibuat. Silakan pilih ambil sendiri.",
    toast: "Pesanan antar di restoran ini harus dibayar online — pilih metode pembayaran online.",
    admin: "Tambahkan metode pembayaran online terlebih dahulu — kurir ShipDay hanya mengambil dan mengantar, mereka tidak bisa menagih pembayaran di pintu. Aktifkan pembayaran kartu atau hubungkan PayPal, lalu nyalakan ShipDay.",
  },
  vi: {
    note: "Đơn giao hàng được thanh toán trực tuyến — tài xế không thể thu tiền tại cửa.",
    unavailable: "Thanh toán trực tuyến hiện không khả dụng nên không thể đặt đơn giao hàng. Vui lòng chọn tự đến lấy.",
    toast: "Đơn giao hàng của nhà hàng này phải được thanh toán trực tuyến — vui lòng chọn phương thức thanh toán trực tuyến.",
    admin: "Hãy thêm phương thức thanh toán trực tuyến trước — tài xế ShipDay chỉ nhận và giao hàng, họ không thể thu tiền tại cửa. Bật thanh toán thẻ hoặc kết nối PayPal, sau đó bật ShipDay.",
  },
  th: {
    note: "การจัดส่งชำระเงินออนไลน์ — คนขับไม่สามารถรับชำระเงินที่หน้าประตูได้",
    unavailable: "ขณะนี้การชำระเงินออนไลน์ใช้งานไม่ได้ จึงสั่งแบบจัดส่งไม่ได้ กรุณาเลือกมารับเอง",
    toast: "ออเดอร์จัดส่งของร้านนี้ต้องชำระเงินออนไลน์ — กรุณาเลือกวิธีชำระเงินออนไลน์",
    admin: "โปรดเพิ่มวิธีชำระเงินออนไลน์ก่อน — คนขับ ShipDay ทำหน้าที่รับและส่งเท่านั้น ไม่สามารถเก็บเงินที่หน้าประตูได้ เปิดใช้การชำระด้วยบัตรหรือเชื่อมต่อ PayPal แล้วจึงเปิด ShipDay",
  },
  zh: {
    note: "外送订单需在线支付——配送员无法在门口收款。",
    unavailable: "在线支付目前不可用，因此无法下外送订单。请选择自取。",
    toast: "本餐厅的外送订单必须在线支付——请选择在线支付方式。",
    admin: "请先添加在线支付方式——ShipDay 配送员只负责取餐和送达，无法在门口收款。启用银行卡支付或连接 PayPal，然后再开启 ShipDay。",
  },
  ja: {
    note: "デリバリーはオンライン決済です — ドライバーは玄関先で支払いを受け取れません。",
    unavailable: "現在オンライン決済がご利用いただけないため、デリバリー注文はできません。テイクアウトをお選びください。",
    toast: "このレストランのデリバリー注文はオンライン決済が必要です — オンライン決済方法を選んでください。",
    admin: "先にオンライン決済方法を追加してください — ShipDayのドライバーは受け取りと配達のみで、玄関先での集金はできません。カード決済を有効にするかPayPalを接続してから、ShipDayをオンにしてください。",
  },
  ko: {
    note: "배달 주문은 온라인으로 결제합니다 — 배달원은 문 앞에서 결제를 받을 수 없습니다.",
    unavailable: "현재 온라인 결제를 사용할 수 없어 배달 주문이 불가능합니다. 픽업을 선택해 주세요.",
    toast: "이 레스토랑의 배달 주문은 온라인으로 결제해야 합니다 — 온라인 결제 수단을 선택해 주세요.",
    admin: "먼저 온라인 결제 수단을 추가하세요 — ShipDay 배달원은 픽업과 배달만 하며 문 앞에서 결제를 받을 수 없습니다. 카드 결제를 활성화하거나 PayPal을 연결한 뒤 ShipDay를 켜세요.",
  },
  ar: {
    note: "يُدفع التوصيل عبر الإنترنت — لا يمكن للسائق تحصيل الدفع عند الباب.",
    unavailable: "الدفع عبر الإنترنت غير متاح حاليًا، لذا لا يمكن تقديم طلبات التوصيل. يرجى اختيار الاستلام.",
    toast: "طلبات التوصيل في هذا المطعم يجب دفعها عبر الإنترنت — يرجى اختيار طريقة دفع عبر الإنترنت.",
    admin: "أضف طريقة دفع عبر الإنترنت أولًا — سائقو ShipDay يستلمون ويوصلون فقط ولا يمكنهم تحصيل الدفع عند الباب. فعّل الدفع بالبطاقة أو اربط PayPal ثم فعّل ShipDay.",
  },
  he: {
    note: "המשלוח משולם אונליין — השליח אינו יכול לגבות תשלום בדלת.",
    unavailable: "תשלום אונליין אינו זמין כרגע, ולכן לא ניתן לבצע הזמנות משלוח. בחרו איסוף עצמי.",
    toast: "הזמנות משלוח במסעדה זו יש לשלם אונליין — בחרו אמצעי תשלום אונליין.",
    admin: "הוסיפו קודם אמצעי תשלום אונליין — שליחי ShipDay רק אוספים ומוסרים, הם אינם יכולים לגבות תשלום בדלת. הפעילו תשלומי כרטיס או חברו PayPal, ואז הפעילו את ShipDay.",
  },
  hi: {
    note: "डिलीवरी का भुगतान ऑनलाइन होता है — डिलीवरी ड्राइवर दरवाज़े पर भुगतान नहीं ले सकता।",
    unavailable: "ऑनलाइन भुगतान अभी उपलब्ध नहीं है, इसलिए डिलीवरी ऑर्डर नहीं दिए जा सकते। कृपया पिकअप चुनें।",
    toast: "इस रेस्टोरेंट के डिलीवरी ऑर्डर का भुगतान ऑनलाइन करना होगा — कृपया कोई ऑनलाइन भुगतान तरीका चुनें।",
    admin: "पहले एक ऑनलाइन भुगतान तरीका जोड़ें — ShipDay ड्राइवर केवल ऑर्डर उठाते और पहुँचाते हैं, वे दरवाज़े पर भुगतान नहीं ले सकते। कार्ड भुगतान चालू करें या PayPal जोड़ें, फिर ShipDay चालू करें।",
  },
};

const setDeep = (obj: any, pathParts: string[], value: string) => {
  let o = obj;
  for (const p of pathParts.slice(0, -1)) o = o[p] ??= {};
  o[pathParts[pathParts.length - 1]] = value;
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = T[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  setDeep(json, ["checkout", "prepaidDeliveryNote"], pack.note);
  setDeep(json, ["checkout", "prepaidDeliveryUnavailable"], pack.unavailable);
  setDeep(json, ["ordering", "toasts", "deliveryPrepaidRequired"], pack.toast);
  setDeep(json, ["admin", "driverPool", "toastOnlinePaymentRequired"], pack.admin);
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ 4 keys added in ${changed} locale file(s)`);
