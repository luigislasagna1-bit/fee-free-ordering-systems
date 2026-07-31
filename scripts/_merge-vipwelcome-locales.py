# -*- coding: utf-8 -*-
"""Merge the translated VIP welcome-email strings into src/messages/<locale>.json.
Validates key set + placeholder integrity before writing anything."""
import json, os, sys, re
TMP = r"C:\Users\luigi\AppData\Local\Temp\claude\C--FeeFreeOrderingSystems\cf0c6e28-2af8-43ed-926e-395bdc1f884d\scratchpad"
EN = os.path.join(TMP, "vipwelcome-i18n", "_all-en.json")
OUT = os.path.join(TMP, "vipwelcome-i18n-out")
LOCALES = ["fr","es","it","de","nl","pt","pt-BR","ro","ca","sv","da","nb","fi","et","hu",
           "pl","cs","sk","ru","uk","bg","hr","sr","sl","lt","lv","el","tr","ar","he",
           "ja","zh","ko","th","vi","id","hi"]
en = json.load(open(EN, encoding="utf-8"))
en_keys = set(en.keys())
def phs(s): return set(re.findall(r"\{(\w+)\}", s))
errors, maps = [], {}
for loc in LOCALES:
    p = os.path.join(OUT, f"{loc}.json")
    if not os.path.exists(p): errors.append(f"{loc}: missing file"); continue
    try: m = json.load(open(p, encoding="utf-8"))
    except Exception as e: errors.append(f"{loc}: parse {e}"); continue
    if set(m.keys()) != en_keys:
        errors.append(f"{loc}: key mismatch (missing {sorted(en_keys-set(m))[:2]})"); continue
    for k, v in m.items():
        want, got = phs(en[k]), phs(v)
        if want - got: errors.append(f"{loc}.{k}: lost placeholder(s) {sorted(want-got)}")
    maps[loc] = m
if errors:
    print("VALIDATION FAILED — nothing merged:")
    for e in errors[:20]: print("  ", e)
    sys.exit(1)
for loc, m in maps.items():
    path = f"src/messages/{loc}.json"
    d = json.load(open(path, encoding="utf-8"))
    for full, value in sorted(m.items()):
        parts = full.split("."); node = d
        for pth in parts[:-1]: node = node.setdefault(pth, {})
        node[parts[-1]] = value
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=2); fh.write("\n")
print(f"done — {len(maps)} locales merged, {len(en_keys)} keys each")
