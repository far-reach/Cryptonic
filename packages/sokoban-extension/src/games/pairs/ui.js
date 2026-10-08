/**
 * Pairs screen — flip two, keep the matches.
 *
 * Mismatched cards stay up for a beat before turning back, which is timing the
 * engine deliberately does not model: a third flip resolves the previous pair,
 * so the replay the worker verifies never depends on how long the reveal ran.
 */

import { MSG, send } from '../../common/messages.js';
import { sfx, setSoundEnabled } from '../../common/audio.js';
import { clear, el, rewardModal, toast } from '../../app/ui.js';
import { cardNode } from '../cards/render.js';
import { randomSeed } from '../cards/deck.js';
import { BOARDS, flip, isWon, newGame, settle } from './engine.js';

const REVEAL_MS = 850;

export function mountPairs(root, app) {
  const profile = app.state.profile;
  setSoundEnabled(profile.settings.sound);

  let boardId = 'classic';
  let game = newGame(randomSeed(), boardId);
  let flips = [];
  let submitted = false;
  let timer = 0;
  /** Tiles whose face changed since the last paint — only those animate. */
  const turning = new Set();

  const grid = el('div', { class: 'pairs-grid' });
  const statPairs = el('span', { text: '0' });
  const statMistakes = el('span', { text: '0' });
  const statCombo = el('span', { text: '0' });
  const note = el('div', { class: 'round-note' });

  const sizePicker = el(
    'div',
    { class: 'seg' },
    ...Object.values(BOARDS).map((board) =>
      el('button', {
        text: board.name,
        'aria-pressed': board.id === boardId,
        onclick: () => {
          if (board.id === boardId) return;
          boardId = board.id;
          newRound();
        },
      }),
    ),
  );

  root.append(
    el('div', { class: 'spread' },
      el('div', null,
        el('h1', { text: 'Pairs' }),
        el('p', { class: 'sub', text: 'Matching rank and colour makes a pair. Consecutive hits build a combo, and a clean board pays a perfect bonus.' })),
      el('div', { class: 'row' },
        sizePicker,
        el('button', { class: 'btn btn-sm btn-primary', text: 'New board', onclick: newRound }))),
    el(
      'div',
      { class: 'play-shell' },
      el('div', null, el('div', { class: 'felt' }, grid), note),
      el(
        'div',
        { class: 'side' },
        el('div', { class: 'panel' },
          el('div', { class: 'stat-row' }, el('span', { text: 'Pairs found' }), statPairs),
          el('div', { class: 'stat-row' }, el('span', { text: 'Mistakes' }), statMistakes),
          el('div', { class: 'stat-row' }, el('span', { text: 'Best combo' }), statCombo)),
        el('div', { class: 'panel' },
          el('div', { class: 'side-title', text: 'Payout' }),
          el('div', { class: 'muted tiny', html:
            'Base scales with board size, <b>+5</b> per combo link, <b>+45</b> for a flawless clear, ' +
            '<b>−2</b> per mistake. The worker recounts both from your flips, so the numbers here are only a preview.' })),
      ),
    ),
  );

  function newRound() {
    clearTimeout(timer);
    game = newGame(randomSeed(), boardId);
    flips = [];
    submitted = false;
    note.textContent = '';
    for (const button of sizePicker.children) {
      button.setAttribute('aria-pressed', button.textContent === BOARDS[boardId].name);
    }
    render();
  }

  function onFlip(index) {
    if (submitted) return;

    // Resolve a hanging mismatch immediately if the player is quick.
    if (game.pending.length >= 2) {
      clearTimeout(timer);
      game = settle(game);
    }

    const next = flip(game, index);
    if (!next) {
      sfx.deny();
      return;
    }

    game = next;
    flips.push(index);
    turning.add(index);

    if (game.lastResult === 'match') {
      sfx.place();
      note.innerHTML =
        game.combo > 1
          ? `Match — <span class="combo-flare">combo ×${game.combo}</span>`
          : 'Match';
    } else if (game.lastResult === 'miss') {
      sfx.deny();
      note.textContent = 'Not a pair';
      // The pair stays up until it is turned back — or until the player flips
      // again, which the engine settles for us. No forced wait either way.
      const facing = game.pending.slice();
      timer = setTimeout(() => {
        game = settle(game);
        for (const i of facing) turning.add(i);
        render();
      }, REVEAL_MS);
    } else {
      sfx.card();
      note.textContent = '';
    }

    render();
    if (isWon(game)) finish();
  }

  async function finish() {
    if (submitted) return;
    submitted = true;
    sfx.win();

    let result;
    try {
      result = await send(MSG.PAIRS_RESULT, { seed: game.seed, board: game.board, flips });
    } catch (err) {
      toast('Not credited', err.code === 'invalid_claim' ? 'Result failed verification.' : err.code, 'bad');
      return;
    }

    await app.refresh();
    if (result.coins) sfx.coin();

    rewardModal({
      title: result.perfect ? 'Perfect board' : 'Board cleared',
      subtitle: `${flips.length} flips · ${result.mistakes} mistakes · best combo ×${result.bestCombo}`,
      coins: result.coins,
      actions: [{ label: 'New board', primary: true, onClick: newRound }],
    });

    for (const achievement of result.achievements ?? []) {
      toast(`Achievement: ${achievement.name}`, `💎 +${achievement.gems}`, 'good');
    }
  }

  function render() {
    clear(grid);
    grid.style.gridTemplateColumns = `repeat(${game.cols}, auto)`;

    game.tiles.forEach((tile, index) => {
      const faceUp = game.matched.has(index) || game.pending.includes(index);
      const matched = game.matched.has(index);

      const button = el('button', {
        class: `pairs-tile ${matched ? 'done' : ''}`,
        onclick: () => onFlip(index),
      });

      // One card at a time, swapped with a squash animation — a 3D flip gets
      // flattened here because the card face itself clips its overflow.
      const card = faceUp ? cardNode({ card: tile.card }) : cardNode({ back: true });
      card.disabled = true;
      card.classList.add('face');
      if (turning.has(index)) card.classList.add('turning');
      grid.append(button);
      button.append(card);
    });

    turning.clear();

    statPairs.textContent = `${game.matched.size / 2}/${game.tiles.length / 2}`;
    statMistakes.textContent = String(game.mistakes);
    statCombo.textContent = `×${game.bestCombo}`;
  }

  render();

  return () => clearTimeout(timer);
}
