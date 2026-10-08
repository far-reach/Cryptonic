/**
 * Pairs — memory match on a seeded board.
 *
 * Two cards of the same rank *and* colour form a pair, so the board reads as
 * real playing cards rather than abstract tiles. Flips are logged, which is
 * what lets the service worker replay a clear and confirm the mistake count
 * that sets the payout.
 *
 * `pending` holds the cards currently face up. A third flip resolves the
 * previous pair first, so a replay never depends on wall-clock timing.
 */

import { RANK_LABEL, dealtDeck } from '../cards/deck.js';

export const BOARDS = {
  small: { id: 'small', name: 'Warm-up', cols: 4, rows: 3, pairs: 6 },
  classic: { id: 'classic', name: 'Classic', cols: 6, rows: 4, pairs: 12 },
  hard: { id: 'hard', name: 'Marathon', cols: 8, rows: 4, pairs: 16 },
};

export function newGame(seed, boardId = 'classic') {
  const board = BOARDS[boardId] ?? BOARDS.classic;
  const deck = dealtDeck(seed);

  // Take `pairs` cards of distinct rank+colour, then mirror them.
  const chosen = [];
  const used = new Set();
  for (const card of deck) {
    const key = `${card.rank}:${'HD'.includes(card.suit) ? 'r' : 'b'}`;
    if (used.has(key)) continue;
    used.add(key);
    chosen.push(card);
    if (chosen.length === board.pairs) break;
  }

  const tiles = chosen.flatMap((card, index) => [
    { key: index, card, id: `${card.id}a` },
    { key: index, card: { ...card, id: `${card.id}b` }, id: `${card.id}b` },
  ]);

  // Deterministic shuffle of the layout, seeded off the deal.
  const order = shuffleIndexes(tiles.length, seed ^ 0x5bf03635);

  return {
    seed,
    board: board.id,
    cols: board.cols,
    rows: board.rows,
    tiles: order.map((i) => tiles[i]),
    matched: new Set(),
    pending: [],
    flips: 0,
    mistakes: 0,
    combo: 0,
    bestCombo: 0,
  };
}

function shuffleIndexes(length, seed) {
  const order = Array.from({ length }, (_, i) => i);
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function cloneGame(state) {
  return {
    ...state,
    tiles: state.tiles.slice(),
    matched: new Set(state.matched),
    pending: state.pending.slice(),
  };
}

export function isWon(state) {
  return state.matched.size === state.tiles.length;
}

export function isFaceUp(state, index) {
  return state.matched.has(index) || state.pending.includes(index);
}

/** Resolve a hanging pair — mismatches turn back down. */
export function settle(state) {
  if (state.pending.length < 2) return state;
  const next = cloneGame(state);
  const [a, b] = next.pending;
  if (next.tiles[a].key === next.tiles[b].key) {
    next.matched.add(a);
    next.matched.add(b);
  }
  next.pending = [];
  return next;
}

/** Flip the tile at `index`. Returns null when the flip is not allowed. */
export function flip(state, index) {
  if (index < 0 || index >= state.tiles.length) return null;
  if (isWon(state)) return null;

  let base = state;
  if (state.pending.length >= 2) base = settle(state);
  if (base.matched.has(index) || base.pending.includes(index)) return null;

  const next = cloneGame(base);
  next.pending.push(index);
  next.flips++;

  if (next.pending.length === 2) {
    const [a, b] = next.pending;
    const hit = next.tiles[a].key === next.tiles[b].key;
    if (hit) {
      next.matched.add(a);
      next.matched.add(b);
      next.pending = [];
      next.combo++;
      next.bestCombo = Math.max(next.bestCombo, next.combo);
    } else {
      next.mistakes++;
      next.combo = 0;
    }
    next.lastResult = hit ? 'match' : 'miss';
  } else {
    next.lastResult = null;
  }

  return next;
}

export function label(tile) {
  return `${RANK_LABEL[tile.card.rank]}${tile.card.suit}`;
}

/** A perfect clear is one where every pair was found without a mistake. */
export function isPerfect(state) {
  return isWon(state) && state.mistakes === 0;
}

export function replay(seed, boardId, flips) {
  let state = newGame(seed, boardId);
  for (let i = 0; i < flips.length; i++) {
    const next = flip(state, flips[i]);
    if (!next) return { ok: false, reason: `illegal flip at ${i}: ${flips[i]}` };
    state = next;
  }
  return {
    ok: true,
    state,
    won: isWon(state),
    mistakes: state.mistakes,
    bestCombo: state.bestCombo,
  };
}
