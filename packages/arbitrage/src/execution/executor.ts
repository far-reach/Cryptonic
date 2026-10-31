import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_FEES, feesFor } from "../fees.js";
import { round2 } from "../types.js";
import type { CrossExchangeOpportunity, FeeTable, Venue } from "../types.js";
import { floorToStep, newClientOrderId, roundPrice } from "./signing.js";
import { DEFAULT_RISK, type ExchangeClient, type OrderRequest, type OrderResult, type RiskLimits, type SignedRequest, type SymbolRules } from "./types.js";

export const KILL_SWITCH_FILE = "HALT";
export const TRADES_FILE = "trades.jsonl";

export interface ExecutionPlan {
  opportunity: CrossExchangeOpportunity;
  buy: OrderRequest;
  sell: OrderRequest;
  /** Base size after both venues' lot steps. */
  amountBase: number;
  expectedPnlQuote: number;
  /** The exact signed requests that would be sent (secrets are in the headers; never log these outside dry-run). */
  signed?: { buy: SignedRequest; sell: SignedRequest };
}

export interface ExecutionReport {
  t: number;
  mode: "dry-run" | "live";
  plan: ExecutionPlan;
  /** Why the trade was not sent (dry-run always has one reason: "dry-run"). */
  refused?: string[];
  buyResult?: OrderResult;
  sellResult?: OrderResult;
  realisedPnlQuote?: number;
  /** Base units left unhedged after both IOC orders settled (positive = long leftover). */
  unhedgedBase?: number;
  halted?: boolean;
  error?: string;
}

export interface ExecutorOptions {
  clients: Partial<Record<Venue, ExchangeClient>>;
  risk?: RiskLimits;
  fees?: FeeTable;
  /** Directory for trades.jsonl and the kill-switch file. */
  stateDir: string;
  live?: boolean;
  now?: () => number;
  /** Override symbol rules (tests / offline dry-run). */
  rules?: (venue: Venue, base: string, quote: string) => Promise<SymbolRules>;
}

export const isHalted = (stateDir: string): boolean => existsSync(join(stateDir, KILL_SWITCH_FILE));

export function halt(stateDir: string, reason: string): void {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, KILL_SWITCH_FILE), `${new Date().toISOString()} ${reason}\n`);
}

/** Realised P&L of live trades today (UTC), from trades.jsonl. */
export function realisedToday(stateDir: string, now = Date.now()): number {
  const file = join(stateDir, TRADES_FILE);
  if (!existsSync(file)) return 0;
  const dayStart = new Date(now).setUTCHours(0, 0, 0, 0);
  let sum = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as ExecutionReport;
      if (r.mode === "live" && r.t >= dayStart && typeof r.realisedPnlQuote === "number") sum += r.realisedPnlQuote;
    } catch {
      /* skip torn line */
    }
  }
  return sum;
}

/** Build the two IOC limit orders for a cross-exchange opportunity. Pure given the rules. */
export function planCrossExchange(
  o: CrossExchangeOpportunity,
  buyRules: SymbolRules,
  sellRules: SymbolRules,
  risk: RiskLimits = DEFAULT_RISK,
  fees: FeeTable = DEFAULT_FEES,
): ExecutionPlan {
  const notional = Math.min(o.notionalQuote, risk.maxNotionalQuote, o.maxNotionalQuote);
  const tol = risk.slippageToleranceBps / 10_000;
  const buyPrice = roundPrice(o.buyPrice * (1 + tol), buyRules.tickSize, "buy");
  const sellPrice = roundPrice(o.sellPrice * (1 - tol), sellRules.tickSize, "sell");
  // Same base size on both legs, rounded to the coarser lot step.
  const step = Math.max(buyRules.lotStep, sellRules.lotStep);
  const amountBase = floorToStep(notional / buyPrice, step);
  const tag = newClientOrderId();
  const buy: OrderRequest = { venue: o.buyVenue, base: o.base, quote: o.quote, side: "buy", price: buyPrice, amountBase, clientOrderId: `${tag}b` };
  const sell: OrderRequest = { venue: o.sellVenue, base: o.base, quote: o.quote, side: "sell", price: sellPrice, amountBase, clientOrderId: `${tag}s` };
  const feeBps = feesFor(fees, o.buyVenue).spotTakerBps + feesFor(fees, o.sellVenue).spotTakerBps;
  const expectedPnlQuote = round2(amountBase * (sellPrice - buyPrice) - (amountBase * (buyPrice + sellPrice) * feeBps) / 2 / 10_000);
  return { opportunity: o, buy, sell, amountBase, expectedPnlQuote };
}

/** Pre-flight checks that need no network. */
export function preflight(plan: ExecutionPlan, risk: RiskLimits, buyRules: SymbolRules, sellRules: SymbolRules, stateDir: string, now: number): string[] {
  const reasons: string[] = [];
  const o = plan.opportunity;
  if (isHalted(stateDir)) reasons.push(`kill switch present (${join(stateDir, KILL_SWITCH_FILE)})`);
  if (o.suspicious) reasons.push("opportunity flagged suspicious");
  if (o.netBps < risk.minNetBps) reasons.push(`net ${o.netBps} bps below minimum ${risk.minNetBps}`);
  if (!o.depthChecked) reasons.push("not depth-checked (run with --depth)");
  if (o.quoteAgeMs > 10_000) reasons.push(`quotes ${o.quoteAgeMs} ms old`);
  if (plan.amountBase <= 0) reasons.push("size rounds to zero at the venues' lot step");
  const notional = plan.amountBase * plan.buy.price;
  if (buyRules.minNotional && notional < buyRules.minNotional) reasons.push(`below ${o.buyVenue} min notional ${buyRules.minNotional}`);
  if (sellRules.minNotional && notional < sellRules.minNotional) reasons.push(`below ${o.sellVenue} min notional ${sellRules.minNotional}`);
  if (plan.sell.price <= plan.buy.price) reasons.push("no edge left after slippage tolerance and tick rounding");
  if (plan.expectedPnlQuote <= 0) reasons.push("expected P&L after fees is not positive");
  const lost = -realisedToday(stateDir, now);
  if (lost >= risk.maxDailyLossQuote) reasons.push(`daily loss limit hit (${lost.toFixed(2)} ≥ ${risk.maxDailyLossQuote})`);
  return reasons;
}

/**
 * Execute (or dry-run) one cross-exchange opportunity: two simultaneous IOC
 * limit orders. Never sends a market order, never withdraws, never retries a
 * leg on its own. Any unhedged leftover beyond the limit writes the kill switch
 * so a human has to look before the next trade.
 */
export async function executeCrossExchange(o: CrossExchangeOpportunity, opts: ExecutorOptions): Promise<ExecutionReport> {
  const now = opts.now ?? Date.now;
  const risk = opts.risk ?? DEFAULT_RISK;
  const fees = opts.fees ?? DEFAULT_FEES;
  const mode = opts.live ? "live" : "dry-run";
  const buyClient = opts.clients[o.buyVenue];
  const sellClient = opts.clients[o.sellVenue];
  const fallbackRules: SymbolRules = { lotStep: 0, tickSize: 0, minNotional: 0 };
  const rulesFor = async (venue: Venue, client: ExchangeClient | undefined): Promise<SymbolRules> => {
    if (opts.rules) return opts.rules(venue, o.base, o.quote);
    if (!client) return fallbackRules;
    try {
      return await client.getSymbolRules(o.base, o.quote);
    } catch {
      return fallbackRules;
    }
  };
  const [buyRules, sellRules] = await Promise.all([rulesFor(o.buyVenue, buyClient), rulesFor(o.sellVenue, sellClient)]);
  const plan = planCrossExchange(o, buyRules, sellRules, risk, fees);
  const refused = preflight(plan, risk, buyRules, sellRules, opts.stateDir, now());
  if (!buyClient) refused.push(`no credentials for ${o.buyVenue}`);
  if (!sellClient) refused.push(`no credentials for ${o.sellVenue}`);
  if (buyClient && sellClient) plan.signed = { buy: buyClient.signPlaceOrder(plan.buy, now()), sell: sellClient.signPlaceOrder(plan.sell, now()) };

  const report: ExecutionReport = { t: now(), mode, plan: { ...plan, signed: undefined }, refused: refused.length ? refused : undefined };
  if (!opts.live) {
    report.refused = [...(refused.length ? refused : []), "dry-run"];
    record(opts.stateDir, report);
    return report;
  }
  if (refused.length) {
    record(opts.stateDir, report);
    return report;
  }

  // Balances: quote on the buy venue, base on the sell venue (pre-funded on both sides).
  try {
    const [q, b] = await Promise.all([buyClient!.getBalance(o.quote), sellClient!.getBalance(o.base)]);
    const need = plan.amountBase * plan.buy.price;
    if (q.available < need) report.refused = [`${o.buyVenue} ${o.quote} balance ${q.available} < ${need.toFixed(2)}`];
    if (b.available < plan.amountBase) report.refused = [...(report.refused ?? []), `${o.sellVenue} ${o.base} balance ${b.available} < ${plan.amountBase}`];
    if (report.refused) {
      record(opts.stateDir, report);
      return report;
    }
  } catch (err) {
    report.error = `balance check failed: ${err instanceof Error ? err.message : String(err)}`;
    record(opts.stateDir, report);
    return report;
  }

  const [buyRes, sellRes] = await Promise.allSettled([buyClient!.placeOrder(plan.buy), sellClient!.placeOrder(plan.sell)]);
  if (buyRes.status === "fulfilled") report.buyResult = buyRes.value;
  if (sellRes.status === "fulfilled") report.sellResult = sellRes.value;
  const errs = [buyRes, sellRes].filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));
  if (errs.length) report.error = errs.join("; ");

  const bought = report.buyResult?.filledBase ?? 0;
  const sold = report.sellResult?.filledBase ?? 0;
  report.unhedgedBase = round2((bought - sold) * 1e6) / 1e6;
  const buyFee = report.buyResult?.feeQuote ?? ((report.buyResult?.filledQuote ?? 0) * feesFor(fees, o.buyVenue).spotTakerBps) / 10_000;
  const sellFee = report.sellResult?.feeQuote ?? ((report.sellResult?.filledQuote ?? 0) * feesFor(fees, o.sellVenue).spotTakerBps) / 10_000;
  // Unhedged leftover is marked at the opposite leg's price so the report shows the exposure cost.
  const hedged = Math.min(bought, sold);
  const buyAvg = report.buyResult?.avgPrice ?? plan.buy.price;
  const sellAvg = report.sellResult?.avgPrice ?? plan.sell.price;
  report.realisedPnlQuote = round2(hedged * (sellAvg - buyAvg) - buyFee - sellFee);

  if (plan.amountBase > 0 && Math.abs(report.unhedgedBase) / plan.amountBase > risk.maxUnhedgedFraction) {
    halt(opts.stateDir, `unhedged ${report.unhedgedBase} ${o.base} after ${o.buyVenue}→${o.sellVenue} (bought ${bought}, sold ${sold})`);
    report.halted = true;
  }
  if (report.error && !report.halted) {
    halt(opts.stateDir, `order error: ${report.error}`);
    report.halted = true;
  }
  record(opts.stateDir, report);
  return report;
}

function record(stateDir: string, report: ExecutionReport): void {
  mkdirSync(stateDir, { recursive: true });
  const { plan, ...rest } = report;
  const safe = { ...rest, plan: { ...plan, signed: undefined } };
  appendFileSync(join(stateDir, TRADES_FILE), JSON.stringify(safe) + "\n");
}
