"""
Splice the cms0gyexp batch keys (65) into all 37 non-English locale files from
scripts/i18n-data/cms0gyexp/<code>.json packs (flat DOTTED keys).

Same machinery as _splice-guest-cancel-i18n.py: exact-indent section anchors,
in-string-safe brace tracking, insert-immediately-after-opening-brace (comma-
safe: every target object is non-empty). Two extras:
  - NEW OBJECTS: customer.accountPage.status and email.footer are inserted
    whole (after their parent's opening brace).
  - REPLACE: email.passwordReset.body already exists ×38 with the old dead
    string — its VALUE is replaced in place.
Idempotent throughout.

  python scripts/_splice-cms0gyexp-i18n.py
"""
import json, os, sys

PACK_DIR = "scripts/i18n-data/cms0gyexp"
MSG_DIR = "src/messages"

# (section path, [json keys]) — pack key = ".".join(path + [key])
INSERTS = [
    (("common",), ["showPassword", "hidePassword"]),
    (("email", "customerSignup"), ["preview", "headerTitle", "badge", "body", "labelCustomer", "viewCustomersButton"]),
    (("email", "newOrder"), ["preview", "headerTitle", "badgeNew", "minShort", "badgePaidOnline", "badgeCollectCard",
                              "badgeCollectCash", "badgePayAtStore", "tablePreorder", "tablePreorderOne",
                              "labelDeliveryAddress", "labelCustomerNotes", "labelOrderDetails", "labelOrderTotal",
                              "collected", "toCollect", "creditFallback", "paidWith", "totalMinusCredit",
                              "seeBreakdown", "openKitchenApp", "acceptHint"]),
    (("email", "newReservation"), ["preview", "previewCancelled", "headerTitle", "subtitleNew", "subtitleCancelled",
                                    "badgeNew", "badgeCancelled", "badgeParty", "labelTime", "cancelledNote",
                                    "labelSpecialRequests", "manageButton"]),
    (("email", "orderConfirmed"), ["closedNoteWithTime"]),
    (("email", "passwordReset"), ["preview", "subtitle", "greeting", "greetingNoName", "expiryOneHour",
                                   "linkFallback", "ignoreHeading", "ignoreBody"]),
    (("email", "reservationConfirmed"), ["previewRequested", "previewDeclined", "previewCancelled"]),
    (("receipt", "orderTypesLower"), ["take_out"]),
]
NEW_OBJECTS = [
    (("customer",), "accountPage.status", ["pending", "accepted", "preparing", "ready", "completed", "cancelled", "rejected"]),
    (("email",), "footer", ["signOff", "poweredBy"]),
]
REPLACES = [(("email", "passwordReset"), "body")]

ALL_PACK_KEYS = (
    [".".join(p) + "." + k for p, ks in INSERTS for k in ks]
    + ["customer.accountPage.status." + k for k in NEW_OBJECTS[0][2]]
    + ["email.footer." + k for k in NEW_OBJECTS[1][2]]
    + ["email.passwordReset.body"]
)


def close_of(lines, start):
    depth = 0
    for i in range(start, len(lines)):
        line = lines[i]
        in_str = False
        j = 0
        while j < len(line):
            ch = line[j]
            if in_str:
                if ch == "\\":
                    j += 1
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        return i
            j += 1
    return -1


def find_section(lines, path, lo=0, hi=None):
    if hi is None:
        hi = len(lines)
    open_i = -1
    for level, name in enumerate(path):
        indent = "  " * (level + 1)
        anchor = f'{indent}"{name}": {{'
        open_i = next(
            (i for i in range(lo, hi)
             if lines[i].startswith(indent + '"') and lines[i].rstrip().startswith(anchor.rstrip())),
            -1,
        )
        if open_i == -1:
            return -1, -1
        close_i = close_of(lines, open_i)
        if close_i == -1:
            return -1, -1
        lo, hi = open_i + 1, close_i
    return open_i, close_of(lines, open_i)


def main():
    codes = sorted(f[:-5] for f in os.listdir(PACK_DIR) if f.endswith(".json") and not f.startswith("_"))
    if len(codes) != 37:
        print(f"expected 37 packs, found {len(codes)}: {codes}")
        sys.exit(1)
    for code in codes:
        with open(f"{PACK_DIR}/{code}.json", encoding="utf-8") as f:
            pack = json.load(f)
        missing = [k for k in ALL_PACK_KEYS if not isinstance(pack.get(k), str) or not pack[k].strip()]
        if missing:
            print(f"FAIL {code}: pack missing/empty {missing}")
            sys.exit(1)
        path = f"{MSG_DIR}/{code}.json"
        with open(path, encoding="utf-8") as f:
            lines = f.read().split("\n")
        changed = False

        # ── plain inserts ──
        for sec_path, keys in INSERTS:
            open_i, close_i = find_section(lines, sec_path)
            if open_i == -1:
                print(f"FAIL {code}: section {'.'.join(sec_path)} not found")
                sys.exit(1)
            body = "\n".join(lines[open_i:close_i + 1])
            inner = "  " * (len(sec_path) + 1)
            new_lines = []
            for k in keys:
                if f'"{k}"' in body:
                    continue
                v = pack[".".join(sec_path) + "." + k]
                new_lines.append(f"{inner}{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},")
            if new_lines:
                lines[open_i + 1:open_i + 1] = new_lines
                changed = True

        # ── new nested objects ──
        for parent_path, dotted_name, keys in NEW_OBJECTS:
            # dotted_name may itself nest one level ("accountPage.status")
            parts = dotted_name.split(".")
            sec_path = parent_path + tuple(parts[:-1])
            obj_name = parts[-1]
            open_i, close_i = find_section(lines, sec_path)
            if open_i == -1:
                print(f"FAIL {code}: section {'.'.join(sec_path)} not found")
                sys.exit(1)
            body = "\n".join(lines[open_i:close_i + 1])
            if f'"{obj_name}"' in body:
                continue
            ind = "  " * (len(sec_path) + 1)
            inner = ind + "  "
            obj = [f'{ind}{json.dumps(obj_name)}: {{']
            full_prefix = ".".join(parent_path) + "." + dotted_name
            for i, k in enumerate(keys):
                comma = "" if i == len(keys) - 1 else ","
                obj.append(f"{inner}{json.dumps(k)}: {json.dumps(pack[full_prefix + '.' + k], ensure_ascii=False)}{comma}")
            obj.append(f"{ind}}},")
            lines[open_i + 1:open_i + 1] = obj
            changed = True

        # ── in-place value replacements ──
        for sec_path, key in REPLACES:
            open_i, close_i = find_section(lines, sec_path)
            if open_i == -1:
                print(f"FAIL {code}: section {'.'.join(sec_path)} not found")
                sys.exit(1)
            new_v = pack[".".join(sec_path) + "." + key]
            ind = "  " * (len(sec_path) + 1)
            for i in range(open_i + 1, close_of(lines, open_i)):
                if lines[i].startswith(f'{ind}"{key}":'):
                    had_comma = lines[i].rstrip().endswith(",")
                    replacement = f"{ind}{json.dumps(key)}: {json.dumps(new_v, ensure_ascii=False)}{',' if had_comma else ''}"
                    if lines[i] != replacement:
                        lines[i] = replacement
                        changed = True
                    break
            else:
                print(f"FAIL {code}: {'.'.join(sec_path)}.{key} not found for replace")
                sys.exit(1)

        if changed:
            out = "\n".join(lines)
            json.loads(out)  # sanity before write
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(out)
            print(f"OK {code}")
        else:
            print(f"-- {code}: already spliced")


if __name__ == "__main__":
    main()
