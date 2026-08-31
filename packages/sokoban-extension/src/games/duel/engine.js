/**
 * Cipher Duel — a skill card game (no wagering, no chance-based payouts).
 *
 * Both duellists get half a seeded deck and a hand of five. Each round you
 * commit a card; the opponent commits simultaneously. Raw rank decides the
 * round, except that suits form a counter-cycle:
 *
 *     ♠ counters ♥ counters ♦ counters ♣ counters ♠
 *
 * A countered card fights at half its rank (rounded down), so a 3♠ beats a
 * 5♥ — knowing what your opponent has already spent is the whole game.
 *
 * Everything is derived from `seed` plus the action log, so the service worker
 * can replay a duel and confirm a claimed win before paying out.
 */

import { dealtDeck, makeRng, cardLabel } from '../cards/deck.js';

export const HAND_SIZE = 5;
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;

const COUNTERS = { S: 'H', H: 'D', D: 'C', C: 'S' };

export function counters(attacker, defender) {
  return COUNTERS[attacker] === defender;
}

export function effectiveValue(card, against) {
  if (against && counters(against.suit, card.suit)) return Math.floor(card.rank / 2);
  return card.rank;
}

export function newDuel(seed) {
  const deck = dealtDeck(seed);
  const playerDeck = deck.slice(0, 26);
  const aiDeck = deck.slice(26);

  return {
    seed,
    round: 1,
    playerScore: 0,
    aiScore: 0,
    playerHand: playerDeck.slice(0, HAND_SIZE),
    aiHand: aiDeck.slice(0, HAND_SIZE),
    playerDeck: playerDeck.slice(HAND_SIZE),
    aiDeck: aiDeck.slice(HAND_SIZE),
    history: [],
    played: { player: [], ai: [] },
    peeked: null,
    insured: false,
    swapsUsed: 0,
    peeksUsed: 0,
    insurancesUsed: 0,
    over: false,
    result: null, // 'win' | 'loss' | 'draw'
  };
}

export function cloneDuel(state) {
  return {
    ...state,
    playerHand: state.playerHand.slice(),
    aiHand: state.aiHand.slice(),
    playerDeck: state.playerDeck.slice(),
    aiDeck: state.aiDeck.slice(),
    history: state.history.map((h) => ({ ...h })),
    played: { player: state.played.player.slice(), ai: state.played.ai.slice() },
  };
}

/**
 * Opponent policy. Deterministic given the duel state, so replays match — the
 * only randomness is seeded and derived from the round number.
 */
export function aiChoice(state) {
  const rng = makeRng((state.seed ^ (state.round * 0x9e3779b9)) >>> 0);
  const behind = state.aiScore < state.playerScore;
  const ahead = state.aiScore > state.playerScore;
  const matchPoint = state.playerScore === ROUNDS_TO_WIN - 1;

  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < state.aiHand.length; i++) {
    const card = state.aiHand[i];
    // How this card is expected to fare against what the player might hold.
    let expected = 0;
    for (const candidate of state.playerHand) {
      const mine = effectiveValue(card, candidate);
      const theirs = effectiveValue(candidate, card);
      expected += Math.sign(mine - theirs);
    }
    expected /= Math.max(1, state.playerHand.length);

    // Behind or facing match point: commit the strong cards. Ahead: bank them.
    const aggression = behind || matchPoint ? 1 : ahead ? -0.5 : 0.25;
    const score = expected * 2 + aggression * (card.rank / 13) + rng() * 0.35;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function draw(hand, deck) {
  while (hand.length < HAND_SIZE && deck.length) hand.push(deck.shift());
}

/** Reveal the opponent's committed card for this round (costs a Peek). */
export function peek(state) {
  if (state.over || state.peeked) return null;
  const next = cloneDuel(state);
  next.peeked = next.aiHand[aiChoice(next)];
  next.peeksUsed++;
  return next;
}

/** Discard the current hand and draw a fresh one (costs a Swap). */
export function swapHand(state) {
  if (state.over || state.playerDeck.length === 0) return null;
  const next = cloneDuel(state);
  next.playerDeck.push(...next.playerHand);
  next.playerHand = [];
  draw(next.playerHand, next.playerDeck);
  next.swapsUsed++;
  next.peeked = null;
  return next;
}

/** The next round the player loses is voided (costs an Insurance). */
export function insure(state) {
  if (state.over || state.insured) return null;
  const next = cloneDuel(state);
  next.insured = true;
  next.insurancesUsed++;
  return next;
}

/** Commit the card at `index`; resolves the round and advances the duel. */
export function playCard(state, index) {
  if (state.over) return null;
  if (index < 0 || index >= state.playerHand.length) return null;

  const next = cloneDuel(state);
  const aiIndex = aiChoice(next);
  const playerCard = next.playerHand.splice(index, 1)[0];
  const aiCard = next.aiHand.splice(aiIndex, 1)[0];

  const playerValue = effectiveValue(playerCard, aiCard);
  const aiValue = effectiveValue(aiCard, playerCard);

  let outcome = 'tie';
  if (playerValue > aiValue) outcome = 'player';
  else if (aiValue > playerValue) outcome = 'ai';

  let voided = false;
  if (outcome === 'player') {
    next.playerScore++;
  } else if (outcome === 'ai') {
    if (next.insured) {
      voided = true;
      next.insured = false;
    } else {
      next.aiScore++;
    }
  }

  next.history.push({
    round: next.round,
    playerCard,
    aiCard,
    playerValue,
    aiValue,
    outcome,
    voided,
    note: describeRound(playerCard, aiCard, playerValue, aiValue),
  });
  next.played.player.push(playerCard);
  next.played.ai.push(aiCard);

  draw(next.playerHand, next.playerDeck);
  draw(next.aiHand, next.aiDeck);

  next.peeked = null;
  next.round++;

  if (
    next.playerScore >= ROUNDS_TO_WIN ||
    next.aiScore >= ROUNDS_TO_WIN ||
    next.round > MAX_ROUNDS ||
    next.playerHand.length === 0
  ) {
    next.over = true;
    next.result =
      next.playerScore > next.aiScore
        ? 'win'
        : next.aiScore > next.playerScore
          ? 'loss'
          : 'draw';
  }

  return next;
}

function describeRound(playerCard, aiCard, playerValue, aiValue) {
  const parts = [`${cardLabel(playerCard)} vs ${cardLabel(aiCard)}`];
  if (counters(playerCard.suit, aiCard.suit)) {
    parts.push(`your suit counters — theirs drops to ${aiValue}`);
  } else if (counters(aiCard.suit, playerCard.suit)) {
    parts.push(`countered — yours drops to ${playerValue}`);
  }
  return parts.join(' · ');
}

/**
 * Replays a duel from its seed and the player's action log. Used by the
 * service worker before paying out a duel win.
 */
export function replay(seed, actions) {
  let state = newDuel(seed);
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    let next = null;
    if (action.type === 'play') next = playCard(state, action.index);
    else if (action.type === 'peek') next = peek(state);
    else if (action.type === 'swap') next = swapHand(state);
    else if (action.type === 'insure') next = insure(state);
    if (!next) return { ok: false, reason: `illegal action at ${i}: ${action.type}` };
    state = next;
  }
  return { ok: true, state, won: state.over && state.result === 'win' };
}
