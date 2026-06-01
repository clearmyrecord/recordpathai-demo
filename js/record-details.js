(function () {
  const tr = (key, params) => window.t ? window.t(key, params) : key;

  const offenseList = document.getElementById("offenseList");
  const addOffenseBtn = document.getElementById("addOffenseBtn");
  const continueBtn = document.getElementById("continueBtn");
  const recordStatus = document.getElementById("recordStatus");

  const fallbackCharges = [
    "DUI",
    "Assault",
    "Drug Possession",
    "Disorderly Conduct",
    "Petty Theft",
    "Burglary"
  ];

  const states = [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
    "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
    "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
    "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
    "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
    "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
    "Virginia","Washington","West Virginia","Wisconsin","Wyoming"
  ];

  const dispositionOptions = [
    "Dismissed",
    "Not Guilty",
    "Guilty",
    "No Contest",
    "Deferred",
    "Reduced",
    "Vacated",
    "Sealed",
    "Expunged"
  ];

  const levelOptions = [
    "Misdemeanor",
    "Felony",
    "Infraction",
    "Traffic",
    "Citation"
  ];

  let offenseCounter = 0;
  let openBox = null;

  function normalizeChargeLibrary() {
    try {
      if (!Array.isArray(window.CHARGES)) return fallbackCharges.slice();
      const values = window.CHARGES
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item.name === "string") return item.name.trim();
          return "";
        })
        .filter(Boolean);
      return values.length ? Array.from(new Set(values)) : fallbackCharges.slice();
    } catch {
      return fallbackCharges.slice();
    }
  }

  const chargeLibrary = normalizeChargeLibrary();

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function debounce(fn, delay = 700) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function closeSuggestions() {
    if (openBox) {
      openBox.style.display = "none";
      openBox.innerHTML = "";
      openBox = null;
    }
  }

  function updateStatus() {
    const count = offenseList.querySelectorAll(".rd-offense").length;
    recordStatus.textContent = count === 1 ? tr("recordDetails.oneOffenseAdded") : tr("recordDetails.offensesAdded", { count });
  }

  function renumberOffenses() {
    offenseList.querySelectorAll(".rd-offense").forEach((card, index) => {
      const title = card.querySelector(".rd-offense-head h2");
      if (title) title.textContent = tr("recordDetails.offenseNumber", { number: index + 1 });
    });
  }

  function bindSuggestions(input, box, list) {
    let activeIndex = -1;
    let matches = [];

    function render(items) {
      matches = items;
      activeIndex = -1;

      if (!items.length) {
        box.style.display = "none";
        box.innerHTML = "";
        if (openBox === box) openBox = null;
        return;
      }

      box.innerHTML = items.map((item) => `<div class="rd-suggestion">${escapeHtml(item)}</div>`).join("");
      box.style.display = "block";
      openBox = box;

      box.querySelectorAll(".rd-suggestion").forEach((node, index) => {
        node.addEventListener("mousedown", function (e) {
          e.preventDefault();
          input.value = matches[index];
          box.style.display = "none";
          box.innerHTML = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      });
    }

    function filter(value) {
      const q = value.trim().toLowerCase();
      if (!q) return render([]);

      const starts = [];
      const includes = [];

      list.forEach((item) => {
        const t = String(item);
        const lower = t.toLowerCase();
        if (lower.startsWith(q)) starts.push(t);
        else if (lower.includes(q)) includes.push(t);
      });

      render([...starts, ...includes].slice(0, 8));
    }

    input.addEventListener("input", () => filter(input.value));
    input.addEventListener("focus", () => {
      if (input.value.trim()) filter(input.value);
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        box.style.display = "none";
        box.innerHTML = "";
      }, 140);
    });
  }

  function setHidden(card, name, value) {
    const field = card.querySelector(`input[name="${name}"]`);
    if (field) field.value = value || "";
  }

  async function findCourtPacket(card) {
    const court = card.querySelector('input[name^="court_"]').value.trim();
    const county = card.querySelector('input[name^="county_"]').value.trim();
    const state = card.querySelector('select[name^="state_"]').value.trim();
    const statusEl = card.querySelector(".court-packet-status");

    if (!court || !state) {
      statusEl.textContent = tr("recordDetails.searchPrompt");
      return;
    }

    statusEl.textContent = tr("recordDetails.searchingForms");

    try {
      const res = await fetch(
        `/api/find-packet?court=${encodeURIComponent(court)}&county=${encodeURIComponent(county)}&state=${encodeURIComponent(state)}&type=sealing`
      );

      if (!res.ok) throw new Error(tr("errors.searchFailed"));
      const data = await res.json();

      setHidden(card, `packet_url_${card.dataset.index}`, data.packetUrl || "");
      setHidden(card, `packet_title_${card.dataset.index}`, data.packetTitle || "");
      setHidden(card, `court_source_${card.dataset.index}`, data.source || "");
      setHidden(card, `court_match_confidence_${card.dataset.index}`, String(data.confidence || ""));
      setHidden(card, `packet_mapping_key_${card.dataset.index}`, data.mappingKey || "");

      if (data.packetUrl) {
        statusEl.innerHTML = `${escapeHtml(tr("recordDetails.foundPacket", { title: "" })).trim()} <a href="${data.packetUrl}" target="_blank" rel="noopener">${escapeHtml(data.packetTitle)}</a>`;
      } else {
        statusEl.textContent = tr("recordDetails.noPacket");
      }
    } catch (error) {
      console.error(error);
      statusEl.textContent = tr("recordDetails.packetSearchError");
    }
  }

  const debouncedPacketLookup = debounce(findCourtPacket, 700);

  function makeTextField({ label, name, placeholder = "", suggestions = null, full = false, type = "text" }) {
    const wrap = document.createElement("div");
    wrap.className = `rd-field${full ? " rd-field-full" : ""}`;
    const id = `${name}-${Math.random().toString(36).slice(2, 9)}`;

    wrap.innerHTML = `
      <label for="${id}">${escapeHtml(label)}</label>
      <input id="${id}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" />
      ${suggestions ? '<div class="rd-suggestions"></div>' : ""}
    `;

    if (suggestions) {
      const input = wrap.querySelector("input");
      const box = wrap.querySelector(".rd-suggestions");
      bindSuggestions(input, box, suggestions);
    }

    return wrap;
  }

  function makeTextareaField({ label, name, placeholder = "", full = false }) {
    const wrap = document.createElement("div");
    wrap.className = `rd-field${full ? " rd-field-full" : ""}`;
    const id = `${name}-${Math.random().toString(36).slice(2, 9)}`;

    wrap.innerHTML = `
      <label for="${id}">${escapeHtml(label)}</label>
      <textarea id="${id}" name="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}"></textarea>
    `;
    return wrap;
  }

  function makeStateField(index) {
    const wrap = document.createElement("div");
    wrap.className = "rd-field";
    const id = `state_${index}-${Math.random().toString(36).slice(2, 9)}`;
    wrap.innerHTML = `
      <label for="${id}">${escapeHtml(tr("common.state"))}</label>
      <select id="${id}" name="state_${index}">
        <option value="">${escapeHtml(tr("forms.selectState"))}</option>
        ${states.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
      </select>
    `;
    return wrap;
  }

  function makeCourtField(index) {
    const wrap = document.createElement("div");
    wrap.className = "rd-field";
    const id = `court_${index}-${Math.random().toString(36).slice(2, 9)}`;

    wrap.innerHTML = `
      <label for="${id}">${escapeHtml(tr("common.court"))}</label>
      <input id="${id}" name="court_${index}" type="text" placeholder="${escapeHtml(tr("recordDetails.courtPlaceholder"))}" autocomplete="off" />
      <div class="rd-helper court-packet-status">${escapeHtml(tr("recordDetails.searchPrompt"))}</div>

      <input type="hidden" name="packet_url_${index}" />
      <input type="hidden" name="packet_title_${index}" />
      <input type="hidden" name="court_source_${index}" />
      <input type="hidden" name="court_match_confidence_${index}" />
      <input type="hidden" name="packet_mapping_key_${index}" />
    `;

    return wrap;
  }

  function buildOffenseCard(index) {
    const card = document.createElement("section");
    card.className = "rd-offense";
    card.dataset.index = String(index);

    card.innerHTML = `
      <div class="rd-offense-head">
        <h2>${escapeHtml(tr("recordDetails.offenseNumber", { number: index + 1 }))}</h2>
        <button type="button" class="rd-btn rd-btn-secondary remove-offense-btn">${escapeHtml(tr("buttons.remove"))}</button>
      </div>
      <div class="rd-grid"></div>
    `;

    const grid = card.querySelector(".rd-grid");

    grid.appendChild(makeTextField({
      label: tr("recordDetails.chargeName"),
      name: `charge_name_${index}`,
      placeholder: tr("recordDetails.chargePlaceholder"),
      suggestions: chargeLibrary
    }));

    grid.appendChild(makeTextField({
      label: tr("recordDetails.dispositionOutcome"),
      name: `disposition_${index}`,
      placeholder: tr("recordDetails.dispositionPlaceholder"),
      suggestions: dispositionOptions
    }));

    grid.appendChild(makeTextField({
      label: tr("recordDetails.chargeLevel"),
      name: `charge_level_${index}`,
      placeholder: tr("recordDetails.levelPlaceholder"),
      suggestions: levelOptions
    }));

    grid.appendChild(makeTextField({
      label: tr("common.county"),
      name: `county_${index}`,
      placeholder: tr("recordDetails.countyPlaceholder")
    }));

    grid.appendChild(makeStateField(index));
    grid.appendChild(makeCourtField(index));

    grid.appendChild(makeTextField({
      label: tr("common.arrestDate"),
      name: `arrest_date_${index}`,
      type: "date"
    }));

    grid.appendChild(makeTextField({
      label: tr("common.caseNumber"),
      name: `case_number_${index}`,
      placeholder: tr("forms.optional")
    }));

    grid.appendChild(makeTextareaField({
      label: tr("common.description"),
      name: `notes_${index}`,
      placeholder: tr("recordDetails.notesPlaceholder"),
      full: true
    }));

    card.querySelector(".remove-offense-btn").addEventListener("click", function () {
      card.remove();
      renumberOffenses();
      updateStatus();
    });

    const searchHandler = () => debouncedPacketLookup(card);

    card.querySelector(`input[name="court_${index}"]`).addEventListener("input", searchHandler);
    card.querySelector(`input[name="county_${index}"]`).addEventListener("input", searchHandler);
    card.querySelector(`select[name="state_${index}"]`).addEventListener("change", searchHandler);

    return card;
  }

  function addOffense() {
    const card = buildOffenseCard(offenseCounter);
    offenseCounter += 1;
    offenseList.appendChild(card);
    updateStatus();
  }

  function collectData() {
    return Array.from(offenseList.querySelectorAll(".rd-offense")).map((card) => {
      const row = {};
      card.querySelectorAll("input, textarea, select").forEach((field) => {
        row[field.name] = field.value.trim();
      });
      return row;
    });
  }

  addOffenseBtn.addEventListener("click", addOffense);

  continueBtn.addEventListener("click", function () {
    const data = collectData();
    sessionStorage.setItem("recordPath_recordDetails", JSON.stringify(data));
    window.location.href = "packet.html";
  });

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".rd-field")) closeSuggestions();
  });

  window.addEventListener("recordpathai:languagechange", function () {
    renumberOffenses();
    updateStatus();
  });

  addOffense();
  updateStatus();
})();
