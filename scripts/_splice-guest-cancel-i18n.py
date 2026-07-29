"""
Splice the guest-cancel (Fabrizio cms0idtz7) keys into all 37 non-English
locale files from the per-locale packs in scripts/i18n-data/guest-cancel/.

7 targets per locale (33 keys total):
  email.orderConfirmed        closedNote, cancelNote
  email.orderStatus           cancelledByCustomerTitle, cancelledByCustomerBody
  email.reservationConfirmed  subjectCancelled, headerTitleCancelled, introCancelled,
                              closingCancelled, badgeCancelled, depositContactNote, cancelNote
  email.newReservation        subjectCancelled
  customer.orderStatus        cancelErrorSignIn, cancelErrorInvalidLink,
                              cancelErrorAccepted, cancelErrorGone
  customer.reservationCancel  (NEW object, 16 keys)
  kitchen                     cancelledByCustomer

Strategy: section-scoped text splicing (NOT a json round-trip, to keep diffs
minimal). Sections are located by their exact-indent opening line, ranges by
in-string-safe brace tracking (ICU "{placeholders}" inside string values must
not count). New keys are inserted IMMEDIATELY AFTER the section's opening
brace line, each ending with "," — comma-safe because every target object is
non-empty. Idempotent: a key already present inside its section is skipped.

  python scripts/_splice-guest-cancel-i18n.py
"""
import json, os, sys

PACK_DIR = "scripts/i18n-data/guest-cancel"
MSG_DIR = "src/messages"

# (section path, [(pack key, json key), ...])
TARGETS = [
    (("email", "orderConfirmed"), [("oc_closedNote", "closedNote"), ("oc_cancelNote", "cancelNote")]),
    (("email", "orderStatus"), [("os_cancelledByCustomerTitle", "cancelledByCustomerTitle"),
                                 ("os_cancelledByCustomerBody", "cancelledByCustomerBody")]),
    (("email", "reservationConfirmed"), [("rc_subjectCancelled", "subjectCancelled"),
                                          ("rc_headerTitleCancelled", "headerTitleCancelled"),
                                          ("rc_introCancelled", "introCancelled"),
                                          ("rc_closingCancelled", "closingCancelled"),
                                          ("rc_badgeCancelled", "badgeCancelled"),
                                          ("rc_depositContactNote", "depositContactNote"),
                                          ("rc_cancelNote", "cancelNote")]),
    (("email", "newReservation"), [("nr_subjectCancelled", "subjectCancelled")]),
    (("customer", "orderStatus"), [("co_cancelErrorSignIn", "cancelErrorSignIn"),
                                    ("co_cancelErrorInvalidLink", "cancelErrorInvalidLink"),
                                    ("co_cancelErrorAccepted", "cancelErrorAccepted"),
                                    ("co_cancelErrorGone", "cancelErrorGone")]),
    (("kitchen",), [("k_cancelledByCustomer", "cancelledByCustomer")]),
]
RESC_KEYS = ["title", "intro", "partySize", "confirmButton", "keepButton", "cancelling",
             "successTitle", "successBody", "alreadyCancelledTitle", "alreadyCancelledBody",
             "invalidLinkTitle", "invalidLinkBody", "tooLateBody", "linkedOrderBody",
             "depositNote", "genericError"]
ALL_PACK_KEYS = [pk for _, pairs in TARGETS for pk, _ in pairs] + [f"resc_{k}" for k in RESC_KEYS]


def close_of(lines, start):
    """Index of the line holding the matching close brace for the object opened
    on lines[start]. In-string safe (backslash escapes honored)."""
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


def find_section(lines, path):
    """(open_line, close_line) of the object at path, using exact-indent anchors
    so a top-level "kitchen" never matches the email.kitchen sub-object."""
    lo, hi = 0, len(lines)
    open_i = -1
    for level, name in enumerate(path):
        indent = "  " * (level + 1)
        anchor = f'{indent}"{name}": {{'
        open_i = next((i for i in range(lo, hi) if lines[i].rstrip().startswith(anchor.rstrip()) and lines[i].startswith(indent + '"')), -1)
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
            text = f.read()
        lines = text.split("\n")
        changed = False

        for sec_path, pairs in TARGETS:
            open_i, close_i = find_section(lines, sec_path)
            if open_i == -1:
                print(f"FAIL {code}: section {'.'.join(sec_path)} not found")
                sys.exit(1)
            body = "\n".join(lines[open_i:close_i + 1])
            inner = "  " * (len(sec_path) + 1)
            new_lines = []
            for pk, jk in pairs:
                if f'"{jk}"' in body:
                    continue  # idempotent — already spliced
                new_lines.append(f"{inner}{json.dumps(jk)}: {json.dumps(pack[pk], ensure_ascii=False)},")
            if new_lines:
                lines[open_i + 1:open_i + 1] = new_lines
                changed = True

        # customer.reservationCancel — whole new object right after "customer": {
        cust_open, cust_close = find_section(lines, ("customer",))
        if cust_open == -1:
            print(f"FAIL {code}: customer section not found")
            sys.exit(1)
        cust_body = "\n".join(lines[cust_open:cust_close + 1])
        if '"reservationCancel"' not in cust_body:
            obj = ['    "reservationCancel": {']
            for i, k in enumerate(RESC_KEYS):
                comma = "" if i == len(RESC_KEYS) - 1 else ","
                obj.append(f'      {json.dumps(k)}: {json.dumps(pack[f"resc_{k}"], ensure_ascii=False)}{comma}')
            obj.append("    },")
            lines[cust_open + 1:cust_open + 1] = obj
            changed = True

        if changed:
            out = "\n".join(lines)
            json.loads(out)  # sanity: still valid JSON before writing
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(out)
            print(f"OK {code}")
        else:
            print(f"-- {code}: already spliced")


if __name__ == "__main__":
    main()
