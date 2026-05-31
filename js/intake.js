// ==========================
// LOAD USER DATA
// ==========================
function loadUserData() {
  const raw = localStorage.getItem("cmr_user");
  if (!raw) return;

  const data = JSON.parse(raw);

  Object.keys(data).forEach(key => {
    const el = document.getElementById(key);
    if (el) el.value = data[key];
  });
}

// ==========================
// COLLECT USER DATA
// ==========================
function collectUserData() {
  return {
    firstName: document.getElementById("firstName")?.value || "",
    lastName: document.getElementById("lastName")?.value || "",
    email: document.getElementById("email")?.value || "",
    phone: document.getElementById("phone")?.value || "",
    charge: document.getElementById("charge")?.value || "",

    mailingStreet: document.getElementById("mailingStreet")?.value || "",
    mailingCity: document.getElementById("mailingCity")?.value || "",
    mailingState: document.getElementById("mailingState")?.value || "",
    mailingZip: document.getElementById("mailingZip")?.value || ""
  };
}

// ==========================
// SAVE USER DATA
// ==========================
function saveUserData() {
  const data = collectUserData();
  localStorage.setItem("cmr_user", JSON.stringify(data));
}

// ==========================
// POPULATE CHARGES DROPDOWN
// ==========================
function populateCharges() {
  const select = document.getElementById("charge");
  if (!select || !window.charges) return;

  select.innerHTML = '<option value="">Select a charge</option>';

  window.charges.forEach(charge => {
    const option = document.createElement("option");
    option.value = charge.name;
    option.textContent = charge.name;
    select.appendChild(option);
  });
}

// ==========================
// NEXT BUTTON
// ==========================
function setupNextButton() {
  const btn = document.getElementById("nextBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    saveUserData();
    window.location.href = "record-details.html";
  });
}

// ==========================
// INIT
// ==========================
document.addEventListener("DOMContentLoaded", () => {
  loadUserData();
  populateCharges();
  setupNextButton();
});
