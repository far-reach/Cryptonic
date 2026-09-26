import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JsonRpcProvider,
  Contract,
  formatUnits,
  hexlify,
} from "ethers";
import { buildVeilPoseidon, AssociationSet, DEFAULT_LEVELS } from "../sdk/dist/index.js";
import { Relayer } from "../services/dist/index.js";
import { PaymentsClient, VeilWallet } from "../app/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const contractsDir = path.join(__dirname, "..", "contracts");
const deploymentFile = path.join(contractsDir, "..", "..", "deployments", "localhost.json");
const wasmPath = path.join(contractsDir, "build", "withdraw_js", "withdraw.wasm");
const zkeyPath = path.join(contractsDir, "build", "withdraw_final.zkey");

const ERC20_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address,uint256)",
  "function decimals() view returns (uint8)",
];
const POOL_ABI = [
  "function deposit(uint256,uint256,bytes)",
  "function withdraw(uint256[2],uint256[2][2],uint256[2],uint256[7])",
  "function getLastRoot() view returns (uint256)",
  "function commitments(uint256) view returns (bool)",
  "event Deposit(uint256 indexed commitment, uint32 leafIndex, uint256 value, bytes encryptedNote, uint256 timestamp)",
  "event Withdrawal(uint256 indexed nullifierHash, address indexed recipient, address indexed relayer, uint256 value, uint256 relayerFee, uint256 protocolFee)",
];
const ASP_ABI = [
  "function publishRoot(uint256,string)",
  "function isKnownRoot(uint256) view returns (bool)",
];

const usdc = (v) => `${formatUnits(v, 6)} USDC`;

function status() {
  if (!fs.existsSync(deploymentFile)) {
    return { ready: false, reason: "no deployment — run scripts/deploy.ts --network localhost" };
  }
  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    return { ready: false, reason: "circuit artifacts missing — run scripts/build-circuit.sh" };
  }
  const dep = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  if (dep.verifier !== "Groth16Verifier") {
    return { ready: false, reason: "deployment uses the mock verifier — rebuild the circuit and redeploy" };
  }
  return { ready: true, contracts: dep.contracts };
}

async function runFlow() {
  const st = status();
  if (!st.ready) throw new Error(st.reason);
  const c = st.contracts;

  const provider = new JsonRpcProvider(RPC);
  const deployer = await provider.getSigner(0);
  const business = await provider.getSigner(1);
  const supplier = await provider.getSigner(2);
  const relayerOp = await provider.getSigner(3);
  const supplierAddr = await supplier.getAddress();

  const poseidon = await buildVeilPoseidon();
  const usdcC = new Contract(c.usdc, ERC20_ABI, deployer);
  const pool = new Contract(c.pool, POOL_ABI, provider);
  const asp = new Contract(c.associationSetRegistry, ASP_ABI, deployer);

  const amount = 1_000_000_000n; // 1,000 USDC
  const supplierBefore = await usdcC.balanceOf(supplierAddr);

  // 1. Business shields funds.
  await (await usdcC.mint(await business.getAddress(), amount)).wait();
  const wallet = new VeilWallet();
  const client = new PaymentsClient(pool.connect(business), usdcC.connect(business), poseidon, wallet);
  const { commitment } = await client.shield(amount);

  const depEvents = await pool.queryFilter(pool.filters.Deposit());
  const depEv = depEvents.find((e) => BigInt(e.args.commitment) === commitment);
  const ciphertext = depEv.args.encryptedNote;

  // 2. ASP publishes the approved set.
  const set = new AssociationSet(poseidon, DEFAULT_LEVELS, [commitment]);
  await (await asp.publishRoot(set.root, "ipfs://approved-set-web")).wait();

  // 3. Relayer pays the supplier privately (real proof, gasless for the business).
  const relayer = new Relayer(pool.connect(relayerOp), {
    wasmPath, zkeyPath, poseidon, relayerAddress: await relayerOp.getAddress(),
  });
  const fee = 3_000_000n;
  await client.pay(wallet.unspent()[0].note, supplierAddr, relayer, set, fee);

  const wdEvents = await pool.queryFilter(pool.filters.Withdrawal());
  const wdEv = wdEvents[wdEvents.length - 1];
  const protocolFee = amount / 1000n;
  const supplierAfter = await usdcC.balanceOf(supplierAddr);

  // 4. Auditor decrypts the note with the view key.
  const recovered = client.audit(ciphertext);

  return {
    contracts: c,
    amount: usdc(amount),
    steps: [
      {
        actor: "Business",
        title: "Shielded 1,000 USDC",
        detail: "Funds moved into the pool. The deposit is public, but the amount is now bound to a secret note.",
        tx: depEv.transactionHash,
      },
      {
        actor: "Compliance (ASP)",
        title: "Published approved-set root",
        detail: "The screening provider vouches for this deposit, enabling a proof of innocence at withdrawal.",
        tx: null,
      },
      {
        actor: "Relayer",
        title: `Paid supplier ${usdc(amount - fee - protocolFee)} privately`,
        detail: "A real zero-knowledge proof was generated and submitted. The business paid no gas; the sender↔recipient link is hidden.",
        tx: wdEv.transactionHash,
      },
      {
        actor: "Auditor",
        title: `Decrypted note: ${usdc(recovered.value)}`,
        detail: "With the view key, the auditor recovers the exact amount — selective disclosure, no backdoor.",
        tx: null,
      },
    ],
    publicView: {
      commitment: commitment.toString(),
      ciphertext: hexlify(ciphertext),
      nullifierHash: wdEv.args.nullifierHash.toString(),
      note: "This is everything the public ledger reveals — a commitment and an encrypted blob. No amount, no link.",
    },
    auditorView: {
      decryptedAmount: usdc(recovered.value),
      note: "What the view-key holder sees.",
    },
    amounts: {
      shielded: usdc(amount),
      toSupplier: usdc(amount - fee - protocolFee),
      relayerFee: usdc(fee),
      protocolFee: usdc(protocolFee),
      supplierBefore: usdc(supplierBefore),
      supplierAfter: usdc(supplierAfter),
    },
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const html = fs.readFileSync(path.join(__dirname, "public", "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }
  if (req.method === "GET" && req.url === "/api/status") {
    const st = status();
    let node = false;
    try {
      await new JsonRpcProvider(RPC).getBlockNumber();
      node = true;
    } catch {}
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ...st, node, rpc: RPC }));
  }
  if (req.method === "POST" && req.url === "/api/run") {
    try {
      const result = await runFlow();
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`VEIL dashboard on http://localhost:${PORT}  (RPC ${RPC})`);
  const st = status();
  if (!st.ready) console.log(`  note: ${st.reason}`);
});
