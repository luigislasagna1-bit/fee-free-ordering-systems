/** i18n × 38: per-customer removal of VIP specials + revoking assigned offers
 *  (Fabrizio 2026-07-02 — "a VIP promotion must be removable from a customer
 *  after it has been assigned"). {name}/{group} placeholders must survive.
 *  Run: npx tsx scripts/i18n-add-vip-remove-revoke.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.customerGroups.confirmRemoveFromGroup": {
    en: "Remove {name} from “{group}”? They will lose every special attached to that group. The group and its specials stay unchanged for everyone else.",
    fr: "Retirer {name} de « {group} » ? Cette personne perdra toutes les offres liées à ce groupe. Le groupe et ses offres restent inchangés pour les autres.",
    es: "¿Quitar a {name} de «{group}»? Perderá todas las ofertas vinculadas a ese grupo. El grupo y sus ofertas no cambian para los demás.",
    it: "Rimuovere {name} da “{group}”? Perderà tutte le offerte collegate a quel gruppo. Il gruppo e le sue offerte restano invariati per gli altri.",
    pt: "Remover {name} de «{group}»? Perderá todas as ofertas ligadas a esse grupo. O grupo e as suas ofertas mantêm-se para os restantes.",
    "pt-BR": "Remover {name} de “{group}”? Ele perderá todas as ofertas vinculadas a esse grupo. O grupo e suas ofertas continuam iguais para os demais.",
    de: "{name} aus „{group}“ entfernen? Diese Person verliert alle mit der Gruppe verknüpften Angebote. Für alle anderen bleiben Gruppe und Angebote unverändert.",
    nl: "{name} uit “{group}” verwijderen? Deze persoon verliest alle aan die groep gekoppelde aanbiedingen. Voor de rest blijft de groep ongewijzigd.",
    ro: "Eliminați {name} din „{group}”? Va pierde toate ofertele atașate acelui grup. Grupul și ofertele lui rămân neschimbate pentru ceilalți.",
    sv: "Ta bort {name} från ”{group}”? Personen förlorar alla erbjudanden kopplade till gruppen. Gruppen och dess erbjudanden påverkas inte för övriga.",
    da: "Fjern {name} fra ”{group}”? Personen mister alle tilbud knyttet til gruppen. Gruppen og dens tilbud er uændrede for alle andre.",
    nb: "Fjerne {name} fra «{group}»? Personen mister alle tilbud knyttet til gruppen. Gruppen og tilbudene er uendret for alle andre.",
    fi: "Poistetaanko {name} ryhmästä ”{group}”? Hän menettää kaikki ryhmään liitetyt edut. Ryhmä ja sen edut säilyvät muille ennallaan.",
    pl: "Usunąć {name} z grupy „{group}”? Straci wszystkie oferty powiązane z tą grupą. Grupa i jej oferty pozostają bez zmian dla pozostałych.",
    cs: "Odebrat {name} ze skupiny „{group}“? Přijde o všechny nabídky spojené s touto skupinou. Skupina a její nabídky zůstávají pro ostatní beze změny.",
    sk: "Odstrániť {name} zo skupiny „{group}“? Príde o všetky ponuky spojené s touto skupinou. Skupina a jej ponuky zostávajú pre ostatných bez zmeny.",
    hu: "Eltávolítja {name} tagot a(z) „{group}” csoportból? Elveszíti a csoporthoz kapcsolt összes kedvezményt. A csoport és kedvezményei a többieknek változatlanok maradnak.",
    el: "Αφαίρεση του/της {name} από «{group}»; Θα χάσει όλες τις προσφορές της ομάδας. Η ομάδα και οι προσφορές της μένουν ίδιες για τους υπόλοιπους.",
    bg: "Премахване на {name} от „{group}“? Ще загуби всички оферти, свързани с групата. Групата и офертите ѝ остават непроменени за останалите.",
    hr: "Ukloniti {name} iz „{group}“? Izgubit će sve pogodnosti vezane uz tu grupu. Grupa i njezine pogodnosti ostaju iste za ostale.",
    sr: "Уклонити {name} из „{group}“? Изгубиће све погодности везане за ту групу. Група и њене погодности остају исте за остале.",
    sl: "Odstranim {name} iz »{group}«? Izgubil bo vse ugodnosti, vezane na to skupino. Skupina in njene ugodnosti ostanejo za druge nespremenjene.",
    et: "Kas eemaldada {name} rühmast „{group}”? Ta kaotab kõik selle rühmaga seotud pakkumised. Rühm ja selle pakkumised jäävad teistele samaks.",
    lv: "Vai izņemt {name} no “{group}”? Viņš zaudēs visus grupai piesaistītos piedāvājumus. Grupa un tās piedāvājumi pārējiem paliek nemainīgi.",
    lt: "Pašalinti {name} iš „{group}“? Jis neteks visų su grupe susietų pasiūlymų. Grupė ir jos pasiūlymai kitiems lieka nepakitę.",
    tr: "{name} “{group}” grubundan çıkarılsın mı? Bu gruba bağlı tüm ayrıcalıkları kaybeder. Grup ve ayrıcalıkları diğerleri için aynı kalır.",
    ru: "Убрать {name} из группы «{group}»? Он потеряет все привязанные к группе предложения. Для остальных группа и её предложения не изменятся.",
    uk: "Вилучити {name} з групи «{group}»? Він втратить усі пов'язані з групою пропозиції. Для інших група та її пропозиції не зміняться.",
    ca: "Vols treure {name} de «{group}»? Perdrà totes les ofertes vinculades a aquest grup. El grup i les seves ofertes no canvien per a la resta.",
    id: "Hapus {name} dari “{group}”? Ia akan kehilangan semua penawaran yang terkait grup itu. Grup dan penawarannya tetap sama untuk yang lain.",
    vi: "Xóa {name} khỏi “{group}”? Họ sẽ mất mọi ưu đãi gắn với nhóm đó. Nhóm và các ưu đãi vẫn giữ nguyên cho những người khác.",
    th: "นำ {name} ออกจาก “{group}” หรือไม่ เขาจะเสียสิทธิพิเศษทั้งหมดของกลุ่มนี้ ส่วนกลุ่มและสิทธิพิเศษยังคงเดิมสำหรับคนอื่น",
    zh: "将 {name} 从“{group}”中移除？该顾客将失去该组的所有专属优惠。组及其优惠对其他人保持不变。",
    ja: "{name} を「{group}」から削除しますか？このグループに紐づく特典をすべて失います。グループと特典は他のメンバーには影響しません。",
    ko: "{name}을(를) “{group}”에서 제거할까요? 해당 그룹에 연결된 모든 혜택을 잃게 됩니다. 그룹과 혜택은 다른 사람에게는 그대로 유지됩니다.",
    ar: "إزالة {name} من «{group}»؟ سيفقد جميع العروض المرتبطة بهذه المجموعة. تبقى المجموعة وعروضها كما هي للبقية.",
    he: "להסיר את {name} מ-“{group}”? הוא יאבד את כל ההטבות המשויכות לקבוצה. הקבוצה וההטבות נשארות ללא שינוי עבור השאר.",
    hi: "{name} को “{group}” से हटाएँ? उसे इस समूह से जुड़े सभी ऑफ़र नहीं मिलेंगे। समूह और उसके ऑफ़र बाकी लोगों के लिए वैसे ही रहेंगे।",
  },
  "admin.customerGroups.removeFromGroupTitle": {
    en: "Remove from {group}", fr: "Retirer de {group}", es: "Quitar de {group}", it: "Rimuovi da {group}", pt: "Remover de {group}", "pt-BR": "Remover de {group}", de: "Aus {group} entfernen", nl: "Verwijderen uit {group}",
    ro: "Elimină din {group}", sv: "Ta bort från {group}", da: "Fjern fra {group}", nb: "Fjern fra {group}", fi: "Poista ryhmästä {group}", pl: "Usuń z {group}", cs: "Odebrat ze skupiny {group}", sk: "Odstrániť zo skupiny {group}",
    hu: "Eltávolítás innen: {group}", el: "Αφαίρεση από {group}", bg: "Премахни от {group}", hr: "Ukloni iz {group}", sr: "Уклони из {group}", sl: "Odstrani iz {group}", et: "Eemalda rühmast {group}", lv: "Izņemt no {group}",
    lt: "Pašalinti iš {group}", tr: "{group} grubundan çıkar", ru: "Убрать из {group}", uk: "Вилучити з {group}", ca: "Treu de {group}", id: "Hapus dari {group}", vi: "Xóa khỏi {group}", th: "นำออกจาก {group}",
    zh: "从{group}中移除", ja: "{group}から削除", ko: "{group}에서 제거", ar: "إزالة من {group}", he: "הסרה מ-{group}", hi: "{group} से हटाएँ",
  },
  "admin.customerDetailPage.revokeOffer": {
    en: "Revoke this offer", fr: "Révoquer cette offre", es: "Revocar esta oferta", it: "Revoca questa offerta", pt: "Revogar esta oferta", "pt-BR": "Revogar esta oferta", de: "Dieses Angebot widerrufen", nl: "Deze aanbieding intrekken",
    ro: "Revocă această ofertă", sv: "Återkalla erbjudandet", da: "Tilbagekald tilbuddet", nb: "Trekk tilbake tilbudet", fi: "Peru tämä etu", pl: "Cofnij tę ofertę", cs: "Odvolat tuto nabídku", sk: "Odvolať túto ponuku",
    hu: "Ajánlat visszavonása", el: "Ανάκληση προσφοράς", bg: "Оттегли офертата", hr: "Opozovi ponudu", sr: "Опозови понуду", sl: "Prekliči ponudbo", et: "Tühista pakkumine", lv: "Atsaukt piedāvājumu",
    lt: "Atšaukti pasiūlymą", tr: "Bu teklifi geri al", ru: "Отозвать предложение", uk: "Відкликати пропозицію", ca: "Revoca aquesta oferta", id: "Cabut penawaran ini", vi: "Thu hồi ưu đãi này", th: "เพิกถอนข้อเสนอนี้",
    zh: "撤销此优惠", ja: "このオファーを取り消す", ko: "이 혜택 회수", ar: "سحب هذا العرض", he: "לבטל את ההטבה", hi: "यह ऑफ़र वापस लें",
  },
  "admin.customerDetailPage.confirmRevokeOffer": {
    en: "Revoke this offer? The customer will no longer be able to use it.",
    fr: "Révoquer cette offre ? Le client ne pourra plus l'utiliser.",
    es: "¿Revocar esta oferta? El cliente ya no podrá usarla.",
    it: "Revocare questa offerta? Il cliente non potrà più usarla.",
    pt: "Revogar esta oferta? O cliente deixará de poder usá-la.",
    "pt-BR": "Revogar esta oferta? O cliente não poderá mais usá-la.",
    de: "Dieses Angebot widerrufen? Der Kunde kann es dann nicht mehr einlösen.",
    nl: "Deze aanbieding intrekken? De klant kan haar daarna niet meer gebruiken.",
    ro: "Revocați această ofertă? Clientul nu o va mai putea folosi.",
    sv: "Återkalla erbjudandet? Kunden kan inte längre använda det.",
    da: "Tilbagekald tilbuddet? Kunden kan ikke længere bruge det.",
    nb: "Trekke tilbake tilbudet? Kunden kan ikke lenger bruke det.",
    fi: "Perutaanko tämä etu? Asiakas ei voi enää käyttää sitä.",
    pl: "Cofnąć tę ofertę? Klient nie będzie mógł już z niej skorzystać.",
    cs: "Odvolat tuto nabídku? Zákazník ji už nebude moci využít.",
    sk: "Odvolať túto ponuku? Zákazník ju už nebude môcť využiť.",
    hu: "Visszavonja az ajánlatot? Az ügyfél többé nem tudja felhasználni.",
    el: "Ανάκληση της προσφοράς; Ο πελάτης δεν θα μπορεί πλέον να τη χρησιμοποιήσει.",
    bg: "Да оттеглим ли офертата? Клиентът вече няма да може да я използва.",
    hr: "Opozvati ponudu? Kupac je više neće moći iskoristiti.",
    sr: "Опозвати понуду? Купац више неће моћи да је искористи.",
    sl: "Prekličem ponudbo? Stranka je ne bo več mogla uporabiti.",
    et: "Kas tühistada pakkumine? Klient ei saa seda enam kasutada.",
    lv: "Atsaukt piedāvājumu? Klients to vairs nevarēs izmantot.",
    lt: "Atšaukti pasiūlymą? Klientas nebegalės juo pasinaudoti.",
    tr: "Bu teklif geri alınsın mı? Müşteri artık kullanamayacak.",
    ru: "Отозвать предложение? Клиент больше не сможет им воспользоваться.",
    uk: "Відкликати пропозицію? Клієнт більше не зможе нею скористатися.",
    ca: "Vols revocar aquesta oferta? El client ja no la podrà fer servir.",
    id: "Cabut penawaran ini? Pelanggan tidak akan bisa memakainya lagi.",
    vi: "Thu hồi ưu đãi này? Khách sẽ không thể dùng nó nữa.",
    th: "เพิกถอนข้อเสนอนี้หรือไม่ ลูกค้าจะใช้ไม่ได้อีกต่อไป",
    zh: "撤销此优惠？该顾客将无法再使用它。",
    ja: "このオファーを取り消しますか？お客様は今後利用できなくなります。",
    ko: "이 혜택을 회수할까요? 고객은 더 이상 사용할 수 없습니다.",
    ar: "سحب هذا العرض؟ لن يتمكن العميل من استخدامه بعد الآن.",
    he: "לבטל את ההטבה? הלקוח לא יוכל להשתמש בה יותר.",
    hi: "यह ऑफ़र वापस लें? ग्राहक इसे फिर उपयोग नहीं कर पाएगा।",
  },
  "admin.customerDetailPage.offerRevoked": {
    en: "Offer revoked.", fr: "Offre révoquée.", es: "Oferta revocada.", it: "Offerta revocata.", pt: "Oferta revogada.", "pt-BR": "Oferta revogada.", de: "Angebot widerrufen.", nl: "Aanbieding ingetrokken.",
    ro: "Ofertă revocată.", sv: "Erbjudandet återkallat.", da: "Tilbuddet er tilbagekaldt.", nb: "Tilbudet er trukket tilbake.", fi: "Etu peruttu.", pl: "Oferta cofnięta.", cs: "Nabídka odvolána.", sk: "Ponuka odvolaná.",
    hu: "Ajánlat visszavonva.", el: "Η προσφορά ανακλήθηκε.", bg: "Офертата е оттеглена.", hr: "Ponuda je opozvana.", sr: "Понуда је опозвана.", sl: "Ponudba preklicana.", et: "Pakkumine tühistatud.", lv: "Piedāvājums atsaukts.",
    lt: "Pasiūlymas atšauktas.", tr: "Teklif geri alındı.", ru: "Предложение отозвано.", uk: "Пропозицію відкликано.", ca: "Oferta revocada.", id: "Penawaran dicabut.", vi: "Đã thu hồi ưu đãi.", th: "เพิกถอนข้อเสนอแล้ว",
    zh: "已撤销优惠。", ja: "オファーを取り消しました。", ko: "혜택이 회수되었습니다.", ar: "تم سحب العرض.", he: "ההטבה בוטלה.", hi: "ऑफ़र वापस ले लिया गया।",
  },
  "admin.customerDetailPage.revokeFailed": {
    en: "Couldn't revoke — try again.", fr: "Échec de la révocation — réessayez.", es: "No se pudo revocar — inténtalo de nuevo.", it: "Revoca non riuscita — riprova.", pt: "Não foi possível revogar — tente novamente.", "pt-BR": "Não foi possível revogar — tente novamente.", de: "Widerruf fehlgeschlagen — bitte erneut versuchen.", nl: "Intrekken mislukt — probeer opnieuw.",
    ro: "Revocarea a eșuat — încercați din nou.", sv: "Kunde inte återkalla — försök igen.", da: "Kunne ikke tilbagekalde — prøv igen.", nb: "Kunne ikke trekke tilbake — prøv igjen.", fi: "Peruminen epäonnistui — yritä uudelleen.", pl: "Nie udało się cofnąć — spróbuj ponownie.", cs: "Odvolání se nezdařilo — zkuste to znovu.", sk: "Odvolanie zlyhalo — skúste znova.",
    hu: "A visszavonás nem sikerült — próbálja újra.", el: "Αποτυχία ανάκλησης — δοκιμάστε ξανά.", bg: "Неуспешно оттегляне — опитайте отново.", hr: "Opoziv nije uspio — pokušajte ponovno.", sr: "Опозив није успео — покушајте поново.", sl: "Preklic ni uspel — poskusite znova.", et: "Tühistamine ebaõnnestus — proovige uuesti.", lv: "Neizdevās atsaukt — mēģiniet vēlreiz.",
    lt: "Nepavyko atšaukti — bandykite dar kartą.", tr: "Geri alınamadı — tekrar deneyin.", ru: "Не удалось отозвать — попробуйте снова.", uk: "Не вдалося відкликати — спробуйте ще раз.", ca: "No s'ha pogut revocar — torna-ho a provar.", id: "Gagal mencabut — coba lagi.", vi: "Không thu hồi được — thử lại.", th: "เพิกถอนไม่สำเร็จ — ลองอีกครั้ง",
    zh: "撤销失败 — 请重试。", ja: "取り消せませんでした — もう一度お試しください。", ko: "회수하지 못했습니다 — 다시 시도하세요.", ar: "تعذّر السحب — حاول مرة أخرى.", he: "הביטול נכשל — נסו שוב.", hi: "वापस नहीं ले सके — पुनः प्रयास करें।",
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
console.log(`✓ VIP-remove + offer-revoke strings added to ${n} locale(s).`);
