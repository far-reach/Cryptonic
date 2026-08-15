/**
 * Pure Sokoban rules. No DOM, no chrome APIs — this module is imported by the
 * game page, by the service worker (to re-verify solve claims) and by the tests.
 *
 * Levels use the standard Sokoban character set:
 *   `#` wall   ` ` floor   `.` goal   `$` box   `*` box on goal
 *   `@` player `+` player on goal
 *
 * Positions are flat indices: `index = y * width + x`.
 */

export const DIRS = {
  U: { dx: 0, dy: -1 },
  D: { dx: 0, dy: 1 },
  L: { dx: -1, dy: 0 },
  R: { dx: 1, dy: 0 },
};

/** Uppercase letter = a push, lowercase = a plain step. */
export const MOVE_CHARS = 'udlrUDLR';

export function parseLevel(rows) {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const walls = new Set();
  const goals = new Set();
  const boxes = new Set();
  let player = -1;

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? ' ';
      const i = y * width + x;
      switch (ch) {
        case '#':
          walls.add(i);
          break;
        case '.':
          goals.add(i);
          break;
        case '$':
          boxes.add(i);
          break;
        case '*':
          boxes.add(i);
          goals.add(i);
          break;
        case '@':
          player = i;
          break;
        case '+':
          player = i;
          goals.add(i);
          break;
        default:
          break;
      }
    }
  }

  if (player < 0) throw new Error('level has no player');
  if (boxes.size !== goals.size) {
    throw new Error(`level has ${boxes.size} boxes but ${goals.size} goals`);
  }
  if (boxes.size === 0) throw new Error('level has no boxes');

  return { width, height, walls, goals, boxes, player, rows: rows.slice() };
}

/** The mutable part of a level: where the player and the boxes currently are. */
export function initialState(level) {
  return { player: level.player, boxes: new Set(level.boxes) };
}

export function cloneState(state) {
  return { player: state.player, boxes: new Set(state.boxes) };
}

/** Stable key for visited-set bookkeeping (solver, undo de-duplication). */
export function stateKey(state) {
  return `${state.player}|${[...state.boxes].sort((a, b) => a - b).join(',')}`;
}

export function isSolved(level, state) {
  for (const box of state.boxes) if (!level.goals.has(box)) return false;
  return true;
}

/**
 * Apply one step. Returns `null` when the move is blocked, otherwise a fresh
 * state plus what happened (so callers can animate and score it).
 */
export function step(level, state, dirKey) {
  const dir = DIRS[dirKey];
  if (!dir) return null;

  const { width, height, walls } = level;
  const x = state.player % width;
  const y = Math.floor(state.player / width);
  const nx = x + dir.dx;
  const ny = y + dir.dy;
  if (nx < 0 || ny < 0 || nx >= width || ny >= height) return null;

  const target = ny * width + nx;
  if (walls.has(target)) return null;

  let pushed = false;
  const boxes = new Set(state.boxes);

  if (boxes.has(target)) {
    const bx = nx + dir.dx;
    const by = ny + dir.dy;
    if (bx < 0 || by < 0 || bx >= width || by >= height) return null;
    const beyond = by * width + bx;
    if (walls.has(beyond) || boxes.has(beyond)) return null;
    boxes.delete(target);
    boxes.add(beyond);
    pushed = true;
  }

  return {
    state: { player: target, boxes },
    pushed,
    from: state.player,
    to: target,
    boxFrom: pushed ? target : -1,
    boxTo: pushed ? target + dir.dy * width + dir.dx : -1,
    dir: dirKey,
  };
}

/**
 * Replay a move string against a level. The service worker uses this to check
 * that a "level complete" claim from the page is a real solution before it
 * pays out any coins.
 */
export function replay(level, moves) {
  let state = initialState(level);
  let pushes = 0;
  let count = 0;

  for (const raw of moves) {
    const dirKey = raw.toUpperCase();
    if (!DIRS[dirKey]) return { ok: false, reason: `bad move character: ${raw}` };
    const result = step(level, state, dirKey);
    if (!result) return { ok: false, reason: `illegal move ${raw} at index ${count}` };
    state = result.state;
    if (result.pushed) pushes++;
    count++;
  }

  return { ok: true, solved: isSolved(level, state), moves: count, pushes, state };
}

/** Squares a box can never be pushed off (simple corner + wall-run analysis). */
export function deadSquares(level) {
  const { width, height, walls, goals } = level;
  const dead = new Set();
  const at = (x, y) => y * width + x;
  const isWall = (x, y) =>
    x < 0 || y < 0 || x >= width || y >= height || walls.has(at(x, y));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(x, y);
      if (walls.has(i) || goals.has(i)) continue;
      const up = isWall(x, y - 1);
      const down = isWall(x, y + 1);
      const left = isWall(x - 1, y);
      const right = isWall(x + 1, y);
      if ((up || down) && (left || right)) dead.add(i);
    }
  }

  // A box on a wall-hugging corridor with no goal on it is dead too: it can
  // only slide along the wall, and every square it can reach is goal-free.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(x, y);
      if (walls.has(i) || goals.has(i) || dead.has(i)) continue;
      for (const [along, side] of [
        [{ dx: 1, dy: 0 }, { dx: 0, dy: -1 }],
        [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }],
        [{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }],
        [{ dx: 0, dy: 1 }, { dx: 1, dy: 0 }],
      ]) {
        if (!isWall(x + side.dx, y + side.dy)) continue;
        let blocked = true;
        let goalFree = true;
        for (const sign of [1, -1]) {
          let cx = x;
          let cy = y;
          for (;;) {
            cx += along.dx * sign;
            cy += along.dy * sign;
            if (isWall(cx, cy)) break; // hit the end of the run
            if (!isWall(cx + side.dx, cy + side.dy)) { blocked = false; break; }
            if (goals.has(at(cx, cy))) { goalFree = false; break; }
          }
          if (!blocked || !goalFree) break;
        }
        if (blocked && goalFree) { dead.add(i); break; }
      }
    }
  }

  return dead;
}

/**
 * Move-optimal BFS solver. Used offline by `tools/solve.mjs` to prove every
 * shipped level is solvable, to derive its par score, and to bake in the
 * solution string that the in-game Hint spends its charge on.
 */
export function solve(level, { maxStates = 4_000_000 } = {}) {
  const start = initialState(level);
  if (isSolved(level, start)) return { moves: '', pushes: 0, states: 0 };

  const dead = deadSquares(level);
  const visited = new Set([stateKey(start)]);
  const queue = [{ state: start, path: '', pushes: 0 }];
  let head = 0;

  while (head < queue.length) {
    if (visited.size > maxStates) return null;
    const node = queue[head++];
    for (const dirKey of ['U', 'D', 'L', 'R']) {
      const result = step(level, node.state, dirKey);
      if (!result) continue;
      if (result.pushed && dead.has(result.boxTo)) continue;
      const key = stateKey(result.state);
      if (visited.has(key)) continue;
      visited.add(key);
      const path = node.path + (result.pushed ? dirKey : dirKey.toLowerCase());
      const pushes = node.pushes + (result.pushed ? 1 : 0);
      if (isSolved(level, result.state)) {
        return { moves: path, pushes, states: visited.size };
      }
      queue.push({ state: result.state, path, pushes });
    }
  }

  return null;
}
