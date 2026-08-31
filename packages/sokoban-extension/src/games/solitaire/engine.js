/**
 * Klondike solitaire rules, pure and serialisable.
 *
 * State shape:
 *   stock       face-down draw pile (top of pile = last element)
 *   waste       face-up pile drawn from stock
 *   foundations { S: [], H: [], D: [], C: [] } built A..K by suit
 *   tableau     7 piles of `{ card, faceUp }`
 *
 * Every mutation goes through `apply(state, move)` so the UI, the undo stack
 * and the tests all exercise exactly the same code path.
 */

import { SUITS, dealtDeck, isRed } from '../cards/deck.js';

export const DRAW_MODES = { ONE: 1, THREE: 3 };

export function newGame(seed, drawMode = DRAW_MODES.ONE) {
  const deck = dealtDeck(seed);
  const tableau = [];
  let at = 0;

  for (let pile = 0; pile < 7; pile++) {
    const cards = [];
    for (let i = 0; i <= pile; i++) {
      cards.push({ card: deck[at++], faceUp: i === pile });
    }
    tableau.push(cards);
  }

  return {
    seed,
    drawMode,
    stock: deck.slice(at),
    waste: [],
    foundations: { S: [], H: [], D: [], C: [] },
    tableau,
    moves: 0,
    recycles: 0,
  };
}

export function cloneGame(state) {
  return {
    seed: state.seed,
    drawMode: state.drawMode,
    stock: state.stock.slice(),
    waste: state.waste.slice(),
    foundations: {
      S: state.foundations.S.slice(),
      H: state.foundations.H.slice(),
      D: state.foundations.D.slice(),
      C: state.foundations.C.slice(),
    },
    tableau: state.tableau.map((pile) => pile.map((entry) => ({ ...entry }))),
    moves: state.moves,
    recycles: state.recycles,
  };
}

export function isWon(state) {
  return SUITS.every((suit) => state.foundations[suit].length === 13);
}

/** Cards left to place — drives the progress meter and the payout curve. */
export function foundationCount(state) {
  return SUITS.reduce((sum, suit) => sum + state.foundations[suit].length, 0);
}

function canStackOnFoundation(state, card) {
  const pile = state.foundations[card.suit];
  return card.rank === pile.length + 1;
}

function canStackOnTableau(pile, card) {
  if (pile.length === 0) return card.rank === 13; // only a King seeds an empty pile
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return top.card.rank === card.rank + 1 && isRed(top.card) !== isRed(card);
}

/** The face-up run starting at `index`, or null when it isn't a legal run. */
function movableRun(pile, index) {
  if (index < 0 || index >= pile.length) return null;
  if (!pile[index].faceUp) return null;
  for (let i = index; i < pile.length - 1; i++) {
    const a = pile[i].card;
    const b = pile[i + 1].card;
    if (a.rank !== b.rank + 1 || isRed(a) === isRed(b)) return null;
  }
  return pile.slice(index);
}

/**
 * Moves are plain data so they can be logged, replayed and undone:
 *   { type: 'draw' }
 *   { type: 'recycle' }
 *   { type: 'waste-to-foundation' }
 *   { type: 'waste-to-tableau', to }
 *   { type: 'tableau-to-foundation', from }
 *   { type: 'tableau-to-tableau', from, index, to }
 *   { type: 'foundation-to-tableau', suit, to }
 */
export function legalMove(state, move) {
  switch (move.type) {
    case 'draw':
      return state.stock.length > 0;
    case 'recycle':
      return state.stock.length === 0 && state.waste.length > 0;
    case 'waste-to-foundation': {
      const card = state.waste[state.waste.length - 1];
      return Boolean(card) && canStackOnFoundation(state, card);
    }
    case 'waste-to-tableau': {
      const card = state.waste[state.waste.length - 1];
      const pile = state.tableau[move.to];
      return Boolean(card) && Boolean(pile) && canStackOnTableau(pile, card);
    }
    case 'tableau-to-foundation': {
      const pile = state.tableau[move.from];
      if (!pile || pile.length === 0) return false;
      const top = pile[pile.length - 1];
      return top.faceUp && canStackOnFoundation(state, top.card);
    }
    case 'tableau-to-tableau': {
      if (move.from === move.to) return false;
      const src = state.tableau[move.from];
      const dst = state.tableau[move.to];
      if (!src || !dst) return false;
      const run = movableRun(src, move.index);
      return Boolean(run) && canStackOnTableau(dst, run[0].card);
    }
    case 'foundation-to-tableau': {
      const pile = state.foundations[move.suit];
      const dst = state.tableau[move.to];
      if (!pile || pile.length === 0 || !dst) return false;
      return canStackOnTableau(dst, pile[pile.length - 1]);
    }
    default:
      return false;
  }
}

/** Returns a new state, or null when the move is not legal. */
export function apply(state, move) {
  if (!legalMove(state, move)) return null;
  const next = cloneGame(state);
  next.moves++;

  switch (move.type) {
    case 'draw': {
      const count = Math.min(next.drawMode, next.stock.length);
      for (let i = 0; i < count; i++) next.waste.push(next.stock.pop());
      break;
    }
    case 'recycle': {
      while (next.waste.length) next.stock.push(next.waste.pop());
      next.recycles++;
      break;
    }
    case 'waste-to-foundation': {
      const card = next.waste.pop();
      next.foundations[card.suit].push(card);
      break;
    }
    case 'waste-to-tableau': {
      next.tableau[move.to].push({ card: next.waste.pop(), faceUp: true });
      break;
    }
    case 'tableau-to-foundation': {
      const pile = next.tableau[move.from];
      const entry = pile.pop();
      next.foundations[entry.card.suit].push(entry.card);
      revealTop(pile);
      break;
    }
    case 'tableau-to-tableau': {
      const src = next.tableau[move.from];
      const run = src.splice(move.index);
      next.tableau[move.to].push(...run);
      revealTop(src);
      break;
    }
    case 'foundation-to-tableau': {
      const card = next.foundations[move.suit].pop();
      next.tableau[move.to].push({ card, faceUp: true });
      break;
    }
    default:
      return null;
  }

  return next;
}

function revealTop(pile) {
  if (pile.length && !pile[pile.length - 1].faceUp) {
    pile[pile.length - 1].faceUp = true;
  }
}

/** Best destination for a card the player double-clicked / tapped. */
export function autoMoveFor(state, source) {
  const candidates = [];
  if (source.zone === 'waste') {
    candidates.push({ type: 'waste-to-foundation' });
    for (let to = 0; to < 7; to++) candidates.push({ type: 'waste-to-tableau', to });
  } else if (source.zone === 'tableau') {
    const pile = state.tableau[source.pile];
    if (source.index === pile.length - 1) {
      candidates.push({ type: 'tableau-to-foundation', from: source.pile });
    }
    for (let to = 0; to < 7; to++) {
      if (to === source.pile) continue;
      candidates.push({
        type: 'tableau-to-tableau',
        from: source.pile,
        index: source.index,
        to,
      });
    }
  }
  return candidates.find((move) => legalMove(state, move)) ?? null;
}

/**
 * True once every card is face up and the stock is empty — at that point the
 * deal is guaranteed winnable, so the UI offers a one-click finish.
 */
export function canAutoComplete(state) {
  if (state.stock.length || state.waste.length) return false;
  return state.tableau.every((pile) => pile.every((entry) => entry.faceUp));
}

/** Drains the tableau onto the foundations; returns the sequence of moves. */
export function autoCompleteMoves(state) {
  let cursor = cloneGame(state);
  const moves = [];
  let progress = true;

  while (progress && !isWon(cursor)) {
    progress = false;
    for (let from = 0; from < 7; from++) {
      const move = { type: 'tableau-to-foundation', from };
      const next = apply(cursor, move);
      if (next) {
        cursor = next;
        moves.push(move);
        progress = true;
      }
    }
  }

  return moves;
}

/** A cheap "is anything still possible" check used to offer a fresh deal. */
export function hasMoves(state) {
  if (state.stock.length || state.waste.length) return true;
  for (let from = 0; from < 7; from++) {
    if (legalMove(state, { type: 'tableau-to-foundation', from })) return true;
    const pile = state.tableau[from];
    for (let index = 0; index < pile.length; index++) {
      if (!pile[index].faceUp) continue;
      for (let to = 0; to < 7; to++) {
        if (legalMove(state, { type: 'tableau-to-tableau', from, index, to })) return true;
      }
    }
  }
  return false;
}

/**
 * Replays a move list from a seed. The service worker uses this to confirm a
 * solitaire win really happened before it credits the wallet.
 */
export function replay(seed, drawMode, moves) {
  let state = newGame(seed, drawMode);
  for (let i = 0; i < moves.length; i++) {
    const next = apply(state, moves[i]);
    if (!next) return { ok: false, reason: `illegal move at ${i}: ${moves[i]?.type}` };
    state = next;
  }
  return { ok: true, state, won: isWon(state), foundation: foundationCount(state) };
}
