/** i18n × 38: honest "code valid but discounts nothing on this cart" toast
 *  (Luigi 2026-07-03 — silent Apply flash on a gift-card-only cart). {code}
 *  placeholder must survive. Run: npx tsx scripts/i18n-add-coupon-no-effect.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "ordering.toasts.couponNoEffect": {
    en: "{code} is valid, but it doesn't discount anything in your cart right now — some items (like gift cards) may be excluded, or a minimum may not be met.",
    fr: "{code} est valide, mais il ne réduit rien dans votre panier pour le moment — certains articles (comme les cartes cadeaux) peuvent être exclus, ou un minimum n'est pas atteint.",
    es: "{code} es válido, pero ahora mismo no descuenta nada en tu carrito — algunos artículos (como las tarjetas regalo) pueden estar excluidos o no se alcanza el mínimo.",
    it: "{code} è valido, ma al momento non sconta nulla nel tuo carrello — alcuni articoli (come le carte regalo) potrebbero essere esclusi, o non è stato raggiunto un minimo.",
    pt: "{code} é válido, mas de momento não desconta nada no seu carrinho — alguns artigos (como cartões-presente) podem estar excluídos, ou o mínimo não foi atingido.",
    "pt-BR": "{code} é válido, mas no momento não desconta nada no seu carrinho — alguns itens (como vales-presente) podem estar excluídos, ou o mínimo não foi atingido.",
    de: "{code} ist gültig, reduziert aber gerade nichts in Ihrem Warenkorb — manche Artikel (z. B. Geschenkkarten) sind ggf. ausgeschlossen oder ein Mindestbetrag ist nicht erreicht.",
    nl: "{code} is geldig, maar geeft nu geen korting op je winkelwagen — sommige artikelen (zoals cadeaubonnen) kunnen uitgesloten zijn, of een minimum is niet bereikt.",
    ro: "{code} este valid, dar momentan nu reduce nimic din coșul tău — unele articole (precum cardurile cadou) pot fi excluse, sau nu s-a atins un minim.",
    sv: "{code} är giltig men ger just nu ingen rabatt i din varukorg — vissa varor (som presentkort) kan vara undantagna, eller så uppnås inte ett minimibelopp.",
    da: "{code} er gyldig, men giver lige nu ingen rabat i din kurv — nogle varer (som gavekort) kan være undtaget, eller et minimum er ikke nået.",
    nb: "{code} er gyldig, men gir akkurat nå ingen rabatt i handlekurven — noen varer (som gavekort) kan være unntatt, eller et minimum er ikke nådd.",
    fi: "{code} on voimassa, mutta se ei juuri nyt alenna mitään ostoskorissasi — jotkin tuotteet (kuten lahjakortit) voivat olla poissuljettuja tai vähimmäissumma ei täyty.",
    pl: "{code} jest prawidłowy, ale w tej chwili nic nie obniża w Twoim koszyku — niektóre pozycje (np. karty podarunkowe) mogą być wyłączone lub nie osiągnięto minimum.",
    cs: "{code} je platný, ale právě teď ve vašem košíku nic nezlevňuje — některé položky (např. dárkové karty) mohou být vyloučené, nebo není splněno minimum.",
    sk: "{code} je platný, ale momentálne vo vašom košíku nič nezľavňuje — niektoré položky (napr. darčekové karty) môžu byť vylúčené, alebo nie je splnené minimum.",
    hu: "{code} érvényes, de jelenleg semmit sem kedvezményez a kosarában — egyes tételek (pl. ajándékkártyák) kizártak lehetnek, vagy nincs meg a minimum.",
    el: "{code} είναι έγκυρος, αλλά αυτή τη στιγμή δεν εκπίπτει τίποτα στο καλάθι σας — ορισμένα είδη (όπως οι δωροκάρτες) μπορεί να εξαιρούνται, ή δεν έχει καλυφθεί το ελάχιστο.",
    bg: "{code} е валиден, но в момента не намалява нищо в количката ви — някои артикули (като подаръчните карти) може да са изключени или не е достигнат минимум.",
    hr: "{code} je valjan, ali trenutačno ne snižava ništa u vašoj košarici — neki artikli (poput poklon-kartica) mogu biti isključeni ili minimum nije dosegnut.",
    sr: "{code} је важећи, али тренутно не снижава ништа у вашој корпи — неки артикли (попут поклон картица) могу бити искључени или минимум није достигнут.",
    sl: "{code} je veljaven, a trenutno ne zniža ničesar v vaši košarici — nekateri artikli (npr. darilne kartice) so lahko izključeni ali minimum ni dosežen.",
    et: "{code} on kehtiv, kuid praegu ei alanda see teie ostukorvis midagi — mõned tooted (nt kinkekaardid) võivad olla välistatud või miinimum pole täidetud.",
    lv: "{code} ir derīgs, taču šobrīd tas neko nesamazina jūsu grozā — daži produkti (piemēram, dāvanu kartes) var būt izslēgti vai nav sasniegts minimums.",
    lt: "{code} galioja, bet šiuo metu jūsų krepšelyje nieko nenupigina — kai kurios prekės (pvz., dovanų kortelės) gali būti neįtrauktos arba nepasiektas minimumas.",
    tr: "{code} geçerli, ancak şu anda sepetinizde hiçbir şeyi indirmiyor — bazı ürünler (hediye kartları gibi) hariç olabilir veya minimum tutara ulaşılmamış olabilir.",
    ru: "{code} действителен, но сейчас ничего не уменьшает в вашей корзине — некоторые товары (например, подарочные карты) могут быть исключены, или не достигнут минимум.",
    uk: "{code} дійсний, але зараз нічого не знижує у вашому кошику — деякі товари (наприклад, подарункові картки) можуть бути виключені, або не досягнуто мінімуму.",
    ca: "{code} és vàlid, però ara mateix no descompta res al teu cistell — alguns articles (com les targetes regal) poden estar exclosos, o no s'arriba al mínim.",
    id: "{code} valid, tetapi saat ini tidak memotong apa pun di keranjang Anda — beberapa item (seperti kartu hadiah) mungkin dikecualikan, atau minimum belum tercapai.",
    vi: "{code} hợp lệ nhưng hiện không giảm giá mục nào trong giỏ hàng — một số món (như thẻ quà tặng) có thể bị loại trừ, hoặc chưa đạt mức tối thiểu.",
    th: "{code} ใช้ได้ แต่ตอนนี้ไม่ได้ลดราคาสิ่งใดในตะกร้าของคุณ — สินค้าบางรายการ (เช่น บัตรของขวัญ) อาจถูกยกเว้น หรือยังไม่ถึงยอดขั้นต่ำ",
    zh: "{code} 有效，但目前不会为您的购物车带来任何折扣——某些商品（如礼品卡）可能被排除，或未达到最低消费。",
    ja: "{code} は有効ですが、現在カート内で割引されるものがありません — 一部の商品（ギフトカードなど）が対象外か、最低金額に達していない可能性があります。",
    ko: "{code}은(는) 유효하지만 지금 장바구니에서 할인되는 항목이 없습니다 — 일부 상품(기프트 카드 등)이 제외되었거나 최소 금액이 충족되지 않았을 수 있습니다.",
    ar: "{code} صالح، لكنه لا يخصم شيئًا من سلتك حاليًا — قد تكون بعض العناصر (مثل بطاقات الهدايا) مستثناة، أو لم يتم بلوغ الحد الأدنى.",
    he: "{code} תקף, אבל כרגע הוא לא מוזיל דבר בסל שלכם — ייתכן שחלק מהפריטים (כמו כרטיסי מתנה) מוחרגים, או שלא הגעתם למינימום.",
    hi: "{code} मान्य है, लेकिन अभी आपकी कार्ट में किसी चीज़ पर छूट नहीं देता — कुछ आइटम (जैसे गिफ़्ट कार्ड) बाहर रखे जा सकते हैं, या न्यूनतम राशि पूरी नहीं हुई है।",
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
console.log(`✓ couponNoEffect string added to ${n} locale(s).`);
