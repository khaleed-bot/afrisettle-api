const prisma = require("../prisma");
const { getCircleSchedulerConfig } = require("../config/circle");
const { reconcileMerchantCirclePayments } = require("./circleReconciliationService");

function isSchedulerEnabled() {
  return getCircleSchedulerConfig().enabled;
}

function getSchedulerIntervalMs() {
  return Math.max(getCircleSchedulerConfig().intervalMs, 1000);
}

function createEmptyTotals() {
  return {
    scanned: 0,
    matched: 0,
    createdPayments: 0,
    updatedPayments: 0,
    confirmedPayments: 0,
    skipped: 0,
    failedMerchants: 0,
  };
}

function addResultToTotals(totals, result) {
  totals.scanned += result.scanned || 0;
  totals.matched += result.matched || 0;
  totals.createdPayments += result.createdPayments || 0;
  totals.updatedPayments += result.updatedPayments || 0;
  totals.confirmedPayments += result.confirmedPayments || 0;
  totals.skipped += result.skipped || 0;
}

function startCircleReconciliationScheduler() {
  if (!isSchedulerEnabled()) {
    console.log("Circle background reconciliation disabled");
    return null;
  }

  const intervalMs = getSchedulerIntervalMs();
  let isRunning = false;

  async function runOnce() {
    if (isRunning) {
      console.log("Circle reconciliation scheduler skipped: previous run still active");
      return;
    }

    isRunning = true;
    const startedAt = Date.now();
    const totals = createEmptyTotals();

    console.log("Circle reconciliation scheduler started");

    try {
      const merchants = await prisma.merchant.findMany({
        where: {
          circleMerchantWalletId: { not: null },
        },
      });

      for (const merchant of merchants) {
        try {
          const result = await reconcileMerchantCirclePayments({
            merchant,
            limit: 20,
          });

          addResultToTotals(totals, result);
        } catch (error) {
          totals.failedMerchants += 1;
          console.error("Circle reconciliation merchant failed", {
            merchantId: merchant.id,
            error: error && error.message ? error.message : "Unknown error",
          });
        }
      }
    } catch (error) {
      console.error("Circle reconciliation scheduler failed", error);
    } finally {
      const durationMs = Date.now() - startedAt;

      console.log("Circle reconciliation scheduler finished", {
        durationMs,
        scanned: totals.scanned,
        matched: totals.matched,
        createdPayments: totals.createdPayments,
        updatedPayments: totals.updatedPayments,
        confirmed: totals.confirmedPayments,
        skipped: totals.skipped,
        failedMerchants: totals.failedMerchants,
      });
      isRunning = false;
    }
  }

  const timer = setInterval(runOnce, intervalMs);
  console.log("Circle background reconciliation enabled", { intervalMs });
  return timer;
}

module.exports = {
  startCircleReconciliationScheduler,
};
