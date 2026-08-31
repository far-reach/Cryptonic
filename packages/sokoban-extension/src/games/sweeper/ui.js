/**
 * Sweeper screen. Left click reveals, right click flags, and clicking a
 * satisfied number chords its neighbours. Losing still banks partial credit
 * for the squares that were safely uncovered, so a bad guess late in a big
 * field is not a total write-off.
 */

import { MSG, send } from '../../common/messages.js';
import { sfx, setSoundEnabled } from '../../common/audio.js';
import { clear, el, rewardModal, toast } from '../../app/ui.js';
import { randomSeed } from '../cards/deck.js';
import { DIFFICULTIES, adjacentMines, apply, newGame, progress } from './engine.js';

export function mountSweeper(root, app) {
  const profile = app.state.profile;
  setSoundEnabled(profile.settings.sound);

  let difficulty = 'calm';
  let game = newGame(randomSeed(), difficulty);
  let actions = [];
  let submitted = false;
  let startedAt = 0;
  let clock = 0;

  const grid = el('div', { class: 'mine-grid' });
  const statMines = el('span', { text: '0' });
  const statOpen = el('span', { text: '0' });
  const statTime = el('span', { text: '0:00' });
  const status = el('div', { class: 'round-note' });

  const picker = el(
    'div',
    { class: 'seg' },
    ...Object.values(DIFFICULTIES).map((level) =>
      el('button', {
        text: level.name,
        'aria-pressed': level.id === difficulty,
        onclick: () => {
          if (level.id === difficulty) return;
          difficulty = level.id;
          newField();
        },
      }),
    ),
  );

  root.append(
    el('div', { class: 'spread' },
      el('div', null,
        el('h1', { text: 'Sweeper' }),
        el('p', { class: 'sub', text: 'The first square you open is always safe — mines are laid around it. Right-click to flag, click a satisfied number to chord.' })),
      el('div', { class: 'row' },
        picker,
        el('button', { class: 'btn btn-sm btn-primary', text: 'New field', onclick: newField }))),
    el(
      'div',
      { class: 'play-shell' },
      el('div', null, el('div', { class: 'board-wrap' }, grid), status),
      el(
        'div',
        { class: 'side' },
        el('div', { class: 'panel' },
          el('div', { class: 'stat-row' }, el('span', { text: 'Mines left' }), statMines),
          el('div', { class: 'stat-row' }, el('span', { text: 'Uncovered' }), statOpen),
          el('div', { class: 'stat-row' }, el('span', { text: 'Time' }), statTime)),
        el('div', { class: 'panel' },
          el('div', { class: 'side-title', text: 'Payout' }),
          el('div', { class: 'muted tiny', html:
            'Calm <b>60</b> · Brisk <b>120</b> · Fierce <b>220</b> coins, and a Fierce clear also pays <b>2 💎</b>. ' +
            'Hitting a mine still pays up to 45 coins scaled by how much you had uncovered.' })),
      ),
    ),
  );

  function newField() {
    stopClock();
    game = newGame(randomSeed(), difficulty);
    actions = [];
    submitted = false;
    startedAt = 0;
    status.textContent = '';
    for (const button of picker.children) {
      button.setAttribute('aria-pressed', button.textContent === DIFFICULTIES[difficulty].name);
    }
    render();
  }

  function startClock() {
    if (startedAt) return;
    startedAt = Date.now();
    clock = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      statTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }, 500);
  }

  function stopClock() {
    clearInterval(clock);
    clock = 0;
  }

  function act(action) {
    if (game.over || submitted) return;
    const next = apply(game, action);
    if (!next) {
      sfx.deny();
      return;
    }
    startClock();
    game = next;
    actions.push(action);

    if (action.type === 'flag') sfx.card();
    else if (game.over && !game.won) sfx.lose();
    else sfx.step();

    render();
    if (game.over) finish();
  }

  async function finish() {
    if (submitted) return;
    submitted = true;
    stopClock();

    if (game.won) sfx.win();
    status.textContent = game.won ? 'Field cleared.' : 'Mine hit — banking what you uncovered.';

    let result;
    try {
      result = await send(MSG.SWEEPER_RESULT, {
        seed: game.seed,
        difficulty: game.difficulty,
        actions,
        won: game.won,
      });
    } catch (err) {
      if (err.code !== 'too_soon') {
        toast('Not credited', err.code === 'invalid_claim' ? 'Result failed verification.' : err.code, 'bad');
      }
      return;
    }

    await app.refresh();
    if (result.coins) sfx.coin();

    rewardModal({
      title: game.won ? 'Field cleared' : 'Boom',
      subtitle: game.won
        ? `${DIFFICULTIES[difficulty].name} · ${statTime.textContent}`
        : `${Math.round(progress(game) * 100)}% uncovered`,
      coins: result.coins,
      gems: result.gems,
      actions: [{ label: 'New field', primary: true, onClick: newField }],
    });

    for (const achievement of result.achievements ?? []) {
      toast(`Achievement: ${achievement.name}`, `💎 +${achievement.gems}`, 'good');
    }
  }

  function render() {
    clear(grid);
    grid.style.gridTemplateColumns = `repeat(${game.cols}, 32px)`;

    for (let index = 0; index < game.size; index++) {
      const open = game.revealed.has(index);
      const flagged = game.flags.has(index);
      const isMine = game.mines?.has(index) ?? false;
      const count = open && !isMine ? adjacentMines(game, index) : 0;

      const cell = el('button', {
        class: [
          'cell',
          open ? 'open' : '',
          flagged && !open ? 'flag' : '',
          game.over && isMine && !game.won ? 'mine' : '',
          index === game.hitMine ? 'boom' : '',
        ].filter(Boolean).join(' '),
        onclick: () => (open ? act({ type: 'chord', index }) : act({ type: 'reveal', index })),
        oncontextmenu: (event) => {
          event.preventDefault();
          act({ type: 'flag', index });
        },
      });

      if (flagged && !open) cell.textContent = '⚑';
      else if (game.over && isMine && !game.won) cell.textContent = '✳';
      else if (open && count) {
        cell.textContent = String(count);
        cell.dataset.n = String(count);
      }

      grid.append(cell);
    }

    statMines.textContent = String(Math.max(0, game.mineCount - game.flags.size));
    statOpen.textContent = `${game.revealed.size}/${game.size - game.mineCount}`;
  }

  render();

  return () => stopClock();
}
