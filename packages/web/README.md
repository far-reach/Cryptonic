# @veil/web

A local **confidential-payment dashboard** at `http://localhost:3000`. It runs the *real*
shield → screen → private pay → audit flow against your local devnet and visualizes what the
public ledger sees (an encrypted blob) versus what an auditor decrypts with the view key.

No build step — a plain Node HTTP server plus a self-contained HTML page.

## Run it

You need three things running: a local chain, a deployed stack, and this server.

```bash
# 1) local blockchain + deploy the stack (needs the circuit built once — see packages/contracts)
cd packages/contracts
npx hardhat node &
npx hardhat run scripts/deploy.ts --network localhost

# 2) start the dashboard
cd ../web
npm install
npm start                 # -> http://localhost:3000
```

Open `http://localhost:3000` and click **Run a confidential payment**. Each click executes a
real transaction sequence with a real Groth16 proof:

- **Business** shields 1,000 USDC (amount now private)
- **ASP** publishes the approved-set root (proof of innocence)
- **Relayer** generates the proof and pays the supplier 996 USDC — gasless for the business
- **Auditor** decrypts the note with the view key

The dashboard polls `/api/status` for node + deployment health and calls `POST /api/run` to
execute the flow. Configure with `PORT` and `RPC_URL` env vars.

> Local devnet only. Unaudited research prototype — not for real funds. Uses the local
> hardhat accounts as signers (business/supplier/relayer) for demonstration.
