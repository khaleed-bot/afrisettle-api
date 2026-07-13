const state = {
  merchant: null,
  wallets: [],
  invoicesTotal: 0,
  paymentsTotal: 0,
  preferences: {
    emailNotifications: false,
    paymentNotifications: true,
    settlementNotifications: true,
    duePeriod: "14",
  },
};

const loadingState = document.getElementById("loading-state");
const message = document.getElementById("message");
const settingsContent = document.getElementById("settings-content");
const apiKeyForm = document.getElementById("api-key-form");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeySaveButton = document.getElementById("api-key-save-button");
const apiKeyConnected = document.getElementById("api-key-connected");
const apiKeyChangeButton = document.getElementById("api-key-change-button");
const profileForm = document.getElementById("profile-form");
const profileError = document.getElementById("profile-error");
const saveProfileButton = document.getElementById("save-profile-button");
const businessNameInput = document.getElementById("business-name");
const merchantEmailInput = document.getElementById("merchant-email");
const merchantCountryInput = document.getElementById("merchant-country");
const businessTypeInput = document.getElementById("business-type");
const unsavedProfile = document.getElementById("unsaved-profile");
const preferencesForm = document.getElementById("preferences-form");
const refreshSettingsButton = document.getElementById("refresh-settings");

function getSavedApiKey() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function setSavedApiKey(apiKey) {
  localStorage.setItem("afrisettleApiKey", apiKey);
}

function getSavedPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem("afrisettleSettingsPreferences") || "{}");
    return { ...state.preferences, ...saved };
  } catch (_) {
    return { ...state.preferences };
  }
}

function savePreferences(preferences) {
  localStorage.setItem("afrisettleSettingsPreferences", JSON.stringify(preferences));
}

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className =
    type === "success"
      ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700"
      : "rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700";
  message.classList.remove("hidden");
}

function hideMessage() {
  message.textContent = "";
  message.classList.add("hidden");
}

function showFieldError(text) {
  profileError.textContent = text;
  profileError.classList.remove("hidden");
}

function hideFieldError() {
  profileError.textContent = "";
  profileError.classList.add("hidden");
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
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

function initialsFromName(name) {
  return (name || "AfriSettle Merchant")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function updateApiKeyState() {
  const apiKey = getSavedApiKey();
  const hasApiKey = Boolean(apiKey);

  apiKeyInput.classList.toggle("hidden", hasApiKey);
  apiKeySaveButton.classList.toggle("hidden", hasApiKey);
  apiKeyConnected.classList.toggle("hidden", !hasApiKey);
  apiKeyConnected.classList.toggle("flex", hasApiKey);
  apiKeyInput.value = "";

  const maskedElements = [
    document.getElementById("masked-api-key"),
    document.getElementById("security-api-key"),
    document.getElementById("session-api-key"),
  ].filter(Boolean);

  maskedElements.forEach((element) => {
    element.textContent = hasApiKey ? maskApiKey(apiKey) : "No API key saved in this browser.";
  });
}

async function apiRequest(url, options = {}) {
  const apiKey = getSavedApiKey();

  if (!apiKey) {
    throw new Error("No merchant API key found. Save one from this page or the dashboard first.");
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
    const error = new Error(payload.error || "Settings request failed.");
    error.status = response.status;
    throw error;
  }

  return payload;
}

function renderMerchantShell(merchant) {
  const businessName = merchant?.businessName || "AfriSettle Merchant";
  const email = merchant?.email || "merchant@example.com";
  const initials = initialsFromName(businessName);

  document.getElementById("merchant-name").textContent = businessName;
  document.getElementById("profile-name").textContent = businessName;
  document.getElementById("profile-email").textContent = email;
  document.getElementById("merchant-avatar").textContent = initials;
}

function renderProfile(merchant) {
  businessNameInput.value = merchant.businessName || "";
  merchantEmailInput.value = merchant.email || "";
  merchantCountryInput.value = merchant.country || "";
  businessTypeInput.value = localStorage.getItem("afrisettleBusinessType") || "Retail";

  document.getElementById("merchant-id").textContent = merchant.id || "Not available";
  document.getElementById("member-since").textContent = formatDate(merchant.createdAt);
  document.getElementById("updated-at").textContent = formatDate(merchant.updatedAt);

  renderMerchantShell(merchant);
}

function renderWallets(wallets) {
  const defaultWallet = wallets.find((wallet) => wallet.isDefault) || wallets[0];
  const emptyState = document.getElementById("default-wallet-empty");
  const content = document.getElementById("default-wallet-content");
  const circleStatus = document.getElementById("circle-status");
  const apiAccessStatus = document.getElementById("api-access-status");

  emptyState.classList.toggle("hidden", Boolean(defaultWallet));
  content.classList.toggle("hidden", !defaultWallet);

  if (defaultWallet) {
    document.getElementById("default-wallet-label").textContent =
      defaultWallet.label || "Merchant wallet";
    document.getElementById("default-wallet-network").textContent =
      defaultWallet.network || "Base";
    document.getElementById("default-wallet-stablecoin").textContent =
      defaultWallet.stablecoin || "USDC";
    document.getElementById("default-wallet-address").textContent =
      defaultWallet.address || "Address unavailable";
  }

  circleStatus.textContent = wallets.length > 0 ? "Connected" : "Unavailable";
  circleStatus.className =
    wallets.length > 0
      ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"
      : "rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700";
  apiAccessStatus.textContent = getSavedApiKey() ? "Connected" : "Missing";
  apiAccessStatus.className = getSavedApiKey()
    ? "font-black text-emerald-600"
    : "font-black text-amber-600";
}

function renderCounts() {
  document.getElementById("invoice-total").textContent = state.invoicesTotal;
  document.getElementById("payment-total").textContent = state.paymentsTotal;
  document.getElementById("wallet-total").textContent = state.wallets.length;
}

function renderPreferences() {
  state.preferences = getSavedPreferences();
  document.getElementById("email-notifications").checked =
    state.preferences.emailNotifications;
  document.getElementById("payment-notifications").checked =
    state.preferences.paymentNotifications;
  document.getElementById("settlement-notifications").checked =
    state.preferences.settlementNotifications;
  document.getElementById("due-period").value = state.preferences.duePeriod;
  document.getElementById("due-period-summary").textContent =
    `${state.preferences.duePeriod} days`;
}

function setActiveTab(tabName) {
  document.querySelectorAll(".settings-tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("border-[#2443d8]", active);
    tab.classList.toggle("text-[#2443d8]", active);
    tab.classList.toggle("font-black", active);
    tab.classList.toggle("border-transparent", !active);
    tab.classList.toggle("text-slate-600", !active);
    tab.classList.toggle("font-bold", !active);
  });

  document.querySelectorAll(".settings-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `${tabName}-panel`);
  });
}

async function loadSettings() {
  hideMessage();
  loadingState.classList.remove("hidden");
  settingsContent.classList.add("hidden");
  updateApiKeyState();
  renderPreferences();

  try {
    const [merchant, invoicePayload, paymentPayload, walletPayload] =
      await Promise.all([
        apiRequest("/api/merchant/me"),
        apiRequest("/api/invoices?limit=1&offset=0"),
        apiRequest("/api/payments?limit=1&offset=0"),
        apiRequest("/api/wallets"),
      ]);

    state.merchant = merchant;
    state.wallets = Array.isArray(walletPayload.data) ? walletPayload.data : [];
    state.invoicesTotal = invoicePayload.pagination
      ? invoicePayload.pagination.total
      : 0;
    state.paymentsTotal = paymentPayload.pagination
      ? paymentPayload.pagination.total
      : 0;

    renderProfile(merchant);
    renderWallets(state.wallets);
    renderCounts();
    updateApiKeyState();
    settingsContent.classList.remove("hidden");
  } catch (error) {
    showMessage(error.message || "Unable to load settings.");
    settingsContent.classList.remove("hidden");
  } finally {
    loadingState.classList.add("hidden");
  }
}

apiKeyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showMessage("Enter your merchant API key.");
    return;
  }

  setSavedApiKey(apiKey);
  updateApiKeyState();
  showMessage("API key saved. Loading settings...", "success");
  loadSettings();
});

apiKeyChangeButton.addEventListener("click", () => {
  localStorage.removeItem("afrisettleApiKey");
  updateApiKeyState();
  apiKeyInput.focus();
  showMessage("API key removed from this browser. Enter a new key to reconnect.", "success");
});

document.querySelectorAll(".settings-tab").forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});

[businessNameInput, merchantEmailInput, merchantCountryInput, businessTypeInput].forEach(
  (input) => {
    input.addEventListener("input", () => {
      unsavedProfile.classList.remove("hidden");
    });
  }
);

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideFieldError();
  hideMessage();

  const businessName = businessNameInput.value.trim();
  const email = merchantEmailInput.value.trim().toLowerCase();
  const country = merchantCountryInput.value.trim();
  const businessType = businessTypeInput.value;

  if (!businessName) {
    showFieldError("Business name is required.");
    return;
  }

  if (!email) {
    showFieldError("Merchant email is required.");
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

    localStorage.setItem("afrisettleBusinessType", businessType);
    state.merchant = merchant;
    renderProfile(merchant);
    updateApiKeyState();
    unsavedProfile.classList.add("hidden");
    showMessage("Merchant profile updated successfully.", "success");
  } catch (error) {
    showFieldError(error.message || "Unable to update profile.");
  } finally {
    saveProfileButton.disabled = false;
    saveProfileButton.textContent = "Save Changes";
  }
});

preferencesForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const preferences = {
    emailNotifications: document.getElementById("email-notifications").checked,
    paymentNotifications: document.getElementById("payment-notifications").checked,
    settlementNotifications: document.getElementById("settlement-notifications").checked,
    duePeriod: document.getElementById("due-period").value,
  };

  state.preferences = preferences;
  savePreferences(preferences);
  renderPreferences();

  const status = document.getElementById("preferences-status");
  status.textContent = "Preferences saved locally";
  status.className = "text-sm font-bold text-emerald-600";
  showMessage("Preferences saved in this browser.", "success");
});

document.getElementById("due-period").addEventListener("change", (event) => {
  document.getElementById("due-period-summary").textContent =
    `${event.target.value} days`;
});

refreshSettingsButton.addEventListener("click", loadSettings);

updateApiKeyState();
loadSettings();
