/** i18n × 38 for the VIP/promo polish item:
 *  (b) two confirm prompts for destructive VIP actions (admin.customerGroups);
 *  (c) reword the prominent customer-facing "coupon" wording → "offer"
 *      (customer.accountPage.yourCoupons / personalCoupon / noCoupons).
 *  {count}/{name} placeholders preserved. Luigi 2026-06-30.
 *  Run: npx tsx scripts/i18n-add-vip-polish.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

// Overwrites (reword) + additions, keyed by dotted path. en is the fallback.
const K: Record<string, Record<string, string>> = {
  "admin.customerGroups.confirmRemoveMember": {
    en: "Remove this member from the group?",
    fr: "Retirer ce membre du groupe ?", es: "¿Quitar a este miembro del grupo?", it: "Rimuovere questo membro dal gruppo?",
    pt: "Remover este membro do grupo?", "pt-BR": "Remover este membro do grupo?", de: "Dieses Mitglied aus der Gruppe entfernen?", nl: "Dit lid uit de groep verwijderen?",
    ro: "Eliminați acest membru din grup?", sv: "Ta bort den här medlemmen från gruppen?", da: "Fjern dette medlem fra gruppen?", nb: "Fjerne dette medlemmet fra gruppen?",
    fi: "Poistetaanko tämä jäsen ryhmästä?", pl: "Usunąć tego członka z grupy?", cs: "Odebrat tohoto člena ze skupiny?", sk: "Odstrániť tohto člena zo skupiny?",
    hu: "Eltávolítja ezt a tagot a csoportból?", el: "Να αφαιρεθεί αυτό το μέλος από την ομάδα;", bg: "Да премахнете този член от групата?", hr: "Ukloniti ovog člana iz grupe?",
    sr: "Уклонити овог члана из групе?", sl: "Odstranim tega člana iz skupine?", et: "Eemaldada see liige rühmast?", lv: "Noņemt šo dalībnieku no grupas?",
    lt: "Pašalinti šį narį iš grupės?", tr: "Bu üye gruptan çıkarılsın mı?", ru: "Удалить этого участника из группы?", uk: "Вилучити цього учасника з групи?",
    ca: "Voleu treure aquest membre del grup?", id: "Hapus anggota ini dari grup?", vi: "Xóa thành viên này khỏi nhóm?", th: "นำสมาชิกนี้ออกจากกลุ่มหรือไม่?",
    zh: "将此成员从该组中移除？", ja: "このメンバーをグループから削除しますか？", ko: "이 회원을 그룹에서 제거할까요?", ar: "إزالة هذا العضو من المجموعة؟",
    he: "להסיר את החבר הזה מהקבוצה?", hi: "इस सदस्य को समूह से हटाएँ?",
  },
  "admin.customerGroups.confirmRemoveSpecial": {
    en: "Remove this special?",
    fr: "Supprimer cette offre spéciale ?", es: "¿Quitar esta oferta especial?", it: "Rimuovere questa offerta speciale?",
    pt: "Remover esta oferta especial?", "pt-BR": "Remover esta oferta especial?", de: "Dieses Special entfernen?", nl: "Deze aanbieding verwijderen?",
    ro: "Eliminați această ofertă specială?", sv: "Ta bort det här erbjudandet?", da: "Fjern dette tilbud?", nb: "Fjerne dette tilbudet?",
    fi: "Poistetaanko tämä tarjous?", pl: "Usunąć tę ofertę specjalną?", cs: "Odebrat tuto speciální nabídku?", sk: "Odstrániť túto špeciálnu ponuku?",
    hu: "Eltávolítja ezt az ajánlatot?", el: "Να αφαιρεθεί αυτή η προσφορά;", bg: "Да премахнете тази специална оферта?", hr: "Ukloniti ovu posebnu ponudu?",
    sr: "Уклонити ову специјалну понуду?", sl: "Odstranim to posebno ponudbo?", et: "Eemaldada see pakkumine?", lv: "Noņemt šo īpašo piedāvājumu?",
    lt: "Pašalinti šį specialų pasiūlymą?", tr: "Bu özel teklif kaldırılsın mı?", ru: "Удалить это спецпредложение?", uk: "Вилучити цю спецпропозицію?",
    ca: "Voleu treure aquesta oferta especial?", id: "Hapus penawaran spesial ini?", vi: "Xóa ưu đãi đặc biệt này?", th: "นำข้อเสนอพิเศษนี้ออกหรือไม่?",
    zh: "移除此特别优惠？", ja: "この特典を削除しますか？", ko: "이 특별 혜택을 제거할까요?", ar: "إزالة هذا العرض الخاص؟",
    he: "להסיר את המבצע הזה?", hi: "इस विशेष ऑफ़र को हटाएँ?",
  },
  "customer.accountPage.yourCoupons": {
    en: "Your offers ({count})",
    fr: "Vos offres ({count})", es: "Tus ofertas ({count})", it: "Le tue offerte ({count})",
    pt: "As suas ofertas ({count})", "pt-BR": "Suas ofertas ({count})", de: "Ihre Angebote ({count})", nl: "Jouw aanbiedingen ({count})",
    ro: "Ofertele tale ({count})", sv: "Dina erbjudanden ({count})", da: "Dine tilbud ({count})", nb: "Dine tilbud ({count})",
    fi: "Tarjouksesi ({count})", pl: "Twoje oferty ({count})", cs: "Vaše nabídky ({count})", sk: "Vaše ponuky ({count})",
    hu: "Az ajánlataid ({count})", el: "Οι προσφορές σας ({count})", bg: "Вашите оферти ({count})", hr: "Vaše ponude ({count})",
    sr: "Ваше понуде ({count})", sl: "Vaše ponudbe ({count})", et: "Sinu pakkumised ({count})", lv: "Jūsu piedāvājumi ({count})",
    lt: "Jūsų pasiūlymai ({count})", tr: "Fırsatlarınız ({count})", ru: "Ваши предложения ({count})", uk: "Ваші пропозиції ({count})",
    ca: "Les teves ofertes ({count})", id: "Penawaran Anda ({count})", vi: "Ưu đãi của bạn ({count})", th: "ข้อเสนอของคุณ ({count})",
    zh: "您的优惠 ({count})", ja: "あなたの特典 ({count})", ko: "내 혜택 ({count})", ar: "عروضك ({count})",
    he: "המבצעים שלך ({count})", hi: "आपके ऑफ़र ({count})",
  },
  "customer.accountPage.personalCoupon": {
    en: "Personal offer",
    fr: "Offre personnelle", es: "Oferta personal", it: "Offerta personale",
    pt: "Oferta pessoal", "pt-BR": "Oferta pessoal", de: "Persönliches Angebot", nl: "Persoonlijke aanbieding",
    ro: "Ofertă personală", sv: "Personligt erbjudande", da: "Personligt tilbud", nb: "Personlig tilbud",
    fi: "Henkilökohtainen tarjous", pl: "Oferta osobista", cs: "Osobní nabídka", sk: "Osobná ponuka",
    hu: "Személyes ajánlat", el: "Προσωπική προσφορά", bg: "Лична оферта", hr: "Osobna ponuda",
    sr: "Лична понуда", sl: "Osebna ponudba", et: "Isiklik pakkumine", lv: "Personīgs piedāvājums",
    lt: "Asmeninis pasiūlymas", tr: "Kişisel fırsat", ru: "Личное предложение", uk: "Особиста пропозиція",
    ca: "Oferta personal", id: "Penawaran pribadi", vi: "Ưu đãi cá nhân", th: "ข้อเสนอส่วนตัว",
    zh: "专属优惠", ja: "あなた専用の特典", ko: "개인 혜택", ar: "عرض شخصي",
    he: "מבצע אישי", hi: "व्यक्तिगत ऑफ़र",
  },
  "customer.accountPage.noCoupons": {
    en: "No offers right now. {name} can send you personalised codes — they'll show up here.",
    fr: "Aucune offre pour le moment. {name} peut vous envoyer des codes personnalisés — ils apparaîtront ici.",
    es: "No hay ofertas por ahora. {name} puede enviarte códigos personalizados — aparecerán aquí.",
    it: "Nessuna offerta al momento. {name} può inviarti codici personalizzati — appariranno qui.",
    pt: "Sem ofertas de momento. {name} pode enviar-lhe códigos personalizados — aparecerão aqui.",
    "pt-BR": "Nenhuma oferta no momento. {name} pode enviar códigos personalizados — eles aparecerão aqui.",
    de: "Derzeit keine Angebote. {name} kann Ihnen personalisierte Codes senden — sie erscheinen hier.",
    nl: "Op dit moment geen aanbiedingen. {name} kan je gepersonaliseerde codes sturen — ze verschijnen hier.",
    ro: "Nicio ofertă momentan. {name} îți poate trimite coduri personalizate — vor apărea aici.",
    sv: "Inga erbjudanden just nu. {name} kan skicka personliga koder till dig — de visas här.",
    da: "Ingen tilbud lige nu. {name} kan sende dig personlige koder — de vises her.",
    nb: "Ingen tilbud akkurat nå. {name} kan sende deg personlige koder — de vises her.",
    fi: "Ei tarjouksia juuri nyt. {name} voi lähettää sinulle henkilökohtaisia koodeja — ne näkyvät täällä.",
    pl: "Brak ofert w tej chwili. {name} może wysłać Ci spersonalizowane kody — pojawią się tutaj.",
    cs: "Momentálně žádné nabídky. {name} vám může poslat personalizované kódy — zobrazí se zde.",
    sk: "Momentálne žiadne ponuky. {name} vám môže poslať personalizované kódy — zobrazia sa tu.",
    hu: "Most nincs ajánlat. {name} küldhet neked személyre szabott kódokat — itt fognak megjelenni.",
    el: "Καμία προσφορά αυτή τη στιγμή. Ο/Η {name} μπορεί να σας στείλει εξατομικευμένους κωδικούς — θα εμφανιστούν εδώ.",
    bg: "В момента няма оферти. {name} може да ви изпрати персонализирани кодове — ще се появят тук.",
    hr: "Trenutačno nema ponuda. {name} vam može poslati personalizirane kodove — pojavit će se ovdje.",
    sr: "Тренутно нема понуда. {name} вам може послати персонализоване кодове — појавиће се овде.",
    sl: "Trenutno ni ponudb. {name} vam lahko pošlje prilagojene kode — prikazale se bodo tukaj.",
    et: "Praegu pakkumisi pole. {name} saab saata teile isikupärastatud koode — need ilmuvad siia.",
    lv: "Pašlaik nav piedāvājumu. {name} var nosūtīt jums personalizētus kodus — tie parādīsies šeit.",
    lt: "Šiuo metu pasiūlymų nėra. {name} gali atsiųsti jums suasmenintus kodus — jie pasirodys čia.",
    tr: "Şu anda fırsat yok. {name} size kişiselleştirilmiş kodlar gönderebilir — burada görünecekler.",
    ru: "Сейчас нет предложений. {name} может прислать вам персональные коды — они появятся здесь.",
    uk: "Зараз немає пропозицій. {name} може надіслати вам персональні коди — вони з'являться тут.",
    ca: "Cap oferta ara mateix. {name} et pot enviar codis personalitzats — apareixeran aquí.",
    id: "Belum ada penawaran saat ini. {name} dapat mengirimi Anda kode yang dipersonalisasi — akan muncul di sini.",
    vi: "Hiện chưa có ưu đãi. {name} có thể gửi cho bạn các mã cá nhân hóa — chúng sẽ hiển thị ở đây.",
    th: "ยังไม่มีข้อเสนอในขณะนี้ {name} สามารถส่งโค้ดเฉพาะบุคคลให้คุณ — จะแสดงที่นี่",
    zh: "目前没有优惠。{name} 可以向您发送个性化代码——它们会显示在这里。",
    ja: "現在オファーはありません。{name} があなた専用のコードを送ると、ここに表示されます。",
    ko: "지금은 혜택이 없습니다. {name}이(가) 맞춤 코드를 보내면 여기에 표시됩니다.",
    ar: "لا توجد عروض حاليًا. يمكن لـ {name} إرسال رموز مخصصة لك — ستظهر هنا.",
    he: "אין מבצעים כרגע. {name} יכול לשלוח לך קודים מותאמים אישית — הם יופיעו כאן.",
    hi: "अभी कोई ऑफ़र नहीं है। {name} आपको व्यक्तिगत कोड भेज सकता है — वे यहाँ दिखाई देंगे।",
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
console.log(`✓ VIP polish strings added/reworded in ${n} locale(s).`);
