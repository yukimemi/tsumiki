// The kill switch behind the budget alert.
//
// A Cloud Billing budget publishes a notification to the `billing-alerts`
// Pub/Sub topic every time it re-evaluates. This function reads the amount
// spent so far and, once it reaches the budget, unlinks the billing account
// from the project — which stops every metered service, and the app with it.
//
// That is the intended outcome, not a side effect: for a family chore app,
// being down beats an unbounded bill from an abuse loop nobody noticed. It is
// the last resort, behind the reCAPTCHA assessment quota and the budget's own
// 50%/90% emails, both of which fire long before this does.
//
// Re-enabling is manual and deliberate:
//   gcloud billing projects link tsumiki-app-23086 \
//     --billing-account=<ACCOUNT_ID>
// Fix whatever caused the spend first — relinking with the leak still running
// just restarts the meter.

const functions = require("@google-cloud/functions-framework");
const { CloudBillingClient } = require("@google-cloud/billing");
const { decide } = require("./decide");

const billing = new CloudBillingClient();

/** Set at deploy time; the project whose billing gets detached. */
const PROJECT = `projects/${process.env.TARGET_PROJECT_ID}`;

functions.cloudEvent("stopBilling", async (event) => {
  const encoded = event.data?.message?.data;
  if (!encoded) {
    console.warn("[billing-guard] notification carried no data; ignoring");
    return;
  }

  const notice = JSON.parse(Buffer.from(encoded, "base64").toString());
  const amounts = `${notice.costAmount ?? 0}/${notice.budgetAmount ?? 0} ${
    notice.currencyCode ?? ""
  }`;

  // Budgets re-evaluate several times a day, so the quiet path is the common
  // one. Deciding it without a billing read keeps it cheap.
  if (decide(notice, true) === "under-budget") {
    console.log(`[billing-guard] ${amounts} — under budget`);
    return;
  }

  const [info] = await billing.getProjectBillingInfo({ name: PROJECT });
  if (decide(notice, Boolean(info.billingEnabled)) === "already-disabled") {
    // Already tripped. Every later notification in the period lands here.
    console.log("[billing-guard] billing already disabled; nothing to do");
    return;
  }

  // An empty billingAccountName is what "unlink" means to this API.
  await billing.updateProjectBillingInfo({
    name: PROJECT,
    projectBillingInfo: { billingAccountName: "" },
  });
  console.error(`[billing-guard] BILLING DISABLED for ${PROJECT} at ${amounts}`);
});
