# Farkle Dice

Open `index.html` in a browser to play.

Choose English, Polski, or Dansk from the language selector. You can change
languages during a game without losing your turn or scores.

The scoring combinations follow Kingdom Come's ordinary dice rules. The
300-point entry minimum and final round are house rules.

## Tests

With Node.js 20 or newer and npm installed:

```sh
npm ci
npx playwright install chromium
npm test
```

The Playwright tests open `index.html` directly; no server is needed.
