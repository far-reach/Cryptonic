/**
 * Cipher Duel screen.
 *
 * A duel only starts once the worker has charged a ticket and handed back a
 * seed; every action the player takes is logged and sent back at the end, and
 * the worker replays it against that seed before paying out.
 */

import { MSG, send } from '../../common/messages.js';
import { sfx, setSoundEnabled } from '../../common/audio.js';
import { clear, el, rewardModal, toast } from '../../app/ui.js';
import { SUIT_GLYPH, cardLabel } from '../cards/deck.js';
import { cardNode, slotNode } from '../cards/render.js';
import {
  MAX_ROUNDS,
  ROUNDS_TO_WIN,
  counters,
  effectiveValue,
  insure,
  newDuel,
  peek,
  playCard,
  swapHand,
} from './engine.js';

export function mountDuel(root, app) {
  const profile = app.state.profile;
  setSoundEnabled(profile.settings.sound);

  let duel = null;
  let actions = [];
  let busy = false;
  let submitted = false;

  const shell = el('div');
  root.append(
    el('div', { class: 'spread' },
      el('div', null,
        el('h1', { text: 'Cipher Duel' }),
        el('p', { class: 'sub', text: `First to ${ROUNDS_TO_WIN} rounds, ${MAX_ROUNDS} rounds maximum.` })),
      el('div', { class: 'suit-cycle' },
        el('span', { text: 'Counter cycle:' }),
        el('span', { class: 'pill', text: `${SUIT_GLYPH.S} → ${SUIT_GLYPH.H} → ${SUIT_GLYPH.D} → ${SUIT_GLYPH.C} → ${SUIT_GLYPH.S}` }))),
    shell,
  );

  function renderIntro() {
    clear(shell);
    const tickets = app.state.profile.tickets;
    shell.append(
      el(
        'div',
        { class: 'panel', style: 'max-width:640px;margin:0 auto;text-align:center' },
        el('div', { style: 'font-size:44px' , text: '⚔️' }),
        el('h2', { style: 'margin-top:6px', text: 'Read your opponent' }),
        el('p', { class: 'muted', html:
          'Both duellists commit a card at the same time. The higher rank wins the round — ' +
          `but if your suit <b>counters</b> theirs (${SUIT_GLYPH.S}→${SUIT_GLYPH.H}→${SUIT_GLYPH.D}→${SUIT_GLYPH.C}→${SUIT_GLYPH.S}), ` +
          'their card fights at half rank, rounded down. A 3♠ beats a 5♥.' }),
        el('p', { class: 'muted', text: 'Cards are dealt from a shuffled deck split in two, so counting what has been spent is the edge.' }),
        el('div', { class: 'row', style: 'justify-content:center;margin-top:16px' },
          el('span', { class: 'pill', text: `🎟 ${tickets} tickets` }),
          el('button', {
            class: 'btn btn-primary',
            text: 'Start duel (1 🎟)',
            disabled: tickets <= 0,
            onclick: start,
          })),
        tickets <= 0
          ? el('p', { class: 'muted', style: 'margin-top:12px', text: 'Out of tickets — one regenerates every 20 minutes, or refill instantly in the Store.' })
          : null,
      ),
    );
  }

  async function start() {
    if (busy) return;
    busy = true;
    try {
      const { seed } = await send(MSG.DUEL_START);
      duel = newDuel(seed);
      actions = [];
      submitted = false;
      await app.refresh();
    } catch (err) {
      busy = false;
      toast('Cannot start', err.code === 'no_tickets' ? 'No tickets left.' : err.code, 'bad');
      renderIntro();
      return;
    }

    // Clear `busy` before the first paint, or every card renders disabled.
    busy = false;
    renderBoard();
  }

  /* ---------------------------------------------------------------- render */

  function renderBoard(reveal = null) {
    clear(shell);
    const profileNow = app.state.profile;
    const lastRound = duel.history[duel.history.length - 1];

    const board = el('div', { class: 'duel-board' });

    board.append(
      el(
        'div',
        { class: 'duel-scores' },
        scoreBox('You', duel.playerScore, duel.playerScore > duel.aiScore),
        el('div', { class: 'muted', text: `Round ${Math.min(duel.round, MAX_ROUNDS)}/${MAX_ROUNDS}` }),
        scoreBox('Opponent', duel.aiScore, duel.aiScore > duel.playerScore),
      ),
    );

    const arena = el('div', { class: 'arena' });
    arena.append(
      el('div', null,
        el('div', { class: 'slot-label', text: 'Your card' }),
        reveal ? cardNode({ card: reveal.playerCard, size: 'lg' }) : slotNode({ label: '?', size: 'lg' })),
      el('div', { class: 'vs', text: 'VS' }),
      el('div', null,
        el('div', { class: 'slot-label', text: 'Opponent' }),
        reveal
          ? cardNode({ card: reveal.aiCard, size: 'lg' })
          : duel.peeked
            ? cardNode({ card: duel.peeked, size: 'lg' })
            : cardNode({ back: true, size: 'lg' })),
    );
    board.append(arena);

    board.append(
      el('div', { class: 'round-note', text: reveal ? describe(reveal) : duel.peeked ? `Peeked: they are holding ${cardLabel(duel.peeked)}` : '' }),
    );

    const hand = el('div', { class: 'hand' });
    duel.playerHand.forEach((card, index) => {
      const preview = duel.peeked
        ? previewOutcome(card, duel.peeked)
        : null;
      const node = cardNode({
        card,
        size: 'lg',
        dimmed: preview?.startsWith('Lose'),
        title: preview ?? undefined,
        onclick: () => commit(index),
      });
      node.disabled = busy || duel.over;
      if (preview?.startsWith('Win')) node.classList.add('win-hint');
      hand.append(node);
    });
    board.append(hand);

    board.append(
      el(
        'div',
        { class: 'row', style: 'justify-content:center' },
        assistButton('👁 Peek', 'peek', profileNow.items.peek, Boolean(duel.peeked) || duel.over, usePeek),
        assistButton('🛡 Insure', 'insure', profileNow.items.insure, duel.insured || duel.over, useInsure),
        assistButton('🔄 Swap', 'swap', profileNow.items.swap, duel.over || duel.playerDeck.length === 0, useSwap),
      ),
    );

    if (duel.insured) {
      board.append(el('div', { class: 'round-note', text: '🛡 Insurance armed — the next round you lose is voided.' }));
    }

    const side = el(
      'div',
      { class: 'panel' },
      el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px', text: 'Round log' }),
      duel.history.length
        ? el('div', { class: 'log' }, ...duel.history.slice().reverse().map(logRow))
        : el('div', { class: 'muted', style: 'font-size:13px', text: 'No rounds played yet.' }),
      el('div', { class: 'stat-row', style: 'margin-top:10px' },
        el('span', { text: 'Cards left (yours)' }),
        el('span', { text: String(duel.playerDeck.length) })),
      el('div', { class: 'stat-row' },
        el('span', { text: 'Spent by opponent' }),
        el('span', { text: duel.played.ai.map(cardLabel).join(' ') || '—' })),
    );

    shell.append(el('div', { class: 'play-shell' }, board, el('div', { class: 'side' }, side)));
  }

  function scoreBox(who, value, leading) {
    return el('div', { class: `score-box ${leading ? 'lead' : ''}` },
      el('div', { class: 'who', text: who }),
      el('div', { class: 'val', text: String(value) }));
  }

  function logRow(entry) {
    const cls = entry.voided ? 'tie' : entry.outcome === 'player' ? 'win' : entry.outcome === 'ai' ? 'lose' : 'tie';
    const label = entry.voided
      ? 'voided'
      : entry.outcome === 'player'
        ? 'won'
        : entry.outcome === 'ai'
          ? 'lost'
          : 'tied';
    return el('div', { class: 'log-row' },
      el('span', { text: `R${entry.round} ${cardLabel(entry.playerCard)} v ${cardLabel(entry.aiCard)}` }),
      el('span', { class: cls, text: `${entry.playerValue}–${entry.aiValue} ${label}` }));
  }

  function assistButton(label, item, count, disabled, onClick) {
    return el('button', {
      class: 'btn btn-sm',
      text: `${label} (${count})`,
      disabled: disabled || count <= 0 || busy,
      onclick: onClick,
    });
  }

  function describe(entry) {
    const verdict = entry.voided
      ? 'Insurance voided the loss'
      : entry.outcome === 'player'
        ? 'You take the round'
        : entry.outcome === 'ai'
          ? 'Opponent takes the round'
          : 'Split — nobody scores';
    return `${entry.note} → ${entry.playerValue} v ${entry.aiValue} · ${verdict}`;
  }

  function previewOutcome(card, against) {
    const mine = effectiveValue(card, against);
    const theirs = effectiveValue(against, card);
    const note = counters(card.suit, against.suit)
      ? ' (you counter)'
      : counters(against.suit, card.suit)
        ? ' (countered)'
        : '';
    if (mine > theirs) return `Win ${mine}–${theirs}${note}`;
    if (mine < theirs) return `Lose ${mine}–${theirs}${note}`;
    return `Tie ${mine}–${theirs}${note}`;
  }

  /* --------------------------------------------------------------- actions */

  async function commit(index) {
    if (busy || duel.over) return;
    busy = true;

    const next = playCard(duel, index);
    if (!next) {
      busy = false;
      sfx.deny();
      return;
    }
    duel = next;
    actions.push({ type: 'play', index });

    const round = duel.history[duel.history.length - 1];
    round.outcome === 'player' ? sfx.place() : round.outcome === 'ai' ? sfx.deny() : sfx.card();
    renderBoard(round);

    setTimeout(() => {
      busy = false;
      if (duel.over) endDuel();
      else renderBoard();
    }, 1150);
  }

  async function useAssist(item, applyFn) {
    if (busy) return;
    try {
      await send(MSG.USE_ITEM, { item });
    } catch {
      toast('None left', `Buy more in the Store.`, 'bad');
      return;
    }
    const next = applyFn(duel);
    if (!next) return;
    duel = next;
    actions.push({ type: item === 'peek' ? 'peek' : item === 'swap' ? 'swap' : 'insure' });
    await app.refresh();
    sfx.card();
    renderBoard();
  }

  const usePeek = () => useAssist('peek', peek);
  const useSwap = () => useAssist('swap', swapHand);
  const useInsure = () => useAssist('insure', insure);

  async function endDuel() {
    if (submitted) return;
    submitted = true;
    duel.result === 'win' ? sfx.win() : sfx.lose();

    let result;
    try {
      result = await send(MSG.DUEL_RESULT, { seed: duel.seed, actions });
    } catch (err) {
      toast('Not credited', err.code === 'invalid_claim' ? 'Duel failed verification.' : err.code, 'bad');
      renderIntro();
      return;
    }

    await app.refresh();
    if (result.coins) sfx.coin();

    rewardModal({
      title:
        duel.result === 'win'
          ? duel.aiScore === 0
            ? 'Flawless victory'
            : 'Duel won'
          : duel.result === 'draw'
            ? 'Drawn duel'
            : 'Duel lost',
      subtitle: `${duel.playerScore}–${duel.aiScore}${
        duel.result === 'win' && app.state.profile.duel.streak > 1
          ? ` · ${app.state.profile.duel.streak} win streak`
          : ''
      }`,
      coins: result.coins,
      gems: result.gems,
      actions: [
        {
          label: app.state.profile.tickets > 0 ? 'Duel again (1 🎟)' : 'No tickets left',
          primary: true,
          onClick: () => (app.state.profile.tickets > 0 ? start() : renderIntro()),
        },
        { label: 'Back', onClick: renderIntro },
      ],
    });

    for (const achievement of result.achievements ?? []) {
      toast(`Achievement: ${achievement.name}`, `💎 +${achievement.gems}`, 'good');
    }

    renderIntro();
  }

  renderIntro();

  return () => {
    // A duel left mid-flight simply forfeits the ticket; nothing to persist.
    duel = null;
  };
}
