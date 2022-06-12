use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use byteorder::ByteOrder;

use crate::state::Bridge;
use crate::error::ErrorCode;

struct Ed25519InstructionPart<'a> {
    address: &'a [u8],
    msg_offset: usize,
    msg_size: usize,
}

pub fn validate_action(instruction_acc: &AccountInfo, bridge: &Account<Bridge>, data: Vec<u8>) -> Result<()> {
    msg!("data: {:?}", data);
    let current_instruction =
        solana_program::sysvar::instructions::load_current_index_checked(&instruction_acc)?;
    if current_instruction == 0 {
        return Err(ErrorCode::InstructionAtWrongIndex.into());
    }

    // The previous ix must be a ed25519 verification instruction
    let ed25519_ix_index = (current_instruction - 1) as u16;
    let ed25519_ix = match solana_program::sysvar::instructions::load_instruction_at_checked(
        ed25519_ix_index as usize,
        &instruction_acc,
    ) {
        Ok(ix) => ix,
        Err(_) => return Err(ErrorCode::InvalidEd25519Instruction.into()),
    };

    // Check that the instruction is actually for the ed25519 program
    if ed25519_ix.program_id != solana_program::ed25519_program::id() {
        return Err(ErrorCode::InvalidProgramId.into());
    }

    let ed25519_data_len = ed25519_ix.data.len();
    if ed25519_data_len < 2 {
        return Err(ErrorCode::InvalidEd25519Instruction.into());
    }
    let sig_len = ed25519_ix.data[0];
    let mut index: usize = 0 // count and padding
        + 2 // signature_offset
        + 2 // signature_instruction_index
        + 2; // public_key_offset
    let mut ed25519_ixs: Vec<Ed25519InstructionPart> = Vec::with_capacity(sig_len as usize);

    for _ in 0..sig_len {
        let address_offset = byteorder::LE::read_u16(&ed25519_ix.data[index..index + 2]) as usize;
        let address: &[u8] = &ed25519_ix.data[address_offset..address_offset + 32];
        index += 4;
        let msg_offset = byteorder::LE::read_u16(&ed25519_ix.data[index..index + 2]) as usize;
        index += 2;
        let msg_size = byteorder::LE::read_u16(&ed25519_ix.data[index..index + 2]) as usize;
        ed25519_ixs.push(Ed25519InstructionPart {
            address,
            msg_offset,
            msg_size,
        });
    }

    // Extract message which is encoded in Solana Secp256k1 instruction data.
    let message = &ed25519_ix.data
        [ed25519_ixs[0].msg_offset..(ed25519_ixs[0].msg_offset + ed25519_ixs[0].msg_size)];

    if bridge.group_key != ed25519_ixs[0].address {
        return Err(ErrorCode::InvalidGroupKey.into());
    }
    let data_hash = solana_program::hash::hash(&data);
    let message_hash = message.to_vec();
    if !message_hash.eq(&data_hash.try_to_vec()?) {
        return Err(ErrorCode::InvalidArgs.into());
    }
    Ok(())
}
