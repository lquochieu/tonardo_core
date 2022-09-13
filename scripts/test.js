/* global artifacts, web3, contract */
const web3 = require('web3')
require('chai').use(require('bn-chai')(web3.utils.BN)).use(require('chai-as-promised')).should()
const fs = require('fs')

const { toBN } = require('web3-utils')

const { ETH_AMOUNT, TOKEN_AMOUNT, MERKLE_TREE_HEIGHT, ERC20_TOKEN } = process.env

const websnarkUtils = require('websnark/src/utils')
const buildGroth16 = require('websnark/src/groth16')
const stringifyBigInts = require('websnark/tools/stringifybigint').stringifyBigInts
const snarkjs = require('snarkjs')
const bigInt = snarkjs.bigInt
const crypto = require('crypto')
const circomlib = require('circomlib')
const { MerkleTree } = require('fixed-merkle-tree')

const rbigint = (nbytes) => snarkjs.bigInt.leBuff2int(crypto.randomBytes(nbytes))
const pedersenHash = (data) => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]
const toFixedHex = (number, length = 32) =>
  '0x' +
  bigInt(number)
    .toString(16)
    .padStart(length * 2, '0')
const getRandomRecipient = () => rbigint(20)

function generateDeposit() {
  let deposit = {
    secret: rbigint(31),
    nullifier: rbigint(31),
  }
  const preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)])
  deposit.commitment = pedersenHash(preimage)
  return deposit
}

const main = async () => {
  const levels = MERKLE_TREE_HEIGHT || 16
  let tree
  const fee = bigInt(ETH_AMOUNT || 0).shr(1) || bigInt(1e17)
  const refund = ETH_AMOUNT || '1000000000000000000' // 1 ether
  const recipient = '0x0a38Ad8281202e11fEE8F1c0E1eBED6C8E410015'
  const relayer = '0x0a38Ad8281202e11fEE8F1c0E1eBED6C8E410015'
  let groth16
  let circuit
  let proving_key

  tree = new MerkleTree(levels)
  groth16 = await buildGroth16()
  circuit = require('../build/circuits/withdraw.json')
  proving_key = fs.readFileSync('build/circuits/withdraw_proving_key.bin').buffer
  // console.log(deposit)
  // console.log(tree)
  const deposit = generateDeposit()
  tree.insert(deposit.commitment)
  tree.insert(deposit.commitment)
  // console.log(tree)
  const { pathElements, pathIndices } = tree.path(1)
  const input = stringifyBigInts({
    // public
    root: tree.root,
    nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31)),
    relayer: relayer,
    recipient: recipient,
    fee: 0,
    refund: 0,

    // private
    nullifier: deposit.nullifier,
    secret: deposit.secret,
    pathElements: pathElements,
    pathIndices: pathIndices,
  })

  console.log(input)
  const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
  console.log(proofData)
  const { proof } = websnarkUtils.toSolidityInput(proofData)
  console.log(proof)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
