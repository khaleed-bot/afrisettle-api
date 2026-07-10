const invoiceId = new URLSearchParams(window.location.search).get("id");
const apiKeyInput = document.getElementById("api-key-input");
const loadingState = document.getElementById("loading-state");
const message = document.getElementById("message");
const content = document.getElementById("content");
const invoiceNumber = document.getElementById("invoice-number");
const invoiceStatus = document.getElementById("invoice-status");
const createdAt = document.getElementById("created-at");
const amountDue = document.getElementById("amount-due");
const paymentBadge = document.getElementById("payment-badge");
const dueDate = document.getElementById("due-date");
const paidDate = document.getElementById("paid-date");
const customerName = document.getElementById("customer-name");
const customerEmail = document.getElementById("customer-email");
const customerAvatar = document.getElementById("customer-avatar");
const stablecoin = document.getElementById("stablecoin");
const network = document.getElementById("network");
const circleWalletState = document.getElementById("circle-wallet-state");
const depositAddress = document.getElementById("deposit-address");
const publicLink = document.getElementById("public-link");
const refreshPayment = document.getElementById("refresh-payment");
const copyAddress = document.getElementById("copy-address");
const createDeposit = document.getElementById("create-deposit");
const refreshDeposit = document.getElementById("refresh-deposit");
const currentWallet = document.getElementById("current-wallet");
const walletSelect = document.getElementById("wallet-select");
const walletInput = document.getElementById("wallet-input");
const assignWallet = document.getElementById("assign-wallet");
const paymentsList = document.getElementById("payments-list");
const paymentsEmpty = document.getElementById("payments-empty");
const timelineList = document.getElementById("timeline-list");
const timelineEmpty = document.getElementById("timeline-empty");
const statusActions = document.getElementById("status-actions");

let invoice = null;
let payments = [];
let timeline = [];
let wallets = [];

function key() { return localStorage.getItem("afrisettleApiKey") || ""; }
function headers(json = true) { return json ? { "Content-Type": "application/json", "x-api-key": key() } : { "x-api-key": key() }; }
function amount(value, coin = "USDC") { return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${coin}`; }
function date(value) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-"; }
function show(text, error = false) { message.className = `rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`; message.textContent = text; }
function pill(text, kind = "slate") { const map = { green: "bg-emerald-100 text-emerald-700", yellow: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-700", blue: "bg-blue-100 text-blue-700", slate: "bg-slate-100 text-slate-600" }; return `<span class="rounded-full px-3 py-1 text-xs font-black ${map[kind]}">${text}</span>`; }
function statusKind(status) { if (status === "PAID" || status === "CONFIRMED") return "green"; if (status === "PENDING" || status === "UNPAID" || status === "DETECTED") return "yellow"; if (status === "FAILED") return "red"; return "slate"; }

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || "Request failed");
  return payload;
}

async function loadAll() {
  if (!invoiceId) throw new Error("Invoice id is required.");
  if (!key()) throw new Error("Enter your merchant API key to load invoice details.");
  loadingState.classList.remove("hidden");
  const [invoicePayload, paymentsPayload, timelinePayload, walletsPayload] = await Promise.all([
    request(`/api/invoices/${invoiceId}`, { headers: headers(false) }),
    request(`/api/invoices/${invoiceId}/payments`, { headers: headers(false) }),
    request(`/api/invoices/${invoiceId}/timeline`, { headers: headers(false) }),
    request("/api/wallets", { headers: headers(false) }).catch(() => ({ data: [] })),
  ]);
  invoice = invoicePayload;
  payments = Array.isArray(paymentsPayload) ? paymentsPayload : [];
  timeline = timelinePayload.timeline || [];
  wallets = walletsPayload.data || [];
  render();
}

function paymentExperienceStatus() {
  if (invoice.status === "PAID") return "Paid";
  if (payments.some((payment) => payment.status === "CONFIRMED")) return "Payment Confirmed";
  if (payments.some((payment) => payment.status === "DETECTED") || invoice.status === "PENDING") return "Payment Detected";
  return "Awaiting Payment";
}

function render() {
  content.classList.remove("hidden");
  loadingState.classList.add("hidden");
  const coin = invoice.stablecoin || invoice.currency || "USDC";
  invoiceNumber.textContent = `Invoice ${invoice.invoiceNumber || invoice.id}`;
  invoiceStatus.innerHTML = pill(invoice.status || "DRAFT", statusKind(invoice.status));
  createdAt.textContent = `Created on ${date(invoice.createdAt)}`;
  amountDue.textContent = amount(invoice.amount, coin);
  paymentBadge.innerHTML = pill(paymentExperienceStatus(), statusKind(invoice.status));
  dueDate.textContent = date(invoice.dueDate);
  paidDate.textContent = date(invoice.paidAt);
  customerName.textContent = invoice.customerName || "Customer";
  customerEmail.textContent = invoice.customerEmail || "No email saved";
  customerAvatar.textContent = (invoice.customerName || "C").slice(0, 2).toUpperCase();
  stablecoin.textContent = coin;
  network.textContent = invoice.paymentChain || "Not assigned";
  circleWalletState.textContent = invoice.depositAddress ? "Ready" : "Not created";
  depositAddress.textContent = invoice.depositAddress || "No deposit address yet";
  currentWallet.textContent = invoice.walletAddress || "No wallet assigned";
  walletInput.value = invoice.walletAddress || "";
  publicLink.href = `/pay-invoice?id=${invoice.id}`;
  publicLink.textContent = "Share Invoice";
  renderWallets();
  renderPayments();
  renderTimeline();
  renderStatusActions();
}

function renderWallets() {
  walletSelect.innerHTML = `<option value="">Select saved wallet</option>${wallets.map((wallet) => `<option value="${wallet.address}">${wallet.label} - ${wallet.network || "ETHEREUM"} - ${wallet.stablecoin || "USDC"}</option>`).join("")}`;
  const match = wallets.find((wallet) => wallet.address === invoice.walletAddress) || wallets.find((wallet) => wallet.isDefault);
  if (match) walletSelect.value = match.address;
}

function renderPayments() {
  paymentsEmpty.classList.toggle("hidden", payments.length > 0);
  paymentsList.innerHTML = payments.map((payment) => `
    <div class="rounded-2xl border border-slate-200 p-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p class="font-black">${amount(payment.amountReceived || payment.amountExpected, payment.stablecoin || "USDC")}</p>
          <p class="mt-1 break-all text-sm text-slate-500">Tx: ${payment.txHash || "Not available"}</p>
          <p class="mt-1 text-sm text-slate-500">Detected: ${date(payment.createdAt)} - Confirmed: ${date(payment.confirmedAt)}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${pill(payment.status || "DETECTED", statusKind(payment.status))}
          ${payment.status === "DETECTED" ? `<button data-payment="${payment.id}" data-status="CONFIRMED" class="payment-action rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Confirm Payment</button><button data-payment="${payment.id}" data-status="FAILED" class="payment-action rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white">Mark Failed</button>` : ""}
        </div>
      </div>
    </div>`).join("");
  document.querySelectorAll(".payment-action").forEach((button) => button.addEventListener("click", () => updatePayment(button.dataset.payment, button.dataset.status)));
}

function renderTimeline() {
  timelineEmpty.classList.toggle("hidden", timeline.length > 0);
  timelineList.innerHTML = timeline.map((item) => `<div class="border-l-2 border-blue-200 pl-4"><p class="font-black">${item.action}</p><p class="mt-1 text-sm text-slate-600">${item.message || ""}</p><p class="mt-1 text-xs font-bold text-slate-400">${date(item.createdAt)}</p></div>`).join("");
}

function renderStatusActions() {
  const next = { DRAFT: "UNPAID", UNPAID: "PENDING", PENDING: "PAID" }[invoice.status];
  statusActions.innerHTML = next
    ? `<button id="status-button" class="w-full rounded-xl bg-[#1557ff] px-4 py-3 text-sm font-black text-white">Mark as ${next}</button>`
    : `<p class="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">Invoice is fully paid.</p>`;
  const button = document.getElementById("status-button");
  if (button) button.addEventListener("click", () => updateStatus(next));
}

async function updateStatus(status) {
  await request(`/api/invoices/${invoiceId}/status`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status }) });
  show(`Invoice marked as ${status}.`);
  await loadAll();
}

async function updatePayment(paymentId, status) {
  await request(`/api/payments/${paymentId}/status`, { method: "PATCH", headers: headers(), body: JSON.stringify({ status }) });
  show(`Payment marked as ${status}.`);
  await loadAll();
}

assignWallet.addEventListener("click", async () => {
  const walletAddress = (walletSelect.value || walletInput.value).trim();
  if (!walletAddress) { show("Wallet address is required.", true); return; }
  await request(`/api/invoices/${invoiceId}/wallet`, { method: "PATCH", headers: headers(), body: JSON.stringify({ walletAddress }) });
  show("Wallet assigned to invoice.");
  await loadAll();
});

walletSelect.addEventListener("change", () => { if (walletSelect.value) walletInput.value = walletSelect.value; });
copyAddress.addEventListener("click", async () => { if (invoice && invoice.depositAddress) { await navigator.clipboard.writeText(invoice.depositAddress); show("Deposit address copied."); } });
createDeposit.addEventListener("click", async () => { await request(`/api/invoices/${invoiceId}/circle-deposit-address`, { method: "POST", headers: headers(), body: JSON.stringify({}) }); show("Circle deposit address created."); await loadAll(); });
refreshDeposit.addEventListener("click", async () => { await request(`/api/invoices/${invoiceId}/circle-deposit-address`, { headers: headers(false) }); show("Circle deposit address refreshed."); await loadAll(); });
refreshPayment.addEventListener("click", async () => { await request("/api/circle/reconcile", { method: "POST", headers: headers(), body: JSON.stringify({}) }); show("Payment reconciliation refreshed."); await loadAll(); });
apiKeyInput.value = key();
apiKeyInput.addEventListener("change", () => { localStorage.setItem("afrisettleApiKey", apiKeyInput.value.trim()); loadAll().catch((error) => show(error.message, true)); });
loadAll().catch((error) => { loadingState.classList.add("hidden"); show(error.message, true); });
