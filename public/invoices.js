const apiKeyInput = document.getElementById("api-key-input");
const apiKeyForm = document.getElementById("api-key-form");
const apiKeySaveButton = document.getElementById("api-key-save-button");
const apiKeyConnected = document.getElementById("api-key-connected");
const apiKeyChangeButton = document.getElementById("api-key-change-button");
const message = document.getElementById("message");
const loadingState = document.getElementById("loading-state");
const invoiceTable = document.getElementById("invoice-table");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const topSearchInput = document.getElementById("top-search-input");
const statusFilter = document.getElementById("status-filter");
const customerFilter = document.getElementById("customer-filter");
const dateFilter = document.getElementById("date-filter");
const sortSelect = document.getElementById("sort-select");
const exportButton = document.getElementById("export-button");
const totalInvoices = document.getElementById("total-invoices");
const totalAmount = document.getElementById("total-amount");
const paidInvoices = document.getElementById("paid-invoices");
const paidRate = document.getElementById("paid-rate");
const outstandingInvoices = document.getElementById("outstanding-invoices");
const outstandingAmount = document.getElementById("outstanding-amount");
const resultCount = document.getElementById("result-count");
const pagination = document.getElementById("pagination");
const merchantName = document.getElementById("merchant-name");
const profileName = document.getElementById("profile-name");
const profileEmail = document.getElementById("profile-email");
const merchantAvatar = document.getElementById("merchant-avatar");

const pageSize = 10;
let invoices = [];
let currentPage = 1;

function key() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function money(value, unit = "USDC") {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)} ${unit}`;
}

function date(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function dayOnly(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function showMessage(text, error = false) {
  message.className = `rounded-xl border px-4 py-2 text-sm font-bold ${
    error
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700"
  }`;
  message.textContent = text;
}

function clearMessage() {
  message.className = "hidden rounded-xl border px-4 py-2 text-sm font-bold";
  message.textContent = "";
}

function renderApiKeyState() {
  const hasKey = Boolean(key());
  apiKeyInput.classList.toggle("hidden", hasKey);
  apiKeySaveButton.classList.toggle("hidden", hasKey);
  apiKeyConnected.classList.toggle("hidden", !hasKey);
  apiKeyConnected.classList.toggle("flex", hasKey);

  if (!hasKey) {
    apiKeyInput.value = "";
  }
}

function pill(status, dueDate) {
  const isOverdue =
    status !== "PAID" && dueDate && new Date(dueDate).getTime() < Date.now();
  if (isOverdue) {
    return '<span class="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-black text-red-600">Overdue</span>';
  }

  const map = {
    PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
    PENDING: "border-amber-200 bg-amber-50 text-amber-700",
    UNPAID: "border-amber-200 bg-amber-50 text-amber-700",
    DRAFT: "border-slate-200 bg-slate-50 text-slate-600",
  };
  const labels = {
    PAID: "Paid",
    PENDING: "Pending",
    UNPAID: "Pending",
    DRAFT: "Draft",
  };
  return `<span class="rounded-lg border px-3 py-1 text-xs font-black ${map[status] || map.DRAFT}">${labels[status] || "Draft"}</span>`;
}

async function fetchMerchant() {
  const res = await fetch("/api/merchant/me", {
    headers: { "x-api-key": key() },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return;

  const name = payload.businessName || payload.name || "AfriSettle Merchant";
  merchantName.textContent = name;
  profileName.textContent = name;
  profileEmail.textContent = payload.email || "merchant@example.com";
  merchantAvatar.textContent = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function loadInvoices() {
  if (!key()) {
    showMessage("Enter a merchant API key to load invoices.", true);
    loadingState.classList.add("hidden");
    renderApiKeyState();
    return;
  }

  loadingState.classList.remove("hidden");
  clearMessage();
  renderApiKeyState();

  await fetchMerchant();
  const res = await fetch("/api/invoices?limit=1000&offset=0", {
    headers: { "x-api-key": key() },
  });
  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload.error || "Unable to load invoices");
  }

  invoices = payload.data || [];
  currentPage = 1;
  populateCustomerFilter();
  render();
}

function populateCustomerFilter() {
  const selected = customerFilter.value;
  const customers = [...new Set(invoices.map((invoice) => invoice.customerName).filter(Boolean))].sort();
  customerFilter.innerHTML = '<option value="">All Customers</option>';
  customers.forEach((customer) => {
    const option = document.createElement("option");
    option.value = customer;
    option.textContent = customer;
    customerFilter.appendChild(option);
  });
  customerFilter.value = customers.includes(selected) ? selected : "";
}

function matchesDateFilter(invoice) {
  if (!dateFilter.value) return true;
  const createdAt = invoice.createdAt ? new Date(invoice.createdAt) : null;
  const dueAt = invoice.dueDate ? new Date(invoice.dueDate) : null;

  if (dateFilter.value === "overdue") {
    return invoice.status !== "PAID" && dueAt && dueAt.getTime() < Date.now();
  }

  if (!createdAt) return false;

  const days = Number(dateFilter.value);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return createdAt.getTime() >= cutoff;
}

function filtered() {
  const term = searchInput.value.trim().toLowerCase();
  return invoices
    .filter((invoice) => !statusFilter.value || invoice.status === statusFilter.value)
    .filter((invoice) => !customerFilter.value || invoice.customerName === customerFilter.value)
    .filter(matchesDateFilter)
    .filter((invoice) => {
      if (!term) return true;
      return [invoice.invoiceNumber, invoice.customerName, invoice.amount, invoice.currency, invoice.stablecoin]
        .some((value) => String(value || "").toLowerCase().includes(term));
    })
    .sort((a, b) => {
      if (sortSelect.value === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortSelect.value === "high") return Number(b.amount || 0) - Number(a.amount || 0);
      if (sortSelect.value === "low") return Number(a.amount || 0) - Number(b.amount || 0);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
}

function renderSummary() {
  const paid = invoices.filter((invoice) => invoice.status === "PAID");
  const outstanding = invoices.filter((invoice) => invoice.status !== "PAID");
  const total = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const outstandingTotal = outstanding.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);

  totalInvoices.textContent = invoices.length;
  totalAmount.textContent = money(total);
  paidInvoices.textContent = paid.length;
  paidRate.textContent = invoices.length ? `${Math.round((paid.length / invoices.length) * 1000) / 10}%` : "0%";
  outstandingInvoices.textContent = outstanding.length;
  outstandingAmount.textContent = money(outstandingTotal);
}

function renderPagination(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, rows.length);

  resultCount.textContent = rows.length
    ? `Showing ${start} to ${end} of ${rows.length} invoices`
    : "Showing 0 invoices";

  const pageButtons = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
    .reduce((items, page, index, pages) => {
      if (index > 0 && page - pages[index - 1] > 1) items.push("...");
      items.push(page);
      return items;
    }, []);

  pagination.innerHTML = `
    <p class="text-sm font-semibold text-slate-600">${resultCount.textContent}</p>
    <div class="flex items-center gap-2">
      <button class="page-control h-9 w-9 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700" data-page="1">«</button>
      <button class="page-control h-9 w-9 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700" data-page="${Math.max(1, currentPage - 1)}">‹</button>
      ${pageButtons
        .map((page) =>
          page === "..."
            ? '<span class="px-2 text-sm font-bold text-slate-400">...</span>'
            : `<button class="page-control h-9 w-9 rounded-lg border text-sm font-black ${
                page === currentPage
                  ? "border-[#2443d8] bg-blue-50 text-[#2443d8]"
                  : "border-slate-200 bg-white text-slate-700"
              }" data-page="${page}">${page}</button>`
        )
        .join("")}
      <button class="page-control h-9 w-9 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700" data-page="${Math.min(totalPages, currentPage + 1)}">›</button>
      <button class="page-control h-9 w-9 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700" data-page="${totalPages}">»</button>
    </div>`;

  pagination.querySelectorAll(".page-control").forEach((button) => {
    button.addEventListener("click", () => {
      currentPage = Number(button.dataset.page);
      render();
    });
  });
}

function render() {
  const rows = filtered();
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  renderSummary();
  renderPagination(rows);
  loadingState.classList.add("hidden");
  emptyState.classList.toggle("hidden", rows.length > 0);

  invoiceTable.innerHTML = rows.length
    ? `<table class="w-full text-left text-sm">
        <thead class="bg-white text-xs font-black text-slate-600">
          <tr class="border-b border-slate-200">
            <th class="px-4 py-3">Invoice ID</th>
            <th class="px-4 py-3">Customer</th>
            <th class="px-4 py-3">Amount</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Due Date</th>
            <th class="px-4 py-3">Created At</th>
            <th class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          ${pageRows
            .map(
              (invoice) => `
              <tr class="transition-colors hover:bg-slate-50">
                <td class="px-4 py-3 font-black text-[#2443d8]">${invoice.invoiceNumber || invoice.id}</td>
                <td class="px-4 py-3 font-semibold">${invoice.customerName || "Customer"}</td>
                <td class="px-4 py-3 font-black">${money(invoice.amount, invoice.stablecoin || invoice.currency || "USDC")}</td>
                <td class="px-4 py-3">${pill(invoice.status, invoice.dueDate)}</td>
                <td class="px-4 py-3 font-semibold">${dayOnly(invoice.dueDate)}</td>
                <td class="px-4 py-3 font-semibold">${date(invoice.createdAt)}</td>
                <td class="px-4 py-3 text-right">
                  <a class="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100" href="/invoice-detail?id=${invoice.id}" aria-label="View invoice ${invoice.invoiceNumber || invoice.id}">
                    <img class="h-4 w-4" src="/assets/ui/chevron-right.svg" alt="" />
                  </a>
                </td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>`
    : "";
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv() {
  const rows = filtered();
  if (!rows.length) {
    showMessage("There is no invoice data to export.", true);
    return;
  }

  const header = ["invoiceNumber", "customerName", "amount", "currency", "stablecoin", "status", "dueDate", "createdAt"];
  const csv = [header.join(","), ...rows.map((invoice) => header.map((field) => csvEscape(invoice[field])).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "afrisettle-invoices.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function syncSearch(value) {
  searchInput.value = value;
  topSearchInput.value = value;
  currentPage = 1;
  render();
}

apiKeyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = apiKeyInput.value.trim();
  if (!value) {
    showMessage("API key is required.", true);
    return;
  }
  localStorage.setItem("afrisettleApiKey", value);
  renderApiKeyState();
  loadInvoices().catch((error) => showMessage(error.message, true));
});

apiKeyChangeButton.addEventListener("click", () => {
  localStorage.removeItem("afrisettleApiKey");
  invoices = [];
  renderApiKeyState();
  render();
  showMessage("Enter your merchant API key to load invoices.", true);
  apiKeyInput.focus();
});

searchInput.addEventListener("input", () => syncSearch(searchInput.value));
topSearchInput.addEventListener("input", () => syncSearch(topSearchInput.value));
[statusFilter, customerFilter, dateFilter, sortSelect].forEach((element) => {
  element.addEventListener("input", () => {
    currentPage = 1;
    render();
  });
});
exportButton.addEventListener("click", exportCsv);

apiKeyInput.value = key();
renderApiKeyState();
loadInvoices().catch((error) => {
  loadingState.classList.add("hidden");
  showMessage(error.message, true);
});
