import assert from "assert";
import * as fs from 'fs';
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import {
  Connection,
  Ed25519Program,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Struct,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY
} from "@solana/web3.js";
import {
  MetadataProgram,
  DataV2,
  Metadata,
  MasterEdition,
} from "@metaplex-foundation/mpl-token-metadata";
import * as ed from "@noble/ed25519";
import { MetadataDemo } from "../target/types/metadata_demo";
import { BN } from "bn.js";
import { field, serialize } from "@dao-xyz/borsh";
import { createHash } from "crypto";

const encode = anchor.utils.bytes.utf8.encode;

class CreateNftData extends Struct {
  @field({ type: "String" })
  tokenName: string;
  @field({ type: "String" })
  tokenSymbol: string;
  @field({ type: "String" })
  tokenUri: string;
}

describe("metadata-demo", () => {
  // Configure the client to use the cluster provided by ANCHOR_PROVIDER_URL.
  const url = process.env.ANCHOR_PROVIDER_URL;
  const options = anchor.AnchorProvider.defaultOptions();
  const connection = new Connection(url, options.commitment);
  const payer = Keypair.fromSecretKey(
      Buffer.from(
          JSON.parse(
              fs.readFileSync(process.env.ANCHOR_WALLET, {
                  encoding: "utf-8",
              })
          )
      )
  );
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, options);
  anchor.setProvider(provider);

  const program = anchor.workspace.MetadataDemo as Program<MetadataDemo>;

  let privateKey: Uint8Array;
  let groupKey: Uint8Array;
  let mint: Token;
  let bridge: PublicKey;

  before(async () => {
    privateKey = ed.utils.randomPrivateKey();
    groupKey = await ed.getPublicKey(privateKey);

    const [authority] = await anchor.web3.PublicKey.findProgramAddress(
      [encode("auth")],
      program.programId
    );
    
    mint = await Token.createMint(
      provider.connection,
      payer,
      authority,
      authority,
      0,
      TOKEN_PROGRAM_ID
    );

    const [b] = await PublicKey.findProgramAddress(
      [encode("xp_bridge")],
      program.programId
    );
    bridge = b;
  });

  it("Initialize", async () => {
    const tx = await program.methods
      .initialize([...groupKey])
      .accounts({
        bridge,
        user: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("transaction signature", tx);
  });

  it("Create metadata", async () => {
    const user = anchor.web3.Keypair.generate();

    const [authority] = await anchor.web3.PublicKey.findProgramAddress(
      [encode("auth")],
      program.programId
    );

    let tokenAccount = await mint.getOrCreateAssociatedAccountInfo(
      user.publicKey
    );

    const data = new CreateNftData({
      tokenName: "Test",
      tokenSymbol: "wNFT",
      tokenUri:
        "https://v6ahotwazrvostarjcejqieltkiy5ireq7rwlqss4iezbgngakla.arweave.net/r4B3TsDMaulMEUiImCCLmpGOoiSH42XCUuIJkJmmApY/",
    })

    const metadataAccount = await Metadata.getPDA(tokenAccount.mint);
    const editionAccount = await MasterEdition.getPDA(tokenAccount.mint);

    const message = serialize(data)
    const msgHash = createHash("SHA256").update(message).digest()
    const signature = await ed.sign(msgHash, privateKey)
    const verifyInstruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: groupKey,
      message: msgHash,
      signature: signature,
    })

    const tx = await program.methods
      .createMasterEdition(data)
      .accounts({
        bridge,
        payer: payer.publicKey,
        authority,
        mint: tokenAccount.mint,
        user: user.publicKey,
        tokenAccount: tokenAccount.address,
        metadataAccount,
        editionAccount,
        metadataProgram: MetadataProgram.PUBKEY,
        instructionAcc: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .signers([payer])
      .preInstructions([verifyInstruction])
      .rpc();
    console.log("Your transaction signature", tx);

    const mintInfo = await mint.getMintInfo();

    tokenAccount = await mint.getOrCreateAssociatedAccountInfo(user.publicKey);

    assert.ok(mintInfo.decimals == 0);
    assert.ok(new BN(1).eq(new BN(mintInfo.supply.toString())));

    assert.ok(tokenAccount.owner.equals(user.publicKey));
    assert.ok(new BN(tokenAccount.amount.toString()).eq(new anchor.BN(1)));
  });
});
