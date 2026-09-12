import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";

// This environment's egress policy blocks binaries.soliditylang.org, so Hardhat
// cannot download solc. Serve the compiler from the npm `solc` package instead
// (registry.npmjs.org is allowed). Keeps `hardhat test` hermetic and offline.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: any, _hre, runSuper) => {
  if (args.solcVersion === "0.8.24") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: args.solcVersion,
      longVersion: "0.8.24+commit.e11b9ed9.Emscripten.clang",
    };
  }
  return runSuper();
});

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? "";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // `hardhat node` then `--network localhost` for a live local devnet.
    localhost: { url: "http://127.0.0.1:8545" },
    // Ready for `hardhat run scripts/deploy.ts --network sepolia` once
    // SEPOLIA_RPC_URL + DEPLOYER_PRIVATE_KEY are set (needs a funded key).
    sepolia: {
      url: SEPOLIA_RPC,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
};

export default config;
