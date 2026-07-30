/** Render-check the reservation closed-hours note (no send):
 *   1. requested + bookedWhileClosed + opensAtLabel → closedNoteWithTime with the time
 *   2. requested + bookedWhileClosed, no label → generic closedNote
 *   3. requested WITHOUT bookedWhileClosed → no note
 *   4. confirmed + bookedWhileClosed → no note (auto-confirmed needs no caveat)
 *   5. Italian requested + label → localized note
 *   npx tsx scripts/_render-reservation-closed-note.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import { renderEmail } from "../src/emails/render";
import ReservationConfirmation from "../src/emails/templates/ReservationConfirmation";
import { getDict } from "../src/lib/i18n-dict";

function expect(cond: boolean, label: string) {
  if (!cond) { console.error(`❌ ${label}`); process.exitCode = 1; }
  else console.log(`✓ ${label}`);
}

const base = {
  customerName: "Test",
  reservationNumber: "R1",
  restaurantName: "Demo",
  dateTime: "Friday, July 31, 19:00",
  partySize: 2,
};

async function main() {
  const t = await getDict("en");
  const tIt = await getDict("it");

  const withTime = await renderEmail(ReservationConfirmation({
    t, ...base, status: "requested", bookedWhileClosed: true, opensAtLabel: "Thursday, 31 Jul, 11:00",
  } as any));
  expect(withTime.includes("Check your email on Thursday, 31 Jul, 11:00"), "requested + label → closedNoteWithTime");
  expect(withTime.includes("your reservation request is queued"), "requested + label → reservation wording");

  const generic = await renderEmail(ReservationConfirmation({
    t, ...base, status: "requested", bookedWhileClosed: true,
  } as any));
  expect(generic.includes("reservation request is queued") && !generic.includes("Check your email on"), "requested, no label → generic closedNote");

  const open = await renderEmail(ReservationConfirmation({
    t, ...base, status: "requested",
  } as any));
  expect(!open.includes("currently closed"), "requested, open → no note");

  const confirmed = await renderEmail(ReservationConfirmation({
    t, ...base, status: "confirmed", bookedWhileClosed: true, opensAtLabel: "Thursday, 31 Jul, 11:00",
  } as any));
  expect(!confirmed.includes("currently closed"), "confirmed while closed → no note");

  const it = await renderEmail(ReservationConfirmation({
    t: tIt, ...base, status: "requested", bookedWhileClosed: true, opensAtLabel: "giovedì 31 lug, 11:00",
  } as any));
  expect(it.includes("richiesta di prenotazione") && it.includes("giovedì 31 lug, 11:00"), "Italian localized note");
}
main();
