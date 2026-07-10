const apiKeyForm = document.getElementById("api-key-form");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeySaveButton = document.getElementById("api-key-save-button");
const apiKeyConnected = document.getElementById("api-key-connected");
const apiKeyChangeButton = document.getElementById("api-key-change-button");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const dashboardMessage = document.getElementById("dashboard-message");
const invoiceList = document.getElementById("invoice-list");
const invoiceEmptyState = document.getElementById("invoice-empty-state");
const activityList = document.getElementById("activity-list");
const activityEmptyState = document.getElementById("activity-empty-state");
const totalVolume = document.getElementById("total-volume");
const paidVolume = document.getElementById("paid-volume");
const paidInvoices = document.getElementById("paid-invoices");
const pendingInvoices = document.getElementById("pending-invoices");
const pendingVolume = document.getElementById("pending-volume");
const paymentSuccessRate = document.getElementById("payment-success-rate");
const revenueBars = document.getElementById("revenue-bars");
const merchantName = document.getElementById("merchant-name");
const profileName = document.getElementById("profile-name");
const profileEmail = document.getElementById("profile-email");
const merchantAvatar = document.getElementById("merchant-avatar");
const heroTitle = document.getElementById("hero-title");
const todayLabel = document.getElementById("today-label");

let invoices = [];
let payments = [];
let wallets = [];

function getSavedApiKey() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function apiHeaders() {
  return { "x-api-key": getSavedApiKey() };
}

function renderApiKeyState() {
  const hasKey = Boolean(getSavedApiKey());
  apiKeyInput.classList.toggle("hidden", hasKey);
  apiKeySaveButton.classList.toggle("hidden", hasKey);
  apiKeyConnected.classList.toggle("hidden", !hasKey);
  apiKeyConnected.classList.toggle("flex", hasKey);

  if (!hasKey) {
    apiKeyInput.value = "";
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);
}

function formatAmount(value, currency = "USDC") {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)} ${currency}`;
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function sameDay(value, date = new Date()) {
  if (!value) return false;
  const target = new Date(value);
  return target.toDateString() === date.toDateString();
}

function setMessage(message, isError = false) {
  dashboardMessage.textContent = message;
  dashboardMessage.className = `rounded-xl border px-4 py-2 text-sm font-bold ${
    isError
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700"
  }`;
}

function clearMessage() {
  dashboardMessage.className = "hidden rounded-xl border px-4 py-2 text-sm font-bold";
  dashboardMessage.textContent = "";
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: apiHeaders() });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

async function loadData() {
  if (!getSavedApiKey()) {
    throw new Error("Enter your merchant API key to load dashboard data.");
  }

  loadingState.classList.remove("hidden");
  errorState.classList.add("hidden");
  clearMessage();

  const [merchantPayload, invoicePayload, paymentPayload, walletPayload] = await Promise.all([
    fetchJson("/api/merchant/me"),
    fetchJson("/api/invoices?limit=1000&offset=0"),
    fetchJson("/api/payments?limit=1000&offset=0"),
    fetchJson("/api/wallets"),
  ]);

  invoices = invoicePayload.data || [];
  payments = paymentPayload.data || [];
  wallets = walletPayload.data || [];
  renderMerchant(merchantPayload);
  renderDashboard();
}

function renderMerchant(merchant) {
  const name = merchant.businessName || merchant.name || "AfriSettle Merchant";
  const email = merchant.email || "merchant@example.com";
  merchantName.textContent = name;
  profileName.textContent = name;
  profileEmail.textContent = email;
  merchantAvatar.textContent = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  heroTitle.textContent = `Welcome back, ${name} 👋`;
}

function renderDashboard() {
  const paid = invoices.filter((invoice) => invoice.status === "PAID");
  const pending = invoices.filter((invoice) => invoice.status === "PENDING" || invoice.status === "UNPAID");
  const total = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const paidTotal = paid.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const outstandingTotal = pending.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const confirmedPayments = payments.filter((payment) => payment.status === "CONFIRMED").length;
  const success = payments.length ? Math.round((confirmedPayments / payments.length) * 1000) / 10 : 0;

  totalVolume.textContent = formatMoney(total);
  paidVolume.textContent = formatMoney(paidTotal);
  paidInvoices.textContent = paid.length;
  pendingInvoices.textContent = pending.length;
  pendingVolume.textContent = `${formatMoney(outstandingTotal)} outstanding`;
  paymentSuccessRate.textContent = `${success}%`;
  todayLabel.innerHTML = `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date())} <img class="h-4 w-4" src="/assets/ui/chevron-down.svg" alt="" />`;

  renderInvoices(pending);
  renderActivity();
  renderRevenueBars();
}

function statusPill(status) {
  const classes = {
    PAID: "bg-emerald-100 text-emerald-700",
    PENDING: "bg-amber-100 text-amber-700",
    UNPAID: "bg-amber-100 text-amber-700",
    DRAFT: "bg-slate-100 text-slate-600",
  };
  const labels = {
    PAID: "Paid",
    PENDING: "Awaiting Payment",
    UNPAID: "Awaiting Payment",
    DRAFT: "Draft",
  };
  return `<span class="rounded-lg border border-current/10 px-3 py-1 text-xs font-black ${classes[status] || classes.DRAFT}">${labels[status] || "Draft"}</span>`;
}

function renderInvoices(items) {
  const rows = items.slice(0, 5);
  invoiceList.innerHTML = "";
  invoiceEmptyState.classList.toggle("hidden", rows.length > 0);

  if (!rows.length) return;

  invoiceList.innerHTML = `
    <table class="w-full min-w-[680px] text-left text-sm">
      <thead class="text-xs font-black text-slate-500">
        <tr><th class="px-3 py-2">Invoice #</th><th class="px-3 py-2">Customer</th><th class="px-3 py-2">Amount</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Due Date</th><th class="px-3 py-2"></th></tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        ${rows
          .map(
            (invoice) => `
              <tr class="bg-white">
                <td class="px-3 py-2.5 font-bold">${invoice.invoiceNumber || invoice.id}</td>
                <td class="px-3 py-2.5 font-semibold">${invoice.customerName || "Customer"}</td>
                <td class="px-3 py-2.5 font-semibold">${formatAmount(invoice.amount, invoice.stablecoin || invoice.currency || "USDC")}</td>
                <td class="px-3 py-2.5">${statusPill(invoice.status)}</td>
                <td class="px-3 py-2.5">${formatDate(invoice.dueDate)}</td>
                <td class="px-3 py-2.5 text-right"><a class="inline-flex h-7 w-7 items-center justify-center" href="/invoice-detail?id=${invoice.id}"><img class="h-4 w-4" src="/assets/ui/chevron-right.svg" alt="View" /></a></td>
              </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function paymentTitle(payment) {
  if (payment.status === "CONFIRMED") return "Payment received";
  if (payment.status === "FAILED") return "Payment failed";
  return "Pending payment";
}

function relativeTime(value) {
  if (!value) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function activityIcon(event) {
  if (event.type === "payment") {
    if (event.status === "FAILED") return { icon: "circle-alert.svg", bg: "bg-red-50" };
    if (event.status === "CONFIRMED") return { icon: "download.svg", bg: "bg-emerald-50" };
    return { icon: "clock.svg", bg: "bg-amber-50" };
  }
  return { icon: "file-text.svg", bg: "bg-blue-50" };
}

function renderActivity() {
  const invoiceEvents = invoices.slice(0, 5).map((invoice) => ({
    type: "invoice",
    createdAt: invoice.createdAt,
    title: "Invoice created",
    detail: `${invoice.invoiceNumber || "Invoice"} for ${formatAmount(invoice.amount, invoice.stablecoin || "USDC")}`,
  }));
  const paymentEvents = payments.slice(0, 5).map((payment) => ({
    type: "payment",
    status: payment.status,
    createdAt: payment.createdAt,
    title: paymentTitle(payment),
    detail: `${formatAmount(payment.amountReceived || payment.amountExpected, payment.stablecoin || "USDC")} ${payment.invoice ? `for ${payment.invoice.invoiceNumber}` : ""}`,
  }));
  const events = [...invoiceEvents, ...paymentEvents]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);

  activityEmptyState.classList.toggle("hidden", events.length > 0);
  activityList.innerHTML = events
    .map(
      (event) => {
        const icon = activityIcon(event);
        const dot = event.type === "payment" && event.status === "FAILED" ? "bg-red-500" : event.type === "payment" && event.status !== "CONFIRMED" ? "bg-amber-500" : "bg-emerald-500";
        return `
        <div class="flex items-center gap-3 border-b border-slate-100 py-2 last:border-0">
          <div class="flex h-8 w-8 items-center justify-center rounded-full ${icon.bg}"><img class="h-4 w-4" src="/assets/ui/${icon.icon}" alt="" /></div>
          <div class="min-w-0 flex-1">
            <p class="font-black">${event.title}</p>
            <p class="truncate text-sm text-slate-600">${event.detail}</p>
          </div>
          <span class="flex flex-none items-center gap-2 text-xs font-bold text-slate-500">${relativeTime(event.createdAt)} <span class="h-2 w-2 rounded-full ${dot}"></span></span>
        </div>`;
      }
    )
    .join("");
}

function renderRevenueBars() {
  const max = Math.max(...invoices.map((invoice) => Number(invoice.amount || 0)), 1);
  const recent = invoices.slice(0, 7).reverse();
  const data = recent.length ? recent : [{ amount: 0 }, { amount: 0 }, { amount: 0 }, { amount: 0 }, { amount: 0 }, { amount: 0 }, { amount: 0 }];
  const points = data.map((invoice, index) => {
    const x = 26 + index * (548 / Math.max(data.length - 1, 1));
    const y = 190 - (Number(invoice.amount || 0) / max) * 150;
    return `${x},${Math.max(20, y)}`;
  });

  revenueBars.innerHTML = `
    <svg class="h-full w-full" viewBox="0 0 600 230" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#1557ff" stop-opacity="0.24" />
          <stop offset="100%" stop-color="#1557ff" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      ${[30, 70, 110, 150, 190].map((y) => `<line x1="22" x2="580" y1="${y}" y2="${y}" stroke="#e5eaf2" stroke-width="1" />`).join("")}
      <polyline points="${points.join(" ")} 574,205 26,205" fill="url(#revenueFill)" stroke="none" />
      <polyline points="${points.join(" ")}" fill="none" stroke="#1557ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${points.map((point) => {
        const [x, y] = point.split(",");
        return `<circle cx="${x}" cy="${y}" r="5" fill="#1557ff" />`;
      }).join("")}
    </svg>`;
}

apiKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = apiKeyInput.value.trim();
  if (!key) {
    setMessage("API key is required.", true);
    return;
  }
  localStorage.setItem("afrisettleApiKey", key);
  renderApiKeyState();
  setMessage("API key saved.");
  try {
    await loadData();
  } catch (error) {
    errorState.textContent = error.message;
    errorState.classList.remove("hidden");
  } finally {
    loadingState.classList.add("hidden");
  }
});

apiKeyChangeButton.addEventListener("click", () => {
  localStorage.removeItem("afrisettleApiKey");
  renderApiKeyState();
  clearMessage();
  errorState.textContent = "Enter your merchant API key to load dashboard data.";
  errorState.classList.remove("hidden");
  apiKeyInput.focus();
});

document.addEventListener("DOMContentLoaded", async () => {
  apiKeyInput.value = getSavedApiKey();
  renderApiKeyState();
  try {
    await loadData();
  } catch (error) {
    errorState.textContent = error.message;
    errorState.classList.remove("hidden");
  } finally {
    loadingState.classList.add("hidden");
  }
});
