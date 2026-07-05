/** i18n × 38: toast shown when a RESTORED cart line is auto-removed because
 *  the item sold out since the customer's last visit (Luigi 2026-07-05 —
 *  follow-up to the sold-out bypass fix; pruning up-front beats erroring at
 *  checkout). Run: npx tsx scripts/i18n-add-soldout-removed-toast.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "ordering.toasts.itemSoldOutRemoved": {
    en: "\"{name}\" sold out while you were away — we removed it from your cart.",
    fr: "« {name} » est en rupture depuis votre dernière visite — nous l'avons retiré de votre panier.",
    es: "\"{name}\" se agotó desde tu última visita — lo hemos quitado de tu carrito.",
    it: "\"{name}\" è andato esaurito dalla tua ultima visita — l'abbiamo rimosso dal carrello.",
    pt: "\"{name}\" esgotou desde a sua última visita — retirámo-lo do seu carrinho.",
    "pt-BR": "\"{name}\" esgotou desde a sua última visita — removemos do seu carrinho.",
    de: "\"{name}\" ist seit deinem letzten Besuch ausverkauft — wir haben es aus deinem Warenkorb entfernt.",
    nl: "\"{name}\" is sinds je vorige bezoek uitverkocht — we hebben het uit je winkelwagen verwijderd.",
    ro: "\"{name}\" s-a epuizat de la ultima ta vizită — l-am scos din coșul tău.",
    sv: "\"{name}\" tog slut sedan ditt senaste besök — vi har tagit bort den ur din varukorg.",
    da: "\"{name}\" blev udsolgt siden dit sidste besøg — vi har fjernet den fra din kurv.",
    nb: "\"{name}\" ble utsolgt siden sist du var her — vi har fjernet den fra handlekurven din.",
    fi: "\"{name}\" myytiin loppuun edellisen käyntisi jälkeen — poistimme sen ostoskoristasi.",
    pl: "\"{name}\" wyprzedało się od Twojej ostatniej wizyty — usunęliśmy tę pozycję z koszyka.",
    cs: "\"{name}\" se od vaší poslední návštěvy vyprodalo — odebrali jsme ho z košíku.",
    sk: "\"{name}\" sa od vašej poslednej návštevy vypredalo — odstránili sme ho z košíka.",
    hu: "A(z) \"{name}\" elfogyott a legutóbbi látogatásod óta — eltávolítottuk a kosaradból.",
    el: "Το \"{name}\" εξαντλήθηκε από την τελευταία σας επίσκεψη — το αφαιρέσαμε από το καλάθι σας.",
    bg: "\"{name}\" се изчерпа след последното ви посещение — премахнахме го от количката ви.",
    hr: "\"{name}\" je rasprodan od vašeg zadnjeg posjeta — uklonili smo ga iz vaše košarice.",
    sr: "\"{name}\" је распродат од ваше последње посете — уклонили смо га из ваше корпе.",
    sl: "\"{name}\" je razprodan od vašega zadnjega obiska — odstranili smo ga iz vaše košarice.",
    et: "\"{name}\" müüdi pärast teie viimast külastust läbi — eemaldasime selle teie ostukorvist.",
    lv: "\"{name}\" ir izpārdots kopš jūsu pēdējā apmeklējuma — mēs to izņēmām no jūsu groza.",
    lt: "\"{name}\" išparduota nuo paskutinio jūsų apsilankymo — pašalinome ją iš jūsų krepšelio.",
    tr: "\"{name}\" son ziyaretinizden bu yana tükendi — sepetinizden kaldırdık.",
    ru: "\"{name}\" распродано с вашего последнего визита — мы убрали его из вашей корзины.",
    uk: "\"{name}\" розпродано з часу вашого останнього візиту — ми прибрали його з вашого кошика.",
    ca: "\"{name}\" s'ha esgotat des de la teva darrera visita — l'hem tret del teu cistell.",
    id: "\"{name}\" habis terjual sejak kunjungan terakhir Anda — kami menghapusnya dari keranjang Anda.",
    vi: "\"{name}\" đã hết hàng kể từ lần ghé trước của bạn — chúng tôi đã xóa món này khỏi giỏ hàng.",
    th: "\"{name}\" ขายหมดตั้งแต่คุณมาครั้งล่าสุด — เราได้นำออกจากตะกร้าของคุณแล้ว",
    zh: "“{name}”在您上次访问后已售罄——我们已将其从您的购物车中移除。",
    ja: "「{name}」は前回のご利用後に売り切れました。カートから削除しました。",
    ko: "\"{name}\"이(가) 지난 방문 이후 품절되어 장바구니에서 제거했습니다.",
    ar: "نفدت كمية \"{name}\" منذ زيارتك الأخيرة — قمنا بإزالته من سلتك.",
    he: "\"{name}\" אזל מהמלאי מאז הביקור האחרון שלך — הסרנו אותו מהעגלה שלך.",
    hi: "\"{name}\" आपकी पिछली विज़िट के बाद बिक गया — हमने इसे आपकी कार्ट से हटा दिया है।",
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
console.log(`✓ sold-out-removed toast added to ${n} locale(s).`);
