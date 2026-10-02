use soroban_sdk::{contracttype, panic_with_error, Address, Env, String, Vec};

use crate::{
    Currency, DistributionSummary, EvidenceRecord, ExitRecord, HolderSettlement, PayoutError,
    SwapFailureRecord,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Operator,
    Ally,
    PlatformFeeRecipient,
    IncomeToken,
    Whitelist,
    UsdcToken,
    EurcToken,
    SwapRouter,
    Paused,
    Guard,
    Evidence(String),
    CurrencyPreference(Address),
    SwapFailures(String),
    Exit,
    /// Persisted `DistributionSummary` for a cycle, written once at payout time.
    DistributionSummary(String),
    /// Persisted per-cycle settlement outcomes, one entry per paid holder.
    ///
    /// A single entry per cycle rather than one key per (cycle, holder): the
    /// distribution already writes one entry per holder, and a max of
    /// `MAX_HOLDERS` settlements in one vector keeps `execute_distribution`
    /// inside the ledger-footprint budget at the supported holder count.
    Settlements(String),
    /// Running total of USDC reserved in this contract for a holder whose EURC
    /// swap legs were rejected, and which they have not yet claimed.
    WithheldBalance(Address),
}

pub struct Storage;

impl Storage {
    pub fn is_initialized(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn set_address(env: &Env, key: &DataKey, address: &Address) {
        env.storage().instance().set(key, address);
    }

    pub fn address(env: &Env, key: &DataKey) -> Option<Address> {
        env.storage().instance().get(key)
    }

    pub fn is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    pub fn evidence(env: &Env, cycle_id: &String) -> Option<EvidenceRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Evidence(cycle_id.clone()))
    }

    pub fn set_evidence(env: &Env, cycle_id: &String, record: &EvidenceRecord) {
        env.storage()
            .persistent()
            .set(&DataKey::Evidence(cycle_id.clone()), record);
    }

    /// Explicit settlement-currency preference of a single holder.
    /// Absence means USDC (the default), so existing holders are unaffected.
    pub fn currency_preference(env: &Env, holder: &Address) -> Option<Currency> {
        env.storage()
            .persistent()
            .get(&DataKey::CurrencyPreference(holder.clone()))
    }

    pub fn set_currency_preference(env: &Env, holder: &Address, currency: &Currency) {
        env.storage()
            .persistent()
            .set(&DataKey::CurrencyPreference(holder.clone()), currency);
    }

    /// On-chain record of swap legs rejected during a cycle's distribution.
    /// Persisted so a rejected leg is auditable rather than silent.
    pub fn swap_failures(env: &Env, cycle_id: &String) -> Vec<SwapFailureRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::SwapFailures(cycle_id.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    pub fn push_swap_failure(env: &Env, cycle_id: &String, record: &SwapFailureRecord) {
        let mut failures = Self::swap_failures(env, cycle_id);
        failures.push_back(record.clone());
        env.storage()
            .persistent()
            .set(&DataKey::SwapFailures(cycle_id.clone()), &failures);
    }

    /// The terminal exit record, if the ally/property relationship has been
    /// permanently ended via `exit`. Absence means the pilot is still active.
    /// Stored in instance storage because it is a single contract-wide fact,
    /// set exactly once and never removed.
    pub fn exit_record(env: &Env) -> Option<ExitRecord> {
        env.storage().instance().get(&DataKey::Exit)
    }

    pub fn set_exit_record(env: &Env, record: &ExitRecord) {
        env.storage().instance().set(&DataKey::Exit, record);
    }

    /// Persisted distribution summary for a cycle.
    ///
    /// The returned `DistributionSummary` of `execute_distribution` and its
    /// event both live only as long as the RPC keeps them, so the fee, the
    /// delivered totals, and the withheld total for a cycle are written here as
    /// well. An investor reading payout history months later gets the numbers
    /// the chain actually recorded, not whatever an event log still happens to
    /// retain.
    pub fn distribution_summary(env: &Env, cycle_id: &String) -> Option<DistributionSummary> {
        env.storage()
            .persistent()
            .get(&DataKey::DistributionSummary(cycle_id.clone()))
    }

    pub fn set_distribution_summary(env: &Env, cycle_id: &String, summary: &DistributionSummary) {
        env.storage()
            .persistent()
            .set(&DataKey::DistributionSummary(cycle_id.clone()), summary);
    }

    /// What each holder actually received for a cycle, and in which currency.
    ///
    /// Persisted per cycle so the investor view can answer "what was I paid, and
    /// in what currency" from contract storage rather than by recomputing a
    /// pro-rata split that could drift from the transfer that actually happened.
    pub fn settlements(env: &Env, cycle_id: &String) -> Vec<HolderSettlement> {
        env.storage()
            .persistent()
            .get(&DataKey::Settlements(cycle_id.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    pub fn set_settlements(env: &Env, cycle_id: &String, settlements: &Vec<HolderSettlement>) {
        env.storage()
            .persistent()
            .set(&DataKey::Settlements(cycle_id.clone()), settlements);
    }

    /// One holder's outcome within a cycle's settlements, if they were paid.
    pub fn settlement(env: &Env, cycle_id: &String, holder: &Address) -> Option<HolderSettlement> {
        for i in 0..Self::settlements(env, cycle_id).len() {
            let entry = Self::settlements(env, cycle_id).get(i)?;
            if entry.holder == *holder {
                return Some(entry);
            }
        }
        None
    }

    /// USDC reserved in this contract for a holder, claimable via
    /// `claim_withheld`.
    ///
    /// Tracked per holder rather than as a single contract-wide figure so that
    /// no unit of withheld USDC can be claimed by anyone but the holder it
    /// belongs to: the release path debits this key and transfers exactly what
    /// it holds.
    pub fn withheld_balance(env: &Env, holder: &Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::WithheldBalance(holder.clone()))
            .unwrap_or(0)
    }

    pub fn add_withheld(env: &Env, holder: &Address, amount: i128) {
        let updated = Self::withheld_balance(env, holder)
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(env, PayoutError::ArithmeticOverflow));
        env.storage()
            .persistent()
            .set(&DataKey::WithheldBalance(holder.clone()), &updated);
    }

    /// Debit a holder's reserved balance, returning the amount released.
    ///
    /// Zeroing the key rather than deleting it keeps the write explicit in the
    /// ledger entry, so a double claim is visibly a debit of zero.
    pub fn take_withheld(env: &Env, holder: &Address) -> i128 {
        let current = Self::withheld_balance(env, holder);
        env.storage()
            .persistent()
            .set(&DataKey::WithheldBalance(holder.clone()), &0i128);
        current
    }
}
