# The Card Room

Card games with real casino rules and pretend dollars. Plain HTML, CSS and JavaScript, so there's no build step. Two header buttons: 🎨 picks one of fifteen themes (Classic, Cards by the Ocean, Feeling Pretty, Wild West, Vegas, Into the Future, Northern Lights, Lantern Night, Emperor's House, Pirate's Cove, Midnight Jazz Club, Enchanted Forest, Garage, Space Fight, Feeling Deezy?) and ☾/☀ turns dark mode on or off for any theme. Fonts load from Google Fonts.

- **Blackjack** (`blackjack/`): single player. Buy in for any amount, bet each hand, double, split, surrender, insurance. Resetting the session wipes the bankroll.
- **Poker** (`poker/`): cash games in three flavours the host picks: **Texas Hold'em** (no-limit), **Omaha** (4 cards, use exactly 2 + 3 from the board, pot-limit) and **Five Card Draw** (swap up to 3, or 4 when keeping an ace; up to 6 players). Premoves before your turn: Check/Fold, Check, Call $X, Call any.
  - **vs bots**: runs entirely in the browser with 1–7 bots (easy, normal, hard). Bots have personalities: rock, maniac, calling station and shark, each with a matching look. Coach tips after each hand point out your biggest decision, for example whether a fold was right for the price.
  - **with friends**: online tables for 2–8 players. The host sets the blinds, minimum buy-in and time to act, and shares a 6-character code. Players buy in, rebuy when busted, and cash out. When the host closes the table, everyone sees what they bought in for, what they left with, and who pays whom. No real money moves: friends settle up themselves.
  - **Rooms you keep**: the host ends a session to settle up, and the room stays open with the same code. Players buy in again for the next session. A room ledger keeps every session's result plus running totals, with one list of payments that squares everything and a 'mark as paid' reset. The host gets a private host link to run the room from any device; closing a room for good is a separate button.
  - **Playing with friends**: table chat and emoji reactions that pop up over seats, watchers who can chat and sit down later, a host pause button, and house rules the host picks: ante, straddle and run it twice (everyone all in agrees, the rest of the board is dealt twice and the pot split).
  - **At every table**: cards are dealt round the table from the dealer. You pick an avatar: 21 ready-made characters, or build your own from skin, eyes, hair, facial hair, hat, glasses, shirt and background. An odds helper shows your chance to win, your chance of a strong hand (three of a kind or better) on the next card and by the river, and your chance of each hand. Each part can be switched off by the player, and the host of an online table decides which parts are allowed. A switch decides whether you show or muck when the rules let you choose. Winning at showdown and all-in hands always show. In bots mode you also set how the bots behave.

- **Capsa Banting** (`capsa/`): 4 players with house rules: 2 highest, suits ♠ ♥ ♣ ♦, 3♦ starts the first game, bombs (four of a kind, straight flush) beat any package or a single 2, a bomb on a single 2 ends the game, no finishing on a single 2. Points per card left (2s count double, ×2 at 10+ cards, ×3 at 13) at a $ value per point. Online rooms fill empty seats with bots; points won or lost against bots don't count as money. **Loser mode** (a host option): play goes on until one player is left holding cards; places score +3, +1, −1, −3. Playable cards are highlighted (a personal toggle), cards can be grouped in your hand, plays and passes can be premoved, and bots come in Easy, Normal, Hard and Expert (plans its whole hand and remembers played cards; `capsa-expert.js`).
- **Cangkul** (`cangkul/`): the Indonesian follow-suit game for 2 to 4. No card of the led suit? Dig through the stock until you find one. Host options: 5 or 7 cards, what happens on an empty stock (pick up the trick or skip), winner mode or loser mode.
- **Gaple** (`gaple/`): Indonesian dominoes for 4 (bots fill empty seats). Double six or double blank opens; no boneyard, so you pass when you cannot play. Losers pay their pips; going out on a tile that fits both ends pays double.
- **Mahjong** (`mahjong/`): Hong Kong rules with 144 tiles (flowers and seasons included): chow, pung, kong (robbing a kong allowed), seven pairs and thirteen orphans, faan scoring capped at 10 with limit hands. The table chooses whether a hand needs 3 faan to win or any complete hand wins. Self-drawn wins are paid by all three others; off a discard the discarder pays double. Bots plan towards a scoring hand; online rooms fill empty seats with bots like Capsa.
- **Board games** (`boardgames/`): a page of its own on the menu.
  - **Ludo** (`ludo/`): 4 colours, bots in empty seats, classic rules (6 to come out, a 6 rolls again, three 6s lose the turn, captures except on safe squares, exact roll home) with house options (1 also comes out, capture rolls again, blocks, must capture). The others pay the winner 1 point per token not home.
  - **Werewolf** (`werewolf/`): 5 to 12 friends in a room, Werewolves (1/2/3 by table size), Seer, Doctor and Villagers; timed night, day and vote; roles revealed on death; village, wolves and graveyard chats; optional bots that never talk; a tally of wins, no money.
  - **Undercover** (`undercover/`): 4 to 12 friends in a room. Civilians share a word, the undercover (1/2/3 by table size) has a close one and isn't told, optional Mr. White has none. Clues in turn (typed, or "said it out loud" at a table), talk, vote, runoff on a tie; Mr. White's guess when voted out. About 470 built-in pairs in Bahasa Indonesia and English (each player picks), plus the host's own pairs. Also pass and play on one phone (clues out loud, the table taps who's out). Points: civilian win 2, Mr. White 6, undercover 10. No bots.
  - **Checkers** (`checkers/`): vs a bot (Easy/Normal/Hard, an alpha-beta search with a per-move budget), two on one device, or online (first two in the room play, others watch; colours swap each game; optional move clock, a timed-out move is made for you). Dam rules (flying kings, men capture backwards) or classic English; capture is compulsory and chains must be completed; 25 king-only moves each without a capture is a draw. Wins tally, no money.
  - **Heist** (`heist/`): 5 to 10 friends; crew vs hidden undercover cops (2/2/3/3/3/4 for 5–10), 5 heists with set team sizes, open team votes (5 rejections in a row = cops win), secret Success/Sabotage cards (the 4th heist needs 2 sabotages with 7+). Optional Mastermind (crew, knows the cops) and Sniper (cop, one shot at the Mastermind after 3 crew successes). Optional bots; a leaver's seat is played by a bot; cops-only chat. Wins tally, no money.

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
| `cangkul/`, `gaple/` | Cangkul and Gaple pages, bots mode (`local.js`) and online rooms (`online.js`) |
| `supabase/functions/_shared/cangkul-*.js`, `gaple-*.js` | Cangkul and Gaple rules, bots and online rooms |
| `capsa/` | Capsa Banting page, bots mode (`local.js`) and online rooms (`online.js`) |
| `supabase/functions/_shared/capsa-engine.js`, `capsa-bot.js`, `capsa-expert.js`, `capsa-room.js` | Capsa rules, bots and online rooms (used by the browser and the server) |
| `mahjong/` | Mahjong page, tile art (`tiles.js`), bots mode (`local.js`) and online rooms (`online.js`) |
| `supabase/functions/_shared/mahjong-engine.js`, `mahjong-bot.js`, `mahjong-room.js` | Mahjong rules and scoring, bots, and online rooms |
| `boardgames/`, `ludo/`, `werewolf/`, `undercover/`, `checkers/`, `heist/` | Board games page and each board game's page |
| `supabase/functions/_shared/ludo-engine.js`, `ludo-bot.js`, `ludo-room.js` | Ludo rules, bots and online rooms |
| `supabase/functions/_shared/werewolf-engine.js`, `werewolf-room.js` | Werewolf rules, rooms, bots and chat channels |
| `supabase/functions/_shared/checkers-engine.js`, `checkers-bot.js`, `checkers-room.js` | Checkers rules (Dam and English), the search bot, two-player rooms |
| `supabase/functions/_shared/heist-engine.js`, `heist-room.js` | Heist rules, rooms, bots and the cops' chat |
| `supabase/functions/_shared/undercover-engine.js`, `undercover-room.js`, `undercover-words.js` | Undercover rules, rooms and the bilingual word list |
| `theme.js`, `theme-deco.js` | Themes, dark mode and each theme's background scenery |
| `theme-loader.js` | The loading screen: a short animation in each theme while a page opens |
| `theme-music.js` | Background music for every theme, played live with Web Audio (off until you press ♪). It follows the game: each page reports how heated the table is (calm, normal, intense: layers come in and drop out) and plays short cues in the theme's own sound for your turn, a win, a loss and big moments (`window.CR_CUE` in theme.js). |
| `poker/odds.js` | Odds helper: simulates the rest of the hand from what you can see |
| `poker/online.js` | Online mode client (talks to the edge function, listens for table updates) |
| `poker/config.js` | Supabase URL and anon key for online mode (empty = online mode switched off) |
| `supabase/functions/_shared/poker-engine.js` | Hold'em rules: dealing, betting, side pots, hand evaluation. Used by both modes. |
| `supabase/functions/_shared/poker-room.js` | Online table rules: seats, buy-ins, turn clock, leaving, closing, settling up |
| `supabase/functions/poker/index.ts` | Edge function: the only thing that can read the deck and hole cards |
| `supabase/migrations/` | Tables, row-level security, the save function, per-room update messages, and the daily sweep of old rooms |
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
3. Create the tables. In the dashboard, open **SQL Editor** and run the files in `supabase/migrations/` one at a time, in order (0001, 0002, 0003).
4. Deploy the table server. `<project-ref>` is the id in your project's URL:
   ```bash
   npx supabase functions deploy poker --no-verify-jwt --project-ref <project-ref>
   ```
   `--no-verify-jwt` is needed because players don't have accounts; the function checks each player's private seat token itself.
5. In **Project Settings → API**, copy the project URL and the anon (public) key into `poker/config.js`, then commit and push.

The anon key is safe to publish: it can only call the table server and listen on a room's channel. It cannot read any table, so nobody can list rooms or codes. Decks, hole cards and seat tokens live in `poker_secrets`, which only the edge function can touch.

## Put it online

The site is static, so there's no build step.

- **Main address: https://thecardroom.vercel.app.** This is the Vercel project `thecardroom`, linked to this repo. Every push to `main` goes live by itself. To deploy by hand, run `npx vercel deploy --prod`.
- **GitHub Pages** still serves the same files at https://harryalexandro32.github.io/blackjack-site/.

Saved data (bankroll, avatar, seat) is kept per address, so it doesn't carry over between the two.
