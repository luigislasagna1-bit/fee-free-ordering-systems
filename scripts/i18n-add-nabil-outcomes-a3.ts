/**
 * A3 (2026-08-22) — MERGE two new call-outcome labels into
 * `admin.phoneOrderingPage.callLog.outcome` ×38:
 *   abandoned_with_cart — the caller hung up with food in the cart
 *   dropped             — the service lost the call record (stale sweep)
 *
 *   npx tsx scripts/i18n-add-nabil-outcomes-a3.ts
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "src", "messages");

const T: Record<string, [string, string]> = {
  en: ["Left mid-order", "Dropped (service)"],
  fr: ["Parti en pleine commande", "Coupé (service)"],
  es: ["Colgó a mitad del pedido", "Caída (servicio)"],
  it: ["Interrotta a metà ordine", "Persa (servizio)"],
  pt: ["Desistiu a meio do pedido", "Perdida (serviço)"],
  "pt-BR": ["Desistiu no meio do pedido", "Perdida (serviço)"],
  de: ["Mitten in der Bestellung aufgelegt", "Abgebrochen (Dienst)"],
  nl: ["Halverwege de bestelling opgehangen", "Weggevallen (dienst)"],
  ro: ["Abandonat în timpul comenzii", "Pierdut (serviciu)"],
  sv: ["Lade på mitt i beställningen", "Tappat (tjänsten)"],
  da: ["Lagde på midt i bestillingen", "Tabt (tjenesten)"],
  nb: ["La på midt i bestillingen", "Mistet (tjenesten)"],
  fi: ["Lopetti kesken tilauksen", "Katkesi (palvelu)"],
  pl: ["Rozłączono w trakcie zamówienia", "Utracone (usługa)"],
  cs: ["Zavěšeno uprostřed objednávky", "Ztraceno (služba)"],
  sk: ["Zavesené uprostred objednávky", "Stratené (služba)"],
  hu: ["Rendelés közben letette", "Megszakadt (szolgáltatás)"],
  el: ["Έκλεισε στη μέση της παραγγελίας", "Χάθηκε (υπηρεσία)"],
  bg: ["Затворил по средата на поръчката", "Прекъснато (услуга)"],
  hr: ["Prekinuto usred narudžbe", "Izgubljeno (usluga)"],
  sr: ["Prekinuto usred porudžbine", "Izgubljeno (usluga)"],
  sl: ["Prekinjeno sredi naročila", "Izgubljeno (storitev)"],
  et: ["Katkestas keset tellimust", "Kadunud (teenus)"],
  lv: ["Pārtraukts pasūtījuma vidū", "Zaudēts (pakalpojums)"],
  lt: ["Nutraukta užsakymo viduryje", "Prarasta (paslauga)"],
  tr: ["Sipariş ortasında kapattı", "Düştü (servis)"],
  ru: ["Положил трубку посреди заказа", "Потерян (сервис)"],
  uk: ["Поклав слухавку посеред замовлення", "Втрачено (сервіс)"],
  ca: ["Ha penjat a mitja comanda", "Perduda (servei)"],
  id: ["Menutup telepon di tengah pesanan", "Terputus (layanan)"],
  vi: ["Cúp máy giữa đơn hàng", "Mất kết nối (dịch vụ)"],
  th: ["วางสายกลางคันขณะสั่ง", "สายหลุด (ระบบ)"],
  zh: ["下单中途挂断", "掉线（服务）"],
  ja: ["注文の途中で切断", "切断（サービス側）"],
  ko: ["주문 도중 끊음", "끊김 (서비스)"],
  ar: ["أغلق في منتصف الطلب", "انقطعت (الخدمة)"],
  he: ["ניתק באמצע ההזמנה", "נותקה (שירות)"],
  hi: ["ऑर्डर के बीच में फ़ोन काट दिया", "कट गई (सेवा)"],
};

function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  let changed = 0;
  for (const f of files) {
    const locale = f.replace(/\.json$/, "");
    const t = T[locale];
    if (!t) {
      console.error(`✗ no translation for ${locale}`);
      process.exit(1);
    }
    const file = path.join(DIR, f);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const outcome = json?.admin?.phoneOrderingPage?.callLog?.outcome;
    if (!outcome) {
      console.error(`✗ ${locale}: admin.phoneOrderingPage.callLog.outcome missing`);
      process.exit(1);
    }
    let touched = false;
    if (outcome.abandoned_with_cart !== t[0]) { outcome.abandoned_with_cart = t[0]; touched = true; }
    if (outcome.dropped !== t[1]) { outcome.dropped = t[1]; touched = true; }
    if (touched) {
      fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
      changed++;
    }
  }
  console.log(`✓ ${files.length} locale files checked, ${changed} updated`);
}

main();
