/**
 * Menu editor DUPLICATE item / modifier group (Luigi 2026-07-07) ×38:
 *   admin.menuEditor.duplicateItem          — item-row button title
 *   admin.menuEditor.itemDuplicated         — success toast (copy is hidden)
 *   admin.menuEditor.failedToDuplicateItem  — failure toast
 *   admin.menuEditor.duplicateGroup         — library-group button title
 *   admin.menuEditor.groupDuplicated        — success toast
 *   admin.menuEditor.failedToDuplicateGroup — failure toast
 *   npx tsx scripts/i18n-add-menu-duplicate.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Pack = { dupItem: string; itemDup: string; itemFail: string; dupGroup: string; groupDup: string; groupFail: string };

const T: Record<string, Pack> = {
  en: { dupItem: "Duplicate item", itemDup: "Item duplicated (hidden — show it when ready)", itemFail: "Couldn't duplicate the item — please try again.", dupGroup: "Duplicate group", groupDup: "Group duplicated", groupFail: "Couldn't duplicate the group — please try again." },
  fr: { dupItem: "Dupliquer l'article", itemDup: "Article dupliqué (masqué — affichez-le quand il est prêt)", itemFail: "Impossible de dupliquer l'article — veuillez réessayer.", dupGroup: "Dupliquer le groupe", groupDup: "Groupe dupliqué", groupFail: "Impossible de dupliquer le groupe — veuillez réessayer." },
  es: { dupItem: "Duplicar artículo", itemDup: "Artículo duplicado (oculto — muéstralo cuando esté listo)", itemFail: "No se pudo duplicar el artículo — inténtalo de nuevo.", dupGroup: "Duplicar grupo", groupDup: "Grupo duplicado", groupFail: "No se pudo duplicar el grupo — inténtalo de nuevo." },
  it: { dupItem: "Duplica piatto", itemDup: "Piatto duplicato (nascosto — mostralo quando è pronto)", itemFail: "Impossibile duplicare il piatto — riprova.", dupGroup: "Duplica gruppo", groupDup: "Gruppo duplicato", groupFail: "Impossibile duplicare il gruppo — riprova." },
  pt: { dupItem: "Duplicar item", itemDup: "Item duplicado (oculto — mostre-o quando estiver pronto)", itemFail: "Não foi possível duplicar o item — tente novamente.", dupGroup: "Duplicar grupo", groupDup: "Grupo duplicado", groupFail: "Não foi possível duplicar o grupo — tente novamente." },
  "pt-BR": { dupItem: "Duplicar item", itemDup: "Item duplicado (oculto — mostre-o quando estiver pronto)", itemFail: "Não foi possível duplicar o item — tente novamente.", dupGroup: "Duplicar grupo", groupDup: "Grupo duplicado", groupFail: "Não foi possível duplicar o grupo — tente novamente." },
  de: { dupItem: "Artikel duplizieren", itemDup: "Artikel dupliziert (ausgeblendet — bei Bedarf einblenden)", itemFail: "Artikel konnte nicht dupliziert werden — bitte erneut versuchen.", dupGroup: "Gruppe duplizieren", groupDup: "Gruppe dupliziert", groupFail: "Gruppe konnte nicht dupliziert werden — bitte erneut versuchen." },
  nl: { dupItem: "Item dupliceren", itemDup: "Item gedupliceerd (verborgen — toon het wanneer klaar)", itemFail: "Kon het item niet dupliceren — probeer het opnieuw.", dupGroup: "Groep dupliceren", groupDup: "Groep gedupliceerd", groupFail: "Kon de groep niet dupliceren — probeer het opnieuw." },
  ro: { dupItem: "Duplică produsul", itemDup: "Produs duplicat (ascuns — afișați-l când e gata)", itemFail: "Produsul nu a putut fi duplicat — încercați din nou.", dupGroup: "Duplică grupul", groupDup: "Grup duplicat", groupFail: "Grupul nu a putut fi duplicat — încercați din nou." },
  sv: { dupItem: "Duplicera artikel", itemDup: "Artikel duplicerad (dold — visa den när den är klar)", itemFail: "Kunde inte duplicera artikeln — försök igen.", dupGroup: "Duplicera grupp", groupDup: "Grupp duplicerad", groupFail: "Kunde inte duplicera gruppen — försök igen." },
  da: { dupItem: "Dupliker vare", itemDup: "Vare dupliceret (skjult — vis den, når den er klar)", itemFail: "Kunne ikke duplikere varen — prøv igen.", dupGroup: "Dupliker gruppe", groupDup: "Gruppe dupliceret", groupFail: "Kunne ikke duplikere gruppen — prøv igen." },
  nb: { dupItem: "Dupliser vare", itemDup: "Vare duplisert (skjult — vis den når den er klar)", itemFail: "Kunne ikke duplisere varen — prøv igjen.", dupGroup: "Dupliser gruppe", groupDup: "Gruppe duplisert", groupFail: "Kunne ikke duplisere gruppen — prøv igjen." },
  fi: { dupItem: "Monista tuote", itemDup: "Tuote monistettu (piilotettu — näytä se, kun se on valmis)", itemFail: "Tuotetta ei voitu monistaa — yritä uudelleen.", dupGroup: "Monista ryhmä", groupDup: "Ryhmä monistettu", groupFail: "Ryhmää ei voitu monistaa — yritä uudelleen." },
  pl: { dupItem: "Duplikuj pozycję", itemDup: "Pozycja zduplikowana (ukryta — pokaż, gdy będzie gotowa)", itemFail: "Nie udało się zduplikować pozycji — spróbuj ponownie.", dupGroup: "Duplikuj grupę", groupDup: "Grupa zduplikowana", groupFail: "Nie udało się zduplikować grupy — spróbuj ponownie." },
  cs: { dupItem: "Duplikovat položku", itemDup: "Položka duplikována (skrytá — zobrazte ji, až bude hotová)", itemFail: "Položku se nepodařilo duplikovat — zkuste to znovu.", dupGroup: "Duplikovat skupinu", groupDup: "Skupina duplikována", groupFail: "Skupinu se nepodařilo duplikovat — zkuste to znovu." },
  sk: { dupItem: "Duplikovať položku", itemDup: "Položka duplikovaná (skrytá — zobrazte ju, keď bude hotová)", itemFail: "Položku sa nepodarilo duplikovať — skúste to znova.", dupGroup: "Duplikovať skupinu", groupDup: "Skupina duplikovaná", groupFail: "Skupinu sa nepodarilo duplikovať — skúste to znova." },
  hu: { dupItem: "Tétel duplikálása", itemDup: "Tétel duplikálva (rejtett — jelenítse meg, ha kész)", itemFail: "A tételt nem sikerült duplikálni — próbálja újra.", dupGroup: "Csoport duplikálása", groupDup: "Csoport duplikálva", groupFail: "A csoportot nem sikerült duplikálni — próbálja újra." },
  el: { dupItem: "Διπλότυπο προϊόντος", itemDup: "Το προϊόν αντιγράφηκε (κρυφό — εμφανίστε το όταν είναι έτοιμο)", itemFail: "Δεν ήταν δυνατή η αντιγραφή του προϊόντος — δοκιμάστε ξανά.", dupGroup: "Διπλότυπο ομάδας", groupDup: "Η ομάδα αντιγράφηκε", groupFail: "Δεν ήταν δυνατή η αντιγραφή της ομάδας — δοκιμάστε ξανά." },
  bg: { dupItem: "Дублирай артикула", itemDup: "Артикулът е дублиран (скрит — покажете го, когато е готов)", itemFail: "Артикулът не можа да бъде дублиран — опитайте отново.", dupGroup: "Дублирай групата", groupDup: "Групата е дублирана", groupFail: "Групата не можа да бъде дублирана — опитайте отново." },
  hr: { dupItem: "Dupliciraj stavku", itemDup: "Stavka duplicirana (skrivena — prikažite je kad bude gotova)", itemFail: "Stavku nije bilo moguće duplicirati — pokušajte ponovno.", dupGroup: "Dupliciraj grupu", groupDup: "Grupa duplicirana", groupFail: "Grupu nije bilo moguće duplicirati — pokušajte ponovno." },
  sr: { dupItem: "Dupliraj stavku", itemDup: "Stavka duplirana (skrivena — prikažite je kad bude gotova)", itemFail: "Stavku nije bilo moguće duplirati — pokušajte ponovo.", dupGroup: "Dupliraj grupu", groupDup: "Grupa duplirana", groupFail: "Grupu nije bilo moguće duplirati — pokušajte ponovo." },
  sl: { dupItem: "Podvoji izdelek", itemDup: "Izdelek podvojen (skrit — prikažite ga, ko bo pripravljen)", itemFail: "Izdelka ni bilo mogoče podvojiti — poskusite znova.", dupGroup: "Podvoji skupino", groupDup: "Skupina podvojena", groupFail: "Skupine ni bilo mogoče podvojiti — poskusite znova." },
  et: { dupItem: "Dubleeri toode", itemDup: "Toode dubleeritud (peidetud — kuva see, kui valmis)", itemFail: "Toodet ei õnnestunud dubleerida — proovi uuesti.", dupGroup: "Dubleeri rühm", groupDup: "Rühm dubleeritud", groupFail: "Rühma ei õnnestunud dubleerida — proovi uuesti." },
  lv: { dupItem: "Dublēt produktu", itemDup: "Produkts dublēts (paslēpts — parādiet to, kad būs gatavs)", itemFail: "Produktu neizdevās dublēt — mēģiniet vēlreiz.", dupGroup: "Dublēt grupu", groupDup: "Grupa dublēta", groupFail: "Grupu neizdevās dublēt — mēģiniet vēlreiz." },
  lt: { dupItem: "Dubliuoti patiekalą", itemDup: "Patiekalas dubliuotas (paslėptas — parodykite jį, kai bus paruoštas)", itemFail: "Nepavyko dubliuoti patiekalo — bandykite dar kartą.", dupGroup: "Dubliuoti grupę", groupDup: "Grupė dubliuota", groupFail: "Nepavyko dubliuoti grupės — bandykite dar kartą." },
  tr: { dupItem: "Ürünü çoğalt", itemDup: "Ürün çoğaltıldı (gizli — hazır olduğunda gösterin)", itemFail: "Ürün çoğaltılamadı — lütfen tekrar deneyin.", dupGroup: "Grubu çoğalt", groupDup: "Grup çoğaltıldı", groupFail: "Grup çoğaltılamadı — lütfen tekrar deneyin." },
  ru: { dupItem: "Дублировать позицию", itemDup: "Позиция дублирована (скрыта — покажите её, когда будет готова)", itemFail: "Не удалось дублировать позицию — попробуйте ещё раз.", dupGroup: "Дублировать группу", groupDup: "Группа дублирована", groupFail: "Не удалось дублировать группу — попробуйте ещё раз." },
  uk: { dupItem: "Дублювати позицію", itemDup: "Позицію дубльовано (приховано — покажіть її, коли буде готова)", itemFail: "Не вдалося дублювати позицію — спробуйте ще раз.", dupGroup: "Дублювати групу", groupDup: "Групу дубльовано", groupFail: "Не вдалося дублювати групу — спробуйте ще раз." },
  ca: { dupItem: "Duplica l'article", itemDup: "Article duplicat (ocult — mostra'l quan estigui a punt)", itemFail: "No s'ha pogut duplicar l'article — torna-ho a provar.", dupGroup: "Duplica el grup", groupDup: "Grup duplicat", groupFail: "No s'ha pogut duplicar el grup — torna-ho a provar." },
  id: { dupItem: "Duplikat item", itemDup: "Item diduplikat (disembunyikan — tampilkan saat siap)", itemFail: "Tidak dapat menduplikat item — coba lagi.", dupGroup: "Duplikat grup", groupDup: "Grup diduplikat", groupFail: "Tidak dapat menduplikat grup — coba lagi." },
  vi: { dupItem: "Nhân bản món", itemDup: "Đã nhân bản món (đang ẩn — hiển thị khi sẵn sàng)", itemFail: "Không thể nhân bản món — vui lòng thử lại.", dupGroup: "Nhân bản nhóm", groupDup: "Đã nhân bản nhóm", groupFail: "Không thể nhân bản nhóm — vui lòng thử lại." },
  th: { dupItem: "ทำสำเนารายการ", itemDup: "ทำสำเนารายการแล้ว (ซ่อนอยู่ — แสดงเมื่อพร้อม)", itemFail: "ทำสำเนารายการไม่สำเร็จ — โปรดลองอีกครั้ง", dupGroup: "ทำสำเนากลุ่ม", groupDup: "ทำสำเนากลุ่มแล้ว", groupFail: "ทำสำเนากลุ่มไม่สำเร็จ — โปรดลองอีกครั้ง" },
  zh: { dupItem: "复制菜品", itemDup: "菜品已复制（已隐藏——准备好后显示）", itemFail: "无法复制菜品——请重试。", dupGroup: "复制分组", groupDup: "分组已复制", groupFail: "无法复制分组——请重试。" },
  ja: { dupItem: "商品を複製", itemDup: "商品を複製しました（非表示 — 準備ができたら表示してください）", itemFail: "商品を複製できませんでした — もう一度お試しください。", dupGroup: "グループを複製", groupDup: "グループを複製しました", groupFail: "グループを複製できませんでした — もう一度お試しください。" },
  ko: { dupItem: "항목 복제", itemDup: "항목이 복제되었습니다 (숨김 — 준비되면 표시하세요)", itemFail: "항목을 복제하지 못했습니다 — 다시 시도해 주세요.", dupGroup: "그룹 복제", groupDup: "그룹이 복제되었습니다", groupFail: "그룹을 복제하지 못했습니다 — 다시 시도해 주세요." },
  ar: { dupItem: "تكرار الصنف", itemDup: "تم تكرار الصنف (مخفي — أظهره عندما يكون جاهزًا)", itemFail: "تعذّر تكرار الصنف — يرجى المحاولة مرة أخرى.", dupGroup: "تكرار المجموعة", groupDup: "تم تكرار المجموعة", groupFail: "تعذّر تكرار المجموعة — يرجى المحاولة مرة أخرى." },
  he: { dupItem: "שכפול פריט", itemDup: "הפריט שוכפל (מוסתר — הציגו אותו כשמוכן)", itemFail: "לא ניתן לשכפל את הפריט — נסו שוב.", dupGroup: "שכפול קבוצה", groupDup: "הקבוצה שוכפלה", groupFail: "לא ניתן לשכפל את הקבוצה — נסו שוב." },
  hi: { dupItem: "आइटम डुप्लिकेट करें", itemDup: "आइटम डुप्लिकेट किया गया (छिपा हुआ — तैयार होने पर दिखाएँ)", itemFail: "आइटम डुप्लिकेट नहीं हो सका — कृपया फिर से प्रयास करें।", dupGroup: "समूह डुप्लिकेट करें", groupDup: "समूह डुप्लिकेट किया गया", groupFail: "समूह डुप्लिकेट नहीं हो सका — कृपया फिर से प्रयास करें।" },
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = T[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const me = ((json.admin ??= {}).menuEditor ??= {});
  me.duplicateItem = pack.dupItem;
  me.itemDuplicated = pack.itemDup;
  me.failedToDuplicateItem = pack.itemFail;
  me.duplicateGroup = pack.dupGroup;
  me.groupDuplicated = pack.groupDup;
  me.failedToDuplicateGroup = pack.groupFail;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ 6 keys added in ${changed} locale file(s)`);
