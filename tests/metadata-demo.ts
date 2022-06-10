import assert from "assert";
import * as anchor from "@project-serum/anchor";
import { Program, AnchorProvider } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  MetadataProgram,
  DataV2,
  Metadata,
  MasterEdition,
} from "@metaplex-foundation/mpl-token-metadata";
import { MetadataDemo } from "../target/types/metadata_demo";

const encode = anchor.utils.bytes.utf8.encode;

describe("metadata-demo", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MetadataDemo as Program<MetadataDemo>;

  let mint: PublicKey;

  before(async () => {
    const [authority] = await anchor.web3.PublicKey.findProgramAddress(
      [encode("auth")],
      program.programId
    );
    mint = await createMint(provider, authority);
  });

  it("Create metadata", async () => {
    const user = anchor.web3.Keypair.generate();

    const [authority] = await anchor.web3.PublicKey.findProgramAddress(
      [encode("auth")],
      program.programId
    );

    const tokenAccount = await createTokenAccount(
      provider,
      mint,
      user.publicKey
    );

    const data = new DataV2({
      name: "Collection",
      symbol: "NFT",
      uri: "https://uri",
      sellerFeeBasisPoints: 1000,
      creators: null,
      collection: null,
      uses: null,
    });

    const metadataAccount = await Metadata.getPDA(mint);
    const editionAccount = await MasterEdition.getPDA(mint);

    const tx = await program.methods
      // @ts-ignore
      .createMasterEdition(data, true, null)
      .accounts({
        payer: provider.wallet.publicKey,
        authority,
        mint,
        user: user.publicKey,
        tokenAccount,
        metadataAccount,
        editionAccount,
        metadataProgram: MetadataProgram.PUBKEY,
      })
      .rpc();
    console.log("Your transaction signature", tx);

    const mintInfo = await getMintInfo(provider, mint);
    const tokenAccountAccount = await getTokenAccount(provider, tokenAccount);

    assert.ok(mintInfo.decimals == 0)
    assert.ok(mintInfo.supply.eq(new anchor.BN(1)))

    assert.ok(tokenAccountAccount.owner.equals(user.publicKey))
    assert.ok(tokenAccountAccount.amount.eq(new anchor.BN(1)))
  });
});

import * as serumCmn from "@project-serum/common";
import { TokenInstructions } from "@project-serum/serum";

async function getTokenAccount(provider, addr: PublicKey) {
  return await serumCmn.getTokenAccount(provider, addr);
}

async function getMintInfo(provider, mintAddr: PublicKey) {
  return await serumCmn.getMintInfo(provider, mintAddr);
}

async function createMint(provider: AnchorProvider, authority: PublicKey) {
  const mint = anchor.web3.Keypair.generate();
  const instructions = await createMintInstructions(
    provider,
    authority,
    mint.publicKey
  );

  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);

  await provider.sendAndConfirm(tx, [mint]);

  return mint.publicKey;
}

async function createMintInstructions(
  provider: AnchorProvider,
  authority: PublicKey,
  mint: PublicKey
) {
  let instructions = [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeMint({
      mint,
      decimals: 0,
      mintAuthority: authority,
      freezeAuthority: authority,
    }),
  ];
  return instructions;
}

async function createTokenAccount(
  provider: AnchorProvider,
  mint: PublicKey,
  owner: PublicKey
) {
  const vault = anchor.web3.Keypair.generate();
  const tx = new anchor.web3.Transaction();
  tx.add(
    ...(await createTokenAccountInstrs(provider, vault.publicKey, mint, owner))
  );
  await provider.sendAndConfirm(tx, [vault]);
  return vault.publicKey;
}

async function createTokenAccountInstrs(
  provider: AnchorProvider,
  newAccountPubkey: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  lamports: number = undefined
) {
  if (lamports === undefined) {
    lamports = await provider.connection.getMinimumBalanceForRentExemption(165);
  }
  return [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey,
      space: 165,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeAccount({
      account: newAccountPubkey,
      mint,
      owner,
    }),
  ];
}
