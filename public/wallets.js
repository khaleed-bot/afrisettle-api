const els = {
  apiKeyForm: document.getElementById("api-key-form"),
  apiKeyInput: document.getElementById("api-key-input"),
  apiKeySaveButton: document.getElementById("api-key-save-button"),
  apiKeyConnected: document.getElementById("api-key-connected"),
  apiKeyChangeButton: document.getElementById("api-key-change-button"),
  merchantName: document.getElementById("merchant-name"),
  profileName: document.getElementById("profile-name"),
  profileEmail: document.getElementById("profile-email"),
  merchantAvatar: document.getElementById("merchant-avatar"),
  loadingState: document.getElementById("loading-state"),
  listError: document.getElementById("list-error"),
  emptyState: document.getElementById("empty-state"),
  message: document.getElementById("message"),
  walletContent: document.getElementById("wallet-content"),
  walletSelector: document.getElementById("wallet-selector"),
  addWalletButton: document.getElementById("add-wallet-button"),
  receiveButton: document.getElementById("receive-button"),
  sendButton: document.getElementById("send-button"),
  exportButton: document.getElementById("export-button"),
  totalBalance: document.getElementById("total-balance"),
  availableBalance: document.getElementById("available-balance"),
  settlementBalance: document.getElementById("settlement-balance"),
  networkCard: document.getElementById("network-card"),
  primaryBadge: document.getElementById("primary-badge"),
  selectedWalletLabel: document.getElementById("selected-wallet-label"),
  selectedWalletAddress: document.getElementById("selected-wallet-address"),
  selectedWalletNetwork: document.getElementById("selected-wallet-network"),
  selectedWalletStatus: document.getElementById("selected-wallet-status"),
  chartCoin: document.getElementById("chart-coin"),
  copyButton: document.getElementById("copy-button"),
  explorerButton: document.getElementById("explorer-button"),
  qrButton: document.getElementById("qr-button"),
  activityList: document.getElementById("activity-list"),
  totalReceived: document.getElementById("total-received"),
  totalSettled: document.getElementById("total-settled"),
  settlementRate: document.getElementById("settlement-rate"),
  lastSettlement: document.getElementById("last-settlement"),
  quickReceive: document.getElementById("quick-receive"),
  quickDeposit: document.getElementById("quick-deposit"),
  quickExport: document.getElementById("quick-export"),
  quickExplorer: document.getElementById("quick-explorer"),
  walletList: document.getElementById("wallet-list"),
  walletFormPanel: document.getElementById("wallet-form-panel"),
  walletForm: document.getElementById("wallet-form"),
  formError: document.getElementById("form-error"),
  formTitle: document.getElementById("form-title"),
  walletIdInput: document.getElementById("wallet-id"),
  labelInput: document.getElementById("wallet-label"),
  addressInput: document.getElementById("wallet-address"),
  networkInput: document.getElementById("wallet-network"),
  stablecoinInput: document.getElementById("wallet-stablecoin"),
  defaultInput: document.getElementById("wallet-default"),
  submitButton: document.getElementById("submit-button"),
  cancelButton: document.getElementById("cancel-button"),
  qrModal: document.getElementById("qr-modal"),
  qrClose: document.getElementById("qr-close"),
  qrAddress: document.getElementById("qr-address"),
  qrCopy: document.getElementById("qr-copy"),
};

let wallets = [];
let selectedWalletId = "";

function getSavedApiKey() {
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

function shortAddress(address) {
  const value = String(address || "");
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-10)}` : value || "No address saved";
}

function normalizeNetwork(network) {
  const value = String(network || "BASE").toUpperCase();
  if (value.includes("BASE")) return "Base";
  if (value.includes("ETH")) return "Ethereum";
  return value;
}

function selectedWallet() {
  return wallets.find((wallet) => wallet.id === selectedWalletId) || wallets.find((wallet) => wallet.isDefault) || wallets[0] || null;
}

function showMessage(text, error = false) {
  els.message.className = `rounded-xl border px-4 py-2 text-sm font-bold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`;
  els.message.textContent = text;
}

function hideMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function showListError(text) {
  els.listError.textContent = text;
  els.listError.classList.remove("hidden");
}

function clearMessage() {
  els.message.className = "hidden rounded-xl border px-4 py-2 text-sm font-bold";
  els.message.textContent = "";
}

function renderApiKeyState() {
  const hasKey = Boolean(getSavedApiKey());
  els.apiKeyInput.classList.toggle("hidden", hasKey);
  els.apiKeySaveButton.classList.toggle("hidden", hasKey);
  els.apiKeyConnected.classList.toggle("hidden", !hasKey);
  els.apiKeyConnected.classList.toggle("flex", hasKey);
}

function setShellMerchant() {
  const name = "AfriSettle Merchant";
  const email = "merchant@example.com";
  els.merchantName.textContent = "Merchant account";
  els.profileName.textContent = name;
  els.profileEmail.textContent = email;
  els.merchantAvatar.textContent = "AS";
}

function setFormLoading(isLoading) {
  els.submitButton.disabled = isLoading;
  els.submitButton.textContent = isLoading ? "Saving..." : els.walletIdInput.value ? "Update Wallet" : "Add Wallet";
}

function resetForm() {
  els.walletForm.reset();
  els.walletIdInput.value = "";
  els.networkInput.value = "ETHEREUM";
  els.stablecoinInput.value = "USDC";
  els.formTitle.textContent = "Add Wallet";
  els.submitButton.textContent = "Add Wallet";
  hideMessage(els.formError);
}

function openForm(wallet = null) {
  els.walletFormPanel.classList.remove("hidden");
  hideMessage(els.formError);

  if (!wallet) {
    resetForm();
    els.walletFormPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  els.walletIdInput.value = wallet.id;
  els.labelInput.value = wallet.label || "";
  els.addressInput.value = wallet.address || "";
  els.networkInput.value = wallet.network || "ETHEREUM";
  els.stablecoinInput.value = wallet.stablecoin || "USDC";
  els.defaultInput.checked = Boolean(wallet.isDefault);
  els.formTitle.textContent = "Edit Wallet";
  els.submitButton.textContent = "Update Wallet";
  els.walletFormPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeForm() {
  resetForm();
  els.walletFormPanel.classList.add("hidden");
}

async function apiRequest(url, options = {}) {
  const apiKey = getSavedApiKey();

  if (!apiKey) {
    throw new Error("No merchant API key found. Save one first.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      "x-api-key": apiKey,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    throw new Error("Your saved API key is missing, invalid, or not authorized.");
  }

  if (!response.ok) {
    throw new Error(payload.error || "Wallet request failed.");
  }

  return payload;
}

async function loadWallets() {
  clearMessage();
  hideMessage(els.listError);
  els.loadingState.classList.remove("hidden");
  els.emptyState.classList.add("hidden");

  if (!getSavedApiKey()) {
    els.loadingState.classList.add("hidden");
    els.walletContent.classList.add("hidden");
    showMessage("Enter your merchant API key to load wallets.", true);
    return;
  }

  try {
    const payload = await apiRequest("/api/wallets");
    wallets = Array.isArray(payload.data) ? payload.data : [];
    if (!selectedWalletId || !wallets.some((wallet) => wallet.id === selectedWalletId)) {
      selectedWalletId = wallets.find((wallet) => wallet.isDefault)?.id || wallets[0]?.id || "";
    }
    render();
  } catch (error) {
    els.walletContent.classList.add("hidden");
    showListError(error.message || "Unable to load wallets.");
  } finally {
    els.loadingState.classList.add("hidden");
  }
}

function renderSelector() {
  if (!wallets.length) {
    els.walletSelector.innerHTML = '<option value="">Main Wallet</option>';
    els.walletSelector.disabled = true;
    return;
  }

  els.walletSelector.disabled = false;
  els.walletSelector.innerHTML = wallets
    .map((wallet) => `<option value="${escapeHtml(wallet.id)}">${escapeHtml(wallet.label || "Main Wallet")}${wallet.isDefault ? " - Primary" : ""}</option>`)
    .join("");
  els.walletSelector.value = selectedWallet()?.id || "";
}

function renderSummary(wallet) {
  const coin = wallet?.stablecoin || "USDC";
  const network = normalizeNetwork(wallet?.network);
  els.totalBalance.textContent = `0.00 ${coin}`;
  els.availableBalance.textContent = `0.00 ${coin}`;
  els.settlementBalance.textContent = `0.00 ${coin}`;
  els.networkCard.textContent = network;
  els.chartCoin.textContent = coin;
  els.totalReceived.textContent = `0.00 ${coin}`;
  els.totalSettled.textContent = `0.00 ${coin}`;
  els.settlementRate.textContent = "0%";
  els.lastSettlement.textContent = "No settlements";
}

function renderSelectedWallet(wallet) {
  const hasWallet = Boolean(wallet);
  els.primaryBadge.textContent = wallet?.isDefault ? "PRIMARY SETTLEMENT WALLET" : "SETTLEMENT WALLET";
  els.primaryBadge.className = `inline-flex rounded-full px-3 py-1 text-xs font-black ${wallet?.isDefault ? "bg-blue-50 text-[#1557ff]" : "bg-slate-100 text-slate-600"}`;
  els.selectedWalletLabel.textContent = wallet?.label || "";
  els.selectedWalletAddress.textContent = wallet?.address || "No wallet selected";
  els.selectedWalletNetwork.textContent = wallet ? normalizeNetwork(wallet.network) : "-";
  els.selectedWalletStatus.textContent = hasWallet ? "Active" : "Not configured";
  els.qrAddress.textContent = wallet?.address || "No address available";
  [els.copyButton, els.explorerButton, els.qrButton, els.receiveButton, els.quickReceive, els.quickExplorer].forEach((button) => {
    button.disabled = !hasWallet || !wallet.address;
    button.classList.toggle("opacity-50", !hasWallet || !wallet.address);
  });
}

function renderActivity(wallet) {
  if (!wallet) {
    els.activityList.innerHTML = `<div class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-semibold text-slate-500">No wallet activity yet.</div>`;
    return;
  }

  const rows = [
    { icon: "wallet.svg", title: "Wallet added", detail: wallet.label || "Settlement wallet", time: wallet.createdAt ? new Date(wallet.createdAt).toLocaleDateString() : "Recently" },
    ...(wallet.isDefault ? [{ icon: "check.svg", title: "Primary wallet selected", detail: "Used as the default settlement wallet", time: "Active" }] : []),
  ];

  els.activityList.innerHTML = rows
    .map((item) => `
      <div class="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50"><img class="h-4 w-4" src="/assets/ui/${item.icon}" alt="" /></span>
        <div class="min-w-0 flex-1">
          <p class="font-black">${escapeHtml(item.title)}</p>
          <p class="truncate text-xs font-semibold text-slate-500">${escapeHtml(item.detail)}</p>
        </div>
        <span class="text-xs font-bold text-slate-500">${escapeHtml(item.time)}</span>
      </div>`)
    .join("");
}

function renderWalletList() {
  if (!wallets.length) {
    els.walletList.innerHTML = `<div class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-semibold text-slate-500">No saved wallets to display.</div>`;
    return;
  }

  els.walletList.innerHTML = wallets
    .map((wallet) => `
      <article class="rounded-xl border border-slate-200 p-3">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50"><img class="h-4 w-4" src="/assets/ui/wallet.svg" alt="" /></span>
              <h3 class="font-black">${escapeHtml(wallet.label || "Wallet")}</h3>
              ${wallet.isDefault ? '<span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-black text-[#1557ff]">Primary</span>' : ""}
            </div>
            <p class="mt-2 break-all text-sm font-semibold text-slate-600">${escapeHtml(wallet.address || "No address")}</p>
            <p class="mt-1 text-xs font-black uppercase text-slate-400">${escapeHtml(wallet.network || "ETHEREUM")} - ${escapeHtml(wallet.stablecoin || "USDC")}</p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            ${wallet.isDefault ? "" : `<button class="set-default-button h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700" data-id="${escapeHtml(wallet.id)}" type="button">Set Default</button>`}
            <button class="edit-button h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700" data-id="${escapeHtml(wallet.id)}" type="button">Edit</button>
            <button class="delete-button h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700" data-id="${escapeHtml(wallet.id)}" type="button">Delete</button>
          </div>
        </div>
      </article>`)
    .join("");

  document.querySelectorAll(".set-default-button").forEach((button) => {
    button.addEventListener("click", () => updateWallet(button.dataset.id, { isDefault: true }, "Default wallet updated."));
  });

  document.querySelectorAll(".edit-button").forEach((button) => {
    button.addEventListener("click", () => {
      const wallet = wallets.find((item) => item.id === button.dataset.id);
      if (wallet) openForm(wallet);
    });
  });

  document.querySelectorAll(".delete-button").forEach((button) => {
    button.addEventListener("click", () => deleteWallet(button.dataset.id));
  });
}

function render() {
  const wallet = selectedWallet();
  els.walletContent.classList.toggle("hidden", wallets.length === 0);
  els.emptyState.classList.toggle("hidden", wallets.length > 0);
  renderSelector();
  renderSummary(wallet);
  renderSelectedWallet(wallet);
  renderActivity(wallet);
  renderWalletList();
}

async function updateWallet(id, data, successMessage) {
  hideMessage(els.listError);
  clearMessage();

  try {
    await apiRequest(`/api/wallets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    showMessage(successMessage);
    await loadWallets();
  } catch (error) {
    showListError(error.message || "Unable to update wallet.");
  }
}

async function deleteWallet(id) {
  if (!window.confirm("Delete this wallet?")) {
    return;
  }

  hideMessage(els.listError);
  clearMessage();

  try {
    await apiRequest(`/api/wallets/${encodeURIComponent(id)}`, { method: "DELETE" });
    showMessage("Wallet deleted.");
    if (els.walletIdInput.value === id) closeForm();
    await loadWallets();
  } catch (error) {
    showListError(error.message || "Unable to delete wallet.");
  }
}

function explorerUrl(wallet) {
  if (!wallet?.address) return "";
  const network = String(wallet.network || "").toUpperCase();
  if (network.includes("SEPOLIA")) return `https://sepolia.basescan.org/address/${wallet.address}`;
  if (network.includes("BASE")) return `https://basescan.org/address/${wallet.address}`;
  return `https://etherscan.io/address/${wallet.address}`;
}

async function copyAddress() {
  const wallet = selectedWallet();
  if (!wallet?.address) {
    showMessage("No wallet address available to copy.", true);
    return;
  }
  await navigator.clipboard.writeText(wallet.address);
  showMessage("Wallet address copied.");
}

function openExplorer() {
  const wallet = selectedWallet();
  const url = explorerUrl(wallet);
  if (!url) {
    showMessage("No explorer link is available for this wallet.", true);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function openQrModal() {
  const wallet = selectedWallet();
  if (!wallet?.address) {
    showMessage("No wallet address available for QR code.", true);
    return;
  }
  els.qrAddress.textContent = wallet.address;
  els.qrModal.classList.remove("hidden");
  els.qrModal.classList.add("flex");
}

function closeQrModal() {
  els.qrModal.classList.add("hidden");
  els.qrModal.classList.remove("flex");
}

function exportWallets() {
  if (!wallets.length) {
    showMessage("No wallet data to export.", true);
    return;
  }
  const rows = [["Label", "Address", "Network", "Stablecoin", "Default", "Created At"], ...wallets.map((wallet) => [wallet.label || "", wallet.address || "", wallet.network || "", wallet.stablecoin || "", wallet.isDefault ? "Yes" : "No", wallet.createdAt || ""])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "afrisettle-wallets.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showMessage("Wallet export downloaded.");
}

els.apiKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = els.apiKeyInput.value.trim();
  if (!value) {
    showMessage("API key is required.", true);
    return;
  }
  localStorage.setItem("afrisettleApiKey", value);
  renderApiKeyState();
  await loadWallets();
});

els.apiKeyChangeButton.addEventListener("click", () => {
  localStorage.removeItem("afrisettleApiKey");
  wallets = [];
  selectedWalletId = "";
  renderApiKeyState();
  render();
  showMessage("Enter a new API key to reconnect.", true);
});

els.walletSelector.addEventListener("change", () => {
  selectedWalletId = els.walletSelector.value;
  render();
});

els.addWalletButton.addEventListener("click", () => openForm());
els.cancelButton.addEventListener("click", closeForm);
els.copyButton.addEventListener("click", copyAddress);
els.receiveButton.addEventListener("click", openQrModal);
els.qrButton.addEventListener("click", openQrModal);
els.quickReceive.addEventListener("click", openQrModal);
els.qrClose.addEventListener("click", closeQrModal);
els.qrModal.addEventListener("click", (event) => {
  if (event.target === els.qrModal) closeQrModal();
});
els.qrCopy.addEventListener("click", copyAddress);
els.explorerButton.addEventListener("click", openExplorer);
els.quickExplorer.addEventListener("click", openExplorer);
els.exportButton.addEventListener("click", exportWallets);
els.quickExport.addEventListener("click", exportWallets);
els.sendButton.addEventListener("click", () => showMessage("Send is coming soon for this MVP.", true));
els.quickDeposit.addEventListener("click", () => showMessage("Deposit addresses are generated from invoice details.", true));

els.walletForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(els.formError);
  clearMessage();

  const data = {
    label: els.labelInput.value.trim(),
    address: els.addressInput.value.trim(),
    network: els.networkInput.value.trim().toUpperCase(),
    stablecoin: els.stablecoinInput.value.trim().toUpperCase(),
    isDefault: els.defaultInput.checked,
  };

  if (!data.label || !data.address || !data.network || !data.stablecoin) {
    els.formError.textContent = "Label, address, network, and stablecoin are required.";
    els.formError.classList.remove("hidden");
    return;
  }

  const walletId = els.walletIdInput.value;
  setFormLoading(true);

  try {
    await apiRequest(walletId ? `/api/wallets/${encodeURIComponent(walletId)}` : "/api/wallets", {
      method: walletId ? "PATCH" : "POST",
      body: JSON.stringify(data),
    });
    showMessage(walletId ? "Wallet updated successfully." : "Wallet added successfully.");
    closeForm();
    await loadWallets();
  } catch (error) {
    els.formError.textContent = error.message || "Unable to save wallet.";
    els.formError.classList.remove("hidden");
  } finally {
    setFormLoading(false);
  }
});

setShellMerchant();
renderApiKeyState();
loadWallets();
