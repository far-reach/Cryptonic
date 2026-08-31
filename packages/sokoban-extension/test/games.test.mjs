import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CELL_COUNT,
  COLUMN_COUNT,
  apply as fcApply,
  autoplayMoves,
  foundationCount as fcFoundation,
  freeCells,
  isWon as fcWon,
  legalMove as fcLegal,
  maxMove,
  newGame as fcNew,
  replay as fcReplay,
  runLength,
} from '../src/games/freecell/engine.js';
import {
  BOARDS,
  flip,
  isPerfect,
  isWon as pairsWon,
  newGame as pairsNew,
  replay as pairsReplay,
  settle,
} from '../src/games/pairs/engine.js';
import {
  DIFFICULTIES,
  adjacentMines,
  apply as sweepApply,
  neighbours,
  newGame as sweepNew,
  progress,
  replay as sweepReplay,
} from '../src/games/sweeper/engine.js';
import {
  awardFreecell,
  awardPairs,
  awardSweeper,
  checkAchievements,
  createProfile,
} from '../src/store/economy.js';

const T0 = 1_700_000_000_000;

/* ---------------------------------------------------------------- freecell */

test('a FreeCell deal puts all 52 cards on the table, face up', () => {
  const game = fcNew(2468);
  assert.equal(game.columns.length, COLUMN_COUNT);
  assert.equal(game.cells.length, CELL_COUNT);
  const cards = game.columns.flat();
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map((c) => c.id)).size, 52);
  assert.deepEqual(game.columns.map((c) => c.length), [7, 7, 7, 7, 6, 6, 6, 6]);
  assert.equal(fcFoundation(game), 0);
});

test('the supermove limit follows free cells and empty columns', () => {
  const game = fcNew(1);
  assert.equal(maxMove(game), 5, '4 free cells, no empty columns');

  const oneUsed = { ...game, cells: [game.columns[0][0], null, null, null] };
  assert.equal(maxMove(oneUsed), 4);

  const withEmpty = { ...game, columns: [[], ...game.columns.slice(1)] };
  assert.equal(maxMove(withEmpty), 10, 'an empty column doubles the run');
  assert.equal(maxMove(withEmpty, true), 5, 'moving *to* that column does not');
});

test('runLength only counts a descending alternating-colour tail', () => {
  const run = [
    { id: 'S9', rank: 9, suit: 'S' },
    { id: 'H8', rank: 8, suit: 'H' },
    { id: 'C7', rank: 7, suit: 'C' },
  ];
  assert.equal(runLength(run), 3);

  const broken = [...run, { id: 'S6', rank: 6, suit: 'S' }];
  assert.equal(runLength(broken), 1, 'same colour breaks the run');

  const gap = [{ id: 'S9', rank: 9, suit: 'S' }, { id: 'H7', rank: 7, suit: 'H' }];
  assert.equal(runLength(gap), 1, 'a rank gap breaks the run');
});

test('cells hold exactly one card and foundations build up by suit', () => {
  const game = fcNew(31);
  const withCard = fcApply(game, { type: 'column-to-cell', from: 0, cell: 0 });
  assert.ok(withCard.cells[0]);
  assert.equal(withCard.columns[0].length, 6);
  assert.equal(
    fcLegal(withCard, { type: 'column-to-cell', from: 1, cell: 0 }),
    false,
    'an occupied cell is refused',
  );

  const empty = {
    ...game,
    foundations: { S: [], H: [], D: [], C: [] },
    columns: [[{ id: 'S2', rank: 2, suit: 'S' }], ...game.columns.slice(1)],
  };
  assert.equal(fcLegal(empty, { type: 'column-to-foundation', from: 0 }), false, 'a two cannot go first');

  const withAce = { ...empty, columns: [[{ id: 'S1', rank: 1, suit: 'S' }], ...game.columns.slice(1)] };
  assert.equal(fcLegal(withAce, { type: 'column-to-foundation', from: 0 }), true);
});

test('a run longer than the limit is refused', () => {
  const game = fcNew(7);
  const stacked = {
    ...game,
    cells: [{ id: 'S1', rank: 1, suit: 'S' }, { id: 'S2', rank: 2, suit: 'S' }, { id: 'S3', rank: 3, suit: 'S' }, { id: 'S4', rank: 4, suit: 'S' }],
    columns: [
      [{ id: 'S9', rank: 9, suit: 'S' }, { id: 'H8', rank: 8, suit: 'H' }, { id: 'C7', rank: 7, suit: 'C' }],
      [{ id: 'D10', rank: 10, suit: 'D' }],
      [], [], [], [], [], [],
    ],
  };
  // No free cells; only two empty columns are left after removing four.
  assert.equal(maxMove(stacked), 1 * 2 ** 6);
  const tight = { ...stacked, columns: [stacked.columns[0], stacked.columns[1], [{ id: 'C2', rank: 2, suit: 'C' }], [{ id: 'C3', rank: 3, suit: 'C' }], [{ id: 'C4', rank: 4, suit: 'C' }], [{ id: 'C5', rank: 5, suit: 'C' }], [{ id: 'C6', rank: 6, suit: 'C' }], [{ id: 'H2', rank: 2, suit: 'H' }]] };
  assert.equal(maxMove(tight), 1, 'no cells and no empty columns means one card');
  assert.equal(fcLegal(tight, { type: 'column-to-column', from: 0, to: 1, count: 3 }), false);
  assert.equal(fcLegal(tight, { type: 'column-to-column', from: 0, to: 1, count: 1 }), false, '7♣ does not sit on 10♦');
});

test('autoplay only sends home cards that can never be needed', () => {
  const base = fcNew(5);
  const state = {
    ...base,
    foundations: { S: [], H: [], D: [], C: [] },
    cells: [{ id: 'S1', rank: 1, suit: 'S' }, null, null, null],
    columns: [
      [{ id: 'H1', rank: 1, suit: 'H' }],
      [{ id: 'S5', rank: 5, suit: 'S' }],
      [], [], [], [], [], [],
    ],
  };

  const plan = autoplayMoves(state);
  assert.ok(plan.length >= 2, 'both aces go home');

  let cursor = state;
  for (const move of plan) cursor = fcApply(cursor, move);
  assert.equal(cursor.foundations.S.length, 1);
  assert.equal(cursor.foundations.H.length, 1);
  assert.equal(cursor.columns[1].length, 1, 'the five stays put — a red four may still need it');
});

test('FreeCell replay rejects an illegal move list', () => {
  const bad = fcReplay(99, [{ type: 'column-to-column', from: 0, to: 1, count: 40 }]);
  assert.equal(bad.ok, false);

  const good = fcReplay(99, [{ type: 'column-to-cell', from: 0, cell: 0 }]);
  assert.equal(good.ok, true);
  assert.equal(good.won, false);
  assert.equal(freeCells(good.state), 3);
});

test('a hand-built finished FreeCell board reads as won', () => {
  const game = fcNew(3);
  const done = {
    ...game,
    columns: Array.from({ length: 8 }, () => []),
    foundations: {
      S: Array.from({ length: 13 }, (_, i) => ({ id: `S${i + 1}`, rank: i + 1, suit: 'S' })),
      H: Array.from({ length: 13 }, (_, i) => ({ id: `H${i + 1}`, rank: i + 1, suit: 'H' })),
      D: Array.from({ length: 13 }, (_, i) => ({ id: `D${i + 1}`, rank: i + 1, suit: 'D' })),
      C: Array.from({ length: 13 }, (_, i) => ({ id: `C${i + 1}`, rank: i + 1, suit: 'C' })),
    },
  };
  assert.ok(fcWon(done));
  assert.equal(fcFoundation(done), 52);
});

/* ------------------------------------------------------------------- pairs */

test('a Pairs board has two of every card and nothing else', () => {
  const game = pairsNew(4242, 'classic');
  assert.equal(game.tiles.length, BOARDS.classic.pairs * 2);
  const counts = new Map();
  for (const tile of game.tiles) counts.set(tile.key, (counts.get(tile.key) ?? 0) + 1);
  assert.equal(counts.size, BOARDS.classic.pairs);
  for (const count of counts.values()) assert.equal(count, 2);
});

test('the same seed lays out the same board', () => {
  const a = pairsNew(11, 'small');
  const b = pairsNew(11, 'small');
  const c = pairsNew(12, 'small');
  assert.deepEqual(a.tiles.map((t) => t.id), b.tiles.map((t) => t.id));
  assert.notDeepEqual(a.tiles.map((t) => t.id), c.tiles.map((t) => t.id));
});

test('matching keeps cards up, missing records a mistake', () => {
  const game = pairsNew(2, 'small');
  const first = game.tiles.findIndex((t) => t.key === game.tiles[0].key);
  const partner = game.tiles.findIndex((t, i) => i !== first && t.key === game.tiles[first].key);

  let state = flip(game, first);
  state = flip(state, partner);
  assert.equal(state.matched.size, 2);
  assert.equal(state.mistakes, 0);
  assert.equal(state.combo, 1);

  const other = game.tiles.findIndex((t) => t.key !== game.tiles[first].key);
  const otherPartner = game.tiles.findIndex(
    (t, i) => i !== other && t.key === game.tiles[other].key,
  );
  const mismatch = game.tiles.findIndex(
    (t, i) => i !== other && i !== otherPartner && !state.matched.has(i),
  );

  state = flip(state, other);
  state = flip(state, mismatch);
  assert.equal(state.mistakes, 1);
  assert.equal(state.combo, 0, 'a miss breaks the combo');
  assert.equal(state.pending.length, 2, 'both stay up until the next flip');

  const settled = settle(state);
  assert.equal(settled.pending.length, 0);
  assert.equal(settled.matched.size, 2, 'the mismatched pair turned back down');
});

test('the same tile cannot be flipped twice in one turn', () => {
  const game = pairsNew(9, 'small');
  const once = flip(game, 0);
  assert.equal(flip(once, 0), null);
});

test('a full clear replays as a win and reports its mistakes', () => {
  let game = pairsNew(777, 'small');
  const flips = [];

  // Play with perfect knowledge: match each pair in turn.
  const seen = new Map();
  game.tiles.forEach((tile, index) => {
    if (!seen.has(tile.key)) seen.set(tile.key, []);
    seen.get(tile.key).push(index);
  });
  for (const [, [a, b]] of seen) {
    flips.push(a, b);
    game = flip(game, a);
    game = flip(game, b);
  }

  assert.ok(pairsWon(game));
  assert.ok(isPerfect(game));

  const verified = pairsReplay(777, 'small', flips);
  assert.equal(verified.ok, true);
  assert.equal(verified.won, true);
  assert.equal(verified.mistakes, 0);
  assert.equal(verified.bestCombo, BOARDS.small.pairs);

  const tampered = pairsReplay(777, 'small', [...flips, 0]);
  assert.equal(tampered.ok, false, 'flipping an already-matched tile is rejected');
});

/* ----------------------------------------------------------------- sweeper */

test('the first reveal is always safe and opens an area', () => {
  for (const seed of [1, 2, 3, 55, 900]) {
    const game = sweepNew(seed, 'calm');
    const opened = sweepApply(game, { type: 'reveal', index: 40 });
    assert.equal(opened.over, false, `seed ${seed}: first click hit a mine`);
    assert.ok(!opened.mines.has(40));
    for (const neighbour of neighbours(opened, 40)) {
      assert.ok(!opened.mines.has(neighbour), 'the pocket around the first click is clear too');
    }
    assert.equal(opened.mines.size, DIFFICULTIES.calm.mines);
  }
});

test('mine counts and neighbour maths line up', () => {
  const game = sweepNew(123, 'brisk');
  const opened = sweepApply(game, { type: 'reveal', index: 0 });
  assert.equal(opened.mines.size, DIFFICULTIES.brisk.mines);

  // A corner has three neighbours, a middle square eight.
  assert.equal(neighbours(opened, 0).length, 3);
  assert.equal(neighbours(opened, opened.cols + 1).length, 8);

  for (const index of opened.revealed) {
    const count = adjacentMines(opened, index);
    assert.ok(count >= 0 && count <= 8);
  }
});

test('flags block reveals and toggle off again', () => {
  let game = sweepNew(5, 'calm');
  game = sweepApply(game, { type: 'reveal', index: 40 });

  const target = [...Array(game.size).keys()].find((i) => !game.revealed.has(i));
  game = sweepApply(game, { type: 'flag', index: target });
  assert.ok(game.flags.has(target));
  assert.equal(sweepApply(game, { type: 'reveal', index: target }), null, 'a flagged square is protected');

  game = sweepApply(game, { type: 'flag', index: target });
  assert.ok(!game.flags.has(target), 'flagging again clears it');
});

test('hitting a mine ends the game and records where', () => {
  let game = sweepNew(77, 'calm');
  game = sweepApply(game, { type: 'reveal', index: 40 });
  const mine = [...game.mines][0];
  const boom = sweepApply(game, { type: 'reveal', index: mine });
  assert.equal(boom.over, true);
  assert.equal(boom.won, false);
  assert.equal(boom.hitMine, mine);
  assert.equal(sweepApply(boom, { type: 'reveal', index: 0 }), null, 'no moves after the end');
});

test('revealing every safe square wins and auto-flags the mines', () => {
  let game = sweepNew(4321, 'calm');
  const actions = [{ type: 'reveal', index: 40 }];
  game = sweepApply(game, actions[0]);

  for (let index = 0; index < game.size && !game.over; index++) {
    if (game.mines.has(index) || game.revealed.has(index)) continue;
    const action = { type: 'reveal', index };
    actions.push(action);
    game = sweepApply(game, action);
  }

  assert.equal(game.won, true);
  assert.equal(game.flags.size, game.mines.size, 'the remaining mines are flagged for you');
  assert.equal(progress(game), 1);

  const verified = sweepReplay(4321, 'calm', actions);
  assert.equal(verified.ok, true);
  assert.equal(verified.won, true);

  // A different seed must not validate the same action list as a win.
  const wrongSeed = sweepReplay(4322, 'calm', actions);
  assert.ok(!wrongSeed.ok || !wrongSeed.won, 'the win does not transfer to another board');
});

test('chording needs the flag count to match the number', () => {
  let game = sweepNew(88, 'calm');
  game = sweepApply(game, { type: 'reveal', index: 40 });

  const numbered = [...game.revealed].find((i) => adjacentMines(game, i) > 0);
  if (numbered === undefined) return; // seed produced a fully-empty opening

  assert.equal(sweepApply(game, { type: 'chord', index: numbered }), null, 'no flags, no chord');

  const mineNeighbours = neighbours(game, numbered).filter((i) => game.mines.has(i));
  for (const mine of mineNeighbours) game = sweepApply(game, { type: 'flag', index: mine });

  const chorded = sweepApply(game, { type: 'chord', index: numbered });
  assert.ok(chorded, 'with the mines flagged the chord goes through');
  assert.ok(chorded.revealed.size >= game.revealed.size);
});

/* ----------------------------------------------------------------- payouts */

test('FreeCell pays a no-undo bonus and partial credit', () => {
  const clean = createProfile(T0);
  assert.equal(awardFreecell(clean, { won: true, foundation: 52, usedUndo: false }, T0).coins, 130);

  const messy = createProfile(T0);
  assert.equal(awardFreecell(messy, { won: true, foundation: 52, usedUndo: true }, T0).coins, 90);
  assert.equal(messy.freecell.wins, 1);

  const lost = createProfile(T0);
  assert.equal(awardFreecell(lost, { won: false, foundation: 12, usedUndo: true }, T0).coins, 24);
  assert.equal(lost.freecell.wins, 0);
});

test('Pairs pays for combos and perfection, and never below the floor', () => {
  const perfect = createProfile(T0);
  const clean = awardPairs(perfect, { won: true, mistakes: 0, bestCombo: 12, board: 'classic' }, T0);
  assert.equal(clean.coins, 35 + 45 + 60);
  assert.equal(clean.perfect, true);
  assert.equal(perfect.pairs.perfects, 1);

  const sloppy = createProfile(T0);
  const messy = awardPairs(sloppy, { won: true, mistakes: 60, bestCombo: 1, board: 'small' }, T0);
  assert.equal(messy.coins, 10, 'the floor keeps a bad clear worth something');

  const lost = createProfile(T0);
  assert.equal(awardPairs(lost, { won: false, mistakes: 3, bestCombo: 0, board: 'classic' }, T0).coins, 0);
  assert.equal(lost.pairs.played, 1);
});

test('Sweeper pays by difficulty, with gems only for Fierce', () => {
  const calm = createProfile(T0);
  const easy = awardSweeper(calm, { won: true, difficulty: 'calm', progress: 1 }, T0);
  assert.equal(easy.coins, 60);
  assert.equal(easy.gems, 0);

  const fierce = createProfile(T0);
  const hard = awardSweeper(fierce, { won: true, difficulty: 'fierce', progress: 1 }, T0);
  assert.equal(hard.coins, 220);
  assert.equal(hard.gems, 2);
  assert.equal(fierce.sweeper.byDifficulty.fierce, 1);

  const boom = createProfile(T0);
  assert.equal(awardSweeper(boom, { won: false, difficulty: 'brisk', progress: 0.5 }, T0).coins, 23);
});

test('the all-rounder achievement needs a win in every game', () => {
  const profile = createProfile(T0);
  profile.sokoban.levels.warmup = { solved: true, stars: 3 };
  profile.solitaire.wins = 1;
  profile.duel.wins = 1;
  profile.freecell.wins = 1;
  profile.pairs.wins = 1;

  let awarded = checkAchievements(profile, { levelCount: 24 }, T0).map((a) => a.id);
  assert.ok(!awarded.includes('all_rounder'), 'sweeper is still missing');

  profile.sweeper.wins = 1;
  awarded = checkAchievements(profile, { levelCount: 24 }, T0).map((a) => a.id);
  assert.ok(awarded.includes('all_rounder'));
});
