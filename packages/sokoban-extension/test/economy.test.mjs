import test from 'node:test';
import assert from 'node:assert/strict';

import {
  awardDuel,
  awardSokoban,
  awardSolitaire,
  buyItem,
  checkAchievements,
  claimDaily,
  createProfile,
  credit,
  dailyStatus,
  debit,
  grantIap,
  migrate,
  ownsItem,
  spendTicket,
  summarize,
  syncTickets,
  useItem,
} from '../src/store/economy.js';
import { STORE_ITEM_BY_ID, TICKETS } from '../src/store/catalog.js';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

function profileWith(overrides = {}) {
  return Object.assign(createProfile(T0), overrides);
}

/* ------------------------------------------------------------------ ledger */

test('credit and debit keep the balance and the ledger in step', () => {
  const profile = profileWith({ coins: 0 });
  credit(profile, 'coins', 120, 'Test payout', { now: T0 });
  assert.equal(profile.coins, 120);
  assert.equal(profile.ledger[0].delta, 120);
  assert.equal(profile.ledger[0].balance, 120);

  assert.equal(debit(profile, 'coins', 50, 'Test spend', { now: T0 }), true);
  assert.equal(profile.coins, 70);
  assert.equal(profile.ledger[0].delta, -50);
  assert.equal(profile.ledger[0].balance, 70);
});

test('a debit larger than the balance is refused outright', () => {
  const profile = profileWith({ coins: 10 });
  assert.equal(debit(profile, 'coins', 11, 'Too much'), false);
  assert.equal(profile.coins, 10);
  assert.equal(profile.ledger.length, 0, 'a refused debit leaves no ledger entry');
});

test('the ledger is capped so storage cannot grow without bound', () => {
  const profile = profileWith({ coins: 0 });
  for (let i = 0; i < 400; i++) credit(profile, 'coins', 1, `entry ${i}`, { now: T0 });
  assert.equal(profile.ledger.length, 250);
  assert.equal(profile.ledger[0].label, 'entry 399', 'newest first');
});

/* ------------------------------------------------------------------- store */

test('buying an item debits the price and applies the grant', () => {
  const profile = profileWith({ coins: 500 });
  const result = buyItem(profile, 'undo_5', T0);
  assert.equal(result.ok, true);
  assert.equal(profile.coins, 500 - 120);
  assert.equal(profile.items.undo, 3 + 5);
});

test('buying without the funds changes nothing', () => {
  const profile = profileWith({ coins: 10, gems: 0 });
  const result = buyItem(profile, 'coin_doubler', T0);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'insufficient_funds');
  assert.equal(profile.gems, 0);
  assert.deepEqual(profile.upgrades, []);
});

test('a permanent upgrade cannot be bought twice', () => {
  const profile = profileWith({ gems: 500 });
  assert.equal(buyItem(profile, 'coin_doubler', T0).ok, true);
  assert.ok(ownsItem(profile, STORE_ITEM_BY_ID.get('coin_doubler')));
  const second = buyItem(profile, 'coin_doubler', T0);
  assert.equal(second.error, 'already_owned');
  assert.equal(profile.gems, 500 - 60, 'the second attempt does not charge again');
});

test('consumables stack rather than being blocked as owned', () => {
  const profile = profileWith({ coins: 1000 });
  buyItem(profile, 'hint_3', T0);
  buyItem(profile, 'hint_3', T0);
  assert.equal(profile.items.hint, 1 + 6);
});

test('useItem refuses to go below zero', () => {
  const profile = profileWith();
  profile.items.skip = 1;
  assert.equal(useItem(profile, 'skip', T0), true);
  assert.equal(useItem(profile, 'skip', T0), false);
  assert.equal(profile.items.skip, 0);
});

/* --------------------------------------------------------------- purchases */

test('a verified purchase grants gems exactly once per receipt', () => {
  const profile = profileWith({ gems: 0 });
  const first = grantIap(profile, 'gems_550', 'gems_550:order-1', T0);
  assert.equal(first.ok, true);
  assert.equal(profile.gems, 550);

  const replayed = grantIap(profile, 'gems_550', 'gems_550:order-1', T0);
  assert.equal(replayed.error, 'duplicate_receipt');
  assert.equal(profile.gems, 550, 'a replayed receipt mints nothing');
});

test('a bundle applies its extra grants alongside the gems', () => {
  const profile = profileWith({ gems: 0, coins: 0 });
  const result = grantIap(profile, 'collectors_pack', 'collectors_pack:order-9', T0);
  assert.equal(result.ok, true);
  assert.equal(profile.gems, 400);
  assert.equal(profile.coins, 1000);
  assert.ok(profile.upgrades.includes('coinDoubler'));
  assert.ok(profile.themes.includes('mono'));
  assert.ok(profile.cardBacks.includes('gold'));
});

test('a one-time bundle cannot be bought twice even with a new receipt', () => {
  const profile = profileWith();
  grantIap(profile, 'starter_bundle', 'starter_bundle:order-1', T0);
  const again = grantIap(profile, 'starter_bundle', 'starter_bundle:order-2', T0);
  assert.equal(again.error, 'already_purchased');
});

test('purchases without a receipt id are refused', () => {
  const profile = profileWith();
  assert.equal(grantIap(profile, 'gems_100', '', T0).error, 'missing_receipt');
  assert.equal(grantIap(profile, 'not_a_sku', 'x:1', T0).error, 'unknown_sku');
});

/* ----------------------------------------------------------------- payouts */

test('a first clear pays more than a replay, and stars scale the bonus', () => {
  const profile = profileWith({ coins: 0 });
  const perfect = awardSokoban(profile, { levelId: 'warmup', moves: 10, par: 10 }, T0);
  assert.equal(perfect.stars, 3);
  assert.equal(perfect.first, true);
  assert.equal(perfect.coins, 40 + 60);
  assert.equal(perfect.gems, 1, 'a move-optimal first clear also pays a gem');

  const replayed = awardSokoban(profile, { levelId: 'warmup', moves: 10, par: 10 }, T0);
  assert.equal(replayed.first, false);
  assert.equal(replayed.coins, 8 + 15);
  assert.equal(replayed.gems, 0);
});

test('the best score is kept when a level is replayed worse', () => {
  const profile = profileWith();
  awardSokoban(profile, { levelId: 'pair', moves: 9, par: 9 }, T0);
  awardSokoban(profile, { levelId: 'pair', moves: 40, par: 9 }, T0);
  assert.equal(profile.sokoban.levels.pair.bestMoves, 9);
  assert.equal(profile.sokoban.levels.pair.stars, 3, 'stars never regress');
  assert.equal(profile.sokoban.levels.pair.clears, 2);
});

test('the coin doubler doubles gameplay payouts but not the price paid', () => {
  const plain = profileWith({ coins: 0 });
  const doubled = profileWith({ coins: 0, upgrades: ['coinDoubler'] });
  const a = awardSokoban(plain, { levelId: 'warmup', moves: 10, par: 10 }, T0);
  const b = awardSokoban(doubled, { levelId: 'warmup', moves: 10, par: 10 }, T0);
  assert.equal(b.coins, a.coins * 2);
  assert.equal(b.gems, a.gems, 'gem rewards are not doubled');
});

test('solitaire pays a no-undo bonus and partial credit for progress', () => {
  const clean = profileWith({ coins: 0 });
  assert.equal(awardSolitaire(clean, { won: true, foundation: 52, usedUndo: false }, T0).coins, 85);

  const messy = profileWith({ coins: 0 });
  assert.equal(awardSolitaire(messy, { won: true, foundation: 52, usedUndo: true }, T0).coins, 60);

  const abandoned = profileWith({ coins: 0 });
  assert.equal(awardSolitaire(abandoned, { won: false, foundation: 9, usedUndo: true }, T0).coins, 18);
  assert.equal(abandoned.solitaire.streak, 0);
});

test('duel payouts scale with the streak and cap out', () => {
  const profile = profileWith({ coins: 0 });
  const first = awardDuel(profile, { result: 'win', roundsWon: 5 }, T0);
  assert.equal(first.coins, 45 + 4 * 5 + 15 * 1);
  assert.equal(first.gems, 1, 'a 5-0 sweep pays a gem');

  for (let i = 0; i < 8; i++) awardDuel(profile, { result: 'win', roundsWon: 5 }, T0);
  assert.equal(profile.duel.streak, 9);
  const capped = awardDuel(profile, { result: 'win', roundsWon: 0 }, T0);
  assert.equal(capped.coins, 45 + 15 * 5, 'the streak multiplier stops at 5');

  const loss = awardDuel(profile, { result: 'loss', roundsWon: 2 }, T0);
  assert.equal(loss.coins, 8);
  assert.equal(profile.duel.streak, 0, 'a loss resets the streak');
});

/* ------------------------------------------------------------ daily bonus */

test('the daily bonus can only be claimed once per day', () => {
  const profile = profileWith({ coins: 0 });
  assert.equal(dailyStatus(profile, T0).available, true);

  const claimed = claimDaily(profile, T0);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.coins, 50);
  assert.equal(claimDaily(profile, T0 + 1000).error, 'already_claimed');
});

test('consecutive days build the streak; a gap resets it', () => {
  const profile = profileWith({ coins: 0 });
  claimDaily(profile, T0);
  claimDaily(profile, T0 + DAY);
  const third = claimDaily(profile, T0 + 2 * DAY);
  assert.equal(third.streak, 3);
  assert.equal(third.coins, 100);
  assert.equal(third.gems, 1, 'day three pays a gem');

  const afterGap = claimDaily(profile, T0 + 5 * DAY);
  assert.equal(afterGap.streak, 1, 'missing a day sends the streak back to one');
  assert.equal(afterGap.coins, 50);
});

test('a long streak stops escalating at the end of the table', () => {
  const profile = profileWith({ coins: 0 });
  for (let day = 0; day < 10; day++) claimDaily(profile, T0 + day * DAY);
  assert.equal(profile.daily.streak, 10);
  const status = dailyStatus(profile, T0 + 10 * DAY);
  assert.equal(status.coins, 500, 'capped at the last table entry');
});

/* ---------------------------------------------------------------- tickets */

test('tickets regenerate on the clock and stop at the maximum', () => {
  const profile = profileWith();
  profile.tickets = 0;
  profile.ticketsUpdatedAt = T0;

  syncTickets(profile, T0 + TICKETS.regenMs - 1);
  assert.equal(profile.tickets, 0);

  syncTickets(profile, T0 + TICKETS.regenMs);
  assert.equal(profile.tickets, 1);

  syncTickets(profile, T0 + 100 * TICKETS.regenMs);
  assert.equal(profile.tickets, TICKETS.max, 'the meter never overfills');
});

test('rapid tickets halves the regeneration time', () => {
  const profile = profileWith({ upgrades: ['fastTickets'] });
  profile.tickets = 0;
  profile.ticketsUpdatedAt = T0;
  syncTickets(profile, T0 + TICKETS.regenMs / 2);
  assert.equal(profile.tickets, 1);
});

test('spending a ticket at full starts the regeneration clock', () => {
  const profile = profileWith();
  profile.tickets = TICKETS.max;
  profile.ticketsUpdatedAt = T0 - 10 * TICKETS.regenMs;

  assert.equal(spendTicket(profile, T0), true);
  assert.equal(profile.tickets, TICKETS.max - 1);
  assert.equal(profile.ticketsUpdatedAt, T0, 'the clock restarts from the spend');

  profile.tickets = 0;
  assert.equal(spendTicket(profile, T0), false, 'cannot spend what you do not have');
});

/* ----------------------------------------------------- achievements & misc */

test('achievements pay out once and only when earned', () => {
  const profile = profileWith({ gems: 0 });
  assert.equal(checkAchievements(profile, { levelCount: 24 }, T0).length, 0);

  awardSokoban(profile, { levelId: 'warmup', moves: 1, par: 1 }, T0);
  const awarded = checkAchievements(profile, { levelCount: 24 }, T0);
  assert.deepEqual(awarded.map((a) => a.id), ['first_clear']);
  assert.equal(profile.gems, 1 + 1, 'the optimal clear gem plus the achievement gem');

  assert.equal(checkAchievements(profile, { levelCount: 24 }, T0).length, 0, 'no double payout');
});

test('migrate fills in new fields without losing saved progress', () => {
  const old = {
    version: 0,
    coins: 999,
    sokoban: { levels: { warmup: { solved: true, stars: 2 } } },
  };
  const migrated = migrate(old);
  assert.equal(migrated.coins, 999);
  assert.equal(migrated.sokoban.levels.warmup.stars, 2);
  assert.equal(migrated.sokoban.unlocked, 1, 'missing sub-fields get defaults');
  assert.ok(Array.isArray(migrated.ledger));
  assert.equal(migrated.items.undo, 3);
  assert.equal(migrated.version, 1);
});

test('summarize reports what the popup needs', () => {
  const profile = profileWith({ coins: 12, gems: 3 });
  awardSokoban(profile, { levelId: 'warmup', moves: 1, par: 1 }, T0);
  const summary = summarize(profile, T0);
  assert.equal(summary.solved, 1);
  assert.equal(summary.stars, 3);
  assert.equal(summary.tickets, TICKETS.max);
  assert.equal(summary.daily.available, true);
});
