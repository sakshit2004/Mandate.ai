# Mandate error codes

| HTTP | Code | Meaning | What to do |
|------|------|---------|------------|
| 401 | `INVALID_MANDATE_KEY` | Missing/unknown Mandate key | Paste the correct `mdt_live_…` key |
| 403 | `CLIENT_KEY_KILLED` | Key paused | Re-enable on client page |
| 403 | `PROMO_TRIAL_ENDED` | Free credits expired | Add BYOK in Settings, then re-enable |
| 429 | `CLIENT_BUDGET_EXCEEDED` | Cap hit for the period | Raise cap (BYOK) or wait for reset |
| 400 | `BYOK_REQUIRED` | Need provider keys | Save OpenAI/Anthropic in Settings |
| 400 | `PROMO_LOCKED` | Cannot edit promo budget/period | Switch to BYOK for custom caps |
| 400 | `INVALID_MANDATE_TAG` | Bad `X-Mandate-Tag` | Use a simple slug |
| 502 | `UPSTREAM_ERROR` | Provider key missing/misconfigured | BYOK: Settings. Promo: platform config |

Error body shape:

```json
{
  "error": {
    "code": "CLIENT_BUDGET_EXCEEDED",
    "message": "…",
    "details": {}
  }
}
```
