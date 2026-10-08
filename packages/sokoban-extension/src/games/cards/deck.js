/**
 * Shared playing-card primitives for Solitaire and Duel.
 *
 * A card is `{ id, rank, suit }` where rank is 1..13 (A..K). Shuffling is
 * seeded so a deal can be reproduced from its seed alone — that is what lets
 * the service worker re-check a "I won" claim without trusting the page.
 */

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
export const RED_SUITS = new Set(['H', 'D']);
export const RANK_LABEL = [
  '', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
];

export function isRed(card) {
  return RED_SUITS.has(card.suit);
}

export function cardLabel(card) {
  return `${RANK_LABEL[card.rank]}${SUIT_GLYPH[card.suit]}`;
}

/** mulberry32 — small, fast, and deterministic across browser and node. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

export function freshDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      cards.push({ id: `${suit}${rank}`, rank, suit });
    }
  }
  return cards;
}

/** Fisher-Yates against a seeded rng; returns a new array. */
export function shuffle(cards, rng) {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function dealtDeck(seed) {
  return shuffle(freshDeck(), makeRng(seed));
}
