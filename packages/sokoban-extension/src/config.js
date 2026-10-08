/**
 * Build-time configuration. Everything a fork needs to change lives here.
 */

export const CONFIG = {
  /**
   * Which payment provider backs the gem packs.
   *
   *   'sandbox'  — no money moves. Purchases are simulated locally and every
   *                surface is labelled SANDBOX. This is the default so the
   *                extension is safe to load unpacked and review.
   *   'checkout' — real payments through your own hosted checkout + a
   *                verification endpoint you run. See README §Payments.
   */
  provider: 'sandbox',

  /**
   * Used only when provider === 'checkout'.
   *
   * checkoutUrl  opened in a tab as `${checkoutUrl}?sku=…&uid=…`
   * verifyUrl    polled as `${verifyUrl}?uid=…`, must return
   *              `{ entitlements: [{ sku, receiptId }] }` for *paid, verified*
   *              orders only. Receipts are single-use: the wallet records each
   *              id and refuses to grant the same one twice.
   */
  checkoutUrl: '',
  verifyUrl: '',

  /** How long to keep polling after the checkout tab opens. */
  verifyPollMs: 4000,
  verifyTimeoutMs: 10 * 60 * 1000,
};

export const IS_SANDBOX = CONFIG.provider === 'sandbox';
