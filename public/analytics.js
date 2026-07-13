const els = {
  apiKeyForm: document.getElementById("api-key-form"),
  apiKeyInput: document.getElementById("api-key-input"),
  apiKeySaveButton: document.getElementById("api-key-save-button"),
  apiKeyConnected: document.getElementById("api-key-connected"),
  apiKeyChangeButton: document.getElementById("api-key-change-button"),
  message: document.getElementById("message"),
  loadingState: document.getElementById("loading-state"),
  content: document.getElementById("analytics-content"),
  merchantName: document.getElementById("merchant-name"),
  profileName: document.getElementById("profile-name"),
  profileEmail: document.getElementById("profile-email"),
  merchantAvatar: document.getElementById("merchant-avatar"),
  dateRange: document.getElementById("date-range"),
  exportButton: document.getElementById("export-button"),
  totalVolume: document.getElementById("total-volume"),
  volumeNote: document.getElementById("volume-note"),
  confirmedPayments: document.getElementById("confirmed-payments"),
  confirmedNote: document.getElementById("confirmed-note"),
  successRate: document.getElementById("success-rate"),
  successNote: document.getElementById("success-note"),
  avgInvoice: document.getElementById("avg-invoice"),
  avgNote: document.getElementById("avg-note"),
  trendChart: document.getElementById("trend-chart"),
  trendRevenue: document.getElementById("trend-revenue"),
  trendSettlements: document.getElementById("trend-settlements"),
  statusDonut: document.getElementById("status-donut"),
  donutTotal: document.getElementById("donut-total"),
  statusBreakdown: document.getElementById("status-breakdown"),
  monthlyChart: document.getElementById("monthly-chart"),
  monthlyCreated: document.getElementById("monthly-created"),
  monthlyPaid: document.getElementById("monthly-paid"),
  monthlyOutstanding: document.getElementById("monthly-outstanding"),
  totalSettled: document.getElementById("total-settled"),
  inSettlement: document.getElementById("in-settlement"),
  settlementRate: document.getElementById("settlement-rate"),
  avgConfirmation: document.getElementById("avg-confirmation"),
  usdcCount: document.getElementById("usdc-count"),
  baseCount: document.getElementById("base-count"),
  circleCount: document.getElementById("circle-count"),
  walletCount: document.getElementById("wallet-count"),
  bottomTitle: document.getElementById("bottom-title"),
  bottomSubtitle: document.getElementById("bottom-subtitle"),
  bottomCount: document.getElementById("bottom-count"),
  bottomCol1: document.getElementById("bottom-col-1"),
  bottomCol2: document.getElementById("bottom-col-2"),
  bottomCol3: document.getElementById("bottom-col-3"),
  bottomCol4: document.getElementById("bottom-col-4"),
  bottomTable: document.getElementById("bottom-table"),
};

let invoices = [];
let payments = [];
let wallets = [];
let merchant = null;
let currentSummary = null;
let trendMode = "revenue";

function key() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function amountValue(record) {
  return Number(record.amountReceived || record.amountExpected || record.amount || 0) || 0;
}

function money(value, coin = "USDC") {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${coin}`;
}

function percent(value) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(value) || 0)}%`;
}

function date(value) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

function show(text, error = false) {
  els.message.className = `rounded-xl border px-4 py-2 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`;
  els.message.textContent = text;
}

function clearMessage() {
  els.message.className = "hidden rounded-xl border px-4 py-2 text-sm font-bold";
  els.message.textContent = "";
}

function renderApiKeyState() {
  const hasKey = Boolean(key());
  els.apiKeyInput.classList.toggle("hidden", hasKey);
  els.apiKeySaveButton.classList.toggle("hidden", hasKey);
  els.apiKeyConnected.classList.toggle("hidden", !hasKey);
  els.apiKeyConnected.classList.toggle("flex", hasKey);
  if (!hasKey) els.apiKeyInput.value = "";
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { headers: { "x-api-key": key() }, signal: controller.signal });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || payload.message || `Request failed: ${url}`);
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out: ${url}`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchOptional(url, fallback) {
  try {
    return await fetchJson(url);
  } catch (error) {
    return fallback;
  }
}

function renderMerchant() {
  const name = merchant?.businessName || merchant?.name || "AfriSettle Merchant";
  const email = merchant?.email || "merchant@example.com";
  els.merchantName.textContent = name;
  els.profileName.textContent = name;
  els.profileEmail.textContent = email;
  els.merchantAvatar.textContent = name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function inRange(record, field = "createdAt") {
  const range = els.dateRange.value;
  if (range === "all") return true;
  const value = record[field] || record.createdAt;
  if (!value) return true;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(range));
  return new Date(value) >= cutoff;
}

function filterData() {
  return {
    invoices: invoices.filter((invoice) => inRange(invoice, "createdAt")),
    payments: payments.filter((payment) => inRange(payment, payment.confirmedAt ? "confirmedAt" : "createdAt")),
  };
}

function statusPill(status) {
  const map = {
    PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
    CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    PENDING: "border-amber-200 bg-amber-50 text-amber-700",
    DETECTED: "border-amber-200 bg-amber-50 text-amber-700",
    UNPAID: "border-amber-200 bg-amber-50 text-amber-700",
    FAILED: "border-red-200 bg-red-50 text-red-700",
    DRAFT: "border-blue-200 bg-blue-50 text-blue-700",
  };
  return `<span class="rounded-lg border px-3 py-1 text-xs font-black ${map[status] || "border-slate-200 bg-slate-50 text-slate-600"}">${escapeHtml(status || "UNKNOWN")}</span>`;
}

function buildTrendData(filteredInvoices, filteredPayments) {
  const days = 7;
  const buckets = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const current = new Date();
    current.setDate(current.getDate() - index);
    const keyValue = current.toISOString().slice(0, 10);
    buckets.push({ key: keyValue, label: current.toLocaleDateString("en-US", { month: "short", day: "numeric" }), invoiceVolume: 0, confirmedVolume: 0 });
  }

  filteredInvoices.forEach((invoice) => {
    const bucket = buckets.find((item) => item.key === String(invoice.createdAt || "").slice(0, 10));
    if (bucket) bucket.invoiceVolume += amountValue(invoice);
  });

  filteredPayments.filter((payment) => payment.status === "CONFIRMED").forEach((payment) => {
    const bucket = buckets.find((item) => item.key === String(payment.confirmedAt || payment.createdAt || "").slice(0, 10));
    if (bucket) bucket.confirmedVolume += amountValue(payment);
  });

  return buckets;
}

function pointsFor(values, max, width = 660, height = 170) {
  if (!values.length) return "";
  return values.map((value, index) => {
    const x = 20 + (index * (width / Math.max(values.length - 1, 1)));
    const y = 190 - ((Number(value) || 0) / max) * height;
    return `${x},${y}`;
  }).join(" ");
}

function renderTrendChart(buckets) {
  const max = Math.max(1, ...buckets.flatMap((bucket) => [bucket.invoiceVolume, bucket.confirmedVolume]));
  const invoicePoints = pointsFor(buckets.map((bucket) => bucket.invoiceVolume), max);
  const confirmedPoints = pointsFor(buckets.map((bucket) => bucket.confirmedVolume), max);
  const labels = buckets.map((bucket, index) => `<text x="${20 + index * (660 / Math.max(buckets.length - 1, 1))}" y="228" text-anchor="middle" font-size="11" fill="#64748b">${bucket.label}</text>`).join("");
  const revenueOpacity = trendMode === "revenue" ? "1" : ".3";
  const settlementOpacity = trendMode === "settlements" ? "1" : ".3";
  const revenueDots = buckets.map((bucket, index) => {
    const x = 20 + index * (660 / Math.max(buckets.length - 1, 1));
    const y = 190 - (bucket.invoiceVolume / max) * 170;
    return `<circle cx="${x}" cy="${y}" r="4" fill="#2443d8" opacity="${revenueOpacity}"><title>${bucket.label}: ${money(bucket.invoiceVolume)}</title></circle>`;
  }).join("");
  const settlementDots = buckets.map((bucket, index) => {
    const x = 20 + index * (660 / Math.max(buckets.length - 1, 1));
    const y = 190 - (bucket.confirmedVolume / max) * 170;
    return `<circle cx="${x}" cy="${y}" r="4" fill="#10b981" opacity="${settlementOpacity}"><title>${bucket.label}: ${money(bucket.confirmedVolume)} settled</title></circle>`;
  }).join("");
  els.trendChart.innerHTML = `
    <line x1="20" x2="680" y1="40" y2="40" stroke="#e5eaf2" />
    <line x1="20" x2="680" y1="88" y2="88" stroke="#e5eaf2" />
    <line x1="20" x2="680" y1="136" y2="136" stroke="#e5eaf2" />
    <line x1="20" x2="680" y1="190" y2="190" stroke="#cbd5e1" />
    <polyline points="${invoicePoints}" fill="none" stroke="#2443d8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="${revenueOpacity}" />
    <polyline points="${confirmedPoints}" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="${settlementOpacity}" />
    ${revenueDots}
    ${settlementDots}
    ${labels}
  `;

  els.trendRevenue.className = trendMode === "revenue" ? "h-8 rounded-md bg-white px-3 text-[#2443d8] shadow-sm" : "h-8 rounded-md px-3 text-slate-600";
  els.trendSettlements.className = trendMode === "settlements" ? "h-8 rounded-md bg-white px-3 text-[#2443d8] shadow-sm" : "h-8 rounded-md px-3 text-slate-600";
}

function renderMonthlyChart(created, paid, outstanding) {
  const values = [
    { label: "Created", value: created, color: "#2443d8" },
    { label: "Paid", value: paid, color: "#10b981" },
    { label: "Outstanding", value: outstanding, color: "#f59e0b" },
  ];
  const max = Math.max(1, ...values.map((item) => item.value));
  els.monthlyChart.innerHTML = values.map((item, index) => {
    const x = 38 + index * 104;
    const height = Math.max(6, (item.value / max) * 92);
    const y = 112 - height;
    return `
      <rect x="${x}" y="${y}" width="54" height="${height}" rx="10" fill="${item.color}"><title>${item.label}: ${item.value}</title></rect>
      <text x="${x + 27}" y="134" text-anchor="middle" font-size="11" font-weight="700" fill="#64748b">${item.label}</text>
      <text x="${x + 27}" y="${Math.max(16, y - 8)}" text-anchor="middle" font-size="13" font-weight="900" fill="#0f172a">${item.value}</text>
    `;
  }).join("");
}

function renderStatusBreakdown(filteredPayments) {
  const confirmed = filteredPayments.filter((payment) => payment.status === "CONFIRMED").length;
  const detected = filteredPayments.filter((payment) => payment.status === "DETECTED").length;
  const failed = filteredPayments.filter((payment) => payment.status === "FAILED").length;
  const total = confirmed + detected + failed;
  const confirmedPct = total ? (confirmed / total) * 100 : 0;
  const detectedPct = total ? (detected / total) * 100 : 0;
  const failedPct = total ? (failed / total) * 100 : 0;

  els.donutTotal.textContent = total;
  els.statusDonut.style.background = total
    ? `conic-gradient(#10b981 0 ${confirmedPct}%, #f59e0b ${confirmedPct}% ${confirmedPct + detectedPct}%, #ef4444 ${confirmedPct + detectedPct}% 100%)`
    : "#f1f5f9";

  const rows = [
    ["Confirmed", confirmed, confirmedPct, "bg-emerald-500"],
    ["Detected / Pending", detected, detectedPct, "bg-amber-500"],
    ["Failed", failed, failedPct, "bg-red-500"],
  ];
  els.statusBreakdown.innerHTML = rows.map(([label, count, pct, color]) => `
    <div>
      <div class="flex items-center justify-between text-sm"><span class="inline-flex items-center gap-2 font-bold text-slate-600"><span class="h-2.5 w-2.5 rounded-full ${color}"></span>${label}</span><strong>${count} (${percent(pct)})</strong></div>
      <div class="mt-2 h-2 rounded-full bg-slate-100"><div class="h-2 rounded-full ${color}" style="width:${pct}%"></div></div>
    </div>`).join("");

  return { confirmed, detected, failed, total };
}

function renderBottomTable(filteredInvoices) {
  const grouped = new Map();
  filteredInvoices.forEach((invoice) => {
    const name = invoice.customerName || "";
    if (!name) return;
    const item = grouped.get(name) || { label: name, volume: 0, invoices: 0, paid: 0 };
    item.volume += amountValue(invoice);
    item.invoices += 1;
    if (invoice.status === "PAID") item.paid += 1;
    grouped.set(name, item);
  });

  let rows = [...grouped.values()].sort((a, b) => b.volume - a.volume).slice(0, 6);
  if (rows.length) {
    els.bottomTitle.textContent = "Top Customers";
    els.bottomSubtitle.textContent = "Customer-level volume from available invoices.";
    els.bottomCol1.textContent = "Customer";
    els.bottomCol2.textContent = "Invoices";
    els.bottomCol3.textContent = "Volume";
    els.bottomCol4.textContent = "Success Rate";
    els.bottomTable.innerHTML = rows.map((row) => {
      const rate = row.invoices ? (row.paid / row.invoices) * 100 : 0;
      return `<tr class="border-b border-slate-100"><td class="py-3 pr-4 font-black">${escapeHtml(row.label)}</td><td class="px-4 py-3 text-right font-black">${row.invoices}</td><td class="px-4 py-3 text-right font-black">${money(row.volume)}</td><td class="py-3 pl-4 text-right font-black">${percent(rate)}</td></tr>`;
    }).join("");
  } else {
    els.bottomTitle.textContent = "Highest-Value Invoices";
    els.bottomSubtitle.textContent = "Customer totals need more invoice history.";
    els.bottomCol1.textContent = "Invoice";
    els.bottomCol2.textContent = "Volume";
    els.bottomCol3.textContent = "Status";
    els.bottomCol4.textContent = "Date";
    rows = [...filteredInvoices]
      .sort((a, b) => amountValue(b) - amountValue(a))
      .slice(0, 6)
      .map((invoice) => ({ label: invoice.customerName || invoice.invoiceNumber || invoice.id, volume: amountValue(invoice), status: invoice.status, date: invoice.createdAt }));
    els.bottomTable.innerHTML = rows.length
      ? rows.map((row) => `<tr class="border-b border-slate-100"><td class="py-3 pr-4 font-black">${escapeHtml(row.label)}</td><td class="px-4 py-3 text-right font-black">${money(row.volume)}</td><td class="px-4 py-3">${statusPill(row.status)}</td><td class="py-3 pl-4 text-right font-semibold text-slate-500">${escapeHtml(date(row.date))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="py-10 text-center text-sm font-semibold text-slate-500">No analytics data available yet.</td></tr>`;
  }

  els.bottomCount.textContent = `${rows.length} records`;
}

function averageConfirmationTime(filteredPayments) {
  const durations = filteredPayments
    .filter((payment) => payment.confirmedAt && payment.createdAt)
    .map((payment) => new Date(payment.confirmedAt) - new Date(payment.createdAt))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!durations.length) return "Not enough data yet";
  const avgMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const minutes = Math.round(avgMs / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${(minutes / 60).toFixed(1)} hrs`;
}

function render() {
  const filtered = filterData();
  const filteredInvoices = filtered.invoices;
  const filteredPayments = filtered.payments;
  const confirmed = filteredPayments.filter((payment) => payment.status === "CONFIRMED");
  const detected = filteredPayments.filter((payment) => payment.status === "DETECTED");
  const invoiceVolume = filteredInvoices.reduce((sum, invoice) => sum + amountValue(invoice), 0);
  const settledVolume = confirmed.reduce((sum, payment) => sum + amountValue(payment), 0);
  const pendingVolume = detected.reduce((sum, payment) => sum + amountValue(payment), 0);
  const successRate = filteredPayments.length ? (confirmed.length / filteredPayments.length) * 100 : 0;
  const avgInvoice = filteredInvoices.length ? invoiceVolume / filteredInvoices.length : 0;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyInvoices = filteredInvoices.filter((invoice) => String(invoice.createdAt || "").slice(0, 7) === currentMonth);

  currentSummary = { invoiceVolume, settledVolume, pendingVolume, confirmedCount: confirmed.length, paymentsCount: filteredPayments.length, successRate, avgInvoice };

  els.totalVolume.textContent = money(invoiceVolume);
  els.volumeNote.textContent = filteredInvoices.length ? `${filteredInvoices.length} invoices in range` : "No invoice data yet";
  els.confirmedPayments.textContent = confirmed.length;
  els.confirmedNote.textContent = `${money(settledVolume)} settled`;
  els.successRate.textContent = percent(successRate);
  els.successNote.textContent = filteredPayments.length ? `${confirmed.length} of ${filteredPayments.length} payments` : "No payments yet";
  els.avgInvoice.textContent = money(avgInvoice);
  els.avgNote.textContent = filteredInvoices.length ? "Across invoices" : "No invoices yet";
  const monthlyCreated = monthlyInvoices.length;
  const monthlyPaid = monthlyInvoices.filter((invoice) => invoice.status === "PAID").length;
  const monthlyOutstanding = monthlyInvoices.filter((invoice) => invoice.status !== "PAID").length;
  els.monthlyCreated.textContent = monthlyCreated;
  els.monthlyPaid.textContent = monthlyPaid;
  els.monthlyOutstanding.textContent = monthlyOutstanding;
  els.totalSettled.textContent = money(settledVolume);
  els.inSettlement.textContent = money(pendingVolume);
  els.settlementRate.textContent = percent(successRate);
  els.avgConfirmation.textContent = averageConfirmationTime(filteredPayments);
  els.usdcCount.textContent = `${filteredPayments.filter((payment) => (payment.stablecoin || "USDC") === "USDC").length} payment records`;
  els.baseCount.textContent = `${[...filteredPayments, ...wallets].filter((item) => String(item.paymentChain || item.network || "").toUpperCase().includes("BASE")).length} records`;
  els.circleCount.textContent = filteredPayments.some((payment) => payment.provider === "CIRCLE" || payment.circlePaymentId) ? "Operational with Circle records" : "Operational, no Circle payments yet";
  els.walletCount.textContent = wallets.length ? `${wallets.length} merchant wallet${wallets.length === 1 ? "" : "s"} configured` : "No merchant wallets yet";

  renderTrendChart(buildTrendData(filteredInvoices, filteredPayments));
  renderMonthlyChart(monthlyCreated, monthlyPaid, monthlyOutstanding);
  renderStatusBreakdown(filteredPayments);
  renderBottomTable(filteredInvoices);
}

async function load() {
  clearMessage();
  renderApiKeyState();
  els.content.classList.add("hidden");

  if (!key()) {
    els.loadingState.classList.add("hidden");
    show("Enter a merchant API key to load analytics.", true);
    return;
  }

  els.loadingState.classList.remove("hidden");

  try {
    const [merchantPayload, invoicesPayload, paymentsPayload, walletsPayload] = await Promise.all([
      fetchOptional("/api/merchant/me", null),
      fetchJson("/api/invoices?limit=1000&offset=0"),
      fetchJson("/api/payments?limit=1000&offset=0"),
      fetchOptional("/api/wallets", { data: [] }),
    ]);
    merchant = merchantPayload;
    invoices = Array.isArray(invoicesPayload.data) ? invoicesPayload.data : [];
    payments = Array.isArray(paymentsPayload.data) ? paymentsPayload.data : [];
    wallets = Array.isArray(walletsPayload.data) ? walletsPayload.data : [];
    renderMerchant();
    render();
    els.content.classList.remove("hidden");
  } catch (error) {
    show(error.message || "Unable to load analytics.", true);
  } finally {
    els.loadingState.classList.add("hidden");
  }
}

function exportAnalytics() {
  if (!currentSummary) {
    show("No analytics data to export.", true);
    return;
  }
  const rows = [
    ["Metric", "Value"],
    ["Total Volume", currentSummary.invoiceVolume],
    ["Confirmed Payments", currentSummary.confirmedCount],
    ["Payment Records", currentSummary.paymentsCount],
    ["Payment Success Rate", currentSummary.successRate],
    ["Average Invoice Value", currentSummary.avgInvoice],
    ["Total Settled", currentSummary.settledVolume],
    ["In Settlement", currentSummary.pendingVolume],
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "afrisettle-analytics.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  show("Analytics export downloaded.");
}

els.apiKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = els.apiKeyInput.value.trim();
  if (!value) {
    show("API key is required.", true);
    return;
  }
  localStorage.setItem("afrisettleApiKey", value);
  await load();
});

els.apiKeyChangeButton.addEventListener("click", () => {
  localStorage.removeItem("afrisettleApiKey");
  invoices = [];
  payments = [];
  wallets = [];
  currentSummary = null;
  renderApiKeyState();
  els.content.classList.add("hidden");
  show("Enter a new API key to reconnect.", true);
});

els.dateRange.addEventListener("change", render);
els.exportButton.addEventListener("click", exportAnalytics);
els.trendRevenue.addEventListener("click", () => {
  trendMode = "revenue";
  render();
});
els.trendSettlements.addEventListener("click", () => {
  trendMode = "settlements";
  render();
});

renderApiKeyState();
load();
