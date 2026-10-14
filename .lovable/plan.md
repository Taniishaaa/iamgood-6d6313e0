# Lab Results for Guardians

## What exists today

- The Home Lab Tests screen (My Health → Health Tools) already gives the **ward** an Orders tab with booking status, "Check Results", and report download. No new ward screen is needed.
- The developer's `lab_orders` migration already includes an access rule letting **accepted guardians** read their ward's lab orders — but no guardian screen uses it yet.
- The Orange webhook only logs events; orders sync to "completed" (with report link) only when someone taps "Check Results".

## What we'll build

A new **"Lab Tests"** section in the guardian's existing Reports screen (`/guardian/reports`), alongside Medications, Vitals, Hospital Visit, etc. Not under My Health — that area is ward-only and guardians never see it.

For the currently selected ward, the section shows each booked order as a card:

- Test/package names, patient name, appointment slot (date & time in IST)
- Status badge (requested / scheduled / completed / cancelled) and payment status
- **View Report** button when the report is ready (opens the Orange Health report)
- **Check Results** button per order when no report yet — calls the existing `orange-health` function's `test-results` action, which fetches the report and updates the order, so guardians don't depend on the ward opening the app
- Friendly empty state when the ward has no bookings

## Technical details

- `src/pages/GuardianReports.tsx`: add `"lab_tests"` to `ReportSection`, a tab entry (TestTube icon), and a section component that queries `lab_orders` for the selected `wardUserId` — the existing guardian read policy on `lab_orders` already authorizes this; no database changes.
- Reuse the existing `LabOrder` shape from `OrangeLabTests.tsx`; display via the same status/badge conventions as other guardian report sections.
- "Check Results" invokes `supabase.functions.invoke("orange-health", { action: "test-results", order_id, primary_patient_number })` — the function already supports this and updates the order server-side.
- Follow standing UI rules: mobile-first 430px, minimum 18px text, semantic color tokens, IST date/time display.
- No changes to the ward-facing screen, the edge function, or the database.

## Out of scope (flag for later)

- Auto-sync: the `orange-webhook` function verifies signatures but doesn't update orders yet. Wiring it to mark orders completed when Orange sends a "report ready" event would remove the need to tap "Check Results" — needs the webhook secret configured and Orange's event format. Recommend as a follow-up once live API access exists (currently sandbox).
