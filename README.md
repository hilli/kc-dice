# Farkle Dice

Open `index.html` in a browser to play.

Choose English, Polski, or Dansk from the language selector. You can change
languages during a game without losing your turn or scores.

The scoring combinations follow Kingdom Come's ordinary dice rules. The
50-point entry minimum, automatic banking on a non-scoring reroll, and final
round are house rules. A non-scoring roll ends the turn but preserves any points
earned during it; a non-scoring first roll simply passes the turn with no points.

## Tests

With Node.js 20 or newer and npm installed:

```sh
npm ci
npx playwright install chromium
npm test
```

The Playwright tests open `index.html` directly; no server is needed.
