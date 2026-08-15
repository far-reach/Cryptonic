/**
 * Sweeper — minesweeper with a seeded, first-click-safe board.
 *
 * Mines are laid *after* the first reveal, from `seed` plus the index that was
 * clicked, so the opening move can never lose and the whole board is still
 * reproducible from `(seed, firstClick)` alone. That is what makes a win
 * verifiable: replay the action list and the same mines land in the same
 * squares every time.
 */

import { makeRng } from '../cards/deck.js';

export const DIFFICULTIES = {
  calm: { id: 'calm', name: 'Calm', cols: 9, rows: 9, mines: 10 },
  brisk: { id: 'brisk', name: 'Brisk', cols: 12, rows: 12, mines: 24 },
  fierce: { id: 'fierce', name: 'Fierce', cols: 16, rows: 16, mines: 45 },
};

export function newGame(seed, difficultyId = 'calm') {
  const difficulty = DIFFICULTIES[difficultyId] ?? DIFFICULTIES.calm;
  const size = difficulty.cols * difficulty.rows;

  return {
    seed,
    difficulty: difficulty.id,
    cols: difficulty.cols,
    rows: difficulty.rows,
    mineCount: difficulty.mines,
    mines: null, // laid on the first reveal
    revealed: new Set(),
    flags: new Set(),
    size,
    over: false,
    won: false,
    hitMine: -1,
    moves: 0,
  };
}

export function cloneGame(state) {
  return {
    ...state,
    mines: state.mines ? new Set(state.mines) : null,
    revealed: new Set(state.revealed),
    flags: new Set(state.flags),
  };
}

export function neighbours(state, index) {
  const x = index % state.cols;
  const y = Math.floor(index / state.cols);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) continue;
      out.push(ny * state.cols + nx);
    }
  }
  return out;
}

export function adjacentMines(state, index) {
  if (!state.mines) return 0;
  return neighbours(state, index).filter((i) => state.mines.has(i)).length;
}

/** Lay mines avoiding the first click and everything touching it. */
function layMines(state, safeIndex) {
  const forbidden = new Set([safeIndex, ...neighbours(state, safeIndex)]);
  const candidates = [];
  for (let i = 0; i < state.size; i++) if (!forbidden.has(i)) candidates.push(i);

  const rng = makeRng((state.seed ^ (safeIndex * 0x9e3779b9)) >>> 0);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // A board can be smaller than mines + the safe pocket; clamp rather than hang.
  state.mines = new Set(candidates.slice(0, Math.min(state.mineCount, candidates.length)));
}

function floodReveal(state, index) {
  const stack = [index];
  while (stack.length) {
    const current = stack.pop();
    if (state.revealed.has(current) || state.flags.has(current)) continue;
    state.revealed.add(current);
    if (adjacentMines(state, current) === 0) {
      for (const neighbour of neighbours(state, current)) {
        if (!state.revealed.has(neighbour)) stack.push(neighbour);
      }
    }
  }
}

function checkWin(state) {
  if (state.revealed.size === state.size - state.mines.size) {
    state.over = true;
    state.won = true;
    for (const mine of state.mines) state.flags.add(mine);
  }
}

/**
 * Actions:
 *   { type: 'reveal', index }
 *   { type: 'flag',   index }   toggles
 *   { type: 'chord',  index }   reveal all neighbours when the flag count matches
 */
export function apply(state, action) {
  if (state.over) return null;

  switch (action.type) {
    case 'reveal': {
      const { index } = action;
      if (index < 0 || index >= state.size) return null;
      if (state.revealed.has(index) || state.flags.has(index)) return null;

      const next = cloneGame(state);
      next.moves++;
      if (!next.mines) layMines(next, index);

      if (next.mines.has(index)) {
        next.over = true;
        next.won = false;
        next.hitMine = index;
        next.revealed.add(index);
        return next;
      }

      floodReveal(next, index);
      checkWin(next);
      return next;
    }

    case 'flag': {
      const { index } = action;
      if (index < 0 || index >= state.size) return null;
      if (state.revealed.has(index)) return null;

      const next = cloneGame(state);
      next.moves++;
      if (next.flags.has(index)) next.flags.delete(index);
      else next.flags.add(index);
      return next;
    }

    case 'chord': {
      const { index } = action;
      if (!state.mines || !state.revealed.has(index)) return null;
      const around = neighbours(state, index);
      const flagged = around.filter((i) => state.flags.has(i)).length;
      if (flagged !== adjacentMines(state, index)) return null;

      const next = cloneGame(state);
      next.moves++;
      for (const neighbour of around) {
        if (next.flags.has(neighbour) || next.revealed.has(neighbour)) continue;
        if (next.mines.has(neighbour)) {
          next.over = true;
          next.won = false;
          next.hitMine = neighbour;
          next.revealed.add(neighbour);
          return next;
        }
        floodReveal(next, neighbour);
      }
      checkWin(next);
      return next;
    }

    default:
      return null;
  }
}

/** Safe squares uncovered so far — drives the partial payout on a loss. */
export function progress(state) {
  if (!state.mines) return 0;
  const safe = state.size - state.mines.size;
  return safe ? Math.min(1, state.revealed.size / safe) : 0;
}

export function replay(seed, difficulty, actions) {
  let state = newGame(seed, difficulty);
  for (let i = 0; i < actions.length; i++) {
    const next = apply(state, actions[i]);
    if (!next) return { ok: false, reason: `illegal action at ${i}: ${actions[i]?.type}` };
    state = next;
  }
  return {
    ok: true,
    state,
    won: state.won,
    revealed: state.revealed.size,
    progress: progress(state),
  };
}
