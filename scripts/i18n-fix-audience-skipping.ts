/**
 * Fix admin.autopilotClient.audienceSkipping across all 38 locales.
 *
 * The old copy read "Everyone who matches a campaign trigger — except members
 * already on club pricing", which claims club members are EXCLUDED. That is only
 * true when a campaign's VIP mode is "skip". The default is "no_offer", where
 * members DO still get the email (just without a coupon) — so the sentence told
 * owners the opposite of what their store was doing. Luigi read it exactly that
 * way on 2026-08-12 and had to ask.
 *
 * The audience card can't know the per-campaign mode (there are three), so the
 * fix is to stop asserting an outcome and point at the control that decides it.
 *
 * Placeholders {count} and {groups} are preserved in every locale — the parity
 * audit enforces that.
 */
import { readFileSync, writeFileSync } from "node:fs";

const KEY_PATH = ["admin", "autopilotClient", "audienceSkipping"];

const T: Record<string, string> = {
  en: "Everyone who matches a campaign trigger. What members already on club pricing get is set per campaign, under “Club members”. Currently {count} in {groups}.",
  ar: "كل من ينطبق عليه مُشغِّل الحملة. ما يحصل عليه الأعضاء المستفيدون من أسعار النادي يُحدَّد لكل حملة على حدة، ضمن «أعضاء النادي». حاليًا {count} في {groups}.",
  bg: "Всеки, който отговаря на условието на кампанията. Какво получават членовете с клубни цени се задава за всяка кампания поотделно, в „Членове на клуба“. В момента {count} в {groups}.",
  ca: "Tothom que compleixi el desencadenant d’una campanya. Què reben els membres que ja tenen preus de club es defineix per campanya, a «Membres del club». Actualment {count} a {groups}.",
  cs: "Každý, kdo splní spouštěč kampaně. Co dostanou členové s klubovými cenami, se nastavuje u každé kampaně zvlášť v části „Členové klubu“. Aktuálně {count} v {groups}.",
  da: "Alle, der matcher en kampagnetrigger. Hvad medlemmer med klubpriser får, indstilles per kampagne under “Klubmedlemmer”. Aktuelt {count} i {groups}.",
  de: "Alle, auf die ein Kampagnen-Auslöser zutrifft. Was Mitglieder mit Club-Preisen erhalten, wird pro Kampagne unter „Club-Mitglieder“ festgelegt. Aktuell {count} in {groups}.",
  el: "Όλοι όσοι πληρούν το έναυσμα μιας καμπάνιας. Το τι λαμβάνουν τα μέλη με τιμές λέσχης ορίζεται ανά καμπάνια, στο «Μέλη λέσχης». Αυτή τη στιγμή {count} σε {groups}.",
  es: "Todos los que cumplan el disparador de una campaña. Lo que reciben los miembros que ya tienen precios de club se configura por campaña, en «Miembros del club». Actualmente {count} en {groups}.",
  et: "Kõik, kes vastavad kampaania käivitajale. Mida saavad kliubihindadega liikmed, määratakse kampaaniate kaupa jaotises „Klubiliikmed“. Praegu {count} rühmades {groups}.",
  fi: "Kaikki, jotka täyttävät kampanjan ehdon. Se, mitä klubihinnoittelun jäsenet saavat, määritetään kampanjakohtaisesti kohdassa ”Klubin jäsenet”. Tällä hetkellä {count} ryhmissä {groups}.",
  fr: "Toute personne correspondant au déclencheur d’une campagne. Ce que reçoivent les membres bénéficiant déjà des tarifs club se règle campagne par campagne, sous « Membres du club ». Actuellement {count} dans {groups}.",
  he: "כל מי שעונה על תנאי ההפעלה של קמפיין. מה שמקבלים חברים שכבר נהנים מתמחור מועדון נקבע לכל קמפיין בנפרד, תחת ‏„חברי מועדון“. כרגע {count} ב־{groups}.",
  hi: "हर वह व्यक्ति जो किसी कैंपेन ट्रिगर से मेल खाता है। क्लब प्राइसिंग वाले सदस्यों को क्या मिलेगा, यह हर कैंपेन में अलग से “क्लब सदस्य” के अंतर्गत तय होता है। फ़िलहाल {groups} में {count}।",
  hr: "Svi koji odgovaraju okidaču kampanje. Što dobivaju članovi s klupskim cijenama postavlja se za svaku kampanju zasebno, pod „Članovi kluba“. Trenutačno {count} u {groups}.",
  hu: "Mindenki, akire illik egy kampányindító feltétel. Azt, hogy a klubáras tagok mit kapnak, kampányonként állítod be a „Klubtagok” résznél. Jelenleg {count} a következőkben: {groups}.",
  id: "Semua orang yang memenuhi pemicu kampanye. Apa yang diterima anggota dengan harga klub diatur per kampanye, di bagian “Anggota klub”. Saat ini {count} di {groups}.",
  it: "Tutti coloro che rientrano in un trigger di campagna. Ciò che ricevono i membri che hanno già prezzi da club si imposta per singola campagna, in «Membri del club». Attualmente {count} in {groups}.",
  ja: "キャンペーンの条件に該当するすべての人。クラブ価格の対象メンバーに何を送るかは、「クラブメンバー」でキャンペーンごとに設定します。現在 {groups} に {count} 名。",
  ko: "캠페인 조건에 해당하는 모든 사람. 클럽 가격이 적용되는 회원에게 무엇을 보낼지는 ‘클럽 회원’에서 캠페인별로 설정합니다. 현재 {groups}에 {count}명.",
  lt: "Visi, kurie atitinka kampanijos sąlygą. Ką gauna nariai, jau turintys klubo kainas, nustatoma kiekvienai kampanijai atskirai skiltyje „Klubo nariai“. Šiuo metu {count} grupėse {groups}.",
  lv: "Visi, kas atbilst kampaņas nosacījumam. To, ko saņem dalībnieki ar kluba cenām, iestata katrai kampaņai atsevišķi sadaļā “Kluba dalībnieki”. Pašlaik {count} grupās {groups}.",
  nb: "Alle som treffer en kampanjeutløser. Hva medlemmer med klubbpriser får, angis per kampanje under «Klubbmedlemmer». For øyeblikket {count} i {groups}.",
  nl: "Iedereen die aan een campagnetrigger voldoet. Wat leden met clubprijzen krijgen, stel je per campagne in onder ‘Clubleden’. Op dit moment {count} in {groups}.",
  pl: "Każdy, kto spełnia warunek kampanii. To, co otrzymują członkowie z cenami klubowymi, ustawia się osobno dla każdej kampanii w sekcji „Członkowie klubu”. Obecnie {count} w {groups}.",
  "pt-BR": "Todos que atendem ao gatilho de uma campanha. O que os membros que já têm preços de clube recebem é definido por campanha, em “Membros do clube”. Atualmente {count} em {groups}.",
  pt: "Todos os que correspondem ao acionador de uma campanha. O que recebem os membros que já têm preços de clube define-se por campanha, em «Membros do clube». Atualmente {count} em {groups}.",
  ro: "Toți cei care corespund unui declanșator de campanie. Ce primesc membrii care au deja prețuri de club se setează pentru fiecare campanie, la „Membrii clubului”. În prezent {count} în {groups}.",
  ru: "Все, кто подходит под условие кампании. То, что получают участники с клубными ценами, задаётся для каждой кампании отдельно в разделе «Участники клуба». Сейчас {count} в {groups}.",
  sk: "Každý, kto spĺňa spúšťač kampane. To, čo dostanú členovia s klubovými cenami, sa nastavuje pre každú kampaň zvlášť v časti „Členovia klubu“. Aktuálne {count} v {groups}.",
  sl: "Vsi, ki ustrezajo sprožilcu kampanje. Kaj dobijo člani s klubskimi cenami, se nastavi za vsako kampanjo posebej pod »Člani kluba«. Trenutno {count} v {groups}.",
  sr: "Сви који одговарају окидачу кампање. Шта добијају чланови са клупским ценама подешава се за сваку кампању посебно, у одељку „Чланови клуба“. Тренутно {count} у {groups}.",
  sv: "Alla som matchar en kampanjutlösare. Vad medlemmar med klubbpriser får ställs in per kampanj, under ”Klubbmedlemmar”. För närvarande {count} i {groups}.",
  th: "ทุกคนที่ตรงกับเงื่อนไขของแคมเปญ สิ่งที่สมาชิกซึ่งได้ราคาสมาชิกอยู่แล้วจะได้รับนั้นตั้งค่าแยกในแต่ละแคมเปญ ที่หัวข้อ “สมาชิกคลับ” ขณะนี้มี {count} รายใน {groups}",
  tr: "Bir kampanya tetikleyicisine uyan herkes. Kulüp fiyatlandırmasındaki üyelerin ne alacağı, “Kulüp üyeleri” altında her kampanya için ayrı ayarlanır. Şu anda {groups} içinde {count} kişi.",
  uk: "Усі, хто відповідає умові кампанії. Те, що отримують учасники з клубними цінами, налаштовується для кожної кампанії окремо в розділі «Учасники клубу». Наразі {count} у {groups}.",
  vi: "Tất cả những người khớp với điều kiện kích hoạt chiến dịch. Những gì thành viên đã có giá câu lạc bộ nhận được sẽ được đặt riêng cho từng chiến dịch, tại “Thành viên câu lạc bộ”. Hiện có {count} trong {groups}.",
  zh: "所有符合活动触发条件的人。已享会员价的成员会收到什么，在“俱乐部会员”中按活动分别设置。目前 {groups} 中有 {count} 人。",
};

let changed = 0;
for (const [locale, value] of Object.entries(T)) {
  const path = `src/messages/${locale}.json`;
  const raw = readFileSync(path, "utf8");
  const json = JSON.parse(raw);
  let node: any = json;
  for (const k of KEY_PATH.slice(0, -1)) {
    if (!node[k]) throw new Error(`${locale}: missing path ${KEY_PATH.join(".")}`);
    node = node[k];
  }
  const leaf = KEY_PATH[KEY_PATH.length - 1];
  if (!(leaf in node)) throw new Error(`${locale}: missing key ${leaf}`);
  for (const ph of ["{count}", "{groups}"]) {
    if (!value.includes(ph)) throw new Error(`${locale}: translation dropped ${ph}`);
  }
  node[leaf] = value;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`Updated audienceSkipping in ${changed} locales.`);
