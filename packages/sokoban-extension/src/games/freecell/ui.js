/**
 * FreeCell screen. Same interaction grammar as Klondike — click to lift,
 * click to drop, double-click to send it wherever it wants to go — plus the
 * safe-autoplay sweep after every move, which is what makes the endgame quick.
 */

import { MSG, send } from '../../common/messages.js';
import { sfx, setSoundEnabled } from '../../common/audio.js';
import { clear, el, rewardModal, toast } from '../../app/ui.js';
import { SUIT_GLYPH, SUITS, randomSeed } from '../cards/deck.js';
import { cardNode, slotNode } from '../cards/render.js';
import {
  CELL_COUNT,
  COLUMN_COUNT,
  apply,
  autoMoveFor,
  autoplayMoves,
  foundationCount,
  freeCells,
  hasMoves,
  isWon,
  legalMove,
  maxMove,
  newGame,
  runLength,
} from './engine.js';

export function mountFreecell(root, app) {
  const profile = app.state.profile;
  setSoundEnabled(profile.settings.sound);

  let game = newGame(randomSeed());
  let moves = [];
  let history = [];
  let usedUndo = false;
  let selection = null;
  let banked = false;

  const board = el('div', { class: 'felt' });
  const statMoves = el('span', { text: '0' });
  const statFree = el('span', { text: `${CELL_COUNT}` });
  const statHome = el('span', { text: '0/52' });
  const statRun = el('span', { text: '1' });
  const undoBtn = el('button', { class: 'btn btn-sm', text: 'Undo', onclick: undo });
  const bankBtn = el('button', { class: 'btn btn-sm', text: 'Bank & redeal', onclick: () => bank(false) });

  root.append(
    el('div', { class: 'spread' },
      el('div', null,
        el('h1', { text: 'FreeCell' }),
        el('p', { class: 'sub', text: 'Every card is face up, so nothing is hidden and nothing is luck. Win pays 90 coins — 130 without an undo.' })),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-sm btn-primary', text: 'New deal', onclick: () => newDeal(true) }))),
    el(
      'div',
      { class: 'play-shell' },
      board,
      el(
        'div',
        { class: 'side' },
        el('div', { class: 'panel' },
          el('div', { class: 'stat-row' }, el('span', { text: 'Moves' }), statMoves),
          el('div', { class: 'stat-row' }, el('span', { text: 'Free cells' }), statFree),
          el('div', { class: 'stat-row' }, el('span', { text: 'Max run move' }), statRun),
          el('div', { class: 'stat-row' }, el('span', { text: 'Home' }), statHome)),
        el('div', { class: 'panel' },
          el('div', { class: 'side-title', text: 'Actions' }),
          el('div', { class: 'btn-row' }, undoBtn, bankBtn)),
        el('div', { class: 'panel' },
          el('div', { class: 'side-title', text: 'How runs move' }),
          el('div', { class: 'muted tiny', html:
            'A run of <b>(free cells + 1)</b>, doubled for every empty column, moves as one — the game stages it through the gaps for you. ' +
            'That is why an empty column is worth more than a free cell.' })),
      ),
    ),
  );

  function newDeal(fresh) {
    if (fresh && !banked && foundationCount(game) > 0 && !isWon(game)) {
      bank(false, true);
      return;
    }
    game = newGame(randomSeed());
    moves = [];
    history = [];
    usedUndo = false;
    selection = null;
    banked = false;
    render();
  }

  function push(move) {
    const next = apply(game, move);
    if (!next) return false;
    history.push(game);
    game = next;
    moves.push(move);
    return true;
  }

  function doMove(move) {
    if (!push(move)) {
      sfx.deny();
      return false;
    }
    selection = null;
    sfx.card();

    // Sweep any card that can never be needed again onto the foundations.
    for (const auto of autoplayMoves(game)) push(auto);

    render();
    if (isWon(game)) win();
    return true;
  }

  function undo() {
    if (!history.length || banked) return;
    // One undo steps back over the autoplay sweep as well as the move itself.
    const target = Math.max(0, history.length - 1);
    game = history[target];
    history.length = target;
    moves.length = target;
    usedUndo = true;
    selection = null;
    sfx.undo();
    render();
  }

  async function win() {
    if (banked) return;
    banked = true;
    sfx.win();
    await submit(true);
  }

  async function bank(silent, thenRedeal = false) {
    if (banked) {
      if (thenRedeal) newDeal(false);
      return;
    }
    banked = true;
    await submit(false, silent);
    if (thenRedeal) newDeal(false);
  }

  async function submit(won, silent = false) {
    let result;
    try {
      result = await send(MSG.FREECELL_RESULT, { seed: game.seed, moves, won, usedUndo });
    } catch (err) {
      if (err.code !== 'too_soon') {
        toast('Not credited', err.code === 'invalid_claim' ? 'Result failed verification.' : err.code, 'bad');
      }
      return;
    }

    await app.refresh();
    if (result.coins) sfx.coin();

    if (won) {
      rewardModal({
        title: 'Deal solved',
        subtitle: usedUndo ? `${moves.length} moves` : `${moves.length} moves, no undo — bonus paid`,
        coins: result.coins,
        actions: [{ label: 'Deal again', primary: true, onClick: () => newDeal(false) }],
      });
    } else if (!silent && result.coins) {
      toast('Progress banked', `🪙 +${result.coins} for ${result.foundation} cards`, 'good');
    }

    for (const achievement of result.achievements ?? []) {
      toast(`Achievement: ${achievement.name}`, `💎 +${achievement.gems}`, 'good');
    }
  }

  /* ---------------------------------------------------------------- render */

  function render() {
    clear(board);

    const top = el('div', { class: 'fc-top' });

    const cells = el('div', null, el('div', { class: 'fc-label', text: 'Free cells' }), el('div', { class: 'fc-group' }));
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const card = game.cells[cell];
      const node = card
        ? cardNode({
            card,
            selected: selection?.zone === 'cell' && selection.cell === cell,
            onclick: () => pick({ zone: 'cell', cell }),
            ondblclick: () => auto({ zone: 'cell', cell }),
          })
        : slotNode({
            highlight: Boolean(selection) && wouldAccept({ type: 'cell', cell }),
            onclick: () => drop({ type: 'cell', cell }),
          });
      cells.lastChild.append(node);
    }
    top.append(cells);
    top.append(el('div', { class: 'sol-spacer' }));

    const homes = el('div', null, el('div', { class: 'fc-label', text: 'Foundations' }), el('div', { class: 'fc-group' }));
    for (const suit of SUITS) {
      const pile = game.foundations[suit];
      const card = pile[pile.length - 1];
      const node = card
        ? cardNode({ card, onclick: () => drop({ type: 'foundation', suit }) })
        : slotNode({ label: SUIT_GLYPH[suit], onclick: () => drop({ type: 'foundation', suit }) });
      if (selection && wouldAccept({ type: 'foundation', suit })) node.classList.add('drop');
      homes.lastChild.append(node);
    }
    top.append(homes);
    board.append(top);

    const columns = el('div', { class: 'fc-columns' });
    game.columns.forEach((column, index) => {
      const node = el('div', {
        class: 'fc-column',
        onclick: (event) => {
          if (event.target === event.currentTarget) drop({ type: 'column', to: index });
        },
      });
      node.style.minHeight = `${Math.max(130, 26 * column.length + 100)}px`;

      if (!column.length) {
        node.append(slotNode({ onclick: () => drop({ type: 'column', to: index }) }));
      }

      const movable = column.length - runLength(column);
      column.forEach((card, cardIndex) => {
        const selected =
          selection?.zone === 'column' && selection.column === index && cardIndex >= selection.index;
        node.append(
          cardNode({
            card,
            selected,
            dimmed: cardIndex < movable && cardIndex === column.length - 1,
            style: `top:${cardIndex * 26}px`,
            onclick: () => pick({ zone: 'column', column: index, index: cardIndex }),
            ondblclick: () => auto({ zone: 'column', column: index, index: cardIndex }),
          }),
        );
      });

      if (selection && wouldAccept({ type: 'column', to: index })) node.classList.add('drop');
      columns.append(node);
    });
    board.append(columns);

    statMoves.textContent = String(moves.length);
    statFree.textContent = String(freeCells(game));
    statHome.textContent = `${foundationCount(game)}/52`;
    statRun.textContent = String(maxMove(game));
    undoBtn.disabled = !history.length || banked;
    bankBtn.disabled = banked || foundationCount(game) === 0;

    if (!hasMoves(game) && !isWon(game) && !banked) {
      board.append(el('div', { class: 'empty', text: 'Dead end — bank what you have and take a fresh deal.' }));
    }
  }

  function pick(source) {
    if (banked) return;
    if (
      selection &&
      selection.zone === source.zone &&
      selection.column === source.column &&
      selection.cell === source.cell &&
      selection.index === source.index
    ) {
      selection = null;
    } else if (selection && source.zone === 'column' && tryDrop({ type: 'column', to: source.column })) {
      return;
    } else if (selection && source.zone === 'cell' && tryDrop({ type: 'cell', cell: source.cell })) {
      return;
    } else {
      selection = source;
    }
    render();
  }

  function auto(source) {
    const move = autoMoveFor(game, source);
    if (move) doMove(move);
    else sfx.deny();
  }

  function moveFor(target) {
    if (!selection) return null;

    if (selection.zone === 'cell') {
      if (target.type === 'foundation') return { type: 'cell-to-foundation', cell: selection.cell };
      if (target.type === 'column') return { type: 'cell-to-column', cell: selection.cell, to: target.to };
      return null;
    }

    const column = game.columns[selection.column];
    const count = column.length - selection.index;

    if (target.type === 'foundation') {
      return count === 1 ? { type: 'column-to-foundation', from: selection.column } : null;
    }
    if (target.type === 'cell') {
      return count === 1 ? { type: 'column-to-cell', from: selection.column, cell: target.cell } : null;
    }
    return { type: 'column-to-column', from: selection.column, to: target.to, count };
  }

  function wouldAccept(target) {
    const move = moveFor(target);
    return move ? legalMove(game, move) : false;
  }

  function tryDrop(target) {
    const move = moveFor(target);
    if (move && legalMove(game, move)) return doMove(move);
    return false;
  }

  function drop(target) {
    if (!selection) return;
    if (!tryDrop(target)) {
      sfx.deny();
      selection = null;
      render();
    }
  }

  render();

  return () => {
    if (!banked && foundationCount(game) > 0 && !isWon(game)) bank(true);
  };
}
