# Blackjack Practice Table

A static blackjack website with real casino rules and pretend dollars: buy in for any amount, bet each hand, and reset to start over. Plain HTML, CSS and JavaScript, so there's no build step and no dependencies. Fonts load from Google Fonts.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page markup |
| `styles.css` | Table, cards and controls |
| `rules.js` | Pure rules: totals, dealer drawing, settlement, basic strategy |
| `game.js` | Shoe, dealing, player actions, rendering, settings, stats |
| `rules.test.js` | Node tests for `rules.js` (not needed on the server) |

## Run it locally

Open `index.html` in a browser. Everything works from the file. Settings and session stats are saved in the browser's localStorage.

Run the rules tests (Node 18+):

```bash
node --test
```

## Put it online

Upload `index.html`, `styles.css`, `rules.js` and `game.js` to any static host:

- **Netlify Drop:** drag this folder onto https://app.netlify.com/drop.
- **GitHub Pages:** push the folder to a repo, then Settings → Pages → deploy from the `main` branch root.
- **Cloudflare Pages / Vercel:** import the repo as a static site with no build command and `/` as the output directory.

## Rules implemented

- Shoe of 1, 2, 6 or 8 decks, burn card, reshuffle at the cut card (75% penetration)
- Dealer peeks for blackjack with an ace or ten up; insurance / even money on an ace
- Blackjack pays 3:2; dealer hits or stands on soft 17 (setting)
- Double on any first two cards, double after split (setting)
- Split any pair, including mixed tens, up to 4 hands; split aces get one card and can't be resplit
- Late surrender (setting)
- Dealer skips drawing when every player hand has busted or surrendered
