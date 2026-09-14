# Weekly guardian report as a WhatsApp PDF

Primary Guardians already get the weekly email every Sunday 9:00 AM IST. They will now also get a WhatsApp message with the same report attached as a branded PDF, at the same time.

## What already exists

- The Sunday 9:00 AM IST schedule for this WhatsApp report is already registered in the backend, pointing at a function named `weekly-guardian-whatsapp-report`.
- The private `weekly-reports` storage area exists, with a monthly cleanup that deletes files older than 30 days.
- The function itself does not exist yet — that is the missing piece, so nothing is being sent today.

## What gets built

Create the `weekly-guardian-whatsapp-report` function, using the code supplied in the request, with these adjustments:

1. **Same numbers as the email.** Reuse the identical week window (previous Mon–Sun IST) and the same stats calculation as the email report so both reports always agree.
2. **PDF generation** with jsPDF: Check-iN letterhead header, greeting, health-score banner, four stat cards (check-ins, medications, SOS, missed), vitals averages, missed check-in list, medication notes, branded footer.
3. **Upload** the PDF to the private `weekly-reports` area and create a 7-day signed link.
4. **WhatsApp send** via the approved MSG91 template `weekly_report_guardian` (5 body variables: guardian name, ward name, week label, health score, one-line summary), followed by the PDF as a document message using the signed link.
5. **Recipients:** accepted guardians flagged as primary who have a usable phone number. Phone numbers normalised to `91XXXXXXXXXX`.
6. **No duplicates:** an idempotency key per guardian per week recorded in the existing send log, checked before sending.
7. **Manual test hook:** the function accepts an optional single ward id and a non-cron trigger flag so the report can be run on demand for one ward without waiting for Sunday.

## Technical notes

- New file: `supabase/functions/weekly-guardian-whatsapp-report/index.ts`; `verify_jwt = false` entry added to `supabase/config.toml` (cron calls it with a service-role bearer).
- Uses `npm:jspdf@2.5.1` and `npm:@supabase/supabase-js@2`; MSG91 auth via the existing `MSG91_AUTH_KEY` secret, namespace `e67e5302_b6d0_403e_b3cc_8fa6e8accb01`, integrated number `917045868482`.
- Idempotency rows written to `email_send_log` with `template_name = "weekly-wa-report"`; `recipient_email` falls back to the phone when no email is on file.
- The existing email report, its cron job, and the 30-day PDF cleanup job stay untouched. No new cron registration is needed.

## Verification

- Deploy, then run the function manually for one ward and check the function logs for the MSG91 template and document responses.
- Confirm the PDF renders correctly by opening the generated file from storage.
