const prisma = require("../prisma");
const circleClient = require("./circleClient");

function normalizeRequiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function normalizePositiveDecimal(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  if (Number(normalized) <= 0) {
    return null;
  }

  return normalized;
}

function normalizeComparableString(value) {
  return normalizeRequiredString(value).toLowerCase();
}

function unwrapCircleTransactions(data) {
  if (data && Array.isArray(data.transactions)) {
    return data.transactions;
  }

  if (data && data.data && Array.isArray(data.data.transactions)) {
    return data.data.transactions;
  }

  return [];
}

function getCircleTransactionId(transaction) {
  return transaction && (transaction.id || transaction.transactionId);
}

function getCircleTransactionAmount(transaction) {
  if (!transaction) {
    return null;
  }

  if (Array.isArray(transaction.amounts) && transaction.amounts[0]) {
    return normalizePositiveDecimal(transaction.amounts[0]);
  }

  return normalizePositiveDecimal(transaction.amount);
}

function getCircleTransactionStablecoin(transaction) {
  const stablecoin =
    transaction &&
    (transaction.stablecoin ||
      transaction.tokenSymbol ||
      (transaction.token &&
        (transaction.token.symbol || transaction.token.name)));

  return normalizeRequiredString(stablecoin || "USDC").toUpperCase();
}

function getCircleTransactionWalletId(transaction) {
  return transaction && (transaction.walletId || transaction.walletID);
}

function isInboundCircleTransfer(transaction) {
  return (
    transaction &&
    transaction.transactionType === "INBOUND" &&
    (!transaction.operation || transaction.operation === "TRANSFER")
  );
}

function isCircleTransactionComplete(transaction) {
  return (
    normalizeRequiredString(transaction && transaction.state).toUpperCase() ===
    "COMPLETE"
  );
}

function isAmountSettled(amountReceived, amountExpected) {
  return Number(amountReceived) >= Number(amountExpected);
}

function isUniqueConstraintError(error) {
  return error && error.code === "P2002";
}

async function reconcileMerchantCirclePayments({ merchant, limit = 20 }) {
  if (!circleClient.isConfigured()) {
    const error = new Error("Circle is not configured");
    error.code = "CIRCLE_NOT_CONFIGURED";
    throw error;
  }

  if (!merchant || !merchant.circleMerchantWalletId) {
    const error = new Error("Merchant Circle wallet is not configured");
    error.code = "CIRCLE_WALLET_NOT_CONFIGURED";
    throw error;
  }

  const circleData = await circleClient.listTransactions({
    pageSize: limit,
    order: "DESC",
  });
  const transactions = unwrapCircleTransactions(circleData).filter(
    (transaction) =>
      isInboundCircleTransfer(transaction) &&
      normalizeComparableString(getCircleTransactionWalletId(transaction)) ===
        normalizeComparableString(merchant.circleMerchantWalletId)
  );
  const result = {
    walletId: merchant.circleMerchantWalletId,
    scanned: transactions.length,
    matched: 0,
    createdPayments: 0,
    updatedPayments: 0,
    confirmedPayments: 0,
    skipped: 0,
    payments: [],
    skippedTransactions: [],
  };

  for (const transaction of transactions) {
    const circlePaymentId = normalizeOptionalString(
      getCircleTransactionId(transaction)
    );
    const txHash = normalizeOptionalString(transaction && transaction.txHash);
    const amountReceived = getCircleTransactionAmount(transaction);
    const destinationAddress = normalizeOptionalString(
      transaction && transaction.destinationAddress
    );
    const sourceAddress = normalizeOptionalString(
      transaction && transaction.sourceAddress
    );
    const paymentChain = normalizeOptionalString(
      transaction && transaction.blockchain
    );
    const stablecoin = getCircleTransactionStablecoin(transaction);
    const skipBase = {
      circlePaymentId: circlePaymentId || null,
      txHash: txHash || null,
    };

    if (!circlePaymentId && !txHash) {
      result.skipped += 1;
      result.skippedTransactions.push({
        ...skipBase,
        reason: "missing_transaction_identifier",
      });
      continue;
    }

    if (!destinationAddress || !amountReceived) {
      result.skipped += 1;
      result.skippedTransactions.push({
        ...skipBase,
        reason: "missing_matching_fields",
      });
      continue;
    }

    const duplicateFilters = [];
    const providerStatus =
      transaction && transaction.state ? String(transaction.state) : null;
    const shouldConfirm = isCircleTransactionComplete(transaction);

    if (txHash) {
      duplicateFilters.push({ txHash });
    }

    if (circlePaymentId) {
      duplicateFilters.push({ circlePaymentId });
    }

    const existingPayment = await prisma.payment.findFirst({
      where: { OR: duplicateFilters },
      include: { invoice: true },
    });

    if (existingPayment) {
      const existingProviderStatus = normalizeRequiredString(
        existingPayment.providerStatus
      ).toUpperCase();
      const canConfirmExistingPayment =
        existingPayment.status === "DETECTED" &&
        (shouldConfirm || existingProviderStatus === "COMPLETE");

      if (existingPayment.status === "CONFIRMED") {
        result.skipped += 1;
        result.skippedTransactions.push({
          ...skipBase,
          reason: "payment_already_confirmed",
        });
        continue;
      }

      if (canConfirmExistingPayment) {
        const now = new Date();
        const updatedPayment = await prisma.$transaction(async (tx) => {
          if (existingPayment.invoice.status !== "PAID") {
            await tx.invoice.update({
              where: { id: existingPayment.invoiceId },
              data: {
                status: "PAID",
                paidAt: now,
              },
            });

            await tx.transactionLog.create({
              data: {
                invoiceId: existingPayment.invoiceId,
                action: "CIRCLE_PAYMENT_CONFIRMED",
                oldStatus: existingPayment.invoice.status,
                newStatus: "PAID",
                message: "Circle payment confirmed and invoice settled",
                metadata: {
                  circlePaymentId: circlePaymentId || null,
                  txHash: txHash || null,
                  chain: paymentChain,
                  amount: amountReceived,
                  stablecoin,
                  providerStatus,
                },
              },
            });
          }

          return tx.payment.update({
            where: { id: existingPayment.id },
            data: {
              status: "CONFIRMED",
              confirmedAt: existingPayment.confirmedAt || now,
              amountReceived,
              providerStatus: providerStatus || existingPayment.providerStatus,
            },
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  customerName: true,
                  status: true,
                },
              },
            },
          });
        });

        result.matched += 1;
        result.updatedPayments += 1;
        result.confirmedPayments += 1;
        result.skippedTransactions.push({
          ...skipBase,
          reason: "existing_payment_confirmed",
        });
        result.payments.push(updatedPayment);
        continue;
      }

      result.skipped += 1;
      result.skippedTransactions.push({
        ...skipBase,
        reason: "payment_already_exists",
      });
      continue;
    }

    const candidateInvoices = await prisma.invoice.findMany({
      where: {
        merchantId: merchant.id,
        stablecoin,
      },
    });
    const matchingInvoices = candidateInvoices.filter(
      (invoice) =>
        normalizeComparableString(invoice.depositAddress) ===
          normalizeComparableString(destinationAddress) &&
        Number(invoice.amount) === Number(amountReceived) &&
        (!paymentChain ||
          normalizeComparableString(invoice.paymentChain) ===
            normalizeComparableString(paymentChain))
    );

    if (matchingInvoices.length === 0) {
      result.skipped += 1;
      result.skippedTransactions.push({
        ...skipBase,
        reason: "no_matching_invoice",
      });
      continue;
    }

    if (matchingInvoices.length > 1) {
      const paidMatches = matchingInvoices.filter(
        (invoice) => invoice.status === "PAID"
      );

      if (paidMatches.length === matchingInvoices.length) {
        result.skipped += 1;
        result.skippedTransactions.push({
          ...skipBase,
          reason: "invoice_already_paid",
        });
        continue;
      }

      result.skipped += 1;
      result.skippedTransactions.push({
        ...skipBase,
        reason: "ambiguous_invoice_match",
      });
      continue;
    }

    const invoice = matchingInvoices[0];
    const newPaymentStatus =
      shouldConfirm && isAmountSettled(amountReceived, invoice.amount)
        ? "CONFIRMED"
        : "DETECTED";
    const newInvoiceStatus =
      newPaymentStatus === "CONFIRMED" ? "PAID" : "PENDING";
    const logAction =
      newPaymentStatus === "CONFIRMED"
        ? "CIRCLE_PAYMENT_CONFIRMED"
        : "CIRCLE_PAYMENT_DETECTED";
    const logMessage =
      newPaymentStatus === "CONFIRMED"
        ? "Circle payment confirmed and invoice settled"
        : "Circle inbound payment detected";

    if (invoice.status === "PAID") {
      result.skipped += 1;
      result.skippedTransactions.push({
        ...skipBase,
        reason: "invoice_already_paid",
      });
      continue;
    }

    let payment;

    try {
      payment = await prisma.$transaction(async (tx) => {
        const now = new Date();

        if (invoice.status !== newInvoiceStatus) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              status: newInvoiceStatus,
              ...(newInvoiceStatus === "PAID" ? { paidAt: now } : {}),
            },
          });
        }

        const createdPayment = await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amountExpected: invoice.amount,
            amountReceived,
            stablecoin,
            walletAddress: destinationAddress,
            ...(txHash ? { txHash } : {}),
            status: newPaymentStatus,
            ...(newPaymentStatus === "CONFIRMED" ? { confirmedAt: now } : {}),
            ...(circlePaymentId ? { circlePaymentId } : {}),
            ...(sourceAddress ? { fromAddress: sourceAddress } : {}),
            paymentChain,
            provider: "CIRCLE",
            ...(providerStatus ? { providerStatus } : {}),
          },
          include: {
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                customerName: true,
                status: true,
              },
            },
          },
        });

        await tx.transactionLog.create({
          data: {
            invoiceId: invoice.id,
            action: logAction,
            oldStatus: invoice.status,
            newStatus: newInvoiceStatus,
            message: logMessage,
            metadata: {
              circlePaymentId: circlePaymentId || null,
              txHash: txHash || null,
              chain: paymentChain,
              amount: amountReceived,
              stablecoin,
              providerStatus,
            },
          },
        });

        return createdPayment;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        result.skipped += 1;
        result.skippedTransactions.push({
          ...skipBase,
          reason: "duplicate_payment_race",
        });
        continue;
      }

      throw error;
    }

    result.matched += 1;
    result.createdPayments += 1;
    if (newPaymentStatus === "CONFIRMED") {
      result.confirmedPayments += 1;
    }
    result.payments.push(payment);
  }

  return result;
}

module.exports = {
  reconcileMerchantCirclePayments,
};
