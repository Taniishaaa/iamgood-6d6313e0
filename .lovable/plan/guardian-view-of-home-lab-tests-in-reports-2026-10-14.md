# Guardian View of Home Lab Tests in Reports

Add a **Lab Tests** section to the Guardian Reports screen (`/guardian/reports`) so an accepted guardian can see the selected ward's Home Lab Test bookings and results.

## What the guardian will see

- A new **"Lab Tests"** badge in the reports section row (test-tube icon), alongside Meds, Check-iNs, Vitals, etc.
- A list of the ward's lab bookings, newest first. Each card shows:
  - Patient name and the tests booked (e.g. CBC, HbA1c)
  - Collection date & time slot and address
  - Status badge (booked / sample collected / completed / cancelled) and payment status
  - Total price when available
- **Check Results** button per order — asks the lab whether the report is ready; when ready, the report link is saved and the card updates.
- **View Report** button once a report is available (opens the lab's report PDF in a new tab).
- Empty state: "No lab tests booked yet."

Read-only: guardians cannot book, edit, or cancel orders from this screen.

## Technical details

- `src/pages/GuardianReports.tsx`:
  - Add `"lab_tests"` to the `ReportSection` type and the `sections` array (icon `TestTube2`).
  - When the section is active, fetch `lab_orders` for `wardUserId`, ordered by `created_at` desc.
  - New render block with order cards, status/payment badges, Check Results and View Report buttons.
  - Check Results calls the existing `orange-health` edge function (`action: "test-results"`, patient phone + order id) — the same call the ward's own screen uses. The function already saves the report link with elevated privileges, so it works for guardians without any backend change.
- No database changes: the `lab_orders` table already has a "Guardians can view ward lab orders" read policy for accepted guardians.
- No changes to the ward-facing booking screen.
- Verify with the typecheck and build.

## Notes

- Data shown depends on the ward having booked tests; until then the guardian sees the empty state.
- The Orange Health integration is still in sandbox mode (from the developer's earlier change) — same applies here.
