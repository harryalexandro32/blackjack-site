# The Card Room

Card games with real casino rules and pretend dollars. Plain HTML, CSS and JavaScript, so there's no build step. A switch in the header changes between the classic green felt and dark mode. Fonts load from Google Fonts.

- **Blackjack** (`blackjack/`): single player. Buy in for any amount, bet each hand, double, split, surrender, insurance. Resetting the session wipes the bankroll.
- **Texas Hold'em** (`poker/`): no-limit cash game.
  - **vs bots**: runs entirely in the browser with 1–7 bots (easy, normal, hard).
  - **with friends**: online tables for 2–8 players. The host sets the blinds, minimum buy-in and time to act, and shares a 6-character code. Players buy in, rebuy when busted, and cash out. When the host closes the table, everyone sees what they bought in for, what they left with, and who pays whom. No real money moves: friends settle up themselves.
  - **Rooms you keep**: the host ends a session to settle up, and the room stays open with the same code. Players buy in again for the next session. A room ledger keeps every session's result plus running totals, with one list of payments that squares everything and a 'mark as paid' reset. The host gets a private host link to run the room from any device; closing a room for good is a separate button.
  - **Playing with friends**: table chat and emoji reactions that pop up over seats, watchers who can chat and sit down later, a host pause button, and house rules the host picks: ante, straddle and run it twice (everyone all in agrees, the rest of the board is dealt twice and the pot split).
  - **At every table**: cards are dealt round the table from the dealer. You pick an avatar: 21 ready-made characters, or build your own from skin, eyes, hair, facial hair, hat, glasses, shirt and background. An odds helper shows your chance to win, your chance of a strong hand (three of a kind or better) on the next card and by the river, and your chance of each hand. Each part can be switched off by the player, and the host of an online table decides which parts are allowed. A switch decides whether you show or muck when the rules let you choose. Winning at showdown and all-in hands always show. In bots mode you also set how the bots behave.

## Files

| Path | What it does |
| --- | --- |
| `index.html` | Main menu |
| `shared.css` | Shared table look for the menu and poker |
| `blackjack/` | Blackjack page, styles, rules (`rules.js`) and game (`game.js`) |
| `poker/app.js` | Poker screens and table rendering |
| `poker/local.js`, `poker/bot.js` | Bots mode: local table and bot decisions |
| `poker/avatars.js`, `poker/look.js` | Avatar drawings (SVG from a short code) and the picker |
| `poker/sound.js`, `poker/replay.js` | Table sounds (made in the browser, with mute) and hand replay |
| `poker/odds.js` | Odds helper: simulates the rest of the hand from what you can see |
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

The site is static, so there's no build step.

- **Main address: https://thecardroom.vercel.app.** This is the Vercel project `thecardroom`, linked to this repo. Every push to `main` goes live by itself. To deploy by hand, run `npx vercel deploy --prod`.
- **GitHub Pages** still serves the same files at https://harryalexandro32.github.io/blackjack-site/.

Saved data (bankroll, avatar, seat) is kept per address, so it doesn't carry over between the two.
