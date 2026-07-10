const invoiceId = new URLSearchParams(window.location.search).get("id");
const loadingState = document.getElementById("loading-state");
const message = document.getElementById("message");
const content = document.getElementById("content");
const sidebar = document.getElementById("sidebar");
const invoiceFrom = document.getElementById("invoice-from");
const paymentStatus = document.getElementById("payment-status");
const invoiceNumber = document.getElementById("invoice-number");
const dueDate = document.getElementById("due-date");
const amountDue = document.getElementById("amount-due");
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
let invoice = null;

function amount(value, coin = "USDC") { return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${coin}`; }
function date(value) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-"; }
function show(text, error = false) { message.className = `rounded-2xl border px-4 py-3 text-sm font-bold lg:col-span-2 ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`; message.textContent = text; }
function pill(status) { const kind = status === "Paid" ? "bg-emerald-100 text-emerald-700" : status === "Payment Detected" ? "bg-amber-100 text-amber-700" : "bg-amber-100 text-amber-700"; return `<span class="rounded-full px-3 py-1 text-xs font-black ${kind}">${status}</span>`; }
function explorerUrl() { const chain = String(invoice.chain || "").toUpperCase(); const value = invoice.txHash || invoice.depositAddress; const path = invoice.txHash ? "tx" : "address"; if (!value) return "#"; if (chain.includes("BASE-SEPOLIA")) return `https://sepolia.basescan.org/${path}/${encodeURIComponent(value)}`; if (chain.includes("BASE")) return `https://basescan.org/${path}/${encodeURIComponent(value)}`; return `https://etherscan.io/${path}/${encodeURIComponent(value)}`; }

function renderQr(address) {
  if (!address) { qrCode.innerHTML = "<span class='col-span-9 self-center text-center text-xs font-bold text-slate-500'>No address</span>"; return; }
  const seed = address.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  qrCode.innerHTML = Array.from({ length: 81 }, (_, i) => {
    const row = Math.floor(i / 9), col = i % 9;
    const finder = (row < 3 && col < 3) || (row < 3 && col > 5) || (row > 5 && col < 3);
    return `<span class="${finder || (seed + i * 11) % 4 === 0 ? "bg-[#06172d]" : "bg-slate-100"}"></span>`;
  }).join("");
}

async function load() {
  if (!invoiceId) throw new Error("Invoice id is required.");
  const response = await fetch(`/api/public/invoices/${invoiceId}/payment`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load invoice payment details");
  invoice = payload;
  render();
}

function render() {
  loadingState.classList.add("hidden");
  content.classList.remove("hidden");
  sidebar.classList.remove("hidden");
  const coin = invoice.stablecoin || "USDC";
  invoiceFrom.textContent = `Invoice from ${invoice.merchant ? invoice.merchant.businessName : "Merchant"}`;
  paymentStatus.innerHTML = pill(invoice.paymentStatus || "Awaiting Payment");
  invoiceNumber.textContent = invoice.invoiceNumber || "-";
  dueDate.textContent = date(invoice.dueDate);
  amountDue.textContent = amount(invoice.amount, coin);
  stablecoin.textContent = coin;
  network.textContent = invoice.chain || "Network pending";
  depositAddress.textContent = invoice.depositAddress || "Deposit address is not available yet.";
  tagBlock.classList.toggle("hidden", !invoice.depositAddressTag);
  depositAddressTag.textContent = invoice.depositAddressTag || "";
  explorerLink.href = explorerUrl();
  summaryNumber.textContent = invoice.invoiceNumber || "-";
  summaryStatus.textContent = invoice.paymentStatus || "Awaiting Payment";
  summaryAmount.textContent = amount(invoice.amount, coin);
  merchantName.textContent = invoice.merchant ? invoice.merchant.businessName : "Merchant";
  paidDetails.classList.toggle("hidden", !invoice.txHash);
  txHash.textContent = invoice.txHash ? `Tx Hash: ${invoice.txHash}` : "";
  confirmedAt.textContent = invoice.confirmedAt ? `Confirmed: ${date(invoice.confirmedAt)}` : "";
  renderQr(invoice.depositAddress);
}

copyAddress.addEventListener("click", async () => {
  if (!invoice || !invoice.depositAddress) { show("No deposit address is available yet.", true); return; }
  await navigator.clipboard.writeText(invoice.depositAddress);
  show("Deposit address copied.");
});

load().catch((error) => { loadingState.classList.add("hidden"); show(error.message, true); });
