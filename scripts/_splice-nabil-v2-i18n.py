"""Splice the Nabil AI v2 UI strings into all 38 locale files.

Input: a staging JSON of { "<dotted.key>": { "en": "...", "fr": "...", ... } }
produced by the translate-nabil-v2-keys workflow.

    python scripts/_splice-nabil-v2-i18n.py <staging.json>

Idempotent: re-running overwrites the same keys with the same values. Every
locale must carry every key or the parity audit fails, so a locale missing a
translation is reported and left ALONE rather than filled with English —
silently shipping English into a French dashboard is the failure this whole
process exists to prevent.
"""
import collections
import io
import json
import sys

LOCALES = [
    "en", "fr", "es", "it", "pt", "pt-BR", "de", "nl", "ro", "sv", "da", "nb", "fi",
    "pl", "cs", "sk", "hu", "el", "bg", "hr", "sr", "sl", "et", "lv", "lt", "tr",
    "ru", "uk", "ca", "id", "vi", "th", "zh", "ja", "ko", "ar", "he", "hi",
]


def set_dotted(root, dotted, value):
    parts = dotted.split(".")
    node = root
    for k in parts[:-1]:
        if k not in node or not isinstance(node[k], dict):
            node[k] = collections.OrderedDict()
        node = node[k]
    node[parts[-1]] = value


def main(path):
    staging = json.load(io.open(path, encoding="utf-8"))
    gaps = []
    for code in LOCALES:
        f = f"src/messages/{code}.json"
        data = json.load(io.open(f, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
        wrote = 0
        for dotted, row in staging.items():
            val = row.get(code)
            if not val:
                gaps.append(f"{code}:{dotted}")
                continue
            set_dotted(data, dotted, val)
            wrote += 1
        io.open(f, "w", encoding="utf-8").write(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        )
        print(f"{code}: {wrote}/{len(staging)}")
    if gaps:
        print("\nMISSING (locale:key) — parity will fail until these are filled:")
        for g in gaps:
            print("  " + g)
        sys.exit(1)
    print("\nall locales complete")


if __name__ == "__main__":
    main(sys.argv[1])
