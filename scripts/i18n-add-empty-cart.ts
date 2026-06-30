/** i18n × 38 for the Empty Cart button (cart drawer + checkout). Luigi 2026-06-30.
 *  Run: npx tsx scripts/i18n-add-empty-cart.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "ordering.emptyCart": {
    en: "Empty cart", fr: "Vider le panier", es: "Vaciar carrito", it: "Svuota carrello",
    pt: "Esvaziar carrinho", "pt-BR": "Esvaziar carrinho", de: "Warenkorb leeren", nl: "Winkelwagen legen",
    ro: "Golește coșul", sv: "Töm varukorgen", da: "Tøm kurv", nb: "Tøm handlekurv",
    fi: "Tyhjennä ostoskori", pl: "Opróżnij koszyk", cs: "Vyprázdnit košík", sk: "Vyprázdniť košík",
    hu: "Kosár ürítése", el: "Άδειασμα καλαθιού", bg: "Изпразни количката", hr: "Isprazni košaricu",
    sr: "Испразни корпу", sl: "Izprazni košarico", et: "Tühjenda ostukorv", lv: "Iztukšot grozu",
    lt: "Išvalyti krepšelį", tr: "Sepeti boşalt", ru: "Очистить корзину", uk: "Очистити кошик",
    ca: "Buida el cistell", id: "Kosongkan keranjang", vi: "Xóa giỏ hàng", th: "ล้างตะกร้า",
    zh: "清空购物车", ja: "カートを空にする", ko: "장바구니 비우기", ar: "إفراغ السلة",
    he: "רוקן עגלה", hi: "कार्ट खाली करें",
  },
  "ordering.emptyCartConfirm": {
    en: "Remove all items from your cart?",
    fr: "Retirer tous les articles de votre panier ?", es: "¿Eliminar todos los artículos de tu carrito?", it: "Rimuovere tutti gli articoli dal carrello?",
    pt: "Remover todos os artigos do seu carrinho?", "pt-BR": "Remover todos os itens do seu carrinho?", de: "Alle Artikel aus dem Warenkorb entfernen?", nl: "Alle items uit je winkelwagen verwijderen?",
    ro: "Eliminați toate articolele din coș?", sv: "Ta bort alla varor från varukorgen?", da: "Fjern alle varer fra din kurv?", nb: "Fjerne alle varer fra handlekurven?",
    fi: "Poistetaanko kaikki tuotteet ostoskorista?", pl: "Usunąć wszystkie produkty z koszyka?", cs: "Odebrat všechny položky z košíku?", sk: "Odstrániť všetky položky z košíka?",
    hu: "Eltávolítja az összes terméket a kosárból?", el: "Να αφαιρεθούν όλα τα είδη από το καλάθι σας;", bg: "Да премахнете всички артикули от количката?", hr: "Ukloniti sve stavke iz košarice?",
    sr: "Уклонити све ставке из корпе?", sl: "Odstranim vse izdelke iz košarice?", et: "Eemaldada kõik tooted ostukorvist?", lv: "Noņemt visas preces no groza?",
    lt: "Pašalinti visas prekes iš krepšelio?", tr: "Sepetinizdeki tüm ürünler kaldırılsın mı?", ru: "Удалить все товары из корзины?", uk: "Вилучити всі товари з кошика?",
    ca: "Vols treure tots els articles del cistell?", id: "Hapus semua item dari keranjang Anda?", vi: "Xóa tất cả mặt hàng khỏi giỏ hàng?", th: "นำสินค้าทั้งหมดออกจากตะกร้าหรือไม่?",
    zh: "从购物车中移除所有商品？", ja: "カート内のすべての商品を削除しますか？", ko: "장바구니의 모든 항목을 삭제할까요?", ar: "إزالة جميع العناصر من سلتك؟",
    he: "להסיר את כל הפריטים מהעגלה?", hi: "अपने कार्ट से सभी आइटम हटाएँ?",
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
console.log(`✓ empty-cart strings added to ${n} locale(s).`);
