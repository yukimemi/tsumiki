// The kill switch's decision, split out from the side effect that carries it
// out. The destructive branch cannot be exercised against real GCP without
// taking production down, so this is the only part a test can reach — which is
// exactly why it is worth being sure about.

/**
 * @param {object} notice budget notification payload, already parsed
 * @param {boolean} billingEnabled whether the project still has billing linked
 * @returns {"under-budget"|"already-disabled"|"disable"}
 */
function decide(notice, billingEnabled) {
  // costAmount is absent on the first notification of a budget period, which
  // means nothing has been spent yet — not that the field is broken.
  const cost = Number(notice?.costAmount ?? 0);
  const budget = Number(notice?.budgetAmount ?? 0);

  // A missing, zero or malformed budget must never read as "always over": that
  // would turn a garbled message into an outage.
  if (!Number.isFinite(budget) || budget <= 0) return "under-budget";
  if (!Number.isFinite(cost)) return "under-budget";

  // At exactly the budget the guard fires. The 100% threshold rule is what
  // publishes this notification, so treating equality as "under" would mean
  // the last rule never does anything.
  if (cost < budget) return "under-budget";

  return billingEnabled ? "disable" : "already-disabled";
}

module.exports = { decide };
