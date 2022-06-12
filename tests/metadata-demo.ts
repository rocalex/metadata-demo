import assert from "assert";
import * as fs from "fs";
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
  SYSVAR_INSTRUCTIONS_PUBKEY,
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
import { field, fixedArray, serialize } from "@dao-xyz/borsh";
import { createHash } from "crypto";

const encode = anchor.utils.bytes.utf8.encode;

class CreateNftData extends Struct {
  @field({ type: "u64" })
  actionId: anchor.BN;
  @field({ type: "String" })
  tokenName: string;
  @field({ type: "String" })
  tokenSymbol: string;
  @field({ type: "String" })
  tokenUri: string;
  @field({ type: fixedArray("u8", 32) })
  owner: number[];
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
  let user: Keypair;

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

    user = Keypair.generate()
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

  it("proxy mint to", async () => {
    const actionId = new anchor.BN(1);
    const action = anchor.web3.Keypair.generate();
    let tx = await program.methods
      .createAction(actionId)
      .accounts({
        action: action.publicKey,
      })
      .signers([action])
      .rpc();

    console.log("transaction signature", tx);

    const [consumedAction, _] = await PublicKey.findProgramAddress(
      [actionId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const [authority] = await anchor.web3.PublicKey.findProgramAddress(
      [encode("auth")],
      program.programId
    );

    let tokenAccount = await mint.getOrCreateAssociatedAccountInfo(user.publicKey);

    const data = new CreateNftData({
      actionId,
      tokenName: "Test",
      tokenSymbol: "wNFT",
      tokenUri:
        "https://v6ahotwazrvostarjcejqieltkiy5ireq7rwlqss4iezbgngakla.arweave.net/r4B3TsDMaulMEUiImCCLmpGOoiSH42XCUuIJkJmmApY/",
      owner: [...user.publicKey.toBuffer()],
    });

    const metadataAccount = await Metadata.getPDA(tokenAccount.mint);
    const editionAccount = await MasterEdition.getPDA(tokenAccount.mint);

    const message = serialize(data);
    const msgHash = createHash("SHA256").update(message).digest();
    const signature = await ed.sign(msgHash, privateKey);
    const verifyInstruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: groupKey,
      message: msgHash,
      signature: signature,
    });

    tx = await program.methods
      .proxyMintTo(data)
      .accounts({
        bridge,
        authority,
        mint: tokenAccount.mint,
        tokenAccount: tokenAccount.address,
        metadataAccount,
        editionAccount,
        metadataProgram: MetadataProgram.PUBKEY,
        instructionAcc: SYSVAR_INSTRUCTIONS_PUBKEY,
        action: action.publicKey,
        consumedAction,
      })
      .preInstructions([verifyInstruction])
      .rpc();
    console.log("Your transaction signature", tx);
  });

  it("Burns a token", async () => {
    const tokenAccount = await mint.getOrCreateAssociatedAccountInfo(user.publicKey);
    const tx = await program.methods
      .proxyBurn()
      .accounts({
        authority: user.publicKey,
        mint: tokenAccount.mint,
        tokenAccount: tokenAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("Your transaction signature", tx);
  });
});
