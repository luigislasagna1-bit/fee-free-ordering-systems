# -*- coding: utf-8 -*-
"""Merge the marketplace-/account extraction key maps (5 flat temp files of
full-path -> English value) into src/messages/en.json. Idempotent."""
import json, glob, os

TMP = r"C:\Users\luigi\AppData\Local\Temp\claude\C--FeeFreeOrderingSystems\cf0c6e28-2af8-43ed-926e-395bdc1f884d\scratchpad\mkt-i18n"
PATH = "src/messages/en.json"

flat = {}
for f in sorted(glob.glob(os.path.join(TMP, "*.json"))):
    with open(f, encoding="utf-8") as fh:
        m = json.load(fh)
    for k, v in m.items():
        if k in flat and flat[k] != v:
            raise SystemExit(f"CONFLICT: {k} defined twice with different values")
        flat[k] = v

with open(PATH, encoding="utf-8") as fh:
    d = json.load(fh)

added = skipped = 0
for path, value in sorted(flat.items()):
    parts = path.split(".")
    node = d
    for p in parts[:-1]:
        node = node.setdefault(p, {})
    if parts[-1] in node:
        skipped += 1
    else:
        node[parts[-1]] = value
        added += 1

with open(PATH, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(d, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
print(f"en.json: +{added} keys ({skipped} already present) from {len(flat)} in temp maps")
