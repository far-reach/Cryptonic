import { AssociationSet, DEFAULT_LEVELS, type Poseidon } from "../../sdk/dist/index.js";

export interface DepositRecord {
  depositor: string; // 0x address that made the deposit
  commitment: bigint;
}

export interface RegistryContractLike {
  publishRoot: (root: bigint, ipfsCid: string) => Promise<{ wait: () => Promise<unknown> }>;
}

/**
 * Association Set Provider service.
 *
 * Screens deposits against a denylist (stand-in for real sanctions/AML screening),
 * builds the Merkle set of approved commitments, and publishes its root on-chain.
 * A withdrawer later proves membership in this set (proof of innocence) without
 * revealing which deposit is theirs. The published inclusion list (`ipfsCid`) lets
 * anyone independently reconstruct and audit the root.
 */
export class AspService {
  private readonly denylist: Set<string>;

  constructor(
    private readonly poseidon: Poseidon,
    denylist: string[] = [],
    private readonly levels: number = DEFAULT_LEVELS
  ) {
    this.denylist = new Set(denylist.map((a) => a.toLowerCase()));
  }

  isBlocked(depositor: string): boolean {
    return this.denylist.has(depositor.toLowerCase());
  }

  /** Commitments that pass screening, in input order. */
  screen(records: DepositRecord[]): bigint[] {
    return records.filter((r) => !this.isBlocked(r.depositor)).map((r) => r.commitment);
  }

  /** Build the approved association set from screened deposits. */
  buildSet(records: DepositRecord[]): AssociationSet {
    return new AssociationSet(this.poseidon, this.levels, this.screen(records));
  }

  /** Publish the set's root to the on-chain registry. */
  async publish(registry: RegistryContractLike, set: AssociationSet, ipfsCid: string): Promise<void> {
    const tx = await registry.publishRoot(set.root, ipfsCid);
    await tx.wait();
  }
}
