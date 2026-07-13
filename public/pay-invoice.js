const invoiceId = new URLSearchParams(window.location.search).get("id");
const loadingState = document.getElementById("loading-state");
const message = document.getElementById("message");
const content = document.getElementById("content");
const emptyState = document.getElementById("empty-state");
const emptyMessage = document.getElementById("empty-message");
const invoiceFrom = document.getElementById("invoice-from");
const paymentStatus = document.getElementById("payment-status");
const headerStatus = document.getElementById("header-status");
const headerInvoiceNumber = document.getElementById("header-invoice-number");
const headerMerchantName = document.getElementById("header-merchant-name");
const invoiceNumber = document.getElementById("invoice-number");
const dueDate = document.getElementById("due-date");
const amountDue = document.getElementById("amount-due");
const paymentAmount = document.getElementById("payment-amount");
const currency = document.getElementById("currency");
const stablecoin = document.getElementById("stablecoin");
const network = document.getElementById("network");
const qrCode = document.getElementById("qr-code");
const depositAddress = document.getElementById("deposit-address");
const tagBlock = document.getElementById("tag-block");
const depositAddressTag = document.getElementById("deposit-address-tag");
const copyAddress = document.getElementById("copy-address");
const explorerLink = document.getElementById("explorer-link");
const paidDetails = document.getElementById("paid-details");
const txHash = document.getElementById("tx-hash");
const confirmedAt = document.getElementById("confirmed-at");
const summaryNumber = document.getElementById("summary-number");
const summaryStatus = document.getElementById("summary-status");
const summaryAmount = document.getElementById("summary-amount");
const merchantName = document.getElementById("merchant-name");
const merchantAvatar = document.getElementById("merchant-avatar");
const customerMerchant = document.getElementById("customer-merchant");
const statusTimeline = document.getElementById("status-timeline");

let invoice = null;

function formatAmount(value, coin = "USDC") {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(value) || 0)} ${coin}`;
}

function formatDate(value, includeTime = false) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(parsed);
}

function merchantInitials(name) {
  return (name || "AfriSettle Merchant")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function normalizePaymentStatus(status) {
  if (status === "Paid") {
    return "Paid";
  }

  if (status === "Payment Detected") {
    return "Payment Detected";
  }

  return "Awaiting Payment";
}

function showMessage(text, error = false) {
  message.className = error
    ? "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
    : "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700";
  message.textContent = text;
  message.classList.remove("hidden");
}

function statusBadge(status) {
  const normalized = normalizePaymentStatus(status);
  const classes =
    normalized === "Paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : normalized === "Payment Detected"
        ? "bg-blue-50 text-[#2443d8] border-blue-200"
        : "bg-amber-50 text-amber-700 border-amber-200";

  return `<span class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${classes}">${normalized}</span>`;
}

function setHeaderBadge(status) {
  const normalized = normalizePaymentStatus(status);
  headerStatus.textContent = normalized;
  headerStatus.className =
    normalized === "Paid"
      ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"
      : normalized === "Payment Detected"
        ? "rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#2443d8]"
        : "rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700";
}

function explorerUrl() {
  const chain = String(invoice?.chain || "").toUpperCase();
  const value = invoice?.txHash || invoice?.depositAddress;
  const path = invoice?.txHash ? "tx" : "address";

  if (!value) {
    return "#";
  }

  if (chain.includes("BASE-SEPOLIA")) {
    return `https://sepolia.basescan.org/${path}/${encodeURIComponent(value)}`;
  }

  if (chain.includes("BASE")) {
    return `https://basescan.org/${path}/${encodeURIComponent(value)}`;
  }

  return `https://etherscan.io/${path}/${encodeURIComponent(value)}`;
}

function renderQr(address) {
  if (!address) {
    qrCode.innerHTML =
      "<span class='col-span-9 self-center text-center text-xs font-bold text-slate-500'>No address</span>";
    return;
  }

  const seed = address
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  qrCode.innerHTML = Array.from({ length: 81 }, (_, index) => {
    const row = Math.floor(index / 9);
    const col = index % 9;
    const finder =
      (row < 3 && col < 3) ||
      (row < 3 && col > 5) ||
      (row > 5 && col < 3);
    const active = finder || (seed + index * 11) % 4 === 0;
    return `<span class="${active ? "bg-[#06172d]" : "bg-slate-100"} rounded-[2px]"></span>`;
  }).join("");
}

function renderTimeline(status) {
  const normalized = normalizePaymentStatus(status);
  const steps = [
    {
      label: "Waiting for Payment",
      active: true,
      done: normalized !== "Awaiting Payment",
      icon: "clock.svg",
    },
    {
      label: "Payment Detected",
      active: normalized === "Payment Detected" || normalized === "Paid",
      done: normalized === "Paid",
      icon: "activity.svg",
    },
    {
      label: "Confirmations",
      active: normalized === "Paid",
      done: normalized === "Paid",
      icon: "shield-check.svg",
    },
    {
      label: "Payment Complete",
      active: normalized === "Paid",
      done: normalized === "Paid",
      icon: "check.svg",
    },
  ];

  statusTimeline.innerHTML = steps
    .map((step) => {
      const color = step.done
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : step.active
          ? "border-blue-200 bg-blue-50 text-[#2443d8]"
          : "border-slate-200 bg-white text-slate-500";
      const iconColor = step.done
        ? "bg-emerald-100"
        : step.active
          ? "bg-blue-100"
          : "bg-slate-100";

      return `
        <div class="rounded-xl border p-4 ${color}">
          <span class="flex h-9 w-9 items-center justify-center rounded-full ${iconColor}">
            <img class="h-4 w-4" src="/assets/ui/${step.icon}" alt="" />
          </span>
          <p class="mt-3 text-sm font-black">${step.label}</p>
          <p class="mt-1 text-xs font-bold opacity-80">${step.done ? "Complete" : step.active ? "Current" : "Pending"}</p>
        </div>
      `;
    })
    .join("");
}

async function loadInvoice() {
  if (!invoiceId) {
    throw new Error("Invalid payment link. Please contact the merchant for a new invoice link.");
  }

  const response = await fetch(`/api/public/invoices/${invoiceId}/payment`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      response.status === 404
        ? "This invoice payment link is no longer available."
        : payload.error || "Unable to load invoice payment details."
    );
    error.status = response.status;
    throw error;
  }

  invoice = payload;
  render();
}

function render() {
  const coin = invoice.stablecoin || "USDC";
  const chain = invoice.chain || "Base";
  const merchant = invoice.merchant ? invoice.merchant.businessName : "Merchant";
  const status = normalizePaymentStatus(invoice.paymentStatus);
  const amount = formatAmount(invoice.amount, coin);

  loadingState.classList.add("hidden");
  content.classList.remove("hidden");
  emptyState.classList.add("hidden");

  invoiceFrom.textContent = `Invoice from ${merchant}`;
  headerInvoiceNumber.textContent = invoice.invoiceNumber || "Invoice";
  headerMerchantName.textContent = merchant;
  paymentStatus.innerHTML = statusBadge(status);
  setHeaderBadge(status);

  invoiceNumber.textContent = invoice.invoiceNumber || "-";
  dueDate.textContent = formatDate(invoice.dueDate);
  amountDue.textContent = amount;
  paymentAmount.textContent = amount;
  currency.textContent = coin;
  stablecoin.textContent = coin;
  network.textContent = chain || "Base";
  depositAddress.textContent =
    invoice.depositAddress || "Deposit address is not available yet.";

  tagBlock.classList.toggle("hidden", !invoice.depositAddressTag);
  depositAddressTag.textContent = invoice.depositAddressTag || "";
  explorerLink.href = explorerUrl();
  explorerLink.classList.toggle("pointer-events-none", !invoice.depositAddress && !invoice.txHash);
  explorerLink.classList.toggle("opacity-50", !invoice.depositAddress && !invoice.txHash);

  customerMerchant.textContent = merchant;
  merchantName.textContent = merchant;
  merchantAvatar.textContent = merchantInitials(merchant);
  summaryNumber.textContent = invoice.invoiceNumber || "-";
  summaryStatus.textContent = status;
  summaryAmount.textContent = amount;

  paidDetails.classList.toggle("hidden", !invoice.txHash && status !== "Paid");
  txHash.textContent = invoice.txHash ? `Tx Hash: ${invoice.txHash}` : "Transaction hash will appear after confirmation.";
  confirmedAt.textContent =
    invoice.confirmedAt || invoice.paidAt
      ? `Confirmed: ${formatDate(invoice.confirmedAt || invoice.paidAt, true)}`
      : "";

  document.getElementById("invoice-description").textContent =
    "Stablecoin invoice payment.";

  renderQr(invoice.depositAddress);
  renderTimeline(status);
}

copyAddress.addEventListener("click", async () => {
  if (!invoice || !invoice.depositAddress) {
    showMessage("No deposit address is available yet. Please contact the merchant.", true);
    return;
  }

  await navigator.clipboard.writeText(invoice.depositAddress);
  showMessage("Merchant wallet address copied.");
});

loadInvoice().catch((error) => {
  loadingState.classList.add("hidden");
  content.classList.add("hidden");
  emptyState.classList.remove("hidden");
  emptyMessage.textContent =
    error.message ||
    "We could not find this invoice payment link. Please contact the merchant for a new link.";
});
