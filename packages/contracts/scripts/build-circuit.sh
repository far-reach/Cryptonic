#!/usr/bin/env bash
# Compile the VEIL withdrawal circuit and run a Groth16 trusted setup, then export
# the real Solidity verifier that replaces MockVerifier.
#
# Fully offline: the Powers-of-Tau phase-1 is generated locally (fine for a
# prototype; production must use a public multi-party ceremony). Heavy outputs
# land in build/ (gitignored); only contracts/verifiers/Verifier.sol is source.
set -euo pipefail
cd "$(dirname "$0")/.."                 # packages/contracts
ROOT_NM="../../node_modules"            # hoisted circomlib lives here
POWER="${POWER:-16}"                    # 2^16 = 65536 constraints headroom
mkdir -p build

echo "== compile circuit =="
circom circuits/withdraw.circom --r1cs --wasm --sym -l "$ROOT_NM" -o build
npx snarkjs r1cs info build/withdraw.r1cs

echo "== powers of tau (phase 1, local) =="
npx snarkjs powersoftau new bn128 "$POWER" build/pot_0.ptau -v
npx snarkjs powersoftau contribute build/pot_0.ptau build/pot_1.ptau --name="veil-1" -v -e="veil phase1 entropy"
npx snarkjs powersoftau prepare phase2 build/pot_1.ptau build/pot_final.ptau -v

echo "== groth16 setup (phase 2) =="
npx snarkjs groth16 setup build/withdraw.r1cs build/pot_final.ptau build/withdraw_0.zkey
npx snarkjs zkey contribute build/withdraw_0.zkey build/withdraw_final.zkey --name="veil-2" -v -e="veil phase2 entropy"
npx snarkjs zkey export verificationkey build/withdraw_final.zkey build/verification_key.json

echo "== export solidity verifier =="
npx snarkjs zkey export solidityverifier build/withdraw_final.zkey contracts/verifiers/Verifier.sol
# snarkjs names the contract Groth16Verifier; VeilPool consumes it via IVerifier.
echo "Wrote contracts/verifiers/Verifier.sol"
