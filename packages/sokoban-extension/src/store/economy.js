/**
 * The wallet and its rules.
 *
 * Every function here mutates a *draft* profile and returns a plain result.
 * The service worker owns the only real profile: it loads it, runs one of
 * these, then persists — so balances can never be edited by a game page, only
 * requested through a message that lands in one of these functions.
 *
 * `now` is always injected so the daily bonus and ticket regeneration are
 * testable without waiting a day.
 */

import {
  ACHIEVEMENTS,
  CURRENCY,
  IAP_BY_SKU,
  REWARDS,
  STORE_ITEM_BY_ID,
  TICKETS,
  starsFor,
} from './catalog.js';

export const PROFILE_VERSION = 1;
const LEDGER_LIMIT = 250;

export function createProfile(now = Date.now()) {
  return {
    version: PROFILE_VERSION,
    createdAt: now,
    uid: cryptoId(),
    seq: 1,
    coins: 100, // enough to feel the store without needing the wallet
    gems: 5,
    items: { undo: 3, hint: 1, skip: 0, peek: 1, insure: 0, swap: 1 },
    upgrades: [],
    themes: ['midnight'],
    cardBacks: ['classic'],
    active: { theme: 'midnight', cardBack: 'classic' },
    tickets: TICKETS.max,
    ticketsUpdatedAt: now,
    sokoban: { levels: {}, unlocked: 1 },
    solitaire: { wins: 0, played: 0, bestMoves: null, streak: 0 },
    duel: { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 },
    freecell: { wins: 0, played: 0, bestMoves: null },
    pairs: { wins: 0, played: 0, perfects: 0, bestCombo: 0 },
    sweeper: { wins: 0, played: 0, byDifficulty: {} },
    daily: { lastClaimDay: null, streak: 0 },
    achievements: [],
    ledger: [],
    receipts: [],
    settings: { sound: true, reducedMotion: false, drawThree: false },
    stats: { coinsEarned: 0, coinsSpent: 0, gemsSpent: 0, sessions: 0 },
  };
}

function cryptoId() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fills in anything a newer version added, without clobbering saved values. */
export function migrate(profile) {
  const base = createProfile(profile?.createdAt ?? Date.now());
  if (!profile) return base;
  const merged = { ...base, ...profile };
  merged.items = { ...base.items, ...(profile.items ?? {}) };
  merged.active = { ...base.active, ...(profile.active ?? {}) };
  merged.sokoban = { ...base.sokoban, ...(profile.sokoban ?? {}) };
  merged.solitaire = { ...base.solitaire, ...(profile.solitaire ?? {}) };
  merged.duel = { ...base.duel, ...(profile.duel ?? {}) };
  merged.freecell = { ...base.freecell, ...(profile.freecell ?? {}) };
  merged.pairs = { ...base.pairs, ...(profile.pairs ?? {}) };
  merged.sweeper = { ...base.sweeper, ...(profile.sweeper ?? {}) };
  merged.daily = { ...base.daily, ...(profile.daily ?? {}) };
  merged.settings = { ...base.settings, ...(profile.settings ?? {}) };
  merged.stats = { ...base.stats, ...(profile.stats ?? {}) };
  merged.version = PROFILE_VERSION;
  return merged;
}

/* ------------------------------------------------------------------ ledger */

function record(profile, entry) {
  profile.ledger.unshift({ id: `t${profile.seq++}`, ...entry });
  if (profile.ledger.length > LEDGER_LIMIT) profile.ledger.length = LEDGER_LIMIT;
}

export function credit(profile, currency, amount, label, meta = {}) {
  if (amount <= 0) return 0;
  profile[currency] += amount;
  if (currency === CURRENCY.COINS) profile.stats.coinsEarned += amount;
  record(profile, {
    ts: meta.now ?? Date.now(),
    currency,
    delta: amount,
    balance: profile[currency],
    label,
    kind: meta.kind ?? 'earn',
  });
  return amount;
}

export function debit(profile, currency, amount, label, meta = {}) {
  if (amount <= 0) return true;
  if (profile[currency] < amount) return false;
  profile[currency] -= amount;
  if (currency === CURRENCY.COINS) profile.stats.coinsSpent += amount;
  if (currency === CURRENCY.GEMS) profile.stats.gemsSpent += amount;
  record(profile, {
    ts: meta.now ?? Date.now(),
    currency,
    delta: -amount,
    balance: profile[currency],
    label,
    kind: meta.kind ?? 'spend',
  });
  return true;
}

function coinMultiplier(profile) {
  return profile.upgrades.includes('coinDoubler') ? 2 : 1;
}

function payout(profile, coins, label, now) {
  const total = coins * coinMultiplier(profile);
  credit(profile, CURRENCY.COINS, total, label, { now });
  return total;
}

/* ----------------------------------------------------------------- tickets */

/** Tickets regenerate on a clock, so they're computed rather than stored. */
export function syncTickets(profile, now = Date.now()) {
  const regen = profile.upgrades.includes('fastTickets')
    ? TICKETS.regenMs / 2
    : TICKETS.regenMs;

  if (profile.tickets >= TICKETS.max) {
    profile.ticketsUpdatedAt = now;
    return { tickets: profile.tickets, nextInMs: 0, regenMs: regen };
  }

  const elapsed = Math.max(0, now - (profile.ticketsUpdatedAt ?? now));
  const gained = Math.floor(elapsed / regen);
  if (gained > 0) {
    profile.tickets = Math.min(TICKETS.max, profile.tickets + gained);
    profile.ticketsUpdatedAt = (profile.ticketsUpdatedAt ?? now) + gained * regen;
  }
  if (profile.tickets >= TICKETS.max) {
    profile.ticketsUpdatedAt = now;
    return { tickets: profile.tickets, nextInMs: 0, regenMs: regen };
  }
  return {
    tickets: profile.tickets,
    nextInMs: regen - (now - profile.ticketsUpdatedAt),
    regenMs: regen,
  };
}

export function spendTicket(profile, now = Date.now()) {
  syncTickets(profile, now);
  if (profile.tickets <= 0) return false;
  if (profile.tickets === TICKETS.max) profile.ticketsUpdatedAt = now;
  profile.tickets--;
  return true;
}

/* -------------------------------------------------------------- inventory */

export function useItem(profile, key, now = Date.now()) {
  if ((profile.items[key] ?? 0) <= 0) return false;
  profile.items[key]--;
  record(profile, {
    ts: now,
    currency: 'item',
    delta: -1,
    balance: profile.items[key],
    label: `Used ${key}`,
    kind: 'item',
  });
  return true;
}

function applyGrant(profile, grant, now) {
  if (!grant) return;
  if (grant.coins) credit(profile, CURRENCY.COINS, grant.coins, 'Bundle coins', { now, kind: 'grant' });
  if (grant.gems) credit(profile, CURRENCY.GEMS, grant.gems, 'Bundle gems', { now, kind: 'grant' });
  for (const [key, count] of Object.entries(grant.items ?? {})) {
    profile.items[key] = (profile.items[key] ?? 0) + count;
  }
  for (const up of grant.upgrades ?? []) {
    if (!profile.upgrades.includes(up)) profile.upgrades.push(up);
  }
  for (const theme of grant.themes ?? []) {
    if (!profile.themes.includes(theme)) profile.themes.push(theme);
  }
  for (const back of grant.cardBacks ?? []) {
    if (!profile.cardBacks.includes(back)) profile.cardBacks.push(back);
  }
  if (grant.refillTickets) {
    profile.tickets = TICKETS.max;
    profile.ticketsUpdatedAt = now;
  }
}

export function ownsItem(profile, item) {
  if (item.kind === 'upgrade') {
    return (item.grant.upgrades ?? []).every((u) => profile.upgrades.includes(u));
  }
  if (item.kind === 'cosmetic') {
    return (
      (item.grant.themes ?? []).every((t) => profile.themes.includes(t)) &&
      (item.grant.cardBacks ?? []).every((b) => profile.cardBacks.includes(b))
    );
  }
  return false;
}

/** Buy a store item with in-game currency. */
export function buyItem(profile, itemId, now = Date.now()) {
  const item = STORE_ITEM_BY_ID.get(itemId);
  if (!item) return { ok: false, error: 'unknown_item' };
  if (ownsItem(profile, item)) return { ok: false, error: 'already_owned' };

  const { currency, amount } = item.price;
  if (profile[currency] < amount) return { ok: false, error: 'insufficient_funds' };

  debit(profile, currency, amount, item.name, { now, kind: 'purchase' });
  applyGrant(profile, item.grant, now);
  return { ok: true, item };
}

/**
 * Credit a *verified* real-money purchase. `receiptId` must be unique — that
 * is what stops a replayed success message from minting gems twice.
 */
export function grantIap(profile, sku, receiptId, now = Date.now()) {
  const pack = IAP_BY_SKU.get(sku);
  if (!pack) return { ok: false, error: 'unknown_sku' };
  if (!receiptId) return { ok: false, error: 'missing_receipt' };
  if (profile.receipts.includes(receiptId)) return { ok: false, error: 'duplicate_receipt' };
  if (pack.oneTime && profile.receipts.some((r) => r.startsWith(`${sku}:`))) {
    return { ok: false, error: 'already_purchased' };
  }

  profile.receipts.push(receiptId);
  if (profile.receipts.length > 200) profile.receipts.shift();

  credit(profile, CURRENCY.GEMS, pack.gems, pack.name, { now, kind: 'iap' });
  applyGrant(profile, pack.grant, now);

  return { ok: true, pack };
}

/* ------------------------------------------------------------------ payouts */

export function awardSokoban(profile, { levelId, moves, par }, now = Date.now()) {
  const stars = starsFor(moves, par);
  const record_ = profile.sokoban.levels[levelId];
  const first = !record_?.solved;
  const table = REWARDS.sokoban;

  let coins = first ? table.firstClear : table.replay;
  coins += first ? table.starBonus[stars] : Math.round(table.starBonus[stars] / 4);

  const earned = payout(profile, coins, first ? 'Level cleared' : 'Level replayed', now);

  let gems = 0;
  if (first && stars === 3) {
    gems = credit(profile, CURRENCY.GEMS, table.parGems, 'Move-optimal clear', {
      now,
      kind: 'earn',
    });
  }

  profile.sokoban.levels[levelId] = {
    solved: true,
    stars: Math.max(stars, record_?.stars ?? 0),
    bestMoves: record_?.bestMoves ? Math.min(record_.bestMoves, moves) : moves,
    clears: (record_?.clears ?? 0) + 1,
  };

  return { coins: earned, gems, stars, first };
}

export function awardSolitaire(profile, { won, foundation, usedUndo }, now = Date.now()) {
  const table = REWARDS.solitaire;
  profile.solitaire.played++;

  let coins = 0;
  if (won) {
    profile.solitaire.wins++;
    profile.solitaire.streak++;
    coins = table.win;
    if (!usedUndo) coins += table.noUndoBonus;
  } else {
    profile.solitaire.streak = 0;
    coins = foundation * table.perFoundationCard;
  }

  const earned = payout(profile, coins, won ? 'Solitaire won' : 'Solitaire progress', now);
  return { coins: earned, won };
}

export function awardFreecell(profile, { won, foundation, usedUndo }, now = Date.now()) {
  const table = REWARDS.freecell;
  profile.freecell.played++;

  let coins;
  if (won) {
    profile.freecell.wins++;
    coins = table.win + (usedUndo ? 0 : table.noUndoBonus);
  } else {
    coins = foundation * table.perFoundationCard;
  }

  return { coins: payout(profile, coins, won ? 'FreeCell won' : 'FreeCell progress', now), won };
}

export function awardPairs(profile, { won, mistakes, bestCombo, board }, now = Date.now()) {
  const table = REWARDS.pairs;
  profile.pairs.played++;
  if (!won) return { coins: 0, won: false };

  profile.pairs.wins++;
  profile.pairs.bestCombo = Math.max(profile.pairs.bestCombo, bestCombo);
  if (mistakes === 0) profile.pairs.perfects++;

  const size = board === 'hard' ? 1.6 : board === 'small' ? 0.6 : 1;
  const raw =
    table.win * size +
    (mistakes === 0 ? table.perfectBonus : 0) +
    bestCombo * table.comboBonus -
    mistakes * table.mistakePenalty;

  const coins = Math.max(table.minimum, Math.round(raw));
  return { coins: payout(profile, coins, 'Pairs cleared', now), won: true, perfect: mistakes === 0 };
}

export function awardSweeper(profile, { won, difficulty, progress }, now = Date.now()) {
  const table = REWARDS.sweeper;
  profile.sweeper.played++;

  let gems = 0;
  let coins;
  if (won) {
    profile.sweeper.wins++;
    profile.sweeper.byDifficulty[difficulty] = (profile.sweeper.byDifficulty[difficulty] ?? 0) + 1;
    coins = table.win[difficulty] ?? table.win.calm;
    const bonusGems = table.flawlessGems[difficulty] ?? 0;
    if (bonusGems) gems = credit(profile, CURRENCY.GEMS, bonusGems, 'Fierce minefield cleared', { now });
  } else {
    coins = Math.round(table.partial * progress);
  }

  return { coins: payout(profile, coins, won ? 'Minefield cleared' : 'Sweeper progress', now), gems, won };
}

export function awardDuel(profile, { result, roundsWon }, now = Date.now()) {
  const table = REWARDS.duel;
  let coins = table.perRoundWon * roundsWon;
  let gems = 0;

  if (result === 'win') {
    profile.duel.wins++;
    profile.duel.streak++;
    profile.duel.bestStreak = Math.max(profile.duel.bestStreak, profile.duel.streak);
    coins += table.win;
    coins +=
      table.streakBonus *
      Math.min(profile.duel.streak, table.maxStreakMultiplier);
    if (roundsWon >= 5) {
      profile.stats.flawless = true;
      gems = credit(profile, CURRENCY.GEMS, table.flawlessGems, 'Flawless duel', { now });
    }
  } else if (result === 'draw') {
    profile.duel.draws++;
    coins += table.draw;
  } else {
    profile.duel.losses++;
    profile.duel.streak = 0;
  }

  const earned = payout(profile, coins, `Duel ${result}`, now);
  return { coins: earned, gems, result };
}

/* -------------------------------------------------------------- daily bonus */

export function dayNumber(now) {
  return Math.floor(now / 86_400_000);
}

export function dailyStatus(profile, now = Date.now()) {
  const today = dayNumber(now);
  const last = profile.daily.lastClaimDay;
  const available = last !== today;
  const nextStreak = last === today - 1 ? profile.daily.streak + 1 : 1;
  const index = Math.min(nextStreak - 1, REWARDS.daily.coins.length - 1);
  return {
    available,
    streak: profile.daily.streak,
    nextStreak,
    coins: REWARDS.daily.coins[index] * coinMultiplier(profile),
    gems: REWARDS.daily.gemsOnDay[nextStreak] ?? 0,
    msUntilNext: available ? 0 : (today + 1) * 86_400_000 - now,
  };
}

export function claimDaily(profile, now = Date.now()) {
  const status = dailyStatus(profile, now);
  if (!status.available) return { ok: false, error: 'already_claimed', status };

  profile.daily.streak = status.nextStreak;
  profile.daily.lastClaimDay = dayNumber(now);

  const index = Math.min(status.nextStreak - 1, REWARDS.daily.coins.length - 1);
  const coins = payout(profile, REWARDS.daily.coins[index], 'Daily bonus', now);
  const gems = status.gems
    ? credit(profile, CURRENCY.GEMS, status.gems, 'Daily streak reward', { now })
    : 0;

  return { ok: true, coins, gems, streak: profile.daily.streak };
}

/* ------------------------------------------------------------ achievements */

const ACHIEVEMENT_TESTS = {
  first_clear: (p) => solvedCount(p) >= 1,
  ten_clears: (p) => solvedCount(p) >= 10,
  all_clears: (p, ctx) => ctx.levelCount > 0 && solvedCount(p) >= ctx.levelCount,
  perfectionist: (p) => starCount(p, 3) >= 10,
  first_patience: (p) => p.solitaire.wins >= 1,
  card_sharp: (p) => p.duel.wins >= 10,
  flawless: (p) => p.stats.flawless === true,
  calculator: (p) => p.freecell.wins >= 1,
  total_recall: (p) => p.pairs.perfects >= 1,
  demolitionist: (p) => (p.sweeper.byDifficulty?.fierce ?? 0) >= 1,
  all_rounder: (p) =>
    solvedCount(p) >= 1 &&
    p.solitaire.wins >= 1 &&
    p.duel.wins >= 1 &&
    p.freecell.wins >= 1 &&
    p.pairs.wins >= 1 &&
    p.sweeper.wins >= 1,
  week_streak: (p) => p.daily.streak >= 7,
};

function solvedCount(profile) {
  return Object.values(profile.sokoban.levels).filter((l) => l.solved).length;
}

function starCount(profile, stars) {
  return Object.values(profile.sokoban.levels).filter((l) => l.stars >= stars).length;
}

/** Grants any newly-earned achievements. Returns the ones awarded this call. */
export function checkAchievements(profile, ctx = {}, now = Date.now()) {
  const awarded = [];
  for (const achievement of ACHIEVEMENTS) {
    if (profile.achievements.includes(achievement.id)) continue;
    const test = ACHIEVEMENT_TESTS[achievement.id];
    if (!test || !test(profile, ctx)) continue;
    profile.achievements.push(achievement.id);
    credit(profile, CURRENCY.GEMS, achievement.gems, `Achievement: ${achievement.name}`, {
      now,
      kind: 'achievement',
    });
    awarded.push(achievement);
  }
  return awarded;
}

/** Compact snapshot for the popup and the wallet header. */
export function summarize(profile, now = Date.now()) {
  const tickets = syncTickets(profile, now);
  return {
    coins: profile.coins,
    gems: profile.gems,
    tickets: tickets.tickets,
    ticketNextInMs: tickets.nextInMs,
    solved: solvedCount(profile),
    stars: Object.values(profile.sokoban.levels).reduce((s, l) => s + (l.stars ?? 0), 0),
    daily: dailyStatus(profile, now),
    duelStreak: profile.duel.streak,
    solitaireWins: profile.solitaire.wins,
  };
}
