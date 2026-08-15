/**
 * Arcade shell: hash router, wallet header, and the Arcade / Store / Wallet
 * screens. Games come from `games/registry.js` — each mounts itself into
 * `#view` and returns a teardown function.
 */

import { MSG, EVENT_WALLET_CHANGED, send } from '../common/messages.js';
import { IS_SANDBOX } from '../config.js';
import {
  ACHIEVEMENTS,
  CARD_BACKS,
  IAP_PACKS,
  STORE_ITEMS,
  THEMES,
  TICKETS,
} from '../store/catalog.js';
import { ownsItem } from '../store/economy.js';
import { GAMES, GAME_BY_ID } from '../games/registry.js';
import { clear, el, formatDuration, formatTime, toast } from './ui.js';

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

/* ------------------------------------------------------------------ chrome */

function applyCosmetics(profile) {
  document.documentElement.dataset.theme = profile.active.theme ?? 'midnight';
  document.documentElement.dataset.cardback = profile.active.cardBack ?? 'classic';
}

function paintChips(profile) {
  setChip('coins', profile.coins.toLocaleString());
  setChip('gems', profile.gems.toLocaleString());
  setChip('tickets', `${profile.tickets}/${TICKETS.max}`);
  document.getElementById('daily-chip').hidden = !app.state?.daily?.available;
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
  const game = GAME_BY_ID.get(name);
  const render = game ? (root) => game.mount(root, app) : (VIEWS[name] ?? VIEWS.arcade);
  if (!game && !VIEWS[name]) location.replace('#arcade');

  if (teardown) {
    teardown();
    teardown = null;
  }

  const section = game ? 'arcade' : VIEWS[name] ? name : 'arcade';
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.view === section) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }

  clear(viewRoot);

  // Games mount into their own host: several of them clear their root as they
  // switch screens, which would otherwise take the switcher with it.
  let host = viewRoot;
  if (game) {
    viewRoot.append(gameSwitcher(game.id));
    host = el('div');
    viewRoot.append(host);
  }

  teardown = (await render(host)) ?? null;
  viewRoot.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

/** Quick jump between games without going back to the hub first. */
function gameSwitcher(activeId) {
  const bar = el('div', { class: 'row', style: 'margin-bottom:18px' });
  bar.append(
    el('button', {
      class: 'btn btn-sm btn-ghost',
      text: '← Arcade',
      onclick: () => { location.hash = 'arcade'; },
    }),
    el(
      'div',
      { class: 'seg' },
      ...GAMES.map((game) =>
        el('button', {
          text: game.name,
          'aria-pressed': game.id === activeId,
          onclick: () => { location.hash = game.id; },
        }),
      ),
    ),
  );
  return bar;
}

/* ------------------------------------------------------------------ arcade */

function renderArcade(root) {
  const { profile } = app.state;
  const daily = app.state.daily;
  const solved = Object.values(profile.sokoban.levels).filter((l) => l.solved).length;
  const totalStars = Object.values(profile.sokoban.levels).reduce((sum, l) => sum + (l.stars ?? 0), 0);
  const wins =
    profile.solitaire.wins +
    profile.freecell.wins +
    profile.pairs.wins +
    profile.sweeper.wins +
    profile.duel.wins;

  root.append(
    el(
      'section',
      { class: 'hero' },
      el('div', null,
        el('h1', { text: 'Six games. One wallet.' }),
        el('p', { class: 'sub', style: 'margin-bottom:14px', text:
          'Coins you earn anywhere spend everywhere. Nothing purchasable blocks progress — gems buy convenience and cosmetics.' }),
        el('div', { class: 'row' },
          el('button', {
            class: 'btn btn-primary',
            text: daily.available ? `Claim day ${daily.nextStreak} bonus` : 'Store',
            onclick: () => (daily.available ? claimDaily() : (location.hash = 'store')),
          }),
          el('span', { class: 'pill', text: `${profile.achievements.length}/${ACHIEVEMENTS.length} achievements` }),
          profile.upgrades.includes('coinDoubler') ? el('span', { class: 'pill hot', text: '✨ Coin Doubler active' }) : null)),
      el(
        'div',
        { class: 'hero-stats' },
        el('div', { class: 'hero-stat' },
          el('div', { class: 'v num', text: String(wins) }),
          el('div', { class: 'k', text: 'Wins' })),
        el('div', { class: 'hero-stat' },
          el('div', { class: 'v num', text: `${solved}/${app.state.levels.length}` }),
          el('div', { class: 'k', text: 'Levels' })),
        el('div', { class: 'hero-stat' },
          el('div', { class: 'v num', text: `${totalStars}★` }),
          el('div', { class: 'k', text: 'Stars' })),
        el('div', { class: 'hero-stat' },
          streakRing(profile.daily.streak),
          el('div', { class: 'k', style: 'text-align:center;margin-top:4px', text: 'Streak' })),
      ),
    ),
    el('div', { class: 'game-cards' }, ...GAMES.map((game) => gameCard(game, profile))),
    el('h2', { text: 'Achievements' }),
    el(
      'div',
      { class: 'grid' },
      ...ACHIEVEMENTS.map((achievement) => {
        const earned = profile.achievements.includes(achievement.id);
        return el(
          'div',
          { class: `achievement ${earned ? 'earned' : ''}` },
          el('span', { class: 'medal', text: earned ? '★' : '·' }),
          el('div', { style: 'flex:1' },
            el('div', { style: 'font-weight:650;font-size:14px', text: achievement.name }),
            el('div', { class: 'muted tiny', text: achievement.blurb })),
          el('span', { class: earned ? 'owned' : 'muted', text: earned ? '✓' : `💎 ${achievement.gems}` }),
        );
      }),
    ),
  );
}

function streakRing(streak) {
  const ring = el('div', { class: 'ring' }, el('span', { text: String(streak) }));
  ring.style.setProperty('--pct', String(Math.min(100, (streak / 7) * 100)));
  return ring;
}

function gameCard(game, profile) {
  const art = el('div', { class: 'game-art' });
  game.art(art);

  return el(
    'button',
    { class: 'game-card', onclick: () => { location.hash = game.id; } },
    art,
    el(
      'div',
      { class: 'game-body' },
      el('div', { class: 'game-meta' }, ...game.tags.map((tag) => el('span', { class: 'tag', text: tag }))),
      el('h3', { text: game.name }),
      el('p', { text: game.blurb }),
      el('div', { class: 'spread' },
        el('span', { class: 'muted tiny', text: game.stat(profile) }),
        el('span', { class: 'tiny', style: 'color:var(--accent);font-weight:650', text: 'Play →' })),
    ),
  );
}

/* ------------------------------------------------------------------- store */

function renderStore(root) {
  const { profile } = app.state;

  root.append(
    el('h1', { text: 'Store' }),
    el('p', { class: 'sub', text: 'Coins come from playing. Gems come from the daily streak, achievements, or the packs below.' }),
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

  root.append(
    el('h2', { text: 'Gem packs' }),
    el('div', { class: 'grid' }, ...IAP_PACKS.map((pack) => packCard(pack, profile))),
    el(
      'div',
      { class: 'row', style: 'margin-top:14px' },
      el('button', { class: 'btn btn-ghost btn-sm', text: 'Restore purchases', onclick: restorePurchases }),
      el('span', { class: 'muted tiny', text: IS_SANDBOX
        ? 'Sandbox purchases stay on this device.'
        : 'Re-checks your entitlements with the payment server.' }),
    ),
  );

  for (const [kind, heading] of [
    ['consumable', 'Consumables'],
    ['upgrade', 'Permanent upgrades'],
    ['cosmetic', 'Cosmetics'],
  ]) {
    root.append(
      el('h2', { text: heading }),
      el(
        'div',
        { class: 'grid' },
        ...STORE_ITEMS.filter((item) => item.kind === kind).map((item) => storeCard(item, profile)),
      ),
    );
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
    held !== null ? el('div', { class: 'muted tiny', text: `You hold ${held}` }) : null,
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
    el('div', { style: 'font-size:26px', text: pack.icon }),
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
      toast('Checkout opened', 'Finish payment in the new tab, then press Restore purchases.');
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
      kpi('Daily streak', `${profile.daily.streak}d`),
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
          el('div', { class: 'muted tiny', text: daily.available
            ? `Day ${daily.nextStreak} of your streak — 🪙 ${daily.coins}${daily.gems ? ` + 💎 ${daily.gems}` : ''}`
            : `Next one in ${formatDuration(daily.msUntilNext)}` })),
        el('button', { class: 'btn btn-primary', text: 'Claim', disabled: !daily.available, onclick: claimDaily }),
      ),
    ),
    el('h2', { text: 'Records' }),
    el(
      'div',
      { class: 'grid' },
      ...GAMES.map((game) =>
        el('div', { class: 'panel spread' },
          el('span', { text: game.name }),
          el('strong', { class: 'tiny', text: game.stat(profile) })),
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
      el('div', { class: 'side-title', text: 'Theme' }),
      el('div', { class: 'row' }, ...THEMES.map((theme) => cosmeticButton(theme, profile.themes, profile.active.theme, 'theme'))),
      el('div', { class: 'side-title', style: 'margin-top:14px', text: 'Card back' }),
      el('div', { class: 'row' }, ...CARD_BACKS.map((back) => cosmeticButton(back, profile.cardBacks, profile.active.cardBack, 'cardBack'))),
    ),
    el('h2', { text: 'Settings' }),
    el(
      'div',
      { class: 'panel' },
      toggle('sound', 'Sound effects', profile.settings.sound),
      toggle('reducedMotion', 'Reduce animation', profile.settings.reducedMotion),
      toggle('drawThree', 'Solitaire: draw three', profile.settings.drawThree),
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { class: 'btn btn-ghost btn-sm', text: 'Reset progress', onclick: resetProgress }),
        el('span', { class: 'muted tiny', text: 'Purchases are kept.' })),
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
          el('td', { class: `amt ${entry.delta > 0 ? 'pos' : 'neg'}`,
            text: `${entry.delta > 0 ? '+' : ''}${entry.delta} ${symbol(entry.currency)}` }),
          el('td', { class: 'amt muted', text: String(entry.balance) })),
      ),
    ),
  );
  return el('div', { class: 'panel panel-flush' }, table);
}

function symbol(currency) {
  return { coins: '🪙', gems: '💎', item: '' }[currency] ?? '';
}

async function claimDaily() {
  try {
    const result = await send(MSG.CLAIM_DAILY);
    toast(`Day ${result.streak} bonus`, `🪙 +${result.coins}${result.gems ? ` · 💎 +${result.gems}` : ''}`, 'good');
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

const VIEWS = {
  arcade: renderArcade,
  store: renderStore,
  wallet: renderWallet,
};

/* ------------------------------------------------------------------- start */

document.getElementById('tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (tab) location.hash = tab.dataset.view;
});

document.getElementById('home').addEventListener('click', () => {
  location.hash = 'arcade';
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
