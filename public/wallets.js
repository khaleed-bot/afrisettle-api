const loadingState = document.getElementById("loading-state");
const listError = document.getElementById("list-error");
const successState = document.getElementById("success-state");
const emptyState = document.getElementById("empty-state");
const walletList = document.getElementById("wallet-list");
const walletForm = document.getElementById("wallet-form");
const formError = document.getElementById("form-error");
const formTitle = document.getElementById("form-title");
const walletIdInput = document.getElementById("wallet-id");
const labelInput = document.getElementById("wallet-label");
const addressInput = document.getElementById("wallet-address");
const networkInput = document.getElementById("wallet-network");
const stablecoinInput = document.getElementById("wallet-stablecoin");
const defaultInput = document.getElementById("wallet-default");
const submitButton = document.getElementById("submit-button");
const cancelButton = document.getElementById("cancel-button");

let wallets = [];

function getSavedApiKey() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function hideMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function setFormLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading
    ? "Saving..."
    : walletIdInput.value
      ? "Update Wallet"
      : "Add Wallet";
}

function resetForm() {
  walletForm.reset();
  walletIdInput.value = "";
  networkInput.value = "ETHEREUM";
  stablecoinInput.value = "USDC";
  formTitle.textContent = "Add Wallet";
  submitButton.textContent = "Add Wallet";
  cancelButton.classList.add("hidden");
  hideMessage(formError);
}

function renderWallets() {
  emptyState.classList.toggle("hidden", wallets.length > 0);
  walletList.classList.toggle("hidden", wallets.length === 0);

  walletList.innerHTML = wallets
    .map(
      (wallet) => `
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-[#1557ff]">W</span>
                <h2 class="text-base font-black text-slate-900">${escapeHtml(wallet.label)}</h2>
                ${
                  wallet.isDefault
                    ? '<span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#1557ff]">Primary</span>'
                    : ""
                }
              </div>
              <p class="mt-3 break-all text-sm font-semibold text-slate-700">${escapeHtml(wallet.address)}</p>
              <p class="mt-2 text-xs font-black uppercase text-slate-400">
                ${escapeHtml(wallet.network)} - ${escapeHtml(wallet.stablecoin)}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              ${
                wallet.isDefault
                  ? ""
                  : `<button class="set-default-button h-9 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700" data-id="${wallet.id}" type="button">Set Default</button>`
              }
              <button class="edit-button h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700" data-id="${wallet.id}" type="button">Edit</button>
              <button class="delete-button h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700" data-id="${wallet.id}" type="button">Delete</button>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  document.querySelectorAll(".set-default-button").forEach((button) => {
    button.addEventListener("click", () =>
      updateWallet(button.dataset.id, { isDefault: true }, "Default wallet updated.")
    );
  });

  document.querySelectorAll(".edit-button").forEach((button) => {
    button.addEventListener("click", () => beginEdit(button.dataset.id));
  });

  document.querySelectorAll(".delete-button").forEach((button) => {
    button.addEventListener("click", () => deleteWallet(button.dataset.id));
  });
}

async function apiRequest(url, options = {}) {
  const apiKey = getSavedApiKey();

  if (!apiKey) {
    throw new Error("No merchant API key found. Save one from the dashboard first.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      "x-api-key": apiKey,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();

  if (response.status === 401 || response.status === 403) {
    throw new Error("Your saved API key is missing, invalid, or not authorized.");
  }

  if (!response.ok) {
    throw new Error(payload.error || "Wallet request failed.");
  }

  return payload;
}

async function loadWallets() {
  loadingState.classList.remove("hidden");
  hideMessage(listError);

  try {
    const payload = await apiRequest("/api/wallets");
    wallets = Array.isArray(payload.data) ? payload.data : [];
    renderWallets();
  } catch (error) {
    showMessage(listError, error.message || "Unable to load wallets.");
  } finally {
    loadingState.classList.add("hidden");
  }
}

function beginEdit(id) {
  const wallet = wallets.find((item) => item.id === id);

  if (!wallet) {
    return;
  }

  walletIdInput.value = wallet.id;
  labelInput.value = wallet.label;
  addressInput.value = wallet.address;
  networkInput.value = wallet.network;
  stablecoinInput.value = wallet.stablecoin;
  defaultInput.checked = wallet.isDefault;
  formTitle.textContent = "Edit Wallet";
  submitButton.textContent = "Update Wallet";
  cancelButton.classList.remove("hidden");
  hideMessage(formError);
  walletForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function updateWallet(id, data, successMessage) {
  hideMessage(listError);
  hideMessage(successState);

  try {
    await apiRequest(`/api/wallets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    showMessage(successState, successMessage);
    await loadWallets();
  } catch (error) {
    showMessage(listError, error.message || "Unable to update wallet.");
  }
}

async function deleteWallet(id) {
  if (!window.confirm("Delete this wallet?")) {
    return;
  }

  hideMessage(listError);
  hideMessage(successState);

  try {
    await apiRequest(`/api/wallets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    showMessage(successState, "Wallet deleted.");

    if (walletIdInput.value === id) {
      resetForm();
    }

    await loadWallets();
  } catch (error) {
    showMessage(listError, error.message || "Unable to delete wallet.");
  }
}

walletForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(formError);
  hideMessage(successState);

  const data = {
    label: labelInput.value.trim(),
    address: addressInput.value.trim(),
    network: networkInput.value.trim().toUpperCase(),
    stablecoin: stablecoinInput.value.trim().toUpperCase(),
    isDefault: defaultInput.checked,
  };

  if (!data.label || !data.address || !data.network || !data.stablecoin) {
    showMessage(formError, "Label, address, network, and stablecoin are required.");
    return;
  }

  const walletId = walletIdInput.value;
  setFormLoading(true);

  try {
    await apiRequest(
      walletId ? `/api/wallets/${encodeURIComponent(walletId)}` : "/api/wallets",
      {
        method: walletId ? "PATCH" : "POST",
        body: JSON.stringify(data),
      }
    );
    showMessage(
      successState,
      walletId ? "Wallet updated successfully." : "Wallet added successfully."
    );
    resetForm();
    await loadWallets();
  } catch (error) {
    showMessage(formError, error.message || "Unable to save wallet.");
  } finally {
    setFormLoading(false);
  }
});

cancelButton.addEventListener("click", resetForm);

loadWallets();
