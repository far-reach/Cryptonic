/**
 * The message contract between the UI pages and the service worker.
 *
 * Pages never write to storage. They ask, the worker decides. Keeping the
 * names in one file stops the two sides drifting apart.
 */

export const MSG = {
  GET_STATE: 'get-state',
  GET_SUMMARY: 'get-summary',
  CLAIM_DAILY: 'claim-daily',
  BUY_ITEM: 'buy-item',
  USE_ITEM: 'use-item',
  SET_SETTING: 'set-setting',
  SET_ACTIVE: 'set-active',
  SOKOBAN_COMPLETE: 'sokoban-complete',
  SOKOBAN_SKIP: 'sokoban-skip',
  SOLITAIRE_RESULT: 'solitaire-result',
  FREECELL_RESULT: 'freecell-result',
  PAIRS_RESULT: 'pairs-result',
  SWEEPER_RESULT: 'sweeper-result',
  DUEL_START: 'duel-start',
  DUEL_RESULT: 'duel-result',
  IAP_START: 'iap-start',
  IAP_RESTORE: 'iap-restore',
  OPEN_ARCADE: 'open-arcade',
  RESET_PROFILE: 'reset-profile',
};

/** Broadcast by the worker whenever the wallet changes, so open tabs refresh. */
export const EVENT_WALLET_CHANGED = 'wallet-changed';

export async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (response?.error) {
    const error = new Error(response.error);
    error.code = response.error;
    throw error;
  }
  return response;
}
