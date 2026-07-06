/** i18n × 38: whole-menu delete promo-guard confirm (Red-team 2026-07-06).
 *  admin.menus.deletePromoBlocked — shown when deleting a menu whose dishes/
 *  sizes back a live promotion. Mirrors admin.menuEditor.categoryInPromosMessage
 *  wording (already reviewed) but scoped to a menu + a trailing "Delete anyway?".
 *  Run: npx tsx scripts/i18n-add-menu-delete-promo.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.menus.deletePromoBlocked": {
    en: "This menu's dishes are used by these promotions: {names}. Deleting it may break them for your customers. Delete anyway?",
    fr: "Les plats de ce menu sont utilisés par ces promotions : {names}. Le supprimer peut les casser pour vos clients. Supprimer quand même ?",
    es: "Los platos de este menú se usan en estas promociones: {names}. Eliminarlo puede romperlas para tus clientes. ¿Eliminar de todos modos?",
    it: "I piatti di questo menu sono usati da queste promozioni: {names}. Eliminarlo può romperle per i tuoi clienti. Eliminare comunque?",
    pt: "Os pratos deste menu são usados por estas promoções: {names}. Eliminá-lo pode quebrá-las para os seus clientes. Eliminar mesmo assim?",
    "pt-BR": "Os pratos deste cardápio são usados por estas promoções: {names}. Excluí-lo pode quebrá-las para seus clientes. Excluir mesmo assim?",
    de: "Die Gerichte dieses Menüs werden von diesen Aktionen verwendet: {names}. Das Löschen kann sie für Ihre Kunden unbrauchbar machen. Trotzdem löschen?",
    nl: "De gerechten van dit menu worden gebruikt door deze promoties: {names}. Verwijderen kan ze voor uw klanten breken. Toch verwijderen?",
    ro: "Felurile din acest meniu sunt folosite de aceste promoții: {names}. Ștergerea lui le poate strica pentru clienți. Ștergeți oricum?",
    sv: "Rätterna i denna meny används av dessa kampanjer: {names}. Att ta bort den kan göra dem obrukbara för dina kunder. Ta bort ändå?",
    da: "Retterne i denne menu bruges af disse kampagner: {names}. Sletning kan ødelægge dem for dine kunder. Slet alligevel?",
    nb: "Rettene i denne menyen brukes av disse kampanjene: {names}. Sletting kan ødelegge dem for kundene dine. Slette likevel?",
    fi: "Tämän valikon annokset kuuluvat näihin kampanjoihin: {names}. Poistaminen voi rikkoa ne asiakkailtasi. Poistetaanko silti?",
    pl: "Dania z tego menu są używane przez te promocje: {names}. Usunięcie może je zepsuć dla klientów. Usunąć mimo to?",
    cs: "Jídla z tohoto menu používají tyto akce: {names}. Smazáním je můžete pro zákazníky rozbít. Přesto smazat?",
    sk: "Jedlá z tohto menu používajú tieto akcie: {names}. Vymazaním ich môžete pre zákazníkov pokaziť. Napriek tomu vymazať?",
    hu: "Ennek a menünek az ételeit a következő akciók használják: {names}. Törlése tönkreteheti azokat a vendégei számára. Mégis törli?",
    el: "Τα πιάτα αυτού του μενού χρησιμοποιούνται από αυτές τις προσφορές: {names}. Η διαγραφή του μπορεί να τις χαλάσει για τους πελάτες σας. Διαγραφή ούτως ή άλλως;",
    bg: "Ястията от това меню се използват от тези промоции: {names}. Изтриването му може да ги развали за клиентите ви. Да се изтрие ли въпреки това?",
    hr: "Jela iz ovog jelovnika koriste ove promocije: {names}. Brisanje ih može pokvariti za vaše kupce. Svejedno izbrisati?",
    sr: "Јела из овог менија користе ове промоције: {names}. Брисање их може покварити за ваше купце. Ипак избрисати?",
    sl: "Jedi tega menija uporabljajo te promocije: {names}. Izbris jih lahko pokvari za vaše stranke. Vseeno izbrišem?",
    et: "Selle menüü roogi kasutavad need kampaaniad: {names}. Kustutamine võib need klientide jaoks rikkuda. Kas kustutada ikkagi?",
    lv: "Šī ēdienkartes ēdienus izmanto šīs akcijas: {names}. Dzēšana var tās sabojāt jūsu klientiem. Vai tomēr dzēst?",
    lt: "Šio meniu patiekalai naudojami šiose akcijose: {names}. Ištrynus jas galite sugadinti klientams. Vis tiek ištrinti?",
    tr: "Bu menüdeki yemekler şu promosyonlarda kullanılıyor: {names}. Silmek bunları müşterileriniz için bozabilir. Yine de silinsin mi?",
    ru: "Блюда этого меню используются в акциях: {names}. Удаление может сломать их для ваших клиентов. Всё равно удалить?",
    uk: "Страви цього меню використовуються в цих акціях: {names}. Видалення може зламати їх для ваших клієнтів. Все одно видалити?",
    ca: "Els plats d'aquest menú s'usen en aquestes promocions: {names}. Eliminar-lo pot fer que deixin de funcionar per als teus clients. Eliminar igualment?",
    id: "Hidangan pada menu ini dipakai oleh promo berikut: {names}. Menghapusnya dapat merusak promo bagi pelanggan Anda. Tetap hapus?",
    vi: "Các món trong thực đơn này đang được dùng trong khuyến mãi: {names}. Xóa có thể làm hỏng khuyến mãi với khách hàng. Vẫn xóa?",
    th: "เมนูอาหารในชุดเมนูนี้ถูกใช้ในโปรโมชัน: {names} การลบอาจทำให้โปรโมชันใช้ไม่ได้สำหรับลูกค้า ยืนยันลบหรือไม่",
    zh: "此菜单中的菜品被以下促销使用：{names}。删除可能会导致这些促销对顾客失效。仍要删除吗？",
    ja: "このメニューの料理は次のプロモーションで使用されています：{names}。削除するとお客様向けに機能しなくなる可能性があります。それでも削除しますか？",
    ko: "이 메뉴의 요리가 다음 프로모션에서 사용됩니다: {names}. 삭제하면 고객에게 프로모션이 작동하지 않을 수 있습니다. 그래도 삭제할까요?",
    ar: "أطباق هذه القائمة مستخدمة في هذه العروض: {names}. حذفها قد يعطلها لعملائك. حذف على أي حال؟",
    he: "המנות בתפריט הזה בשימוש במבצעים: {names}. מחיקתו עלולה לשבור אותם עבור הלקוחות שלכם. למחוק בכל זאת?",
    hi: "इस मेन्यू के व्यंजन इन प्रोमोशन में उपयोग हो रहे हैं: {names}। इसे हटाने से ये आपके ग्राहकों के लिए टूट सकते हैं। फिर भी हटाएँ?",
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
console.log(`✓ menu delete-promo confirm added to ${n} locale(s).`);
