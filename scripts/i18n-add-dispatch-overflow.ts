/** i18n × 38 for the FeeFree dispatch-queue overflow note (Luigi 2026-07-20).
 *  Run: npx tsx scripts/i18n-add-dispatch-overflow.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.feefreeDelivery.showingFirstN": {
    en: "Showing the first {count} — more exist; the list refreshes automatically.",
    fr: "Affichage des {count} premiers — il y en a plus ; la liste s'actualise automatiquement.",
    es: "Mostrando los primeros {count} — hay más; la lista se actualiza automáticamente.",
    it: "Mostrati i primi {count} — ce ne sono altri; l'elenco si aggiorna automaticamente.",
    pt: "A mostrar os primeiros {count} — existem mais; a lista atualiza automaticamente.",
    "pt-BR": "Mostrando os primeiros {count} — há mais; a lista atualiza automaticamente.",
    de: "Erste {count} werden angezeigt — es gibt mehr; die Liste aktualisiert sich automatisch.",
    nl: "Eerste {count} worden getoond — er zijn er meer; de lijst ververst automatisch.",
    ro: "Se afișează primele {count} — există mai multe; lista se actualizează automat.",
    sv: "Visar de första {count} — det finns fler; listan uppdateras automatiskt.",
    da: "Viser de første {count} — der er flere; listen opdateres automatisk.",
    nb: "Viser de første {count} — det finnes flere; listen oppdateres automatisk.",
    fi: "Näytetään ensimmäiset {count} — niitä on enemmän; luettelo päivittyy automaattisesti.",
    pl: "Pokazano pierwsze {count} — jest ich więcej; lista odświeża się automatycznie.",
    cs: "Zobrazeno prvních {count} — je jich více; seznam se aktualizuje automaticky.",
    sk: "Zobrazených prvých {count} — je ich viac; zoznam sa aktualizuje automaticky.",
    hu: "Az első {count} látható — több is van; a lista automatikusan frissül.",
    el: "Εμφανίζονται τα πρώτα {count} — υπάρχουν περισσότερα· η λίστα ανανεώνεται αυτόματα.",
    bg: "Показани са първите {count} — има още; списъкът се обновява автоматично.",
    hr: "Prikazuje se prvih {count} — ima ih više; popis se automatski osvježava.",
    sr: "Prikazano prvih {count} — ima ih više; lista se automatski osvežava.",
    sl: "Prikazanih prvih {count} — obstaja jih več; seznam se samodejno osveži.",
    et: "Kuvatakse esimesed {count} — neid on rohkem; loend värskendub automaatselt.",
    lv: "Rāda pirmos {count} — to ir vairāk; saraksts atjauninās automātiski.",
    lt: "Rodoma pirmieji {count} — jų yra daugiau; sąrašas atnaujinamas automatiškai.",
    tr: "İlk {count} gösteriliyor — daha fazlası var; liste otomatik olarak yenilenir.",
    ru: "Показаны первые {count} — есть ещё; список обновляется автоматически.",
    uk: "Показано перші {count} — є ще; список оновлюється автоматично.",
    ca: "Es mostren els primers {count} — n'hi ha més; la llista s'actualitza automàticament.",
    id: "Menampilkan {count} pertama — masih ada lagi; daftar diperbarui otomatis.",
    vi: "Đang hiển thị {count} mục đầu — còn nữa; danh sách tự động làm mới.",
    th: "กำลังแสดง {count} รายการแรก — ยังมีอีก รายการจะรีเฟรชอัตโนมัติ",
    zh: "显示前 {count} 条 — 还有更多；列表会自动刷新。",
    ja: "最初の{count}件を表示中 — 他にもあります。リストは自動更新されます。",
    ko: "처음 {count}개 표시 중 — 더 있습니다. 목록은 자동으로 새로고침됩니다.",
    ar: "عرض أول {count} — هناك المزيد؛ يتم تحديث القائمة تلقائيًا.",
    he: "מוצגים {count} הראשונים — יש עוד; הרשימה מתרעננת אוטומטית.",
    hi: "पहले {count} दिखाए जा रहे हैं — और भी हैं; सूची स्वतः रीफ्रेश होती है।",
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
console.log(`✓ dispatch overflow string added to ${n} locale(s).`);
