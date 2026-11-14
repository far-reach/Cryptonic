import { readLedger, readState } from "../paper/ledger.js";
import { evaluateGate, type GateCriteria, type GateVerdict } from "../paper/gate.js";
import { summarise } from "../paper/summary.js";
import type { Venue } from "../types.js";

export const LIVE_ACK = "I_ACCEPT_THE_RISK";

export interface LiveCheck {
  allowed: boolean;
  reasons: string[];
  gate: GateVerdict;
  /** True when ARB_OVERRIDE_GATE=1 bypassed a failing gate. */
  gateOverridden: boolean;
}

/**
 * Live trading is allowed only when ALL hold:
 *  1. ARB_LIVE is set to the exact acknowledgement string,
 *  2. the paper ledger's go-live gate passes for cross-exchange
 *     (or ARB_OVERRIDE_GATE=1 is set, which is logged in the report),
 *  3. credentials exist for every venue the trade touches (checked by the executor).
 */
export function checkLive(opts: { env?: NodeJS.ProcessEnv; stateDir: string; venues: Venue[]; criteria?: GateCriteria; now?: number }): LiveCheck {
  const env = opts.env ?? process.env;
  const reasons: string[] = [];
  if (env.ARB_LIVE !== LIVE_ACK) reasons.push(`ARB_LIVE is not "${LIVE_ACK}"`);
  const summary = summarise(readLedger(opts.stateDir), readState(opts.stateDir), opts.now);
  const gate = evaluateGate(summary, "cross-exchange", opts.criteria);
  const gateOverridden = !gate.passed && env.ARB_OVERRIDE_GATE === "1";
  if (!gate.passed && !gateOverridden) reasons.push(`paper gate not passed: ${gate.reasons.join("; ")}`);
  for (const v of opts.venues) {
    const p = v.toUpperCase();
    if (!env[`${p}_API_KEY`] || !env[`${p}_API_SECRET`]) reasons.push(`missing ${p}_API_KEY / ${p}_API_SECRET`);
    if ((v === "bitget" || v === "okx") && !env[`${p}_API_PASSPHRASE`]) reasons.push(`missing ${p}_API_PASSPHRASE`);
  }
  return { allowed: reasons.length === 0, reasons, gate, gateOverridden };
}
