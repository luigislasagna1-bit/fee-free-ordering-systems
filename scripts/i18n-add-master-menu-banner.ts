/** i18n: master-menu inheritance banner × 38 locales (Luigi 2026-06-11 — was
 *  hardcoded English on the brand-parent menu page).
 *    admin.menuEditor.masterMenuTitle ({inheriting}, {total})
 *    admin.menuEditor.masterMenuBody
 *    npx tsx scripts/i18n-add-master-menu-banner.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.menuEditor.masterMenuTitle": {
    en: "Master menu — {inheriting} of {total} locations inherit this menu",
    fr: "Menu principal — {inheriting} sur {total} établissements héritent de ce menu",
    es: "Menú maestro — {inheriting} de {total} ubicaciones heredan este menú",
    it: "Menu principale — {inheriting} di {total} sedi ereditano questo menu",
    pt: "Menu principal — {inheriting} de {total} locais herdam este menu",
    "pt-BR": "Cardápio mestre — {inheriting} de {total} locais herdam este cardápio",
    de: "Hauptmenü — {inheriting} von {total} Standorten erben dieses Menü",
    nl: "Hoofdmenu — {inheriting} van {total} locaties erven dit menu",
    ro: "Meniu principal — {inheriting} din {total} locații moștenesc acest meniu",
    sv: "Huvudmeny — {inheriting} av {total} platser ärver den här menyn",
    da: "Hovedmenu — {inheriting} af {total} placeringer arver denne menu",
    nb: "Hovedmeny — {inheriting} av {total} steder arver denne menyen",
    fi: "Päävalikko — {inheriting}/{total} toimipaikkaa perii tämän valikon",
    pl: "Menu główne — {inheriting} z {total} lokalizacji dziedziczy to menu",
    cs: "Hlavní menu — {inheriting} z {total} poboček dědí toto menu",
    sk: "Hlavné menu — {inheriting} z {total} pobočiek dedí toto menu",
    hu: "Fő étlap — {total} helyszínből {inheriting} örökli ezt az étlapot",
    el: "Κύριο μενού — {inheriting} από {total} τοποθεσίες κληρονομούν αυτό το μενού",
    bg: "Основно меню — {inheriting} от {total} обекта наследяват това меню",
    hr: "Glavni izbornik — {inheriting} od {total} lokacija nasljeđuje ovaj izbornik",
    sr: "Главни мени — {inheriting} од {total} локација наслеђује овај мени",
    sl: "Glavni meni — {inheriting} od {total} lokacij podeduje ta meni",
    et: "Põhimenüü — {total}-st asukohast {inheriting} pärib selle menüü",
    lv: "Galvenā ēdienkarte — {inheriting} no {total} vietām manto šo ēdienkarti",
    lt: "Pagrindinis meniu — {inheriting} iš {total} vietų paveldi šį meniu",
    tr: "Ana menü — {total} konumdan {inheriting} tanesi bu menüyü devralıyor",
    ru: "Основное меню — {inheriting} из {total} заведений наследуют это меню",
    uk: "Головне меню — {inheriting} з {total} закладів успадковують це меню",
    ca: "Menú mestre — {inheriting} de {total} ubicacions hereten aquest menú",
    id: "Menu utama — {inheriting} dari {total} lokasi mewarisi menu ini",
    vi: "Menu chính — {inheriting}/{total} địa điểm kế thừa menu này",
    th: "เมนูหลัก — {inheriting} จาก {total} สาขาใช้เมนูนี้",
    zh: "主菜单 — {total} 个门店中有 {inheriting} 个沿用此菜单",
    ja: "マスターメニュー — {total} 店舗中 {inheriting} 店舗がこのメニューを継承",
    ko: "마스터 메뉴 — {total}개 지점 중 {inheriting}곳이 이 메뉴를 사용",
    ar: "القائمة الرئيسية — {inheriting} من {total} موقعًا ترث هذه القائمة",
    he: "תפריט ראשי — {inheriting} מתוך {total} סניפים יורשים תפריט זה",
    hi: "मास्टर मेन्यू — {total} स्थानों में से {inheriting} इस मेन्यू को इनहेरिट करते हैं",
  },
  "admin.menuEditor.masterMenuBody": {
    en: "Changes you make here appear on every inheriting location instantly. Locations with a custom menu are not affected.",
    fr: "Les modifications apportées ici s'appliquent instantanément à chaque établissement qui hérite. Les établissements avec un menu personnalisé ne sont pas affectés.",
    es: "Los cambios que hagas aquí se aplican al instante a cada ubicación que hereda. Las ubicaciones con un menú personalizado no se ven afectadas.",
    it: "Le modifiche apportate qui vengono applicate immediatamente a ogni sede che eredita. Le sedi con un menu personalizzato non sono interessate.",
    pt: "As alterações feitas aqui aplicam-se instantaneamente a todos os locais que herdam. Os locais com um menu personalizado não são afetados.",
    "pt-BR": "As alterações feitas aqui se aplicam instantaneamente a todos os locais que herdam. Locais com cardápio personalizado não são afetados.",
    de: "Hier vorgenommene Änderungen erscheinen sofort an jedem erbenden Standort. Standorte mit einem eigenen Menü sind nicht betroffen.",
    nl: "Wijzigingen die je hier maakt, verschijnen direct op elke locatie die overerft. Locaties met een aangepast menu worden niet beïnvloed.",
    ro: "Modificările făcute aici apar instantaneu în fiecare locație care moștenește. Locațiile cu un meniu personalizat nu sunt afectate.",
    sv: "Ändringar du gör här visas direkt på varje plats som ärver. Platser med en anpassad meny påverkas inte.",
    da: "Ændringer, du foretager her, vises straks på hver placering, der arver. Placeringer med en tilpasset menu påvirkes ikke.",
    nb: "Endringer du gjør her, vises umiddelbart på hvert sted som arver. Steder med en egendefinert meny påvirkes ikke.",
    fi: "Täällä tekemäsi muutokset näkyvät heti jokaisessa perivässä toimipaikassa. Mukautetun valikon toimipaikkoihin ei vaikuteta.",
    pl: "Zmiany wprowadzone tutaj pojawiają się natychmiast w każdej dziedziczącej lokalizacji. Lokalizacje z własnym menu nie są zmieniane.",
    cs: "Změny, které zde provedete, se okamžitě projeví v každé dědící pobočce. Pobočky s vlastním menu nejsou ovlivněny.",
    sk: "Zmeny, ktoré tu vykonáte, sa okamžite prejavia v každej dediacej pobočke. Pobočky s vlastným menu nie sú ovplyvnené.",
    hu: "Az itt végzett módosítások azonnal megjelennek minden öröklő helyszínen. Az egyéni étlappal rendelkező helyszíneket nem érinti.",
    el: "Οι αλλαγές που κάνετε εδώ εμφανίζονται αμέσως σε κάθε τοποθεσία που κληρονομεί. Οι τοποθεσίες με προσαρμοσμένο μενού δεν επηρεάζονται.",
    bg: "Промените, които правите тук, се появяват незабавно във всеки наследяващ обект. Обектите със собствено меню не са засегнати.",
    hr: "Promjene koje ovdje napravite odmah se prikazuju na svakoj lokaciji koja nasljeđuje. Lokacije s prilagođenim izbornikom nisu zahvaćene.",
    sr: "Промене које овде направите одмах се појављују на свакој локацији која наслеђује. Локације са прилагођеним менијем нису погођене.",
    sl: "Spremembe, ki jih naredite tukaj, se takoj prikažejo na vsaki lokaciji, ki podeduje. Lokacije s prilagojenim menijem niso prizadete.",
    et: "Siin tehtud muudatused ilmuvad kohe igas pärivas asukohas. Kohandatud menüüga asukohti ei mõjutata.",
    lv: "Šeit veiktās izmaiņas nekavējoties parādās katrā vietā, kas manto. Vietas ar pielāgotu ēdienkarti netiek ietekmētas.",
    lt: "Čia atlikti pakeitimai iškart atsiranda kiekvienoje paveldinčioje vietoje. Vietos su pritaikytu meniu nepaveikiamos.",
    tr: "Burada yaptığınız değişiklikler, devralan her konumda anında görünür. Özel menüsü olan konumlar etkilenmez.",
    ru: "Изменения, внесённые здесь, мгновенно появляются в каждом наследующем заведении. Заведения с собственным меню не затрагиваются.",
    uk: "Зміни, внесені тут, миттєво з'являються в кожному закладі, що успадковує. Заклади з власним меню не зачіпаються.",
    ca: "Els canvis que facis aquí s'apliquen a l'instant a cada ubicació que hereta. Les ubicacions amb un menú personalitzat no es veuen afectades.",
    id: "Perubahan yang Anda buat di sini langsung muncul di setiap lokasi yang mewarisi. Lokasi dengan menu kustom tidak terpengaruh.",
    vi: "Các thay đổi bạn thực hiện ở đây sẽ xuất hiện ngay lập tức tại mọi địa điểm kế thừa. Các địa điểm có menu tùy chỉnh không bị ảnh hưởng.",
    th: "การเปลี่ยนแปลงที่คุณทำที่นี่จะปรากฏทันทีในทุกสาขาที่สืบทอด สาขาที่มีเมนูกำหนดเองจะไม่ได้รับผลกระทบ",
    zh: "您在此处所做的更改会立即应用到每个沿用此菜单的门店。使用自定义菜单的门店不受影响。",
    ja: "ここでの変更は、継承している各店舗に即座に反映されます。独自メニューの店舗には影響しません。",
    ko: "여기서 변경한 내용은 이 메뉴를 사용하는 모든 지점에 즉시 적용됩니다. 맞춤 메뉴를 사용하는 지점은 영향을 받지 않습니다.",
    ar: "تظهر التغييرات التي تجريها هنا فورًا في كل موقع يرث القائمة. المواقع ذات القائمة المخصصة لا تتأثر.",
    he: "השינויים שתבצע כאן יופיעו מיד בכל סניף שיורש. סניפים עם תפריט מותאם אישית אינם מושפעים.",
    hi: "यहाँ किए गए बदलाव हर इनहेरिट करने वाले स्थान पर तुरंत दिखते हैं। कस्टम मेन्यू वाले स्थान प्रभावित नहीं होते।",
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
console.log(`✓ master-menu-banner strings added to ${n} locale(s).`);
