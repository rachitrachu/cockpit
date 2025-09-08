# XAVS Networking — Cockpit + Netplan (Phase 1, No-Baseline-Edit)

**Module**: `xavs_networking`  
**Objective**: Production‑grade lifecycle for physical NICs, VLANs, bridges, bonds, and static routes using Netplan, with **no edits** to `00-installer-config.yaml`, and **persistent** changes only.  
**Renderer**: `systemd-networkd` (server-grade).

---

## 0) Operating Principles

- **Single managed file**: Persist all XAVS changes into **`/etc/netplan/90-xavs.yaml`** (atomic writes: `*.new` → `rename()`).
- **Baseline is read-only**: Never modify or delete stanzas in `00-installer-config.yaml`. Treat it as authoritative for any interface it already defines.
- **No collisions**: **Do not re‑declare** a baseline‑managed interface in `90-xavs.yaml`. Netplan merges files in lexicographic order and: scalars override, but **lists concatenate** (addresses, routes, nameservers). That makes "replacement" unsafe if the same interface appears in both files.
- **Minimal blast radius**: All disruptive ops go through **`netplan try`** (visible countdown). Default rollback window is **120s**.
- **Renderer discipline**: `network.renderer: networkd` in `90-xavs.yaml`.
- **Locations & precedence**: Netplan considers `/lib`, `/etc`, `/run` (priority: `/run` > `/etc` > `/lib`) and merges files in lexicographic order across all locations. We only use `/etc`.

> **Implication of "no baseline edit"**  
> - We **can** safely **add** new logical L3 interfaces that don't exist in baseline (VLANs, new bridges, bonds on *unused* NICs, extra static routes on new interfaces).  
> - We **cannot** "convert" a baseline NIC (e.g., move IP off a physical NIC into a bridge/bond) because that requires removing IP/routes from the baseline stanza—which we're not allowed to edit. This is a direct consequence of Netplan's merge behavior (lists concatenate; you cannot clear a list from an earlier file).

---

## 1) Supported Operations (Phase 1)

**Always-persistent, in `90-xavs.yaml`:**

- **VLANs on any physical NIC (including baseline NICs)**  
  Add under `vlans:`; IP/DNS/Routes live on the VLAN interface, **not** the parent. This does not require editing the parent stanza.
- **Bridges**  
  Create bridges on NICs **not configured** by baseline (or on VLAN/bond devices we create). For baseline NICs that already carry IPs, **do not** bridge them (cannot remove their baseline IP). Use spare NICs.
- **Bonds**  
  Create bonds only from NICs **not configured** in baseline (or after the operator manually disables them outside of netplan). Assign IP/DNS/Routes to the **bond**, not its members. Members get no L3 in our file.
- **Static routes**  
  Add routes under the XAVS‑owned L3 interface (`routes: [{to, via, metric}]`). Use metrics to steer traffic relative to baseline defaults (DHCP defaults often come in at metric ~100).

**Explicitly not supported in phase 1 (due to baseline constraints):**

- Editing baseline NIC IP/DNS/Routes  
- Converting baseline NIC → bridge/bond  
- Removing baseline definitions

> If the operator wants to "migrate" a baseline NIC into an aggregate (bridge/bond), they must do that outside of this module (or in a planned maintenance where baseline is adjusted). Our UI should explain why and suggest using a spare NIC.

---

## 2) Canonical Modeling (for Copilot)

```ts
type IfaceName = string;
type Cidr = string; // "10.10.10.2/24"

type Nameservers = { addresses: string[]; search?: string[] };
type Route = { to: string; via?: string; metric?: number; on_link?: boolean };

type Ethernet = { kind:"ethernet"; name:IfaceName; dhcp4?:boolean; dhcp6?:boolean;
  addresses?: Cidr[]; nameservers?: Nameservers; routes?: Route[]; optional?: boolean };

type Vlan = { kind:"vlan"; name:IfaceName; id:number; link:IfaceName;
  dhcp4?:boolean; dhcp6?:boolean; addresses?: Cidr[]; nameservers?: Nameservers; routes?: Route[] };

type Bond = { kind:"bond"; name:IfaceName; interfaces:IfaceName[]; mode:"active-backup"|"802.3ad"|"balance-rr"|"balance-xor"|"broadcast"|"balance-tlb"|"balance-alb";
  dhcp4?:boolean; dhcp6?:boolean; addresses?: Cidr[]; nameservers?: Nameservers; routes?: Route[]; parameters?: Record<string, string|number|boolean> };

type Bridge = { kind:"bridge"; name:IfaceName; interfaces:IfaceName[];
  dhcp4?:boolean; dhcp6?:boolean; addresses?: Cidr[]; nameservers?: Nameservers; routes?: Route[] };

type Inventory = { ethernets:Record<IfaceName,Ethernet>; vlans:Record<IfaceName,Vlan>;
  bonds:Record<IfaceName,Bond>; bridges:Record<IfaceName,Bridge> };

type Ownership = "baseline"|"xavs"; // baseline=read-only, xavs=editable
```

## 3) Discovery & Governance

**Runtime**: `ip -json link`, `ip -json addr`, `ip -json route`, `bridge -json link`.

**On‑disk**: parse all `/etc/netplan/*.yaml` (don't touch them). Build:
- Per-file view and
- Merged effective view (informational only).

**Ownership map**: If an interface exists in `00-installer-config.yaml`, mark `baseline` (read-only). Anything created by us is `xavs`. If a name collision is detected, hard‑fail with guidance (do not rely on merges).

**Critical path detection**: Default route device from `ip route show default`. If a user tries to change/down anything that may flap the management path, force the `netplan try` workflow with a countdown modal.

> **Why we don't collide with baseline**  
> Netplan's multi-file behavior: across directories and filenames, it reads lexicographically, later files override scalars but append lists (addresses/routes/DNS). That makes surgical "replacements" unsafe for interfaces already defined in baseline. We avoid this entirely by never re-declaring baseline interfaces.

---

## 4) Authoring Rules (YAML)

**File header:**
```yaml
# Managed by XAVS Networking (Cockpit). Do not edit manually.
network:
  version: 2
  renderer: networkd
  ethernets: {}
  bonds: {}
  bridges: {}
  vlans: {}
```

**VLAN (safe on baseline NICs):**
```yaml
vlans:
  eno1.15:         # name is the device name to create
    id: 15
    link: eno1     # parent can be a baseline NIC
    addresses: [10.3.99.5/24]
    routes:
      - to: default
        via: 10.3.99.1
```
(Assign IP/route on the VLAN itself; parent carries no additional L3 from us.)

**Bond (only on spare NICs not in baseline):**
```yaml
bonds:
  bond0:
    interfaces: [enp4s0, enp5s0]
    parameters: { mode: active-backup, primary: enp4s0 }
    dhcp4: true
# Do not declare L3 on members (and don't redeclare members if baseline owns them).
```

**Bridge (only on NICs not configured in baseline, or on XAVS-created VLAN/Bond):**
```yaml
ethernets:
  enp6s0: { dhcp4: no }   # only if enp6s0 is NOT in baseline
bridges:
  br0:
    interfaces: [enp6s0]
    dhcp4: yes
```

**Static routes & route preference:**
```yaml
ethernets:
  enp7s0:
    addresses: [10.0.0.10/24]
    routes:
      - to: default
        via: 10.0.0.1
        metric: 50
# DHCP defaults typically come with metric ~100; lower metric wins.
```

Or prefer between two DHCP links using `dhcp4-overrides.route-metric`.

**Boot waits**: For non‑critical member ports (bond/bridge), set `optional: true` to avoid boot delays waiting for link (don't mark primary management interface as optional).

---

## 5) Safe Apply Orchestration

1) Write `/etc/netplan/90-xavs.yaml.new` → `fsync` → rename to `90-xavs.yaml`
2) Validate: `netplan generate --debug`
3) Trial: `netplan try --timeout <ui_timeout_seconds>` # default 120s
   - UI countdown + prominent warning if mgmt path touched
   - If confirmed in time → proceed
   - If not confirmed → auto-rollback
4) Finalize: `netplan apply`

> `netplan try` applies temporarily and reverts if not confirmed within 120s; great for remote Cockpit sessions.

---

## 6) Deletions & Runtime Hygiene

**Delete**: Remove stanza from `90-xavs.yaml`, then `netplan try`. If you need immediate runtime cleanup (e.g., VLAN/bridge device still present), `ip link delete <iface>` post‑apply.

**Up/Down toggle (transient)**: `ip link set <iface> up|down` with a UI badge "Transient (not persisted)". Persistent disable = delete stanza + apply.

**Dependency checks**: Block deletion of a parent if there are dependent VLANs/bridges; show dependency graph.

---

## 7) UX Contract (Cockpit)

**Inventory pane**: Groups by type (Ethernet, VLAN, Bond, Bridge). Show status, IPs, DHCP/static, and a "Default route" badge.

**Badges**: `baseline` (read‑only) vs `xavs` (editable).

**Modals**: Add/Edit/Delete per type with schema‑driven forms (IDs, link parent, addresses, routes, metrics, nameservers, optional flags).

**Diff preview**: Render diff of `90-xavs.yaml` before try/apply.

**Critical operation banner**: If default route/management iface might flap, force the try path with a clear countdown and instructions.

---

## 8) Phase 2 Preview (deferred)

**Policy-based routing**: Expose `routing-policy` + per‑interface routes with `table:` to implement source-based routing. (Backed by systemd `[RoutingPolicyRule]` options; ensure explicit priority ordering.)

**Virtual/tunnels**: WireGuard, GRE, VXLAN, etc., under `tunnels` (later).

---

## 9) Risk Register & Mitigations

**Why no edits to baseline**: preserves installer defaults and reduces change surface.

**Why "no collisions"**: Netplan concatenates lists on later files; trying to "override" addresses/routes/DNS on a baseline-owned interface risks duplicates or residuals. We avoid redeclaration entirely.

**Loss of VLAN IPs**: Fixed by ensuring VLAN IP/Routes are always set on the VLAN interface (never on the parent), with deterministic YAML emission.

**Route preservation**: All static routes live in our YAML under the owning interface. Multiple defaults are controlled via metric and `dhcp4-overrides.route-metric`.

---

## Minimal stubs (so Copilot fills in the rest)

> Place under `xavs_networking/js/`. These are intentionally terse—Copilot will expand from the spec.

**`js/run.js`**
```js
export function run(cmd, opts = {}) {
  return cockpit.spawn(["bash","-lc", cmd], { superuser: "try", ...opts })
    .then(out => String(out))
    .catch(e => { throw new Error(e.message || String(e)); });
}
```

**`js/discover.js`**
```js
import { run } from "./run.js";

export async function discover() {
  const [links, addrs, routes] = await Promise.all([
    run("ip -json link"), run("ip -json addr"), run("ip -json route")
  ]);
  // parse YAML files under /etc/netplan (read-only), build:
  // 1) per-file map; 2) merged effective view; 3) ownership map: baseline vs xavs
  // Never propose editing baseline-owned interfaces.
  return { links: JSON.parse(links), addrs: JSON.parse(addrs), routes: JSON.parse(routes) };
}
```

**`js/writer.js`**
```js
import yaml from "https://cdn.skypack.dev/js-yaml@4.1.0";

export function emitXavsYaml(inventory) {
  const doc = {
    network: {
      version: 2,
      renderer: "networkd",
      ethernets: {},
      bonds: {},
      bridges: {},
      vlans: {},
    }
  };
  // Only emit XAVS-owned interfaces; never re-declare baseline ones.
  for (const [n, v] of Object.entries(inventory.ethernets || {})) doc.network.ethernets[n] = v;
  for (const [n, v] of Object.entries(inventory.bonds || {}))     doc.network.bonds[n]     = v;
  for (const [n, v] of Object.entries(inventory.bridges || {}))   doc.network.bridges[n]   = v;
  for (const [n, v] of Object.entries(inventory.vlans || {}))     doc.network.vlans[n]     = v;
  return yaml.dump(doc, { lineWidth: 120, noRefs: true });
}
```

**`js/apply.js`**
```js
import { run } from "./run.js";

export async function applyPersistently(yamlStr, tryTimeoutSec = 120) {
  await run(`install -m 600 /dev/stdin /etc/netplan/90-xavs.yaml.new <<'EOF'\n${yamlStr}\nEOF`);
  await run("sync && mv /etc/netplan/90-xavs.yaml.new /etc/netplan/90-xavs.yaml");
  await run("netplan generate --debug");
  // Trial apply with rollback window
  await run(`netplan try --timeout ${tryTimeoutSec}`);
  // If the UI confirms continuity (or we got explicit confirm), finalize
  await run("netplan apply");
}
```

**`js/guardrails.js`**
```js
export function canBridge(nic)  { return !nic.isBaselineOwned && nic.isUnused; }
export function canBond(nics)   { return nics.every(n => !n.isBaselineOwned && n.isUnused); }
export function canVlan(nic)    { return true; } // safe even on baseline NICs
export function canEdit(nic)    { return !nic.isBaselineOwned; }
```

## Why this works

- We never collide with baseline because we never re‑declare those stanzas; this sidesteps Netplan's merge semantics that would otherwise append lists (addresses/routes/DNS) and surprise you.
- VLANs attach cleanly to a parent without modifying it; IPs/routes live on the VLAN interface.
- Bonds/Bridges are only built on unused NICs so we don't need to strip L3 from baseline—keeping us compliant with "no baseline edits."
- Safe apply uses `netplan try` with the documented 120‑second rollback SLA to avoid lockouts during remote Cockpit sessions.
- Persistent by definition (we only write in `/etc/netplan`, no `/run` tricks). Precedence and ordering are per Netplan's documented rules.

## Targeted questions (so we can right‑size the guardrails)

1. **Baseline scope**: Can we treat any baseline‑managed interface as read‑only in the UI (i.e., disable "Convert to bond/bridge" and "Edit IP" actions there)?

2. **Route preemption**: Are we allowed to introduce a new default route on an XAVS‑managed interface (lower metric) to effectively take over from baseline's default—without editing baseline? This is safe and reversible via our file only.

3. **Spare NIC inventory**: Should we auto‑discover spare NICs (no addresses, no baseline stanzas) and surface them as "Available for bond/bridge" to streamline operator workflow?
