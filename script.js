(function () {
  "use strict";

  // Cache DOM elements (guarded usage later)
  const form = document.getElementById("checkInForm");
  const nameInput = document.getElementById("attendeeName");
  const teamSelect = document.getElementById("teamSelect");
  const greetingEl = document.getElementById("greeting");
  const totalEl = document.getElementById("attendeeCount");
  const barEl = document.getElementById("progressBar");
  const waterCountEl = document.getElementById("waterCount");
  const zeroCountEl = document.getElementById("zeroCount");
  const powerCountEl = document.getElementById("powerCount");

  // App state
  const STORAGE_KEY = "intel-summit-checkin-state";
  const state = {
    total: 0,
    teams: { water: 0, netzero: 0, renewables: 0 },
    attendees: [], // newest-first
  };

  const teamLabels = {
    water: "Team Water Wise",
    netzero: "Team Net Zero",
    renewables: "Team Renewables",
  };

  // Find an attendee list (UL/OL) if the page provides one
  function getAttendeeListEl() {
    let list = document.querySelector("#attendeeList");
    if (list && (list.tagName === "UL" || list.tagName === "OL")) {
      return list;
    }
    list = document.querySelector(".attendee-list");
    if (list && (list.tagName === "UL" || list.tagName === "OL")) {
      return list;
    }
    const container = document.querySelector(".container");
    if (container) {
      const candidate = container.querySelector("ul, ol");
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  // Get goal (default 50, or from any element with data-goal)
  function getGoal() {
    let goal = 50;
    const el = document.querySelector("[data-goal]");
    if (el) {
      const parsed = parseInt(el.getAttribute("data-goal"), 10);
      if (!isNaN(parsed) && parsed > 0) {
        goal = parsed;
      }
    }
    return goal;
  }

  // Normalize select values to internal team keys
  function normalizeTeam(raw) {
    if (raw === "water") {
      return "water";
    }
    if (raw === "zero") {
      return "netzero";
    }
    if (raw === "power") {
      return "renewables";
    }
    return null;
  }

  // Small inline validation hint next to an input/select
  function showInlineHint(afterEl, message) {
    if (!afterEl) {
      return;
    }
    let hint = afterEl.parentNode.querySelector(".inline-hint");
    if (!hint) {
      hint = document.createElement("small");
      hint.className = "inline-hint";
      hint.style.color = "#ef4444";
      hint.style.marginLeft = "6px";
      // try to insert right after the control
      if (afterEl.nextSibling) {
        afterEl.parentNode.insertBefore(hint, afterEl.nextSibling);
      } else {
        afterEl.parentNode.appendChild(hint);
      }
    }
    hint.textContent = message;
  }

  function clearInlineHint(containerEl) {
    if (!containerEl) {
      return;
    }
    const hint = containerEl.parentNode
      ? containerEl.parentNode.querySelector(".inline-hint")
      : null;
    if (hint && hint.parentNode) {
      hint.parentNode.removeChild(hint);
    }
  }

  // Load from localStorage and hydrate UI
  function initFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        updateCountersUI();
        updateProgressUI();
        return;
      }
      const data = JSON.parse(raw);
      if (
        data &&
        typeof data.total === "number" &&
        data.teams &&
        data.attendees
      ) {
        state.total = data.total;
        state.teams.water = Number(data.teams.water) || 0;
        state.teams.netzero = Number(data.teams.netzero) || 0;
        state.teams.renewables = Number(data.teams.renewables) || 0;
        state.attendees = Array.isArray(data.attendees) ? data.attendees : [];
      }
    } catch (e) {
      // Ignore parse errors; start fresh
    }
    updateCountersUI();
    updateProgressUI();
    // Re-render attendee list (newest-first stored, so append in order)
    const listEl = getAttendeeListEl();
    if (listEl) {
      listEl.innerHTML = "";
      for (let i = 0; i < state.attendees.length; i++) {
        const item = state.attendees[i];
        if (item && item.name && item.team && teamLabels[item.team]) {
          renderAttendee(item.name, item.team);
        }
      }
    }
    maybeCelebrate();
  }

  // Save state to localStorage
  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage might be unavailable; ignore
    }
  }

  // Form submit handler
  function handleCheckIn(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (!form || !nameInput || !teamSelect) {
      return;
    }

    const rawName = nameInput.value ? nameInput.value.trim() : "";
    const rawTeam = teamSelect.value || "";
    const team = normalizeTeam(rawTeam);

    // Validate name
    clearInlineHint(nameInput);
    if (!rawName) {
      showInlineHint(nameInput, "Please enter a name.");
      nameInput.focus();
      return;
    }

    // Validate team
    clearInlineHint(teamSelect);
    if (!team) {
      showInlineHint(teamSelect, "Please select a team.");
      teamSelect.focus();
      return;
    }

    // Clear hints when valid
    clearInlineHint(nameInput);
    clearInlineHint(teamSelect);

    // Update state
    incrementCounts(team);
    // Store newest-first
    state.attendees.unshift({ name: rawName, team: team });
    saveToStorage();

    // UI updates
    renderGreeting(rawName);
    renderAttendee(rawName, team);
    maybeCelebrate();

    // Reset only the name for faster multiple check-ins
    nameInput.value = "";
    nameInput.focus();
  }

  // Increment total and per-team, then update UI
  function incrementCounts(team) {
    state.total += 1;
    if (state.teams.hasOwnProperty(team)) {
      state.teams[team] += 1;
    }
    updateCountersUI();
    updateProgressUI();
  }

  // Update counters in the DOM
  function updateCountersUI() {
    if (totalEl) {
      totalEl.textContent = String(state.total);
    }
    if (waterCountEl) {
      waterCountEl.textContent = String(state.teams.water);
    }
    if (zeroCountEl) {
      zeroCountEl.textContent = String(state.teams.netzero);
    }
    if (powerCountEl) {
      powerCountEl.textContent = String(state.teams.renewables);
    }
  }

  // Update progress bar width and ARIA
  function updateProgressUI() {
    if (!barEl) {
      return;
    }
    const goal = getGoal();
    const clampedGoal = goal > 0 ? goal : 50;
    const ratio = clampedGoal > 0 ? state.total / clampedGoal : 0;
    let pct = Math.round(ratio * 100);
    if (pct < 0) {
      pct = 0;
    }
    if (pct > 100) {
      pct = 100;
    }
    barEl.style.width = `${pct}%`;
    barEl.setAttribute("aria-valuenow", String(state.total));
    barEl.setAttribute("aria-valuemax", String(clampedGoal));
  }

  // Show "Welcome, <FirstName>!" in the greeting area
  function renderGreeting(fullName) {
    if (!greetingEl || !fullName) {
      return;
    }
    const first = fullName.trim().split(/\s+/)[0];
    greetingEl.textContent = `Welcome, ${first}!`;
    greetingEl.classList.add("success-message");
    greetingEl.style.display = "block";
  }

  // Append newest-first attendee item "<name> — <team>"
  function renderAttendee(name, team) {
    const listEl = getAttendeeListEl();
    if (!listEl || !name || !teamLabels[team]) {
      return;
    }
    const li = document.createElement("li");
    li.textContent = `${name} — ${teamLabels[team]}`;
    if (listEl.firstChild) {
      listEl.insertBefore(li, listEl.firstChild);
    } else {
      listEl.appendChild(li);
    }
  }

  // Compute leading team or tie
  function computeLeader() {
    const counts = state.teams;
    const vals = [
      { key: "water", val: counts.water },
      { key: "netzero", val: counts.netzero },
      { key: "renewables", val: counts.renewables },
    ];
    let max = -1;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i].val > max) {
        max = vals[i].val;
      }
    }
    const leaders = [];
    for (let j = 0; j < vals.length; j++) {
      if (vals[j].val === max) {
        leaders.push(vals[j].key);
      }
    }
    return {
      team: leaders.length === 1 ? leaders[0] : null,
      isTie: leaders.length > 1,
    };
  }

  // If goal reached, show celebration or tie message
  function maybeCelebrate() {
    const goal = getGoal();
    if (!greetingEl) {
      return;
    }
    if (state.total >= goal) {
      const result = computeLeader();
      if (result.isTie || !result.team) {
        greetingEl.textContent = `Goal reached! It's a tie. Great job, teams!`;
      } else {
        const label = teamLabels[result.team] || "the leading team";
        greetingEl.textContent = `Goal reached! ${label} is in the lead!`;
      }
      greetingEl.classList.add("success-message");
      greetingEl.style.display = "block";
    }
  }

  // Wire up event listeners
  function wireEvents() {
    if (!form) {
      return;
    }
    form.addEventListener("submit", handleCheckIn);
  }

  // Boot
  initFromStorage();
  wireEvents();
})();
