const invoiceForm = document.getElementById("invoice-form");
const submitButton = document.getElementById("submit-button");
const message = document.getElementById("message");
const apiKeyForm = document.getElementById("api-key-form");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeySaveButton = document.getElementById("api-key-save-button");
const apiKeyConnected = document.getElementById("api-key-connected");
const apiKeyChangeButton = document.getElementById("api-key-change-button");

function getSavedApiKey() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function setSavedApiKey(apiKey) {
  localStorage.setItem("afrisettleApiKey", apiKey);
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

function updateApiKeyState() {
  const hasApiKey = Boolean(getSavedApiKey());

  apiKeyInput.classList.toggle("hidden", hasApiKey);
  apiKeySaveButton.classList.toggle("hidden", hasApiKey);
  apiKeyConnected.classList.toggle("hidden", !hasApiKey);
  apiKeyConnected.classList.toggle("flex", hasApiKey);
  apiKeyInput.value = "";
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.innerHTML = isLoading
    ? "Creating..."
    : '<img class="h-4 w-4 brightness-0 invert" src="/assets/ui/plus.svg" alt="" /> Create Invoice';
}

function setFieldError(fieldName, text) {
  const element = document.querySelector(`[data-error-for="${fieldName}"]`);

  if (!element) {
    return;
  }

  element.textContent = text;
  element.classList.toggle("hidden", !text);
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach((element) => {
    element.textContent = "";
    element.classList.add("hidden");
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDueDate(value) {
  if (!value) {
    return true;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

function validate(formData) {
  clearFieldErrors();
  let valid = true;
  const invoiceNumber = formData.get("invoiceNumber").trim();
  const customerName = formData.get("customerName").trim();
  const customerEmail = formData.get("customerEmail").trim();
  const amount = Number(formData.get("amount"));
  const dueDate = formData.get("dueDate");

  if (!invoiceNumber) {
    setFieldError("invoiceNumber", "Invoice number is required.");
    valid = false;
  }

  if (!customerName) {
    setFieldError("customerName", "Customer name is required.");
    valid = false;
  }

  if (!customerEmail || !isValidEmail(customerEmail)) {
    setFieldError("customerEmail", "Enter a valid customer email.");
    valid = false;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    setFieldError("amount", "Amount must be greater than zero.");
    valid = false;
  }

  if (!isValidDueDate(dueDate)) {
    setFieldError("dueDate", "Due date must be a valid date.");
    valid = false;
  }

  return valid;
}

function buildRequestBody(formData) {
  const dueDate = formData.get("dueDate");
  const description = formData.get("description").trim();

  return {
    invoiceNumber: formData.get("invoiceNumber").trim(),
    customerName: formData.get("customerName").trim(),
    customerEmail: formData.get("customerEmail").trim().toLowerCase(),
    amount: formData.get("amount").trim(),
    currency: "USD",
    ...(dueDate ? { dueDate: new Date(`${dueDate}T00:00:00`).toISOString() } : {}),
    ...(description ? { description } : {}),
  };
}

async function loadMerchantShell() {
  const apiKey = getSavedApiKey();

  if (!apiKey) {
    return;
  }

  try {
    const response = await fetch("/api/merchant/me", {
      headers: {
        "x-api-key": apiKey,
      },
    });

    if (!response.ok) {
      return;
    }

    const merchant = await response.json();
    const businessName = merchant.businessName || "AfriSettle Merchant";
    const email = merchant.email || "merchant@example.com";
    const initials = businessName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

    document.getElementById("merchant-name").textContent = businessName;
    document.getElementById("profile-name").textContent = businessName;
    document.getElementById("profile-email").textContent = email;
    document.getElementById("merchant-avatar").textContent = initials || "AS";
  } catch (_) {
    // Merchant shell personalization is optional for this page.
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
  showMessage("API key saved. You can create an invoice now.", "success");
  loadMerchantShell();
});

apiKeyChangeButton.addEventListener("click", () => {
  localStorage.removeItem("afrisettleApiKey");
  updateApiKeyState();
  showMessage("API key removed from this browser. Enter a new key to continue.", "success");
  apiKeyInput.focus();
});

invoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage();

  const apiKey = getSavedApiKey();

  if (!apiKey) {
    showMessage("No merchant API key found. Save one above before creating an invoice.");
    return;
  }

  const formData = new FormData(invoiceForm);

  if (!validate(formData)) {
    showMessage("Please fix the highlighted fields.");
    return;
  }

  setLoading(true);

  try {
    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(buildRequestBody(formData)),
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      showMessage("Your saved API key is missing or invalid.");
      return;
    }

    if (!response.ok) {
      showMessage(payload.error || "Unable to create invoice.");
      return;
    }

    showMessage("Invoice created successfully. Redirecting...", "success");

    if (payload.id) {
      window.location.href = `/invoice-detail?id=${encodeURIComponent(payload.id)}`;
      return;
    }

    window.location.href = "/invoices";
  } catch (_) {
    showMessage("Unable to connect to the API.");
  } finally {
    setLoading(false);
  }
});

updateApiKeyState();
loadMerchantShell();
