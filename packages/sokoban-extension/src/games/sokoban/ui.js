/**
 * Sokoban screen: level select plus the canvas board.
 *
 * The page keeps the full move string it actually played and hands that to the
 * service worker on a clear — the worker replays it before paying anything out,
 * so this file never touches a balance directly.
 */

import { MSG, send } from '../../common/messages.js';
import { sfx, setSoundEnabled } from '../../common/audio.js';
import { el, clear, stars, rewardModal, toast } from '../../app/ui.js';
import { starsFor } from '../../store/catalog.js';
import { initialState, isSolved, parseLevel, solve, step } from './engine.js';

const FREE_UNDOS = 5;
const HINT_MOVES = 3;
const ANIM_MS = 90;

export function mountSokoban(root, app) {
  let session = null;
  const teardowns = [];

  function cleanup() {
    for (const fn of teardowns.splice(0)) fn();
    session?.stop();
    session = null;
  }

  function showList() {
    cleanup();
    clear(root);
    renderList(root, app, (index) => showPlay(index));
  }

  function showPlay(index) {
    cleanup();
    clear(root);
    session = createSession(root, app, index, {
      onExit: showList,
      onNext: (next) => showPlay(next),
    });
  }

  showList();
  return cleanup;
}

/* -------------------------------------------------------------- level list */

function renderList(root, app, onPick) {
  const { profile } = app.state;
  const levels = app.state.levels;
  const records = profile.sokoban.levels;
  const solved = Object.values(records).filter((l) => l.solved).length;

  root.append(
    el('div', { class: 'spread' },
      el('div', null,
        el('h1', { text: 'Sokoban' }),
        el('p', { class: 'sub', text: 'Push every crate onto a marker. Nothing pulls — think before you shove.' })),
      el('div', { class: 'row' },
        el('span', { class: 'pill', text: `${solved}/${levels.length} cleared` }),
        el('span', { class: 'pill', text: `💡 ${profile.items.hint} hints` }),
        el('span', { class: 'pill', text: `↺ ${profile.items.undo} undos` }))),
  );

  const grid = el('div', { class: 'level-grid' });
  levels.forEach((level, index) => {
    const record = records[level.id];
    const locked = index + 1 > profile.sokoban.unlocked;
    grid.append(
      el(
        'button',
        {
          class: `level-tile ${record?.solved ? 'solved' : ''}`,
          disabled: locked,
          title: locked ? 'Clear the previous level to unlock' : `Par ${level.par} moves`,
          onclick: () => onPick(index),
        },
        el('div', null,
          el('div', { class: 'num', text: `Level ${index + 1}${locked ? ' 🔒' : ''}` }),
          el('div', { class: 'nm', text: level.name })),
        el('div', null,
          el('div', { class: 'stars', text: record?.solved ? stars(record.stars ?? 0) : '' }),
          el('div', { class: 'num', text: record?.bestMoves ? `best ${record.bestMoves} · par ${level.par}` : `par ${level.par}` })),
      ),
    );
  });

  root.append(grid);
}

/* ---------------------------------------------------------------- gameplay */

function createSession(root, app, index, { onExit, onNext }) {
  const meta = app.state.levels[index];
  const level = parseLevel(meta.rows);
  const profile = app.state.profile;
  setSoundEnabled(profile.settings.sound);

  let state = initialState(level);
  let path = '';
  const history = [];
  let undosUsed = 0;
  let animating = null;
  let finished = false;
  let raf = 0;

  const canvas = el('canvas', { id: 'board' });
  const ctx = canvas.getContext('2d');

  const statMoves = el('span', { text: '0' });
  const statPushes = el('span', { text: '0' });
  const statStars = el('span', { text: stars(3) });
  const undoBtn = el('button', { class: 'btn btn-sm', text: 'Undo', onclick: undo });
  const hintBtn = el('button', { class: 'btn btn-sm', text: '💡 Hint', onclick: hint });
  const skipBtn = el('button', { class: 'btn btn-sm', text: '⏭ Skip', onclick: skip });

  root.append(
    el('div', { class: 'spread' },
      el('div', null,
        el('h1', { text: `${index + 1}. ${meta.name}` }),
        el('p', { class: 'sub', text: `Par ${meta.par} moves · ${meta.pushes} pushes · arrow keys or WASD` })),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-sm btn-ghost', text: '← All levels', onclick: onExit }),
        el('button', { class: 'btn btn-sm', text: 'Restart', onclick: restart }))),
    el(
      'div',
      { class: 'play-shell' },
      el('div', { class: 'board-wrap' }, canvas),
      el(
        'div',
        { class: 'side' },
        el('div', { class: 'panel' },
          el('div', { class: 'stat-row' }, el('span', { text: 'Moves' }), statMoves),
          el('div', { class: 'stat-row' }, el('span', { text: 'Pushes' }), statPushes),
          el('div', { class: 'stat-row' }, el('span', { text: 'Rating' }), statStars)),
        el('div', { class: 'panel' },
          el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:8px', text: 'Assists' }),
          el('div', { class: 'btn-row' }, undoBtn, hintBtn, skipBtn)),
        el('div', { class: 'panel' },
          el('div', { class: 'muted', style: 'font-size:12px', html:
            `Free undos: <b>${profile.upgrades.includes('deepUndo') ? '∞' : FREE_UNDOS}</b><br>` +
            `Then 1 ↺ item each. A hint plays the next ${HINT_MOVES} optimal moves.` })),
      ),
    ),
  );

  function updateStats() {
    statMoves.textContent = String(path.length);
    statPushes.textContent = String([...path].filter((c) => c === c.toUpperCase()).length);
    statStars.textContent = stars(path.length ? starsFor(path.length, meta.par) : 3);

    const freeLeft = profile.upgrades.includes('deepUndo')
      ? Infinity
      : Math.max(0, FREE_UNDOS - undosUsed);
    undoBtn.textContent =
      freeLeft === Infinity
        ? 'Undo'
        : freeLeft > 0
          ? `Undo (${freeLeft})`
          : `Undo (↺ ${profile.items.undo})`;
    undoBtn.disabled = history.length === 0;
    hintBtn.textContent = `💡 Hint (${profile.items.hint})`;
    hintBtn.disabled = profile.items.hint <= 0 || finished;
    skipBtn.disabled = profile.items.skip <= 0 || finished;
    skipBtn.textContent = `⏭ Skip (${profile.items.skip})`;
  }

  /* --------------------------------------------------------------- drawing */

  function layout() {
    const wrap = canvas.parentElement;
    const available = Math.max(240, wrap.clientWidth - 28);
    const tile = Math.max(
      18,
      Math.min(74, Math.floor(available / level.width), Math.floor(560 / level.height)),
    );
    const dpr = window.devicePixelRatio || 1;
    canvas.width = level.width * tile * dpr;
    canvas.height = level.height * tile * dpr;
    canvas.style.width = `${level.width * tile}px`;
    canvas.style.height = `${level.height * tile}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return tile;
  }

  function palette() {
    const css = getComputedStyle(document.documentElement);
    const read = (name) => css.getPropertyValue(name).trim();
    return {
      floor: read('--floor'),
      floorAlt: read('--floor-alt'),
      wall: read('--wall'),
      goal: read('--goal'),
      crate: read('--crate'),
      crateDone: read('--crate-done'),
      player: read('--player'),
      bg: read('--bg-deep'),
      text: read('--text'),
    };
  }

  function draw() {
    const tile = layout();
    const colors = palette();
    const w = level.width;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const px = x * tile;
        const py = y * tile;

        if (level.walls.has(i)) {
          ctx.fillStyle = colors.wall;
          roundRect(ctx, px + 1, py + 1, tile - 2, tile - 2, tile * 0.16);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.06)';
          roundRect(ctx, px + 1, py + 1, tile - 2, (tile - 2) * 0.42, tile * 0.16);
          ctx.fill();
          continue;
        }

        ctx.fillStyle = (x + y) % 2 ? colors.floorAlt : colors.floor;
        ctx.fillRect(px, py, tile, tile);

        if (level.goals.has(i)) {
          ctx.fillStyle = colors.goal;
          ctx.beginPath();
          ctx.arc(px + tile / 2, py + tile / 2, tile * 0.19, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.25)';
          ctx.lineWidth = Math.max(1, tile * 0.04);
          ctx.stroke();
        }
      }
    }

    // Boxes, with the animating one interpolated between its two squares.
    for (const box of state.boxes) {
      let px = (box % w) * tile;
      let py = Math.floor(box / w) * tile;
      if (animating?.boxTo === box) {
        const from = animating.boxFrom;
        px = lerp((from % w) * tile, px, animating.t);
        py = lerp(Math.floor(from / w) * tile, py, animating.t);
      }
      drawCrate(ctx, px, py, tile, level.goals.has(box) ? colors.crateDone : colors.crate);
    }

    let px = (state.player % w) * tile;
    let py = Math.floor(state.player / w) * tile;
    if (animating) {
      px = lerp((animating.from % w) * tile, px, animating.t);
      py = lerp(Math.floor(animating.from / w) * tile, py, animating.t);
    }
    drawPlayer(ctx, px, py, tile, colors.player);
  }

  function tick() {
    if (animating) {
      animating.t = Math.min(1, (performance.now() - animating.start) / ANIM_MS);
      if (animating.t >= 1) animating = null;
      draw();
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  }

  function startAnim(result) {
    if (profile.settings.reducedMotion) {
      draw();
      return;
    }
    animating = { ...result, t: 0, start: performance.now() };
    if (!raf) raf = requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------- input */

  const KEYS = {
    ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
    w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R',
  };

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'z' || event.key === 'Z') {
      event.preventDefault();
      undo();
      return;
    }
    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      restart();
      return;
    }
    const dir = KEYS[event.key];
    if (!dir) return;
    event.preventDefault();
    move(dir);
  }

  function move(dir) {
    if (finished) return;
    const result = step(level, state, dir);
    if (!result) {
      sfx.deny();
      return;
    }

    history.push({ state, path });
    state = result.state;
    path += result.pushed ? dir : dir.toLowerCase();

    if (result.pushed) {
      level.goals.has(result.boxTo) ? sfx.place() : sfx.push();
    } else {
      sfx.step();
    }

    startAnim(result);
    updateStats();

    if (isSolved(level, state)) finish();
  }

  async function undo() {
    if (!history.length || finished) return;

    if (!profile.upgrades.includes('deepUndo') && undosUsed >= FREE_UNDOS) {
      if (profile.items.undo <= 0) {
        sfx.deny();
        toast('Out of undos', 'Buy an Undo Pack in the store, or restart the level.', 'bad');
        return;
      }
      try {
        await send(MSG.USE_ITEM, { item: 'undo' });
        profile.items.undo--;
      } catch {
        sfx.deny();
        return;
      }
    }

    undosUsed++;
    const previous = history.pop();
    state = previous.state;
    path = previous.path;
    sfx.undo();
    draw();
    updateStats();
  }

  function restart() {
    if (finished) return;
    state = initialState(level);
    path = '';
    history.length = 0;
    animating = null;
    draw();
    updateStats();
  }

  async function hint() {
    if (profile.items.hint <= 0 || finished) return;

    // Solve from wherever the player has got to, so a hint stays useful even
    // after they have wandered off the optimal line.
    const solution = solve({ ...level, player: state.player, boxes: state.boxes }, {
      maxStates: 400_000,
    });
    if (!solution || !solution.moves.length) {
      toast('No hint available', 'This position looks unsolvable — try undo or restart.', 'bad');
      return;
    }

    try {
      await send(MSG.USE_ITEM, { item: 'hint' });
      profile.items.hint--;
    } catch {
      return;
    }

    updateStats();
    const moves = solution.moves.slice(0, HINT_MOVES);
    let i = 0;
    const play = () => {
      if (i >= moves.length || finished) return;
      move(moves[i].toUpperCase());
      i++;
      setTimeout(play, 180);
    };
    play();
  }

  async function skip() {
    if (profile.items.skip <= 0 || finished) return;
    if (!confirm('Spend a Level Skip? The level is banked as cleared, with no stars.')) return;
    try {
      await send(MSG.SOKOBAN_SKIP, { levelId: meta.id });
      finished = true;
      await app.refresh();
      toast('Level skipped', 'Banked without stars.');
      onNext(Math.min(index + 1, app.state.levels.length - 1));
    } catch (err) {
      toast('Could not skip', err.code ?? 'error', 'bad');
    }
  }

  async function finish() {
    finished = true;
    sfx.win();

    let result;
    try {
      result = await send(MSG.SOKOBAN_COMPLETE, { levelId: meta.id, moves: path });
    } catch (err) {
      toast('Not credited', err.code === 'invalid_claim' ? 'Solution failed verification.' : err.code, 'bad');
      return;
    }

    await app.refresh();
    if (result.coins) sfx.coin();

    const isLast = index >= app.state.levels.length - 1;
    rewardModal({
      title: result.first ? 'Level cleared!' : 'Cleared again',
      subtitle: `${path.length} moves against a par of ${meta.par}${
        result.throttled ? ' · payout cooling down' : ''
      }`,
      coins: result.coins,
      gems: result.gems,
      stars: result.stars,
      actions: [
        !isLast && { label: 'Next level', primary: true, onClick: () => onNext(index + 1) },
        { label: 'Level list', onClick: onExit },
      ].filter(Boolean),
    });

    for (const achievement of result.achievements ?? []) {
      toast(`Achievement: ${achievement.name}`, `💎 +${achievement.gems}`, 'good');
    }
  }

  /* -------------------------------------------------------------- lifecycle */

  window.addEventListener('keydown', onKey);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  // Touch / trackpad swipes, so the arcade works on a touchscreen laptop.
  let touchStart = null;
  canvas.addEventListener('pointerdown', (event) => {
    touchStart = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!touchStart) return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
  });

  draw();
  updateStats();

  return {
    stop() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

/* ----------------------------------------------------------------- drawing */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCrate(ctx, x, y, tile, color) {
  const pad = tile * 0.11;
  const size = tile - pad * 2;

  ctx.fillStyle = 'rgba(0,0,0,.28)';
  roundRect(ctx, x + pad + 1.5, y + pad + 2.5, size, size, tile * 0.16);
  ctx.fill();

  ctx.fillStyle = color;
  roundRect(ctx, x + pad, y + pad, size, size, tile * 0.16);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = Math.max(1, tile * 0.045);
  ctx.beginPath();
  ctx.moveTo(x + pad, y + pad);
  ctx.lineTo(x + pad + size, y + pad + size);
  ctx.moveTo(x + pad + size, y + pad);
  ctx.lineTo(x + pad, y + pad + size);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  roundRect(ctx, x + pad, y + pad, size, size, tile * 0.16);
  ctx.stroke();
}

function drawPlayer(ctx, x, y, tile, color) {
  const cx = x + tile / 2;
  const cy = y + tile / 2;

  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.ellipse(cx, y + tile * 0.84, tile * 0.26, tile * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy - tile * 0.06, tile * 0.24, 0, Math.PI * 2);
  ctx.fill();

  roundRect(ctx, cx - tile * 0.19, cy + tile * 0.08, tile * 0.38, tile * 0.3, tile * 0.1);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.beginPath();
  ctx.arc(cx - tile * 0.08, cy - tile * 0.09, tile * 0.035, 0, Math.PI * 2);
  ctx.arc(cx + tile * 0.08, cy - tile * 0.09, tile * 0.035, 0, Math.PI * 2);
  ctx.fill();
}
