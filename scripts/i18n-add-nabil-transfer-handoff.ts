/**
 * Call-timeline labels for the A1 `transfer_handoff` event → all 38 locales,
 * MERGED into admin.phoneOrderingPage.callDetail.timeline.* (the existing keys
 * are left untouched). Fully translated — no English fallback — and every
 * locale must carry the same ICU placeholders as English, or the script fails.
 *
 *   npx tsx scripts/i18n-add-nabil-transfer-handoff.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Keys = {
  handoffLabel: string;
  handoffWritten: string;
  handoffWriteFailed: string;
  handoffSkipped: string;
  handoffHardClosed: string;
  handoffDropped: string;
};

const T: Record<string, Keys> = {
  en: {
    handoffLabel: "Hand-off to a person",
    handoffWritten: "reason saved before the hand-off",
    handoffWriteFailed: "reason not saved — the store was dialled from the fallback",
    handoffSkipped: "no hand-off record on this backend",
    handoffHardClosed: "closed by the service — the phone network never hung up",
    handoffDropped: "{count, plural, one {# caller message ignored after the hand-off} other {# caller messages ignored after the hand-off}}",
  },
  fr: {
    handoffLabel: "Transfert à une personne",
    handoffWritten: "motif enregistré avant le transfert",
    handoffWriteFailed: "motif non enregistré — le restaurant a été appelé via la solution de secours",
    handoffSkipped: "aucun enregistrement de transfert sur ce serveur",
    handoffHardClosed: "fermé par le service — le réseau téléphonique n'a jamais raccroché",
    handoffDropped: "{count, plural, one {# message de l'appelant ignoré après le transfert} other {# messages de l'appelant ignorés après le transfert}}",
  },
  es: {
    handoffLabel: "Transferencia a una persona",
    handoffWritten: "motivo guardado antes de la transferencia",
    handoffWriteFailed: "motivo no guardado — se llamó al restaurante por la vía de respaldo",
    handoffSkipped: "sin registro de transferencia en este servidor",
    handoffHardClosed: "cerrado por el servicio — la red telefónica nunca colgó",
    handoffDropped: "{count, plural, one {# mensaje del cliente ignorado tras la transferencia} other {# mensajes del cliente ignorados tras la transferencia}}",
  },
  it: {
    handoffLabel: "Passaggio a una persona",
    handoffWritten: "motivo salvato prima del passaggio",
    handoffWriteFailed: "motivo non salvato — il ristorante è stato chiamato tramite il percorso di riserva",
    handoffSkipped: "nessuna registrazione del passaggio su questo server",
    handoffHardClosed: "chiuso dal servizio — la rete telefonica non ha mai riagganciato",
    handoffDropped: "{count, plural, one {# messaggio del cliente ignorato dopo il passaggio} other {# messaggi del cliente ignorati dopo il passaggio}}",
  },
  pt: {
    handoffLabel: "Transferência para uma pessoa",
    handoffWritten: "motivo guardado antes da transferência",
    handoffWriteFailed: "motivo não guardado — o restaurante foi chamado pela via de recurso",
    handoffSkipped: "sem registo de transferência neste servidor",
    handoffHardClosed: "fechado pelo serviço — a rede telefónica nunca desligou",
    handoffDropped: "{count, plural, one {# mensagem do cliente ignorada após a transferência} other {# mensagens do cliente ignoradas após a transferência}}",
  },
  "pt-BR": {
    handoffLabel: "Transferência para uma pessoa",
    handoffWritten: "motivo salvo antes da transferência",
    handoffWriteFailed: "motivo não salvo — o restaurante foi chamado pela rota de reserva",
    handoffSkipped: "sem registro de transferência neste servidor",
    handoffHardClosed: "encerrado pelo serviço — a rede telefônica nunca desligou",
    handoffDropped: "{count, plural, one {# mensagem do cliente ignorada após a transferência} other {# mensagens do cliente ignoradas após a transferência}}",
  },
  de: {
    handoffLabel: "Weitergabe an eine Person",
    handoffWritten: "Grund vor der Weitergabe gespeichert",
    handoffWriteFailed: "Grund nicht gespeichert — das Restaurant wurde über den Ausweichweg angerufen",
    handoffSkipped: "kein Weitergabe-Eintrag auf diesem Backend",
    handoffHardClosed: "vom Dienst beendet — das Telefonnetz hat nie aufgelegt",
    handoffDropped: "{count, plural, one {# Nachricht des Anrufers nach der Weitergabe ignoriert} other {# Nachrichten des Anrufers nach der Weitergabe ignoriert}}",
  },
  nl: {
    handoffLabel: "Doorverbinden met een medewerker",
    handoffWritten: "reden opgeslagen vóór het doorverbinden",
    handoffWriteFailed: "reden niet opgeslagen — het restaurant is via de noodroute gebeld",
    handoffSkipped: "geen doorverbind-record op deze backend",
    handoffHardClosed: "gesloten door de service — het telefoonnetwerk heeft nooit opgehangen",
    handoffDropped: "{count, plural, one {# bericht van de beller genegeerd na het doorverbinden} other {# berichten van de beller genegeerd na het doorverbinden}}",
  },
  ro: {
    handoffLabel: "Transfer către o persoană",
    handoffWritten: "motiv salvat înainte de transfer",
    handoffWriteFailed: "motiv nesalvat — restaurantul a fost apelat prin ruta de rezervă",
    handoffSkipped: "nicio înregistrare de transfer pe acest server",
    handoffHardClosed: "închis de serviciu — rețeaua telefonică nu a închis niciodată",
    handoffDropped: "{count, plural, one {# mesaj al apelantului ignorat după transfer} other {# mesaje ale apelantului ignorate după transfer}}",
  },
  sv: {
    handoffLabel: "Överlämning till en person",
    handoffWritten: "orsak sparad före överlämningen",
    handoffWriteFailed: "orsak inte sparad — restaurangen ringdes via reservvägen",
    handoffSkipped: "ingen överlämningspost på denna server",
    handoffHardClosed: "stängd av tjänsten — telefonnätet lade aldrig på",
    handoffDropped: "{count, plural, one {# meddelande från den som ringde ignorerades efter överlämningen} other {# meddelanden från den som ringde ignorerades efter överlämningen}}",
  },
  da: {
    handoffLabel: "Overdragelse til en person",
    handoffWritten: "årsag gemt før overdragelsen",
    handoffWriteFailed: "årsag ikke gemt — restauranten blev ringet op via nødvejen",
    handoffSkipped: "ingen overdragelsespost på denne server",
    handoffHardClosed: "lukket af tjenesten — telefonnettet lagde aldrig på",
    handoffDropped: "{count, plural, one {# besked fra opkalderen ignoreret efter overdragelsen} other {# beskeder fra opkalderen ignoreret efter overdragelsen}}",
  },
  nb: {
    handoffLabel: "Overføring til en person",
    handoffWritten: "årsak lagret før overføringen",
    handoffWriteFailed: "årsak ikke lagret — restauranten ble ringt via reserveløsningen",
    handoffSkipped: "ingen overføringsoppføring på denne serveren",
    handoffHardClosed: "lukket av tjenesten — telefonnettet la aldri på",
    handoffDropped: "{count, plural, one {# melding fra innringeren ignorert etter overføringen} other {# meldinger fra innringeren ignorert etter overføringen}}",
  },
  fi: {
    handoffLabel: "Siirto henkilölle",
    handoffWritten: "syy tallennettu ennen siirtoa",
    handoffWriteFailed: "syytä ei tallennettu — ravintolaan soitettiin varareittiä pitkin",
    handoffSkipped: "ei siirtomerkintää tällä palvelimella",
    handoffHardClosed: "palvelu sulki puhelun — puhelinverkko ei koskaan katkaissut",
    handoffDropped: "{count, plural, one {# soittajan viesti ohitettu siirron jälkeen} other {# soittajan viestiä ohitettu siirron jälkeen}}",
  },
  pl: {
    handoffLabel: "Przekazanie do pracownika",
    handoffWritten: "powód zapisany przed przekazaniem",
    handoffWriteFailed: "powód niezapisany — do restauracji zadzwoniono ścieżką awaryjną",
    handoffSkipped: "brak wpisu o przekazaniu na tym serwerze",
    handoffHardClosed: "zamknięte przez usługę — sieć telefoniczna nigdy się nie rozłączyła",
    handoffDropped: "{count, plural, one {# wiadomość dzwoniącego zignorowana po przekazaniu} few {# wiadomości dzwoniącego zignorowane po przekazaniu} other {# wiadomości dzwoniącego zignorowanych po przekazaniu}}",
  },
  cs: {
    handoffLabel: "Předání člověku",
    handoffWritten: "důvod uložen před předáním",
    handoffWriteFailed: "důvod neuložen — restaurace byla volána záložní cestou",
    handoffSkipped: "na tomto serveru není záznam o předání",
    handoffHardClosed: "ukončeno službou — telefonní síť nikdy nezavěsila",
    handoffDropped: "{count, plural, one {# zpráva volajícího po předání ignorována} few {# zprávy volajícího po předání ignorovány} other {# zpráv volajícího po předání ignorováno}}",
  },
  sk: {
    handoffLabel: "Odovzdanie osobe",
    handoffWritten: "dôvod uložený pred odovzdaním",
    handoffWriteFailed: "dôvod neuložený — reštaurácia bola volaná záložnou cestou",
    handoffSkipped: "na tomto serveri nie je záznam o odovzdaní",
    handoffHardClosed: "ukončené službou — telefónna sieť nikdy nezavesila",
    handoffDropped: "{count, plural, one {# správa volajúceho po odovzdaní ignorovaná} few {# správy volajúceho po odovzdaní ignorované} other {# správ volajúceho po odovzdaní ignorovaných}}",
  },
  hu: {
    handoffLabel: "Átadás egy munkatársnak",
    handoffWritten: "ok elmentve az átadás előtt",
    handoffWriteFailed: "ok nincs elmentve — az éttermet a tartalék úton hívtuk",
    handoffSkipped: "nincs átadási bejegyzés ezen a szerveren",
    handoffHardClosed: "a szolgáltatás zárta le — a telefonhálózat sosem bontotta a vonalat",
    handoffDropped: "{count, plural, one {# hívói üzenet figyelmen kívül hagyva az átadás után} other {# hívói üzenet figyelmen kívül hagyva az átadás után}}",
  },
  el: {
    handoffLabel: "Μεταβίβαση σε άτομο",
    handoffWritten: "ο λόγος αποθηκεύτηκε πριν από τη μεταβίβαση",
    handoffWriteFailed: "ο λόγος δεν αποθηκεύτηκε — το εστιατόριο κλήθηκε μέσω της εφεδρικής διαδρομής",
    handoffSkipped: "δεν υπάρχει εγγραφή μεταβίβασης σε αυτόν τον διακομιστή",
    handoffHardClosed: "έκλεισε από την υπηρεσία — το τηλεφωνικό δίκτυο δεν έκλεισε ποτέ τη γραμμή",
    handoffDropped: "{count, plural, one {# μήνυμα του καλούντος αγνοήθηκε μετά τη μεταβίβαση} other {# μηνύματα του καλούντος αγνοήθηκαν μετά τη μεταβίβαση}}",
  },
  bg: {
    handoffLabel: "Прехвърляне към човек",
    handoffWritten: "причината е записана преди прехвърлянето",
    handoffWriteFailed: "причината не е записана — ресторантът беше набран по резервния маршрут",
    handoffSkipped: "няма запис за прехвърляне на този сървър",
    handoffHardClosed: "затворено от услугата — телефонната мрежа така и не затвори",
    handoffDropped: "{count, plural, one {# съобщение на обаждащия се е игнорирано след прехвърлянето} other {# съобщения на обаждащия се са игнорирани след прехвърлянето}}",
  },
  hr: {
    handoffLabel: "Prebacivanje na osobu",
    handoffWritten: "razlog spremljen prije prebacivanja",
    handoffWriteFailed: "razlog nije spremljen — restoran je nazvan rezervnim putem",
    handoffSkipped: "nema zapisa o prebacivanju na ovom poslužitelju",
    handoffHardClosed: "zatvorila usluga — telefonska mreža nikada nije prekinula vezu",
    handoffDropped: "{count, plural, one {# poruka pozivatelja zanemarena nakon prebacivanja} few {# poruke pozivatelja zanemarene nakon prebacivanja} other {# poruka pozivatelja zanemareno nakon prebacivanja}}",
  },
  sr: {
    handoffLabel: "Prebacivanje na osobu",
    handoffWritten: "razlog sačuvan pre prebacivanja",
    handoffWriteFailed: "razlog nije sačuvan — restoran je pozvan rezervnom putanjom",
    handoffSkipped: "nema zapisa o prebacivanju na ovom serveru",
    handoffHardClosed: "zatvorio servis — telefonska mreža nikada nije prekinula vezu",
    handoffDropped: "{count, plural, one {# poruka pozivaoca zanemarena posle prebacivanja} few {# poruke pozivaoca zanemarene posle prebacivanja} other {# poruka pozivaoca zanemareno posle prebacivanja}}",
  },
  sl: {
    handoffLabel: "Predaja osebi",
    handoffWritten: "razlog shranjen pred predajo",
    handoffWriteFailed: "razlog ni shranjen — restavracija je bila poklicana po rezervni poti",
    handoffSkipped: "na tem strežniku ni zapisa o predaji",
    handoffHardClosed: "zaprla storitev — telefonsko omrežje ni nikoli odložilo",
    handoffDropped: "{count, plural, one {# sporočilo klicatelja prezrto po predaji} two {# sporočili klicatelja prezrti po predaji} few {# sporočila klicatelja prezrta po predaji} other {# sporočil klicatelja prezrtih po predaji}}",
  },
  et: {
    handoffLabel: "Üleandmine inimesele",
    handoffWritten: "põhjus salvestati enne üleandmist",
    handoffWriteFailed: "põhjust ei salvestatud — restoranile helistati varuteed pidi",
    handoffSkipped: "selles taustsüsteemis puudub üleandmise kirje",
    handoffHardClosed: "teenus sulges kõne — telefonivõrk ei katkestanud kunagi",
    handoffDropped: "{count, plural, one {# helistaja sõnum jäeti pärast üleandmist tähelepanuta} other {# helistaja sõnumit jäeti pärast üleandmist tähelepanuta}}",
  },
  lv: {
    handoffLabel: "Nodošana cilvēkam",
    handoffWritten: "iemesls saglabāts pirms nodošanas",
    handoffWriteFailed: "iemesls nav saglabāts — restorānam zvanīts pa rezerves ceļu",
    handoffSkipped: "šajā serverī nav nodošanas ieraksta",
    handoffHardClosed: "pakalpojums beidza zvanu — tālruņa tīkls nekad nepārtrauca savienojumu",
    handoffDropped: "{count, plural, one {# zvanītāja ziņa ignorēta pēc nodošanas} other {# zvanītāja ziņas ignorētas pēc nodošanas}}",
  },
  lt: {
    handoffLabel: "Perdavimas žmogui",
    handoffWritten: "priežastis išsaugota prieš perdavimą",
    handoffWriteFailed: "priežastis neišsaugota — restoranui skambinta atsarginiu keliu",
    handoffSkipped: "šiame serveryje nėra perdavimo įrašo",
    handoffHardClosed: "uždarė paslauga — telefono tinklas niekada nepadėjo ragelio",
    handoffDropped: "{count, plural, one {# skambinančiojo žinutė ignoruota po perdavimo} few {# skambinančiojo žinutės ignoruotos po perdavimo} other {# skambinančiojo žinučių ignoruota po perdavimo}}",
  },
  tr: {
    handoffLabel: "Bir kişiye aktarma",
    handoffWritten: "neden aktarmadan önce kaydedildi",
    handoffWriteFailed: "neden kaydedilmedi — restoran yedek yol üzerinden arandı",
    handoffSkipped: "bu sunucuda aktarma kaydı yok",
    handoffHardClosed: "hizmet tarafından kapatıldı — telefon ağı hiç kapatmadı",
    handoffDropped: "{count, plural, one {aktarmadan sonra # arayan mesajı yok sayıldı} other {aktarmadan sonra # arayan mesajı yok sayıldı}}",
  },
  ru: {
    handoffLabel: "Передача человеку",
    handoffWritten: "причина сохранена до передачи",
    handoffWriteFailed: "причина не сохранена — ресторан набран по резервному маршруту",
    handoffSkipped: "на этом сервере нет записи о передаче",
    handoffHardClosed: "закрыто сервисом — телефонная сеть так и не повесила трубку",
    handoffDropped: "{count, plural, one {# сообщение звонящего проигнорировано после передачи} few {# сообщения звонящего проигнорированы после передачи} other {# сообщений звонящего проигнорировано после передачи}}",
  },
  uk: {
    handoffLabel: "Передача людині",
    handoffWritten: "причину збережено до передачі",
    handoffWriteFailed: "причину не збережено — ресторан набрано резервним шляхом",
    handoffSkipped: "на цьому сервері немає запису про передачу",
    handoffHardClosed: "закрито сервісом — телефонна мережа так і не поклала слухавку",
    handoffDropped: "{count, plural, one {# повідомлення того, хто телефонує, проігноровано після передачі} few {# повідомлення того, хто телефонує, проігноровано після передачі} other {# повідомлень того, хто телефонує, проігноровано після передачі}}",
  },
  ca: {
    handoffLabel: "Transferència a una persona",
    handoffWritten: "motiu desat abans de la transferència",
    handoffWriteFailed: "motiu no desat — s'ha trucat al restaurant per la via de reserva",
    handoffSkipped: "cap registre de transferència en aquest servidor",
    handoffHardClosed: "tancat pel servei — la xarxa telefònica no ha penjat mai",
    handoffDropped: "{count, plural, one {# missatge de qui truca ignorat després de la transferència} other {# missatges de qui truca ignorats després de la transferència}}",
  },
  id: {
    handoffLabel: "Pengalihan ke staf",
    handoffWritten: "alasan disimpan sebelum pengalihan",
    handoffWriteFailed: "alasan tidak disimpan — restoran dihubungi lewat jalur cadangan",
    handoffSkipped: "tidak ada catatan pengalihan di backend ini",
    handoffHardClosed: "ditutup oleh layanan — jaringan telepon tidak pernah memutus panggilan",
    handoffDropped: "{count, plural, one {# pesan penelepon diabaikan setelah pengalihan} other {# pesan penelepon diabaikan setelah pengalihan}}",
  },
  vi: {
    handoffLabel: "Chuyển cho nhân viên",
    handoffWritten: "lý do đã được lưu trước khi chuyển",
    handoffWriteFailed: "lý do chưa được lưu — đã gọi nhà hàng qua đường dự phòng",
    handoffSkipped: "không có bản ghi chuyển cuộc gọi trên máy chủ này",
    handoffHardClosed: "dịch vụ đã đóng — mạng điện thoại không bao giờ ngắt",
    handoffDropped: "{count, plural, one {# tin nhắn của người gọi bị bỏ qua sau khi chuyển} other {# tin nhắn của người gọi bị bỏ qua sau khi chuyển}}",
  },
  th: {
    handoffLabel: "ส่งต่อให้พนักงาน",
    handoffWritten: "บันทึกเหตุผลก่อนส่งต่อแล้ว",
    handoffWriteFailed: "ไม่ได้บันทึกเหตุผล — โทรหาร้านผ่านเส้นทางสำรอง",
    handoffSkipped: "ไม่มีบันทึกการส่งต่อในระบบนี้",
    handoffHardClosed: "ปิดโดยระบบ — เครือข่ายโทรศัพท์ไม่ได้วางสาย",
    handoffDropped: "{count, plural, one {ข้อความของผู้โทร # รายการถูกละเว้นหลังส่งต่อ} other {ข้อความของผู้โทร # รายการถูกละเว้นหลังส่งต่อ}}",
  },
  zh: {
    handoffLabel: "转接给人工",
    handoffWritten: "转接原因已在转接前保存",
    handoffWriteFailed: "转接原因未保存 — 已通过备用线路呼叫餐厅",
    handoffSkipped: "此后端没有转接记录",
    handoffHardClosed: "由服务端关闭 — 电话网络从未挂断",
    handoffDropped: "{count, plural, one {转接后忽略了 # 条来电者消息} other {转接后忽略了 # 条来电者消息}}",
  },
  ja: {
    handoffLabel: "担当者への引き継ぎ",
    handoffWritten: "引き継ぎ前に理由を保存済み",
    handoffWriteFailed: "理由が保存されませんでした — 予備経路で店舗に発信しました",
    handoffSkipped: "このバックエンドに引き継ぎ記録はありません",
    handoffHardClosed: "サービス側で終了 — 電話網が切断しなかったため",
    handoffDropped: "{count, plural, one {引き継ぎ後に発信者のメッセージ # 件を無視} other {引き継ぎ後に発信者のメッセージ # 件を無視}}",
  },
  ko: {
    handoffLabel: "직원에게 연결",
    handoffWritten: "연결 전에 사유 저장됨",
    handoffWriteFailed: "사유가 저장되지 않음 — 예비 경로로 매장에 전화함",
    handoffSkipped: "이 백엔드에 연결 기록 없음",
    handoffHardClosed: "서비스가 종료함 — 전화망이 끊지 않음",
    handoffDropped: "{count, plural, one {연결 후 발신자 메시지 #건 무시됨} other {연결 후 발신자 메시지 #건 무시됨}}",
  },
  ar: {
    handoffLabel: "تحويل إلى موظف",
    handoffWritten: "تم حفظ السبب قبل التحويل",
    handoffWriteFailed: "لم يُحفظ السبب — تم الاتصال بالمطعم عبر المسار الاحتياطي",
    handoffSkipped: "لا يوجد سجل تحويل على هذا الخادم",
    handoffHardClosed: "أُغلقت بواسطة الخدمة — شبكة الهاتف لم تُنهِ المكالمة",
    handoffDropped: "{count, plural, one {تم تجاهل رسالة واحدة من المتصل بعد التحويل} two {تم تجاهل رسالتين من المتصل بعد التحويل} few {تم تجاهل # رسائل من المتصل بعد التحويل} many {تم تجاهل # رسالة من المتصل بعد التحويل} other {تم تجاهل # رسالة من المتصل بعد التحويل}}",
  },
  he: {
    handoffLabel: "העברה לנציג",
    handoffWritten: "הסיבה נשמרה לפני ההעברה",
    handoffWriteFailed: "הסיבה לא נשמרה — המסעדה חויגה דרך מסלול הגיבוי",
    handoffSkipped: "אין רשומת העברה בשרת זה",
    handoffHardClosed: "נסגר על ידי השירות — רשת הטלפון מעולם לא ניתקה",
    handoffDropped: "{count, plural, one {הודעה אחת של המתקשר התעלמה לאחר ההעברה} two {שתי הודעות של המתקשר התעלמו לאחר ההעברה} other {# הודעות של המתקשר התעלמו לאחר ההעברה}}",
  },
  hi: {
    handoffLabel: "किसी व्यक्ति को सौंपना",
    handoffWritten: "सौंपने से पहले कारण सहेजा गया",
    handoffWriteFailed: "कारण सहेजा नहीं गया — रेस्तरां को बैकअप मार्ग से कॉल किया गया",
    handoffSkipped: "इस बैकएंड पर सौंपने का कोई रिकॉर्ड नहीं",
    handoffHardClosed: "सेवा द्वारा बंद — फ़ोन नेटवर्क ने कभी कॉल नहीं काटी",
    handoffDropped: "{count, plural, one {सौंपने के बाद कॉलर का # संदेश अनदेखा किया गया} other {सौंपने के बाद कॉलर के # संदेश अनदेखे किए गए}}",
  },
};

const MESSAGES_DIR = path.join(process.cwd(), "src", "messages");
const KEYS = Object.keys(T.en) as (keyof Keys)[];

/** ICU arg names, plural branches stripped (mirrors scripts/i18n-parity-all.ts). */
function placeholderArgs(s: string): Set<string> {
  let prev: string;
  let cur = s;
  const branch = /\b(?:zero|one|two|few|many|other|=\d+)\s*\{[^{}]*\}/g;
  do {
    prev = cur;
    cur = cur.replace(branch, " ");
  } while (cur !== prev);
  const args = new Set<string>();
  for (const m of cur.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*(?:,|\})/g)) args.add(m[1]);
  return args;
}
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

let changed = 0;
for (const locale of SUPPORTED_LOCALES) {
  const tr = T[locale];
  if (!tr) {
    console.error(`✗ ${locale}: NO TRANSLATION — refusing to write an English fallback.`);
    process.exitCode = 1;
    continue;
  }
  let bad = false;
  for (const k of KEYS) {
    if (typeof tr[k] !== "string" || !tr[k].trim()) {
      console.error(`✗ ${locale}: missing key ${k}`);
      bad = true;
      continue;
    }
    if (!sameSet(placeholderArgs(T.en[k]), placeholderArgs(tr[k]))) {
      console.error(`✗ ${locale}: ${k} placeholder mismatch`);
      bad = true;
    }
  }
  if (bad) {
    process.exitCode = 1;
    continue;
  }
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const timeline = json?.admin?.phoneOrderingPage?.callDetail?.timeline;
  if (!timeline || typeof timeline !== "object") {
    console.error(`✗ ${locale}: admin.phoneOrderingPage.callDetail.timeline missing`);
    process.exitCode = 1;
    continue;
  }
  for (const k of KEYS) timeline[k] = tr[k]; // MERGE — existing timeline keys untouched
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✓ merged ${KEYS.length} keys under admin.phoneOrderingPage.callDetail.timeline into ${changed}/${SUPPORTED_LOCALES.length} locales`);
