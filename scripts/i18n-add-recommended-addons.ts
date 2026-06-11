/** i18n: Settings "Recommended add-ons" upsell (replaces "Danger Zone") × 38.
 *    admin.settings.{recommendedAddOnsTitle,recommendedAddOnsSubtitle,
 *                    popularBadge,addOnEnableCta,perMonth}
 *    npx tsx scripts/i18n-add-recommended-addons.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.settings.recommendedAddOnsTitle": {
    en: "Recommended add-ons", fr: "Modules recommandés", es: "Complementos recomendados", it: "Componenti aggiuntivi consigliati", pt: "Extras recomendados", "pt-BR": "Complementos recomendados",
    de: "Empfohlene Add-ons", nl: "Aanbevolen add-ons", ro: "Suplimente recomandate", sv: "Rekommenderade tillägg", da: "Anbefalede tilføjelser", nb: "Anbefalte tillegg",
    fi: "Suositellut lisäosat", pl: "Polecane dodatki", cs: "Doporučené doplňky", sk: "Odporúčané doplnky", hu: "Ajánlott bővítmények", el: "Προτεινόμενα πρόσθετα",
    bg: "Препоръчани добавки", hr: "Preporučeni dodaci", sr: "Препоручени додаци", sl: "Priporočeni dodatki", et: "Soovitatud lisad", lv: "Ieteiktie papildinājumi",
    lt: "Rekomenduojami priedai", tr: "Önerilen eklentiler", ru: "Рекомендуемые дополнения", uk: "Рекомендовані доповнення", ca: "Complements recomanats", id: "Add-on yang direkomendasikan",
    vi: "Tiện ích được đề xuất", th: "ส่วนเสริมที่แนะนำ", zh: "推荐的附加功能", ja: "おすすめのアドオン", ko: "추천 부가 기능", ar: "الإضافات الموصى بها", he: "תוספים מומלצים", hi: "अनुशंसित ऐड-ऑन",
  },
  "admin.settings.recommendedAddOnsSubtitle": {
    en: "Popular upgrades that pay for themselves — enable in one click.", fr: "Des améliorations populaires qui se rentabilisent — activez-les en un clic.", es: "Mejoras populares que se pagan solas: actívalas con un clic.", it: "Upgrade popolari che si ripagano da soli — attivali con un clic.", pt: "Melhorias populares que se pagam — ative com um clique.", "pt-BR": "Upgrades populares que se pagam — ative com um clique.",
    de: "Beliebte Upgrades, die sich rentieren — mit einem Klick aktivieren.", nl: "Populaire upgrades die zichzelf terugverdienen — activeer met één klik.", ro: "Upgrade-uri populare care se amortizează — activează-le cu un clic.", sv: "Populära uppgraderingar som betalar sig — aktivera med ett klick.", da: "Populære opgraderinger, der betaler sig — aktivér med ét klik.", nb: "Populære oppgraderinger som lønner seg — aktiver med ett klikk.",
    fi: "Suosittuja päivityksiä, jotka maksavat itsensä takaisin — ota käyttöön yhdellä klikkauksella.", pl: "Popularne ulepszenia, które się zwracają — włącz jednym kliknięciem.", cs: "Oblíbená vylepšení, která se vyplatí — aktivujte jedním kliknutím.", sk: "Obľúbené vylepšenia, ktoré sa oplatia — aktivujte jedným kliknutím.", hu: "Népszerű bővítések, amelyek megtérülnek — aktiváld egy kattintással.", el: "Δημοφιλείς αναβαθμίσεις που αποσβένονται — ενεργοποιήστε με ένα κλικ.",
    bg: "Популярни надстройки, които се изплащат — активирайте с едно кликване.", hr: "Popularna poboljšanja koja se isplate — aktivirajte jednim klikom.", sr: "Популарне надоградње које се исплате — активирајте једним кликом.", sl: "Priljubljene nadgradnje, ki se izplačajo — aktivirajte z enim klikom.", et: "Populaarsed täiendused, mis tasuvad end ära — aktiveeri ühe klikiga.", lv: "Populāri uzlabojumi, kas atmaksājas — aktivizējiet ar vienu klikšķi.",
    lt: "Populiarūs patobulinimai, kurie atsiperka — įjunkite vienu paspaudimu.", tr: "Kendini amorti eden popüler yükseltmeler — tek tıkla etkinleştirin.", ru: "Популярные улучшения, которые окупаются — включите в один клик.", uk: "Популярні покращення, що окупляються — увімкніть одним кліком.", ca: "Millores populars que s'amortitzen — activa-les amb un clic.", id: "Peningkatan populer yang menguntungkan — aktifkan sekali klik.",
    vi: "Các nâng cấp phổ biến đáng đồng tiền — bật chỉ với một cú nhấp.", th: "อัปเกรดยอดนิยมที่คุ้มค่า — เปิดใช้ได้ในคลิกเดียว", zh: "热门升级，物超所值——一键启用。", ja: "コストに見合う人気のアップグレード — ワンクリックで有効化。", ko: "비용 이상의 가치를 주는 인기 업그레이드 — 한 번의 클릭으로 사용 설정.", ar: "ترقيات شائعة تستحق تكلفتها — فعّلها بنقرة واحدة.", he: "שדרוגים פופולריים שמשתלמים — הפעלה בלחיצה אחת.", hi: "लोकप्रिय अपग्रेड जो अपनी कीमत वसूल करते हैं — एक क्लिक में सक्षम करें।",
  },
  "admin.settings.popularBadge": {
    en: "Popular", fr: "Populaire", es: "Popular", it: "Popolare", pt: "Popular", "pt-BR": "Popular",
    de: "Beliebt", nl: "Populair", ro: "Popular", sv: "Populär", da: "Populær", nb: "Populær",
    fi: "Suosittu", pl: "Popularne", cs: "Oblíbené", sk: "Obľúbené", hu: "Népszerű", el: "Δημοφιλές",
    bg: "Популярно", hr: "Popularno", sr: "Популарно", sl: "Priljubljeno", et: "Populaarne", lv: "Populārs",
    lt: "Populiaru", tr: "Popüler", ru: "Популярно", uk: "Популярне", ca: "Popular", id: "Populer",
    vi: "Phổ biến", th: "ยอดนิยม", zh: "热门", ja: "人気", ko: "인기", ar: "شائع", he: "פופולרי", hi: "लोकप्रिय",
  },
  "admin.settings.addOnEnableCta": {
    en: "Enable", fr: "Activer", es: "Activar", it: "Attiva", pt: "Ativar", "pt-BR": "Ativar",
    de: "Aktivieren", nl: "Activeren", ro: "Activează", sv: "Aktivera", da: "Aktivér", nb: "Aktiver",
    fi: "Ota käyttöön", pl: "Włącz", cs: "Aktivovat", sk: "Aktivovať", hu: "Aktiválás", el: "Ενεργοποίηση",
    bg: "Активиране", hr: "Aktiviraj", sr: "Активирај", sl: "Aktiviraj", et: "Aktiveeri", lv: "Aktivizēt",
    lt: "Įjungti", tr: "Etkinleştir", ru: "Включить", uk: "Увімкнути", ca: "Activa", id: "Aktifkan",
    vi: "Bật", th: "เปิดใช้งาน", zh: "启用", ja: "有効化", ko: "사용 설정", ar: "تفعيل", he: "הפעל", hi: "सक्षम करें",
  },
  "admin.settings.perMonth": {
    en: "/mo", fr: "/mois", es: "/mes", it: "/mese", pt: "/mês", "pt-BR": "/mês",
    de: "/Mon.", nl: "/mnd", ro: "/lună", sv: "/mån", da: "/md.", nb: "/md",
    fi: "/kk", pl: "/mies.", cs: "/měs.", sk: "/mes.", hu: "/hó", el: "/μήνα",
    bg: "/мес.", hr: "/mj.", sr: "/мес.", sl: "/mes.", et: "/kuus", lv: "/mēn.",
    lt: "/mėn.", tr: "/ay", ru: "/мес.", uk: "/міс.", ca: "/mes", id: "/bln",
    vi: "/tháng", th: "/เดือน", zh: "/月", ja: "/月", ko: "/월", ar: "/شهر", he: "/לחודש", hi: "/माह",
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
console.log(`✓ recommended-addons strings (${Object.keys(KEYS).length} keys) added to ${n} locale(s).`);
