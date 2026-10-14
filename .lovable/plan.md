# Sync GitHub main and publish the project

## Situation

GitHub's two-way sync has already pulled the latest `main` commit into the project: `292e9d5f` — "fix(orange-health): display exact partner api error message and ensure strict test_id format" (the error-detail improvement for Home Lab Tests, from your developer). It changes only one frontend file (`src/components/health-tools/OrangeLabTests.tsx`) — no edge functions or migrations, so there is nothing to deploy on the backend. "Deploy" here therefore means publishing the frontend to the live site.

## Steps

1. Run the typecheck (`tsgo -p tsconfig.app.json --noEmit`) to confirm the synced code compiles cleanly.
2. Confirm the build log shows a clean build.
3. Publish the project so the live site (`iamgood.lovable.app`) serves the latest code, including:
   - The Orange Health fix (exact partner error messages shown in the toast instead of the generic "non-2xx" message, plus strict test_id format).
   - The Guardian Lab Tests view in Reports.
   - The "Future Wave Technologies" line above the logo on the landing page.

## Notes

- No code changes are part of this plan — sync, verify, publish only.
- After publishing, a sandbox test booking in Home Lab Tests should now show the specific Orange Health error text when a booking fails.
