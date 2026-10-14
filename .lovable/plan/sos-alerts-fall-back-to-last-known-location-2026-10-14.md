# SOS alerts: fall back to last known location

## Why the test had no location

The alert takes its location from the SOS event's saved GPS coordinates. The live test event was created by hand without coordinates, so the alert correctly said "Location unavailable". A real SOS tapped in the app captures the phone's GPS and saves it, so manual SOS alerts do include the location.

The genuine gap: SOS events raised automatically — the missed check-in escalation — are created without coordinates, so those alerts would always say "Location unavailable" even when the app knows where the ward is.

## What changes

1. **One change in the SOS alert function** (`send-sos-alert`): when the SOS event has no saved coordinates, fall back to the ward's last known location, which the app already saves whenever location sharing is on.
   - The message still carries the same Google Maps link format.
   - If neither exists, it keeps saying "Location unavailable" as today.
2. No database changes, no new settings, no change to what guardians see beyond the location line being filled in.

## Notes

- The fallback only exists for wards who have location sharing turned on; the app deletes the stored location when sharing is off, and that behavior stays as it is.
- Side observation from investigating: the missed check-in escalation fired for real today — four wards have active SOS events from 9:00 PM IST. Worth a look in the admin area; tell me if you want them checked or resolved.

## Verification

- Re-run one live SOS test to +91 8104919135 with the event left coordinate-less, and confirm the WhatsApp/SMS now carries the last known location link instead of "Location unavailable".
- Typecheck after the edit.

## Technical details

- In `supabase/functions/send-sos-alert/index.ts` (~lines 753-789), after the `sos_events` lookup yields no coordinates, read `user_settings.settings->'lastLocation'` (`lat`, `lng`) for the user and build the same `https://maps.google.com/?q=lat,lng` link.
- `useLocationSync` writes `settings.lastLocation` / `lastLocationAt`; no writes needed there.
- Redeploy `send-sos-alert` after the edit.
