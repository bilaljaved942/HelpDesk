# HelpDesk Agent web app

Next.js frontend. See the [main README](../README.md) for the full setup.

```bash
npm install
npm run dev -- --port 3100      # needs the API on :8100 (HELPDESK_API_URL to change)
```

- `app/page.tsx`: demo store with the floating chat (`components/ChatWidget.tsx`)
- `app/chat`: full-screen chat
- `app/dashboard`: Overview (stats), Inbox, Tickets, Help docs (login required, see `proxy.ts`)
- `lib/api.ts`: typed API client, including the streaming (SSE) reader for chat answers
