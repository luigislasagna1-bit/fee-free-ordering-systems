/** i18n × 38: promo-editor stale-menu notice (Luigi 2026-07-05).
 *  Run: npx tsx scripts/i18n-add-stale-menu-notice.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.promoWizard.staleMenuTargets": {
    en: "This promo was built on a menu that's no longer live. On the current live menu it targets:",
    fr: "Cette promotion a été créée sur un menu qui n'est plus actif. Sur le menu actif actuel, elle cible :",
    es: "Esta promoción se creó en un menú que ya no está activo. En el menú activo actual apunta a:",
    it: "Questa promozione è stata creata su un menù non più attivo. Sul menù attivo attuale si applica a:",
    pt: "Esta promoção foi criada num menu que já não está ativo. No menu ativo atual aplica-se a:",
    "pt-BR": "Esta promoção foi criada em um cardápio que não está mais ativo. No cardápio ativo atual ela se aplica a:",
    de: "Diese Aktion wurde auf einem nicht mehr aktiven Menü erstellt. Auf dem aktuellen Live-Menü gilt sie für:",
    nl: "Deze promotie is gemaakt op een menu dat niet meer live is. Op het huidige live menu geldt hij voor:",
    ro: "Această promoție a fost creată pe un meniu care nu mai este activ. Pe meniul activ actual vizează:",
    sv: "Denna kampanj skapades på en meny som inte längre är aktiv. På den aktuella aktiva menyn gäller den:",
    da: "Denne kampagne blev oprettet på en menu, der ikke længere er aktiv. På den aktuelle aktive menu gælder den:",
    nb: "Denne kampanjen ble laget på en meny som ikke lenger er aktiv. På den gjeldende aktive menyen gjelder den:",
    fi: "Tämä kampanja luotiin ruokalistalle, joka ei ole enää käytössä. Nykyisellä aktiivisella listalla se koskee:",
    pl: "Ta promocja została utworzona w menu, które nie jest już aktywne. W bieżącym aktywnym menu obejmuje:",
    cs: "Tato akce byla vytvořena na menu, které již není aktivní. Na aktuálním aktivním menu se vztahuje na:",
    sk: "Táto akcia bola vytvorená na menu, ktoré už nie je aktívne. Na aktuálnom aktívnom menu sa vzťahuje na:",
    hu: "Ez az akció egy már nem aktív étlapon készült. A jelenlegi aktív étlapon a következőkre vonatkozik:",
    el: "Αυτή η προσφορά δημιουργήθηκε σε μενού που δεν είναι πλέον ενεργό. Στο τρέχον ενεργό μενού αφορά:",
    bg: "Тази промоция е създадена върху меню, което вече не е активно. В текущото активно меню тя се отнася за:",
    hr: "Ova promocija izrađena je na jelovniku koji više nije aktivan. Na trenutno aktivnom jelovniku odnosi se na:",
    sr: "Ова промоција је направљена на јеловнику који више није активан. На тренутно активном јеловнику односи се на:",
    sl: "Ta promocija je bila ustvarjena na meniju, ki ni več aktiven. Na trenutno aktivnem meniju velja za:",
    et: "See kampaania loodi menüül, mis pole enam aktiivne. Praegusel aktiivsel menüül kehtib see:",
    lv: "Šī akcija tika izveidota ēdienkartē, kas vairs nav aktīva. Pašreizējā aktīvajā ēdienkartē tā attiecas uz:",
    lt: "Ši akcija sukurta meniu, kuris nebėra aktyvus. Dabartiniame aktyviame meniu ji taikoma:",
    tr: "Bu promosyon artık yayında olmayan bir menüde oluşturuldu. Mevcut yayındaki menüde şunları hedefliyor:",
    ru: "Эта акция была создана в меню, которое больше не активно. В текущем активном меню она действует на:",
    uk: "Цю акцію було створено в меню, яке більше не активне. У поточному активному меню вона стосується:",
    ca: "Aquesta promoció es va crear en un menú que ja no està actiu. En el menú actiu actual s'aplica a:",
    id: "Promo ini dibuat pada menu yang sudah tidak aktif. Pada menu aktif saat ini, promo berlaku untuk:",
    vi: "Khuyến mãi này được tạo trên thực đơn không còn hoạt động. Trên thực đơn đang hoạt động, nó áp dụng cho:",
    th: "โปรโมชันนี้สร้างบนเมนูที่ไม่ได้ใช้งานแล้ว ในเมนูที่ใช้งานอยู่ปัจจุบัน โปรโมชันนี้ใช้กับ:",
    zh: "此促销是基于已不再使用的菜单创建的。在当前使用的菜单上，它适用于：",
    ja: "このプロモーションは現在使用されていないメニューで作成されました。現在のメニューでは以下が対象です：",
    ko: "이 프로모션은 더 이상 사용되지 않는 메뉴에서 만들어졌습니다. 현재 사용 중인 메뉴에서는 다음을 대상으로 합니다:",
    ar: "تم إنشاء هذا العرض على قائمة لم تعد نشطة. في القائمة النشطة الحالية يستهدف:",
    he: "המבצע הזה נוצר על תפריט שאינו פעיל עוד. בתפריט הפעיל הנוכחי הוא חל על:",
    hi: "यह प्रोमो ऐसे मेनू पर बनाया गया था जो अब लाइव नहीं है। वर्तमान लाइव मेनू पर यह इन पर लागू होता है:",
  },
  "admin.promoWizard.staleMenuMore": {
    en: "+{n} more", fr: "+{n} autres", es: "+{n} más", it: "+{n} altri", pt: "+{n} mais", "pt-BR": "+{n} mais",
    de: "+{n} weitere", nl: "+{n} meer", ro: "+{n} altele", sv: "+{n} till", da: "+{n} flere", nb: "+{n} flere",
    fi: "+{n} lisää", pl: "+{n} więcej", cs: "+{n} dalších", sk: "+{n} ďalších", hu: "+{n} további",
    el: "+{n} ακόμη", bg: "+{n} още", hr: "+{n} više", sr: "+{n} више", sl: "+{n} več", et: "+{n} veel",
    lv: "+{n} vairāk", lt: "+{n} daugiau", tr: "+{n} tane daha", ru: "ещё {n}", uk: "ще {n}", ca: "+{n} més",
    id: "+{n} lagi", vi: "+{n} nữa", th: "อีก {n} รายการ", zh: "另外 {n} 个", ja: "他{n}件", ko: "외 {n}개",
    ar: "+{n} أخرى", he: "+{n} נוספים", hi: "+{n} और",
  },
  "admin.promoWizard.staleMenuNoTargets": {
    en: "This promo was built on a menu that's no longer live, and none of its dishes matched the current live menu — please re-select the dishes.",
    fr: "Cette promotion a été créée sur un menu qui n'est plus actif et aucun de ses plats ne correspond au menu actif actuel — veuillez resélectionner les plats.",
    es: "Esta promoción se creó en un menú que ya no está activo y ninguno de sus platos coincide con el menú activo actual; vuelve a seleccionar los platos.",
    it: "Questa promozione è stata creata su un menù non più attivo e nessuno dei suoi piatti corrisponde al menù attivo attuale — seleziona di nuovo i piatti.",
    pt: "Esta promoção foi criada num menu que já não está ativo e nenhum dos seus pratos corresponde ao menu ativo atual — volte a selecionar os pratos.",
    "pt-BR": "Esta promoção foi criada em um cardápio que não está mais ativo e nenhum dos pratos corresponde ao cardápio ativo atual — selecione os pratos novamente.",
    de: "Diese Aktion wurde auf einem nicht mehr aktiven Menü erstellt und keines ihrer Gerichte passt zum aktuellen Live-Menü — bitte wählen Sie die Gerichte neu aus.",
    nl: "Deze promotie is gemaakt op een menu dat niet meer live is en geen van de gerechten komt overeen met het huidige live menu — selecteer de gerechten opnieuw.",
    ro: "Această promoție a fost creată pe un meniu care nu mai este activ și niciun fel de mâncare nu corespunde meniului activ actual — vă rugăm să reselectați felurile.",
    sv: "Denna kampanj skapades på en meny som inte längre är aktiv och ingen av rätterna matchar den aktuella aktiva menyn — välj rätterna igen.",
    da: "Denne kampagne blev oprettet på en menu, der ikke længere er aktiv, og ingen af retterne matcher den aktuelle aktive menu — vælg venligst retterne igen.",
    nb: "Denne kampanjen ble laget på en meny som ikke lenger er aktiv, og ingen av rettene samsvarer med den gjeldende aktive menyen — velg rettene på nytt.",
    fi: "Tämä kampanja luotiin ruokalistalle, joka ei ole enää käytössä, eikä yksikään sen annoksista vastaa nykyistä aktiivista listaa — valitse annokset uudelleen.",
    pl: "Ta promocja została utworzona w menu, które nie jest już aktywne, i żadne z jej dań nie pasuje do bieżącego aktywnego menu — wybierz dania ponownie.",
    cs: "Tato akce byla vytvořena na menu, které již není aktivní, a žádné z jejích jídel neodpovídá aktuálnímu aktivnímu menu — vyberte prosím jídla znovu.",
    sk: "Táto akcia bola vytvorená na menu, ktoré už nie je aktívne, a žiadne z jej jedál nezodpovedá aktuálnemu aktívnemu menu — vyberte jedlá znova.",
    hu: "Ez az akció egy már nem aktív étlapon készült, és egyik étele sem található meg a jelenlegi aktív étlapon — kérjük, válassza ki újra az ételeket.",
    el: "Αυτή η προσφορά δημιουργήθηκε σε μενού που δεν είναι πλέον ενεργό και κανένα από τα πιάτα της δεν αντιστοιχεί στο τρέχον ενεργό μενού — επιλέξτε ξανά τα πιάτα.",
    bg: "Тази промоция е създадена върху меню, което вече не е активно, и нито едно от ястията ѝ не съвпада с текущото активно меню — моля, изберете ястията отново.",
    hr: "Ova promocija izrađena je na jelovniku koji više nije aktivan i nijedno njezino jelo ne odgovara trenutno aktivnom jelovniku — ponovno odaberite jela.",
    sr: "Ова промоција је направљена на јеловнику који више није активан и ниједно њено јело не одговара тренутно активном јеловнику — поново изаберите јела.",
    sl: "Ta promocija je bila ustvarjena na meniju, ki ni več aktiven, in nobena od njenih jedi se ne ujema s trenutno aktivnim menijem — znova izberite jedi.",
    et: "See kampaania loodi menüül, mis pole enam aktiivne, ja ükski selle roog ei vasta praegusele aktiivsele menüüle — palun valige road uuesti.",
    lv: "Šī akcija tika izveidota ēdienkartē, kas vairs nav aktīva, un neviens tās ēdiens neatbilst pašreizējai aktīvajai ēdienkartei — lūdzu, izvēlieties ēdienus vēlreiz.",
    lt: "Ši akcija sukurta meniu, kuris nebėra aktyvus, ir nė vienas jos patiekalas neatitinka dabartinio aktyvaus meniu — pasirinkite patiekalus iš naujo.",
    tr: "Bu promosyon artık yayında olmayan bir menüde oluşturuldu ve yemeklerinden hiçbiri mevcut yayındaki menüyle eşleşmiyor — lütfen yemekleri yeniden seçin.",
    ru: "Эта акция была создана в меню, которое больше не активно, и ни одно из её блюд не найдено в текущем активном меню — выберите блюда заново.",
    uk: "Цю акцію було створено в меню, яке більше не активне, і жодна з її страв не збігається з поточним активним меню — виберіть страви знову.",
    ca: "Aquesta promoció es va crear en un menú que ja no està actiu i cap dels seus plats coincideix amb el menú actiu actual — torneu a seleccionar els plats.",
    id: "Promo ini dibuat pada menu yang sudah tidak aktif dan tidak ada hidangannya yang cocok dengan menu aktif saat ini — silakan pilih ulang hidangannya.",
    vi: "Khuyến mãi này được tạo trên thực đơn không còn hoạt động và không món nào khớp với thực đơn đang hoạt động — vui lòng chọn lại các món.",
    th: "โปรโมชันนี้สร้างบนเมนูที่ไม่ได้ใช้งานแล้ว และไม่มีเมนูอาหารใดตรงกับเมนูที่ใช้งานอยู่ปัจจุบัน — โปรดเลือกเมนูอาหารใหม่",
    zh: "此促销是基于已不再使用的菜单创建的，且其中的菜品在当前使用的菜单上均无匹配 — 请重新选择菜品。",
    ja: "このプロモーションは現在使用されていないメニューで作成され、対象料理が現在のメニューに一致しません — 料理を選び直してください。",
    ko: "이 프로모션은 더 이상 사용되지 않는 메뉴에서 만들어졌으며 현재 메뉴와 일치하는 메뉴 항목이 없습니다 — 메뉴 항목을 다시 선택해 주세요.",
    ar: "تم إنشاء هذا العرض على قائمة لم تعد نشطة، ولا يتطابق أي من أطباقه مع القائمة النشطة الحالية — يرجى إعادة اختيار الأطباق.",
    he: "המבצע הזה נוצר על תפריט שאינו פעיל עוד ואף אחת מהמנות שלו לא נמצאה בתפריט הפעיל הנוכחי — אנא בחרו את המנות מחדש.",
    hi: "यह प्रोमो ऐसे मेनू पर बनाया गया था जो अब लाइव नहीं है, और इसका कोई भी व्यंजन वर्तमान लाइव मेनू से मेल नहीं खाता — कृपया व्यंजन फिर से चुनें।",
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
console.log(`✓ stale-menu notice keys added to ${n} locale(s).`);
