/**
 * The arcade's table of contents.
 *
 * One entry per game: how it is described, how its progress line reads, the
 * artwork for its card, and the function that mounts it. The hub, the router
 * and the popup all read from here, so adding a game is a single entry plus
 * its `ui.js`.
 */

import { LEVELS } from './sokoban/levels.js';
import { drawThumb } from './sokoban/thumb.js';
import { cardNode } from './cards/render.js';
import { mountSokoban } from './sokoban/ui.js';
import { mountSolitaire } from './solitaire/ui.js';
import { mountFreecell } from './freecell/ui.js';
import { mountPairs } from './pairs/ui.js';
import { mountSweeper } from './sweeper/ui.js';
import { mountDuel } from './duel/ui.js';

const CARD = (rank, suit) => ({ id: `${suit}${rank}`, rank, suit });

export const GAMES = [
  {
    id: 'sokoban',
    name: 'Sokoban',
    tagline: 'Push every crate home',
    blurb:
      'Twenty-four hand-built warehouses. Each has a proven optimal solution — match it for three stars and a gem.',
    tags: ['Puzzle', 'Solo'],
    mount: mountSokoban,
    stat: (profile) => {
      const solved = Object.values(profile.sokoban.levels).filter((l) => l.solved).length;
      return `${solved}/${LEVELS.length} cleared`;
    },
    art: (host) => {
      const canvas = document.createElement('canvas');
      host.append(canvas);
      requestAnimationFrame(() => drawThumb(canvas, LEVELS[7].rows, { padding: 14 }));
    },
  },
  {
    id: 'solitaire',
    name: 'Klondike',
    tagline: 'The patience everyone knows',
    blurb:
      'Draw one or three, unlimited undo, double-click to send a card home, and a one-click finish once the board is open.',
    tags: ['Cards', 'Classic'],
    mount: mountSolitaire,
    stat: (profile) => `${profile.solitaire.wins} deals won`,
    art: (host) => host.append(fan([CARD(1, 'S'), CARD(13, 'H'), CARD(12, 'D')])),
  },
  {
    id: 'freecell',
    name: 'FreeCell',
    tagline: 'No luck, only calculation',
    blurb:
      'Every card face up from the first move, four free cells to stage through. Nearly every deal is winnable — if you plan far enough ahead.',
    tags: ['Cards', 'Hard'],
    mount: mountFreecell,
    stat: (profile) => `${profile.freecell.wins} deals won`,
    art: (host) => host.append(fan([CARD(7, 'C'), CARD(6, 'H'), CARD(5, 'S')])),
  },
  {
    id: 'pairs',
    name: 'Pairs',
    tagline: 'Memory, with a combo meter',
    blurb:
      'Flip two cards, keep the matches. Consecutive hits build a combo that multiplies the payout — a clean sweep pays double.',
    tags: ['Cards', 'Quick'],
    mount: mountPairs,
    stat: (profile) =>
      profile.pairs.perfects
        ? `${profile.pairs.wins} cleared · ${profile.pairs.perfects} perfect`
        : `${profile.pairs.wins} cleared`,
    art: (host) => {
      const wrap = document.createElement('span');
      wrap.className = 'mini-cards';
      wrap.append(
        cardNode({ back: true, size: 'sm' }),
        cardNode({ card: CARD(9, 'D'), size: 'sm' }),
        cardNode({ card: CARD(9, 'H'), size: 'sm' }),
      );
      for (const card of wrap.children) card.disabled = true;
      host.append(wrap);
    },
  },
  {
    id: 'sweeper',
    name: 'Sweeper',
    tagline: 'Read the numbers, not your luck',
    blurb:
      'Minesweeper on a first-click-safe board across three sizes. Flag with right-click, chord with a click on a satisfied number.',
    tags: ['Logic', 'Solo'],
    mount: mountSweeper,
    stat: (profile) => `${profile.sweeper.wins} fields cleared`,
    art: (host) => host.append(miniField()),
  },
  {
    id: 'duel',
    name: 'Cipher Duel',
    tagline: 'Rank beats rank — unless it is countered',
    blurb:
      'Commit a card at the same time as your opponent. Suits form a counter cycle that halves the countered card, so a 3♠ can beat a 5♥.',
    tags: ['Cards', 'Versus'],
    mount: mountDuel,
    stat: (profile) => `${profile.duel.wins}W · ${profile.duel.losses}L`,
    art: (host) => {
      const wrap = document.createElement('span');
      wrap.className = 'mini-cards';
      wrap.append(
        cardNode({ card: CARD(3, 'S'), size: 'sm' }),
        cardNode({ back: true, size: 'sm' }),
        cardNode({ card: CARD(5, 'H'), size: 'sm' }),
      );
      for (const card of wrap.children) card.disabled = true;
      host.append(wrap);
    },
  },
];

export const GAME_BY_ID = new Map(GAMES.map((game) => [game.id, game]));

function fan(cards) {
  const wrap = document.createElement('span');
  wrap.className = 'mini-cards';
  for (const card of cards) {
    const node = cardNode({ card, size: 'sm' });
    node.disabled = true;
    wrap.append(node);
  }
  return wrap;
}

/** A tiny fake minefield for the Sweeper card. */
function miniField() {
  const grid = document.createElement('span');
  grid.className = 'mine-grid';
  grid.style.gridTemplateColumns = 'repeat(5, 20px)';
  grid.style.gap = '2px';

  const layout = ['', '1', '', 'F', '', '1', '2', '2', '1', '', '', '1', '', '1', '', '', '1', '1', '1', ''];
  for (const value of layout) {
    const cell = document.createElement('span');
    cell.className = `cell ${value === 'F' ? 'flag' : value ? 'open' : 'open'}`;
    cell.style.width = '20px';
    cell.style.height = '20px';
    cell.style.fontSize = '11px';
    if (value && value !== 'F') {
      cell.dataset.n = value;
      cell.textContent = value;
    } else if (value === 'F') {
      cell.textContent = '⚑';
    }
    grid.append(cell);
  }
  return grid;
}
