const els = {
  templateId: document.getElementById("templateId"),
  fieldMapId: document.getElementById("fieldMapId"),
  state: document.getElementById("state"),
  county: document.getElementById("county"),
  court: document.getElementById("court"),
  filingType: document.getElementById("filingType"),
  pdfPath: document.getElementById("pdfPath"),
  version: document.getElementById("version"),
  priority: document.getElementById("priority"),
  matchMode: document.getElementById("matchMode"),
  active: document.getElementById("active"),

  pdfUpload: document.getElementById("pdfUpload"),
  pdfFileName: document.getElementById("pdfFileName"),
  extractPdfFieldsBtn: document.getElementById("extractPdfFieldsBtn"),
  clearPdfFieldsBtn: document.getElementById("clearPdfFieldsBtn"),
  pdfStatus: document.getElementById("pdfStatus"),
  pdfFieldList: document.getElementById("pdfFieldList"),

  sampleCaseJson: document.getElementById("sampleCaseJson"),
  casePathList: document.getElementById("casePathList"),
  mappingTableBody: document.getElementById("mappingTableBody"),

  templateOutput: document.getElementById("templateOutput"),
  fieldMapOutput: document.getElementById("fieldMapOutput"),

  autoGenerateIdsBtn: document.getElementById("autoGenerateIdsBtn"),
  buildTemplateBtn: document.getElementById("buildTemplateBtn"),
  loadSampleBtn: document.getElementById("loadSampleBtn"),
  loadDemoBtn: document.getElementById("loadDemoBtn"),
  addMappingRowBtn: document.getElementById("addMappingRowBtn"),
  buildFieldMapBtn: document.getElementById("buildFieldMapBtn"),
  copyTemplateBtn: document.getElementById("copyTemplateBtn"),
  copyFieldMapBtn: document.getElementById("copyFieldMapBtn")
};

let currentSampleCase = null;
let currentPaths = [];
let currentPdfFields = [];
let currentPdfBytes = null;

function getDemoCase() {
  return {
    id: "demo-case-1",
    state: "OH",
    county: "Wood",
    court: "Wood County Court of Common Pleas",
    caseNumber: "2006CR0387",
    filingType: "sealing",
    person: {
      firstName: "Matt",
      lastName: "Tunstall",
      fullName: "Matt Tunstall",
      email: "matt@recordpathai.com",
      phone: "8668219810",
      address1: "231 W Horizon Ridge Parkway",
      address2: "",
      city: "Henderson",
      state: "NV",
      zip: "89012",
      dob: ""
    },
    charges: [
      {
        id: "charge-1",
        chargeName: "Possession of Drugs",
        statute: "2925.11(A)",
        level: "Felony 3",
        disposition: "Guilty",
        arrestDate: "2006-01-01",
        convictionDate: "2007-05-04",
        sentencingDate: "2007-05-04",
        probationCompletedDate: "2010-05-07",
        jailCompletedDate: "",
        finePaid: true,
        restitutionPaid: true,
        victimInvolved: false,
        dismissed: false,
        sealedBefore: false
      }
    ],
    workflow: {
      status: "draft",
      eligibilityStatus: "unknown",
      eligibilityReason: "",
      reviewMode: "automatic",
      estimatedEligibleDate: "",
      packetReady: false
    },
    packet: {
      templateId: "",
      templatePath: "",
      outputFileName: "",
      signatureMode: "typed"
    },
    meta: {
      createdAt: "2026-04-08T00:00:00.000Z",
      updatedAt: "2026-04-08T00:00:00.000Z",
      source: "manual"
    }
  };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getValueByPath(obj, path) {
  if (!obj || !path) return "";

  const normalizedPath = path.replace(/\[(\d+)\]/g, ".$1");
  const parts = normalizedPath.split(".");
  let current = obj;

  for (const part of parts) {
    if (current == null) return "";
    current = current[part];
  }

  return current ?? "";
}

function flattenObject(obj, prefix = "", output = []) {
  if (obj === null || obj === undefined) {
    if (prefix) output.push({ path: prefix, value: "" });
    return output;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0 && prefix) {
      output.push({ path: prefix, value: [] });
      return output;
    }

    obj.forEach((item, index) => {
      const path = prefix ? `${prefix}[${index}]` : `[${index}]`;
      flattenObject(item, path, output);
    });

    return output;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj);

    if (!keys.length && prefix) {
      output.push({ path: prefix, value: {} });
      return output;
    }

    keys.forEach((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenObject(obj[key], path, output);
    });

    return output;
  }

  output.push({ path: prefix, value: obj });
  return output;
}

function formatPreview(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setPdfStatus(message, type = "muted") {
  els.pdfStatus.className = `status-box ${type}`;
  els.pdfStatus.textContent = message;
}

function renderPathList(paths) {
  if (!paths.length) {
    els.casePathList.className = "path-list empty-state";
    els.casePathList.textContent = "No paths discovered.";
    return;
  }

  els.casePathList.className = "path-list";
  els.casePathList.innerHTML = "";

  paths.forEach((item) => {
    const row = document.createElement("div");
    row.className = "path-item";

    const left = document.createElement("div");
    left.className = "path-name";
    left.textContent = item.path;

    const right = document.createElement("div");
    right.className = "path-value";
    right.textContent = formatPreview(item.value);

    row.appendChild(left);
    row.appendChild(right);
    els.casePathList.appendChild(row);
  });
}

function renderPdfFieldList(fields) {
  if (!fields.length) {
    els.pdfFieldList.className = "path-list empty-state";
    els.pdfFieldList.textContent = "No PDF fields detected.";
    return;
  }

  els.pdfFieldList.className = "path-list";
  els.pdfFieldList.innerHTML = "";

  fields.forEach((fieldName) => {
    const row = document.createElement("div");
    row.className = "pdf-field-item";

    const name = document.createElement("div");
    name.className = "pdf-field-name";
    name.textContent = fieldName;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "add-field-btn";
    button.textContent = "Add to Mapping";
    button.addEventListener("click", () => {
      createMappingRow(fieldName, guessCasePathForPdfField(fieldName));
    });

    row.appendChild(name);
    row.appendChild(button);
    els.pdfFieldList.appendChild(row);
  });
}

function getPathOptionsHtml(selectedValue = "") {
  const options = [`<option value="">Select path</option>`];

  currentPaths.forEach((item) => {
    const selected = item.path === selectedValue ? "selected" : "";
    options.push(
      `<option value="${escapeHtml(item.path)}" ${selected}>${escapeHtml(item.path)}</option>`
    );
  });

  return options.join("");
}

function createMappingRow(pdfFieldName = "", sourcePath = "") {
  const tr = document.createElement("tr");

  const previewValue =
    sourcePath && currentSampleCase
      ? formatPreview(getValueByPath(currentSampleCase, sourcePath))
      : "";

  tr.innerHTML = `
    <td>
      <input type="text" class="pdf-field-input" placeholder="full_name" value="${escapeHtml(pdfFieldName)}" />
    </td>
    <td>
      <select class="source-path-select">
        ${getPathOptionsHtml(sourcePath)}
      </select>
    </td>
    <td class="preview-cell">${escapeHtml(previewValue)}</td>
    <td>
      <button type="button" class="icon-btn remove-row-btn">Remove</button>
    </td>
  `;

  const select = tr.querySelector(".source-path-select");
  const previewCell = tr.querySelector(".preview-cell");
  const removeBtn = tr.querySelector(".remove-row-btn");

  select.addEventListener("change", () => {
    const value = getValueByPath(currentSampleCase, select.value);
    previewCell.textContent = formatPreview(value);
  });

  removeBtn.addEventListener("click", () => {
    tr.remove();
  });

  els.mappingTableBody.appendChild(tr);
}

function renderDefaultRows() {
  els.mappingTableBody.innerHTML = "";

  [
    ["full_name", "person.fullName"],
    ["address_1", "person.address1"],
    ["city", "person.city"],
    ["state", "person.state"],
    ["zip", "person.zip"],
    ["county", "county"],
    ["court_name", "court"],
    ["case_number", "caseNumber"],
    ["charge_1_name", "charges[0].chargeName"],
    ["charge_1_statute", "charges[0].statute"]
  ].forEach(([pdfFieldName, sourcePath]) => {
    createMappingRow(pdfFieldName, sourcePath);
  });
}

function buildTemplateRecord() {
  const record = {
    id: els.templateId.value.trim(),
    state: els.state.value.trim(),
    county: els.county.value.trim(),
    court: els.court.value.trim(),
    filingType: els.filingType.value.trim(),
    path: els.pdfPath.value.trim(),
    version: els.version.value.trim(),
    active: els.active.checked,
    priority: Number(els.priority.value || 0),
    fieldMapId: els.fieldMapId.value.trim(),
    matchMode: els.matchMode.value.trim()
  };

  const errors = [];

  if (!record.id) errors.push("Template ID is required.");
  if (!record.state) errors.push("State is required.");
  if (!record.filingType) errors.push("Filing type is required.");
  if (!record.path) errors.push("PDF path is required.");
  if (!record.fieldMapId) errors.push("Field Map ID is required.");

  if (errors.length) {
    alert(errors.join("\n"));
    return null;
  }

  els.templateOutput.value = JSON.stringify(record, null, 2);
  return record;
}

function buildFieldMap() {
  const rows = [...els.mappingTableBody.querySelectorAll("tr")];
  const map = {};
  const errors = [];

  rows.forEach((row, index) => {
    const pdfField = row.querySelector(".pdf-field-input").value.trim();
    const sourcePath = row.querySelector(".source-path-select").value.trim();

    if (!pdfField && !sourcePath) {
      return;
    }

    if (!pdfField) {
      errors.push(`Row ${index + 1}: PDF field name is required.`);
      return;
    }

    if (!sourcePath) {
      errors.push(`Row ${index + 1}: source path is required.`);
      return;
    }

    map[pdfField] = sourcePath;
  });

  if (errors.length) {
    alert(errors.join("\n"));
    return null;
  }

  const fieldMapId = els.fieldMapId.value.trim();
  if (!fieldMapId) {
    alert("Field Map ID is required before building the field map.");
    return null;
  }

  const wrapped = {
    [fieldMapId]: map
  };

  els.fieldMapOutput.value = JSON.stringify(wrapped, null, 2);
  return wrapped;
}

function loadSampleCase() {
  const parsed = safeJsonParse(els.sampleCaseJson.value);

  if (!parsed || typeof parsed !== "object") {
    alert("Invalid JSON. Please paste a valid sample case object.");
    return;
  }

  currentSampleCase = parsed;
  currentPaths = flattenObject(parsed);

  renderPathList(currentPaths);

  if (!els.state.value && parsed.state) {
    els.state.value = parsed.state;
  }

  if (!els.county.value && parsed.county) {
    els.county.value = parsed.county;
  }

  if (!els.court.value && parsed.court) {
    els.court.value = parsed.court;
  }

  if (!els.filingType.value && parsed.filingType) {
    els.filingType.value = parsed.filingType;
  }

  refreshMappingSelects();
}

function refreshMappingSelects() {
  const rows = [...els.mappingTableBody.querySelectorAll("tr")];

  rows.forEach((row) => {
    const select = row.querySelector(".source-path-select");
    const currentValue = select.value;
    select.innerHTML = getPathOptionsHtml(currentValue);

    const previewCell = row.querySelector(".preview-cell");
    previewCell.textContent = formatPreview(getValueByPath(currentSampleCase, select.value));
  });
}

function autoGenerateIds() {
  const state = els.state.value.trim().toLowerCase();
  const county = slugify(els.county.value);
  const filingType = slugify(els.filingType.value);
  const courtText = slugify(els.court.value);

  if (!state) {
    alert("Select a state first.");
    return;
  }

  const pieces = [state];

  if (county) {
    pieces.push(county);
  } else if (courtText) {
    pieces.push(courtText);
  }

  if (filingType) {
    pieces.push(filingType);
  }

  const base = pieces.join("-");
  els.templateId.value = base;
  els.fieldMapId.value = `${base}-v1`;

  if (!els.pdfPath.value && state && county && filingType) {
    els.pdfPath.value = `/assets/${state}/${county}/${filingType}.pdf`;
  }
}

function copyText(value, label) {
  if (!value) {
    alert(`Nothing to copy for ${label}.`);
    return;
  }

  navigator.clipboard.writeText(value)
    .then(() => alert(`${label} copied.`))
    .catch(() => alert(`Could not copy ${label}.`));
}

function guessCasePathForPdfField(fieldName) {
  const value = String(fieldName || "").toLowerCase().trim();

  const guessMap = [
    { includes: ["full_name", "fullname", "full name", "name_full"], path: "person.fullName" },
    { includes: ["first_name", "firstname", "first name"], path: "person.firstName" },
    { includes: ["last_name", "lastname", "last name"], path: "person.lastName" },
    { includes: ["email"], path: "person.email" },
    { includes: ["phone", "telephone"], path: "person.phone" },
    { includes: ["address_1", "address1", "street", "mailing_address"], path: "person.address1" },
    { includes: ["address_2", "address2", "apt", "unit"], path: "person.address2" },
    { includes: ["city"], path: "person.city" },
    { includes: ["zip", "zipcode", "postal"], path: "person.zip" },
    { includes: ["county"], path: "county" },
    { includes: ["court"], path: "court" },
    { includes: ["case_number", "case no", "case_no", "casenumber"], path: "caseNumber" },
    { includes: ["charge_1_name", "charge", "offense"], path: "charges[0].chargeName" },
    { includes: ["statute", "code_section"], path: "charges[0].statute" },
    { includes: ["level", "degree"], path: "charges[0].level" },
    { includes: ["disposition"], path: "charges[0].disposition" },
    { includes: ["conviction_date"], path: "charges[0].convictionDate" },
    { includes: ["sentencing_date"], path: "charges[0].sentencingDate" },
    { includes: ["probation_completed_date", "sentence_completed_date"], path: "charges[0].probationCompletedDate" }
  ];

  const match = guessMap.find((entry) =>
    entry.includes.some((token) => value.includes(token))
  );

  return match ? match.path : "";
}

function dedupeAndSortFields(fields) {
  return [...new Set(fields.filter(Boolean).map((name) => String(name).trim()))].sort(
    (a, b) => a.localeCompare(b)
  );
}

async function extractPdfFieldsFromBytes(bytes) {
  const { PDFDocument } = window.PDFLib;

  const pdfDoc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false
  });

  let form;
  try {
    form = pdfDoc.getForm();
  } catch (error) {
    return {
      ok: false,
      reason: "This PDF does not expose a readable AcroForm."
    };
  }

  let fields = [];
  try {
    fields = form.getFields().map((field) => field.getName());
  } catch (error) {
    return {
      ok: false,
      reason: "Could not read fields from this PDF."
    };
  }

  const cleaned = dedupeAndSortFields(fields);

  if (!cleaned.length) {
    return {
      ok: false,
      reason:
        "No fillable AcroForm fields were found. The PDF may be flat, scanned, or XFA-based."
    };
  }

  return {
    ok: true,
    fields: cleaned
  };
}

async function handleExtractPdfFields() {
  if (!currentPdfBytes) {
    alert("Upload a PDF first.");
    return;
  }

  if (!window.PDFLib) {
    setPdfStatus("pdf-lib did not load. Check your internet connection or bundle it locally.", "error");
    return;
  }

  setPdfStatus("Analyzing PDF fields...", "muted");

  try {
    const result = await extractPdfFieldsFromBytes(currentPdfBytes);

    if (!result.ok) {
      currentPdfFields = [];
      renderPdfFieldList([]);
      setPdfStatus(result.reason, "warning");
      return;
    }

    currentPdfFields = result.fields;
    renderPdfFieldList(currentPdfFields);
    setPdfStatus(`Detected ${currentPdfFields.length} PDF field(s).`, "success");
  } catch (error) {
    currentPdfFields = [];
    renderPdfFieldList([]);
    setPdfStatus(
      `Could not analyze PDF. ${error?.message || "Unknown error."}`,
      "error"
    );
  }
}

function clearPdfFields() {
  currentPdfFields = [];
  currentPdfBytes = null;
  els.pdfUpload.value = "";
  els.pdfFileName.value = "";
  renderPdfFieldList([]);
  setPdfStatus("PDF selection cleared.", "muted");
}

async function handlePdfUploadChange(event) {
  const file = event.target.files?.[0];

  if (!file) {
    currentPdfBytes = null;
    els.pdfFileName.value = "";
    return;
  }

  els.pdfFileName.value = file.name;

  const buffer = await file.arrayBuffer();
  currentPdfBytes = buffer;
  setPdfStatus("PDF loaded. Click Extract PDF Fields to inspect it.", "muted");
}

els.autoGenerateIdsBtn.addEventListener("click", autoGenerateIds);
els.buildTemplateBtn.addEventListener("click", buildTemplateRecord);
els.loadSampleBtn.addEventListener("click", loadSampleCase);
els.loadDemoBtn.addEventListener("click", () => {
  els.sampleCaseJson.value = JSON.stringify(getDemoCase(), null, 2);
  loadSampleCase();
});
els.addMappingRowBtn.addEventListener("click", () => createMappingRow("", ""));
els.buildFieldMapBtn.addEventListener("click", buildFieldMap);
els.copyTemplateBtn.addEventListener("click", () => {
  copyText(els.templateOutput.value, "Template record");
});
els.copyFieldMapBtn.addEventListener("click", () => {
  copyText(els.fieldMapOutput.value, "Field map");
});

els.pdfUpload.addEventListener("change", handlePdfUploadChange);
els.extractPdfFieldsBtn.addEventListener("click", handleExtractPdfFields);
els.clearPdfFieldsBtn.addEventListener("click", clearPdfFields);

renderDefaultRows();
els.sampleCaseJson.value = JSON.stringify(getDemoCase(), null, 2);
loadSampleCase();
buildTemplateRecord();
buildFieldMap();
renderPdfFieldList([]);
