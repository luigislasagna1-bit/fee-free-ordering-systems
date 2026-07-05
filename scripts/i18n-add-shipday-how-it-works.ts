/**
 * Driver Pool "How ShipDay dispatch works" explainer (Luigi 2026-07-04) ×38.
 * ADDS admin.driverPool.howItWorksTitle/On/NoSwitch/Off and CORRECTS the two
 * source-tile descriptions (the old "Both" text claimed a per-ORDER picker —
 * it's a kitchen-wide ON/OFF switch; "ShipDay only" now states the prepaid
 * consequence).
 *   npx tsx scripts/i18n-add-shipday-how-it-works.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Pack = { title: string; on: string; noSwitch: string; off: string; shipdayTile: string; bothTile: string };

const T: Record<string, Pack> = {
  en: {
    title: "How ShipDay dispatch works",
    on: "ShipDay ON: every new delivery order is automatically sent to a ShipDay driver the moment you accept it — and because ShipDay drivers only pick up and drop off, delivery orders must be paid online (cash and card-at-the-door are not offered at checkout).",
    noSwitch: "Once an order is accepted, it cannot be switched between ShipDay and your own drivers.",
    off: "ShipDay OFF: nothing is sent automatically. You can still send any order to ShipDay manually from the ShipDay app.",
    shipdayTile: "Every new delivery order auto-sends to a ShipDay driver when you accept it. Delivery must be paid online.",
    bothTile: "Your kitchen gets a ShipDay ON/OFF switch: ON auto-sends new deliveries to the pool, OFF leaves them to your own drivers.",
  },
  fr: {
    title: "Fonctionnement de l'envoi ShipDay",
    on: "ShipDay ACTIVÉ : chaque nouvelle commande en livraison est envoyée automatiquement à un livreur ShipDay dès que vous l'acceptez — et comme les livreurs ShipDay ne font que récupérer et livrer, les commandes en livraison doivent être payées en ligne (espèces et carte à la porte ne sont pas proposées au paiement).",
    noSwitch: "Une fois la commande acceptée, elle ne peut plus passer de ShipDay à vos propres livreurs, ni l'inverse.",
    off: "ShipDay DÉSACTIVÉ : rien n'est envoyé automatiquement. Vous pouvez toujours envoyer une commande à ShipDay manuellement depuis l'application ShipDay.",
    shipdayTile: "Chaque nouvelle commande en livraison est envoyée automatiquement à un livreur ShipDay dès son acceptation. La livraison doit être payée en ligne.",
    bothTile: "Votre cuisine dispose d'un interrupteur ShipDay ON/OFF : ON envoie automatiquement les nouvelles livraisons au pool, OFF les laisse à vos propres livreurs.",
  },
  es: {
    title: "Cómo funciona el envío con ShipDay",
    on: "ShipDay ACTIVADO: cada nuevo pedido a domicilio se envía automáticamente a un repartidor de ShipDay en cuanto lo aceptas — y como los repartidores de ShipDay solo recogen y entregan, los pedidos a domicilio deben pagarse en línea (efectivo y tarjeta en la puerta no se ofrecen al pagar).",
    noSwitch: "Una vez aceptado un pedido, no se puede cambiar entre ShipDay y tus propios repartidores.",
    off: "ShipDay DESACTIVADO: no se envía nada automáticamente. Aún puedes enviar cualquier pedido a ShipDay manualmente desde la app de ShipDay.",
    shipdayTile: "Cada nuevo pedido a domicilio se envía automáticamente a un repartidor de ShipDay al aceptarlo. La entrega debe pagarse en línea.",
    bothTile: "Tu cocina tiene un interruptor ShipDay ON/OFF: con ON los nuevos pedidos van automáticamente al pool, con OFF los llevan tus propios repartidores.",
  },
  it: {
    title: "Come funziona l'invio con ShipDay",
    on: "ShipDay ATTIVO: ogni nuovo ordine con consegna viene inviato automaticamente a un driver ShipDay appena lo accetti — e poiché i driver ShipDay ritirano e consegnano soltanto, gli ordini con consegna vanno pagati online (contanti e carta alla porta non sono offerti al checkout).",
    noSwitch: "Una volta accettato, un ordine non può più passare da ShipDay ai tuoi driver o viceversa.",
    off: "ShipDay DISATTIVATO: nulla viene inviato automaticamente. Puoi comunque inviare qualsiasi ordine a ShipDay manualmente dall'app ShipDay.",
    shipdayTile: "Ogni nuovo ordine con consegna viene inviato automaticamente a un driver ShipDay quando lo accetti. La consegna va pagata online.",
    bothTile: "La tua cucina ha un interruttore ShipDay ON/OFF: con ON le nuove consegne vanno automaticamente al pool, con OFF restano ai tuoi driver.",
  },
  pt: {
    title: "Como funciona o envio ShipDay",
    on: "ShipDay LIGADO: cada nova encomenda com entrega é enviada automaticamente a um estafeta ShipDay assim que a aceita — e como os estafetas ShipDay apenas recolhem e entregam, as encomendas com entrega têm de ser pagas online (dinheiro e cartão à porta não são oferecidos no checkout).",
    noSwitch: "Depois de aceite, uma encomenda não pode mudar entre a ShipDay e os seus próprios estafetas.",
    off: "ShipDay DESLIGADO: nada é enviado automaticamente. Pode sempre enviar qualquer encomenda à ShipDay manualmente pela app ShipDay.",
    shipdayTile: "Cada nova encomenda com entrega é enviada automaticamente a um estafeta ShipDay quando a aceita. A entrega tem de ser paga online.",
    bothTile: "A sua cozinha tem um interruptor ShipDay ON/OFF: ON envia as novas entregas automaticamente para o pool, OFF deixa-as com os seus estafetas.",
  },
  "pt-BR": {
    title: "Como funciona o envio ShipDay",
    on: "ShipDay LIGADO: cada novo pedido com entrega é enviado automaticamente a um entregador ShipDay assim que você o aceita — e como os entregadores ShipDay apenas coletam e entregam, pedidos com entrega devem ser pagos online (dinheiro e cartão na porta não são oferecidos no checkout).",
    noSwitch: "Depois de aceito, um pedido não pode ser trocado entre a ShipDay e seus próprios entregadores.",
    off: "ShipDay DESLIGADO: nada é enviado automaticamente. Você ainda pode enviar qualquer pedido à ShipDay manualmente pelo app ShipDay.",
    shipdayTile: "Cada novo pedido com entrega é enviado automaticamente a um entregador ShipDay quando você o aceita. A entrega deve ser paga online.",
    bothTile: "Sua cozinha tem um interruptor ShipDay ON/OFF: ON envia as novas entregas automaticamente para o pool, OFF as deixa com seus entregadores.",
  },
  de: {
    title: "So funktioniert der ShipDay-Versand",
    on: "ShipDay AN: Jede neue Lieferbestellung wird automatisch an einen ShipDay-Fahrer gesendet, sobald Sie sie annehmen — und weil ShipDay-Fahrer nur abholen und ausliefern, müssen Lieferbestellungen online bezahlt werden (Bargeld und Karte an der Tür werden im Checkout nicht angeboten).",
    noSwitch: "Nach der Annahme kann eine Bestellung nicht mehr zwischen ShipDay und Ihren eigenen Fahrern gewechselt werden.",
    off: "ShipDay AUS: Nichts wird automatisch gesendet. Sie können jede Bestellung weiterhin manuell über die ShipDay-App an ShipDay senden.",
    shipdayTile: "Jede neue Lieferbestellung geht bei Annahme automatisch an einen ShipDay-Fahrer. Lieferung muss online bezahlt werden.",
    bothTile: "Ihre Küche bekommt einen ShipDay-AN/AUS-Schalter: AN sendet neue Lieferungen automatisch an den Pool, AUS überlässt sie Ihren eigenen Fahrern.",
  },
  nl: {
    title: "Zo werkt ShipDay-verzending",
    on: "ShipDay AAN: elke nieuwe bezorgbestelling wordt automatisch naar een ShipDay-bezorger gestuurd zodra u die accepteert — en omdat ShipDay-bezorgers alleen ophalen en bezorgen, moeten bezorgbestellingen online worden betaald (contant en pinnen aan de deur worden niet aangeboden bij het afrekenen).",
    noSwitch: "Een geaccepteerde bestelling kan niet meer wisselen tussen ShipDay en uw eigen bezorgers.",
    off: "ShipDay UIT: er wordt niets automatisch verstuurd. U kunt elke bestelling nog steeds handmatig naar ShipDay sturen via de ShipDay-app.",
    shipdayTile: "Elke nieuwe bezorgbestelling gaat bij acceptatie automatisch naar een ShipDay-bezorger. Bezorging moet online betaald worden.",
    bothTile: "Uw keuken krijgt een ShipDay AAN/UIT-schakelaar: AAN stuurt nieuwe bezorgingen automatisch naar de pool, UIT laat ze aan uw eigen bezorgers.",
  },
  ro: {
    title: "Cum funcționează expedierea ShipDay",
    on: "ShipDay PORNIT: fiecare comandă nouă cu livrare este trimisă automat unui curier ShipDay imediat ce o acceptați — și pentru că curierii ShipDay doar preiau și livrează, comenzile cu livrare trebuie plătite online (numerar și card la ușă nu sunt oferite la checkout).",
    noSwitch: "Odată acceptată, o comandă nu mai poate fi mutată între ShipDay și curierii proprii.",
    off: "ShipDay OPRIT: nimic nu se trimite automat. Puteți trimite oricând o comandă la ShipDay manual, din aplicația ShipDay.",
    shipdayTile: "Fiecare comandă nouă cu livrare se trimite automat unui curier ShipDay când o acceptați. Livrarea trebuie plătită online.",
    bothTile: "Bucătăria primește un comutator ShipDay ON/OFF: ON trimite automat livrările noi către pool, OFF le lasă curierilor proprii.",
  },
  sv: {
    title: "Så fungerar ShipDay-utskick",
    on: "ShipDay PÅ: varje ny leveransbeställning skickas automatiskt till ett ShipDay-bud i samma stund som du accepterar den — och eftersom ShipDay-buden bara hämtar och lämnar måste leveransbeställningar betalas online (kontanter och kort vid dörren erbjuds inte i kassan).",
    noSwitch: "När en beställning är accepterad kan den inte flyttas mellan ShipDay och dina egna bud.",
    off: "ShipDay AV: inget skickas automatiskt. Du kan fortfarande skicka valfri beställning till ShipDay manuellt via ShipDay-appen.",
    shipdayTile: "Varje ny leveransbeställning skickas automatiskt till ett ShipDay-bud när du accepterar den. Leverans måste betalas online.",
    bothTile: "Ditt kök får en ShipDay PÅ/AV-knapp: PÅ skickar nya leveranser automatiskt till poolen, AV lämnar dem till dina egna bud.",
  },
  da: {
    title: "Sådan fungerer ShipDay-afsendelse",
    on: "ShipDay TIL: hver ny leveringsordre sendes automatisk til et ShipDay-bud, i det øjeblik du accepterer den — og da ShipDay-bude kun henter og afleverer, skal leveringsordrer betales online (kontanter og kort ved døren tilbydes ikke ved checkout).",
    noSwitch: "Når en ordre er accepteret, kan den ikke skiftes mellem ShipDay og dine egne bude.",
    off: "ShipDay FRA: intet sendes automatisk. Du kan stadig sende enhver ordre til ShipDay manuelt via ShipDay-appen.",
    shipdayTile: "Hver ny leveringsordre sendes automatisk til et ShipDay-bud, når du accepterer den. Levering skal betales online.",
    bothTile: "Dit køkken får en ShipDay TIL/FRA-knap: TIL sender nye leveringer automatisk til puljen, FRA lader dine egne bude tage dem.",
  },
  nb: {
    title: "Slik fungerer ShipDay-utsendelse",
    on: "ShipDay PÅ: hver nye leveringsbestilling sendes automatisk til et ShipDay-bud i det øyeblikket du godtar den — og siden ShipDay-budene bare henter og leverer, må leveringsbestillinger betales på nett (kontanter og kort på døren tilbys ikke i kassen).",
    noSwitch: "Når en bestilling er godtatt, kan den ikke byttes mellom ShipDay og dine egne bud.",
    off: "ShipDay AV: ingenting sendes automatisk. Du kan fortsatt sende enhver bestilling til ShipDay manuelt fra ShipDay-appen.",
    shipdayTile: "Hver nye leveringsbestilling sendes automatisk til et ShipDay-bud når du godtar den. Levering må betales på nett.",
    bothTile: "Kjøkkenet får en ShipDay PÅ/AV-bryter: PÅ sender nye leveringer automatisk til poolen, AV lar dine egne bud ta dem.",
  },
  fi: {
    title: "Näin ShipDay-lähetys toimii",
    on: "ShipDay PÄÄLLÄ: jokainen uusi toimitustilaus lähetetään automaattisesti ShipDay-kuljettajalle heti, kun hyväksyt sen — ja koska ShipDay-kuljettajat vain noutavat ja toimittavat, toimitustilaukset on maksettava verkossa (käteistä tai korttia ovella ei tarjota kassalla).",
    noSwitch: "Kun tilaus on hyväksytty, sitä ei voi vaihtaa ShipDayn ja omien kuljettajien välillä.",
    off: "ShipDay POIS: mitään ei lähetetä automaattisesti. Voit silti lähettää minkä tahansa tilauksen ShipDaylle manuaalisesti ShipDay-sovelluksesta.",
    shipdayTile: "Jokainen uusi toimitustilaus lähtee automaattisesti ShipDay-kuljettajalle, kun hyväksyt sen. Toimitus on maksettava verkossa.",
    bothTile: "Keittiö saa ShipDay PÄÄLLE/POIS -kytkimen: PÄÄLLÄ uudet toimitukset lähtevät automaattisesti pooliin, POIS jättää ne omille kuljettajille.",
  },
  pl: {
    title: "Jak działa wysyłka ShipDay",
    on: "ShipDay WŁĄCZONY: każde nowe zamówienie z dostawą jest automatycznie wysyłane do kuriera ShipDay w chwili akceptacji — a ponieważ kurierzy ShipDay tylko odbierają i dostarczają, zamówienia z dostawą muszą być opłacone online (gotówka i karta pod drzwiami nie są dostępne przy płatności).",
    noSwitch: "Po zaakceptowaniu zamówienia nie można go przenieść między ShipDay a własnymi kurierami.",
    off: "ShipDay WYŁĄCZONY: nic nie jest wysyłane automatycznie. Nadal możesz wysłać dowolne zamówienie do ShipDay ręcznie z aplikacji ShipDay.",
    shipdayTile: "Każde nowe zamówienie z dostawą trafia automatycznie do kuriera ShipDay po akceptacji. Dostawa musi być opłacona online.",
    bothTile: "Kuchnia dostaje przełącznik ShipDay ON/OFF: ON wysyła nowe dostawy automatycznie do puli, OFF zostawia je własnym kurierom.",
  },
  cs: {
    title: "Jak funguje odesílání přes ShipDay",
    on: "ShipDay ZAPNUTO: každá nová objednávka s rozvozem se automaticky odešle kurýrovi ShipDay v okamžiku, kdy ji přijmete — a protože kurýři ShipDay pouze vyzvedávají a doručují, objednávky s rozvozem musí být zaplaceny online (hotovost ani karta u dveří se v pokladně nenabízejí).",
    noSwitch: "Jakmile je objednávka přijata, nelze ji přepnout mezi ShipDay a vlastními kurýry.",
    off: "ShipDay VYPNUTO: nic se neodesílá automaticky. Jakoukoli objednávku můžete stále odeslat do ShipDay ručně z aplikace ShipDay.",
    shipdayTile: "Každá nová objednávka s rozvozem se po přijetí automaticky odešle kurýrovi ShipDay. Rozvoz musí být zaplacen online.",
    bothTile: "Kuchyně dostane přepínač ShipDay ZAP/VYP: ZAP posílá nové rozvozy automaticky do poolu, VYP je nechává vlastním kurýrům.",
  },
  sk: {
    title: "Ako funguje odosielanie cez ShipDay",
    on: "ShipDay ZAPNUTÉ: každá nová objednávka s rozvozom sa automaticky odošle kuriérovi ShipDay hneď, ako ju prijmete — a keďže kuriéri ShipDay iba vyzdvihujú a doručujú, objednávky s rozvozom musia byť zaplatené online (hotovosť ani karta pri dverách sa pri platbe neponúkajú).",
    noSwitch: "Po prijatí objednávky ju už nemožno prepnúť medzi ShipDay a vlastnými kuriérmi.",
    off: "ShipDay VYPNUTÉ: nič sa neodosiela automaticky. Akúkoľvek objednávku môžete stále odoslať do ShipDay manuálne z aplikácie ShipDay.",
    shipdayTile: "Každá nová objednávka s rozvozom sa po prijatí automaticky odošle kuriérovi ShipDay. Rozvoz musí byť zaplatený online.",
    bothTile: "Kuchyňa dostane prepínač ShipDay ZAP/VYP: ZAP posiela nové rozvozy automaticky do poolu, VYP ich necháva vlastným kuriérom.",
  },
  hu: {
    title: "Így működik a ShipDay-küldés",
    on: "ShipDay BE: minden új kiszállításos rendelés automatikusan egy ShipDay-futárhoz kerül, amint elfogadja — és mivel a ShipDay-futárok csak átveszik és kiszállítják a rendelést, a kiszállításos rendeléseket online kell fizetni (készpénz és kártya az ajtóban nem választható a fizetésnél).",
    noSwitch: "Az elfogadott rendelés utólag nem váltható át a ShipDay és a saját futárok között.",
    off: "ShipDay KI: semmi sem megy ki automatikusan. Bármely rendelést továbbra is elküldhet a ShipDaynek manuálisan a ShipDay alkalmazásból.",
    shipdayTile: "Minden új kiszállításos rendelés elfogadáskor automatikusan ShipDay-futárhoz kerül. A kiszállítást online kell fizetni.",
    bothTile: "A konyha ShipDay BE/KI kapcsolót kap: BE esetén az új kiszállítások automatikusan a poolba mennek, KI esetén a saját futároké maradnak.",
  },
  el: {
    title: "Πώς λειτουργεί η αποστολή ShipDay",
    on: "ShipDay ΕΝΕΡΓΟ: κάθε νέα παραγγελία με παράδοση στέλνεται αυτόματα σε διανομέα ShipDay μόλις την αποδεχτείτε — και επειδή οι διανομείς ShipDay μόνο παραλαμβάνουν και παραδίδουν, οι παραγγελίες με παράδοση πρέπει να πληρώνονται online (μετρητά και κάρτα στην πόρτα δεν προσφέρονται στο ταμείο).",
    noSwitch: "Μόλις γίνει αποδεκτή μια παραγγελία, δεν μπορεί να αλλάξει μεταξύ ShipDay και δικών σας διανομέων.",
    off: "ShipDay ΑΝΕΝΕΡΓΟ: τίποτα δεν στέλνεται αυτόματα. Μπορείτε πάντα να στείλετε οποιαδήποτε παραγγελία στο ShipDay χειροκίνητα από την εφαρμογή ShipDay.",
    shipdayTile: "Κάθε νέα παραγγελία με παράδοση στέλνεται αυτόματα σε διανομέα ShipDay όταν την αποδέχεστε. Η παράδοση πληρώνεται online.",
    bothTile: "Η κουζίνα αποκτά διακόπτη ShipDay ON/OFF: με ON οι νέες παραδόσεις πάνε αυτόματα στο pool, με OFF μένουν στους δικούς σας διανομείς.",
  },
  bg: {
    title: "Как работи изпращането чрез ShipDay",
    on: "ShipDay ВКЛЮЧЕН: всяка нова поръчка с доставка се изпраща автоматично на куриер на ShipDay в момента, в който я приемете — и понеже куриерите на ShipDay само вземат и доставят, поръчките с доставка трябва да са платени онлайн (пари в брой и карта на вратата не се предлагат при плащане).",
    noSwitch: "След като поръчката е приета, тя не може да се прехвърля между ShipDay и собствените ви куриери.",
    off: "ShipDay ИЗКЛЮЧЕН: нищо не се изпраща автоматично. Все пак можете да изпратите всяка поръчка към ShipDay ръчно от приложението ShipDay.",
    shipdayTile: "Всяка нова поръчка с доставка се изпраща автоматично на куриер на ShipDay при приемане. Доставката трябва да е платена онлайн.",
    bothTile: "Кухнята получава ключ ShipDay ВКЛ/ИЗКЛ: ВКЛ изпраща новите доставки автоматично към пула, ИЗКЛ ги оставя на вашите куриери.",
  },
  hr: {
    title: "Kako funkcionira slanje putem ShipDaya",
    on: "ShipDay UKLJUČEN: svaka nova narudžba s dostavom automatski se šalje ShipDay dostavljaču čim je prihvatite — a budući da ShipDay dostavljači samo preuzimaju i dostavljaju, narudžbe s dostavom moraju biti plaćene online (gotovina i kartica na vratima ne nude se pri plaćanju).",
    noSwitch: "Nakon što je narudžba prihvaćena, ne može se prebacivati između ShipDaya i vlastitih dostavljača.",
    off: "ShipDay ISKLJUČEN: ništa se ne šalje automatski. I dalje možete bilo koju narudžbu poslati ShipDayu ručno iz aplikacije ShipDay.",
    shipdayTile: "Svaka nova narudžba s dostavom automatski ide ShipDay dostavljaču kad je prihvatite. Dostava se mora platiti online.",
    bothTile: "Kuhinja dobiva ShipDay ON/OFF prekidač: ON automatski šalje nove dostave u pool, OFF ih ostavlja vašim dostavljačima.",
  },
  sr: {
    title: "Kako funkcioniše slanje putem ShipDaya",
    on: "ShipDay UKLJUČEN: svaka nova porudžbina sa dostavom automatski se šalje ShipDay dostavljaču čim je prihvatite — a pošto ShipDay dostavljači samo preuzimaju i dostavljaju, porudžbine sa dostavom moraju biti plaćene onlajn (gotovina i kartica na vratima se ne nude pri plaćanju).",
    noSwitch: "Kada je porudžbina prihvaćena, ne može se prebacivati između ShipDaya i sopstvenih dostavljača.",
    off: "ShipDay ISKLJUČEN: ništa se ne šalje automatski. I dalje možete bilo koju porudžbinu poslati ShipDayu ručno iz ShipDay aplikacije.",
    shipdayTile: "Svaka nova porudžbina sa dostavom automatski ide ShipDay dostavljaču kad je prihvatite. Dostava mora biti plaćena onlajn.",
    bothTile: "Kuhinja dobija ShipDay ON/OFF prekidač: ON automatski šalje nove dostave u pool, OFF ih ostavlja vašim dostavljačima.",
  },
  sl: {
    title: "Kako deluje pošiljanje prek ShipDaya",
    on: "ShipDay VKLOPLJEN: vsako novo naročilo z dostavo se samodejno pošlje dostavljavcu ShipDay, takoj ko ga sprejmete — in ker dostavljavci ShipDay samo prevzamejo in dostavijo, morajo biti naročila z dostavo plačana prek spleta (gotovina in kartica na vratih pri plačilu nista na voljo).",
    noSwitch: "Ko je naročilo sprejeto, ga ni mogoče preklapljati med ShipDayem in lastnimi dostavljavci.",
    off: "ShipDay IZKLOPLJEN: nič se ne pošilja samodejno. Vsako naročilo lahko še vedno ročno pošljete ShipDayu iz aplikacije ShipDay.",
    shipdayTile: "Vsako novo naročilo z dostavo gre ob sprejemu samodejno dostavljavcu ShipDay. Dostava mora biti plačana prek spleta.",
    bothTile: "Kuhinja dobi stikalo ShipDay VKLOP/IZKLOP: VKLOP nove dostave samodejno pošlje v pool, IZKLOP jih prepusti lastnim dostavljavcem.",
  },
  et: {
    title: "Kuidas ShipDay saatmine töötab",
    on: "ShipDay SEES: iga uus kohaletoimetamise tellimus saadetakse automaatselt ShipDay kullerile kohe, kui selle vastu võtate — ja kuna ShipDay kullerid ainult võtavad peale ja toovad kohale, tuleb kohaletoimetamise tellimused maksta veebis (sularaha ja kaardimakse ukse peal kassas ei pakuta).",
    noSwitch: "Kui tellimus on vastu võetud, ei saa seda enam ShipDay ja oma kullerite vahel vahetada.",
    off: "ShipDay VÄLJAS: midagi ei saadeta automaatselt. Iga tellimuse saate siiski ShipDay rakendusest käsitsi ShipDayle saata.",
    shipdayTile: "Iga uus kohaletoimetamise tellimus läheb vastuvõtmisel automaatselt ShipDay kullerile. Kohaletoimetamine tuleb maksta veebis.",
    bothTile: "Köök saab ShipDay SEES/VÄLJAS lüliti: SEES saadab uued tellimused automaatselt poolile, VÄLJAS jätab need teie oma kulleritele.",
  },
  lv: {
    title: "Kā darbojas ShipDay nosūtīšana",
    on: "ShipDay IESLĒGTS: katrs jauns piegādes pasūtījums tiek automātiski nosūtīts ShipDay kurjeram, tiklīdz to apstiprināt — un tā kā ShipDay kurjeri tikai paņem un piegādā, piegādes pasūtījumiem jābūt apmaksātiem tiešsaistē (skaidra nauda un karte pie durvīm norēķinos netiek piedāvāta).",
    noSwitch: "Kad pasūtījums ir apstiprināts, to vairs nevar pārslēgt starp ShipDay un saviem kurjeriem.",
    off: "ShipDay IZSLĒGTS: nekas netiek sūtīts automātiski. Jebkuru pasūtījumu joprojām varat nosūtīt ShipDay manuāli no ShipDay lietotnes.",
    shipdayTile: "Katrs jauns piegādes pasūtījums pēc apstiprināšanas automātiski nonāk pie ShipDay kurjera. Piegāde jāapmaksā tiešsaistē.",
    bothTile: "Virtuve saņem ShipDay IESL./IZSL. slēdzi: IESLĒGTS jaunās piegādes automātiski sūta uz pūlu, IZSLĒGTS tās atstāj jūsu kurjeriem.",
  },
  lt: {
    title: "Kaip veikia „ShipDay“ siuntimas",
    on: "„ShipDay“ ĮJUNGTA: kiekvienas naujas pristatymo užsakymas automatiškai išsiunčiamas „ShipDay“ kurjeriui vos jį priėmus — o kadangi „ShipDay“ kurjeriai tik paima ir pristato, pristatymo užsakymai turi būti apmokėti internetu (grynieji ir kortelė prie durų atsiskaitant nesiūlomi).",
    noSwitch: "Priėmus užsakymą, jo nebegalima perkelti tarp „ShipDay“ ir savų kurjerių.",
    off: "„ShipDay“ IŠJUNGTA: automatiškai niekas nesiunčiama. Bet kurį užsakymą vis tiek galite išsiųsti „ShipDay“ rankiniu būdu per „ShipDay“ programėlę.",
    shipdayTile: "Kiekvienas naujas pristatymo užsakymas priėmus automatiškai keliauja „ShipDay“ kurjeriui. Pristatymas turi būti apmokėtas internetu.",
    bothTile: "Virtuvė gauna „ShipDay“ ĮJ./IŠJ. jungiklį: ĮJUNGUS naujus pristatymus automatiškai siunčia į pulą, IŠJUNGUS palieka juos jūsų kurjeriams.",
  },
  tr: {
    title: "ShipDay gönderimi nasıl çalışır",
    on: "ShipDay AÇIK: her yeni teslimat siparişi, siz kabul ettiğiniz anda otomatik olarak bir ShipDay kuryesine gönderilir — ve ShipDay kuryeleri yalnızca alıp teslim ettiği için teslimat siparişleri online ödenmelidir (kapıda nakit ve kart ödeme seçenekleri sunulmaz).",
    noSwitch: "Bir sipariş kabul edildikten sonra ShipDay ile kendi kuryeleriniz arasında değiştirilemez.",
    off: "ShipDay KAPALI: hiçbir şey otomatik gönderilmez. Yine de herhangi bir siparişi ShipDay uygulamasından manuel olarak ShipDay'e gönderebilirsiniz.",
    shipdayTile: "Her yeni teslimat siparişi kabul edildiğinde otomatik olarak bir ShipDay kuryesine gider. Teslimat online ödenmelidir.",
    bothTile: "Mutfağınıza bir ShipDay AÇIK/KAPALI anahtarı gelir: AÇIK yeni teslimatları otomatik olarak havuza gönderir, KAPALI kendi kuryelerinize bırakır.",
  },
  ru: {
    title: "Как работает отправка через ShipDay",
    on: "ShipDay ВКЛЮЧЁН: каждый новый заказ с доставкой автоматически отправляется курьеру ShipDay в момент принятия — а поскольку курьеры ShipDay только забирают и доставляют, заказы с доставкой должны быть оплачены онлайн (наличные и карта у двери при оформлении не предлагаются).",
    noSwitch: "После принятия заказ нельзя переключить между ShipDay и собственными курьерами.",
    off: "ShipDay ВЫКЛЮЧЕН: ничего не отправляется автоматически. Любой заказ по-прежнему можно отправить в ShipDay вручную из приложения ShipDay.",
    shipdayTile: "Каждый новый заказ с доставкой при принятии автоматически уходит курьеру ShipDay. Доставка оплачивается онлайн.",
    bothTile: "Кухня получает переключатель ShipDay ВКЛ/ВЫКЛ: ВКЛ автоматически отправляет новые доставки в пул, ВЫКЛ оставляет их вашим курьерам.",
  },
  uk: {
    title: "Як працює відправлення через ShipDay",
    on: "ShipDay УВІМКНЕНО: кожне нове замовлення з доставкою автоматично надсилається кур'єру ShipDay у момент прийняття — а оскільки кур'єри ShipDay лише забирають і доставляють, замовлення з доставкою мають бути оплачені онлайн (готівка та картка біля дверей при оформленні не пропонуються).",
    noSwitch: "Після прийняття замовлення не можна переключити між ShipDay і власними кур'єрами.",
    off: "ShipDay ВИМКНЕНО: нічого не надсилається автоматично. Будь-яке замовлення все одно можна надіслати в ShipDay вручну з додатка ShipDay.",
    shipdayTile: "Кожне нове замовлення з доставкою після прийняття автоматично йде кур'єру ShipDay. Доставка оплачується онлайн.",
    bothTile: "Кухня отримує перемикач ShipDay УВІМК/ВИМК: УВІМК автоматично надсилає нові доставки в пул, ВИМК залишає їх вашим кур'єрам.",
  },
  ca: {
    title: "Com funciona l'enviament ShipDay",
    on: "ShipDay ACTIVAT: cada nova comanda a domicili s'envia automàticament a un repartidor de ShipDay en el moment que l'acceptes — i com que els repartidors de ShipDay només recullen i lliuren, les comandes a domicili s'han de pagar en línia (efectiu i targeta a la porta no s'ofereixen al pagament).",
    noSwitch: "Un cop acceptada, una comanda no es pot canviar entre ShipDay i els teus propis repartidors.",
    off: "ShipDay DESACTIVAT: no s'envia res automàticament. Encara pots enviar qualsevol comanda a ShipDay manualment des de l'app de ShipDay.",
    shipdayTile: "Cada nova comanda a domicili s'envia automàticament a un repartidor de ShipDay en acceptar-la. El lliurament s'ha de pagar en línia.",
    bothTile: "La cuina té un interruptor ShipDay ON/OFF: ON envia les noves comandes automàticament al pool, OFF les deixa als teus repartidors.",
  },
  id: {
    title: "Cara kerja pengiriman ShipDay",
    on: "ShipDay AKTIF: setiap pesanan antar baru otomatis dikirim ke kurir ShipDay begitu Anda menerimanya — dan karena kurir ShipDay hanya mengambil dan mengantar, pesanan antar harus dibayar online (tunai dan kartu di pintu tidak tersedia saat checkout).",
    noSwitch: "Setelah pesanan diterima, pesanan tidak bisa dipindah antara ShipDay dan kurir sendiri.",
    off: "ShipDay NONAKTIF: tidak ada yang dikirim otomatis. Anda tetap bisa mengirim pesanan apa pun ke ShipDay secara manual dari aplikasi ShipDay.",
    shipdayTile: "Setiap pesanan antar baru otomatis dikirim ke kurir ShipDay saat diterima. Pengantaran harus dibayar online.",
    bothTile: "Dapur mendapat sakelar ShipDay ON/OFF: ON mengirim pengantaran baru otomatis ke pool, OFF menyerahkannya ke kurir sendiri.",
  },
  vi: {
    title: "Cách hoạt động của gửi đơn ShipDay",
    on: "ShipDay BẬT: mỗi đơn giao hàng mới được tự động gửi cho tài xế ShipDay ngay khi bạn chấp nhận — và vì tài xế ShipDay chỉ nhận và giao hàng, đơn giao hàng phải được thanh toán trực tuyến (tiền mặt và quẹt thẻ tại cửa không có ở bước thanh toán).",
    noSwitch: "Sau khi đơn được chấp nhận, không thể chuyển đổi giữa ShipDay và tài xế riêng của bạn.",
    off: "ShipDay TẮT: không có gì được gửi tự động. Bạn vẫn có thể gửi bất kỳ đơn nào cho ShipDay thủ công từ ứng dụng ShipDay.",
    shipdayTile: "Mỗi đơn giao hàng mới tự động gửi cho tài xế ShipDay khi bạn chấp nhận. Giao hàng phải thanh toán trực tuyến.",
    bothTile: "Bếp có công tắc ShipDay BẬT/TẮT: BẬT tự động gửi đơn giao mới vào nhóm tài xế, TẮT để tài xế riêng của bạn nhận.",
  },
  th: {
    title: "การส่งออเดอร์ผ่าน ShipDay ทำงานอย่างไร",
    on: "ShipDay เปิด: ออเดอร์จัดส่งใหม่ทุกออเดอร์จะถูกส่งให้คนขับ ShipDay โดยอัตโนมัติทันทีที่คุณกดรับ — และเนื่องจากคนขับ ShipDay ทำหน้าที่รับและส่งเท่านั้น ออเดอร์จัดส่งจึงต้องชำระเงินออนไลน์ (ไม่มีตัวเลือกเงินสดหรือรูดบัตรที่หน้าประตูตอนชำระเงิน)",
    noSwitch: "เมื่อรับออเดอร์แล้ว จะสลับระหว่าง ShipDay กับคนขับของร้านไม่ได้",
    off: "ShipDay ปิด: ไม่มีการส่งอัตโนมัติ แต่คุณยังส่งออเดอร์ใดก็ได้ให้ ShipDay ด้วยตนเองผ่านแอป ShipDay",
    shipdayTile: "ออเดอร์จัดส่งใหม่ทุกออเดอร์จะส่งให้คนขับ ShipDay อัตโนมัติเมื่อกดรับ การจัดส่งต้องชำระเงินออนไลน์",
    bothTile: "ครัวจะมีสวิตช์ ShipDay เปิด/ปิด: เปิด = ส่งออเดอร์จัดส่งใหม่เข้าพูลอัตโนมัติ ปิด = ให้คนขับของร้านรับผิดชอบ",
  },
  zh: {
    title: "ShipDay 派单如何运作",
    on: "ShipDay 开启时：每个新的外送订单在您接单的那一刻会自动派给 ShipDay 配送员——由于 ShipDay 配送员只负责取餐和送达，外送订单必须在线支付（结账时不提供现金或门口刷卡）。",
    noSwitch: "订单一旦接受，就无法在 ShipDay 和自家配送员之间切换。",
    off: "ShipDay 关闭时：不会自动派单。您仍可在 ShipDay 应用中手动将任意订单发送给 ShipDay。",
    shipdayTile: "每个新的外送订单在接单时自动派给 ShipDay 配送员。外送必须在线支付。",
    bothTile: "厨房会有一个 ShipDay 开/关开关：开 = 新外送订单自动派入配送池，关 = 由自家配送员配送。",
  },
  ja: {
    title: "ShipDay配車のしくみ",
    on: "ShipDayオン：新しいデリバリー注文は、受諾した瞬間に自動でShipDayドライバーへ送られます。ShipDayドライバーは受け取りと配達のみを行うため、デリバリー注文はオンライン決済が必須です（チェックアウトで現金・玄関先でのカード払いは表示されません）。",
    noSwitch: "一度受諾した注文は、ShipDayと自店ドライバーの間で切り替えられません。",
    off: "ShipDayオフ：自動送信は行われません。ShipDayアプリから手動で任意の注文をShipDayに送ることは引き続き可能です。",
    shipdayTile: "新しいデリバリー注文は受諾時に自動でShipDayドライバーへ。デリバリーはオンライン決済必須。",
    bothTile: "キッチンにShipDayオン/オフのスイッチが付きます。オン＝新規デリバリーを自動でプールへ、オフ＝自店ドライバーが担当。",
  },
  ko: {
    title: "ShipDay 배차 작동 방식",
    on: "ShipDay 켜짐: 새 배달 주문은 수락하는 순간 자동으로 ShipDay 기사에게 전송됩니다 — ShipDay 기사는 픽업과 배달만 하므로 배달 주문은 온라인 결제가 필수입니다(결제 단계에서 현금·문앞 카드 결제는 제공되지 않습니다).",
    noSwitch: "주문이 수락된 후에는 ShipDay와 자체 기사 간에 전환할 수 없습니다.",
    off: "ShipDay 꺼짐: 자동 전송은 없습니다. 여전히 ShipDay 앱에서 원하는 주문을 수동으로 ShipDay에 보낼 수 있습니다.",
    shipdayTile: "새 배달 주문은 수락 시 자동으로 ShipDay 기사에게 전송됩니다. 배달은 온라인 결제가 필요합니다.",
    bothTile: "주방에 ShipDay 켜기/끄기 스위치가 생깁니다: 켜면 새 배달이 자동으로 풀로, 끄면 자체 기사에게 갑니다.",
  },
  ar: {
    title: "كيف يعمل الإرسال عبر ShipDay",
    on: "ShipDay مفعّل: يُرسل كل طلب توصيل جديد تلقائيًا إلى سائق ShipDay لحظة قبولك له — ولأن سائقي ShipDay يستلمون ويوصلون فقط، يجب دفع طلبات التوصيل عبر الإنترنت (لا يُعرض الدفع نقدًا أو بالبطاقة عند الباب في صفحة الدفع).",
    noSwitch: "بعد قبول الطلب لا يمكن تبديله بين ShipDay وسائقيك.",
    off: "ShipDay غير مفعّل: لا يُرسل شيء تلقائيًا. لا يزال بإمكانك إرسال أي طلب إلى ShipDay يدويًا من تطبيق ShipDay.",
    shipdayTile: "كل طلب توصيل جديد يُرسل تلقائيًا إلى سائق ShipDay عند قبوله. يجب دفع التوصيل عبر الإنترنت.",
    bothTile: "يحصل المطبخ على مفتاح ShipDay تشغيل/إيقاف: التشغيل يرسل التوصيلات الجديدة تلقائيًا إلى المجموعة، والإيقاف يتركها لسائقيك.",
  },
  he: {
    title: "איך עובד שיגור ShipDay",
    on: "ShipDay פועל: כל הזמנת משלוח חדשה נשלחת אוטומטית לשליח ShipDay ברגע שאתם מאשרים אותה — ומכיוון ששליחי ShipDay רק אוספים ומוסרים, הזמנות משלוח חייבות להיות משולמות אונליין (מזומן וכרטיס בדלת אינם מוצעים בקופה).",
    noSwitch: "לאחר שההזמנה אושרה, אי אפשר להעביר אותה בין ShipDay לשליחים שלכם.",
    off: "ShipDay כבוי: שום דבר לא נשלח אוטומטית. עדיין אפשר לשלוח כל הזמנה ל-ShipDay ידנית מאפליקציית ShipDay.",
    shipdayTile: "כל הזמנת משלוח חדשה נשלחת אוטומטית לשליח ShipDay עם האישור. המשלוח חייב להיות משולם אונליין.",
    bothTile: "המטבח מקבל מתג ShipDay הפעלה/כיבוי: פועל = משלוחים חדשים נשלחים אוטומטית למאגר, כבוי = השליחים שלכם מטפלים בהם.",
  },
  hi: {
    title: "ShipDay डिस्पैच कैसे काम करता है",
    on: "ShipDay चालू: हर नया डिलीवरी ऑर्डर स्वीकार करते ही अपने आप ShipDay ड्राइवर को भेज दिया जाता है — और चूँकि ShipDay ड्राइवर सिर्फ़ ऑर्डर उठाते और पहुँचाते हैं, डिलीवरी ऑर्डर का भुगतान ऑनलाइन होना ज़रूरी है (चेकआउट पर नकद और दरवाज़े पर कार्ड का विकल्प नहीं मिलता)।",
    noSwitch: "ऑर्डर स्वीकार होने के बाद उसे ShipDay और अपने ड्राइवरों के बीच बदला नहीं जा सकता।",
    off: "ShipDay बंद: कुछ भी अपने आप नहीं भेजा जाता। आप फिर भी ShipDay ऐप से कोई भी ऑर्डर मैन्युअली ShipDay को भेज सकते हैं।",
    shipdayTile: "हर नया डिलीवरी ऑर्डर स्वीकार करते ही अपने आप ShipDay ड्राइवर के पास जाता है। डिलीवरी का भुगतान ऑनलाइन ज़रूरी है।",
    bothTile: "किचन को ShipDay चालू/बंद स्विच मिलता है: चालू = नई डिलीवरी अपने आप पूल में, बंद = आपके अपने ड्राइवर सँभालते हैं।",
  },
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = T[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const dp = ((json.admin ??= {}).driverPool ??= {});
  dp.howItWorksTitle = pack.title;
  dp.howItWorksOn = pack.on;
  dp.howItWorksNoSwitch = pack.noSwitch;
  dp.howItWorksOff = pack.off;
  dp.sourceShipdayDescription = pack.shipdayTile;
  dp.sourceBothDescription = pack.bothTile;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ 4 new + 2 corrected keys in ${changed} locale file(s)`);
