# Reply draft — Fabrizio, report `cms0gyexp` (#13 + #14, plus #10/#12 follow-ups)

**Status to set on the report:** IN_TESTING
**Post only AFTER deploy** (the schema push + Vercel deploy in OWNER-ACTIONS A29).
Two versions below — Italian first (he writes in Italian), English underneath.

---

## 🇮🇹 Italian

Ciao Fabrizio, grazie — la #13 e la #14 erano segnalazioni molto precise e ci hanno
fatto trovare quattro problemi veri. È tutto sistemato.

**#13 — perché il report è arrivato alle 10:01**

Avevi ragione su tutto. Succedevano tre cose insieme:

1. Alle 23:05 (poco dopo la chiusura delle 23:00) il sistema ha controllato la
   giornata, non ha trovato attività e non ha inviato nulla.
2. La prenotazione **#KYDENB** delle 23:53 è arrivata *dopo* la chiusura, ma per il
   sistema la giornata finiva a mezzanotte — quindi è finita nel giorno 30.
3. La mattina dopo il recupero automatico ha visto "il 30 ha attività, non è mai
   stato inviato" e ha mandato il report alle 10:01.

Da adesso **la giornata lavorativa va da chiusura a chiusura**, non più fino a
mezzanotte. Quindi:

- Il report parte **pochi minuti dopo l'orario di chiusura serale**, esattamente come
  ci hai scritto.
- Con orario spezzato (es. 11:00–15:00 e 20:00–23:00) fa fede **l'ultima chiusura**
  della giornata, e il report contiene tutto il giorno.
- Tutto ciò che arriva **dopo** la chiusura appartiene al **giorno successivo**. La
  #KYDENB delle 23:53 va nel report del 31, non del 30 — come dicevi tu.
- La #6H6259, accettata all'1:00 di notte, sarà nel report del 31: confermato.

**#14 — quattro correzioni**

1. **Prenotazioni rifiutate/annullate**: non vengono più conteggiate tra quelle
   accettate (la tua **#FG6GD5** era il caso esatto). Ora si comportano come gli
   ordini annullati, che già erano esclusi.
2. **Rimborsi**: nuova riga **"Rimborsi"** con il numero di ordini rimborsati e il
   totale, e **l'incassato è ora al netto dei rimborsi**. Il tuo ordine
   **#439213274** (86,40 € carta, 20 € rimborsati) mostrava l'incasso pieno: adesso
   no. In più abbiamo trovato un secondo problema nello stesso caso — un ordine con
   rimborso parziale veniva spostato dal gruppo "carta" a quello "contanti/di
   persona", falsando la riconciliazione. Anche questo è risolto: un ordine pagato
   online resta online anche dopo un rimborso.
3. **PayPal e altri metodi**: dove prima c'era solo "Online (carta)", ora trovi
   **Online (carta) / Online (PayPal) / Online (altro)**. La suddivisione compare
   solo se un metodo diverso dalla carta ha effettivamente incassato, così chi usa
   solo la carta non vede righe in più.
4. **Annullati**: nuove righe con il numero di **ordini** e **prenotazioni**
   annullati o rifiutati, così il quadro è completo.

Tutto questo vale sia per il report in tempo reale nell'app, sia per l'email di fine
giornata, sia per la stampa e per l'esportazione.

**Anche dalle tue #10, #11 e #12**

- **#10**: oltre all'email, adesso anche la **pagina di stato dell'ordine** mostra il
  motivo del rifiuto nella lingua del cliente (prima restava nella lingua del
  ristorante). Vale per i motivi standard; un motivo scritto a mano libera resta
  come digitato.
- **#11**: l'email di annullamento era già tradotta, ma la **pagina** di conferma
  dell'annullamento restava in inglese. Ora segue la lingua con cui il cliente ha
  prenotato.
- **#12**: la nota scritta dal cliente quando prenota un tavolo **ora arriva
  all'app di cucina**, evidenziata come le note dell'ordine. Prima veniva salvata ma
  non veniva mai mostrata.

**Cosa ti chiediamo di verificare**

1. Stasera, dopo la chiusura: se c'è stata attività, il report deve arrivare dopo
   pochi minuti e contenere la giornata intera (con zero attività non viene
   inviato nulla — è voluto).
2. Che la **#6H6259** compaia nel report del 31 (e la **#KYDENB** non in quello del 30).
3. Una prenotazione rifiutata: non deve più essere conteggiata.
4. Un ordine con rimborso parziale: deve comparire in "Rimborsi" e l'incassato deve
   scendere di conseguenza.
5. Se hai PayPal attivo, un ordine PayPal: deve leggersi "Online (PayPal)".

Grazie ancora — queste segnalazioni hanno migliorato il prodotto per tutti.

---

## 🇬🇧 English

Hi Fabrizio — thank you, #13 and #14 were very precise reports and they uncovered
four genuine bugs. All fixed.

**#13 — why the report arrived at 10:01**

You were right on every point. Three things combined:

1. At ~23:05 (just after your 23:00 close) the system checked the day, found no
   activity, and correctly sent nothing.
2. Reservation **#KYDENB** at 23:53 came in *after* closing — but the system still
   treated the business day as ending at midnight, so it landed inside the 30th.
3. The next morning the catch-up sweep saw "the 30th has activity and was never
   sent" and mailed it at 10:01.

The business day is now **close-to-close** instead of ending at midnight:

- The report goes out **a few minutes after your evening closing time**, exactly as
  you described.
- With split hours (e.g. 11:00–15:00 and 20:00–23:00) the **last closing** of the day
  is what counts, and the report still covers the whole day.
- Anything arriving **after** closing belongs to the **next** business day. #KYDENB
  at 23:53 now falls in the 31st, not the 30th — as you said it should.
- #6H6259, accepted at 01:00, will appear in the 31st's report. Confirmed.

**#14 — four fixes**

1. **Rejected/cancelled reservations** are no longer counted as accepted (your
   **#FG6GD5** was the exact case). They now behave like cancelled orders, which were
   already excluded.
2. **Refunds**: a new **"Refunds"** row shows the number of refunded orders and the
   total, and **Collected is now net of refunds**. Your order **#439213274** (€86.40
   card, €20 refunded) showed the full amount collected — it no longer does. We also
   found a second bug in that same case: an order with a partial refund was being
   moved out of the card bucket into the cash/in-person bucket, which broke
   reconciliation. Also fixed — an online-paid order stays online after a refund.
3. **PayPal and other methods**: where it only said "Online (card)", you now get
   **Online (card) / Online (PayPal) / Online (other)**. The split only appears when
   a non-card method actually took money, so card-only restaurants see no extra rows.
4. **Cancellations**: new rows showing the number of cancelled or rejected **orders**
   and **reservations**, so nothing is unaccounted for.

All of this applies to the live in-app report, the end-of-day email, the printed
slip and the export.

**Also from your #10, #11 and #12**

- **#10**: beyond the email, the **order status page** now shows the rejection reason
  in the customer's language (it previously stayed in the restaurant's language).
  This applies to the standard reasons; a custom hand-typed reason is shown as
  written.
- **#11**: the cancellation email was already translated, but the confirmation
  **page** stayed in English. It now follows the language the guest booked in.
- **#12**: a guest's note written when booking a table **now reaches the kitchen app**,
  highlighted like an order note. It was being saved but never displayed.

**What we'd like you to re-test**

1. Tonight after closing: if there was any activity, the report should arrive within
   minutes, covering the full day (a zero-activity day sends nothing — by design).
2. That **#6H6259** appears in the 31st's report (and **#KYDENB** does not appear in the 30th's).
3. A rejected reservation: it should no longer be counted.
4. An order with a partial refund: it should appear under "Refunds" and reduce Collected.
5. If you have PayPal enabled, a PayPal order: it should read "Online (PayPal)".

Thanks again — these reports improved the product for every restaurant on it.
