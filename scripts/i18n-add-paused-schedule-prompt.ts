/**
 * Adds checkout.pausedSchedulePrompt ×38 — the forced-scheduling banner shown
 * when the chosen service is PAUSED (kitchen "pause for now"): the customer can
 * still schedule for after the pause. Companion to the 2026-08-09 pause fix
 * (server guard + service buttons no longer hard-disable on pause).
 * Mirrors the tone/shape of checkout.closedSchedulePrompt / leadTimePrompt.
 *
 *   npx tsx scripts/i18n-add-paused-schedule-prompt.ts          (dry run)
 *   npx tsx scripts/i18n-add-paused-schedule-prompt.ts --write
 */
import fs from "node:fs";
import path from "node:path";

const WRITE = process.argv.includes("--write");
const DIR = path.join(process.cwd(), "src", "messages");
const KEY = "pausedSchedulePrompt";

const PACK: Record<string, string> = {
  en: "⏸ We’re not taking orders for right now — pick a later time and we’ll have it ready. The earliest available slot is shown below.",
  ar: "⏸ لا نستقبل الطلبات الفورية حاليًا — اختر وقتًا لاحقًا وسنجهّز طلبك. أقرب موعد متاح موضح أدناه.",
  bg: "⏸ В момента не приемаме поръчки за веднага — изберете по-късен час и ще я приготвим. Най-ранният свободен час е показан по-долу.",
  ca: "⏸ Ara mateix no acceptem comandes immediates — tria una hora més tard i la tindrem a punt. L'hora disponible més propera es mostra a sota.",
  cs: "⏸ Objednávky na hned teď nepřijímáme — vyberte pozdější čas a připravíme ji. Nejbližší volný termín je níže.",
  da: "⏸ Vi tager ikke imod ordrer til nu — vælg et senere tidspunkt, så har vi den klar. Det tidligste ledige tidspunkt vises nedenfor.",
  de: "⏸ Sofort-Bestellungen nehmen wir gerade nicht an — wählen Sie eine spätere Zeit, dann steht alles bereit. Der früheste freie Termin wird unten angezeigt.",
  el: "⏸ Δεν δεχόμαστε παραγγελίες για τώρα — διαλέξτε μια μεταγενέστερη ώρα και θα είναι έτοιμη. Η νωρίτερη διαθέσιμη ώρα φαίνεται παρακάτω.",
  es: "⏸ Ahora mismo no aceptamos pedidos inmediatos — elige una hora posterior y lo tendremos listo. El primer horario disponible se muestra abajo.",
  et: "⏸ Praegu me kohe täidetavaid tellimusi vastu ei võta — vali hilisem aeg ja paneme selle valmis. Varaseim vaba aeg on näha allpool.",
  fi: "⏸ Emme ota juuri nyt heti toimitettavia tilauksia — valitse myöhempi aika, niin se on valmiina. Aikaisin vapaa aika näkyy alla.",
  fr: "⏸ Nous ne prenons pas de commandes immédiates pour le moment — choisissez une heure plus tard et tout sera prêt. Le premier créneau disponible est affiché ci-dessous.",
  he: "⏸ אנחנו לא מקבלים כרגע הזמנות מיידיות — בחרו שעה מאוחרת יותר וההזמנה תהיה מוכנה. המועד הפנוי המוקדם ביותר מוצג למטה.",
  hi: "⏸ अभी हम तुरंत के ऑर्डर नहीं ले रहे हैं — बाद का समय चुनें और हम इसे तैयार रखेंगे। सबसे पहला उपलब्ध समय नीचे दिखाया गया है।",
  hr: "⏸ Trenutačno ne primamo narudžbe za odmah — odaberite kasnije vrijeme i bit će spremna. Najraniji slobodan termin prikazan je ispod.",
  hu: "⏸ Épp nem veszünk fel azonnali rendelést — válasszon későbbi időpontot, és elkészítjük. A legkorábbi szabad időpont lent látható.",
  id: "⏸ Saat ini kami tidak menerima pesanan untuk sekarang — pilih waktu lebih lambat dan kami akan menyiapkannya. Slot paling awal yang tersedia ditampilkan di bawah.",
  it: "⏸ Al momento non accettiamo ordini immediati — scegli un orario più tardi e sarà pronto. Il primo orario disponibile è mostrato qui sotto.",
  ja: "⏸ ただいま即時のご注文は受け付けておりません。後の時間をお選びいただければ、ご用意してお待ちしています。最も早い受付可能時間は下記のとおりです。",
  ko: "⏸ 지금 바로 처리되는 주문은 잠시 받지 않고 있습니다 — 나중 시간을 선택하시면 준비해 두겠습니다. 가장 빠른 가능 시간은 아래에 표시됩니다.",
  lt: "⏸ Šiuo metu nepriimame užsakymų dabar — pasirinkite vėlesnį laiką ir jį paruošime. Anksčiausias laisvas laikas rodomas žemiau.",
  lv: "⏸ Šobrīd nepieņemam tūlītējus pasūtījumus — izvēlieties vēlāku laiku, un tas būs gatavs. Agrākais pieejamais laiks redzams zemāk.",
  nb: "⏸ Vi tar ikke imot bestillinger til nå akkurat nå — velg et senere tidspunkt, så har vi den klar. Det tidligste ledige tidspunktet vises nedenfor.",
  nl: "⏸ We nemen op dit moment geen directe bestellingen aan — kies een later tijdstip, dan staat het klaar. Het vroegst beschikbare tijdstip staat hieronder.",
  pl: "⏸ Chwilowo nie przyjmujemy zamówień na teraz — wybierz późniejszą godzinę, a wszystko będzie gotowe. Najwcześniejszy dostępny termin widać poniżej.",
  pt: "⏸ De momento não aceitamos encomendas imediatas — escolha uma hora mais tarde e estará pronta. O primeiro horário disponível é mostrado abaixo.",
  "pt-BR": "⏸ No momento não estamos aceitando pedidos para agora — escolha um horário mais tarde e deixaremos tudo pronto. O primeiro horário disponível aparece abaixo.",
  ro: "⏸ Momentan nu preluăm comenzi pentru acum — alege o oră mai târzie și o vom pregăti. Cel mai devreme interval disponibil este afișat mai jos.",
  ru: "⏸ Сейчас мы не принимаем заказы «на сейчас» — выберите более позднее время, и всё будет готово. Ближайшее доступное время показано ниже.",
  sk: "⏸ Objednávky na hneď teraz momentálne neprijímame — vyberte neskorší čas a pripravíme ju. Najskorší voľný termín je nižšie.",
  sl: "⏸ Trenutno ne sprejemamo naročil za takoj — izberite poznejši čas in bo pripravljeno. Najzgodnejši prosti termin je prikazan spodaj.",
  sr: "⏸ Trenutno ne primamo porudžbine za odmah — izaberite kasnije vreme i biće spremna. Najraniji slobodan termin je prikazan ispod.",
  sv: "⏸ Vi tar inte emot beställningar till nu just nu — välj en senare tid så har vi den klar. Den tidigaste lediga tiden visas nedan.",
  th: "⏸ ขณะนี้เรางดรับออร์เดอร์แบบทันที — เลือกเวลาภายหลังแล้วเราจะเตรียมไว้ให้ เวลาว่างเร็วที่สุดแสดงอยู่ด้านล่าง",
  tr: "⏸ Şu anda hemen teslim siparişi almıyoruz — daha geç bir saat seçin, hazır olsun. En erken uygun saat aşağıda gösteriliyor.",
  uk: "⏸ Зараз ми не приймаємо замовлення «на зараз» — оберіть пізніший час, і все буде готово. Найближчий доступний час показано нижче.",
  vi: "⏸ Hiện tại chúng tôi tạm ngừng nhận đơn giao ngay — hãy chọn thời gian muộn hơn và chúng tôi sẽ chuẩn bị sẵn. Khung giờ sớm nhất còn trống hiển thị bên dưới.",
  zh: "⏸ 我们暂时不接“立即”订单 — 请选择稍后的时间，我们会提前备好。最早可选时间显示在下方。",
};

function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const locales = files.map((f) => f.replace(/\.json$/, ""));
  const problems = locales.filter((l) => !PACK[l] || !PACK[l].trim());
  const extras = Object.keys(PACK).filter((l) => !locales.includes(l));
  if (problems.length || extras.length) {
    console.error("❌ ABORTED:", { missing: problems, extras });
    process.exit(1);
  }
  for (const loc of locales) {
    const file = path.join(DIR, `${loc}.json`);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    json.checkout ??= {};
    json.checkout[KEY] = PACK[loc];
    if (WRITE) fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  }
  console.log(`${WRITE ? "✅ wrote" : "🔍 dry run —"} checkout.${KEY} × ${locales.length}`);
}
main();
