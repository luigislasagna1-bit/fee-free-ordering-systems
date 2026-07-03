/** i18n × 38: promo-screen escape hatches + wizard leave-guard (Luigi
 *  2026-07-03). Run: npx tsx scripts/i18n-add-promo-escape.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "customer.promoDetail.seeFullMenu": {
    en: "See full menu", fr: "Voir tout le menu", es: "Ver todo el menú", it: "Vedi tutto il menu", pt: "Ver o menu completo", "pt-BR": "Ver o cardápio completo", de: "Ganze Speisekarte ansehen", nl: "Volledig menu bekijken",
    ro: "Vezi tot meniul", sv: "Se hela menyn", da: "Se hele menuen", nb: "Se hele menyen", fi: "Näytä koko menu", pl: "Zobacz całe menu", cs: "Zobrazit celé menu", sk: "Zobraziť celé menu",
    hu: "Teljes étlap megtekintése", el: "Δείτε όλο το μενού", bg: "Виж цялото меню", hr: "Pogledaj cijeli jelovnik", sr: "Погледај цео јеловник", sl: "Ogled celotnega menija", et: "Vaata kogu menüüd", lv: "Skatīt visu ēdienkarti",
    lt: "Žiūrėti visą meniu", tr: "Tüm menüyü gör", ru: "Смотреть всё меню", uk: "Переглянути все меню", ca: "Veure tot el menú", id: "Lihat menu lengkap", vi: "Xem toàn bộ thực đơn", th: "ดูเมนูทั้งหมด",
    zh: "查看完整菜单", ja: "メニュー全体を見る", ko: "전체 메뉴 보기", ar: "عرض القائمة كاملة", he: "לתפריט המלא", hi: "पूरा मेनू देखें",
  },
  "customer.promoDetail.goToCart": {
    en: "Go to cart", fr: "Voir le panier", es: "Ir al carrito", it: "Vai al carrello", pt: "Ir para o carrinho", "pt-BR": "Ir para o carrinho", de: "Zum Warenkorb", nl: "Naar winkelwagen",
    ro: "Mergi la coș", sv: "Till varukorgen", da: "Gå til kurv", nb: "Gå til handlekurv", fi: "Siirry ostoskoriin", pl: "Przejdź do koszyka", cs: "Přejít do košíku", sk: "Prejsť do košíka",
    hu: "Ugrás a kosárhoz", el: "Μετάβαση στο καλάθι", bg: "Към количката", hr: "Idi na košaricu", sr: "Иди у корпу", sl: "Pojdi v košarico", et: "Mine ostukorvi", lv: "Uz grozu",
    lt: "Į krepšelį", tr: "Sepete git", ru: "Перейти в корзину", uk: "Перейти до кошика", ca: "Vés al cistell", id: "Ke keranjang", vi: "Đến giỏ hàng", th: "ไปที่ตะกร้า",
    zh: "前往购物车", ja: "カートへ", ko: "장바구니로", ar: "اذهب إلى السلة", he: "לעגלה", hi: "कार्ट पर जाएँ",
  },
  "customer.guidedPromo.leaveTitle": {
    en: "Leave this deal unfinished?", fr: "Quitter sans terminer cette offre ?", es: "¿Salir sin terminar esta oferta?", it: "Uscire senza completare l'offerta?", pt: "Sair sem terminar esta oferta?", "pt-BR": "Sair sem terminar esta oferta?", de: "Deal unvollendet verlassen?", nl: "Deze deal onafgemaakt verlaten?",
    ro: "Părăsiți oferta neterminată?", sv: "Lämna erbjudandet ofullbordat?", da: "Forlade tilbuddet ufærdigt?", nb: "Forlate tilbudet uferdig?", fi: "Poistutko kesken tarjouksen?", pl: "Opuścić niedokończoną ofertę?", cs: "Odejít bez dokončení nabídky?", sk: "Odísť bez dokončenia ponuky?",
    hu: "Befejezetlenül hagyja az ajánlatot?", el: "Θέλετε να φύγετε χωρίς να ολοκληρώσετε;", bg: "Напускате незавършената оферта?", hr: "Napustiti nedovršenu ponudu?", sr: "Напустити недовршену понуду?", sl: "Zapustiti nedokončano ponudbo?", et: "Kas lahkud pooleli pakkumisest?", lv: "Pamest nepabeigtu piedāvājumu?",
    lt: "Palikti nebaigtą pasiūlymą?", tr: "Fırsatı yarım mı bırakıyorsunuz?", ru: "Уйти, не завершив предложение?", uk: "Залишити пропозицію незавершеною?", ca: "Sortir sense acabar l'oferta?", id: "Tinggalkan penawaran yang belum selesai?", vi: "Rời đi khi chưa hoàn tất ưu đãi?", th: "ออกทั้งที่ยังทำดีลไม่เสร็จ?",
    zh: "要放弃未完成的优惠吗？", ja: "このお得なセットを途中でやめますか？", ko: "완료하지 않고 나가시겠어요?", ar: "مغادرة العرض دون إكماله؟", he: "לצאת בלי לסיים את המבצע?", hi: "क्या ऑफ़र अधूरा छोड़कर जाएँ?",
  },
  "customer.guidedPromo.keepBuilding": {
    en: "Keep building", fr: "Continuer", es: "Seguir", it: "Continua", pt: "Continuar", "pt-BR": "Continuar", de: "Weitermachen", nl: "Doorgaan",
    ro: "Continuă", sv: "Fortsätt", da: "Fortsæt", nb: "Fortsett", fi: "Jatka", pl: "Kontynuuj", cs: "Pokračovat", sk: "Pokračovať",
    hu: "Folytatás", el: "Συνέχεια", bg: "Продължи", hr: "Nastavi", sr: "Настави", sl: "Nadaljuj", et: "Jätka", lv: "Turpināt",
    lt: "Tęsti", tr: "Devam et", ru: "Продолжить", uk: "Продовжити", ca: "Continua", id: "Lanjutkan", vi: "Tiếp tục", th: "ทำต่อ",
    zh: "继续选择", ja: "続ける", ko: "계속하기", ar: "متابعة", he: "להמשיך", hi: "जारी रखें",
  },
  "customer.guidedPromo.leaveAnyway": {
    en: "Leave", fr: "Quitter", es: "Salir", it: "Esci", pt: "Sair", "pt-BR": "Sair", de: "Verlassen", nl: "Verlaten",
    ro: "Ieși", sv: "Lämna", da: "Forlad", nb: "Forlat", fi: "Poistu", pl: "Wyjdź", cs: "Odejít", sk: "Odísť",
    hu: "Kilépés", el: "Έξοδος", bg: "Напусни", hr: "Izađi", sr: "Изађи", sl: "Zapusti", et: "Lahku", lv: "Iziet",
    lt: "Išeiti", tr: "Ayrıl", ru: "Уйти", uk: "Вийти", ca: "Surt", id: "Keluar", vi: "Rời đi", th: "ออก",
    zh: "离开", ja: "やめる", ko: "나가기", ar: "مغادرة", he: "לצאת", hi: "छोड़ें",
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
console.log(`✓ Promo escape/leave-guard strings added to ${n} locale(s).`);
