# -*- coding: utf-8 -*-
"""Add the 6 VIP customer-picker keys to admin.customerGroups in en.json.
Idempotent. Locale files are filled by the translation workflow."""
import json

PATH = "src/messages/en.json"
NEW = {
    "pickCustomersLabel": "Add customers you already have",
    "hasAccountBadge": "Account",
    "alreadyMemberBadge": "Already a member",
    "pickedCount": "{count, plural, one {# customer selected} other {# customers selected}}",
    "clearSelection": "Clear",
    "addSelected": "{count, plural, one {Add # member} other {Add # members}}",
}

with open(PATH, encoding="utf-8") as f:
    d = json.load(f)

ns = d["admin"]["customerGroups"]
added = 0
for k, v in NEW.items():
    if k not in ns:
        ns[k] = v
        added += 1

with open(PATH, "w", encoding="utf-8", newline="\n") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(f"en.json: +{added} keys ({len(NEW) - added} already present)")
