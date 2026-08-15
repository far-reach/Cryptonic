/**
 * Toolbar popup: balances at a glance, the daily claim, and a way into each
 * game. Anything heavier happens in the full arcade tab.
 */

import { MSG, send } from '../common/messages.js';
import { TICKETS } from '../store/catalog.js';
import { el, clear, formatDuration } from '../app/ui.js';

const games = document.getElementById('games');
const dailyBtn = document.getElementById('daily');

function set(name, value) {
  const node = document.querySelector(`[data-count='${name}']`);
  if (node) node.textContent = String(value);
}

async function open(view) {
  await send(MSG.OPEN_ARCADE, { view });
  window.close();
}

function render(state) {
  const { profile, daily, levels } = state;
  document.documentElement.dataset.theme = profile.active.theme ?? 'midnight';
  document.documentElement.dataset.cardback = profile.active.cardBack ?? 'classic';

  set('coins', profile.coins.toLocaleString());
  set('gems', profile.gems.toLocaleString());
  set('tickets', `${profile.tickets}/${TICKETS.max}`);

  const solved = Object.values(profile.sokoban.levels).filter((l) => l.solved).length;
  document.getElementById('pop-sub').textContent =
    `${solved}/${levels.length} levels · ${profile.solitaire.wins} deals · ${profile.duel.wins} duels`;

  dailyBtn.hidden = !daily.available;
  dailyBtn.textContent = daily.available
    ? `🎁 Claim day ${daily.nextStreak}: ${daily.coins} coins${daily.gems ? ` + ${daily.gems} 💎` : ''}`
    : '';

  clear(games).append(
    gameRow('📦', 'Sokoban', `${solved}/${levels.length} cleared`, 'sokoban'),
    gameRow('🂡', 'Solitaire', `${profile.solitaire.wins} deals solved`, 'solitaire'),
    gameRow(
      '⚔️',
      'Cipher Duel',
      profile.tickets > 0
        ? `${profile.tickets} tickets ready`
        : `next ticket in ${formatDuration(nextTicketMs(profile))}`,
      'duel',
    ),
  );
}

function nextTicketMs(profile) {
  const regen = profile.upgrades.includes('fastTickets')
    ? TICKETS.regenMs / 2
    : TICKETS.regenMs;
  return Math.max(0, regen - (Date.now() - profile.ticketsUpdatedAt));
}

function gameRow(icon, name, detail, view) {
  return el(
    'button',
    { class: 'pop-game', onclick: () => open(view) },
    el('span', { class: 'ico', text: icon }),
    el('span', null, el('div', { class: 'nm', text: name }), el('div', { class: 'dt', text: detail })),
  );
}

dailyBtn.addEventListener('click', async () => {
  try {
    await send(MSG.CLAIM_DAILY);
  } catch {
    /* already claimed — the refresh below will hide the button */
  }
  render(await send(MSG.GET_STATE));
});

for (const button of document.querySelectorAll('.pop-foot .btn')) {
  button.addEventListener('click', () => open(button.dataset.view));
}

send(MSG.GET_STATE).then(render);
