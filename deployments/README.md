# Deployments

Deployment address books written by `packages/contracts/scripts/deploy.ts`, one JSON per network.

Local/ephemeral outputs (`localhost.json`, `hardhat.json`) are gitignored; testnet/mainnet
deployments can be committed here for reference.

## Deploy

```bash
cd packages/contracts

# Local devnet:
npx hardhat node &                                   # terminal 1
npx hardhat run scripts/deploy.ts --network localhost

# Sepolia (needs a funded key):
SEPOLIA_RPC_URL=https://... DEPLOYER_PRIVATE_KEY=0x... \
  npx hardhat run scripts/deploy.ts --network sepolia
```

Each file records every contract: the Poseidon hasher, the (real or mock) verifier, the
stablecoin, the VEIL token, swap router, buyback-burner, staking, association-set registry, the
pool, and the cross-chain settlers + oracle.

> On a real network, deploy against an existing USDC address and a real DEX router instead of
> the `MockERC20` / `MockSwapRouter` used for local runs.
