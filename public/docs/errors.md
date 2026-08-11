# Errors

| HTTP | Code | Meaning | What to do |
|------|------|---------|------------|
| 401 | `INVALID_MANDATE_KEY` | Missing or wrong Mandate key | Paste the correct `mdt_live_…` key |
| 403 | `CLIENT_KEY_KILLED` | Key paused | Re-enable on the client page |
| 403 | `PROMO_TRIAL_ENDED` | Free credits ended | Add BYOK in Settings, then re-enable |
| 429 | `CLIENT_BUDGET_EXCEEDED` | Cap hit for the period | Raise budget (BYOK) or wait for the next period |
| 429 | `PROMO_POOL_EXHAUSTED` | Shared $5 promo pool used | Add BYOK in Settings |
| 400 | `BYOK_REQUIRED` | Provider keys required | Save OpenAI/Anthropic in Settings |
| 400 | `PROMO_LOCKED` | Cannot edit promo budget/period | Switch to BYOK for custom caps |
| 400 | `INVALID_MANDATE_TAG` | Bad `X-Mandate-Tag` | Use a simple slug |
| 502 | `UPSTREAM_ERROR` | Provider key missing/misconfigured | BYOK: Settings. Promo: platform config |

## Error body shape

```json
{
  "error": {
    "code": "CLIENT_BUDGET_EXCEEDED",
    "message": "…",
    "details": {}
  }
}
```
