/**
 * A5 (2026-08-22) — MERGE the "check on existing orders" capability toggle
 * keys into `admin.phoneOrderingPage.config` ×38.
 *
 *   npx tsx scripts/i18n-add-nabil-order-status.ts
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "src", "messages");

const T: Record<string, [string, string]> = {
  en: ["Check on orders already placed (website, app, phone, delivery)", "Callers often phone about an order they placed online. Nabil looks it up by their number or order number and reports the real status and ready time — never a guess. Cancelling or changing an order still goes to a person."],
  fr: ["Renseigner sur les commandes déjà passées (site, appli, téléphone, livraison)", "Les clients appellent souvent pour une commande passée en ligne. Nabil la retrouve par leur numéro ou le numéro de commande et donne le vrai statut et l'heure prévue — jamais une supposition. Annuler ou modifier une commande passe toujours par une personne."],
  es: ["Informar sobre pedidos ya realizados (web, app, teléfono, reparto)", "Los clientes suelen llamar por un pedido hecho en línea. Nabil lo busca por su número o por el número de pedido e informa del estado real y la hora prevista — nunca una suposición. Cancelar o cambiar un pedido sigue pasando por una persona."],
  it: ["Informare sugli ordini già effettuati (sito, app, telefono, consegna)", "I clienti chiamano spesso per un ordine fatto online. Nabil lo cerca con il loro numero o con il numero d'ordine e riferisce lo stato reale e l'orario previsto — mai un'ipotesi. Annullare o modificare un ordine passa sempre da una persona."],
  pt: ["Informar sobre pedidos já feitos (site, app, telefone, entrega)", "Os clientes ligam muitas vezes por causa de um pedido feito online. O Nabil procura-o pelo número deles ou pelo número do pedido e informa o estado real e a hora prevista — nunca uma suposição. Cancelar ou alterar um pedido continua a passar por uma pessoa."],
  "pt-BR": ["Informar sobre pedidos já feitos (site, app, telefone, entrega)", "Os clientes costumam ligar por um pedido feito online. O Nabil busca pelo número deles ou pelo número do pedido e informa o status real e o horário previsto — nunca um chute. Cancelar ou alterar um pedido continua passando por uma pessoa."],
  de: ["Auskunft zu bereits aufgegebenen Bestellungen (Website, App, Telefon, Lieferung)", "Anrufer fragen oft nach einer online aufgegebenen Bestellung. Nabil sucht sie über ihre Nummer oder die Bestellnummer und nennt den echten Status und die voraussichtliche Zeit — nie eine Vermutung. Stornieren oder Ändern läuft weiterhin über eine Person."],
  nl: ["Informatie over al geplaatste bestellingen (website, app, telefoon, bezorging)", "Bellers vragen vaak naar een online geplaatste bestelling. Nabil zoekt die op via hun nummer of het bestelnummer en meldt de echte status en verwachte tijd — nooit een gok. Annuleren of wijzigen gaat nog steeds via een persoon."],
  ro: ["Informații despre comenzile deja plasate (site, aplicație, telefon, livrare)", "Apelanții sună adesea pentru o comandă plasată online. Nabil o caută după numărul lor sau după numărul comenzii și comunică starea reală și ora estimată — niciodată o presupunere. Anularea sau modificarea unei comenzi trece în continuare printr-o persoană."],
  sv: ["Svara om redan lagda beställningar (webb, app, telefon, leverans)", "De som ringer frågar ofta om en beställning de lagt online. Nabil letar upp den via deras nummer eller beställningsnumret och anger verklig status och beräknad tid — aldrig en gissning. Att avboka eller ändra går fortfarande via en person."],
  da: ["Svare om allerede afgivne bestillinger (web, app, telefon, levering)", "Folk ringer ofte om en bestilling, de har lagt online. Nabil finder den via deres nummer eller ordrenummeret og oplyser den rigtige status og forventede tid — aldrig et gæt. Annullering eller ændring går stadig via en person."],
  nb: ["Svare om bestillinger som allerede er lagt inn (nett, app, telefon, levering)", "Innringere spør ofte om en bestilling de la inn på nett. Nabil finner den via nummeret deres eller ordrenummeret og oppgir reell status og forventet tid — aldri gjetting. Avbestilling eller endring går fortsatt via en person."],
  fi: ["Vastaa jo tehdyistä tilauksista (verkko, sovellus, puhelin, toimitus)", "Soittajat kysyvät usein verkossa tehdystä tilauksesta. Nabil hakee sen heidän numerollaan tai tilausnumerolla ja kertoo todellisen tilan ja arvioidun ajan — ei koskaan arvausta. Peruutus tai muutos hoidetaan edelleen ihmisen kautta."],
  pl: ["Informacje o złożonych już zamówieniach (strona, aplikacja, telefon, dostawa)", "Dzwoniący często pytają o zamówienie złożone online. Nabil odnajduje je po ich numerze lub numerze zamówienia i podaje prawdziwy status oraz przewidywany czas — nigdy nie zgaduje. Anulowanie lub zmiana zamówienia nadal wymaga osoby."],
  cs: ["Informace o již zadaných objednávkách (web, aplikace, telefon, rozvoz)", "Volající se často ptají na objednávku zadanou online. Nabil ji vyhledá podle jejich čísla nebo čísla objednávky a sdělí skutečný stav a odhadovaný čas — nikdy nehádá. Zrušení nebo změna objednávky jde stále přes člověka."],
  sk: ["Informácie o už zadaných objednávkach (web, aplikácia, telefón, rozvoz)", "Volajúci sa často pýtajú na objednávku zadanú online. Nabil ju vyhľadá podľa ich čísla alebo čísla objednávky a oznámi skutočný stav a odhadovaný čas — nikdy neháda. Zrušenie alebo zmena objednávky ide stále cez človeka."],
  hu: ["Tájékoztatás már leadott rendelésekről (weboldal, app, telefon, kiszállítás)", "A hívók gyakran egy online leadott rendelés miatt telefonálnak. Nabil a számuk vagy a rendelésszám alapján megkeresi, és a valós állapotot és várható időt mondja — sosem találgat. A lemondás vagy módosítás továbbra is emberhez kerül."],
  el: ["Ενημέρωση για παραγγελίες που έχουν ήδη γίνει (site, εφαρμογή, τηλέφωνο, διανομή)", "Οι πελάτες συχνά τηλεφωνούν για μια παραγγελία που έκαναν online. Ο Nabil τη βρίσκει από τον αριθμό τους ή τον αριθμό παραγγελίας και αναφέρει την πραγματική κατάσταση και την εκτιμώμενη ώρα — ποτέ εικασία. Η ακύρωση ή η αλλαγή παραγγελίας περνά πάντα από άνθρωπο."],
  bg: ["Информация за вече направени поръчки (сайт, приложение, телефон, доставка)", "Обаждащите се често питат за поръчка, направена онлайн. Набил я намира по техния номер или номера на поръчката и съобщава реалния статус и очакваното време — никога предположение. Отказът или промяната на поръчка продължава да минава през човек."],
  hr: ["Informacije o već poslanim narudžbama (web, aplikacija, telefon, dostava)", "Pozivatelji često pitaju za narudžbu koju su poslali online. Nabil je pronalazi po njihovom broju ili broju narudžbe i javlja stvarni status i procijenjeno vrijeme — nikad nagađanje. Otkazivanje ili izmjena narudžbe i dalje ide preko osobe."],
  sr: ["Informacije o već poslatim porudžbinama (veb, aplikacija, telefon, dostava)", "Pozivaoci često pitaju za porudžbinu koju su poslali onlajn. Nabil je pronalazi po njihovom broju ili broju porudžbine i javlja stvarni status i procenjeno vreme — nikad nagađanje. Otkazivanje ili izmena porudžbine i dalje ide preko osobe."],
  sl: ["Informacije o že oddanih naročilih (splet, aplikacija, telefon, dostava)", "Klicatelji pogosto sprašujejo o naročilu, oddanem prek spleta. Nabil ga poišče po njihovi številki ali številki naročila in sporoči dejansko stanje in predvideni čas — nikoli ugibanja. Preklic ali sprememba naročila še vedno poteka prek osebe."],
  et: ["Teave juba esitatud tellimuste kohta (veeb, rakendus, telefon, kohaletoimetamine)", "Helistajad küsivad sageli veebis tehtud tellimuse kohta. Nabil leiab selle nende numbri või tellimuse numbri järgi ning ütleb tegeliku oleku ja eeldatava aja — mitte kunagi oletust. Tühistamine või muutmine käib endiselt inimese kaudu."],
  lv: ["Informācija par jau veiktajiem pasūtījumiem (vietne, lietotne, tālrunis, piegāde)", "Zvanītāji bieži jautā par tiešsaistē veiktu pasūtījumu. Nabil to atrod pēc viņu numura vai pasūtījuma numura un paziņo reālo statusu un paredzamo laiku — nekad minējumu. Atcelšana vai maiņa joprojām notiek caur cilvēku."],
  lt: ["Informacija apie jau pateiktus užsakymus (svetainė, programėlė, telefonas, pristatymas)", "Skambinantieji dažnai klausia apie internetu pateiktą užsakymą. Nabil jį suranda pagal jų numerį arba užsakymo numerį ir praneša tikrąją būseną bei numatomą laiką — niekada nespėlioja. Atšaukimas ar keitimas ir toliau vyksta per žmogų."],
  tr: ["Verilmiş siparişler hakkında bilgi (web sitesi, uygulama, telefon, teslimat)", "Arayanlar genellikle online verdikleri bir sipariş için arar. Nabil siparişi numaralarından veya sipariş numarasından bulur ve gerçek durumu ile tahmini süreyi söyler — asla tahmin yürütmez. İptal veya değişiklik yine bir kişiye yönlendirilir."],
  ru: ["Информация об уже оформленных заказах (сайт, приложение, телефон, доставка)", "Звонящие часто спрашивают о заказе, оформленном онлайн. Набил находит его по их номеру или номеру заказа и сообщает реальный статус и ожидаемое время — никогда не угадывает. Отмена или изменение заказа по-прежнему через сотрудника."],
  uk: ["Інформація про вже оформлені замовлення (сайт, застосунок, телефон, доставка)", "Ті, хто телефонує, часто питають про замовлення, оформлене онлайн. Набіл знаходить його за їхнім номером або номером замовлення й повідомляє реальний статус та очікуваний час — ніколи не вгадує. Скасування чи зміна замовлення, як і раніше, через працівника."],
  ca: ["Informar sobre comandes ja fetes (web, app, telèfon, repartiment)", "Els clients sovint truquen per una comanda feta en línia. El Nabil la cerca pel seu número o pel número de comanda i informa de l'estat real i l'hora prevista — mai una suposició. Cancel·lar o canviar una comanda continua passant per una persona."],
  id: ["Memberi info pesanan yang sudah dibuat (situs, aplikasi, telepon, pengiriman)", "Penelepon sering menanyakan pesanan yang mereka buat secara online. Nabil mencarinya lewat nomor mereka atau nomor pesanan dan menyampaikan status sebenarnya serta perkiraan waktu — tidak pernah menebak. Membatalkan atau mengubah pesanan tetap lewat petugas."],
  vi: ["Thông tin về đơn đã đặt (website, ứng dụng, điện thoại, giao hàng)", "Người gọi thường hỏi về đơn họ đã đặt trực tuyến. Nabil tra theo số điện thoại hoặc mã đơn và báo đúng trạng thái cùng thời gian dự kiến — không bao giờ đoán. Hủy hoặc thay đổi đơn vẫn cần gặp nhân viên."],
  th: ["ตอบเรื่องออเดอร์ที่สั่งไปแล้ว (เว็บไซต์ แอป โทรศัพท์ เดลิเวอรี)", "ลูกค้ามักโทรมาถามเรื่องออเดอร์ที่สั่งออนไลน์ Nabil จะค้นหาจากเบอร์โทรหรือหมายเลขออเดอร์ แล้วแจ้งสถานะจริงและเวลาที่คาดว่าจะเสร็จ — ไม่เดาเด็ดขาด การยกเลิกหรือแก้ไขออเดอร์ยังต้องผ่านพนักงาน"],
  zh: ["查询已下的订单（网站、App、电话、外送）", "来电者常常询问在线下的订单。Nabil 会按来电号码或订单号查找，并告知真实状态和预计时间——绝不猜测。取消或修改订单仍需转给人工。"],
  ja: ["注文済みの注文への対応（ウェブ、アプリ、電話、配達）", "オンラインで注文したお客様からの問い合わせはよくあります。Nabil は電話番号または注文番号で注文を探し、実際の状況と予定時刻をお伝えします — 推測は一切しません。キャンセルや変更は引き続きスタッフが対応します。"],
  ko: ["이미 접수된 주문 확인 (웹사이트, 앱, 전화, 배달)", "온라인으로 주문한 고객이 전화로 문의하는 경우가 많아요. Nabil이 전화번호나 주문번호로 찾아 실제 상태와 예상 시간을 알려 드려요 — 절대 추측하지 않아요. 취소나 변경은 여전히 직원이 처리해요."],
  ar: ["الرد عن الطلبات التي تم تقديمها (الموقع، التطبيق، الهاتف، التوصيل)", "كثيرًا ما يتصل العملاء بشأن طلب قدموه عبر الإنترنت. يبحث نبيل عنه برقم هاتفهم أو رقم الطلب ويخبرهم بالحالة الحقيقية والوقت المتوقع — دون تخمين أبدًا. إلغاء الطلب أو تعديله يظل عبر موظف."],
  he: ["מענה על הזמנות שכבר בוצעו (אתר, אפליקציה, טלפון, משלוח)", "מתקשרים שואלים לעיתים קרובות על הזמנה שביצעו באינטרנט. נביל מאתר אותה לפי המספר שלהם או מספר ההזמנה ומוסר את הסטטוס האמיתי ואת הזמן המשוער — לעולם לא ניחוש. ביטול או שינוי הזמנה עדיין עוברים דרך אדם."],
  hi: ["पहले से किए गए ऑर्डर की जानकारी देना (वेबसाइट, ऐप, फ़ोन, डिलीवरी)", "कॉल करने वाले अक्सर ऑनलाइन किए गए ऑर्डर के बारे में पूछते हैं। नबील उनके नंबर या ऑर्डर नंबर से उसे ढूँढता है और असली स्थिति व अनुमानित समय बताता है — कभी अंदाज़ा नहीं। ऑर्डर रद्द करना या बदलना अब भी किसी व्यक्ति के ज़रिए होता है।"],
};

function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  let changed = 0;
  for (const f of files) {
    const locale = f.replace(/\.json$/, "");
    const t = T[locale];
    if (!t) {
      console.error(`✗ no translation for ${locale}`);
      process.exit(1);
    }
    const file = path.join(DIR, f);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const cfg = json?.admin?.phoneOrderingPage?.config;
    if (!cfg) {
      console.error(`✗ ${locale}: admin.phoneOrderingPage.config missing`);
      process.exit(1);
    }
    let touched = false;
    if (cfg.answerOrderStatus !== t[0]) { cfg.answerOrderStatus = t[0]; touched = true; }
    if (cfg.answerOrderStatusHint !== t[1]) { cfg.answerOrderStatusHint = t[1]; touched = true; }
    if (touched) {
      fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
      changed++;
    }
  }
  console.log(`✓ ${files.length} locale files checked, ${changed} updated`);
}

main();
