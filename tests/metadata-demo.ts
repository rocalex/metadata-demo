import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MetadataProgram, DataV2, Metadata, MasterEdition } from "@metaplex-foundation/mpl-token-metadata";
import { MetadataDemo } from '../target/types/metadata_demo';

describe('metadata-demo', () => {

  const provider = anchor.Provider.env();
  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const program = anchor.workspace.MetadataDemo as Program<MetadataDemo>;

  it('Initialize', async () => {
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });

  it('Create metadata', async () => {
    const mint = anchor.web3.Keypair.generate();
    const payer = program.provider.wallet.publicKey;

    const [authority] = (await anchor.web3.PublicKey.findProgramAddress([
      Buffer.from("auth"),
    ], program.programId));

    const tokenAccount = (await anchor.web3.PublicKey.findProgramAddress([
      authority.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.publicKey.toBuffer()
    ], ASSOCIATED_TOKEN_PROGRAM_ID))[0];

    const data = new DataV2({
      name: "Collection",
      symbol: "NFT",
      uri: "https://uri",
      sellerFeeBasisPoints: 1000,
      creators: null,
      collection: null,
      uses: null
    });

    const metadataAccount = await Metadata.getPDA(mint.publicKey);
    const editionAccount = await MasterEdition.getPDA(mint.publicKey);

    // @ts-ignore
    const tx = await program.methods.createMasterEdition(data, true, null).accounts({
      authority,
      mint: mint.publicKey,
      tokenAccount,
      metadataAccount,
      editionAccount,
      metadataProgram: MetadataProgram.PUBKEY,
    }).signers([mint]).rpc();
    console.log("Your transaction signature", tx);
  })
});
