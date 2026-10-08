/**
 * Card rendering shared by Solitaire, FreeCell, Pairs and Duel.
 *
 * Number cards get the real pip layout on the classic 3×7 grid (with the
 * bottom half rotated, the way a printed deck does it) rather than one big
 * glyph — at solitaire sizes that difference is most of what makes a table
 * look like cards instead of coloured rectangles.
 */

import { RANK_LABEL, SUIT_GLYPH, isRed } from './deck.js';

/** [column, row] on a 3-wide, 7-tall grid. Rows 5-7 print upside down. */
const PIPS = {
  1: [[2, 4]],
  2: [[2, 1], [2, 7]],
  3: [[2, 1], [2, 4], [2, 7]],
  4: [[1, 1], [3, 1], [1, 7], [3, 7]],
  5: [[1, 1], [3, 1], [2, 4], [1, 7], [3, 7]],
  6: [[1, 1], [3, 1], [1, 4], [3, 4], [1, 7], [3, 7]],
  7: [[1, 1], [3, 1], [2, 2], [1, 4], [3, 4], [1, 7], [3, 7]],
  8: [[1, 1], [3, 1], [2, 2], [1, 4], [3, 4], [2, 6], [1, 7], [3, 7]],
  9: [[1, 1], [3, 1], [1, 3], [3, 3], [2, 4], [1, 5], [3, 5], [1, 7], [3, 7]],
  10: [[1, 1], [3, 1], [1, 3], [3, 3], [2, 2], [1, 5], [3, 5], [2, 6], [1, 7], [3, 7]],
};

const COURT = { 11: 'J', 12: 'Q', 13: 'K' };

/**
 * Builds a card element.
 *   card      the card to show; omit with `back: true` for a face-down card
 *   size      'sm' | 'md' | 'lg' — sets the --w custom property
 *   selected  draws the lift-and-outline state
 */
export function cardNode({
  card,
  back = false,
  selected = false,
  dimmed = false,
  size = 'md',
  style,
  title,
  onclick,
  ondblclick,
  oncontextmenu,
}) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = [
    'card',
    `card-${size}`,
    back ? 'back' : '',
    !back && card && isRed(card) ? 'red' : '',
    selected ? 'selected' : '',
    dimmed ? 'dimmed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (style) node.setAttribute('style', style);
  if (title) node.title = title;
  if (onclick) node.addEventListener('click', onclick);
  if (ondblclick) node.addEventListener('dblclick', ondblclick);
  if (oncontextmenu) node.addEventListener('contextmenu', oncontextmenu);

  if (back || !card) {
    node.append(spanWith('back-art', ''));
    return node;
  }

  node.setAttribute(
    'aria-label',
    `${RANK_LABEL[card.rank]} of ${{ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[card.suit]}`,
  );

  node.append(corner(card, 'tl'), corner(card, 'br'), body(card));
  return node;
}

function corner(card, where) {
  const node = document.createElement('span');
  node.className = `corner ${where}`;
  node.innerHTML =
    `<b>${RANK_LABEL[card.rank]}</b><i>${SUIT_GLYPH[card.suit]}</i>`;
  return node;
}

function body(card) {
  const glyph = SUIT_GLYPH[card.suit];

  if (COURT[card.rank]) {
    const court = document.createElement('span');
    court.className = 'court';
    court.innerHTML = `<b>${COURT[card.rank]}</b><i>${glyph}</i>`;
    return court;
  }

  const grid = document.createElement('span');
  grid.className = 'pips';
  for (const [column, row] of PIPS[card.rank] ?? []) {
    const pip = document.createElement('i');
    pip.textContent = glyph;
    pip.style.gridColumn = String(column);
    pip.style.gridRow = String(row);
    if (row > 4) pip.classList.add('flip');
    grid.append(pip);
  }
  return grid;
}

function spanWith(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

/** An empty drop target that matches the card silhouette. */
export function slotNode({ label = '', size = 'md', highlight = false, style, onclick, title }) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `slot card-${size} ${highlight ? 'drop' : ''}`;
  node.textContent = label;
  if (style) node.setAttribute('style', style);
  if (title) node.title = title;
  if (onclick) node.addEventListener('click', onclick);
  return node;
}
