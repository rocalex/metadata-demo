use anchor_lang::prelude::*;

#[account]
pub struct Bridge {
    pub action_cnt: u128,
    pub group_key: [u8; 32],
}

#[account]
pub struct Action {
    pub action: u64,
}