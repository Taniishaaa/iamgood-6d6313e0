# Remove the ALP dependency from SOS alerts

## What changes

1. **SOS alert function** stops needing the old ALP setting. Alerts send as long as the MSG91 key is present and at least one guardian has a valid number.
2. **WhatsApp and SMS variables** both go through the single MSG91 OneAPI "sos-alerts" flow:
  - WhatsApp: body_var_1 to body_var_4 (Ward name, IST time, location link, health summary). These stay as they are now.
  - SMS: var1 to var4 with the same four values, added alongside.
  - The `alp` variable is removed from the request.
3. **Delivery log rule**: the allowed channel list for SOS delivery attempts becomes `whatsapp`, `sms` and `oneapi`. The delivery webhook keeps updating rows by request ID, so nothing changes in it.
4. **Old settings removed**: delete the `MSG91_SOS_ONEAPI_ALP` and `MSG91_SOS_SMS_TEMPLATE_ID` secrets. First check that no other function uses `MSG91_SOS_SMS_TEMPLATE_ID`, including the offline fallback and the escalation in check-missed-checkins.
5. **MSG91 key**: you pasted the key in chat. I won't put it in code. The existing `MSG91_AUTH_KEY` secret stays as it is. If this is a new key, I'll open the secure form so you can paste it there. It's safer to change this key in MSG91, since it is now in the chat history.

## Flow

```text
SOS trigger -> send-sos-alert -> accepted guardians
  -> MSG91 OneAPI (WhatsApp body_var_1..4 / SMS var1..4)
  -> MSG91 delivery -> sos-delivery-webhook -> sos_message_attempts
```

## Verification

- Run a code check, deploy send-sos-alert, and confirm there is no "ALP not configured" error.
- I'll only send a live test SOS if you ask (for example, to +91-8104919135). yes. 

## Technical details

- In `supabase/functions/send-sos-alert/index.ts`, remove `alp` from the env read, the guard, the variables, and the `channels.oneapi` condition (around lines 868-917 and 1112).
- Run a migration to drop and re-add `sos_message_attempts_channel_check` with `CHECK (channel IN ('whatsapp','sms','oneapi'))`.
- Delete both secrets with the secrets tool.