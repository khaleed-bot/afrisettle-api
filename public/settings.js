const loadingState = document.getElementById("loading-state");
const pageError = document.getElementById("page-error");
const successState = document.getElementById("success-state");
const settingsContent = document.getElementById("settings-content");
const profileForm = document.getElementById("profile-form");
const profileError = document.getElementById("profile-error");
const saveProfileButton = document.getElementById("save-profile-button");
const businessNameInput = document.getElementById("business-name");
const merchantEmailInput = document.getElementById("merchant-email");
const merchantCountryInput = document.getElementById("merchant-country");

function getSavedApiKey() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function showMessage(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function hideMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function maskApiKey(apiKey) {
  if (!apiKey) {
    return "No API key saved in this browser.";
  }

  if (apiKey.length <= 12) {
    return `${apiKey.slice(0, 4)}...`;
  }

  return `${apiKey.slice(0, 10)}${"*".repeat(12)}${apiKey.slice(-6)}`;
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
    const error = new Error(payload.error || "Settings request failed.");
    error.status = response.status;
    throw error;
  }

  return payload;
}

function renderProfile(merchant) {
  businessNameInput.value = merchant.businessName || "";
  merchantEmailInput.value = merchant.email || "";
  merchantCountryInput.value = merchant.country || "";
  document.getElementById("merchant-id").textContent = merchant.id;
  document.getElementById("member-since").textContent = formatDate(
    merchant.createdAt
  );
}

function renderDefaultWallet(wallets) {
  const defaultWallet = wallets.find((wallet) => wallet.isDefault);
  const emptyState = document.getElementById("default-wallet-empty");
  const content = document.getElementById("default-wallet-content");

  emptyState.classList.toggle("hidden", Boolean(defaultWallet));
  content.classList.toggle("hidden", !defaultWallet);

  if (!defaultWallet) {
    return;
  }

  document.getElementById("default-wallet-label").textContent =
    defaultWallet.label;
  document.getElementById("default-wallet-network").textContent =
    defaultWallet.network;
  document.getElementById("default-wallet-stablecoin").textContent =
    defaultWallet.stablecoin;
  document.getElementById("default-wallet-address").textContent =
    defaultWallet.address;
}

async function loadSettings() {
  hideMessage(pageError);
  hideMessage(successState);
  loadingState.classList.remove("hidden");
  settingsContent.classList.add("hidden");

  try {
    const [merchant, invoicePayload, paymentPayload, walletPayload] =
      await Promise.all([
        apiRequest("/api/merchant/me"),
        apiRequest("/api/invoices?limit=1&offset=0"),
        apiRequest("/api/payments?limit=1&offset=0"),
        apiRequest("/api/wallets"),
      ]);
    const wallets = Array.isArray(walletPayload.data)
      ? walletPayload.data
      : [];

    renderProfile(merchant);
    renderDefaultWallet(wallets);
    document.getElementById("masked-api-key").textContent = maskApiKey(
      getSavedApiKey()
    );
    document.getElementById("invoice-total").textContent =
      invoicePayload.pagination ? invoicePayload.pagination.total : 0;
    document.getElementById("payment-total").textContent =
      paymentPayload.pagination ? paymentPayload.pagination.total : 0;
    document.getElementById("wallet-total").textContent =
      walletPayload.pagination
        ? walletPayload.pagination.total
        : wallets.length;

    settingsContent.classList.remove("hidden");
  } catch (error) {
    showMessage(pageError, error.message || "Unable to load settings.");
  } finally {
    loadingState.classList.add("hidden");
  }
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(profileError);
  hideMessage(successState);

  const businessName = businessNameInput.value.trim();
  const email = merchantEmailInput.value.trim().toLowerCase();
  const country = merchantCountryInput.value.trim();

  if (!businessName) {
    showMessage(profileError, "Business name is required.");
    return;
  }

  if (!email) {
    showMessage(profileError, "Merchant email is required.");
    return;
  }

  saveProfileButton.disabled = true;
  saveProfileButton.textContent = "Saving...";

  try {
    const merchant = await apiRequest("/api/merchant/me", {
      method: "PATCH",
      body: JSON.stringify({
        businessName,
        email,
        country,
      }),
    });

    renderProfile(merchant);
    showMessage(successState, "Merchant profile updated successfully.");
  } catch (error) {
    showMessage(profileError, error.message || "Unable to update profile.");
  } finally {
    saveProfileButton.disabled = false;
    saveProfileButton.textContent = "Save Profile";
  }
});

loadSettings();
