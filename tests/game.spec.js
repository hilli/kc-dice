const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const gameUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

async function startGame(page, rolls, { names = [], target } = {}) {
  await page.addInitScript((faces) => {
    let index = 0;
    Math.random = () => {
      if (index >= faces.length) throw new Error('Unexpected dice roll');
      return (faces[index++] - 0.5) / 6;
    };
  }, rolls.flat());
  await page.goto(gameUrl);
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
