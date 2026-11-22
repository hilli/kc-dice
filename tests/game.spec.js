const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const gameUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

async function openGame(page, rolls) {
  await page.addInitScript((faces) => {
    let index = 0;
    Math.random = () => {
      if (index >= faces.length) throw new Error('Unexpected dice roll');
      return (faces[index++] - 0.5) / 6;
    };
  }, rolls.flat());
  await page.goto(gameUrl);
}

async function startGame(page, rolls, { names = [], target } = {}) {
  await openGame(page, rolls);
  for (const [index, name] of names.entries()) {
    await page.getByPlaceholder(`Player ${index + 1}`).fill(name);
  }
  if (target) {
    await page.locator('#target').getByRole('button', { name: String(target), exact: true }).click();
  }
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#passTitle')).toHaveText(`${names[0] || 'Player 1'}'s turn`);
  await page.getByRole('button', { name: 'Ready', exact: true }).click();
}

async function roll(page, expectedFaces) {
  await page.locator('#roll').click();
  const dice = page.locator('#dice .die');
  await expect(dice).toHaveCount(6);
  for (const [index, face] of expectedFaces.entries()) {
    await expect(dice.nth(index).locator('i.on')).toHaveCount(face);
  }
}

async function selectDice(page, indices) {
  for (const index of indices) {
    await page.locator('#dice .die').nth(index).click();
  }
}

test('scores the supported five- and six-die straights', async ({ page }) => {
  await startGame(page, [[1, 2, 3, 4, 5, 6]]);
  await roll(page, [1, 2, 3, 4, 5, 6]);
  await selectDice(page, [0, 1, 2, 3, 4]);
  await expect(page.locator('#turnScore')).toHaveText('500');
  await expect(page.locator('#bank')).toHaveText('Bank 500');
  await expect(page.locator('#bank')).toBeEnabled();

  await selectDice(page, [5]);
  await expect(page.locator('#turnScore')).toHaveText('1500');
  await expect(page.locator('#roll')).toContainText('Roll all 6');

  await selectDice(page, [0]);
  await expect(page.locator('#turnScore')).toHaveText('750');
  await expect(page.locator('#bank')).toHaveText('Bank 750');
});

test('does not score 1-2-3 or 1-2-3-4 as straights', async ({ page }) => {
  await startGame(page, [[1, 2, 3, 4, 5, 6]]);
  await roll(page, [1, 2, 3, 4, 5, 6]);
  await selectDice(page, [0, 1, 2]);
  await expect(page.locator('#status')).toHaveText('Every selected die must score.');
  await expect(page.locator('#roll')).toBeDisabled();
  await expect(page.locator('#bank')).toBeDisabled();

  await selectDice(page, [3]);
  await expect(page.locator('#status')).toHaveText('Every selected die must score.');
  await expect(page.locator('#turnScore')).toHaveText('0');
  await expect(page.locator('#roll')).toBeDisabled();

  await selectDice(page, [3, 2, 1]);
  await expect(page.locator('#turnScore')).toHaveText('100');
  await expect(page.locator('#roll')).toBeEnabled();
  await expect(page.locator('#bank')).toBeDisabled();
  await selectDice(page, [4]);
  await expect(page.locator('#turnScore')).toHaveText('150');
});

test('adds an extra scoring die to a straight', async ({ page }) => {
  await startGame(page, [[1, 2, 3, 4, 5, 5]]);
  await roll(page, [1, 2, 3, 4, 5, 5]);
  await selectDice(page, [0, 1, 2, 3, 4, 5]);
  await expect(page.locator('#turnScore')).toHaveText('550');
  await expect(page.locator('#bank')).toHaveText('Bank 550');
  await expect(page.locator('#bank')).toBeEnabled();
});

const kindScores = [
  [1, [100, 200, 1000, 2000, 4000, 8000]],
  [2, [null, null, 200, 400, 800, 1600]],
  [3, [null, null, 300, 600, 1200, 2400]],
  [4, [null, null, 400, 800, 1600, 3200]],
  [5, [50, 100, 500, 1000, 2000, 4000]],
  [6, [null, null, 600, 1200, 2400, 4800]],
];

for (const [face, scores] of kindScores) {
  test(`scores sets of ${face}s`, async ({ page }) => {
    const faces = Array(6).fill(face);
    await startGame(page, [faces]);
    await roll(page, faces);
    for (const [index, score] of scores.entries()) {
      await selectDice(page, [index]);
      if (score === null) {
        await expect(page.locator('#status')).toHaveText('Every selected die must score.');
        await expect(page.locator('#roll')).toBeDisabled();
      } else {
        await expect(page.locator('#turnScore')).toHaveText(String(score));
        await expect(page.locator('#roll')).toBeEnabled();
      }
    }
  });
}

test('scores each throw independently and keeps selected dice held', async ({ page }) => {
  await startGame(page, [[1, 1, 2, 3, 4, 6], [1, 2, 3, 4]]);
  await roll(page, [1, 1, 2, 3, 4, 6]);
  await selectDice(page, [0, 1]);
  await expect(page.locator('#turnScore')).toHaveText('200');
  await roll(page, [1, 1, 1, 2, 3, 4]);
  await expect(page.locator('#dice .die.held')).toHaveCount(2);
  await selectDice(page, [0]);
  await expect(page.locator('#dice .die.held')).toHaveCount(2);
  await selectDice(page, [2]);
  await expect(page.locator('#turnScore')).toHaveText('300');
  await expect(page.locator('#bank')).toBeEnabled();
  await page.locator('#bank').click();
  await expect(page.locator('#scores .pl b').nth(0)).toHaveText('300');
});

test('automatically passes the turn when the first roll has no scoring dice', async ({ page }) => {
  await startGame(page, [[2, 2, 3, 3, 4, 6]]);
  await roll(page, [2, 2, 3, 3, 4, 6]);
  await expect(page.locator('#status')).toContainText('Bust!');
  await expect(page.locator('#roll')).toBeDisabled();
  await expect(page.locator('#bank')).toBeDisabled();
  await expect(page.locator('#scores .pl b').nth(0)).toHaveText('0');
  await expect(page.locator('#passTitle')).toHaveText("Player 2's turn");
  await page.getByRole('button', { name: 'Ready', exact: true }).click();
  await expect(page.locator('#who')).toHaveText('Player 2');
  await expect(page.locator('#roll')).toBeEnabled();
});

test('enforces the entry minimum and loses unbanked points on a bust', async ({ page }) => {
  await startGame(page, [
    [1, 3, 3, 3, 2, 4],
    [1, 2, 3, 4, 6, 6],
    [2, 2, 3, 3, 4],
    [5, 2, 2, 3, 4, 6],
  ]);
  await roll(page, [1, 3, 3, 3, 2, 4]);
  await selectDice(page, [0]);
  await expect(page.locator('#turnScore')).toHaveText('100');
  await expect(page.locator('#bank')).toBeDisabled();
  await selectDice(page, [0, 1, 2, 3]);
  await expect(page.locator('#turnScore')).toHaveText('300');
  await expect(page.locator('#bank')).toBeEnabled();
  await page.locator('#bank').click();
  await expect(page.locator('#scores .pl b').nth(0)).toHaveText('300');

  await expect(page.locator('#passTitle')).toHaveText("Player 2's turn");
  await page.getByRole('button', { name: 'Ready', exact: true }).click();
  await roll(page, [1, 2, 3, 4, 6, 6]);
  await selectDice(page, [0]);
  await expect(page.locator('#turnScore')).toHaveText('100');
  await roll(page, [1, 2, 2, 3, 3, 4]);
  await expect(page.locator('#status')).toContainText('Bust!');
  await expect(page.locator('#roll')).toBeDisabled();
  await expect(page.locator('#bank')).toBeDisabled();
  await expect(page.locator('#scores .pl b').nth(1)).toHaveText('0');

  await expect(page.locator('#passTitle')).toHaveText("Player 1's turn");
  await expect(page.locator('#turnScore')).toHaveText('0');
  await page.getByRole('button', { name: 'Ready', exact: true }).click();
  await roll(page, [5, 2, 2, 3, 4, 6]);
  await selectDice(page, [0]);
  await expect(page.locator('#bank')).toHaveText('Bank 50');
  await expect(page.locator('#bank')).toBeEnabled();
  await page.locator('#bank').click();
  await expect(page.locator('#scores .pl b').nth(0)).toHaveText('350');
});

test('rolls all six dice again after scoring all of them', async ({ page }) => {
  await startGame(page, [[1, 2, 3, 4, 5, 6], [1, 1, 1, 2, 3, 4]]);
  await roll(page, [1, 2, 3, 4, 5, 6]);
  await selectDice(page, [0, 1, 2, 3, 4, 5]);
  await expect(page.locator('#roll')).toContainText('Roll all 6');
  await roll(page, [1, 1, 1, 2, 3, 4]);
  await expect(page.locator('#status')).toContainText('Hot dice');
  await expect(page.locator('#dice .die.held')).toHaveCount(0);
  await expect(page.locator('#turnScore')).toHaveText('1500');
  await selectDice(page, [0, 1, 2]);
  await expect(page.locator('#turnScore')).toHaveText('2500');
  await page.locator('#bank').click();
  await expect(page.locator('#scores .pl b').nth(0)).toHaveText('2500');
});

test('the house-rule final round lets another player win with a higher score', async ({ page }) => {
  await startGame(page, [[1, 1, 1, 2, 3, 4], [6, 6, 6, 6, 2, 3]], {
    names: ['Ada', 'Bo'],
    target: 1000,
  });
  await roll(page, [1, 1, 1, 2, 3, 4]);
  await selectDice(page, [0, 1, 2]);
  await page.locator('#bank').click();
  await expect(page.locator('#scores .pl b').nth(0)).toHaveText('1000');

  await expect(page.locator('#passTitle')).toHaveText("Bo's turn");
  await page.getByRole('button', { name: 'Ready', exact: true }).click();
  await roll(page, [6, 6, 6, 6, 2, 3]);
  await selectDice(page, [0, 1, 2, 3]);
  await expect(page.locator('#turnScore')).toHaveText('1200');
  await page.locator('#bank').click();
  await expect(page.locator('#passTitle')).toContainText('Bo wins!');
  await expect(page.locator('#passText')).toContainText('Ada: 1000');
  await expect(page.locator('#passText')).toContainText('Bo: 1200');
});

test('switches the setup and rules between languages without losing entered names', async ({ page }) => {
  await openGame(page, []);
  await page.getByPlaceholder('Player 1').fill('Łukasz');
  await page.locator('#language').selectOption('pl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page).toHaveTitle('Kości Farkle – średniowieczna gra w kości');
  await expect(page.locator('#language')).toHaveAccessibleName('Język');
  await expect(page.locator('#start')).toHaveText('Rozpocznij grę');
  await expect(page.getByPlaceholder('Gracz 2')).toBeVisible();
  await expect(page.locator('#names input').first()).toHaveValue('Łukasz');
  await page.locator('summary').click();
  await expect(page.locator('.rules')).toContainText('Sekwencja 1–5');
  await expect(page.locator('.rules')).toContainText('co najmniej 300 punktów');

  await page.locator('#language').selectOption('da');
  await expect(page.locator('html')).toHaveAttribute('lang', 'da');
  await expect(page).toHaveTitle('Farkleterninger – middelalderligt terningspil');
  await expect(page.locator('#language')).toHaveAccessibleName('Sprog');
  await expect(page.locator('#start')).toHaveText('Start spil');
  await expect(page.getByPlaceholder('Spiller 2')).toBeVisible();
  await expect(page.locator('details.rules')).toHaveAttribute('open', '');
  await expect(page.locator('.rules')).toContainText('Række 1–5');
  await expect(page.locator('.rules')).toContainText('mindst 300 point');
  await expect(page.locator('#names input').first()).toHaveValue('Łukasz');

  await page.locator('#language').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#start')).toHaveText('Start game');
  await expect(page.getByPlaceholder('Player 2')).toBeVisible();
  await expect(page.locator('#names input').first()).toHaveValue('Łukasz');
});

test('translates the pass screen and an active turn without changing game state', async ({ page }) => {
  await openGame(page, [[1, 2, 3, 4, 5, 6], [1, 1, 1, 2, 3, 4]]);
  await page.locator('#names input').nth(1).fill('Åse & Bo');
  await page.locator('#language').selectOption('pl');
  await page.locator('#start').click();
  await expect(page.locator('#passTitle')).toHaveText('Tura: Gracz 1');
  await expect(page.locator('#passBtn')).toHaveText('Gotowe');

  await page.locator('#language').click();
  await page.locator('#language').selectOption('da');
  await expect(page.locator('#passTitle')).toHaveText('Tur: Spiller 1');
  await expect(page.locator('#passBtn')).toHaveText('Klar');
  await expect(page.locator('#scores .pl').nth(1)).toContainText('Åse & Bo');
  await page.locator('#passBtn').click();
  await expect(page.locator('#status')).toHaveText('Kast terningerne!');
  await roll(page, [1, 2, 3, 4, 5, 6]);
  await selectDice(page, [0]);
  await expect(page.locator('#status')).toHaveText('Valg: 100');

  await page.locator('#language').selectOption('pl');
  await expect(page.locator('#who')).toHaveText('Gracz 1');
  await expect(page.locator('#status')).toHaveText('Wybrane: 100');
  await expect(page.locator('#bank')).toHaveText('Zapisz 100');
  await expect(page.locator('#dice .die.sel')).toHaveCount(1);
  await expect(page.locator('#turnScore')).toHaveText('100');
  await selectDice(page, [1, 2, 3, 4, 5]);
  await expect(page.locator('#roll')).toHaveText('Rzuć wszystkimi 6 🔥');

  await page.locator('#language').selectOption('da');
  await expect(page.locator('#roll')).toHaveText('Kast alle 6 🔥');
  await expect(page.locator('#bank')).toHaveText('Gem 1500');
  await roll(page, [1, 1, 1, 2, 3, 4]);
  await expect(page.locator('#status')).toHaveText('🔥 Varme terninger! Kast alle seks igen.');
  await expect(page.locator('#turnScore')).toHaveText('1500');
});

const localizedTurns = [
  {
    language: 'pl', confirm: 'Porzucić tę grę?', invalid: 'Każda wybrana kość musi dawać punkty.',
    selection: 'Wybrane: 100', bust: '💥 Spalona tura! Punkty z tej tury przepadają.', next: 'Tura: Gracz 2',
  },
  {
    language: 'da', confirm: 'Vil du afslutte dette spil?', invalid: 'Alle valgte terninger skal give point.',
    selection: 'Valg: 100', bust: '💥 Nitte! Du mister turens point.', next: 'Tur: Spiller 2',
  },
];

for (const locale of localizedTurns) {
  test(`localizes the confirmation, invalid selection, and bust in ${locale.language}`, async ({ page }) => {
    await openGame(page, [[1, 2, 3, 4, 6, 6], [2, 2, 3, 3, 4]]);
    await page.locator('#language').selectOption(locale.language);
    await page.locator('#start').click();
    await page.locator('#passBtn').click();
    let message;
    page.once('dialog', async dialog => { message = dialog.message(); await dialog.dismiss(); });
    await page.locator('#quit').click();
    expect(message).toBe(locale.confirm);
    await expect(page.locator('#game')).toBeVisible();

    await roll(page, [1, 2, 3, 4, 6, 6]);
    await selectDice(page, [0, 1]);
    await expect(page.locator('#status')).toHaveText(locale.invalid);
    await selectDice(page, [1]);
    await expect(page.locator('#status')).toHaveText(locale.selection);
    await roll(page, [1, 2, 2, 3, 3, 4]);
    await expect(page.locator('#status')).toHaveText(locale.bust);
    await expect(page.locator('#scores .pl b').nth(0)).toHaveText('0');
    await expect(page.locator('#passTitle')).toHaveText(locale.next);
  });
}

test('preserves the automatic pass when the language changes during a bust', async ({ page }) => {
  await startGame(page, [[2, 2, 3, 3, 4, 6]]);
  await roll(page, [2, 2, 3, 3, 4, 6]);
  await expect(page.locator('#status')).toContainText('Bust!');
  await page.locator('#language').selectOption('pl');
  await expect(page.locator('#status')).toContainText('Spalona tura!');
  await expect(page.locator('#roll')).toBeDisabled();
  await expect(page.locator('#bank')).toBeDisabled();
  await expect(page.locator('#passTitle')).toHaveText('Tura: Gracz 2');
});

test('translates banked points and final results when the language changes', async ({ page }) => {
  await startGame(page, [[1, 1, 1, 2, 3, 4], [2, 2, 3, 3, 4, 6]], { target: 1000 });
  await roll(page, [1, 1, 1, 2, 3, 4]);
  await selectDice(page, [0, 1, 2]);
  await page.locator('#bank').click();
  await expect(page.locator('#status')).toHaveText('Banked 1000!');
  await page.locator('#language').selectOption('pl');
  await expect(page.locator('#status')).toHaveText('Zapisano 1000 pkt!');
  await expect(page.locator('#passTitle')).toHaveText('Tura: Gracz 2');
  await page.locator('#passBtn').click();
  await roll(page, [2, 2, 3, 3, 4, 6]);
  await expect(page.locator('#status')).toContainText('Spalona tura!');
  await expect(page.locator('#passTitle')).toHaveText('🏆 Zwycięzca: Gracz 1!');
  await expect(page.locator('#passText')).toContainText('Gracz 1: 1000');
  await expect(page.locator('#passBtn')).toHaveText('Zagraj ponownie');

  await page.locator('#language').click();
  await page.locator('#language').selectOption('da');
  await expect(page.locator('#passTitle')).toHaveText('🏆 Vinder: Spiller 1!');
  await expect(page.locator('#passText')).toContainText('Spiller 1: 1000');
  await expect(page.locator('#passBtn')).toHaveText('Spil igen');
  await page.locator('#passBtn').click();
  await expect(page.locator('#start')).toHaveText('Start spil');
  await expect(page.getByPlaceholder('Spiller 1')).toBeVisible();
});

test('translates tied winners and default player names', async ({ page }) => {
  await startGame(page, [[1, 1, 1, 2, 3, 4], [1, 1, 1, 2, 3, 4]], { target: 1000 });
  await roll(page, [1, 1, 1, 2, 3, 4]);
  await selectDice(page, [0, 1, 2]);
  await page.locator('#bank').click();
  await expect(page.locator('#passTitle')).toHaveText("Player 2's turn");
  await page.locator('#passBtn').click();
  await roll(page, [1, 1, 1, 2, 3, 4]);
  await selectDice(page, [0, 1, 2]);
  await page.locator('#bank').click();
  await expect(page.locator('#passTitle')).toHaveText('🏆 Player 1 & Player 2 win!');

  await page.locator('#language').selectOption('pl');
  await expect(page.locator('#passTitle')).toHaveText('🏆 Zwycięzcy: Gracz 1 i Gracz 2!');
  await page.locator('#language').selectOption('da');
  await expect(page.locator('#passTitle')).toHaveText('🏆 Vindere: Spiller 1 og Spiller 2!');
  await expect(page.locator('#passText')).toContainText('Spiller 2: 1000');
});

test('keeps the language selector reachable on a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openGame(page, []);
  await page.locator('#language').selectOption('da');
  await page.locator('summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.locator('#start').click();
  await page.locator('#language').click();
  await page.locator('#language').selectOption('pl');
  await expect(page.locator('#passTitle')).toHaveText('Tura: Gracz 1');
});
