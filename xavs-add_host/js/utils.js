import { ROLES, DEPLOYMENT_ROLE } from "./constants.js";

/* ---------- Status helpers ---------- */
export function setStatus(el, msg, kind) {
  if (!el) return;
  el.textContent = msg || "";
  el.style.color =
    kind === "err" ? "#d9534f" :
    kind === "ok"  ? "#27ae60" :
    "#a9b0b7";
}

/* ---------- Validation ---------- */
export const isValidIPv4 = ip => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);

/* ---------- Roles UI ---------- */
export function renderRoleChips(container, roles, onRemove) {
  container.querySelectorAll(".role-tag").forEach(n => n.remove());
  (roles || []).forEach(r => {
    const chip = document.createElement("span");
    chip.className = "role-tag";
    chip.innerHTML = `${r} <span class="remove" title="Remove"><i class="fas fa-times"></i></span>`;
    
    const closeBtn = chip.querySelector('.remove');
    closeBtn.addEventListener("click", () => onRemove(r));
    
    const selectWrap = container.querySelector(".col-sm-10") || container;
    selectWrap.insertBefore(chip, selectWrap.firstChild);
  });
}

export function refreshSelectOptions(selectEl, chosenSet, hasDeploymentSomewhere) {
  [...selectEl.querySelectorAll("option:not([disabled])")].forEach(o => o.remove());
  ROLES.forEach(r => {
    if (chosenSet.has(r)) return;
    if (r === DEPLOYMENT_ROLE && hasDeploymentSomewhere) return;
    const opt = document.createElement("option");
    opt.value = r; opt.textContent = r;
    selectEl.appendChild(opt);
  });
  selectEl.value = "";
}

/* ---------- Ping helpers ---------- */
export function setPingState(btn, state) {
  btn.classList.remove("neutral","ok","err","loading");
  btn.classList.add(state);
  
  // Clear existing content
  btn.innerHTML = "";
  
  if (state === "loading") { 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pinging…'; 
    btn.disabled = true; 
  } else if (state === "ok") {
    btn.innerHTML = '<i class="fas fa-check text-success"></i> Ping';
    btn.disabled = false;
  } else if (state === "err") {
    btn.innerHTML = '<i class="fas fa-times text-danger"></i> Ping';
    btn.disabled = false;
  } else {
    btn.innerHTML = '<i class="fas fa-satellite-dish"></i> Ping';
    btn.disabled = false;
  }
}

export function attachPingBehavior(btn, getIP, isValid = isValidIPv4) {
  setPingState(btn, "neutral"); btn.disabled = true;

  function refreshEnabled() {
    const ip = (getIP() || "").trim();
    btn.disabled = !isValid(ip);
    if (btn.disabled) setPingState(btn, "neutral");
  }

  btn.addEventListener("click", () => {
    const ip = (getIP() || "").trim();
    if (!isValid(ip)) return;
    setPingState(btn, "loading");
    const cmd = `ping -c1 -W2 ${ip} >/dev/null 2>&1 && echo OK || echo FAIL`;
    cockpit.spawn(["bash","-lc", cmd], { superuser: "try" })
      .then(out => { if ((out||"").includes("OK")) setPingState(btn,"ok"); else setPingState(btn,"err"); })
      .catch(() => setPingState(btn,"err"));
  });

  // return control interface
  return { refreshEnabled };
}

/* ---------- Misc ---------- */
export function normalizeRoles(s) {
  if (!s) return [];
  const parts = s.split(/[|;, \t]+/).map(x => x.trim()).filter(Boolean);
  const set = new Set();
  for (const r of parts) if (ROLES.includes(r)) set.add(r);
  return Array.from(set);
}
