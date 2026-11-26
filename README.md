# BID&BAT (Node.js)

Real-time multiplayer IPL-style player auction. Node.js server (plain `http` + `ws`), no build step.

## Run
1. Install Node.js 18 or newer from https://nodejs.org (LTS).
2. In this folder:

       npm install
       npm start

3. Open http://localhost:8000 . One person creates a room, the others join with the 5-letter code.

Playing with friends over the internet: expose port 8000, e.g. `npx ngrok http 8000` or `cloudflared tunnel --url http://localhost:8000`, and share the link. Set another port with `PORT=3000 npm start` (Windows PowerShell: `$env:PORT=3000; npm start`).

## Test
    npm test          # 18 rule tests (engine)
    npm run e2e       # real WebSocket flow: create, join, select, bid, sold, reconnect, late-join refused

## Layout
- src/engine.js    all game rules
- src/server.js    HTTP + WebSocket server
- public/          UI (index.html, style.css, app.js): scoreboard look, team colours, gavel animation, sound toggle
- data/players.json  339 players: name, type, overseas, wicketkeeper (review/edit freely)

## Player photos
Real player photos are not bundled (they are copyrighted). Each flashcard shows a designed placeholder with the player's initials.
To show a photo, drop it in `public/photos/` named after the player, e.g. `devon-conway.jpg` (jpg, jpeg, png or webp). It appears
automatically, no restart needed. See `public/photos/README.txt`. Only use photos you have the right to use.

## Wishlist
During player selection, tap the star on a player to wishlist him (this also adds him to the auction pool). Your wishlist is private.
When a wishlisted player comes up, you get an alert with a one-tap bid button, and the "My wishlist" panel tracks every wishlisted player (coming up, on stage, sold, unsold).

## Host controls during the auction
Pause/resume, **End auction** (two clicks), and the **Pools left** bar: tap a pool to bring it forward as the next pool.

## Notes
- Batting hand and bowling style in `data/players.json` (fields `bat`, `bowl`) were filled in from general cricket knowledge and may contain errors: please review.
- Defaults: purse 120 Cr, base price 1 Cr, bid buttons 10/25/50 lakh (all changeable by the host). Money is stored in lakhs (100 L = 1 Cr).
- Host can end the auction at any time (two clicks to confirm). Venue = state, ground and conditions dropdowns. Rooms live in memory: restarting the server loses them.
- 2025 roles come from CricTracker; 2024 roles and overseas/keeper flags were filled in by hand - please review.

## Trades and saving teams
- The 🔁 Trades button (top bar) jumps to the trade panel. Trades work during the auction and after it.
- Offer players both ways plus cash (I pay / I receive, in Cr). The other team can Accept, Reject or Counter.
- Press **Save team** when your XI is ready (teams with fewer than 11 players can save as they are). When every team has saved, the final squads and playing XI screen appears. A new trade unlocks the teams involved until they save again.

## Team rankings (after the auction)
When every team has saved, the final screen grades each team S, A, B or C. Grades use only `data/stats.json` (career stats, recent form, style, 0-100 role ratings with a confidence flag) and ignore money spent and purse left. Stats are never sent to players during the auction. Players marked low confidence had thin public data and count less; edit `data/stats.json` to correct any rating. Tier cut-offs are in `src/rating.js` (`CUTS`).

## Player list and team picker
`data/players.json` now has 401 players: the auction lists plus everyone who played at least one IPL 2024 or 2025 match (including retained stars such as Virat Kohli). Each player has a `team` and `season`: the franchise of his most recent season. On the selection screen use the **Team squad** dropdown to view one team and tick players, or press "Select all". Players with no `team` appear under "Other players". Squad lists were compiled from public pages and may have small errors; edit `team`/`season` in `data/players.json` to correct them.

## Removing a team
The host sees a **Remove** button (press twice to confirm) next to every other team in the lobby and in the squads list. A removed team is disconnected and cannot bid, trade or rejoin. If it held the top bid, that bid is void and the player restarts from base price. Its squad stays on record, and it is ignored when checking whether the auction is over, whether everyone has saved, and in the rankings.

## Bid buttons, reloads and logos
- Default bid buttons are +1 Cr, +2.5 Cr and +5 Cr (host can change them in settings; values are in lakh).
- Reloading the page puts you straight back in your room. If the room no longer exists (server restarted) you land on the start screen.
- Team logos: put `CSK.png`, `MI.png`, `RCB.png` ... (png, svg, jpg or webp, named with the team code) in `public/logos/`. Reload the page to see them. Without a file the coloured badge is used.

## Home
Click the BID&BAT logo to go to the home screen. Your team stays in the room, and a "Rejoin room" button brings you back.

## Invite link
In the waiting room the host sees an invite link (`http://<address>/?room=CODE`) with a **Copy invite link** button. Opening it shows the join form with the room code filled in. When playing over ngrok, open the ngrok address yourself first, so the copied link uses that address.

## Going back
- **⌂ Home** (top bar) or the BID&BAT logo: leave to the home screen, then use "Rejoin room" to return.
- **← Back to waiting room** (host, during player selection): returns everyone to the waiting room. Picks are cleared, teams and settings stay. Once the auction has started it cannot be rewound; use Pause, End auction or Remove team instead.

## Bidding rules added
- **Early sale:** when every other team has passed (or cannot bid any more), the top bidder wins at once without waiting for the timer. If nobody bids and everyone passes, the player goes unsold.
- **Custom bid:** type an amount in Cr (for example 15) in the Custom bid box and press "Bid this amount". It must be higher than the current bid by at least the smallest bid step, and within your purse. A jump of more than 5 Cr triggers a full-screen "NEW BID" alert with money rain, and all bid buttons are locked for 3 seconds so nobody taps +1 Cr by accident. Constants: `BIG_JUMP` and `BIG_LOCK` in `src/engine.js`.

## Playing XI order
The XI is a batting order: slots 1 and 2 open. Drag a player onto another to swap, use the ▲ ▼ buttons to move, and drag a bench player onto an XI slot to replace the player there. Buying players or trading never resets your lineup; new players join the bench and traded-away players leave the XI. Your unsaved lineup is also remembered if you reload.

## Auction order
Host can pick **Mix** to jumble every selected player into one random order (a surprise), or keep pool by pool.

## Look & feel additions
- **Jersey cards**: each player is a shirt in his team's colours with the surname on the back.
- **Team bid bar**: above the lot, every team's purse and squad count; the leading bidder is highlighted, teams that can't bid (squad full, overseas limit, low purse, passed) are greyed with the reason.
- **Squad board**: the final screen shows each team's XI on a pitch in batting order, with impact player and bench.
