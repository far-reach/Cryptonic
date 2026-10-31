import { VeilMerkleTree, DEFAULT_LEVELS, type Poseidon } from "../../sdk/dist/index.js";

/** Minimal shape of the ethers Contract methods the client uses (keeps ethers a peer, not a dep). */
export interface PoolContractLike {
  filters: { Deposit: () => unknown };
  queryFilter: (filter: unknown, from?: number, to?: number) => Promise<Array<{ args: any }>>;
}

export interface DepositLeaf {
  commitment: bigint;
  index: number;
}

/** Read all deposits from the pool, ordered by leaf index. */
export async function fetchDepositLeaves(pool: PoolContractLike): Promise<DepositLeaf[]> {
  const events = await pool.queryFilter(pool.filters.Deposit());
  return events
    .map((e) => ({ commitment: BigInt(e.args.commitment), index: Number(e.args.leafIndex) }))
    .sort((x, y) => x.index - y.index);
}

/**
 * Reconstruct the pool's commitment tree from on-chain Deposit events, so the
 * relayer can build a Merkle inclusion proof for any note without trusting an
 * external indexer.
 */
export async function buildPoolTree(
  pool: PoolContractLike,
  poseidon: Poseidon,
  levels: number = DEFAULT_LEVELS
): Promise<VeilMerkleTree> {
  const leaves = await fetchDepositLeaves(pool);
  const tree = new VeilMerkleTree(poseidon, levels);
  for (const leaf of leaves) tree.insert(leaf.commitment);
  return tree;
}
