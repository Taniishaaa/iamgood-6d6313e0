# Upgrade Tanisha Gupta to Premium Plus

## Who
Tanisha Gupta (ward account, phone +91 81049 19135) currently has **no active plan at all** — there is no subscription record for her, so the app treats her as Free.

## What will change
Give her a **Premium Plus** plan that stays active indefinitely ("until further notice"), so every premium feature unlocks for her immediately.

- Plan: Premium Plus
- Status: active, not a trial
- Amount recorded: 0 (complimentary upgrade, no payment taken)
- End date: far in the future (year 2099) so it never lapses on its own

To end it later, we simply mark that record cancelled or set an end date.

## Notes
- No app code changes — this is a data change only.
- Her guardian links, check-ins, medications and all other data stay untouched.
- Because admin/premium checks read this record, the change takes effect the next time she opens or refreshes the app.

## Technical detail
Insert one row into `subscriptions`: `user_id = 36251580-f6a5-4a5a-a724-3dcd1158b1a5`, `plan_type = 'premium-plus'`, `billing_cycle = 'yearly'`, `status = 'active'`, `amount_paise = 0`, `is_trial = false`, `starts_at = now()`, `expires_at = '2099-12-31'`. `useSubscription` picks the newest active, non-expired row, so this resolves to `plan: 'premium-plus'` and unlocks all `FEATURE_TIERS` entries plus the 10-guardian limit.
