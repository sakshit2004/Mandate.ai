# Mandate

The web app for Mandate, built with React, TypeScript, and Vite.

## Development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Waitlist endpoint

Copy `.env.example` to `.env.local` and set `VITE_WAITLIST_ENDPOINT` to a form or API endpoint that accepts:

```json
{
  "email": "you@youragency.com",
  "source": "mandate-landing"
}
```

The landing page reports an error instead of claiming success when the endpoint is missing or rejects the request.

## Launch artifacts

- n8n setup guide: `/n8n-setup.html`
- 30-second looping demo: `/mandate-n8n-demo.gif`