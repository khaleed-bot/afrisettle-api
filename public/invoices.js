const apiKeyInput = document.getElementById("api-key-input");
const message = document.getElementById("message");
const loadingState = document.getElementById("loading-state");
const invoiceTable = document.getElementById("invoice-table");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");
const sortSelect = document.getElementById("sort-select");
const exportButton = document.getElementById("export-button");
const totalInvoices = document.getElementById("total-invoices");
const totalAmount = document.getElementById("total-amount");
const paidInvoices = document.getElementById("paid-invoices");
const outstandingInvoices = document.getElementById("outstanding-invoices");
let invoices = [];

function key() { return localStorage.getItem("afrisettleApiKey") || ""; }
function money(value, unit = "USDC") { return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${unit}`; }
function date(value) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-"; }
function showMessage(text, error = false) { message.className = `rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`; message.textContent = text; }
function pill(status) { const map = { PAID: "bg-emerald-100 text-emerald-700", PENDING: "bg-amber-100 text-amber-700", UNPAID: "bg-amber-100 text-amber-700", DRAFT: "bg-slate-100 text-slate-600" }; return `<span class="rounded-full px-3 py-1 text-xs font-black ${map[status] || map.DRAFT}">${status || "DRAFT"}</span>`; }

async function loadInvoices() {
  if (!key()) { showMessage("Enter a merchant API key to load invoices.", true); loadingState.classList.add("hidden"); return; }
  const res = await fetch("/api/invoices?limit=1000&offset=0", { headers: { "x-api-key": key() } });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Unable to load invoices");
  invoices = payload.data || [];
  render();
}

function filtered() {
  const term = searchInput.value.trim().toLowerCase();
  return invoices
    .filter((invoice) => !statusFilter.value || invoice.status === statusFilter.value)
    .filter((invoice) => !term || [invoice.invoiceNumber, invoice.customerName, invoice.amount].some((v) => String(v || "").toLowerCase().includes(term)))
    .sort((a, b) => {
      if (sortSelect.value === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortSelect.value === "high") return Number(b.amount || 0) - Number(a.amount || 0);
      if (sortSelect.value === "low") return Number(a.amount || 0) - Number(b.amount || 0);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
}

function render() {
  const rows = filtered();
  totalInvoices.textContent = invoices.length;
  totalAmount.textContent = money(invoices.reduce((s, i) => s + Number(i.amount || 0), 0));
  paidInvoices.textContent = invoices.filter((i) => i.status === "PAID").length;
  outstandingInvoices.textContent = invoices.filter((i) => i.status !== "PAID").length;
  loadingState.classList.add("hidden");
  emptyState.classList.toggle("hidden", rows.length > 0);
  invoiceTable.innerHTML = rows.length ? `<table class="w-full text-left text-sm"><thead class="bg-slate-50 text-xs font-black uppercase text-slate-500"><tr><th class="px-4 py-3">Invoice ID</th><th class="px-4 py-3">Customer</th><th class="px-4 py-3">Amount</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Due Date</th><th class="px-4 py-3">Created At</th><th></th></tr></thead><tbody class="divide-y divide-slate-100">${rows.map((i) => `<tr><td class="px-4 py-4 font-black text-[#1557ff]">${i.invoiceNumber || i.id}</td><td class="px-4 py-4">${i.customerName || "Customer"}</td><td class="px-4 py-4 font-bold">${money(i.amount, i.stablecoin || i.currency || "USDC")}</td><td class="px-4 py-4">${pill(i.status)}</td><td class="px-4 py-4">${date(i.dueDate)}</td><td class="px-4 py-4">${date(i.createdAt)}</td><td class="px-4 py-4 text-right"><a class="font-black text-[#1557ff]" href="/invoice-detail?id=${i.id}">View</a></td></tr>`).join("")}</tbody></table>` : "";
}

function csvEscape(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function exportCsv() {
  const rows = filtered();
  if (!rows.length) { showMessage("There is no invoice data to export.", true); return; }
  const header = ["invoiceNumber", "customerName", "amount", "currency", "status", "dueDate", "createdAt"];
  const csv = [header.join(","), ...rows.map((i) => header.map((h) => csvEscape(i[h])).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "afrisettle-invoices.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

apiKeyInput.value = key();
apiKeyInput.addEventListener("change", () => { localStorage.setItem("afrisettleApiKey", apiKeyInput.value.trim()); loadInvoices().catch((e) => showMessage(e.message, true)); });
[searchInput, statusFilter, sortSelect].forEach((el) => el.addEventListener("input", render));
exportButton.addEventListener("click", exportCsv);
loadInvoices().catch((e) => { loadingState.classList.add("hidden"); showMessage(e.message, true); });
