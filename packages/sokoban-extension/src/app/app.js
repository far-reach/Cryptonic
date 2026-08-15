/**
 * Arcade shell: hash router, wallet header, and the Store / Wallet screens.
 * Each game mounts itself into `#view` and returns a teardown function.
 */

import { MSG, EVENT_WALLET_CHANGED, send } from '../common/messages.js';
import { CONFIG, IS_SANDBOX } from '../config.js';
import {
  ACHIEVEMENTS,
  CARD_BACKS,
  IAP_PACKS,
  STORE_ITEMS,
  THEMES,
  TICKETS,
} from '../store/catalog.js';
import { ownsItem } from '../store/economy.js';
import { mountSokoban } from '../games/sokoban/ui.js';
import { mountSolitaire } from '../games/solitaire/ui.js';
import { mountDuel } from '../games/duel/ui.js';
import { clear, el, formatDuration, formatTime, stars, toast } from './ui.js';

const viewRoot = document.getElementById('view');

export const app = {
  state: null,
  /** Views call this after anything that moves money. */
  async refresh() {
    app.state = await send(MSG.GET_STATE);
    applyCosmetics(app.state.profile);
    paintChips(app.state.profile);
    return app.state;
  },
  toast,
};

let teardown = null;

const VIEWS = {
  arcade: renderArcade,
  sokoban: (root) => mountSokoban(root, app),
  solitaire: (root) => mountSolitaire(root, app),
  duel: (root) => mountDuel(root, app),
  store: renderStore,
  wallet: renderWallet,
};

/* ------------------------------------------------------------------ chrome */

function applyCosmetics(profile) {
  document.documentElement.dataset.theme = profile.active.theme ?? 'midnight';
  document.documentElement.dataset.cardback = profile.active.cardBack ?? 'classic';
}

function paintChips(profile) {
  setChip('coins', profile.coins);
  setChip('gems', profile.gems);
  setChip('tickets', `${profile.tickets}/${TICKETS.max}`);

  const daily = app.state?.daily;
  const chip = document.getElementById('daily-chip');
  chip.hidden = !daily?.available;
}

function setChip(name, value) {
  const node = document.querySelector(`[data-count='${name}']`);
  if (!node) return;
  const next = String(value);
  if (node.textContent !== next && node.textContent !== '–') {
    const chip = node.closest('.chip');
    chip.classList.remove('flash');
    void chip.offsetWidth; // restart the animation
    chip.classList.add('flash');
  }
  node.textContent = next;
}

/* ------------------------------------------------------------------ router */

async function route() {
  const name = (location.hash.slice(1) || 'arcade').split('?')[0];
  const render = VIEWS[name] ?? VIEWS.arcade;

  if (teardown) {
    teardown();
    teardown = null;
  }

  for (const tab of document.querySelectorAll('.tab')) {
    tab.toggleAttribute('aria-current', tab.dataset.view === name);
    if (tab.dataset.view === name) tab.setAttribute('aria-current', 'page');
  }

  clear(viewRoot);
  teardown = (await render(viewRoot)) ?? null;
  viewRoot.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ arcade */

function renderArcade(root) {
  const { profile } = app.state;
  const levels = app.state.levels;
  const solved = Object.values(profile.sokoban.levels).filter((l) => l.solved).length;
  const totalStars = Object.values(profile.sokoban.levels).reduce(
    (sum, l) => sum + (l.stars ?? 0),
    0,
  );

  root.append(
    el('h1', { text: 'Pick a game' }),
    el('p', {
      class: 'sub',
      text: 'Three games, one wallet. Coins you earn here spend anywhere.',
    }),
    el(
      'div',
      { class: 'game-cards' },
      gameCard({
        art: '📦',
        title: 'Sokoban',
        blurb: 'Twenty-four hand-built warehouses. Every level has a proven optimal solution — match it for three stars and a gem.',
        meta: [`${solved}/${levels.length} cleared`, `${totalStars}★ collected`],
        view: 'sokoban',
      }),
      gameCard({
        art: '🂡',
        title: 'Klondike Solitaire',
        blurb: 'Classic patience with draw-one or draw-three, unlimited undo and a one-click finish once the board is open.',
        meta: [
          `${profile.solitaire.wins} won`,
          profile.solitaire.streak ? `${profile.solitaire.streak} win streak` : 'no streak yet',
        ],
        view: 'solitaire',
      }),
      gameCard({
        art: '⚔️',
        title: 'Cipher Duel',
        blurb: 'Rank beats rank — unless your suit counters theirs and halves it. Read the opponent, spend your kings wisely.',
        meta: [
          `${profile.duel.wins}W · ${profile.duel.losses}L`,
          `🎟 ${profile.tickets}/${TICKETS.max}`,
        ],
        view: 'duel',
      }),
    ),
    el('h2', { text: 'Achievements' }),
    el(
      'div',
      { class: 'grid' },
      ...ACHIEVEMENTS.map((achievement) => {
        const earned = profile.achievements.includes(achievement.id);
        return el(
          'div',
          { class: 'panel' },
          el('div', { class: 'spread' }, el('strong', { text: achievement.name }),
            el('span', { class: earned ? 'owned' : 'muted', text: earned ? '✓ earned' : `💎 ${achievement.gems}` })),
          el('div', { class: 'muted', text: achievement.blurb }),
        );
      }),
    ),
  );
}

function gameCard({ art, title, blurb, meta, view }) {
  return el(
    'button',
    { class: 'game-card', onclick: () => { location.hash = view; } },
    el('div', { class: 'art', text: art }),
    el('h3', { text: title }),
    el('p', { text: blurb }),
    el('div', { class: 'meta' }, ...meta.map((m) => el('span', { class: 'pill', text: m }))),
  );
}

/* ------------------------------------------------------------------- store */

function renderStore(root) {
  const { profile } = app.state;

  root.append(
    el('h1', { text: 'Store' }),
    el('p', {
      class: 'sub',
      text: 'Coins come from playing. Gems come from the daily streak, achievements, or the packs below.',
    }),
  );

  if (IS_SANDBOX) {
    root.append(
      el('div', {
        class: 'notice',
        html:
          '<strong>Sandbox mode.</strong> Gem packs are simulated locally — no payment is taken and no card details are ever requested. ' +
          'Switch <code>provider</code> in <code>src/config.js</code> to <code>checkout</code> to wire up a real processor.',
      }),
    );
  }

  root.append(el('h2', { text: 'Gem packs' }));
  root.append(
    el(
      'div',
      { class: 'grid' },
      ...IAP_PACKS.map((pack) => packCard(pack, profile)),
    ),
  );

  root.append(
    el(
      'div',
      { class: 'row', style: 'margin-top:12px' },
      el('button', {
        class: 'btn btn-ghost btn-sm',
        text: 'Restore purchases',
        onclick: restorePurchases,
      }),
      el('span', {
        class: 'muted',
        style: 'font-size:13px',
        text: IS_SANDBOX
          ? 'Sandbox purchases stay on this device.'
          : 'Re-checks your entitlements with the payment server.',
      }),
    ),
  );

  for (const [kind, heading] of [
    ['consumable', 'Consumables'],
    ['upgrade', 'Permanent upgrades'],
    ['cosmetic', 'Cosmetics'],
  ]) {
    const items = STORE_ITEMS.filter((item) => item.kind === kind);
    root.append(el('h2', { text: heading }));
    root.append(el('div', { class: 'grid' }, ...items.map((item) => storeCard(item, profile))));
  }
}

function storeCard(item, profile) {
  const owned = ownsItem(profile, item);
  const affordable = profile[item.price.currency] >= item.price.amount;
  const held = item.kind === 'consumable' ? countGranted(profile, item) : null;

  return el(
    'div',
    { class: 'store-item' },
    el('div', { class: 'icon', text: item.icon }),
    el('h3', { text: item.name }),
    el('p', { text: item.blurb }),
    held !== null ? el('div', { class: 'muted', style: 'font-size:12px', text: `You hold ${held}` }) : null,
    el(
      'div',
      { class: 'spread' },
      el('span', {
        class: `price ${item.price.currency}`,
        text: `${item.price.currency === 'gems' ? '💎' : '🪙'} ${item.price.amount}`,
      }),
      owned
        ? el('span', { class: 'owned', text: '✓ Owned' })
        : el('button', {
            class: 'btn btn-sm btn-primary',
            text: affordable ? 'Buy' : 'Not enough',
            disabled: !affordable,
            onclick: () => buyItem(item),
          }),
    ),
  );
}

function countGranted(profile, item) {
  const key = Object.keys(item.grant.items ?? {})[0];
  return key ? (profile.items[key] ?? 0) : 0;
}

function packCard(pack, profile) {
  const purchased = pack.oneTime && profile.receipts.some((r) => r.startsWith(`${pack.sku}:`));
  return el(
    'div',
    { class: `pack ${pack.popular ? 'popular' : ''}` },
    pack.popular ? el('span', { class: 'badge', text: 'Most popular' }) : null,
    el('div', { style: 'font-size:28px', text: pack.icon }),
    el('div', { class: 'amount', text: pack.gems.toLocaleString() }),
    pack.bonus ? el('div', { class: 'bonus', text: `${pack.bonus} bonus` }) : null,
    el('div', { style: 'font-weight:650;margin-top:4px', text: pack.name }),
    el('p', { text: pack.blurb }),
    purchased
      ? el('span', { class: 'owned', text: '✓ Purchased' })
      : el('button', {
          class: 'btn btn-primary',
          text: `$${pack.priceUsd.toFixed(2)}`,
          onclick: () => buyPack(pack),
        }),
  );
}

async function buyItem(item) {
  try {
    await send(MSG.BUY_ITEM, { itemId: item.id });
    toast('Purchased', item.name, 'good');
    await app.refresh();
    route();
  } catch (err) {
    toast('Could not buy', explain(err.code), 'bad');
  }
}

async function buyPack(pack) {
  try {
    const result = await send(MSG.IAP_START, { sku: pack.sku });
    if (result.status === 'granted') {
      toast('Purchase complete', `${result.gems} gems added`, 'good');
      await app.refresh();
      route();
    } else {
      toast(
        'Checkout opened',
        'Finish payment in the new tab, then press Restore purchases.',
      );
    }
  } catch (err) {
    toast('Purchase failed', explain(err.code), 'bad');
  }
}

async function restorePurchases() {
  try {
    const result = await send(MSG.IAP_RESTORE);
    if (result.restored.length) {
      toast('Restored', result.restored.join(', '), 'good');
      await app.refresh();
      route();
    } else {
      toast('Nothing to restore', `Checked ${result.checked} entitlements.`);
    }
  } catch (err) {
    toast('Restore failed', explain(err.code), 'bad');
  }
}

function explain(code) {
  return (
    {
      insufficient_funds: 'You need more currency for that.',
      already_owned: 'You already own it.',
      already_purchased: 'That one-time pack is already on this account.',
      out_of_stock: "You don't have any of those left.",
      not_configured: 'No payment provider is configured in src/config.js.',
      verify_failed: 'The payment server could not be reached.',
      duplicate_receipt: 'That receipt was already redeemed.',
      no_tickets: 'You are out of Duel tickets.',
      invalid_claim: 'The game result failed verification.',
    }[code] ?? code ?? 'Unknown error'
  );
}

/* ------------------------------------------------------------------ wallet */

function renderWallet(root) {
  const { profile } = app.state;
  const daily = app.state.daily;

  root.append(
    el('h1', { text: 'Wallet' }),
    el('p', { class: 'sub', text: 'Every coin and gem movement on this device.' }),
    el(
      'div',
      { class: 'kpi' },
      kpi('Coins', profile.coins.toLocaleString()),
      kpi('Gems', profile.gems.toLocaleString()),
      kpi('Earned all-time', profile.stats.coinsEarned.toLocaleString()),
      kpi('Spent all-time', profile.stats.coinsSpent.toLocaleString()),
      kpi('Daily streak', `${profile.daily.streak} day${profile.daily.streak === 1 ? '' : 's'}`),
      kpi('Tickets', `${profile.tickets}/${TICKETS.max}`),
    ),
    el(
      'div',
      { class: 'panel' },
      el(
        'div',
        { class: 'spread' },
        el('div', null,
          el('strong', { text: daily.available ? 'Daily bonus ready' : 'Daily bonus claimed' }),
          el('div', {
            class: 'muted',
            text: daily.available
              ? `Day ${daily.nextStreak} of your streak — 🪙 ${daily.coins}${daily.gems ? ` + 💎 ${daily.gems}` : ''}`
              : `Next one in ${formatDuration(daily.msUntilNext)}`,
          })),
        el('button', {
          class: 'btn btn-primary',
          text: 'Claim',
          disabled: !daily.available,
          onclick: claimDaily,
        }),
      ),
    ),
    el('h2', { text: 'Inventory' }),
    el(
      'div',
      { class: 'grid' },
      ...Object.entries(profile.items).map(([key, count]) =>
        el('div', { class: 'panel spread' },
          el('span', { text: ITEM_LABELS[key] ?? key }),
          el('strong', { text: String(count) })),
      ),
      ...profile.upgrades.map((up) =>
        el('div', { class: 'panel spread' },
          el('span', { text: UPGRADE_LABELS[up] ?? up }),
          el('span', { class: 'owned', text: 'active' })),
      ),
    ),
    el('h2', { text: 'Appearance' }),
    el(
      'div',
      { class: 'panel' },
      el('div', { class: 'row' },
        el('span', { class: 'muted', text: 'Theme' }),
        ...THEMES.map((theme) => cosmeticButton(theme, profile.themes, profile.active.theme, 'theme'))),
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('span', { class: 'muted', text: 'Card back' }),
        ...CARD_BACKS.map((back) => cosmeticButton(back, profile.cardBacks, profile.active.cardBack, 'cardBack'))),
    ),
    el('h2', { text: 'Settings' }),
    el(
      'div',
      { class: 'panel' },
      toggle('sound', 'Sound effects', profile.settings.sound),
      toggle('reducedMotion', 'Reduce animation', profile.settings.reducedMotion),
      toggle('drawThree', 'Solitaire: draw three', profile.settings.drawThree),
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', {
          class: 'btn btn-ghost btn-sm',
          text: 'Reset progress',
          onclick: resetProgress,
        }),
        el('span', { class: 'muted', style: 'font-size:12px', text: 'Purchases are kept.' })),
    ),
    el('h2', { text: 'Transactions' }),
    profile.ledger.length
      ? ledgerTable(profile.ledger)
      : el('div', { class: 'panel empty', text: 'Nothing yet — go win something.' }),
  );
}

const ITEM_LABELS = {
  undo: '↺ Undos',
  hint: '💡 Hints',
  skip: '⏭ Level skips',
  peek: '👁 Duel peeks',
  insure: '🛡 Insurances',
  swap: '🔄 Hand swaps',
};

const UPGRADE_LABELS = {
  coinDoubler: '✨ Coin Doubler',
  deepUndo: '⏪ Deep Undo',
  fastTickets: '⚡ Rapid Tickets',
};

function kpi(label, value) {
  return el('div', { class: 'box' }, el('div', { class: 'k', text: label }), el('div', { class: 'v', text: value }));
}

function cosmeticButton(cosmetic, owned, active, kind) {
  const isOwned = owned.includes(cosmetic.id);
  return el('button', {
    class: `btn btn-sm ${active === cosmetic.id ? 'btn-primary' : ''}`,
    text: isOwned ? cosmetic.name : `${cosmetic.name} 🔒`,
    disabled: !isOwned,
    onclick: async () => {
      await send(MSG.SET_ACTIVE, { [kind]: cosmetic.id });
      await app.refresh();
      route();
    },
  });
}

function toggle(key, label, value) {
  return el(
    'label',
    { class: 'switch' },
    el('input', {
      type: 'checkbox',
      checked: value,
      onchange: async (event) => {
        await send(MSG.SET_SETTING, { key, value: event.target.checked });
        await app.refresh();
      },
    }),
    el('span', { text: label }),
  );
}

function ledgerTable(ledger) {
  const table = el(
    'table',
    { class: 'ledger' },
    el('thead', null,
      el('tr', null,
        el('th', { text: 'When' }),
        el('th', { text: 'What' }),
        el('th', { text: 'Type' }),
        el('th', { class: 'amt', text: 'Amount' }),
        el('th', { class: 'amt', text: 'Balance' }))),
    el(
      'tbody',
      null,
      ...ledger.slice(0, 60).map((entry) =>
        el('tr', null,
          el('td', { class: 'muted', text: formatTime(entry.ts) }),
          el('td', { text: entry.label }),
          el('td', { class: 'muted', text: entry.kind }),
          el('td', {
            class: `amt ${entry.delta > 0 ? 'pos' : 'neg'}`,
            text: `${entry.delta > 0 ? '+' : ''}${entry.delta} ${symbol(entry.currency)}`,
          }),
          el('td', { class: 'amt muted', text: String(entry.balance) })),
      ),
    ),
  );
  return el('div', { class: 'panel', style: 'padding:6px' }, table);
}

function symbol(currency) {
  return { coins: '🪙', gems: '💎', item: '' }[currency] ?? '';
}

async function claimDaily() {
  try {
    const result = await send(MSG.CLAIM_DAILY);
    toast(
      `Day ${result.streak} bonus`,
      `🪙 +${result.coins}${result.gems ? ` · 💎 +${result.gems}` : ''}`,
      'good',
    );
    await app.refresh();
    route();
  } catch (err) {
    toast('Already claimed', explain(err.code), 'bad');
  }
}

async function resetProgress() {
  if (!confirm('Reset all progress, coins and gems? Purchased packs are kept.')) return;
  await send(MSG.RESET_PROFILE);
  await app.refresh();
  toast('Progress reset', 'Fresh save created.');
  route();
}

/* ------------------------------------------------------------------- start */

document.getElementById('tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (tab) location.hash = tab.dataset.view;
});

document.getElementById('daily-chip').addEventListener('click', claimDaily);

window.addEventListener('hashchange', route);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== EVENT_WALLET_CHANGED || !app.state) return;
  Object.assign(app.state.profile, {
    coins: message.wallet.coins,
    gems: message.wallet.gems,
    tickets: message.wallet.tickets,
  });
  paintChips(app.state.profile);
});

(async function start() {
  await app.refresh();
  await route();
})();

export { route };
