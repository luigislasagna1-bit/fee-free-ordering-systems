/** i18n × 38: admin.promoStepConfig.oncePerOrderHintPercent — explicit hint for
 *  what "Only allowed once per order" does to PERCENTAGE promos (discounts only
 *  the single most expensive qualifying item). Fabrizio cmqtmfp2n, 2026-07-02.
 *  Run: npx tsx scripts/i18n-add-once-per-order-percent-hint.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.promoStepConfig.oncePerOrderHintPercent": {
    en: "When checked, the % discount applies to ONE item only — the single most expensive qualifying item in the cart (e.g. “20% off one main course”). Leave unchecked to discount EVERY qualifying item.",
    fr: "Si coché, la remise en % ne s'applique qu'à UN seul article — le plus cher des articles éligibles du panier (ex. « 20 % sur un plat »). Décochez pour remiser TOUS les articles éligibles.",
    es: "Si está marcado, el descuento % se aplica solo a UN artículo — el más caro de los artículos elegibles del carrito (p. ej. «20% en un plato principal»). Desmárcalo para descontar TODOS los artículos elegibles.",
    it: "Se selezionato, lo sconto % si applica a UN solo articolo — il più caro tra quelli idonei nel carrello (es. “20% su un piatto”). Deseleziona per scontare TUTTI gli articoli idonei.",
    pt: "Se marcado, o desconto % aplica-se apenas a UM artigo — o mais caro dos artigos elegíveis no carrinho (ex. «20% num prato principal»). Desmarque para descontar TODOS os artigos elegíveis.",
    "pt-BR": "Se marcado, o desconto % vale para UM item apenas — o mais caro entre os itens elegíveis do carrinho (ex. “20% em um prato principal”). Desmarque para descontar TODOS os itens elegíveis.",
    de: "Wenn aktiviert, gilt der %-Rabatt nur für EINEN Artikel — den teuersten qualifizierten Artikel im Warenkorb (z. B. „20 % auf ein Hauptgericht“). Deaktivieren, um JEDEN qualifizierten Artikel zu rabattieren.",
    nl: "Indien aangevinkt geldt de %-korting voor slechts ÉÉN item — het duurste in aanmerking komende item in de winkelwagen (bijv. “20% op één hoofdgerecht”). Vink uit om ALLE in aanmerking komende items te korten.",
    ro: "Dacă este bifat, reducerea % se aplică unui SINGUR articol — cel mai scump articol eligibil din coș (ex. „20% la un fel principal”). Debifați pentru a reduce TOATE articolele eligibile.",
    sv: "Om ikryssad gäller %-rabatten endast ETT objekt — den dyraste kvalificerade varan i varukorgen (t.ex. ”20 % på en huvudrätt”). Avmarkera för att rabattera ALLA kvalificerade varor.",
    da: "Hvis markeret, gælder %-rabatten kun for ÉN vare — den dyreste kvalificerede vare i kurven (f.eks. ”20 % på én hovedret”). Fjern markeringen for at give rabat på ALLE kvalificerede varer.",
    nb: "Når avkrysset gjelder %-rabatten kun ÉN vare — den dyreste kvalifiserte varen i handlekurven (f.eks. ”20 % på én hovedrett”). Fjern avkrysningen for å rabattere ALLE kvalifiserte varer.",
    fi: "Kun valittu, %-alennus koskee vain YHTÄ tuotetta — ostoskorin kalleinta alennukseen oikeutettua tuotetta (esim. ”20 % yhdestä pääruoasta”). Poista valinta, jos haluat alentaa KAIKKI oikeutetut tuotteet.",
    pl: "Gdy zaznaczone, zniżka % dotyczy tylko JEDNEGO produktu — najdroższego kwalifikującego się w koszyku (np. „20% na jedno danie główne”). Odznacz, aby przecenić WSZYSTKIE kwalifikujące się produkty.",
    cs: "Je-li zaškrtnuto, % sleva platí jen pro JEDNU položku — nejdražší kvalifikovanou položku v košíku (např. „20 % na jedno hlavní jídlo“). Zrušte zaškrtnutí pro slevu na VŠECHNY kvalifikované položky.",
    sk: "Ak je začiarknuté, % zľava platí len pre JEDNU položku — najdrahšiu kvalifikovanú položku v košíku (napr. „20 % na jedno hlavné jedlo“). Zrušte začiarknutie pre zľavu na VŠETKY kvalifikované položky.",
    hu: "Ha be van jelölve, a %-os kedvezmény csak EGY tételre vonatkozik — a kosár legdrágább jogosult tételére (pl. „20% egy főételre”). Vegye ki a pipát, hogy MINDEN jogosult tétel kedvezményt kapjon.",
    el: "Αν επιλεγεί, η έκπτωση % ισχύει μόνο για ΕΝΑ είδος — το ακριβότερο επιλέξιμο είδος στο καλάθι (π.χ. «20% σε ένα κυρίως πιάτο»). Αποεπιλέξτε για έκπτωση σε ΟΛΑ τα επιλέξιμα είδη.",
    bg: "Ако е отметнато, % отстъпката важи само за ЕДИН артикул — най-скъпия отговарящ артикул в количката (напр. „20% за едно основно ястие“). Премахнете отметката, за да намалите ВСИЧКИ отговарящи артикули.",
    hr: "Ako je označeno, % popust vrijedi samo za JEDNU stavku — najskuplju kvalificiranu stavku u košarici (npr. „20 % na jedno glavno jelo“). Odznačite za popust na SVE kvalificirane stavke.",
    sr: "Ако је означено, % попуст важи само за ЈЕДНУ ставку — најскупљу квалификовану ставку у корпи (нпр. „20% на једно главно јело“). Уклоните ознаку за попуст на СВЕ квалификоване ставке.",
    sl: "Če je označeno, % popust velja samo za EN izdelek — najdražji ustrezen izdelek v košarici (npr. „20 % na eno glavno jed“). Odznačite za popust na VSE ustrezne izdelke.",
    et: "Kui märgitud, kehtib % allahindlus ainult ÜHELE tootele — ostukorvi kalleimale sobivale tootele (nt „20% ühelt pearoalt”). Eemaldage märge, et alandada KÕIKI sobivaid tooteid.",
    lv: "Ja atzīmēts, % atlaide attiecas tikai uz VIENU preci — dārgāko atbilstošo preci grozā (piem., „20 % vienam pamatēdienam”). Noņemiet atzīmi, lai atlaidi piemērotu VISĀM atbilstošajām precēm.",
    lt: "Jei pažymėta, % nuolaida taikoma tik VIENAI prekei — brangiausiai tinkamai prekei krepšelyje (pvz., „20 % vienam pagrindiniam patiekalui“). Nuimkite žymę, kad nuolaida būtų taikoma VISOMS tinkamoms prekėms.",
    tr: "İşaretliyse % indirim yalnızca TEK bir ürüne uygulanır — sepetteki en pahalı uygun ürüne (ör. “bir ana yemekte %20”). Tüm uygun ürünleri indirmek için işareti kaldırın.",
    ru: "Если отмечено, скидка % применяется только к ОДНОМУ товару — самому дорогому подходящему товару в корзине (например, «20% на одно основное блюдо»). Снимите отметку, чтобы скидка действовала на ВСЕ подходящие товары.",
    uk: "Якщо позначено, знижка % застосовується лише до ОДНОГО товару — найдорожчого відповідного товару в кошику (напр., «20% на одну основну страву»). Зніміть позначку, щоб знижка діяла на ВСІ відповідні товари.",
    ca: "Si està marcat, el descompte % s'aplica només a UN article — el més car dels articles elegibles del cistell (p. ex. «20% en un plat principal»). Desmarca-ho per descomptar TOTS els articles elegibles.",
    id: "Jika dicentang, diskon % hanya berlaku untuk SATU item — item memenuhi syarat termahal di keranjang (mis. “diskon 20% untuk satu hidangan utama”). Hapus centang untuk mendiskon SEMUA item yang memenuhi syarat.",
    vi: "Khi được chọn, giảm giá % chỉ áp dụng cho MỘT món — món đủ điều kiện đắt nhất trong giỏ (vd. “giảm 20% một món chính”). Bỏ chọn để giảm giá TẤT CẢ các món đủ điều kiện.",
    th: "เมื่อเลือก ส่วนลด % จะใช้กับสินค้าเพียงชิ้นเดียว — ชิ้นที่เข้าเงื่อนไขที่แพงที่สุดในตะกร้า (เช่น “ลด 20% สำหรับอาหารจานหลักหนึ่งจาน”) เอาเครื่องหมายออกเพื่อลดราคาสินค้าที่เข้าเงื่อนไขทุกชิ้น",
    zh: "勾选后，百分比折扣仅适用于一件商品——购物车中符合条件的最贵商品（例如“一份主菜八折”）。取消勾选则对所有符合条件的商品打折。",
    ja: "チェックすると、％割引はカート内で対象となる最も高い1品のみに適用されます（例：“メイン1品20%オフ”）。チェックを外すと対象商品すべてが割引されます。",
    ko: "선택하면 % 할인이 단 한 개 항목에만 적용됩니다 — 장바구니에서 가장 비싼 대상 항목(예: “메인 요리 1개 20% 할인”). 모든 대상 항목을 할인하려면 선택을 해제하세요.",
    ar: "عند التحديد، ينطبق خصم النسبة على عنصر واحد فقط — أغلى عنصر مؤهل في السلة (مثل “خصم 20% على طبق رئيسي واحد”). ألغِ التحديد لخصم جميع العناصر المؤهلة.",
    he: "כאשר מסומן, הנחת ה-% חלה על פריט אחד בלבד — הפריט הזכאי היקר ביותר בעגלה (למשל “20% הנחה על מנה עיקרית אחת”). בטלו את הסימון כדי להנחות את כל הפריטים הזכאים.",
    hi: "चेक करने पर % छूट केवल एक वस्तु पर लागू होती है — कार्ट की सबसे महँगी पात्र वस्तु पर (जैसे “एक मुख्य व्यंजन पर 20% छूट”)। सभी पात्र वस्तुओं पर छूट के लिए अनचेक करें।",
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
console.log(`✓ oncePerOrderHintPercent added to ${n} locale(s).`);
