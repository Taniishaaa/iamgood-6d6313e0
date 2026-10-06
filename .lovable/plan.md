# People & Access screen

## Why

You wanted a "Manage Project" page to see who has accounts and to reset or remove access. This app's database and sign-ins are managed inside Lovable Cloud, so there is no separate dashboard to open. The plan is to put those controls where you already manage things today — inside the app's own admin area.

## What you'll see

A new **People** section in the admin area (alongside Coupons, Waitlist, Contacts, Emails, OTP Log) listing all 17 accounts:

| Column | What it shows |
| --- | --- |
| Name / Phone | Ward or guardian identity |
| Role | Ward, Guardian, or Admin |
| Plan | Free, Basic, Pro, Premium Plus, trial, plus expiry date |
| Last active | When they last opened the app |
| Links | Which wards a guardian is attached to, and which guardians a ward has |
| Status | Active, or blocked from signing in |

Search by name or phone, and filter by role, plan, or "not active in 30 days".

Tapping a person opens their detail panel: full link list, plan history with dates, and the actions below.

## What you can do

- **Block sign-in** — stops someone signing in immediately, keeps all their health records, vault documents and history intact. Undo with **Restore access**.
- **Change plan** — set Basic, Pro or Premium Plus with a start and expiry date (this is the same upgrade you asked me to do manually for Tanisha Gupta).
- **Send a sign-in reset link** — only offered for accounts with a real email address; phone-only accounts reset by OTP automatically and don't need one.
- **Unlink a guardian** — removes one guardian from one ward without deleting either account.
- **Delete permanently** — separate, deliberately harder action: it erases the person's account and every record attached to it. Requires typing their name to confirm.

## How it's protected

Every action sits behind the same two-step check your admin area already uses: an admin sign-in plus the 60-second verification code. Each action is written to the existing admin audit log with who did it, when, and from what address.

Nothing changes for wards and guardians: no new prompts, no changed alerts, no altered scheduling or notification behaviour.

## Technical details

- New edge function `admin-people`, service-role, verifying `has_role(admin)` and the step-up token header — the exact guard pattern `admin-contacts` uses.
- Actions map to: block/restore via the auth admin API's ban setting (sign-in is refused while data rows stay), plan change via an upsert into `subscriptions`, unlink via the `guardians` row for that pair, permanent deletion via the auth admin delete call.
- **Verified risk:** every user-owned table (`profiles`, `medical_records`, `encrypted_documents`, `health_profile`, `sos_events`, `check_ins`, `user_settings`, `vault_pins`, `guardians` and more) has `ON DELETE CASCADE` to the auth account. Deleting an account therefore destroys their data, which is why "block sign-in" is the default action and permanent deletion is a distinct, name-confirmed path.
- Front end: `src/pages/AdminPeople.tsx` following the `AdminWaitlist.tsx` layout, a lazy route at `/admin/people`, and one new entry in `AdminSidebar.tsx`.
- No new tables. Reads use existing `profiles`, `user_roles`, `subscriptions`, `guardians`; writes append to `admin_audit_log`.

## Verification

1. Load the page and confirm all 17 accounts appear with the right role counts (9 wards, 7 guardians, 2 admins).
2. Block a test account, confirm it cannot sign in, restore it, confirm it can.
3. Change a plan and confirm the app's Subscription screen reflects it.
4. Unlink a guardian and confirm the ward's guardian list updates.
5. Confirm each action lands in the admin audit log.
