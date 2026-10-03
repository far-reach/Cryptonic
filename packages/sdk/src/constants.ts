/** BN254 scalar field modulus. */
export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** keccak256("veil.shielded.pool.v1") % FIELD_SIZE — must match the on-chain contract. */
export const ZERO_VALUE =
  20508465343459127713437550997885324284262230915342444940761755190926324417049n;

/** Default tree depth (2^20 ≈ 1.05M leaves). Must match the deployed pool. */
export const DEFAULT_LEVELS = 20;
