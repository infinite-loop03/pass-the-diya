# Pass the Diya

A diya you can't light yourself. Someone has to pass you their flame, through a link or a QR code on their phone. Hold your diya to it, it catches, and now you pass yours on. Every flame remembers how many people it has passed through and where its chain began, and a map shows the cities where diyas are glowing.

It runs entirely on Cloudflare's free plan with no credit card, so there is no way to get a bill.

## Run it on your laptop

```bash
npm install
npm run dev            # http://localhost:8787
```

Locally, every diya is given a random Indian city so the map has something to show. Two handy URLs while testing:

- `http://localhost:8787/__scheduled?cron=*/3+*+*+*+*` refreshes the map now instead of waiting for the next 3-minute cycle.
- `http://localhost:8787/?reset` forgets your lit diya so you can light again on the same browser.

`npm test` checks the share-link format; `npm run typecheck` checks the Worker.

## Put it online (about 15 minutes)

1. **Sign in to Cloudflare** (create a free account first if you need one; don't add a card):
   `npx wrangler login`
2. **Create the database**:
   `npx wrangler d1 create pass-the-diya`
   Copy the `database_id` it prints into `wrangler.jsonc`.
3. **Deploy**: `npm run deploy`
   It prints your address, something like `https://pass-the-diya.<you>.workers.dev`.
4. **Make WhatsApp previews work**: `npm run set-url -- https://pass-the-diya.<you>.workers.dev`, then `npm run deploy` again.
5. **Light the first diya.** Open your address on your phone and hold the diya until it catches. Copy the link from the address bar; everything after `?f=` is your flame.
6. **Make it the root of every chain.** Paste that value into `firstFlame` in `public/config.js`, add your LinkedIn or Instagram to `creator.url` if you like, and deploy once more. Now anyone who arrives without a link borrows from your diya.
7. **Put your flame's link in your bio.** Everyone who comes from the reel then lights from your diya, and every chain in the country traces back to it.

## If it goes viral: what the free plan allows

| Free-plan limit (resets 05:30 IST) | What uses it | Roughly how far it goes |
|---|---|---|
| 100,000 Worker requests a day | 1 per diya lit, 1 per map view | ~40,000 people a day if most also open the map |
| 1,000 Worker requests a minute | the same | short bursts of ~15 diyas a second |
| 100,000 database writes a day | 1 per diya lit | not the bottleneck |
| 5 million database reads a day | 1 per map view, plus one scan of the city list every 3 minutes | fine up to ~8,000 distinct cities |
| Static files (the page itself) | every visit | unlimited |

When a limit is hit, nothing breaks in a way people notice. The page, the diya, the flame's history and passing it on all work without the Worker, because the history lives in the link. The map shows "The map is catching up", and diyas lit during that time aren't counted. Everything resumes when the limits reset.

If you ever want to remove the limits, that's a deliberate choice: Cloudflare's Workers Paid plan (about $5 a month when this was written; check their pricing page). Until you add a card, it cannot cost you anything.

## Design decisions

These are the choices that shape how the app behaves, and why.

1. **The flame's history lives in the link, not the database.** A link is a small versioned blob: the flame's place in the chain, where the chain began, the day it began, and the last four cities. Passing a diya therefore needs no server, and it survives outages and quota limits.
2. **One database write per diya.** Lighting a diya adds 1 to its city's counter, nothing more. The map reads one pre-built snapshot row that a scheduled job refreshes every 3 minutes, so map traffic never scans the table.
3. **Location without asking.** The city comes from Cloudflare's IP lookup, so there's no permission prompt. Coordinates are rounded to about 10 km, and nothing is stored per person: no IP, no device ID, no names. Request logging is switched off in `wrangler.jsonc`.
4. **The link shows the city it was lit in.** That is the point of the trail, and the page says so in its footer. It's city-level only.
5. **No borders on the map.** It's only points of light. Depicting India's boundaries is legally and politically sensitive; lights on a dark background avoid the question and look better anyway.
6. **Links are versioned and permanent.** Links in WhatsApp groups live forever, so the v1 format must never change meaning. A new format would be v2, with v1 still readable (see `public/js/link.js`).
7. **Accepted risks for a festival toy:**
   - Links aren't signed, so someone could craft a link claiming to be the 99,999th diya. A later version could have the Worker sign each flame.
   - Anyone can call the counting endpoint repeatedly to inflate a city or burn the daily quota. There's deliberately no per-IP limit: mobile networks in India put thousands of people behind one IP address, so an IP limit would block real users. The worst case is the map pausing until the next reset.

## Shooting the reel

- Open "Pass it in person" on the first phone; it shows a QR code and keeps the screen awake. The second phone scans it with its camera, opens the link, and holds its diya.
- Turn screen brightness to full and switch on Do Not Disturb on every phone, and keep the room as dark as you can.
- Test the full chain with real phones once before filming. Some camera apps open links in an in-app browser that behaves slightly differently.
- End on the map ("See where diyas are glowing") once a few cities are lit.

## Files

```
public/            the page: everything here is served as static files
  index.html, styles.css
  js/app.js        screens, hold-to-light, sharing, the map
  js/link.js       the share-link format (tested in test/link.test.mjs)
  config.js        the first flame and your name: the only file to edit
  og.jpg           the WhatsApp preview image
  fonts/, vendor/  self-hosted fonts (SIL OFL) and the QR library (MIT)
src/index.ts       the Worker: /api/light, /api/sky, the 3-minute snapshot job
migrations/        the database tables
wrangler.jsonc     Cloudflare configuration
```
