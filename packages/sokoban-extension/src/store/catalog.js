/**
 * The single source of truth for prices, payouts and everything purchasable.
 *
 * Two currencies:
 *   COINS  earned by playing. Never sold for money, so the arcade stays fully
 *          playable for free.
 *   GEMS   premium. Earned slowly (daily streak, achievements) or bought with
 *          real money through the payment provider in `payments.js`.
 *
 * Design rule enforced here: nothing behind a paywall blocks progress. Gems buy
 * convenience (refills, skips), cosmetics and a coin multiplier — never levels.
 */

export const CURRENCY = { COINS: 'coins', GEMS: 'gems' };

export const TICKETS = {
  max: 5,
  regenMs: 20 * 60 * 1000, // one Duel ticket every 20 minutes
};

/** Payout tables. Keep these in one place so the economy can be re-balanced. */
export const REWARDS = {
  sokoban: {
    firstClear: 40,
    replay: 8,
    starBonus: [0, 10, 25, 60], // index = stars
    parGems: 1, // a move-optimal (3-star) first clear also pays a gem
  },
  solitaire: {
    win: 60,
    perFoundationCard: 2, // partial credit when you abandon a deal
    noUndoBonus: 25,
    dailyDealBonus: 40,
  },
  freecell: {
    win: 90, // every card is visible, so a win is calculation rather than luck
    perFoundationCard: 2,
    noUndoBonus: 40,
  },
  pairs: {
    win: 35,
    perfectBonus: 45,
    comboBonus: 5, // × longest run of consecutive matches
    mistakePenalty: 2,
    minimum: 10,
  },
  sweeper: {
    win: { calm: 60, brisk: 120, fierce: 220 },
    partial: 45, // × fraction of safe squares uncovered when you hit a mine
    flawlessGems: { fierce: 2 },
  },
  duel: {
    win: 45,
    draw: 10,
    perRoundWon: 4,
    streakBonus: 15, // × current win streak, capped below
    maxStreakMultiplier: 5,
    flawlessGems: 1, // 5-0 sweep
  },
  daily: {
    // Escalating login streak; index 0 = day 1. Caps at the last entry.
    coins: [50, 75, 100, 150, 200, 300, 500],
    gemsOnDay: { 3: 1, 7: 5 },
  },
};

export const STAR_THRESHOLDS = [1.0, 1.35, 1.9]; // × par → 3, 2, 1 stars

export function starsFor(moves, par) {
  if (!par || moves <= 0) return 0;
  const ratio = moves / par;
  if (ratio <= STAR_THRESHOLDS[0]) return 3;
  if (ratio <= STAR_THRESHOLDS[1]) return 2;
  if (ratio <= STAR_THRESHOLDS[2]) return 1;
  return 1; // finishing at all is worth a star
}

/**
 * Items bought with in-game currency. `grant` is applied by `economy.js`.
 *   kind: 'consumable' — stacks in the inventory
 *         'upgrade'    — one-time permanent effect
 *         'cosmetic'   — one-time unlock, selectable in Settings
 */
export const STORE_ITEMS = [
  {
    id: 'undo_5',
    kind: 'consumable',
    name: 'Undo Pack',
    blurb: '5 extra undos for Sokoban, on top of the free ones each level.',
    icon: '↺',
    price: { currency: CURRENCY.COINS, amount: 120 },
    grant: { items: { undo: 5 } },
  },
  {
    id: 'hint_3',
    kind: 'consumable',
    name: 'Hint Charges ×3',
    blurb: 'Each charge reveals the next three moves of the optimal solution.',
    icon: '💡',
    price: { currency: CURRENCY.COINS, amount: 200 },
    grant: { items: { hint: 3 } },
  },
  {
    id: 'skip_1',
    kind: 'consumable',
    name: 'Level Skip',
    blurb: 'Stuck? Bank the level as cleared (no stars) and move on.',
    icon: '⏭',
    price: { currency: CURRENCY.GEMS, amount: 8 },
    grant: { items: { skip: 1 } },
  },
  {
    id: 'peek_3',
    kind: 'consumable',
    name: 'Duel Peek ×3',
    blurb: "See the opponent's committed card before you choose.",
    icon: '👁',
    price: { currency: CURRENCY.COINS, amount: 150 },
    grant: { items: { peek: 3 } },
  },
  {
    id: 'insure_3',
    kind: 'consumable',
    name: 'Duel Insurance ×3',
    blurb: 'Voids the next round you lose. One per duel.',
    icon: '🛡',
    price: { currency: CURRENCY.COINS, amount: 180 },
    grant: { items: { insure: 3 } },
  },
  {
    id: 'swap_3',
    kind: 'consumable',
    name: 'Hand Swap ×3',
    blurb: 'Bury a dead hand and draw five fresh cards.',
    icon: '🔄',
    price: { currency: CURRENCY.COINS, amount: 160 },
    grant: { items: { swap: 3 } },
  },
  {
    id: 'tickets_full',
    kind: 'consumable',
    name: 'Refill Duel Tickets',
    blurb: 'Top the ticket meter straight back up to five.',
    icon: '🎟',
    price: { currency: CURRENCY.GEMS, amount: 5 },
    grant: { refillTickets: true },
  },
  {
    id: 'coin_doubler',
    kind: 'upgrade',
    name: 'Coin Doubler',
    blurb: 'Permanent: every coin payout in every game is doubled.',
    icon: '✨',
    price: { currency: CURRENCY.GEMS, amount: 60 },
    grant: { upgrades: ['coinDoubler'] },
  },
  {
    id: 'deep_undo',
    kind: 'upgrade',
    name: 'Deep Undo',
    blurb: 'Permanent: unlimited free undos in Sokoban and Solitaire.',
    icon: '⏪',
    price: { currency: CURRENCY.GEMS, amount: 45 },
    grant: { upgrades: ['deepUndo'] },
  },
  {
    id: 'fast_tickets',
    kind: 'upgrade',
    name: 'Rapid Tickets',
    blurb: 'Permanent: Duel tickets regenerate twice as fast.',
    icon: '⚡',
    price: { currency: CURRENCY.GEMS, amount: 40 },
    grant: { upgrades: ['fastTickets'] },
  },
  {
    id: 'theme_neon',
    kind: 'cosmetic',
    name: 'Neon Theme',
    blurb: 'Electric magenta and cyan across the whole arcade.',
    icon: '🎨',
    price: { currency: CURRENCY.COINS, amount: 900 },
    grant: { themes: ['neon'] },
  },
  {
    id: 'theme_forest',
    kind: 'cosmetic',
    name: 'Forest Theme',
    blurb: 'Soft greens and warm wood. Easy on late-night eyes.',
    icon: '🌲',
    price: { currency: CURRENCY.COINS, amount: 900 },
    grant: { themes: ['forest'] },
  },
  {
    id: 'theme_mono',
    kind: 'cosmetic',
    name: 'Blueprint Theme',
    blurb: 'Monochrome drafting-paper look with hairline grids.',
    icon: '📐',
    price: { currency: CURRENCY.GEMS, amount: 25 },
    grant: { themes: ['mono'] },
  },
  {
    id: 'back_circuit',
    kind: 'cosmetic',
    name: 'Circuit Card Back',
    blurb: 'Etched circuitry on the back of every card.',
    icon: '🂠',
    price: { currency: CURRENCY.COINS, amount: 600 },
    grant: { cardBacks: ['circuit'] },
  },
  {
    id: 'back_gold',
    kind: 'cosmetic',
    name: 'Gold Leaf Card Back',
    blurb: 'Because a solitaire win should look expensive.',
    icon: '🏅',
    price: { currency: CURRENCY.GEMS, amount: 20 },
    grant: { cardBacks: ['gold'] },
  },
];

export const STORE_ITEM_BY_ID = new Map(STORE_ITEMS.map((i) => [i.id, i]));

/**
 * Real-money products. `priceUsd` is display only — the authoritative amount
 * lives with the payment provider; see README "Wiring up real payments".
 */
export const IAP_PACKS = [
  {
    sku: 'gems_100',
    name: 'Pocket of Gems',
    gems: 100,
    priceUsd: 1.99,
    icon: '💎',
    blurb: 'A starter handful.',
  },
  {
    sku: 'gems_550',
    name: 'Pouch of Gems',
    gems: 550,
    bonus: '+10%',
    priceUsd: 8.99,
    icon: '💎',
    blurb: 'Best for a first upgrade.',
    popular: true,
  },
  {
    sku: 'gems_1200',
    name: 'Chest of Gems',
    gems: 1200,
    bonus: '+20%',
    priceUsd: 17.99,
    icon: '💎',
    blurb: 'Doubler, Deep Undo and change to spare.',
  },
  {
    sku: 'gems_2600',
    name: 'Vault of Gems',
    gems: 2600,
    bonus: '+30%',
    priceUsd: 34.99,
    icon: '💎',
    blurb: 'Everything in the store, twice over.',
  },
  {
    sku: 'starter_bundle',
    name: 'Starter Bundle',
    gems: 300,
    priceUsd: 4.99,
    icon: '🎁',
    blurb: 'Gems plus Coin Doubler and the Neon theme.',
    grant: { upgrades: ['coinDoubler'], themes: ['neon'], coins: 500 },
    oneTime: true,
  },
  {
    sku: 'collectors_pack',
    name: "Collector's Pack",
    gems: 400,
    priceUsd: 9.99,
    icon: '👑',
    blurb: 'Every theme and card back, Deep Undo, Rapid Tickets, forever.',
    grant: {
      upgrades: ['coinDoubler', 'deepUndo', 'fastTickets'],
      themes: ['neon', 'forest', 'mono'],
      cardBacks: ['circuit', 'gold'],
      coins: 1000,
    },
    oneTime: true,
  },
];

export const IAP_BY_SKU = new Map(IAP_PACKS.map((p) => [p.sku, p]));

export const THEMES = [
  { id: 'midnight', name: 'Midnight', free: true },
  { id: 'neon', name: 'Neon' },
  { id: 'forest', name: 'Forest' },
  { id: 'mono', name: 'Blueprint' },
];

export const CARD_BACKS = [
  { id: 'classic', name: 'Classic', free: true },
  { id: 'circuit', name: 'Circuit' },
  { id: 'gold', name: 'Gold Leaf' },
];

export const ACHIEVEMENTS = [
  { id: 'first_clear', name: 'First Push', blurb: 'Clear a Sokoban level.', gems: 1 },
  { id: 'ten_clears', name: 'Warehouse Hand', blurb: 'Clear 10 levels.', gems: 3 },
  { id: 'all_clears', name: 'Foreman', blurb: 'Clear every level.', gems: 25 },
  { id: 'perfectionist', name: 'Perfectionist', blurb: 'Earn 3 stars on 10 levels.', gems: 5 },
  { id: 'first_patience', name: 'Patience', blurb: 'Win a game of Solitaire.', gems: 2 },
  { id: 'card_sharp', name: 'Card Sharp', blurb: 'Win 10 duels.', gems: 5 },
  { id: 'flawless', name: 'Flawless', blurb: 'Win a duel 5–0.', gems: 3 },
  { id: 'calculator', name: 'Calculator', blurb: 'Win a FreeCell deal.', gems: 3 },
  { id: 'total_recall', name: 'Total Recall', blurb: 'Clear Pairs without a single mistake.', gems: 4 },
  { id: 'demolitionist', name: 'Demolitionist', blurb: 'Clear a Fierce minefield.', gems: 6 },
  { id: 'all_rounder', name: 'All-Rounder', blurb: 'Win at least once in all six games.', gems: 10 },
  { id: 'week_streak', name: 'Regular', blurb: 'Claim 7 daily bonuses in a row.', gems: 5 },
];
