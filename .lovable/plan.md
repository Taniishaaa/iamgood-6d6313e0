# Fix the My Activity page crash

## What's wrong

On the My Activity page, the two medication checks (refill running low, dose due) are combined with an "or" shortcut. When the first check is already true, the second one never runs. React requires both checks to run every single time the page draws, so this makes the page fail and show a blank/error screen — and only for people who actually have a low refill, which is why it looks intermittent.

Confirmed in `src/pages/MyActivity.tsx` line 13:
`const medsAlert = useRefillDue() || useMedicationDue();`

No other page has this pattern — the Home medications band and the Guardian activity page call the checks correctly.

## The fix

Run both checks separately, then combine the results:

```ts
const refillDue = useRefillDue();
const medDue = useMedicationDue();
const medsAlert = refillDue || medDue;
```

Nothing else on the page changes: same cards, same alert marker on Meds, same navigation.

## Verify

Load the My Activity page in a browser at mobile size, confirm it renders with the three cards and the vitals section, and confirm no errors in the console.
