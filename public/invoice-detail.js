const invoiceId = new URLSearchParams(window.location.search).get("id");

const els = {
  apiKeyForm: document.getElementById("api-key-form"),
  apiKeyInput: document.getElementById("api-key-input"),
  apiKeySaveButton: document.getElementById("api-key-save-button"),
  apiKeyConnected: document.getElementById("api-key-connected"),
  apiKeyChangeButton: document.getElementById("api-key-change-button"),
  loadingState: document.getElementById("loading-state"),
  emptyState: document.getElementById("empty-state"),
  message: document.getElementById("message"),
  content: document.getElementById("content"),
  merchantName: document.getElementById("merchant-name"),
  profileName: document.getElementById("profile-name"),
  profileEmail: document.getElementById("profile-email"),
  merchantAvatar: document.getElementById("merchant-avatar"),
  invoiceNumber: document.getElementById("invoice-number"),
  invoiceStatus: document.getElementById("invoice-status"),
  createdAt: document.getElementById("created-at"),
  amountDue: document.getElementById("amount-due"),
  amountFiat: document.getElementById("amount-fiat"),
  paymentBadge: document.getElementById("payment-badge"),
  paymentStatusNote: document.getElementById("payment-status-note"),
  dueDate: document.getElementById("due-date"),
  dueNote: document.getElementById("due-note"),
  paidDate: document.getElementById("paid-date"),
  publicLinkText: document.getElementById("public-link-text"),
  paymentLinkValue: document.getElementById("payment-link-value"),
  heroPaymentLink: document.getElementById("hero-payment-link"),
  openPaymentLink: document.getElementById("open-payment-link"),
  copyLink: document.getElementById("copy-link"),
  copyLinkInline: document.getElementById("copy-link-inline"),
  copyPaymentLink: document.getElementById("copy-payment-link"),
  customerName: document.getElementById("customer-name"),
  customerEmail: document.getElementById("customer-email"),
  customerAvatar: document.getElementById("customer-avatar"),
  invoiceDescription: document.getElementById("invoice-description"),
  itemUnitPrice: document.getElementById("item-unit-price"),
  itemAmount: document.getElementById("item-amount"),
  invoiceTotal: document.getElementById("invoice-total"),
  stablecoin: document.getElementById("stablecoin"),
  network: document.getElementById("network"),
  circleWalletState: document.getElementById("circle-wallet-state"),
  depositAddress: document.getElementById("deposit-address"),
  refreshPayment: document.getElementById("refresh-payment"),
  copyAddress: document.getElementById("copy-address"),
  createDeposit: document.getElementById("create-deposit"),
  refreshDeposit: document.getElementById("refresh-deposit"),
  currentWallet: document.getElementById("current-wallet"),
  walletSelect: document.getElementById("wallet-select"),
  walletInput: document.getElementById("wallet-input"),
  assignWallet: document.getElementById("assign-wallet"),
  paymentsList: document.getElementById("payments-list"),
  paymentsEmpty: document.getElementById("payments-empty"),
  timelineList: document.getElementById("timeline-list"),
  timelineEmpty: document.getElementById("timeline-empty"),
  statusActions: document.getElementById("status-actions"),
};

let invoice = null;
let payments = [];
let timeline = [];
let wallets = [];

function key() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function authHeaders(json = true) {
  return json ? { "Content-Type": "application/json", "x-api-key": key() } : { "x-api-key": key() };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatAmount(value, coin = "USDC") {
  const number = Number(value) || 0;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number)} ${coin}`;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
}

function formatDateOnly(value) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

function short(value, left = 8, right = 6) {
  const text = String(value || "");
  if (!text) return "Not available";
  return text.length > left + right + 3 ? `${text.slice(0, left)}...${text.slice(-right)}` : text;
}

function show(text, error = false) {
  els.message.className = `rounded-xl border px-4 py-2 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`;
  els.message.textContent = text;
}

function clearMessage() {
  els.message.className = "hidden rounded-xl border px-4 py-2 text-sm font-bold";
  els.message.textContent = "";
}

function showFatal(text) {
  els.loadingState.classList.add("hidden");
  els.content.classList.add("hidden");
  els.emptyState.className = "rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700";
  els.emptyState.textContent = text;
}

function statusKind(status) {
  if (status === "PAID" || status === "CONFIRMED") return "green";
  if (status === "PENDING" || status === "UNPAID" || status === "DETECTED") return "yellow";
  if (status === "FAILED") return "red";
  if (status === "DRAFT") return "blue";
  return "slate";
}

function pill(text, kind = "slate") {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    yellow: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return `<span class="inline-flex items-center rounded-lg border px-3 py-1 text-xs font-black ${map[kind] || map.slate}">${escapeHtml(text)}</span>`;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || "Request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function requestOptional(url, options = {}) {
  try {
    return await request(url, options);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

function renderApiKeyState() {
  const hasKey = Boolean(key());
  els.apiKeyInput.value = hasKey ? "" : "";
  els.apiKeyInput.classList.toggle("hidden", hasKey);
  els.apiKeySaveButton.classList.toggle("hidden", hasKey);
  els.apiKeyConnected.classList.toggle("hidden", !hasKey);
  els.apiKeyConnected.classList.toggle("flex", hasKey);
}

async function loadAll() {
  clearMessage();

  if (!invoiceId) {
    showFatal("Invoice id is required.");
    return;
  }

  if (!key()) {
    els.loadingState.classList.add("hidden");
    els.content.classList.add("hidden");
    show("Enter your merchant API key to load invoice details.", true);
    return;
  }

  els.emptyState.classList.add("hidden");
  els.loadingState.classList.remove("hidden");

  try {
    const [invoicePayload, paymentsPayload, timelinePayload, walletsPayload, depositPayload] = await Promise.all([
      request(`/api/invoices/${invoiceId}`, { headers: authHeaders(false) }),
      request(`/api/invoices/${invoiceId}/payments`, { headers: authHeaders(false) }),
      request(`/api/invoices/${invoiceId}/timeline`, { headers: authHeaders(false) }),
      request("/api/wallets", { headers: authHeaders(false) }).catch(() => ({ data: [] })),
      requestOptional(`/api/invoices/${invoiceId}/circle-deposit-address`, { headers: authHeaders(false) }).catch(() => null),
    ]);

    invoice = { ...invoicePayload, ...(depositPayload || {}) };
    payments = Array.isArray(paymentsPayload) ? paymentsPayload : paymentsPayload.data || [];
    timeline = Array.isArray(timelinePayload.timeline) ? timelinePayload.timeline : [];
    wallets = Array.isArray(walletsPayload.data) ? walletsPayload.data : [];
    render();
  } catch (error) {
    if (error.status === 404) {
      showFatal("Invoice not found.");
    } else {
      showFatal(error.message || "Unable to load invoice.");
    }
  }
}

function paymentExperienceStatus() {
  if (!invoice) return "Awaiting Payment";
  if (invoice.status === "PAID") return "Paid";
  if (payments.some((payment) => payment.status === "CONFIRMED")) return "Payment Confirmed";
  if (payments.some((payment) => payment.status === "DETECTED") || invoice.status === "PENDING") return "Payment Detected";
  return "Awaiting Payment";
}

function paymentStatusNote(status) {
  const notes = {
    Paid: "Invoice settled",
    "Payment Confirmed": "Payment confirmed",
    "Payment Detected": "Payment detected",
    "Awaiting Payment": "Payment pending",
  };
  return notes[status] || "Payment pending";
}

function dueNote(value) {
  if (!value) return "No due date set";
  const due = new Date(value);
  const today = new Date();
  const diff = Math.ceil((due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86400000);
  if (diff > 1) return `${diff} days remaining`;
  if (diff === 1) return "Due tomorrow";
  if (diff === 0) return "Due today";
  return `${Math.abs(diff)} days overdue`;
}

function paymentLink() {
  const id = invoice?.id || invoiceId;
  return `${window.location.origin}/pay-invoice?id=${encodeURIComponent(id)}`;
}

function merchantDisplayName() {
  const merchant = invoice?.merchant || {};
  return merchant.businessName || merchant.name || "Merchant account";
}

function merchantEmail() {
  return invoice?.merchant?.email || "merchant@example.com";
}

function renderMerchantShell() {
  const name = merchantDisplayName();
  const email = merchantEmail();
  els.merchantName.textContent = name;
  els.profileName.textContent = name;
  els.profileEmail.textContent = email;
  els.merchantAvatar.textContent = name.slice(0, 2).toUpperCase();
}

function render() {
  els.loadingState.classList.add("hidden");
  els.content.classList.remove("hidden");

  renderMerchantShell();

  const coin = invoice.stablecoin || invoice.currency || "USDC";
  const invoiceLabel = invoice.invoiceNumber || invoice.id;
  const status = paymentExperienceStatus();
  const link = paymentLink();

  els.invoiceNumber.textContent = `Invoice ${invoiceLabel}`;
  els.invoiceStatus.innerHTML = pill(invoice.status || "DRAFT", statusKind(invoice.status));
  els.createdAt.textContent = `Created on ${formatDate(invoice.createdAt)}`;
  els.amountDue.textContent = formatAmount(invoice.amount, coin);
  els.amountFiat.textContent = invoice.currency && invoice.currency !== coin ? `Billed in ${invoice.currency}` : `Approx. ${formatAmount(invoice.amount, "USD")}`;
  els.paymentBadge.innerHTML = pill(status, statusKind(status === "Paid" ? "PAID" : status === "Payment Confirmed" ? "CONFIRMED" : status === "Payment Detected" ? "DETECTED" : "UNPAID"));
  els.paymentStatusNote.textContent = paymentStatusNote(status);
  els.dueDate.textContent = formatDateOnly(invoice.dueDate);
  els.dueNote.textContent = dueNote(invoice.dueDate);
  els.paidDate.textContent = invoice.paidAt ? `Paid on ${formatDate(invoice.paidAt)}` : invoice.paymentExpiresAt ? `Expires on ${formatDateOnly(invoice.paymentExpiresAt)}` : "No payment expiry set";
  els.publicLinkText.textContent = link.replace(/^https?:\/\//, "");
  els.paymentLinkValue.textContent = link.replace(/^https?:\/\//, "");
  els.heroPaymentLink.href = link;
  els.openPaymentLink.href = link;

  els.customerName.textContent = invoice.customerName || "Customer";
  els.customerEmail.textContent = invoice.customerEmail || "No email saved";
  els.customerAvatar.textContent = (invoice.customerName || "C").slice(0, 2).toUpperCase();

  els.invoiceDescription.textContent = invoice.description || "Stablecoin invoice payment";
  els.itemUnitPrice.textContent = formatAmount(invoice.amount, coin);
  els.itemAmount.textContent = formatAmount(invoice.amount, coin);
  els.invoiceTotal.textContent = formatAmount(invoice.amount, coin);

  els.stablecoin.textContent = `${coin} on ${invoice.paymentChain || "Base"}`;
  els.network.textContent = invoice.paymentChain || "Not assigned";
  els.circleWalletState.textContent = invoice.depositAddress ? "Low fees and fast settlement" : "Create a deposit address";
  els.depositAddress.textContent = invoice.depositAddress || "No deposit address yet";
  els.currentWallet.textContent = invoice.walletAddress || "No wallet assigned";
  els.walletInput.value = invoice.walletAddress || "";

  renderWallets();
  renderPayments();
  renderTimeline();
  renderStatusActions();
}

function renderWallets() {
  els.walletSelect.innerHTML = `<option value="">Select saved wallet</option>${wallets
    .map((wallet) => `<option value="${escapeHtml(wallet.address)}">${escapeHtml(wallet.label || "Wallet")} - ${escapeHtml(wallet.network || "ETHEREUM")} - ${escapeHtml(wallet.stablecoin || "USDC")}</option>`)
    .join("")}`;

  const match = wallets.find((wallet) => wallet.address === invoice.walletAddress) || (!invoice.walletAddress ? wallets.find((wallet) => wallet.isDefault) : null);
  if (match) {
    els.walletSelect.value = match.address;
    if (!invoice.walletAddress) els.walletInput.value = match.address;
  }
}

function renderPayments() {
  els.paymentsEmpty.classList.toggle("hidden", payments.length > 0);
  els.paymentsList.innerHTML = payments
    .map((payment) => {
      const received = payment.amountReceived || payment.amountExpected;
      const sender = payment.fromAddress || payment.sender || "Not available";
      const canUpdate = payment.status === "DETECTED";
      return `
        <div class="rounded-xl border border-slate-200 p-4">
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-black">${escapeHtml(formatAmount(received, payment.stablecoin || "USDC"))}</p>
                ${pill(payment.status || "DETECTED", statusKind(payment.status))}
              </div>
              <dl class="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <div><dt class="text-xs font-black uppercase tracking-wide text-slate-500">Tx Hash</dt><dd class="mt-1 break-all font-semibold text-slate-700">${escapeHtml(payment.txHash || payment.circlePaymentId || "Not available")}</dd></div>
                <div><dt class="text-xs font-black uppercase tracking-wide text-slate-500">Sender</dt><dd class="mt-1 break-all font-semibold text-slate-700">${escapeHtml(sender)}</dd></div>
                <div><dt class="text-xs font-black uppercase tracking-wide text-slate-500">Detected</dt><dd class="mt-1 font-semibold text-slate-700">${escapeHtml(formatDate(payment.createdAt))}</dd></div>
                <div><dt class="text-xs font-black uppercase tracking-wide text-slate-500">Confirmed</dt><dd class="mt-1 font-semibold text-slate-700">${escapeHtml(formatDate(payment.confirmedAt))}</dd></div>
              </dl>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-2">
              ${canUpdate ? `<button data-payment="${escapeHtml(payment.id)}" data-status="CONFIRMED" class="payment-action h-8 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white">Confirm Payment</button><button data-payment="${escapeHtml(payment.id)}" data-status="FAILED" class="payment-action h-8 rounded-lg bg-red-600 px-3 text-xs font-black text-white">Mark Failed</button>` : ""}
            </div>
          </div>
        </div>`;
    })
    .join("");

  document.querySelectorAll(".payment-action").forEach((button) => {
    button.addEventListener("click", () => updatePayment(button.dataset.payment, button.dataset.status));
  });
}

function renderTimeline() {
  els.timelineEmpty.classList.toggle("hidden", timeline.length > 0);
  els.timelineList.innerHTML = timeline
    .map((item, index) => {
      const isLast = index === timeline.length - 1;
      const icon = item.action?.includes("PAYMENT") ? "credit-card.svg" : item.action?.includes("WALLET") ? "wallet.svg" : "check.svg";
      return `
        <div class="relative flex gap-3 pb-5 ${isLast ? "" : "after:absolute after:left-4 after:top-8 after:h-[calc(100%-2rem)] after:w-px after:bg-slate-200"}">
          <span class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 ring-4 ring-white">
            <img class="h-4 w-4" src="/assets/ui/${icon}" alt="" />
          </span>
          <div class="min-w-0 pt-0.5">
            <p class="font-black">${escapeHtml(item.action || "Timeline Event")}</p>
            <p class="mt-1 text-sm font-semibold text-slate-600">${escapeHtml(item.message || "")}</p>
            <p class="mt-1 text-xs font-bold text-slate-400">${escapeHtml(formatDate(item.createdAt))}</p>
          </div>
        </div>`;
    })
    .join("");
}

function renderStatusActions() {
  const next = { DRAFT: "UNPAID", UNPAID: "PENDING", PENDING: "PAID" }[invoice.status];
  els.statusActions.innerHTML = next
    ? `<button id="status-button" class="h-9 w-full rounded-lg bg-[#2443d8] text-sm font-black text-white shadow-lg shadow-blue-700/20">Mark as ${next}</button>`
    : `<p class="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Invoice is fully paid.</p>`;

  const button = document.getElementById("status-button");
  if (button) button.addEventListener("click", () => updateStatus(next));
}

async function updateStatus(status) {
  await request(`/api/invoices/${invoiceId}/status`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }) });
  show(`Invoice marked as ${status}.`);
  await loadAll();
}

async function updatePayment(paymentId, status) {
  await request(`/api/payments/${paymentId}/status`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }) });
  show(`Payment marked as ${status}.`);
  await loadAll();
}

async function copyText(text, successMessage) {
  if (!text) {
    show("Nothing to copy yet.", true);
    return;
  }
  await navigator.clipboard.writeText(text);
  show(successMessage);
}

els.apiKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = els.apiKeyInput.value.trim();
  if (!value) {
    show("API key is required.", true);
    return;
  }
  localStorage.setItem("afrisettleApiKey", value);
  renderApiKeyState();
  await loadAll();
});

els.apiKeyChangeButton.addEventListener("click", () => {
  localStorage.removeItem("afrisettleApiKey");
  renderApiKeyState();
  show("Enter a new API key to reconnect.", true);
});

els.assignWallet.addEventListener("click", async () => {
  const walletAddress = (els.walletSelect.value || els.walletInput.value).trim();
  if (!walletAddress) {
    show("Wallet address is required.", true);
    return;
  }
  await request(`/api/invoices/${invoiceId}/wallet`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ walletAddress }) });
  show("Wallet assigned to invoice.");
  await loadAll();
});

els.walletSelect.addEventListener("change", () => {
  if (els.walletSelect.value) els.walletInput.value = els.walletSelect.value;
});

els.copyAddress.addEventListener("click", () => copyText(invoice?.depositAddress, "Deposit address copied."));
els.copyLink.addEventListener("click", () => copyText(invoice ? paymentLink() : "", "Customer payment link copied."));
els.copyLinkInline.addEventListener("click", () => copyText(invoice ? paymentLink() : "", "Customer payment link copied."));
els.copyPaymentLink.addEventListener("click", () => copyText(invoice ? paymentLink() : "", "Customer payment link copied."));

els.createDeposit.addEventListener("click", async () => {
  await request(`/api/invoices/${invoiceId}/circle-deposit-address`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
  show("Circle deposit address created.");
  await loadAll();
});

els.refreshDeposit.addEventListener("click", async () => {
  await request(`/api/invoices/${invoiceId}/circle-deposit-address`, { headers: authHeaders(false) });
  show("Circle deposit address refreshed.");
  await loadAll();
});

els.refreshPayment.addEventListener("click", async () => {
  await request("/api/circle/reconcile", { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
  show("Payment reconciliation refreshed.");
  await loadAll();
});

renderApiKeyState();
loadAll();
