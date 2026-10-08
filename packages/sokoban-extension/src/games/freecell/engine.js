/**
 * FreeCell — every card face up from the start, so it is pure calculation.
 *
 * State:
 *   cells       4 slots holding one card each (null when empty)
 *   foundations built up by suit, ace first
 *   columns     8 tableau columns, built down in alternating colours
 *
 * The supermove limit is the usual `(free cells + 1) × 2^(empty columns)`,
 * halved when the destination itself is an empty column — moving a run there
 * consumes the column you would otherwise stage through.
 */

import { SUITS, dealtDeck, isRed } from '../cards/deck.js';

export const CELL_COUNT = 4;
export const COLUMN_COUNT = 8;

export function newGame(seed) {
  const deck = dealtDeck(seed);
  const columns = Array.from({ length: COLUMN_COUNT }, () => []);
  deck.forEach((card, index) => columns[index % COLUMN_COUNT].push(card));

  return {
    seed,
    cells: Array(CELL_COUNT).fill(null),
    foundations: { S: [], H: [], D: [], C: [] },
    columns,
    moves: 0,
  };
}

export function cloneGame(state) {
  return {
    seed: state.seed,
    cells: state.cells.slice(),
    foundations: {
      S: state.foundations.S.slice(),
      H: state.foundations.H.slice(),
      D: state.foundations.D.slice(),
      C: state.foundations.C.slice(),
    },
    columns: state.columns.map((column) => column.slice()),
    moves: state.moves,
  };
}

export function isWon(state) {
  return SUITS.every((suit) => state.foundations[suit].length === 13);
}

export function foundationCount(state) {
  return SUITS.reduce((sum, suit) => sum + state.foundations[suit].length, 0);
}

export function freeCells(state) {
  return state.cells.filter((card) => card === null).length;
}

export function emptyColumns(state) {
  return state.columns.filter((column) => column.length === 0).length;
}

/** How many cards can be moved as one run right now. */
export function maxMove(state, toEmptyColumn = false) {
  const empties = emptyColumns(state) - (toEmptyColumn ? 1 : 0);
  return (freeCells(state) + 1) * 2 ** Math.max(0, empties);
}

/** The descending, alternating-colour run at the end of a column. */
export function runLength(column) {
  let length = 1;
  for (let i = column.length - 1; i > 0; i--) {
    const upper = column[i - 1];
    const lower = column[i];
    if (upper.rank !== lower.rank + 1 || isRed(upper) === isRed(lower)) break;
    length++;
  }
  return Math.min(length, column.length);
}

function canStackOnColumn(column, card) {
  if (column.length === 0) return true; // any card may open an empty column
  const top = column[column.length - 1];
  return top.rank === card.rank + 1 && isRed(top) !== isRed(card);
}

function canStackOnFoundation(state, card) {
  return card && state.foundations[card.suit].length === card.rank - 1;
}

/**
 * Moves:
 *   { type: 'column-to-foundation', from }
 *   { type: 'column-to-cell', from, cell }
 *   { type: 'cell-to-foundation', cell }
 *   { type: 'cell-to-column', cell, to }
 *   { type: 'column-to-column', from, to, count }
 */
export function legalMove(state, move) {
  switch (move.type) {
    case 'column-to-foundation': {
      const column = state.columns[move.from];
      if (!column?.length) return false;
      return canStackOnFoundation(state, column[column.length - 1]);
    }
    case 'column-to-cell': {
      const column = state.columns[move.from];
      if (!column?.length) return false;
      return state.cells[move.cell] === null;
    }
    case 'cell-to-foundation':
      return canStackOnFoundation(state, state.cells[move.cell]);
    case 'cell-to-column': {
      const card = state.cells[move.cell];
      const column = state.columns[move.to];
      if (!card || !column) return false;
      return canStackOnColumn(column, card);
    }
    case 'column-to-column': {
      if (move.from === move.to) return false;
      const source = state.columns[move.from];
      const target = state.columns[move.to];
      if (!source || !target) return false;

      const count = move.count ?? 1;
      if (count < 1 || count > source.length) return false;
      if (count > runLength(source)) return false;
      if (count > maxMove(state, target.length === 0)) return false;

      return canStackOnColumn(target, source[source.length - count]);
    }
    default:
      return false;
  }
}

export function apply(state, move) {
  if (!legalMove(state, move)) return null;
  const next = cloneGame(state);
  next.moves++;

  switch (move.type) {
    case 'column-to-foundation': {
      const card = next.columns[move.from].pop();
      next.foundations[card.suit].push(card);
      break;
    }
    case 'column-to-cell':
      next.cells[move.cell] = next.columns[move.from].pop();
      break;
    case 'cell-to-foundation': {
      const card = next.cells[move.cell];
      next.cells[move.cell] = null;
      next.foundations[card.suit].push(card);
      break;
    }
    case 'cell-to-column':
      next.columns[move.to].push(next.cells[move.cell]);
      next.cells[move.cell] = null;
      break;
    case 'column-to-column': {
      const count = move.count ?? 1;
      const run = next.columns[move.from].splice(next.columns[move.from].length - count);
      next.columns[move.to].push(...run);
      break;
    }
    default:
      return null;
  }

  return next;
}

/** Where a clicked card most usefully wants to go. */
export function autoMoveFor(state, source) {
  const candidates = [];

  if (source.zone === 'cell') {
    candidates.push({ type: 'cell-to-foundation', cell: source.cell });
    for (let to = 0; to < COLUMN_COUNT; to++) {
      if (state.columns[to].length) candidates.push({ type: 'cell-to-column', cell: source.cell, to });
    }
    for (let to = 0; to < COLUMN_COUNT; to++) {
      candidates.push({ type: 'cell-to-column', cell: source.cell, to });
    }
  } else if (source.zone === 'column') {
    const column = state.columns[source.column];
    const count = column.length - source.index;
    if (count === 1) candidates.push({ type: 'column-to-foundation', from: source.column });
    // Prefer a real stack over opening an empty column.
    for (let to = 0; to < COLUMN_COUNT; to++) {
      if (to !== source.column && state.columns[to].length) {
        candidates.push({ type: 'column-to-column', from: source.column, to, count });
      }
    }
    for (let to = 0; to < COLUMN_COUNT; to++) {
      if (to !== source.column) {
        candidates.push({ type: 'column-to-column', from: source.column, to, count });
      }
    }
    if (count === 1) {
      const cell = state.cells.indexOf(null);
      if (cell >= 0) candidates.push({ type: 'column-to-cell', from: source.column, cell });
    }
  }

  return candidates.find((move) => legalMove(state, move)) ?? null;
}

/**
 * Cards that can go home without ever being needed to park a lower card.
 * Used by the "safe autoplay" sweep after each move.
 */
function safeToPlay(state, card) {
  if (!card) return false;
  if (!canStackOnFoundation(state, card)) return false;
  if (card.rank <= 2) return true;
  const opposite = isRed(card) ? ['S', 'C'] : ['H', 'D'];
  return opposite.every((suit) => state.foundations[suit].length >= card.rank - 1);
}

export function autoplayMoves(state) {
  let cursor = cloneGame(state);
  const plan = [];
  let progress = true;

  while (progress) {
    progress = false;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (safeToPlay(cursor, cursor.cells[cell])) {
        const move = { type: 'cell-to-foundation', cell };
        cursor = apply(cursor, move);
        plan.push(move);
        progress = true;
      }
    }
    for (let from = 0; from < COLUMN_COUNT; from++) {
      const column = cursor.columns[from];
      if (column.length && safeToPlay(cursor, column[column.length - 1])) {
        const move = { type: 'column-to-foundation', from };
        cursor = apply(cursor, move);
        plan.push(move);
        progress = true;
      }
    }
  }

  return plan;
}

/** True when nothing can legally be done — the deal is lost. */
export function hasMoves(state) {
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (legalMove(state, { type: 'cell-to-foundation', cell })) return true;
    for (let to = 0; to < COLUMN_COUNT; to++) {
      if (legalMove(state, { type: 'cell-to-column', cell, to })) return true;
    }
  }
  for (let from = 0; from < COLUMN_COUNT; from++) {
    if (legalMove(state, { type: 'column-to-foundation', from })) return true;
    if (state.cells.includes(null) && state.columns[from].length) return true;
    for (let to = 0; to < COLUMN_COUNT; to++) {
      const count = runLength(state.columns[from]);
      for (let n = 1; n <= count; n++) {
        if (legalMove(state, { type: 'column-to-column', from, to, count: n })) return true;
      }
    }
  }
  return false;
}

export function replay(seed, moves) {
  let state = newGame(seed);
  for (let i = 0; i < moves.length; i++) {
    const next = apply(state, moves[i]);
    if (!next) return { ok: false, reason: `illegal move at ${i}: ${moves[i]?.type}` };
    state = next;
  }
  return { ok: true, state, won: isWon(state), foundation: foundationCount(state) };
}
