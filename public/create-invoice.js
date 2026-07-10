const invoiceForm = document.getElementById("invoice-form");
const submitButton = document.getElementById("submit-button");
const apiKeyError = document.getElementById("api-key-error");
const formError = document.getElementById("form-error");
const successState = document.getElementById("success-state");
const createdInvoiceNumber = document.getElementById("created-invoice-number");

function getSavedApiKey() {
  return localStorage.getItem("afrisettleApiKey") || "";
}

function showError(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function clearErrors() {
  apiKeyError.textContent = "";
  apiKeyError.classList.add("hidden");
  formError.textContent = "";
  formError.classList.add("hidden");
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Creating..." : "Create Invoice";
}

function buildRequestBody(formData) {
  const dueDate = formData.get("dueDate");
  const description = formData.get("description").trim();

  return {
    invoiceNumber: formData.get("invoiceNumber").trim(),
    customerName: formData.get("customerName").trim(),
    customerEmail: formData.get("customerEmail").trim(),
    amount: formData.get("amount").trim(),
    currency: formData.get("currency").trim().toUpperCase(),
    ...(dueDate ? { dueDate: new Date(`${dueDate}T00:00:00`).toISOString() } : {}),
    ...(description ? { description } : {}),
  };
}

invoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const apiKey = getSavedApiKey();

  if (!apiKey) {
    showError(apiKeyError, "No merchant API key found. Save one from the dashboard first.");
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
      body: JSON.stringify(buildRequestBody(new FormData(invoiceForm))),
    });

    const payload = await response.json();

    if (response.status === 401 || response.status === 403) {
      showError(apiKeyError, "Your saved API key is missing or invalid.");
      return;
    }

    if (!response.ok) {
      showError(formError, payload.error || "Unable to create invoice.");
      return;
    }

    createdInvoiceNumber.textContent = payload.invoiceNumber;
    invoiceForm.classList.add("hidden");
    successState.classList.remove("hidden");
  } catch (error) {
    showError(formError, "Unable to connect to the API.");
  } finally {
    setLoading(false);
  }
});

if (!getSavedApiKey()) {
  showError(apiKeyError, "No merchant API key found. Save one from the dashboard first.");
}
