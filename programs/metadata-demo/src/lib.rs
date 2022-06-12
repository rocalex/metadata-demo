pub mod error;
pub mod state;
pub mod utils;

use anchor_lang::{prelude::*, solana_program::entrypoint::ProgramResult};
use anchor_spl::{
    self,
    token::{self, Mint, Token, TokenAccount},
};
use mpl_token_metadata::state::{Collection, Creator, DataV2, UseMethod, Uses};
use state::{Bridge, Action};

declare_id!("AtnsRniY7WdEban5BDenyDD8bD63JijL8EC1gn9SpZ3L");

#[program]
pub mod metadata_demo {
    use crate::utils::validate_action;

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, group_key: [u8; 32],) -> Result<()> {
        ctx.accounts.bridge.action_cnt = 0;
        ctx.accounts.bridge.group_key = group_key;
        Ok(())
    }

    pub fn create_action(ctx: Context<CreateAction>, action: u64) -> Result<()> {
        ctx.accounts.action.action = action;
        Ok(())
    }

    pub fn create_master_edition(
        ctx: Context<CreateMasterEdition>,
        data: CreateNftData,
    ) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge;
        if ctx.accounts.token_account.owner != ctx.accounts.user.key() {
            return Err(MyError::InvalidUser.into());
        }

        validate_action(&ctx.accounts.instruction_acc, bridge, data.try_to_vec()?)?;

        let mint_to_ctx = token::MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        let auth_seeds = ["auth".as_bytes(), &[ctx.bumps["authority"]]];

        let datav2 = AnchorDataV2 {
            name: data.token_name,
            symbol: data.token_symbol,
            uri: data.token_uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                mint_to_ctx,
                &[&auth_seeds],
            ),
            1,
        )?;

        create_metadata_accounts_v2(
            CpiContext::new_with_signer(
                ctx.accounts.metadata_program.to_account_info(),
                ctx.accounts.clone(),
                &[&auth_seeds],
            ),
            false,
            true,
            datav2.into(),
        )?;

        create_master_edition_v3(
            CpiContext::new_with_signer(
                ctx.accounts.metadata_program.to_account_info(),
                ctx.accounts.clone(),
                &[&auth_seeds],
            ),
            None,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 48, seeds = [b"xp_bridge".as_ref()], bump)]
    pub bridge: Account<'info, Bridge>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateAction<'info> {
    #[account(init, payer = user, space = 8 + 98)]
    pub action: Account<'info, Action>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct CreateNftData {
    token_name: String,
    token_symbol: String,
    token_uri: String,
}

#[derive(Accounts, Clone)]
pub struct CreateMasterEdition<'info> {
    #[account(mut, seeds = [b"xp_bridge".as_ref()], bump)]
    pub bridge: Account<'info, Bridge>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK:
    #[account(seeds = ["auth".as_bytes()], bump)]
    pub authority: AccountInfo<'info>,
    #[account(mut, mint::decimals = 0, mint::authority = authority, mint::freeze_authority = authority)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    /// CHECK:
    pub user: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub metadata_account: AccountInfo<'info>,
    /// CHECK:
    #[account(mut)]
    pub edition_account: AccountInfo<'info>,
    pub metadata_program: Program<'info, TokenMetadata>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    /// CHECK:
    pub instruction_acc: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Debug, Clone)]
pub struct AnchorDataV2 {
    /// The name of the asset
    pub name: String,
    /// The symbol for the asset
    pub symbol: String,
    /// URI pointing to JSON representing the asset
    pub uri: String,
    /// Royalty basis points that goes to creators in secondary sales (0-10000)
    pub seller_fee_basis_points: u16,
    /// Array of creators, optional
    pub creators: Option<Vec<AnchorCreator>>,
    /// Collection
    pub collection: Option<AnchorCollection>,
    /// Uses
    pub uses: Option<AnchorUses>,
}

impl From<AnchorDataV2> for DataV2 {
    fn from(item: AnchorDataV2) -> Self {
        DataV2 {
            name: item.name,
            symbol: item.symbol,
            uri: item.uri,
            seller_fee_basis_points: item.seller_fee_basis_points,
            creators: item
                .creators
                .map(|a| a.into_iter().map(|v| v.into()).collect()),
            collection: item.collection.map(|v| v.into()),
            uses: item.uses.map(|v| v.into()),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Debug, Clone, Copy)]
pub struct AnchorCreator {
    pub address: Pubkey,
    pub verified: bool,
    // In percentages, NOT basis points ;) Watch out!
    pub share: u8,
}

impl From<AnchorCreator> for Creator {
    fn from(item: AnchorCreator) -> Self {
        Creator {
            address: item.address,
            verified: item.verified,
            share: item.share,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Debug, Clone, Copy)]
pub struct AnchorCollection {
    pub verified: bool,
    pub key: Pubkey,
}

impl From<AnchorCollection> for Collection {
    fn from(item: AnchorCollection) -> Self {
        Collection {
            verified: item.verified,
            key: item.key,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Debug, Clone, Copy)]
pub enum AnchorUseMethod {
    Burn,
    Multiple,
    Single,
}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Debug, Clone, Copy)]
pub struct AnchorUses {
    pub use_method: AnchorUseMethod,
    pub remaining: u64,
    pub total: u64,
}

impl From<AnchorUses> for Uses {
    fn from(item: AnchorUses) -> Self {
        Uses {
            use_method: item.use_method.into(),
            remaining: item.remaining,
            total: item.total,
        }
    }
}

impl From<AnchorUseMethod> for UseMethod {
    fn from(item: AnchorUseMethod) -> Self {
        match item {
            AnchorUseMethod::Burn => UseMethod::Burn,
            AnchorUseMethod::Multiple => UseMethod::Burn,
            AnchorUseMethod::Single => UseMethod::Burn,
        }
    }
}

pub fn create_metadata_accounts_v2<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, CreateMasterEdition<'info>>,
    update_authority_is_signer: bool,
    is_mutable: bool,
    data: DataV2,
) -> ProgramResult {
    let ix = mpl_token_metadata::instruction::create_metadata_accounts_v2(
        mpl_token_metadata::ID.clone(),
        ctx.accounts.metadata_account.key.clone(),
        ctx.accounts.mint.to_account_info().key(),
        ctx.accounts.authority.key.clone(),
        ctx.accounts.payer.key.clone(),
        ctx.accounts.authority.key.clone(),
        data.name,
        data.symbol,
        data.uri,
        data.creators,
        data.seller_fee_basis_points,
        update_authority_is_signer,
        is_mutable,
        data.collection,
        data.uses,
    );
    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[
            ctx.accounts.metadata_account,
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.clone(),
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.authority.clone(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
        ctx.signer_seeds,
    )
}

pub fn create_master_edition_v3<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, CreateMasterEdition<'info>>,
    max_supply: Option<u64>,
) -> ProgramResult {
    let ix = mpl_token_metadata::instruction::create_master_edition_v3(
        mpl_token_metadata::ID.clone(),
        ctx.accounts.edition_account.key.clone(),
        ctx.accounts.mint.to_account_info().key(),
        ctx.accounts.authority.key.clone(),
        ctx.accounts.authority.key.clone(),
        ctx.accounts.metadata_account.key.clone(),
        ctx.accounts.payer.key.clone(),
        max_supply,
    );
    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[
            ctx.accounts.edition_account,
            ctx.accounts.metadata_account,
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.clone(),
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.authority,
            ctx.accounts.rent.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        ctx.signer_seeds,
    )
}

#[derive(Clone)]
pub struct TokenMetadata;

impl anchor_lang::Id for TokenMetadata {
    fn id() -> Pubkey {
        mpl_token_metadata::ID
    }
}

#[error_code]
pub enum MyError {
    #[msg("invalid user")]
    InvalidUser,
}
