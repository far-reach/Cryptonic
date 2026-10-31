import type { Venue } from "../../types.js";
import type { ClientOptions, Credentials, ExchangeClient } from "../types.js";
import { binanceClient } from "./binance.js";
import { bitgetClient } from "./bitget.js";
import { bybitClient } from "./bybit.js";
import { okxClient } from "./okx.js";

export const CLIENT_FACTORIES: Record<Venue, (c: Credentials, o?: ClientOptions) => ExchangeClient> = {
  bitget: bitgetClient,
  binance: binanceClient,
  bybit: bybitClient,
  okx: okxClient,
};

/**
 * Read credentials from the environment: `<VENUE>_API_KEY`, `<VENUE>_API_SECRET`,
 * `<VENUE>_API_PASSPHRASE` (Bitget/OKX). Returns only the venues that are fully configured.
 */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<Record<Venue, Credentials>> {
  const out: Partial<Record<Venue, Credentials>> = {};
  for (const v of Object.keys(CLIENT_FACTORIES) as Venue[]) {
    const p = v.toUpperCase();
    const apiKey = env[`${p}_API_KEY`];
    const apiSecret = env[`${p}_API_SECRET`];
    const passphrase = env[`${p}_API_PASSPHRASE`];
    if (!apiKey || !apiSecret) continue;
    if ((v === "bitget" || v === "okx") && !passphrase) continue;
    out[v] = { apiKey, apiSecret, passphrase };
  }
  return out;
}

export { bitgetClient, binanceClient, bybitClient, okxClient };
export { signBitget } from "./bitget.js";
export { signBinance } from "./binance.js";
export { signBybit } from "./bybit.js";
export { signOkx } from "./okx.js";
