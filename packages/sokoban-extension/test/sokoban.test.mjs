import test from 'node:test';
import assert from 'node:assert/strict';

import { LEVELS } from '../src/games/sokoban/levels.js';
import { SOLUTIONS } from '../src/games/sokoban/solutions.js';
import {
  deadSquares,
  initialState,
  isSolved,
  parseLevel,
  replay,
  solve,
  step,
} from '../src/games/sokoban/engine.js';
import { starsFor } from '../src/store/catalog.js';

test('parseLevel reads the standard character set', () => {
  const level = parseLevel(['#####', '#@$.#', '#####']);
  assert.equal(level.width, 5);
  assert.equal(level.height, 3);
  assert.equal(level.player, 6);
  assert.deepEqual([...level.boxes], [7]);
  assert.deepEqual([...level.goals], [8]);
});

test('parseLevel rejects malformed levels', () => {
  assert.throws(() => parseLevel(['####', '#$.#', '####']), /no player/);
  assert.throws(() => parseLevel(['#####', '#@$ #', '#####']), /0 goals/);
  assert.throws(() => parseLevel(['######', '#@$$.#', '######']), /2 boxes but 1 goals/);
});

test('a box on a goal is both box and goal', () => {
  const level = parseLevel(['#####', '#@* #', '#####']);
  assert.deepEqual([...level.boxes], [7]);
  assert.deepEqual([...level.goals], [7]);
  assert.ok(isSolved(level, initialState(level)));
});

test('step pushes, blocks and reports', () => {
  const level = parseLevel(['######', '#@$ .#', '######']);
  const start = initialState(level);

  const push = step(level, start, 'R');
  assert.ok(push.pushed);
  assert.equal(push.state.player, 8);
  assert.deepEqual([...push.state.boxes], [9]);

  assert.equal(step(level, start, 'L'), null, 'walking into a wall is blocked');
  assert.equal(step(level, start, 'U'), null);
});

test('a box cannot be pushed into a wall or another box', () => {
  const blocked = parseLevel(['########', '#@$$ ..#', '########']);
  assert.equal(step(blocked, initialState(blocked), 'R'), null);

  const wall = parseLevel(['#####', '#@$#.', '#####']);
  assert.equal(step(wall, initialState(wall), 'R'), null);
});

test('replay rejects illegal and non-solving move strings', () => {
  const level = parseLevel(['######', '#@$ .#', '######']);
  assert.equal(replay(level, 'L').ok, false);
  assert.equal(replay(level, 'x').ok, false);

  const short = replay(level, 'R');
  assert.equal(short.ok, true);
  assert.equal(short.solved, false);

  const full = replay(level, 'RR');
  assert.equal(full.solved, true);
  assert.equal(full.moves, 2);
  assert.equal(full.pushes, 2);
});

test('deadSquares finds corners but never a goal square', () => {
  const level = parseLevel(['######', '#  . #', '# $  #', '#@   #', '######']);
  const dead = deadSquares(level);
  const at = (x, y) => y * level.width + x;
  assert.ok(dead.has(at(1, 1)), 'top-left corner is dead');
  assert.ok(!dead.has(at(3, 1)), 'the goal square is never dead');
  assert.ok(!dead.has(at(2, 2)), 'open floor is not dead');
});

test('every shipped level parses and has a recorded solution', () => {
  assert.ok(LEVELS.length >= 20);
  const ids = new Set();
  for (const level of LEVELS) {
    assert.ok(!ids.has(level.id), `duplicate level id: ${level.id}`);
    ids.add(level.id);
    assert.ok(SOLUTIONS[level.id], `no solution recorded for ${level.id}`);
    assert.doesNotThrow(() => parseLevel(level.rows));
  }
});

test('every recorded solution actually solves its level at par', () => {
  for (const level of LEVELS) {
    const solution = SOLUTIONS[level.id];
    const result = replay(parseLevel(level.rows), solution.moves);
    assert.ok(result.ok, `${level.id}: ${result.reason}`);
    assert.ok(result.solved, `${level.id}: recorded solution does not solve it`);
    assert.equal(result.moves, solution.par, `${level.id}: par mismatch`);
    assert.equal(result.pushes, solution.pushes, `${level.id}: push count mismatch`);
  }
});

test('the solver finds an optimal path for the small levels', () => {
  for (const level of LEVELS.slice(0, 8)) {
    const found = solve(parseLevel(level.rows));
    assert.ok(found, `${level.id} should be solvable`);
    assert.equal(found.moves.length, SOLUTIONS[level.id].par);
  }
});

test('the solver reports unsolvable positions instead of hanging', () => {
  // The box is wedged in a corner with the goal out of reach.
  const level = parseLevel(['#####', '#$  #', '# @ #', '#  .#', '#####']);
  const stuck = { ...level, boxes: new Set([level.width + 1]) };
  assert.equal(solve(stuck), null);
});

test('star thresholds follow the par ratio', () => {
  assert.equal(starsFor(20, 20), 3);
  assert.equal(starsFor(20, 20), 3, 'matching par is three stars');
  assert.equal(starsFor(26, 20), 2, '1.3× par drops to two stars');
  assert.equal(starsFor(30, 20), 1);
  assert.equal(starsFor(60, 20), 1);
  assert.equal(starsFor(0, 20), 0);
});
