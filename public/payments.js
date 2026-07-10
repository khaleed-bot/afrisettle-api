const apiKeyInput = document.getElementById("api-key-input");
const message = document.getElementById("message");
const loadingState = document.getElementById("loading-state");
const paymentTable = document.getElementById("payment-table");
const emptyState = document.getElementById("empty-state");
const refreshButton = document.getElementById("refresh-button");
const confirmedVolume = document.getElementById("confirmed-volume");
const detectedCount = document.getElementById("detected-count");
const failedCount = document.getElementById("failed-count");
let payments = [];

function key() { return localStorage.getItem("afrisettleApiKey") || ""; }
function amount(payment) { return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(payment.amountReceived || payment.amountExpected || 0))} ${payment.stablecoin || "USDC"}`; }
function date(value) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-"; }
function show(text, error = false) { message.className = `rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`; message.textContent = text; }
function pill(status) { const map = { CONFIRMED: "bg-emerald-100 text-emerald-700", DETECTED: "bg-amber-100 text-amber-700", FAILED: "bg-red-100 text-red-700" }; return `<span class="rounded-full px-3 py-1 text-xs font-black ${map[status] || "bg-slate-100 text-slate-600"}">${status || "DETECTED"}</span>`; }

async function load() {
  if (!key()) { show("Enter a merchant API key to load payments.", true); loadingState.classList.add("hidden"); return; }
  loadingState.classList.remove("hidden");
  const res = await fetch("/api/payments?limit=1000&offset=0", { headers: { "x-api-key": key() } });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Unable to load payments");
  payments = payload.data || [];
  render();
}

function render() {
  loadingState.classList.add("hidden");
  confirmedVolume.textContent = `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(payments.filter((p) => p.status === "CONFIRMED").reduce((s, p) => s + Number(p.amountReceived || p.amountExpected || 0), 0))} USDC`;
  detectedCount.textContent = payments.filter((p) => p.status === "DETECTED").length;
  failedCount.textContent = payments.filter((p) => p.status === "FAILED").length;
  emptyState.classList.toggle("hidden", payments.length > 0);
  paymentTable.innerHTML = payments.length ? `<table class="w-full text-left text-sm"><thead class="bg-slate-50 text-xs font-black uppercase text-slate-500"><tr><th class="px-4 py-3">Amount</th><th class="px-4 py-3">Invoice</th><th class="px-4 py-3">Customer</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Tx Hash</th><th class="px-4 py-3">Created</th></tr></thead><tbody class="divide-y divide-slate-100">${payments.map((p) => `<tr><td class="px-4 py-4 font-black">${amount(p)}</td><td class="px-4 py-4">${p.invoice ? p.invoice.invoiceNumber : "-"}</td><td class="px-4 py-4">${p.invoice ? p.invoice.customerName || "Customer" : "-"}</td><td class="px-4 py-4">${pill(p.status)}</td><td class="max-w-xs truncate px-4 py-4">${p.txHash || "-"}</td><td class="px-4 py-4">${date(p.createdAt)}</td></tr>`).join("")}</tbody></table>` : "";
}

apiKeyInput.value = key();
apiKeyInput.addEventListener("change", () => { localStorage.setItem("afrisettleApiKey", apiKeyInput.value.trim()); load().catch((e) => show(e.message, true)); });
refreshButton.addEventListener("click", () => load().catch((e) => show(e.message, true)));
load().catch((e) => { loadingState.classList.add("hidden"); show(e.message, true); });
