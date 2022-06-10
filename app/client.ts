import * as dotenv from "dotenv";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  MetadataProgram,
  DataV2,
  Metadata,
  MasterEdition,
} from "@metaplex-foundation/mpl-token-metadata";
import { MetadataDemo } from "../target/types/metadata_demo";

dotenv.config();

const options = anchor.AnchorProvider.defaultOptions();
const connection = new anchor.web3.Connection(
  "https://api.devnet.solana.com",
  options.commitment
);
const wallet = anchor.Wallet.local();
const provider = new anchor.AnchorProvider(connection, wallet, options);

anchor.setProvider(provider);

async function main() {
  const program = anchor.workspace.MetadataDemo as Program<MetadataDemo>;

  console.log(program.programId.toBase58());
  const mint = anchor.web3.Keypair.generate();
  const payer = provider.wallet.publicKey;

  const [authority] = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from("auth")],
    program.programId
  );

  const tokenAccount = (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        authority.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.publicKey.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )[0];

  const data = new DataV2({
    name: "Collection",
    symbol: "NFT",
    uri: "https://wnfts.xp.network/w/61ee6263888899d2b37166d2",
    sellerFeeBasisPoints: 1000,
    creators: null,
    collection: null,
    uses: null,
  });

  const metadataAccount = await Metadata.getPDA(mint.publicKey);
  const editionAccount = await MasterEdition.getPDA(mint.publicKey);

  const tx = await program.methods
    // @ts-ignore
    .createMasterEdition(data, true, null)
    .accounts({
      authority,
      mint: mint.publicKey,
      tokenAccount,
      metadataAccount,
      editionAccount,
      metadataProgram: MetadataProgram.PUBKEY,
    })
    .signers([mint])
    .rpc();
  console.log("Your transaction signature", tx);
}

console.log("Running client.");
main().then(() => console.log("Success"));
