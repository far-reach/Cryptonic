#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits } from "ethers";
import { buildVeilPoseidon, AssociationSet, DEFAULT_LEVELS } from "../../sdk/dist/index.js";
import { Relayer, buildPoolTree } from "../../services/dist/index.js";
import { VeilWallet } from "./wallet.js";
import { PaymentsClient } from "./payments.js";

/**
 * `veil` — a minimal command-line wallet for confidential stablecoin payments.
 *
 *   veil init                       create a wallet (view key) -> wallet.json
 *   veil balance                    show shielded balance
 *   veil notes                      list notes (spending secrets)
 *   veil shield  --amount 1000      move stablecoins into the pool (private balance)
 *   veil pay     --to 0x.. --amount 500 [--fee 2]   pay privately via the relayer
 *   veil audit   --cipher 0x..      decrypt a note ciphertext with the view key
 *
 * Config comes from veil.config.json:
 *   { rpcUrl, privateKey, poolAddress, tokenAddress, wasmPath, zkeyPath, approvedSet: ["<commitment>", ...] }
 */

const TOKEN_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const POOL_ABI = [
  "function deposit(uint256 commitment, uint256 value, bytes encryptedNote)",
  "function withdraw(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[7] pub)",
  "function getLastRoot() view returns (uint256)",
  "event Deposit(uint256 indexed commitment, uint32 leafIndex, uint256 value, bytes encryptedNote, uint256 timestamp)",
];

const WALLET_FILE = process.env.VEIL_WALLET ?? "wallet.json";
const CONFIG_FILE = process.env.VEIL_CONFIG ?? "veil.config.json";

function loadConfig(): any {
  if (!existsSync(CONFIG_FILE)) throw new Error(`missing ${CONFIG_FILE}`);
  return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
}
function loadWallet(): VeilWallet {
  if (!existsSync(WALLET_FILE)) throw new Error(`no wallet — run 'veil init' first`);
  return VeilWallet.fromJSON(readFileSync(WALLET_FILE, "utf8"));
}
function saveWallet(w: VeilWallet): void {
  writeFileSync(WALLET_FILE, w.toJSON());
}

async function makeClient(cfg: any, wallet: VeilWallet) {
  const provider = new JsonRpcProvider(cfg.rpcUrl);
  const signer = new Wallet(cfg.privateKey, provider);
  const pool = new Contract(cfg.poolAddress, POOL_ABI, signer);
  const token = new Contract(cfg.tokenAddress, TOKEN_ABI, signer);
  const poseidon = await buildVeilPoseidon();
  return { provider, signer, pool, token, poseidon, client: new PaymentsClient(pool, token, poseidon, wallet) };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      amount: { type: "string" },
      to: { type: "string" },
      fee: { type: "string" },
      cipher: { type: "string" },
    },
    allowPositionals: false,
  });

  switch (command) {
    case "init": {
      if (existsSync(WALLET_FILE)) throw new Error(`${WALLET_FILE} already exists`);
      const w = new VeilWallet();
      saveWallet(w);
      console.log(`created ${WALLET_FILE}`);
      console.log(`view public key: 0x${Buffer.from(w.viewKey.publicKey).toString("hex")}`);
      return;
    }
    case "balance": {
      console.log(`${loadWallet().balance().toString()} (base units, unspent)`);
      return;
    }
    case "notes": {
      for (const n of loadWallet().notes) {
        console.log(`${n.spent ? "spent " : "live  "} value=${n.note.value} commitment=${n.commitment}`);
      }
      return;
    }
    case "shield": {
      const cfg = loadConfig();
      const wallet = loadWallet();
      const { token, client } = await makeClient(cfg, wallet);
      const dec: number = Number(await token.decimals());
      const amount = parseUnits(req(values.amount, "--amount"), dec);
      const { commitment } = await client.shield(amount);
      saveWallet(wallet);
      console.log(`shielded ${formatUnits(amount, dec)} — commitment ${commitment}`);
      return;
    }
    case "pay": {
      const cfg = loadConfig();
      const wallet = loadWallet();
      const { pool, token, poseidon, signer, client } = await makeClient(cfg, wallet);
      const dec: number = Number(await token.decimals());
      const amount = parseUnits(req(values.amount, "--amount"), dec);
      const fee = parseUnits(values.fee ?? "0", dec);
      const to = req(values.to, "--to");

      const stored = wallet.unspent().find((n) => n.note.value === amount);
      if (!stored) throw new Error(`no unspent note of exactly ${values.amount}`);

      const approved = (cfg.approvedSet ?? []).map((c: string) => BigInt(c));
      const set = new AssociationSet(poseidon, DEFAULT_LEVELS, approved);
      const relayer = new Relayer(pool as any, {
        wasmPath: cfg.wasmPath,
        zkeyPath: cfg.zkeyPath,
        poseidon,
        relayerAddress: await signer.getAddress(),
      });
      await client.pay(stored.note, to, relayer, set, fee);
      saveWallet(wallet);
      console.log(`paid ${values.amount} to ${to} privately`);
      return;
    }
    case "audit": {
      const wallet = loadWallet();
      const poseidon = await buildVeilPoseidon();
      const client = new PaymentsClient(undefined as any, undefined as any, poseidon, wallet);
      const note = client.audit(req(values.cipher, "--cipher"));
      console.log(`decrypted note: value=${note.value} nullifier=${note.nullifier}`);
      return;
    }
    default:
      console.log("commands: init | balance | notes | shield | pay | audit");
      process.exit(command ? 1 : 0);
  }
}

function req(v: string | undefined, name: string): string {
  if (v === undefined) throw new Error(`missing ${name}`);
  return v;
}

main().catch((e) => {
  console.error("error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
