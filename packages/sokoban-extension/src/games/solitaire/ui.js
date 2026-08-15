/**
 * Klondike screen.
 *
 * Selection model: click a card to pick it up, click a pile to drop it,
 * double-click to send it wherever it legally wants to go. Every accepted move
 * is appended to `moves`, which is what the service worker replays when the
 * deal is banked.
 */

import { MSG, send } from '../../common/messages.js';
import { sfx, setSoundEnabled } from '../../common/audio.js';
import { clear, el, rewardModal, toast } from '../../app/ui.js';
import { RANK_LABEL, SUITS, SUIT_GLYPH, isRed, randomSeed } from '../cards/deck.js';
import {
  apply,
  autoCompleteMoves,
  autoMoveFor,
  canAutoComplete,
  foundationCount,
  hasMoves,
  isWon,
  legalMove,
  newGame,
} from './engine.js';

export function mountSolitaire(root, app) {
  const profile = app.state.profile;
  setSoundEnabled(profile.settings.sound);

  let drawMode = profile.settings.drawThree ? 3 : 1;
  let game = newGame(randomSeed(), drawMode);
  let moves = [];
  let history = [];
  let usedUndo = false;
  let selection = null;
  let banked = false;

  const board = el('div', { class: 'felt' });
  const statMoves = el('span', { text: '0' });
  const statFound = el('span', { text: '0/52' });
  const statStock = el('span', { text: '0' });
  const undoBtn = el('button', { class: 'btn btn-sm', text: 'Undo', onclick: undo });
  const finishBtn = el('button', { class: 'btn btn-sm', text: '⚡ Finish', onclick: autoComplete });
  const bankBtn = el('button', { class: 'btn btn-sm', text: 'Bank & redeal', onclick: () => bank(false) });

  root.append(
    el('div', { class: 'spread' },
      el('div', null,
        el('h1', { text: 'Klondike Solitaire' }),
        el('p', { class: 'sub', text: 'Build the four foundations from ace to king. Win for 60 coins — 85 if you never undo.' })),
      el('div', { class: 'row' },
        el('button', {
          class: 'btn btn-sm',
          text: `Draw ${drawMode}`,
          onclick: (event) => toggleDraw(event.target),
        }),
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
          el('div', { class: 'stat-row' }, el('span', { text: 'Foundations' }), statFound),
          el('div', { class: 'stat-row' }, el('span', { text: 'Stock left' }), statStock)),
        el('div', { class: 'panel' },
          el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:8px', text: 'Actions' }),
          el('div', { class: 'btn-row' }, undoBtn, finishBtn, bankBtn)),
        el('div', { class: 'panel' },
          el('div', { class: 'muted', style: 'font-size:12px', html:
            'Abandoning a deal still pays <b>2 coins</b> per card on the foundations. ' +
            'Undo is free with the Deep Undo upgrade — otherwise it just costs you the no-undo bonus.' })),
      ),
    ),
  );

  function toggleDraw(button) {
    drawMode = drawMode === 1 ? 3 : 1;
    button.textContent = `Draw ${drawMode}`;
    send(MSG.SET_SETTING, { key: 'drawThree', value: drawMode === 3 }).catch(() => {});
    newDeal(true);
  }

  function newDeal(fresh) {
    if (fresh && !banked && foundationCount(game) > 0 && !isWon(game)) {
      bank(false, true);
      return;
    }
    game = newGame(randomSeed(), drawMode);
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

  function doMove(move, quiet = false) {
    if (!push(move)) {
      if (!quiet) sfx.deny();
      return false;
    }
    selection = null;
    sfx.card();
    render();
    if (isWon(game)) win();
    return true;
  }

  function undo() {
    if (!history.length || banked) return;
    game = history.pop();
    moves.pop();
    usedUndo = true;
    selection = null;
    sfx.undo();
    render();
  }

  function autoComplete() {
    const plan = autoCompleteMoves(game);
    if (!plan.length) {
      sfx.deny();
      return;
    }
    let i = 0;
    const play = () => {
      if (i >= plan.length) {
        if (isWon(game)) win();
        return;
      }
      push(plan[i]);
      i++;
      sfx.card();
      render();
      setTimeout(play, 55);
    };
    play();
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
      result = await send(MSG.SOLITAIRE_RESULT, {
        seed: game.seed,
        drawMode: game.drawMode,
        moves,
        won,
        usedUndo,
      });
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

    const top = el('div', { class: 'sol-top' });

    // Stock
    const stock = game.stock.length
      ? cardNode({ back: true, onclick: () => doMove({ type: 'draw' }) })
      : el('button', {
          class: 'slot',
          text: game.waste.length ? '↻' : '',
          onclick: () => doMove({ type: 'recycle' }),
        });
    top.append(stock);

    // Waste — show up to three, the top one selectable.
    const wasteWrap = el('div', { class: 'pile-stack', style: 'width:110px' });
    const visible = game.waste.slice(-3);
    if (!visible.length) wasteWrap.append(el('div', { class: 'slot' }));
    visible.forEach((card, i) => {
      const isTop = i === visible.length - 1;
      wasteWrap.append(
        cardNode({
          card,
          style: `position:absolute;left:${i * 16}px`,
          selected: isTop && selection?.zone === 'waste',
          onclick: () => isTop && pick({ zone: 'waste' }),
          ondblclick: () => isTop && auto({ zone: 'waste' }),
        }),
      );
    });
    top.append(wasteWrap);
    top.append(el('div', { class: 'sol-spacer' }));

    for (const suit of SUITS) {
      const pile = game.foundations[suit];
      const card = pile[pile.length - 1];
      const target = card
        ? cardNode({ card, onclick: () => drop({ type: 'foundation', suit }) })
        : el('button', {
            class: 'slot',
            text: SUIT_GLYPH[suit],
            onclick: () => drop({ type: 'foundation', suit }),
          });
      if (selection && wouldAccept({ type: 'foundation', suit })) target.classList.add('drop');
      top.append(target);
    }

    board.append(top);

    const tableau = el('div', { class: 'tableau' });
    game.tableau.forEach((pile, index) => {
      const column = el('div', {
        class: 'tab-pile',
        onclick: (event) => {
          if (event.target === event.currentTarget) drop({ type: 'tableau', to: index });
        },
      });
      column.style.minHeight = `${Math.max(112, 24 * pile.length + 90)}px`;

      if (!pile.length) {
        column.append(
          el('button', { class: 'slot', text: 'K', onclick: () => drop({ type: 'tableau', to: index }) }),
        );
      }

      pile.forEach((entry, cardIndex) => {
        const offset = pile.slice(0, cardIndex).reduce((sum, e) => sum + (e.faceUp ? 24 : 12), 0);
        const selected =
          selection?.zone === 'tableau' &&
          selection.pile === index &&
          cardIndex >= selection.index;
        column.append(
          cardNode({
            card: entry.faceUp ? entry.card : null,
            back: !entry.faceUp,
            style: `top:${offset}px`,
            selected,
            onclick: () =>
              entry.faceUp
                ? pick({ zone: 'tableau', pile: index, index: cardIndex })
                : null,
            ondblclick: () =>
              entry.faceUp ? auto({ zone: 'tableau', pile: index, index: cardIndex }) : null,
          }),
        );
      });

      if (selection && wouldAccept({ type: 'tableau', to: index })) column.classList.add('drop');
      tableau.append(column);
    });

    board.append(tableau);

    statMoves.textContent = String(moves.length);
    statFound.textContent = `${foundationCount(game)}/52`;
    statStock.textContent = String(game.stock.length);
    undoBtn.disabled = !history.length || banked;
    finishBtn.disabled = !canAutoComplete(game) || banked;
    bankBtn.disabled = banked || foundationCount(game) === 0;

    if (!hasMoves(game) && !isWon(game) && !banked) {
      board.append(
        el('div', { class: 'empty', text: 'No moves left — bank what you have and take a fresh deal.' }),
      );
    }
  }

  function pick(source) {
    if (banked) return;
    if (
      selection &&
      selection.zone === source.zone &&
      selection.pile === source.pile &&
      selection.index === source.index
    ) {
      selection = null;
    } else if (selection) {
      // A second click on another card means "put mine here" when legal.
      if (source.zone === 'tableau' && tryDrop({ type: 'tableau', to: source.pile })) return;
      selection = source;
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
    if (selection.zone === 'waste') {
      return target.type === 'foundation'
        ? { type: 'waste-to-foundation' }
        : { type: 'waste-to-tableau', to: target.to };
    }
    if (target.type === 'foundation') {
      return { type: 'tableau-to-foundation', from: selection.pile };
    }
    return {
      type: 'tableau-to-tableau',
      from: selection.pile,
      index: selection.index,
      to: target.to,
    };
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
    // Bank silently so progress isn't lost when navigating away mid-deal.
    if (!banked && foundationCount(game) > 0 && !isWon(game)) bank(true);
  };
}

/* ------------------------------------------------------------------- cards */

export function cardNode({ card, back = false, selected = false, style, onclick, ondblclick }) {
  const node = el('button', {
    class: `card ${back ? 'back' : ''} ${card && isRed(card) ? 'red' : ''} ${selected ? 'selected' : ''}`,
    style,
    onclick,
    ondblclick,
  });
  if (!back && card) {
    node.append(
      el('span', { class: 'corner', html: `${RANK_LABEL[card.rank]}<br>${SUIT_GLYPH[card.suit]}` }),
      el('span', { class: 'pip', text: SUIT_GLYPH[card.suit] }),
    );
  }
  return node;
}
