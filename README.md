# The Card Room

Card games with real casino rules and pretend dollars. Plain HTML, CSS and JavaScript, so there's no build step. Fonts load from Google Fonts.

- **Blackjack** (`blackjack/`): single player. Buy in for any amount, bet each hand, double, split, surrender, insurance. Resetting the session wipes the bankroll.
- **Texas Hold'em** (`poker/`): no-limit cash game.
  - **vs bots**: runs entirely in the browser with 1–7 bots (easy, normal, hard).
  - **with friends**: online tables for 2–8 players. The host sets the blinds, minimum buy-in and time to act, and shares a 6-character code. Players buy in, rebuy when busted, and cash out. When the host closes the table, everyone sees what they bought in for, what they left with, and who pays whom. No real money moves: friends settle up themselves.

## Files

| Path | What it does |
| --- | --- |
| `index.html` | Main menu |
| `shared.css` | Shared table look for the menu and poker |
| `blackjack/` | Blackjack page, styles, rules (`rules.js`) and game (`game.js`) |
| `poker/app.js` | Poker screens and table rendering |
| `poker/local.js`, `poker/bot.js` | Bots mode: local table and bot decisions |
| `poker/online.js` | Online mode client (talks to the edge function, listens for table updates) |
| `poker/config.js` | Supabase URL and anon key for online mode (empty = online mode switched off) |
| `supabase/functions/_shared/poker-engine.js` | Hold'em rules: dealing, betting, side pots, hand evaluation. Used by both modes. |
| `supabase/functions/_shared/poker-room.js` | Online table rules: seats, buy-ins, turn clock, leaving, closing, settling up |
| `supabase/functions/poker/index.ts` | Edge function: the only thing that can read the deck and hole cards |
| `supabase/migrations/0001_poker_rooms.sql` | Tables, row-level security, realtime, and the save function |
| `*.test.js`, `*.test.mjs` | Tests (not needed on the server) |

## Run it locally

Blackjack works straight from the file. Poker uses JavaScript modules, which browsers don't load from `file://`, so serve the folder, for example:

```bash
npx serve .
```

Run the tests (Node 18+):

```bash
node --test
```

## Switch on online poker (Supabase)

Use a project of its own for this, not one that holds other data.

1. Create a project at https://supabase.com/dashboard (the free plan is enough).
2. Sign the CLI in once (opens a browser):
   ```bash
   npx supabase login
   ```
3. Create the tables. In the dashboard, open **SQL Editor**, paste `supabase/migrations/0001_poker_rooms.sql`, and run it.
4. Deploy the table server. `<project-ref>` is the id in your project's URL:
   ```bash
   npx supabase functions deploy poker --no-verify-jwt --project-ref <project-ref>
   ```
   `--no-verify-jwt` is needed because players don't have accounts; the function checks each player's private seat token itself.
5. In **Project Settings → API**, copy the project URL and the anon (public) key into `poker/config.js`, then commit and push.

The anon key is safe to publish: it can only read the public table state. Decks, hole cards and seat tokens live in `poker_secrets`, which only the edge function can touch.

## Put it online

The site is static. GitHub Pages serves it from the `main` branch root. Netlify, Cloudflare Pages and Vercel work too, with no build command.
