// @ts-ignore - circomlibjs ships no type declarations
import { buildPoseidon } from "circomlibjs";
import { FIELD_SIZE } from "./constants.js";

export type Poseidon = {
  hash2(a: bigint, b: bigint): bigint;
  hash1(a: bigint): bigint;
};

/**
 * Builds a Poseidon hasher whose outputs match the on-chain circomlib Poseidon
 * (and the withdrawal circuit). `hash1` reuses the 2-input permutation as
 * Poseidon(x, x) so it agrees with the circuit's nullifierHash convention.
 */
export async function buildVeilPoseidon(): Promise<Poseidon> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const toObj = (x: unknown) => F.toObject(x) as bigint;
  const check = (x: bigint) => {
    if (x < 0n || x >= FIELD_SIZE) throw new Error("value out of BN254 field");
    return x;
  };
  return {
    hash2: (a, b) => toObj(poseidon([check(a), check(b)])),
    hash1: (a) => toObj(poseidon([check(a), check(a)])),
  };
}
