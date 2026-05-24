# Email Deliverability Setup

This is a one-time setup that has to happen **before soft launch**. Without it,
every email Fee Free sends will go to spam (or get rejected outright by Gmail
and Yahoo as of their February 2024 bulk-sender rules).

The goal: prove to Gmail / Yahoo / Outlook that mail claiming to come from
`@feefreeordering.com` really did come from us. We do that with three DNS
records — **SPF**, **DKIM**, and **DMARC** — that you add at your domain
registrar (GoDaddy, since that's where feefreeordering.com lives).

Total time: ~15 minutes of clicking + a few hours waiting for DNS to propagate.

---

## Step 1 — Add your sending domain in Resend

1. Open <https://resend.com/domains>
2. Click **Add Domain**, type `feefreeordering.com`, choose region **US East** (matches our other infra)
3. Resend now shows you a list of DNS records — typically:

   | Type   | Name                                  | Value (example)                                              |
   |--------|---------------------------------------|--------------------------------------------------------------|
   | TXT    | `send.feefreeordering.com`            | `v=spf1 include:amazonses.com ~all`                          |
   | TXT    | `resend._domainkey.feefreeordering.com` | (long base64 DKIM public key)                              |
   | MX     | `send.feefreeordering.com`            | `feedback-smtp.us-east-1.amazonses.com` priority 10          |
   | TXT    | `_dmarc.feefreeordering.com`          | `v=DMARC1; p=none;`                                          |

   **Leave this Resend tab open** — you'll come back to click "Verify DNS Records" later.

---

## Step 2 — Paste the records into GoDaddy

For each row Resend showed you:

1. Open <https://dcc.godaddy.com/control/portfolio> → select `feefreeordering.com` → **DNS** tab → **Manage Zones**.
2. Click **Add New Record**. Match the **Type** Resend gave you (TXT, CNAME, or MX).
3. For the **Name** field, **strip off** `.feefreeordering.com` — GoDaddy only wants the subdomain prefix:
   - Resend says `send.feefreeordering.com` → you type `send`
   - Resend says `resend._domainkey.feefreeordering.com` → you type `resend._domainkey`
   - Resend says `_dmarc.feefreeordering.com` → you type `_dmarc`
4. Paste the **Value** exactly as Resend gave it. For DKIM the value is a single long string — make sure GoDaddy doesn't insert line breaks (it sometimes does on paste; check the saved value).
5. Leave **TTL** at the default (usually 1 hour).
6. Save.

Repeat for all the records Resend listed.

### Records you should end up with

Roughly:

- **1× SPF** TXT at `send.feefreeordering.com`
- **1× DKIM** TXT at `resend._domainkey.feefreeordering.com`
- **1× MX** at `send.feefreeordering.com` (Amazon SES bounce handling)
- **1× DMARC** TXT at `_dmarc.feefreeordering.com`

---

## Step 3 — Wait, then verify in Resend

DNS propagation usually takes 5-30 minutes but can take up to 24 hours.

To check if it's propagated:

```bash
# From any terminal:
dig +short TXT send.feefreeordering.com
dig +short TXT resend._domainkey.feefreeordering.com
dig +short TXT _dmarc.feefreeordering.com
```

If you see the expected values returned, you're good.

Then back in the Resend tab from Step 1, click **Verify DNS Records**. Status
should flip to ✅ Verified.

---

## Step 4 — Update the FROM address in Fee Free

1. Sign in as superadmin at <https://feefreeordering.com/superadmin/settings/email>
2. Update the **From address** field to: `Fee Free Ordering <noreply@feefreeordering.com>`
3. Save settings.
4. Use the "Send a test email" section to send a test to yourself.
5. **Check the spam folder too** — if the test landed in spam, something's still off. Use <https://www.mail-tester.com> to diagnose (paste the test email's address into a fresh email and see your score).

Target score on Mail Tester: **9/10 or higher**. Below that means we're missing an alignment somewhere — usually DMARC strict mode tripping on a slight SPF / DKIM mismatch.

---

## What we ship from the code side (already done)

The platform sends emails with the right headers to maximize deliverability:

- **`Reply-To: <restaurant's own email>`** on customer-order emails — so when
  a customer hits Reply, the response goes to the restaurant, not to Fee Free.
  This is a strong "this email is legit" signal for inbox providers.
- **`List-Unsubscribe` + `List-Unsubscribe-Post`** on bulk emails (daily /
  monthly digests, marketplace settlement summaries). RFC 8058 one-click
  unsubscribe — required by Gmail / Yahoo's Feb 2024 bulk-sender rules.
- All emails render through React Email components (proper HTML structure,
  matching plain-text fallback would be a future improvement).
- Light-only `color-scheme` meta tag prevents Gmail dark-mode from inverting
  our brand colors.

---

## Optional but recommended

### DMARC progression

The initial DMARC record we ask for (`p=none`) means "tell me about failures
but don't reject anything." That's the safe starting point — it lets us see
which legit senders we'd accidentally break if we tightened policy.

After 2-4 weeks of running on `p=none` with no surprises in the DMARC reports:

1. Switch to `p=quarantine` — failures go to spam (still recoverable).
2. After another 2-4 weeks: `p=reject` — failures are dropped entirely.

To process DMARC reports, point the `rua=mailto:` field at a Postmark /
dmarcian / EasyDMARC inbox. Free tiers exist for low volume.

### BIMI (logo in inbox)

Once you're on `p=quarantine` or stricter, you can add a **BIMI** record to
get your logo to show up next to your emails in Gmail/Yahoo:

- Buy a Verified Mark Certificate (VMC) from DigiCert or Entrust (~$1,500/yr — only
  worth it if you have a registered trademark on the logo)
- Add a `default._bimi.feefreeordering.com` TXT record pointing at the SVG logo URL
- Add the VMC URL alongside it

Skip this until you have actual restaurant customers complaining about no logo.

### Subdomain isolation

If we ever do high-volume marketing (>5K/day to a single list), we should
spin up a separate subdomain (e.g. `marketing.feefreeordering.com`) and run
that through its own Resend domain. Reasons: a reputation hit on the
marketing side won't bleed into transactional deliverability for orders.

Not needed at soft launch volume — same domain is fine.

---

## Troubleshooting

**"My DKIM record won't validate"**
Most common cause: GoDaddy split the DKIM value across multiple lines. Open
the record again, copy the value, paste it into a plain text editor, and
verify it's one continuous string. Re-paste into GoDaddy.

**"Mail Tester gives a low score even after verification"**
Run through their report — usually one of:
- HTML/plain-text mismatch (we don't ship plain text yet — a known minor hit)
- DMARC alignment failure → make sure From address matches the verified
  domain exactly (`@feefreeordering.com`, not `@send.feefreeordering.com`)
- Suspicious link in the body (Resend's tracking URL — usually fine but
  Mail Tester flags it. Not actionable.)

**"My emails go to Gmail spam but Outlook inbox (or vice versa)"**
Normal early in domain warmup. Gmail wants to see a few weeks of good sending
behavior + low spam complaints before they fully trust a new domain. Send
volume should ramp gradually — don't blast 10K emails on day 1.
