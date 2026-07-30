"""One-shot: add the cms0gyexp batch's new EN keys to src/messages/en.json.
JSON round-trip is safe here for EN ONLY (2-space indent, ensure_ascii=False,
insertion-ordered) — the ×37 siblings get a text-splice later (fleet pipeline).
Idempotent: skips keys that already exist; 'body' in passwordReset is
intentionally REDEFINED (old string was a dead key)."""
import json, collections

PATH = "src/messages/en.json"
with open(PATH, encoding="utf-8") as f:
    d = json.load(f, object_pairs_hook=collections.OrderedDict)

em = d["email"]

# email.footer (new object — placed right before newOrder for locality)
if "footer" not in em:
    footer = collections.OrderedDict()
    footer["signOff"] = "Kind regards,"
    footer["poweredBy"] = "Powered by"
    em["footer"] = footer

NEW_ORDER = {
    "preview": "{restaurant} — Order #{orderNumber} — {total}",
    "headerTitle": "{restaurant} — Order #{orderNumber}",
    "badgeNew": "New order",
    "minShort": "min",
    "badgePaidOnline": "Paid online",
    "badgeCollectCard": "To collect — card",
    "badgeCollectCash": "To collect — cash",
    "badgePayAtStore": "Pay at store",
    "tablePreorder": "Table reservation + pre-order — {partySize} guests, {time}",
    "tablePreorderOne": "Table reservation + pre-order — 1 guest, {time}",
    "labelDeliveryAddress": "Delivery address",
    "labelCustomerNotes": "Customer notes",
    "labelOrderDetails": "Order details",
    "labelOrderTotal": "Order total",
    "collected": "Collected",
    "toCollect": "To collect",
    "creditFallback": "credit",
    "paidWith": "Paid with {label}",
    "totalMinusCredit": "Order total {total} − {credit} paid with {label}",
    "seeBreakdown": "See itemized breakdown in the admin dashboard.",
    "openKitchenApp": "Open Kitchen Order App",
    "acceptHint": "Accept this order from the Kitchen Order App or the admin dashboard. Auto-reject runs if no action is taken within your configured timeout.",
}
NEW_RESERVATION = {
    "preview": "New reservation — {dateTime} · party of {partySize}",
    "previewCancelled": "Reservation cancelled — {dateTime} · party of {partySize}",
    "headerTitle": "{restaurant} — Reservation #{reservationNumber}",
    "subtitleNew": "New reservation request",
    "subtitleCancelled": "Reservation cancelled by the customer",
    "badgeNew": "New",
    "badgeCancelled": "Cancelled by customer",
    "badgeParty": "Party of {partySize}",
    "labelTime": "Reservation time",
    "cancelledNote": "The customer cancelled this booking from their confirmation email — the table can be released. No action is needed.",
    "labelSpecialRequests": "Special requests",
    "manageButton": "Manage reservation",
}
CUSTOMER_SIGNUP = {
    "preview": "{restaurant} — new customer account: {customer}",
    "headerTitle": "{restaurant} — new customer account",
    "badge": "New sign-up",
    "body": "A new customer just created an account at your restaurant.",
    "labelCustomer": "Customer",
    "viewCustomersButton": "View customers in admin",
}
PASSWORD_RESET = {
    "preview": "Reset your {brand} password",
    "subtitle": "Use the button below to set a new one",
    "greeting": "Hello {name},",
    "greetingNoName": "Hello,",
    "body": "We received a request to reset the password on your {account} account. Click the button below to choose a new one — the link is valid for {expiresIn}.",
    "expiryOneHour": "1 hour",
    "linkFallback": "If the button doesn't work, copy and paste this URL into your browser:",
    "ignoreHeading": "Didn't request this?",
    "ignoreBody": "You can safely ignore this email — your password won't change unless you click the link above. If you're worried someone else may be trying to access your account, reply to this email and we'll look into it.",
}
RESV_PREVIEWS = {
    "previewRequested": "Reservation request received — {dateTime} for {partySize}",
    "previewDeclined": "Reservation update — {dateTime} for {partySize}",
    "previewCancelled": "Reservation cancelled — {dateTime} for {partySize}",
}

def merge(target, additions, redefine=()):
    for k, v in additions.items():
        if k not in target or k in redefine:
            target[k] = v

merge(em["newOrder"], NEW_ORDER)
merge(em["newReservation"], NEW_RESERVATION)
merge(em["customerSignup"], CUSTOMER_SIGNUP)
merge(em["passwordReset"], PASSWORD_RESET, redefine=("body",))
merge(em["reservationConfirmed"], RESV_PREVIEWS)
merge(em["orderConfirmed"], {
    "closedNoteWithTime": "The restaurant is currently closed — your order is queued and you'll get an update as soon as they open. Check your email on {openingTime}.",
})

# Cluster B keys
merge(d["common"], {"showPassword": "Show password", "hidePassword": "Hide password"})
merge(d["receipt"]["orderTypesLower"], {"take_out": "takeout"})
if "status" not in d["customer"]["accountPage"]:
    st = collections.OrderedDict()
    for k, v in [("pending", "Pending"), ("accepted", "Accepted"), ("preparing", "Preparing"),
                 ("ready", "Ready"), ("completed", "Completed"), ("cancelled", "Cancelled"),
                 ("rejected", "Rejected")]:
        st[k] = v
    d["customer"]["accountPage"]["status"] = st

with open(PATH, "w", encoding="utf-8", newline="\n") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("en.json updated OK")
