/**
 * The wallet's owner.
 *
 * Only this worker reads and writes the profile. Game pages send claims
 * ("I cleared level 7 in 42 moves", "I won this deal"), and every claim is
 * re-verified here by replaying it through the same pure engine the page used.
 * A page that lies gets `invalid_claim`, not coins.
 *
 * Writes are serialised through `mutate()` so two tabs finishing at once can't
 * interleave a read-modify-write and lose a payout.
 */

import { MSG, EVENT_WALLET_CHANGED } from '../common/messages.js';
import { CONFIG } from '../config.js';
import * as economy from '../store/economy.js';
import { IAP_BY_SKU, STORE_ITEM_BY_ID } from '../store/catalog.js';
import { fetchEntitlements, startPurchase, PaymentError } from '../store/payments.js';
import { LEVELS, LEVEL_BY_ID } from '../games/sokoban/levels.js';
import { SOLUTIONS } from '../games/sokoban/solutions.js';
import { parseLevel, replay as replaySokoban } from '../games/sokoban/engine.js';
import { replay as replaySolitaire } from '../games/solitaire/engine.js';
import { replay as replayDuel } from '../games/duel/engine.js';
import { replay as replayFreecell } from '../games/freecell/engine.js';
import { replay as replayPairs } from '../games/pairs/engine.js';
import { replay as replaySweeper } from '../games/sweeper/engine.js';
import { BOARDS } from '../games/pairs/engine.js';
import { DIFFICULTIES } from '../games/sweeper/engine.js';

const STORAGE_KEY = 'arcade.profile';

/** Serialises every read-modify-write against the profile. */
let writeChain = Promise.resolve();

/** Per-deal payout throttle, in memory — resets when the worker restarts. */
const lastPayoutAt = new Map();
const PAYOUT_COOLDOWN_MS = 15_000;

/** True when this exact deal already paid out moments ago. Records either way. */
function throttled(key, now) {
  const recent = now - (lastPayoutAt.get(key) ?? 0) < PAYOUT_COOLDOWN_MS;
  lastPayoutAt.set(key, now);
  if (lastPayoutAt.size > 500) lastPayoutAt.clear();
  return recent;
}

/** Duels the worker has issued a seed (and charged a ticket) for. */
const openDuels = new Map();
const DUEL_TTL_MS = 60 * 60 * 1000;

async function loadProfile() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return economy.migrate(stored[STORAGE_KEY]);
}

async function saveProfile(profile) {
  await chrome.storage.local.set({ [STORAGE_KEY]: profile });
}

/**
 * Run `fn` against the live profile and persist the result. `fn` may mutate
 * the draft freely; whatever it returns is handed back to the caller with a
 * fresh wallet summary attached.
 */
function mutate(fn) {
  const run = writeChain.then(async () => {
    const profile = await loadProfile();
    const now = Date.now();
    const result = (await fn(profile, now)) ?? {};
    economy.syncTickets(profile, now);
    await saveProfile(profile);
    broadcast(profile, now);
    return { ...result, wallet: economy.summarize(profile, now) };
  });
  // Keep the chain alive even if this link rejects.
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function broadcast(profile, now) {
  chrome.runtime
    .sendMessage({
      type: EVENT_WALLET_CHANGED,
      wallet: economy.summarize(profile, now),
    })
    .catch(() => {
      /* nothing listening — normal when no arcade tab is open */
    });
}

/* ---------------------------------------------------------------- handlers */

const handlers = {
  async [MSG.GET_STATE](_msg, profile, now) {
    economy.syncTickets(profile, now);
    return {
      profile,
      provider: CONFIG.provider,
      levels: LEVELS.map((level) => ({
        id: level.id,
        name: level.name,
        rows: level.rows,
        par: SOLUTIONS[level.id]?.par ?? null,
        pushes: SOLUTIONS[level.id]?.pushes ?? null,
      })),
      daily: economy.dailyStatus(profile, now),
    };
  },

  async [MSG.GET_SUMMARY](_msg, profile, now) {
    economy.syncTickets(profile, now);
    return {};
  },

  async [MSG.CLAIM_DAILY](_msg, profile, now) {
    const result = economy.claimDaily(profile, now);
    if (!result.ok) return { error: result.error };
    economy.checkAchievements(profile, { levelCount: LEVELS.length }, now);
    return result;
  },

  async [MSG.BUY_ITEM](msg, profile, now) {
    const result = economy.buyItem(profile, msg.itemId, now);
    if (!result.ok) return { error: result.error };
    return { bought: STORE_ITEM_BY_ID.get(msg.itemId)?.name ?? msg.itemId };
  },

  async [MSG.USE_ITEM](msg, profile, now) {
    if (!economy.useItem(profile, msg.item, now)) return { error: 'out_of_stock' };
    return { used: msg.item, remaining: profile.items[msg.item] };
  },

  async [MSG.SET_SETTING](msg, profile) {
    if (!(msg.key in profile.settings)) return { error: 'unknown_setting' };
    profile.settings[msg.key] = msg.value;
    return { settings: profile.settings };
  },

  async [MSG.SET_ACTIVE](msg, profile) {
    if (msg.theme) {
      if (!profile.themes.includes(msg.theme)) return { error: 'not_owned' };
      profile.active.theme = msg.theme;
    }
    if (msg.cardBack) {
      if (!profile.cardBacks.includes(msg.cardBack)) return { error: 'not_owned' };
      profile.active.cardBack = msg.cardBack;
    }
    return { active: profile.active };
  },

  /** Claim: "I solved <levelId> with this move string." Verified by replay. */
  async [MSG.SOKOBAN_COMPLETE](msg, profile, now) {
    const level = LEVEL_BY_ID.get(msg.levelId);
    if (!level) return { error: 'unknown_level' };
    if (typeof msg.moves !== 'string' || msg.moves.length === 0) {
      return { error: 'invalid_claim' };
    }
    if (msg.moves.length > 10_000) return { error: 'invalid_claim' };

    const result = replaySokoban(parseLevel(level.rows), msg.moves);
    if (!result.ok || !result.solved) return { error: 'invalid_claim' };

    const cooling = throttled(`sokoban:${msg.levelId}`, now);
    const par = SOLUTIONS[msg.levelId]?.par ?? result.moves;
    const award = cooling
      ? { coins: 0, gems: 0, stars: 0, first: false, throttled: true }
      : economy.awardSokoban(profile, { levelId: msg.levelId, moves: result.moves, par }, now);

    if (cooling) {
      // Still record the result — only the payout is rate limited.
      const record = profile.sokoban.levels[msg.levelId] ?? {};
      profile.sokoban.levels[msg.levelId] = {
        solved: true,
        stars: Math.max(record.stars ?? 0, 0),
        bestMoves: record.bestMoves ? Math.min(record.bestMoves, result.moves) : result.moves,
        clears: (record.clears ?? 0) + 1,
      };
    }

    unlockThrough(profile, msg.levelId);
    const achievements = economy.checkAchievements(profile, { levelCount: LEVELS.length }, now);
    return { ...award, moves: result.moves, pushes: result.pushes, par, achievements };
  },

  /** Spend a Skip item to bank a level without solving it. */
  async [MSG.SOKOBAN_SKIP](msg, profile, now) {
    if (!LEVEL_BY_ID.has(msg.levelId)) return { error: 'unknown_level' };
    if (profile.sokoban.levels[msg.levelId]?.solved) return { error: 'already_solved' };
    if (!economy.useItem(profile, 'skip', now)) return { error: 'out_of_stock' };

    profile.sokoban.levels[msg.levelId] = {
      solved: true,
      skipped: true,
      stars: 0,
      bestMoves: null,
      clears: 0,
    };
    unlockThrough(profile, msg.levelId);
    return { skipped: msg.levelId };
  },

  /** Claim: "here is the deal I was given and every move I made." */
  async [MSG.SOLITAIRE_RESULT](msg, profile, now) {
    if (!Number.isInteger(msg.seed)) return { error: 'invalid_claim' };
    if (!Array.isArray(msg.moves) || msg.moves.length > 20_000) {
      return { error: 'invalid_claim' };
    }

    const drawMode = msg.drawMode === 3 ? 3 : 1;
    const result = replaySolitaire(msg.seed, drawMode, msg.moves);
    if (!result.ok) return { error: 'invalid_claim' };
    if (msg.won && !result.won) return { error: 'invalid_claim' };

    if (throttled(`solitaire:${msg.seed}`, now)) return { error: 'too_soon' };

    const award = economy.awardSolitaire(
      profile,
      { won: result.won, foundation: result.foundation, usedUndo: Boolean(msg.usedUndo) },
      now,
    );
    const achievements = economy.checkAchievements(profile, { levelCount: LEVELS.length }, now);
    return { ...award, foundation: result.foundation, achievements };
  },

  /** Same contract as solitaire: seed plus the move list, replayed here. */
  async [MSG.FREECELL_RESULT](msg, profile, now) {
    if (!Number.isInteger(msg.seed)) return { error: 'invalid_claim' };
    if (!Array.isArray(msg.moves) || msg.moves.length > 20_000) return { error: 'invalid_claim' };

    const result = replayFreecell(msg.seed, msg.moves);
    if (!result.ok) return { error: 'invalid_claim' };
    if (msg.won && !result.won) return { error: 'invalid_claim' };

    if (throttled(`freecell:${msg.seed}`, now)) return { error: 'too_soon' };

    const award = economy.awardFreecell(
      profile,
      { won: result.won, foundation: result.foundation, usedUndo: Boolean(msg.usedUndo) },
      now,
    );
    return {
      ...award,
      foundation: result.foundation,
      achievements: economy.checkAchievements(profile, { levelCount: LEVELS.length }, now),
    };
  },

  /** Claim: "here are the tiles I flipped, in order." */
  async [MSG.PAIRS_RESULT](msg, profile, now) {
    if (!Number.isInteger(msg.seed)) return { error: 'invalid_claim' };
    if (!BOARDS[msg.board]) return { error: 'invalid_claim' };
    if (!Array.isArray(msg.flips) || msg.flips.length > 5_000) return { error: 'invalid_claim' };

    const result = replayPairs(msg.seed, msg.board, msg.flips);
    if (!result.ok || !result.won) return { error: 'invalid_claim' };

    if (throttled(`pairs:${msg.seed}`, now)) return { error: 'too_soon' };

    // Mistakes and combo come from the replay, never from the page — they set
    // the payout, so the page does not get to report them.
    const award = economy.awardPairs(
      profile,
      {
        won: true,
        mistakes: result.mistakes,
        bestCombo: result.bestCombo,
        board: msg.board,
      },
      now,
    );
    return {
      ...award,
      mistakes: result.mistakes,
      bestCombo: result.bestCombo,
      achievements: economy.checkAchievements(profile, { levelCount: LEVELS.length }, now),
    };
  },

  /** Claim: "here is every reveal, flag and chord I made on this board." */
  async [MSG.SWEEPER_RESULT](msg, profile, now) {
    if (!Number.isInteger(msg.seed)) return { error: 'invalid_claim' };
    if (!DIFFICULTIES[msg.difficulty]) return { error: 'invalid_claim' };
    if (!Array.isArray(msg.actions) || msg.actions.length > 5_000) return { error: 'invalid_claim' };

    const result = replaySweeper(msg.seed, msg.difficulty, msg.actions);
    if (!result.ok) return { error: 'invalid_claim' };
    if (msg.won && !result.won) return { error: 'invalid_claim' };

    if (throttled(`sweeper:${msg.seed}`, now)) return { error: 'too_soon' };

    const award = economy.awardSweeper(
      profile,
      { won: result.won, difficulty: msg.difficulty, progress: result.progress },
      now,
    );
    return {
      ...award,
      revealed: result.revealed,
      achievements: economy.checkAchievements(profile, { levelCount: LEVELS.length }, now),
    };
  },

  /** Charges a ticket and issues the seed the duel will be played on. */
  async [MSG.DUEL_START](_msg, profile, now) {
    if (!economy.spendTicket(profile, now)) return { error: 'no_tickets' };

    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const seed = buf[0];

    for (const [key, value] of openDuels) {
      if (now - value.startedAt > DUEL_TTL_MS) openDuels.delete(key);
    }
    openDuels.set(seed, { startedAt: now });

    return { seed };
  },

  /** Claim: "here is how the duel you seeded played out." */
  async [MSG.DUEL_RESULT](msg, profile, now) {
    if (!Number.isInteger(msg.seed)) return { error: 'invalid_claim' };
    const open = openDuels.get(msg.seed);
    if (!open) return { error: 'unknown_duel' };
    if (!Array.isArray(msg.actions) || msg.actions.length > 200) {
      return { error: 'invalid_claim' };
    }

    const result = replayDuel(msg.seed, msg.actions);
    if (!result.ok || !result.state.over) return { error: 'invalid_claim' };
    openDuels.delete(msg.seed);

    const award = economy.awardDuel(
      profile,
      { result: result.state.result, roundsWon: result.state.playerScore },
      now,
    );
    const achievements = economy.checkAchievements(profile, { levelCount: LEVELS.length }, now);
    return { ...award, achievements };
  },

  /* --------------------------------------------------------------- payments */

  async [MSG.IAP_START](msg, profile, now) {
    if (!IAP_BY_SKU.has(msg.sku)) return { error: 'unknown_sku' };

    let started;
    try {
      started = await startPurchase({ sku: msg.sku, uid: profile.uid });
    } catch (err) {
      return { error: err instanceof PaymentError ? err.code : 'payment_failed' };
    }

    if (started.status === 'granted') {
      const granted = economy.grantIap(profile, started.sku, started.receiptId, now);
      if (!granted.ok) return { error: granted.error };
      return { status: 'granted', pack: granted.pack.name, gems: granted.pack.gems };
    }

    return { status: 'pending', provider: CONFIG.provider };
  },

  /**
   * Asks the provider what this install has paid for and grants anything not
   * already redeemed. Doubles as the "Restore purchases" button.
   */
  async [MSG.IAP_RESTORE](_msg, profile, now) {
    let entitlements;
    try {
      entitlements = await fetchEntitlements({ uid: profile.uid });
    } catch (err) {
      return { error: err instanceof PaymentError ? err.code : 'verify_failed' };
    }

    const granted = [];
    for (const entitlement of entitlements) {
      const result = economy.grantIap(profile, entitlement.sku, entitlement.receiptId, now);
      if (result.ok) granted.push(result.pack.name);
    }
    return { restored: granted, checked: entitlements.length };
  },

  async [MSG.OPEN_ARCADE](msg) {
    await openArcade(msg.view);
    return { opened: true };
  },

  async [MSG.RESET_PROFILE](_msg, profile) {
    const fresh = economy.createProfile(Date.now());
    // Keep identity and paid receipts: a reset wipes progress, not purchases.
    fresh.uid = profile.uid;
    fresh.receipts = profile.receipts.slice();
    for (const key of Object.keys(profile)) delete profile[key];
    Object.assign(profile, fresh);
    return { reset: true };
  },
};

function unlockThrough(profile, levelId) {
  const index = LEVELS.findIndex((l) => l.id === levelId);
  if (index < 0) return;
  profile.sokoban.unlocked = Math.max(profile.sokoban.unlocked, index + 2);
}

async function openArcade(view) {
  const url = chrome.runtime.getURL(`src/app/app.html${view ? `#${view}` : ''}`);
  const existing = await chrome.tabs.query({
    url: chrome.runtime.getURL('src/app/app.html'),
  });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true, url });
    await chrome.windows.update(existing[0].windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
}

/* ------------------------------------------------------------------- wiring */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;

  mutate((profile, now) => handler(message, profile, now))
    .then(sendResponse)
    .catch((err) => {
      console.error('[arcade] handler failed', message?.type, err);
      sendResponse({ error: 'internal_error' });
    });

  return true; // keep the channel open for the async response
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await mutate((profile, now) => {
    profile.stats.sessions++;
    economy.syncTickets(profile, now);
    return {};
  });
  if (details.reason === 'install') await openArcade('arcade');
});

chrome.runtime.onStartup.addListener(() => {
  mutate((profile, now) => {
    economy.syncTickets(profile, now);
    return {};
  });
});
