import assert from "assert";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getMint
} from "@solana/spl-token";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  MetadataProgram,
  DataV2,
  Metadata,
  MasterEdition,
} from "@metaplex-foundation/mpl-token-metadata";
import { MetadataDemo } from "../target/types/metadata_demo";
import { BN } from "bn.js";

const encode = anchor.utils.bytes.utf8.encode;

describe("metadata-demo", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MetadataDemo as Program<MetadataDemo>;

  let mint: PublicKey;
  let payer: Keypair;

  before(async () => {
    const [authority] = await anchor.web3.PublicKey.findProgramAddress(
      [encode("auth")],
      program.programId
    );
    payer = Keypair.generate();
    const airdropSignature = await provider.connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL
    );
    const blockhash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
      signature: airdropSignature,
    });
    mint = await createMint(
      provider.connection,
      payer,
      authority,
      authority,
      0
    );
  });

  it("Create metadata", async () => {
    const user = anchor.web3.Keypair.generate();

    const [authority] = await anchor.web3.PublicKey.findProgramAddress(
      [encode("auth")],
      program.programId
    );

    let tokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
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
        payer: payer.publicKey,
        authority,
        mint,
        user: user.publicKey,
        tokenAccount: tokenAccount.address,
        metadataAccount,
        editionAccount,
        metadataProgram: MetadataProgram.PUBKEY,
      })
      .signers([payer])
      .rpc();
    console.log("Your transaction signature", tx);

    const mintInfo = await getMint(provider.connection, mint);

    tokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      user.publicKey
    );

    assert.ok(mintInfo.decimals == 0)
    assert.ok((new BN(1)).eq(new BN(mintInfo.supply.toString())))

    assert.ok(tokenAccount.owner.equals(user.publicKey))
    assert.ok((new BN(tokenAccount.amount.toString())).eq(new anchor.BN(1)))
  });
});
