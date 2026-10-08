/**
 * Real-money purchase plumbing.
 *
 * Chrome removed the in-browser Web Store payments API, so an extension that
 * sells anything has to take the money elsewhere and then prove to itself that
 * the money arrived. This module is that boundary and nothing more: it hands
 * back `{ sku, receiptId }` for orders it believes are paid, and `economy.js`
 * decides what that is worth. Receipt ids are single-use.
 *
 * Two providers ship:
 *   sandbox   local simulation, no network, no charge — the default
 *   checkout  your hosted checkout page + your verification endpoint
 *
 * The rule that matters: never grant on a client-side "success" signal alone.
 * The `checkout` provider deliberately ignores whatever the payment page says
 * and asks *your server* what has actually been paid for.
 */

import { CONFIG } from '../config.js';

export class PaymentError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

/* ----------------------------------------------------------------- sandbox */

const sandbox = {
  id: 'sandbox',
  label: 'Sandbox (no real charge)',

  async start({ sku, uid }) {
    // Mirrors the shape of a real settlement without touching the network.
    const receiptId = `${sku}:sandbox:${uid.slice(0, 8)}:${randomId()}`;
    return { status: 'granted', sku, receiptId };
  },

  async entitlements() {
    return [];
  },
};

/* ---------------------------------------------------------------- checkout */

const checkout = {
  id: 'checkout',
  label: 'Secure checkout',

  async start({ sku, uid }) {
    if (!CONFIG.checkoutUrl || !CONFIG.verifyUrl) {
      throw new PaymentError('not_configured', 'Checkout URLs are not configured.');
    }

    const url = `${CONFIG.checkoutUrl}?sku=${encodeURIComponent(sku)}&uid=${encodeURIComponent(uid)}`;
    await chrome.tabs.create({ url });

    // The purchase completes out of band; the caller polls entitlements.
    return { status: 'pending', sku };
  },

  async entitlements({ uid }) {
    if (!CONFIG.verifyUrl) return [];
    const url = `${CONFIG.verifyUrl}?uid=${encodeURIComponent(uid)}`;
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new PaymentError('verify_failed', `Verification returned ${response.status}`);
    }
    const body = await response.json();
    const list = Array.isArray(body?.entitlements) ? body.entitlements : [];
    return list
      .filter((e) => typeof e?.sku === 'string' && typeof e?.receiptId === 'string')
      .map((e) => ({ sku: e.sku, receiptId: e.receiptId }));
  },
};

const PROVIDERS = { sandbox, checkout };

export function activeProvider() {
  const provider = PROVIDERS[CONFIG.provider];
  if (!provider) throw new PaymentError('bad_provider', `Unknown provider: ${CONFIG.provider}`);
  return provider;
}

/** Kick off a purchase. Resolves to `{ status: 'granted' | 'pending' }`. */
export function startPurchase({ sku, uid }) {
  return activeProvider().start({ sku, uid });
}

/**
 * Ask the provider what this install has actually paid for. Also backs the
 * "Restore purchases" button, which is how a reinstalled extension gets its
 * gems back.
 */
export function fetchEntitlements({ uid }) {
  return activeProvider().entitlements({ uid });
}

function randomId() {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}
