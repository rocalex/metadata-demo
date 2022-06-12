use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Pausable: paused")]
    Paused,
    #[msg("Pausable: unpaused")]
    Unpaused,
    #[msg("Already minted")]
    AlreadyMinted,
    #[msg("Already burned")]
    AlreadyBurned,
    #[msg("instruction at wrong index")]
    InstructionAtWrongIndex,
    #[msg("invalid ed25519 instruction")]
    InvalidEd25519Instruction,
    #[msg("invalid group key")]
    InvalidGroupKey,
    #[msg("invalid program id")]
    InvalidProgramId,
    #[msg("invalid args")]
    InvalidArgs,
    #[msg("invalid action id")]
    InvalidActionId,
    #[msg("duplicated action")]
    DuplicatedAction,
}