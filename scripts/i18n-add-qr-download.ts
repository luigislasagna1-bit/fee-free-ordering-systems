/** i18n: admin.marketingStudio.downloadQr (Marketing Studio P2) × 38 locales.
 *   npx tsx scripts/i18n-add-qr-download.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");
const T: Record<string, string> = {
  en: "Download QR", fr: "Télécharger le QR", es: "Descargar QR", it: "Scarica QR", pt: "Transferir QR", "pt-BR": "Baixar QR",
  de: "QR herunterladen", nl: "QR downloaden", ro: "Descarcă QR", sv: "Ladda ner QR", da: "Download QR", nb: "Last ned QR",
  fi: "Lataa QR", pl: "Pobierz QR", cs: "Stáhnout QR", sk: "Stiahnuť QR", hu: "QR letöltése", el: "Λήψη QR",
  bg: "Изтегли QR", hr: "Preuzmi QR", sr: "Преузми QR", sl: "Prenesi QR", et: "Laadi QR alla", lv: "Lejupielādēt QR",
  lt: "Atsisiųsti QR", tr: "QR'ı indir", ru: "Скачать QR", uk: "Завантажити QR", ca: "Descarrega el QR", id: "Unduh QR",
  vi: "Tải QR", th: "ดาวน์โหลด QR", zh: "下载二维码", ja: "QRをダウンロード", ko: "QR 다운로드", ar: "تنزيل QR", he: "הורד QR", hi: "QR डाउनलोड करें",
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
  setDeep(data, "admin.marketingStudio.downloadQr", T[loc] ?? T.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ downloadQr added to ${n} locale(s).`);
