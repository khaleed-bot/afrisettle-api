const apiKeyInput = document.getElementById("api-key-input");
const apiKeyForm = document.getElementById("api-key-form");
const apiKeySaveButton = document.getElementById("api-key-save-button");
const apiKeyConnected = document.getElementById("api-key-connected");
const apiKeyChangeButton = document.getElementById("api-key-change-button");
const message = document.getElementById("message");
const loadingState = document.getElementById("loading-state");
const paymentTable = document.getElementById("payment-table");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search-input");
const topSearchInput = document.getElementById("top-search-input");
const statusFilter = document.getElementById("status-filter");
const customerFilter = document.getElementById("customer-filter");
const dateFilter = document.getElementById("date-filter");
const sortSelect = document.getElementById("sort-select");
const exportButton = document.getElementById("export-button");
const totalPayments = document.getElementById("total-payments");
const totalVolume = document.getElementById("total-volume");
const successfulPayments = document.getElementById("successful-payments");
const successRate = document.getElementById("success-rate");
const pendingSettlement = document.getElementById("pending-settlement");
const resultCount = document.getElementById("result-count");
const pagination = document.getElementById("pagination");
const overviewVolume = document.getElementById("overview-volume");
const overviewChart = document.getElementById("overview-chart");
const methodDonut = document.getElementById("method-donut");
const methodList = document.getElementById("method-list");
const activityList = document.getElementById("activity-list");
const merchantName = document.getElementById("merchant-name");
const profileName = document.getElementById("profile-name");
const profileEmail = document.getElementById("profile-email");
const merchantAvatar = document.getElementById("merchant-avatar");

const pageSize = 8;
let payments = [];
let currentPage = 1;

function key() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function paymentAmount(payment) {
  return Number(payment.amountReceived || payment.amountExpected || 0);
}

function amount(payment) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(paymentAmount(payment))} ${payment.stablecoin || "USDC"}`;
}

function money(value) {
  return `$${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}`;
}

function date(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function show(text, error = false) {
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

function statusPill(status) {
  const map = {
    CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    DETECTED: "border-amber-200 bg-amber-50 text-amber-700",
    FAILED: "border-red-200 bg-red-50 text-red-600",
  };
  const label = status === "CONFIRMED" ? "Paid" : status === "DETECTED" ? "Pending" : "Failed";
  return `<span class="rounded-lg border px-3 py-1 text-xs font-black ${map[status] || "border-slate-200 bg-slate-50 text-slate-600"}">${label}</span>`;
}

function settlementPill(payment) {
  if (payment.status === "CONFIRMED") {
    return '<span class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Settled</span>';
  }

  if (payment.status === "FAILED") {
    return '<span class="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-black text-red-600">Failed</span>';
  }

  return '<span class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">Pending</span>';
}

function methodLabel(payment) {
  if (payment.provider === "CIRCLE") {
    return `${payment.stablecoin || "USDC"} on ${payment.paymentChain || "Base"}`;
  }

  if (payment.txHash) {
    return "Wallet Transfer";
  }

  return "Manual";
}

function paymentId(payment) {
  return payment.circlePaymentId || payment.txHash || payment.id;
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

async function load() {
  if (!key()) {
    show("Enter a merchant API key to load payments.", true);
    loadingState.classList.add("hidden");
    renderApiKeyState();
    return;
  }

  loadingState.classList.remove("hidden");
  clearMessage();
  renderApiKeyState();

  await fetchMerchant();
  const res = await fetch("/api/payments?limit=1000&offset=0", {
    headers: { "x-api-key": key() },
  });
  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload.error || "Unable to load payments");
  }

  payments = payload.data || [];
  currentPage = 1;
  populateCustomerFilter();
  render();
}

function populateCustomerFilter() {
  const selected = customerFilter.value;
  const customers = [...new Set(payments.map((payment) => payment.invoice && payment.invoice.customerName).filter(Boolean))].sort();
  customerFilter.innerHTML = '<option value="">All Customers</option>';
  customers.forEach((customer) => {
    const option = document.createElement("option");
    option.value = customer;
    option.textContent = customer;
    customerFilter.appendChild(option);
  });
  customerFilter.value = customers.includes(selected) ? selected : "";
}

function matchesDateFilter(payment) {
  if (!dateFilter.value) return true;
  if (!payment.createdAt) return false;

  const days = Number(dateFilter.value);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(payment.createdAt).getTime() >= cutoff;
}

function filtered() {
  const term = searchInput.value.trim().toLowerCase();
  return payments
    .filter((payment) => !statusFilter.value || payment.status === statusFilter.value)
    .filter((payment) => !customerFilter.value || (payment.invoice && payment.invoice.customerName === customerFilter.value))
    .filter(matchesDateFilter)
    .filter((payment) => {
      if (!term) return true;
      return [
        payment.id,
        payment.circlePaymentId,
        payment.txHash,
        payment.invoice && payment.invoice.invoiceNumber,
        payment.invoice && payment.invoice.customerName,
        payment.amountExpected,
        payment.amountReceived,
      ].some((value) => String(value || "").toLowerCase().includes(term));
    })
    .sort((a, b) => {
      if (sortSelect.value === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortSelect.value === "high") return paymentAmount(b) - paymentAmount(a);
      if (sortSelect.value === "low") return paymentAmount(a) - paymentAmount(b);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
}

function renderSummary() {
  const total = payments.reduce((sum, payment) => sum + paymentAmount(payment), 0);
  const confirmed = payments.filter((payment) => payment.status === "CONFIRMED");
  const pending = payments.filter((payment) => payment.status === "DETECTED");
  const confirmedVolume = confirmed.reduce((sum, payment) => sum + paymentAmount(payment), 0);

  totalPayments.textContent = payments.length;
  totalVolume.textContent = `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(total)} USDC`;
  successfulPayments.textContent = confirmed.length;
  successRate.textContent = payments.length ? `${Math.round((confirmed.length / payments.length) * 1000) / 10}% success rate` : "0% success rate";
  pendingSettlement.textContent = pending.length;
  overviewVolume.textContent = money(confirmedVolume);
}

function renderPagination(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, rows.length);
  resultCount.textContent = rows.length
    ? `Showing ${start} to ${end} of ${rows.length} payments`
    : "Showing 0 payments";

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

function renderChart() {
  const recent = [...payments].slice(0, 7).reverse();
  const values = recent.length ? recent.map(paymentAmount) : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = 12 + index * (276 / Math.max(values.length - 1, 1));
    const y = 118 - (value / max) * 100;
    return `${x},${Math.max(16, y)}`;
  });

  overviewChart.innerHTML = `
    <svg class="h-full w-full" viewBox="0 0 300 130" preserveAspectRatio="none" aria-hidden="true">
      ${[20, 55, 90, 120].map((y) => `<line x1="8" x2="292" y1="${y}" y2="${y}" stroke="#e5eaf2" stroke-width="1" />`).join("")}
      <polyline points="${points.join(" ")} 288,126 12,126" fill="#1557ff" fill-opacity="0.08" stroke="none" />
      <polyline points="${points.join(" ")}" fill="none" stroke="#1557ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${points.map((point) => {
        const [x, y] = point.split(",");
        return `<circle cx="${x}" cy="${y}" r="4" fill="#1557ff" />`;
      }).join("")}
    </svg>`;
}

function renderMethods() {
  const groups = payments.reduce((acc, payment) => {
    const method = methodLabel(payment);
    acc[method] = (acc[method] || 0) + paymentAmount(payment);
    return acc;
  }, {});
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = entries.reduce((sum, entry) => sum + entry[1], 0) || 1;
  const colors = ["#1557ff", "#16a34a", "#f59e0b", "#8b5cf6"];
  let start = 0;
  const gradient = entries
    .map((entry, index) => {
      const percent = (entry[1] / total) * 100;
      const segment = `${colors[index]} ${start}% ${start + percent}%`;
      start += percent;
      return segment;
    })
    .join(", ");

  methodDonut.style.background = entries.length
    ? `radial-gradient(circle, white 0 48%, transparent 49%), conic-gradient(${gradient})`
    : "radial-gradient(circle, white 0 48%, transparent 49%), conic-gradient(#e2e8f0 0 100%)";
  methodList.innerHTML = entries.length
    ? entries
        .map((entry, index) => {
          const percent = Math.round((entry[1] / total) * 100);
          return `<div class="flex items-center justify-between gap-2">
            <span class="flex min-w-0 items-center gap-2 truncate"><span class="h-2.5 w-2.5 rounded-full" style="background:${colors[index]}"></span>${entry[0]}</span>
            <span class="flex-none text-slate-900">${percent}%</span>
          </div>`;
        })
        .join("")
    : '<p class="text-slate-500">No payment methods yet.</p>';
}

function renderActivity() {
  const rows = [...payments]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 3);

  activityList.innerHTML = rows.length
    ? rows
        .map((payment) => {
          const icon =
            payment.status === "CONFIRMED"
              ? "check.svg"
              : payment.status === "FAILED"
                ? "circle-alert.svg"
                : "clock.svg";
          const bg =
            payment.status === "CONFIRMED"
              ? "bg-emerald-100"
              : payment.status === "FAILED"
                ? "bg-red-100"
                : "bg-amber-100";
          return `<div class="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0">
            <div class="flex h-9 w-9 items-center justify-center rounded-full ${bg}"><img class="h-4 w-4" src="/assets/ui/${icon}" alt="" /></div>
            <div class="min-w-0 flex-1">
              <p class="font-black">${payment.status === "FAILED" ? "Payment failed" : payment.status === "DETECTED" ? "Payment pending" : "Payment received"}</p>
              <p class="truncate text-sm text-slate-600">${payment.invoice ? payment.invoice.invoiceNumber : "Payment"} • ${amount(payment)}</p>
            </div>
          </div>`;
        })
        .join("")
    : '<div class="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No recent activity.</div>';
}

function renderTable() {
  const rows = filtered();
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  renderPagination(rows);
  emptyState.classList.toggle("hidden", rows.length > 0);

  paymentTable.innerHTML = rows.length
    ? `<table class="w-full text-left text-sm">
        <thead class="bg-white text-xs font-black text-slate-600">
          <tr class="border-b border-slate-200">
            <th class="px-4 py-3">Payment ID</th>
            <th class="px-4 py-3">Invoice</th>
            <th class="px-4 py-3">Customer</th>
            <th class="px-4 py-3">Amount</th>
            <th class="px-4 py-3">Method</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Settlement</th>
            <th class="px-4 py-3">Created At</th>
            <th class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          ${pageRows
            .map(
              (payment) => `
              <tr class="transition-colors hover:bg-slate-50">
                <td class="max-w-[11rem] truncate px-4 py-3 font-black text-[#2443d8]">${paymentId(payment)}</td>
                <td class="px-4 py-3 font-black text-[#2443d8]">${payment.invoice ? payment.invoice.invoiceNumber : "-"}</td>
                <td class="px-4 py-3 font-semibold">${payment.invoice ? payment.invoice.customerName || "Customer" : "-"}</td>
                <td class="px-4 py-3 font-black">${amount(payment)}</td>
                <td class="px-4 py-3 font-semibold">${methodLabel(payment)}</td>
                <td class="px-4 py-3">${statusPill(payment.status)}</td>
                <td class="px-4 py-3">${settlementPill(payment)}</td>
                <td class="px-4 py-3 font-semibold">${date(payment.createdAt)}</td>
                <td class="px-4 py-3 text-right">
                  <a class="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100" href="${payment.invoice ? `/invoice-detail?id=${payment.invoice.id}` : "#"}" aria-label="View payment invoice">
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

function render() {
  loadingState.classList.add("hidden");
  renderSummary();
  renderChart();
  renderMethods();
  renderActivity();
  renderTable();
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv() {
  const rows = filtered();
  if (!rows.length) {
    show("There is no payment data to export.", true);
    return;
  }

  const header = ["id", "invoiceNumber", "customerName", "amount", "stablecoin", "method", "status", "createdAt", "txHash", "circlePaymentId"];
  const csv = [
    header.join(","),
    ...rows.map((payment) =>
      [
        payment.id,
        payment.invoice && payment.invoice.invoiceNumber,
        payment.invoice && payment.invoice.customerName,
        paymentAmount(payment),
        payment.stablecoin,
        methodLabel(payment),
        payment.status,
        payment.createdAt,
        payment.txHash,
        payment.circlePaymentId,
      ].map(csvEscape).join(",")
    ),
  ].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "afrisettle-payments.csv";
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
    show("API key is required.", true);
    return;
  }
  localStorage.setItem("afrisettleApiKey", value);
  renderApiKeyState();
  load().catch((error) => show(error.message, true));
});

apiKeyChangeButton.addEventListener("click", () => {
  localStorage.removeItem("afrisettleApiKey");
  payments = [];
  renderApiKeyState();
  render();
  show("Enter your merchant API key to load payments.", true);
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
load().catch((error) => {
  loadingState.classList.add("hidden");
  show(error.message, true);
});
