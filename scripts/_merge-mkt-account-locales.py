# -*- coding: utf-8 -*-
"""Merge the workflow-translated marketplace-account key files (flat maps in
mkt-i18n-out/<locale>.json) into src/messages/<locale>.json. Validates each
file has exactly the same key set as the English source before touching
anything. Idempotent (overwrites the same keys deterministically)."""
import json, os, sys

TMP = r"C:\Users\luigi\AppData\Local\Temp\claude\C--FeeFreeOrderingSystems\cf0c6e28-2af8-43ed-926e-395bdc1f884d\scratchpad"
EN = os.path.join(TMP, "mkt-i18n", "_all-en.json")
OUT = os.path.join(TMP, "mkt-i18n-out")

LOCALES = ["fr","es","it","de","nl","pt","pt-BR","ro","ca","sv","da","nb","fi","et","hu",
           "pl","cs","sk","ru","uk","bg","hr","sr","sl","lt","lv","el","tr","ar","he",
           "ja","zh","ko","th","vi","id","hi"]

en_keys = set(json.load(open(EN, encoding="utf-8")).keys())
errors = []
maps = {}
for loc in LOCALES:
    p = os.path.join(OUT, f"{loc}.json")
    if not os.path.exists(p):
        errors.append(f"{loc}: file missing"); continue
    try:
        m = json.load(open(p, encoding="utf-8"))
    except Exception as e:
        errors.append(f"{loc}: parse error {e}"); continue
    got = set(m.keys())
    if got != en_keys:
        errors.append(f"{loc}: missing {sorted(en_keys - got)[:3]}... extra {sorted(got - en_keys)[:3]}...")
        continue
    maps[loc] = m

if errors:
    print("VALIDATION FAILED — nothing merged:")
    for e in errors: print(" ", e)
    sys.exit(1)

for loc, m in maps.items():
    path = f"src/messages/{loc}.json"
    d = json.load(open(path, encoding="utf-8"))
    for full, value in sorted(m.items()):
        parts = full.split(".")
        node = d
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = value
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"{loc}: merged {len(m)}")
print(f"done — {len(maps)} locales merged, {len(en_keys)} keys each")
