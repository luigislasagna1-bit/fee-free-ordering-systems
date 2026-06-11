/** i18n: receipt-logo upload panel × 38.
 *    admin.receipts.{logoTitle, logoHint}
 *    npx tsx scripts/i18n-add-receipt-logo.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.receipts.logoTitle": {
    en: "Receipt logo", fr: "Logo du reçu", es: "Logotipo del recibo", it: "Logo dello scontrino", pt: "Logótipo do recibo", "pt-BR": "Logotipo do recibo",
    de: "Beleg-Logo", nl: "Bonlogo", ro: "Sigla bonului", sv: "Kvittologotyp", da: "Kvitteringslogo", nb: "Kvitteringslogo",
    fi: "Kuitin logo", pl: "Logo paragonu", cs: "Logo účtenky", sk: "Logo účtenky", hu: "Nyugta logó", el: "Λογότυπο απόδειξης",
    bg: "Лого на касовата бележка", hr: "Logotip računa", sr: "Логотип рачуна", sl: "Logotip računa", et: "Kviitungi logo", lv: "Čeka logotips",
    lt: "Kvito logotipas", tr: "Fiş logosu", ru: "Логотип чека", uk: "Логотип чека", ca: "Logotip del rebut", id: "Logo struk",
    vi: "Logo hóa đơn", th: "โลโก้ใบเสร็จ", zh: "小票标志", ja: "レシートのロゴ", ko: "영수증 로고", ar: "شعار الإيصال", he: "לוגו הקבלה", hi: "रसीद लोगो",
  },
  "admin.receipts.logoHint": {
    en: "Shown at the top of the customer receipt — in the preview, on the printed receipt and in the order email. High-contrast images print best on thermal paper. Drag the Logo section to reposition it.",
    fr: "Affiché en haut du reçu client — dans l'aperçu, sur le reçu imprimé et dans l'e-mail de commande. Les images très contrastées s'impriment mieux sur papier thermique. Faites glisser la section Logo pour la repositionner.",
    es: "Se muestra en la parte superior del recibo del cliente: en la vista previa, en el recibo impreso y en el correo del pedido. Las imágenes de alto contraste se imprimen mejor en papel térmico. Arrastra la sección Logo para reubicarla.",
    it: "Mostrato in cima allo scontrino del cliente — nell'anteprima, sullo scontrino stampato e nell'email dell'ordine. Le immagini ad alto contrasto si stampano meglio su carta termica. Trascina la sezione Logo per riposizionarla.",
    pt: "Apresentado no topo do recibo do cliente — na pré-visualização, no recibo impresso e no e-mail do pedido. Imagens de alto contraste imprimem melhor em papel térmico. Arraste a secção Logótipo para a reposicionar.",
    "pt-BR": "Exibido no topo do recibo do cliente — na prévia, no recibo impresso e no e-mail do pedido. Imagens de alto contraste imprimem melhor em papel térmico. Arraste a seção Logotipo para reposicioná-la.",
    de: "Wird oben auf dem Kundenbeleg angezeigt — in der Vorschau, auf dem gedruckten Beleg und in der Bestell-E-Mail. Kontrastreiche Bilder drucken auf Thermopapier am besten. Ziehen Sie den Logo-Abschnitt, um ihn zu verschieben.",
    nl: "Wordt bovenaan de klantbon getoond — in de voorvertoning, op de geprinte bon en in de bestel-e-mail. Beelden met veel contrast printen het best op thermisch papier. Sleep de Logo-sectie om deze te verplaatsen.",
    ro: "Afișat în partea de sus a bonului clientului — în previzualizare, pe bonul tipărit și în e-mailul comenzii. Imaginile cu contrast ridicat se imprimă cel mai bine pe hârtie termică. Trage secțiunea Logo pentru a o repoziționa.",
    sv: "Visas högst upp på kundkvittot — i förhandsvisningen, på det utskrivna kvittot och i ordermejlet. Bilder med hög kontrast skrivs ut bäst på termopapper. Dra Logotyp-sektionen för att flytta den.",
    da: "Vises øverst på kundens kvittering — i forhåndsvisningen, på den printede kvittering og i ordremailen. Billeder med høj kontrast printer bedst på termopapir. Træk Logo-sektionen for at flytte den.",
    nb: "Vises øverst på kundens kvittering — i forhåndsvisningen, på den utskrevne kvitteringen og i ordre-e-posten. Bilder med høy kontrast skrives best ut på termopapir. Dra Logo-seksjonen for å flytte den.",
    fi: "Näkyy asiakaskuitin yläosassa — esikatselussa, tulostetussa kuitissa ja tilaussähköpostissa. Korkean kontrastin kuvat tulostuvat parhaiten lämpöpaperille. Siirrä Logo-osiota vetämällä.",
    pl: "Wyświetlane u góry paragonu klienta — w podglądzie, na wydrukowanym paragonie i w e-mailu zamówienia. Obrazy o wysokim kontraście drukują się najlepiej na papierze termicznym. Przeciągnij sekcję Logo, aby zmienić jej położenie.",
    cs: "Zobrazuje se v horní části zákaznické účtenky — v náhledu, na vytištěné účtence a v e-mailu objednávky. Obrázky s vysokým kontrastem se na termopapír tisknou nejlépe. Sekci Logo přesunete přetažením.",
    sk: "Zobrazuje sa v hornej časti zákazníckej účtenky — v náhľade, na vytlačenej účtenke a v e-maile objednávky. Obrázky s vysokým kontrastom sa na termopapier tlačia najlepšie. Sekciu Logo presuniete potiahnutím.",
    hu: "A vásárlói nyugta tetején jelenik meg — az előnézetben, a nyomtatott nyugtán és a rendelési e-mailben. A nagy kontrasztú képek nyomtathatók legjobban hőpapírra. A Logó szakasz húzással áthelyezhető.",
    el: "Εμφανίζεται στο επάνω μέρος της απόδειξης πελάτη — στην προεπισκόπηση, στην εκτυπωμένη απόδειξη και στο email της παραγγελίας. Οι εικόνες υψηλής αντίθεσης εκτυπώνονται καλύτερα σε θερμικό χαρτί. Σύρετε την ενότητα Λογότυπο για να την μετακινήσετε.",
    bg: "Показва се в горната част на клиентската бележка — в прегледа, на разпечатаната бележка и в имейла за поръчката. Изображенията с висок контраст се печатат най-добре на термохартия. Плъзнете секцията Лого, за да я преместите.",
    hr: "Prikazuje se na vrhu računa za kupca — u pregledu, na ispisanom računu i u e-poruci narudžbe. Slike visokog kontrasta najbolje se ispisuju na termalnom papiru. Povucite odjeljak Logotip da biste ga premjestili.",
    sr: "Приказује се на врху рачуна за купца — у прегледу, на одштампаном рачуну и у имејлу поруџбине. Слике високог контраста најбоље се штампају на термо папиру. Превуците одељак Логотип да бисте га преместили.",
    sl: "Prikazano na vrhu računa za stranko — v predogledu, na natisnjenem računu in v e-pošti naročila. Slike z visokim kontrastom se najbolje natisnejo na termo papir. Povlecite razdelek Logotip, da ga prestavite.",
    et: "Kuvatakse kliendi kviitungi ülaosas — eelvaates, prinditud kviitungil ja tellimuse e-kirjas. Kõrge kontrastsusega pildid prindivad termopaberile kõige paremini. Logo jaotise liigutamiseks lohistage seda.",
    lv: "Tiek rādīts klienta čeka augšdaļā — priekšskatījumā, izdrukātajā čekā un pasūtījuma e-pastā. Augsta kontrasta attēli vislabāk drukājas uz termopapīra. Velciet sadaļu Logotips, lai to pārvietotu.",
    lt: "Rodomas kliento kvito viršuje — peržiūroje, atspausdintame kvite ir užsakymo el. laiške. Didelio kontrasto vaizdai geriausiai spausdinami ant terminio popieriaus. Vilkite logotipo skiltį, kad ją perkeltumėte.",
    tr: "Müşteri fişinin üstünde gösterilir — önizlemede, yazdırılan fişte ve sipariş e-postasında. Yüksek kontrastlı görseller termal kağıtta en iyi şekilde yazdırılır. Logo bölümünü taşımak için sürükleyin.",
    ru: "Отображается в верхней части чека клиента — в предпросмотре, на напечатанном чеке и в письме о заказе. Контрастные изображения лучше всего печатаются на термобумаге. Перетащите раздел «Логотип», чтобы изменить его положение.",
    uk: "Відображається у верхній частині чека клієнта — у попередньому перегляді, на надрукованому чеку та в листі замовлення. Контрастні зображення найкраще друкуються на термопапері. Перетягніть розділ «Логотип», щоб змінити його розташування.",
    ca: "Es mostra a la part superior del rebut del client — a la previsualització, al rebut imprès i al correu de la comanda. Les imatges d'alt contrast s'imprimeixen millor en paper tèrmic. Arrossega la secció Logotip per reubicar-la.",
    id: "Ditampilkan di bagian atas struk pelanggan — di pratinjau, pada struk cetak, dan di email pesanan. Gambar kontras tinggi paling baik dicetak di kertas termal. Seret bagian Logo untuk memindahkannya.",
    vi: "Hiển thị ở đầu hóa đơn của khách — trong bản xem trước, trên hóa đơn in và trong email đơn hàng. Hình ảnh tương phản cao in đẹp nhất trên giấy nhiệt. Kéo phần Logo để thay đổi vị trí.",
    th: "แสดงที่ด้านบนของใบเสร็จลูกค้า — ในตัวอย่าง บนใบเสร็จที่พิมพ์ และในอีเมลคำสั่งซื้อ ภาพคอนทราสต์สูงพิมพ์ได้ดีที่สุดบนกระดาษความร้อน ลากส่วนโลโก้เพื่อย้ายตำแหน่ง",
    zh: "显示在顾客小票顶部——预览、打印小票和订单邮件中均会显示。高对比度图片在热敏纸上打印效果最佳。拖动「标志」区块可调整位置。",
    ja: "お客様用レシートの上部に表示されます — プレビュー、印刷レシート、注文メールに反映されます。感熱紙にはコントラストの高い画像が最適です。ロゴセクションをドラッグして位置を変更できます。",
    ko: "고객 영수증 상단에 표시됩니다 — 미리보기, 인쇄된 영수증, 주문 이메일에 모두 반영됩니다. 고대비 이미지가 감열지에 가장 잘 인쇄됩니다. 로고 섹션을 드래그하여 위치를 옮길 수 있습니다.",
    ar: "يظهر أعلى إيصال العميل — في المعاينة وعلى الإيصال المطبوع وفي بريد الطلب الإلكتروني. الصور عالية التباين تُطبع بشكل أفضل على الورق الحراري. اسحب قسم الشعار لتغيير موضعه.",
    he: "מוצג בראש הקבלה של הלקוח — בתצוגה המקדימה, בקבלה המודפסת ובאימייל ההזמנה. תמונות בניגודיות גבוהה מודפסות הכי טוב על נייר תרמי. גרור את מקטע הלוגו כדי לשנות את מיקומו.",
    hi: "ग्राहक रसीद के शीर्ष पर दिखाया जाता है — पूर्वावलोकन में, मुद्रित रसीद पर और ऑर्डर ईमेल में। उच्च कंट्रास्ट वाली छवियां थर्मल पेपर पर सबसे अच्छी छपती हैं। लोगो अनुभाग को खींचकर उसकी स्थिति बदलें।",
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
console.log(`✓ receipt-logo strings (${Object.keys(KEYS).length} keys) added to ${n} locale(s).`);
