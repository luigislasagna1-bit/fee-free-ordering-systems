/** i18n × 38: order rejected because a cart item sold out after being added
 *  (Fabrizio 2026-07-04). {name} must survive.
 *  Run: npx tsx scripts/i18n-add-item-sold-out.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "ordering.toasts.itemSoldOutError": {
    en: "\"{name}\" just sold out — please remove it from your cart to continue.",
    fr: "« {name} » vient d'être épuisé — retirez-le de votre panier pour continuer.",
    es: "\"{name}\" se acaba de agotar; quítalo del carrito para continuar.",
    it: "\"{name}\" è appena andato esaurito — rimuovilo dal carrello per continuare.",
    pt: "\"{name}\" acabou de esgotar — remova-o do carrinho para continuar.",
    "pt-BR": "\"{name}\" acabou de esgotar — remova-o do carrinho para continuar.",
    de: "\"{name}\" ist gerade ausverkauft — bitte aus dem Warenkorb entfernen, um fortzufahren.",
    nl: "\"{name}\" is zojuist uitverkocht — verwijder het uit je winkelwagen om verder te gaan.",
    ro: "„{name}” tocmai s-a epuizat — eliminați-l din coș pentru a continua.",
    sv: "\"{name}\" är just slutsåld — ta bort den ur varukorgen för att fortsätta.",
    da: "\"{name}\" er netop udsolgt — fjern den fra kurven for at fortsætte.",
    nb: "\"{name}\" ble nettopp utsolgt — fjern den fra handlekurven for å fortsette.",
    fi: "\"{name}\" myytiin juuri loppuun — poista se ostoskorista jatkaaksesi.",
    pl: "„{name}” właśnie się wyprzedał — usuń go z koszyka, aby kontynuować.",
    cs: "„{name}“ se právě vyprodalo — odeberte jej z košíku a pokračujte.",
    sk: "„{name}“ sa práve vypredalo — odstráňte ho z košíka a pokračujte.",
    hu: "A(z) „{name}” épp elfogyott — a folytatáshoz távolítsa el a kosárból.",
    el: "Το «{name}» μόλις εξαντλήθηκε — αφαιρέστε το από το καλάθι για να συνεχίσετε.",
    bg: "„{name}“ току-що се изчерпа — премахнете го от количката, за да продължите.",
    hr: "\"{name}\" je upravo rasprodan — uklonite ga iz košarice za nastavak.",
    sr: "„{name}“ је управо распродат — уклоните га из корпе да наставите.",
    sl: "\"{name}\" je pravkar razprodan — odstranite ga iz košarice za nadaljevanje.",
    et: "\"{name}\" müüdi just läbi — jätkamiseks eemaldage see ostukorvist.",
    lv: "\"{name}\" tikko izpārdots — izņemiet to no groza, lai turpinātu.",
    lt: "„{name}“ ką tik išparduotas — pašalinkite jį iš krepšelio, kad tęstumėte.",
    tr: "\"{name}\" az önce tükendi — devam etmek için sepetinizden çıkarın.",
    ru: "«{name}» только что распродан — удалите его из корзины, чтобы продолжить.",
    uk: "«{name}» щойно розпродано — видаліть його з кошика, щоб продовжити.",
    ca: "\"{name}\" s'acaba d'esgotar — treu-lo del cistell per continuar.",
    id: "\"{name}\" baru saja habis — hapus dari keranjang untuk melanjutkan.",
    vi: "\"{name}\" vừa hết hàng — hãy xóa khỏi giỏ để tiếp tục.",
    th: "\"{name}\" เพิ่งขายหมด — โปรดนำออกจากตะกร้าเพื่อดำเนินการต่อ",
    zh: "“{name}”刚刚售罄——请从购物车中移除后继续。",
    ja: "「{name}」は売り切れました。続行するにはカートから削除してください。",
    ko: "\"{name}\"이(가) 방금 품절되었습니다 — 계속하려면 장바구니에서 제거하세요.",
    ar: "نفدت كمية \"{name}\" للتو — يُرجى إزالته من السلة للمتابعة.",
    he: "\"{name}\" אזל הרגע — הסירו אותו מהעגלה כדי להמשיך.",
    hi: "\"{name}\" अभी-अभी बिक गया — जारी रखने के लिए इसे कार्ट से हटाएँ।",
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
console.log(`✓ item-sold-out string added to ${n} locale(s).`);
