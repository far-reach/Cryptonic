import test from 'node:test';
import assert from 'node:assert/strict';

import { dealtDeck, freshDeck, makeRng, shuffle } from '../src/games/cards/deck.js';
import {
  apply,
  autoCompleteMoves,
  canAutoComplete,
  foundationCount,
  isWon,
  legalMove,
  newGame,
  replay as replaySolitaire,
} from '../src/games/solitaire/engine.js';
import {
  MAX_ROUNDS,
  ROUNDS_TO_WIN,
  counters,
  effectiveValue,
  insure,
  newDuel,
  peek,
  playCard,
  replay as replayDuel,
  swapHand,
} from '../src/games/duel/engine.js';

/* -------------------------------------------------------------------- deck */

test('a fresh deck holds 52 distinct cards', () => {
  const deck = freshDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
});

test('shuffling is a permutation and is seed-reproducible', () => {
  const a = dealtDeck(1234);
  const b = dealtDeck(1234);
  const c = dealtDeck(9999);
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.notDeepEqual(a.map((x) => x.id), c.map((x) => x.id));
  assert.deepEqual(
    a.map((x) => x.id).sort(),
    freshDeck().map((x) => x.id).sort(),
  );
});

test('the rng stays inside [0, 1)', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 500; i++) {
    const value = rng();
    assert.ok(value >= 0 && value < 1);
  }
});

/* --------------------------------------------------------------- solitaire */

test('a new deal lays out 28 tableau cards with 7 face up', () => {
  const game = newGame(42);
  assert.equal(game.tableau.length, 7);
  assert.equal(game.tableau.flat().length, 28);
  assert.equal(game.stock.length, 24);
  assert.equal(game.tableau.flat().filter((e) => e.faceUp).length, 7);
  game.tableau.forEach((pile, i) => {
    assert.equal(pile.length, i + 1);
    assert.ok(pile[pile.length - 1].faceUp, 'the last card of each pile is face up');
  });
});

test('drawing moves cards to the waste and recycling returns them', () => {
  let game = newGame(3, 3);
  game = apply(game, { type: 'draw' });
  assert.equal(game.waste.length, 3);
  assert.equal(game.stock.length, 21);

  while (game.stock.length) game = apply(game, { type: 'draw' });
  assert.equal(game.waste.length, 24);
  assert.equal(legalMove(game, { type: 'draw' }), false);

  game = apply(game, { type: 'recycle' });
  assert.equal(game.stock.length, 24);
  assert.equal(game.waste.length, 0);
  assert.equal(game.recycles, 1);
});

test('only an ace opens a foundation and only a king an empty pile', () => {
  const game = newGame(11);
  const empty = { ...game, foundations: { S: [], H: [], D: [], C: [] } };

  const aceFirst = apply(
    { ...empty, waste: [{ id: 'S1', rank: 1, suit: 'S' }] },
    { type: 'waste-to-foundation' },
  );
  assert.ok(aceFirst, 'an ace starts a foundation');

  const twoFirst = apply(
    { ...empty, waste: [{ id: 'S2', rank: 2, suit: 'S' }] },
    { type: 'waste-to-foundation' },
  );
  assert.equal(twoFirst, null, 'a two cannot start a foundation');

  const emptyTableau = { ...game, tableau: [[], ...game.tableau.slice(1)] };
  assert.equal(
    legalMove({ ...emptyTableau, waste: [{ id: 'H5', rank: 5, suit: 'H' }] }, {
      type: 'waste-to-tableau',
      to: 0,
    }),
    false,
  );
  assert.equal(
    legalMove({ ...emptyTableau, waste: [{ id: 'H13', rank: 13, suit: 'H' }] }, {
      type: 'waste-to-tableau',
      to: 0,
    }),
    true,
  );
});

test('tableau stacking demands alternating colours and descending rank', () => {
  const game = newGame(5);
  const base = {
    ...game,
    tableau: [
      [{ card: { id: 'S10', rank: 10, suit: 'S' }, faceUp: true }],
      [],
      [],
      [],
      [],
      [],
      [],
    ],
  };

  const red9 = { ...base, waste: [{ id: 'H9', rank: 9, suit: 'H' }] };
  assert.equal(legalMove(red9, { type: 'waste-to-tableau', to: 0 }), true);

  const black9 = { ...base, waste: [{ id: 'C9', rank: 9, suit: 'C' }] };
  assert.equal(legalMove(black9, { type: 'waste-to-tableau', to: 0 }), false);

  const red8 = { ...base, waste: [{ id: 'H8', rank: 8, suit: 'H' }] };
  assert.equal(legalMove(red8, { type: 'waste-to-tableau', to: 0 }), false);
});

test('moving off a tableau pile turns the next card face up', () => {
  let game = newGame(77);
  // Pile 1 has two cards, the lower one face down.
  const pile = game.tableau[1];
  assert.equal(pile[0].faceUp, false);

  const target = game.tableau.findIndex((p, i) => {
    if (i === 1) return false;
    const top = p[p.length - 1];
    const moving = pile[pile.length - 1].card;
    return (
      top.faceUp &&
      top.card.rank === moving.rank + 1 &&
      ['H', 'D'].includes(top.card.suit) !== ['H', 'D'].includes(moving.suit)
    );
  });

  if (target >= 0) {
    game = apply(game, { type: 'tableau-to-tableau', from: 1, index: 1, to: target });
    assert.ok(game.tableau[1][0].faceUp, 'the newly exposed card flips up');
  }
});

test('replay rejects an illegal move list and confirms a legal one', () => {
  const bad = replaySolitaire(42, 1, [{ type: 'recycle' }]);
  assert.equal(bad.ok, false);

  const good = replaySolitaire(42, 1, [{ type: 'draw' }, { type: 'draw' }]);
  assert.equal(good.ok, true);
  assert.equal(good.won, false);
  assert.equal(good.state.waste.length, 2);
});

test('a fully-open board auto-completes to a win', () => {
  // Hand-build an end position: every card face up on the tableau, no stock.
  const tableau = [[], [], [], [], [], [], []];
  const suits = ['S', 'H', 'D', 'C'];
  suits.forEach((suit, index) => {
    for (let rank = 13; rank >= 1; rank--) {
      tableau[index].push({ card: { id: `${suit}${rank}`, rank, suit }, faceUp: true });
    }
  });

  const game = {
    seed: 0,
    drawMode: 1,
    stock: [],
    waste: [],
    foundations: { S: [], H: [], D: [], C: [] },
    tableau,
    moves: 0,
    recycles: 0,
  };

  assert.ok(canAutoComplete(game));
  const plan = autoCompleteMoves(game);
  assert.equal(plan.length, 52);

  let cursor = game;
  for (const move of plan) cursor = apply(cursor, move);
  assert.ok(isWon(cursor));
  assert.equal(foundationCount(cursor), 52);
});

/* -------------------------------------------------------------------- duel */

test('the suit counter cycle is a closed loop', () => {
  assert.ok(counters('S', 'H'));
  assert.ok(counters('H', 'D'));
  assert.ok(counters('D', 'C'));
  assert.ok(counters('C', 'S'));
  assert.ok(!counters('S', 'D'), 'opposite suits do not counter');
  assert.ok(!counters('H', 'S'), 'countering is one-way');
});

test('a countered card fights at half rank', () => {
  const spade3 = { id: 'S3', rank: 3, suit: 'S' };
  const heart5 = { id: 'H5', rank: 5, suit: 'H' };
  assert.equal(effectiveValue(spade3, heart5), 3, 'hearts do not counter spades');
  assert.equal(effectiveValue(heart5, spade3), 2, '5 halved and floored');
});

test('a duel deals five each from separate halves of the deck', () => {
  const duel = newDuel(2024);
  assert.equal(duel.playerHand.length, 5);
  assert.equal(duel.aiHand.length, 5);
  assert.equal(duel.playerDeck.length, 21);
  assert.equal(duel.aiDeck.length, 21);
  const ids = new Set([...duel.playerHand, ...duel.aiHand].map((c) => c.id));
  assert.equal(ids.size, 10, 'no card is dealt to both duellists');
});

test('playing a card resolves the round and refills the hand', () => {
  const duel = newDuel(99);
  const next = playCard(duel, 0);
  assert.equal(next.history.length, 1);
  assert.equal(next.playerHand.length, 5, 'hand refills from the deck');
  assert.equal(next.playerDeck.length, 20);
  assert.equal(next.round, 2);
  assert.equal(next.playerScore + next.aiScore <= 1, true);
});

test('insurance voids exactly one lost round', () => {
  let duel = newDuel(4321);
  let insured = insure(duel);
  assert.ok(insured.insured);

  // Play until a round is lost; insurance should absorb the first one.
  let cursor = insured;
  let sawVoid = false;
  while (!cursor.over) {
    cursor = playCard(cursor, 0);
    const last = cursor.history[cursor.history.length - 1];
    if (last.voided) {
      sawVoid = true;
      assert.equal(cursor.insured, false, 'insurance is consumed');
      break;
    }
    if (last.outcome === 'ai') break;
  }
  assert.ok(sawVoid || cursor.over, 'either the loss was voided or no loss occurred');
});

test('peek reveals the card the opponent is about to commit', () => {
  const duel = newDuel(555);
  const peeked = peek(duel);
  assert.ok(peeked.peeked);
  const played = playCard(peeked, 0);
  assert.equal(
    played.history[0].aiCard.id,
    peeked.peeked.id,
    'the peeked card is the one actually played',
  );
});

test('swapping the hand keeps the card count and buries the old cards', () => {
  const duel = newDuel(6161);
  const before = duel.playerHand.map((c) => c.id);
  const after = swapHand(duel);
  assert.equal(after.playerHand.length, 5);
  assert.notDeepEqual(after.playerHand.map((c) => c.id), before);
  assert.equal(after.playerDeck.length + after.playerHand.length, 26);
});

test('a duel ends at five round wins or nine rounds', () => {
  let duel = newDuel(31337);
  let guard = 0;
  while (!duel.over && guard++ < 50) duel = playCard(duel, 0);
  assert.ok(duel.over);
  assert.ok(duel.playerScore >= ROUNDS_TO_WIN || duel.aiScore >= ROUNDS_TO_WIN || duel.round > MAX_ROUNDS);
  assert.ok(['win', 'loss', 'draw'].includes(duel.result));
});

test('duel replay reproduces the outcome and rejects tampering', () => {
  let duel = newDuel(777);
  const actions = [];
  while (!duel.over) {
    actions.push({ type: 'play', index: 0 });
    duel = playCard(duel, 0);
  }

  const verified = replayDuel(777, actions);
  assert.equal(verified.ok, true);
  assert.equal(verified.state.playerScore, duel.playerScore);
  assert.equal(verified.state.result, duel.result);

  const tampered = replayDuel(777, [...actions, { type: 'play', index: 0 }]);
  assert.equal(tampered.ok, false, 'playing on after the duel ended is rejected');

  const bogus = replayDuel(777, [{ type: 'play', index: 99 }]);
  assert.equal(bogus.ok, false);
});

test('a different seed produces a different duel', () => {
  const a = newDuel(1);
  const b = newDuel(2);
  assert.notDeepEqual(a.playerHand.map((c) => c.id), b.playerHand.map((c) => c.id));
});
