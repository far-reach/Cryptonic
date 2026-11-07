import {
  commitment as commitmentOf,
  type Note,
  type Poseidon,
  type AssociationSet,
} from "../../sdk/dist/index.js";
import { buildPoolTree, type PoolContractLike } from "./poolClient.js";
import { proveWithdraw } from "./prover.js";

export interface RelayerConfig {
  wasmPath: string;
  zkeyPath: string;
  poseidon: Poseidon;
  /** Address the relayer fee is paid to (the relayer's own address). */
  relayerAddress: string;
}

/** Pool contract surface the relayer needs (submit tx + read deposits). */
export interface WithdrawablePool extends PoolContractLike {
  withdraw: (a: unknown, b: unknown, c: unknown, publicSignals: unknown) => Promise<{ wait: () => Promise<any> }>;
}

/**
 * Relayer service — makes withdrawals gasless and proof-free for the user.
 *
 * The user hands the relayer only their note, a recipient, and an agreed fee. The
 * relayer reconstructs the pool tree, builds the Merkle + association-set witnesses,
 * generates the Groth16 proof, and submits the withdrawal transaction (paying gas,
 * recouped from the in-proof relayer fee). The user never touches the proving
 * toolchain, never needs ETH, and can receive to a fresh address.
 */
export class Relayer {
  constructor(private readonly pool: WithdrawablePool, private readonly config: RelayerConfig) {}

  async relayWithdraw(
    note: Note,
    recipient: string,
    associationSet: AssociationSet,
    fee: bigint
  ): Promise<any> {
    const { poseidon } = this.config;
    const commitment = commitmentOf(poseidon, note);

    const tree = await buildPoolTree(this.pool, poseidon);
    const index = tree.indexOf(commitment);
    if (index === -1) throw new Error("commitment not found in pool tree");
    const poolProof = tree.generateProof(index);

    if (!associationSet.includes(commitment)) {
      throw new Error("commitment not in approved association set — refusing to relay");
    }
    const aspProof = associationSet.proofFor(commitment);

    const calldata = await proveWithdraw({
      note,
      recipient,
      relayer: this.config.relayerAddress,
      fee,
      poolProof,
      aspProof,
      wasmPath: this.config.wasmPath,
      zkeyPath: this.config.zkeyPath,
      poseidon,
    });

    const tx = await this.pool.withdraw(
      calldata.a,
      calldata.b,
      calldata.c,
      calldata.publicSignals
    );
    return tx.wait();
  }
}
