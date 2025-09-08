# **Complete Storage Management Module Development SOP**
*Comprehensive Guide for Building a Full-Featured Storage Module Like Storaged*

## **1. Module Overview and Architecture**

### **1.1 Feature Set Requirements**
This SOP covers developing a complete storage management module with the following capabilities:

**Core Storage Technologies:**
- Block device management
- File system operations
- Partition management
- Drive monitoring and SMART data

**Advanced Storage Features:**
- LVM2 (Logical Volume Management)
- MDRAID (Software RAID)
- BTRFS filesystem management
- Stratis storage management
- VDO (Virtual Data Optimizer)

**Network Storage:**
- NFS (Network File System) mounts
- iSCSI (Internet SCSI) sessions
- Remote storage connectivity

**Security Features:**
- LUKS encryption
- Clevis/Tang network-bound disk encryption
- Key management

**Monitoring and Analytics:**
- Real-time I/O performance graphs
- Storage usage monitoring
- Job progress tracking
- System integration logs

### **1.2 System Integration Points**
- **UDisks2**: Primary storage management D-Bus service
- **systemd**: Service management and process monitoring
- **PackageKit**: Package installation for storage features
- **Python Backend**: System operations and monitoring scripts
- **Real-time Metrics**: Performance monitoring integration

## **2. Project Structure and Organization**

### **2.1 Complete Directory Structure**
```
pkg/storage-manager/
├── manifest.json                     # Module configuration
├── index.html                       # Main entry point
├── storage-manager.jsx              # Main application
├── client.js                        # Backend integration client
├── pages.jsx                        # Navigation framework
├── utils.js                         # Shared utilities
├── dialog.jsx                       # Dialog framework
├── storage-manager.scss             # Main styles
├── plot.jsx                         # Performance monitoring
├── jobs-panel.jsx                   # Background job tracking
├── logs-panel.jsx                   # System logs integration
├── multipath.jsx                    # Multipath device handling
├── storage-controls.jsx             # Reusable UI components
├── test-util.js                     # Unit tests
│
├── overview/                        # Main dashboard
│   └── overview.jsx
│
├── block/                           # Block device management
│   ├── actions.jsx                  # Block device operations
│   ├── create-pages.jsx             # Page creation helpers
│   ├── format-dialog.jsx            # Formatting dialogs
│   ├── other.jsx                    # Other device types
│   ├── resize.jsx                   # Resize operations
│   ├── unformatted-data.jsx         # Raw device handling
│   └── unrecognized-data.jsx        # Unknown device types
│
├── drive/                           # Physical drive management
│   ├── drive.jsx                    # Drive overview
│   └── smart-details.jsx            # SMART monitoring
│
├── filesystem/                      # File system operations
│   ├── filesystem.jsx               # FS management
│   ├── mismounting.jsx              # Mount issues
│   ├── mounting-dialog.jsx          # Mount/unmount dialogs
│   └── utils.jsx                    # FS utilities
│
├── partitions/                      # Partition management
│   ├── actions.jsx                  # Partition operations
│   ├── format-disk-dialog.jsx       # Disk formatting
│   ├── partition-table.jsx          # Partition table display
│   └── partition.jsx                # Individual partitions
│
├── lvm2/                           # LVM management
│   ├── block-logical-volume.jsx     # LV on block devices
│   ├── create-dialog.jsx            # VG creation
│   ├── create-logical-volume-dialog.jsx # LV creation
│   ├── inactive-logical-volume.jsx  # Inactive LVs
│   ├── physical-volume.jsx          # Physical volumes
│   ├── thin-pool-logical-volume.jsx # Thin pools
│   ├── unsupported-logical-volume.jsx # Unsupported LVs
│   ├── utils.jsx                    # LVM utilities
│   ├── vdo-pool.jsx                 # VDO pools
│   └── volume-group.jsx             # Volume groups
│
├── mdraid/                         # RAID management
│   ├── create-dialog.jsx            # RAID creation
│   ├── mdraid-disk.jsx              # RAID member disks
│   └── mdraid.jsx                   # RAID array management
│
├── crypto/                         # Encryption management
│   ├── actions.jsx                  # Crypto operations
│   ├── clevis-luks-passphrase.sh    # Clevis integration
│   ├── encryption.jsx               # LUKS management
│   ├── keyslots.jsx                 # Key slot management
│   ├── locked-encrypted-data.jsx    # Locked device handling
│   ├── luksmeta-monitor-hack.py     # LUKS metadata monitoring
│   └── tang.jsx                     # Tang server integration
│
├── btrfs/                          # BTRFS management
│   ├── btrfs-tool.py                # BTRFS operations script
│   ├── device.jsx                   # BTRFS devices
│   ├── filesystem.jsx               # BTRFS filesystems
│   ├── subvolume.jsx                # Subvolume management
│   ├── utils.jsx                    # BTRFS utilities
│   └── volume.jsx                   # BTRFS volumes
│
├── stratis/                        # Stratis management
│   ├── blockdev.jsx                 # Stratis block devices
│   ├── create-dialog.jsx            # Pool creation
│   ├── filesystem.jsx               # Stratis filesystems
│   ├── pool.jsx                     # Active pools
│   ├── stopped-pool.jsx             # Stopped pools
│   ├── stratis3-set-key.py          # Key management
│   ├── stratis3-start-pool.py       # Pool startup
│   └── utils.jsx                    # Stratis utilities
│
├── nfs/                            # NFS management
│   ├── nfs-mounts.py                # NFS mount monitoring
│   └── nfs.jsx                      # NFS mount management
│
├── iscsi/                          # iSCSI management
│   ├── create-dialog.jsx            # iSCSI discovery
│   └── session.jsx                  # iSCSI sessions
│
├── swap/                           # Swap management
│   └── swap.jsx                     # Swap space handling
│
├── legacy-vdo/                     # VDO management
│   ├── legacy-vdo.jsx               # VDO volumes
│   └── vdo-monitor.py               # VDO monitoring
│
└── icons/                          # Icon components
    └── gnome-icons.jsx              # System icons
```

## **3. Core Module Configuration**

### **3.1 Enhanced manifest.json**
```json
{
    "name": "storage-manager",
    "requires": {
        "cockpit": "266"
    },
    "conditions": [
        {"path-exists": "/usr/share/dbus-1/system.d/org.freedesktop.UDisks2.conf"}
    ],
    "menu": {
        "index": {
            "label": "Storage Manager",
            "order": 30,
            "docs": [
                {
                    "label": "Managing partitions",
                    "url": "https://docs.example.com/partitions"
                },
                {
                    "label": "Managing NFS mounts", 
                    "url": "https://docs.example.com/nfs"
                },
                {
                    "label": "Managing RAIDs",
                    "url": "https://docs.example.com/raid"
                },
                {
                    "label": "Managing LVMs",
                    "url": "https://docs.example.com/lvm"
                },
                {
                    "label": "Physical drive management",
                    "url": "https://docs.example.com/drives"
                },
                {
                    "label": "VDO management",
                    "url": "https://docs.example.com/vdo"
                },
                {
                    "label": "LUKS encryption",
                    "url": "https://docs.example.com/luks"
                },
                {
                    "label": "Tang server integration",
                    "url": "https://docs.example.com/tang"
                }
            ],
            "keywords": [
                {
                    "matches": [
                        "filesystem", "partition", "nfs", "raid", "volume", 
                        "disk", "vdo", "iscsi", "drive", "mount", "unmount", 
                        "udisks", "mkfs", "format", "fstab", "lvm2", "luks", 
                        "encryption", "nbde", "tang", "btrfs", "stratis", 
                        "storage", "block", "crypto", "swap"
                    ]
                }
            ]
        }
    }
}
```

### **3.2 Main Application (storage-manager.jsx)**
```jsx
import '../lib/patternfly/patternfly-6-cockpit.scss';
import 'polyfills';
import 'cockpit-dark-theme';

import cockpit from "cockpit";
import React from "react";
import { createRoot } from 'react-dom/client';
import { ExclamationCircleIcon } from "@patternfly/react-icons";

import { EmptyStatePanel } from "cockpit-components-empty-state.jsx";
import { PlotState } from "plot.js";

import client from "./client";
import { update_plot_state } from "./plot.jsx";
import { StorageManagerPage } from "./pages.jsx";

import "./storage-manager.scss";

const _ = cockpit.gettext;

class Application extends React.Component {
    constructor() {
        super();
        this.state = { 
            inited: false, 
            slow_init: false, 
            path: cockpit.location.path 
        };
        this.plot_state = new PlotState();
        this.on_client_changed = () => { 
            if (!client.busy) this.setState({}); 
        };
        this.on_navigate = () => { 
            this.setState({ path: cockpit.location.path }) 
        };
    }

    componentDidMount() {
        client.addEventListener("changed", this.on_client_changed);
        cockpit.addEventListener("locationchanged", this.on_navigate);
        client.init(() => { this.setState({ inited: true }) });
        window.setTimeout(() => { 
            if (!this.state.inited) 
                this.setState({ slow_init: true }); 
        }, 1000);
    }

    componentWillUnmount() {
        client.removeEventListener("changed", this.on_client_changed);
        cockpit.removeEventListener("locationchanged", this.on_navigate);
    }

    render() {
        const { inited, slow_init, path } = this.state;

        if (!inited) {
            if (slow_init)
                return <EmptyStatePanel loading title={ _("Loading...") } />;
            else
                return null;
        }

        if (client.features == false || client.younger_than("2.6"))
            return <EmptyStatePanel 
                icon={ExclamationCircleIcon} 
                title={ _("Storage cannot be managed on this system.") } />;

        // Maintain plot state for performance monitoring
        update_plot_state(this.plot_state, client);

        return <StorageManagerPage location={path} plot_state={this.plot_state} />;
    }
}

function init() {
    const root = createRoot(document.getElementById('storage-manager'));
    root.render(<Application />);
    document.body.removeAttribute("hidden");

    window.addEventListener('beforeunload', event => {
        if (client.busy) {
            event.preventDefault();
            event.returnValue = '';
            return '';
        }
    });
}

document.addEventListener("DOMContentLoaded", init);
```

## **4. Comprehensive Client Architecture**

### **4.1 Enhanced client.js Structure**
```javascript
import cockpit from 'cockpit';
import * as PK from 'packagekit';
import { superuser } from 'superuser';
import { get_manifest_config_matchlist } from 'utils';

import * as utils from './utils.js';
import * as python from "python.js";
import { read_os_release } from "os-release.js";

// Import Python scripts
import inotify_py from "inotify.py";
import mount_users_py from "./mount-users.py";
import nfs_mounts_py from "./nfs/nfs-mounts.py";
import vdo_monitor_py from "./legacy-vdo/vdo-monitor.py";
import stratis3_set_key_py from "./stratis/stratis3-set-key.py";
import btrfs_tool_py from "./btrfs/btrfs-tool.py";
import luksmeta_monitor_hack_py from "./crypto/luksmeta-monitor-hack.py";

// Page management imports
import { reset_pages } from "./pages.jsx";
import { make_overview_page } from "./overview/overview.jsx";

const client = {
    busy: 0,
    features: {},
    
    // Storage data structures
    drives: {},
    drives_block: {},
    drives_iscsi_session: {},
    blocks: {},
    mdraids: {},
    vgroups: {},
    stratis_pools: {},
    stratis_manager: { StoppedPools: {} },
    iscsi_sessions: {},
    iscsi_sessions_drives: {},
    uuids_btrfs_volume: {},
    
    // NFS integration
    nfs: {
        entries: [],
        start: () => { /* NFS monitoring start */ },
        entry_users: (entry) => { /* Get NFS users */ }
    },
    
    // VDO integration  
    vdo: {
        volumes: {}
    }
};

cockpit.event_target(client);

// Busy state management
client.run = async (func) => {
    const prom = func() || Promise.resolve();
    client.busy += 1;
    await prom.finally(() => {
        client.busy -= 1;
        client.dispatchEvent("changed");
    });
};

// Superuser integration
client.superuser = superuser;
client.superuser.reload_page_on_change();
client.superuser.addEventListener("changed", () => 
    client.dispatchEvent("changed"));

// Feature detection
client.features = {
    lvm2: false,
    stratis: false,
    nfs: false,
    iscsi: false,
    btrfs: false,
    vdo: false,
    packagekit: false
};

// System capability detection
client.detect_features = () => {
    // Detect available storage technologies
    client.features.lvm2 = /* Check for LVM2 */;
    client.features.stratis = /* Check for Stratis */;
    client.features.nfs = /* Check for NFS */;
    client.features.iscsi = /* Check for iSCSI */;
    client.features.btrfs = /* Check for BTRFS */;
    client.features.vdo = /* Check for VDO */;
    client.features.packagekit = /* Check for PackageKit */;
};

// Configuration management
client.get_config = (key, default_value) => {
    // Get configuration values
    return default_value;
};

// Version checking
client.younger_than = (version) => {
    // Check if system is older than specified version
    return false;
};

// UDisks2 integration
client.init_udisks = () => {
    // Set up UDisks2 D-Bus connections
    // Monitor block devices, drives, filesystems, etc.
};

// Job monitoring
client.jobs = {};
client.init_job_monitoring = () => {
    // Monitor background operations
};

// Metrics and monitoring
client.init_metrics = () => {
    // Set up performance monitoring
};

// Python script execution
client.run_python_script = async (script, args = []) => {
    return python.spawn(script, args, { superuser: "try" });
};

// Stratis integration
client.stratis_start = async () => {
    // Start Stratis daemon
    return cockpit.spawn(["systemctl", "start", "stratisd"], { superuser: "require" });
};

// Main initialization
client.init = (callback) => {
    Promise.all([
        client.detect_features(),
        client.init_udisks(),
        client.init_job_monitoring(),
        client.init_metrics()
    ]).then(() => {
        if (callback) callback();
    });
};

export default client;
```

### **4.2 Key Client Methods**

#### **Storage Operations**
```javascript
// Block device operations
client.format_device = async (device, filesystem, options) => {
    return client.run(async () => {
        // Implementation for device formatting
    });
};

client.mount_device = async (device, mount_point, options) => {
    return client.run(async () => {
        // Implementation for mounting
    });
};

// LVM operations
client.create_volume_group = async (name, devices) => {
    return client.run(async () => {
        // Implementation for VG creation
    });
};

client.create_logical_volume = async (vg, name, size) => {
    return client.run(async () => {
        // Implementation for LV creation
    });
};

// RAID operations
client.create_mdraid = async (devices, level, name) => {
    return client.run(async () => {
        // Implementation for RAID creation
    });
};

// Encryption operations
client.format_luks = async (device, passphrase, options) => {
    return client.run(async () => {
        // Implementation for LUKS formatting
    });
};

client.unlock_luks = async (device, passphrase) => {
    return client.run(async () => {
        // Implementation for LUKS unlocking
    });
};
```

## **5. Performance Monitoring Integration**

### **5.1 Enhanced plot.jsx**
```jsx
import cockpit from "cockpit";
import React from "react";

import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid/index.js";
import { ZoomControls, SvgPlot, bytes_per_sec_config } from "cockpit-components-plot.jsx";

import { decode_filename, get_other_devices } from "./utils.js";

const _ = cockpit.gettext;

// Metrics definitions
const metrics = {
    read_bytes: {
        direct: ["disk.all.read_bytes"],
        internal: ["disk.all.read"],
        units: "bytes",
        derive: "rate",
        threshold: 1000
    },
    write_bytes: {
        direct: ["disk.all.write_bytes"], 
        internal: ["disk.all.written"],
        units: "bytes",
        derive: "rate",
        threshold: 1000
    },
    read_ops: {
        direct: ["disk.all.read"],
        internal: ["disk.all.read_ops"],
        units: "ops",
        derive: "rate"
    },
    write_ops: {
        direct: ["disk.all.write"],
        internal: ["disk.all.write_ops"],
        units: "ops", 
        derive: "rate"
    },
    device_read_bytes: {
        direct: "disk.dev.read_bytes",
        internal: "block.device.read",
        units: "bytes",
        derive: "rate",
        threshold: 1000
    },
    device_write_bytes: {
        direct: "disk.dev.write_bytes",
        internal: "block.device.written", 
        units: "bytes",
        derive: "rate",
        threshold: 1000
    }
};

export function update_plot_state(ps, client) {
    const devs = [];

    // Collect all storage devices for monitoring
    const blocks = Object.keys(client.drives).map(p => client.drives_block[p])
            .concat(get_other_devices(client).map(p => client.blocks[p]));

    blocks.forEach(block => {
        const dev = block && decode_filename(block.Device).replace(/^\/dev\//, "");
        if (dev) devs.push(dev);
    });

    // Choose between aggregate or per-device monitoring based on device count
    if (devs.length > 10) {
        ps.plot_single('read', metrics.read_bytes);
        ps.plot_single('write', metrics.write_bytes);
        ps.plot_single('read_ops', metrics.read_ops);
        ps.plot_single('write_ops', metrics.write_ops);
    } else {
        ps.plot_instances('read', metrics.device_read_bytes, devs);
        ps.plot_instances('write', metrics.device_write_bytes, devs);
    }
}

export const StoragePlots = ({ plot_state }) => {
    return (
        <>
            <Split>
                <SplitItem isFilled />
                <SplitItem><ZoomControls plot_state={plot_state} /></SplitItem>
            </Split>
            <Grid sm={12} md={6} lg={6} hasGutter>
                <GridItem>
                    <SvgPlot className="storage-graph"
                             title={_("Read Operations")} 
                             config={bytes_per_sec_config}
                             plot_state={plot_state} 
                             plot_id='read' />
                </GridItem>
                <GridItem>
                    <SvgPlot className="storage-graph"
                             title={_("Write Operations")}
                             config={bytes_per_sec_config}
                             plot_state={plot_state}
                             plot_id='write' />
                </GridItem>
            </Grid>
        </>
    );
};
```

## **6. Job Management and Monitoring**

### **6.1 Enhanced jobs-panel.jsx**
```jsx
import cockpit from "cockpit";
import React from "react";

import { CardBody } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { DataList, DataListCell, DataListItem, DataListItemCells, DataListItemRow } from "@patternfly/react-core/dist/esm/components/DataList/index.js";
import { Progress, ProgressMeasureLocation } from "@patternfly/react-core/dist/esm/components/Progress/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";

import { StorageButton } from "./storage-controls.jsx";
import { block_name, mdraid_name, lvol_name, format_delay } from "./utils.js";

const _ = cockpit.gettext;

// Comprehensive job operation descriptions
const job_descriptions = {
    // Block device operations
    'ata-smart-selftest': _("SMART self-test of $target"),
    'drive-eject': _("Ejecting $target"),
    'drive-detach': _("Detaching $target"),
    
    // Encryption operations
    'encrypted-unlock': _("Unlocking $target"),
    'encrypted-lock': _("Locking $target"),
    'encrypted-modify': _("Modifying encryption on $target"),
    'encrypted-resize': _("Resizing encrypted $target"),
    
    // Filesystem operations
    'filesystem-mount': _("Mounting $target"),
    'filesystem-unmount': _("Unmounting $target"),
    'filesystem-modify': _("Modifying filesystem on $target"),
    'filesystem-repair': _("Repairing filesystem on $target"),
    'filesystem-create': _("Creating filesystem on $target"),
    'filesystem-resize': _("Resizing filesystem on $target"),
    
    // Swap operations
    'swapspace-start': _("Starting swapspace $target"),
    'swapspace-stop': _("Stopping swapspace $target"),
    
    // LVM operations  
    'lvm-vg-create': _("Creating volume group $target"),
    'lvm-vg-delete': _("Deleting volume group $target"),
    'lvm-vg-modify': _("Modifying volume group $target"),
    'lvm-lv-create': _("Creating logical volume $target"),
    'lvm-lv-delete': _("Deleting logical volume $target"),
    'lvm-lv-modify': _("Modifying logical volume $target"),
    'lvm-lv-resize': _("Resizing logical volume $target"),
    
    // RAID operations
    'mdraid-create': _("Creating RAID $target"),
    'mdraid-delete': _("Deleting RAID $target"),
    'mdraid-modify': _("Modifying RAID $target"),
    'mdraid-repair': _("Repairing RAID $target"),
    'mdraid-start': _("Starting RAID $target"),
    'mdraid-stop': _("Stopping RAID $target"),
    
    // Partition operations
    'partition-create': _("Creating partition on $target"),
    'partition-delete': _("Deleting partition on $target"),
    'partition-modify': _("Modifying partition on $target"),
    'partition-resize': _("Resizing partition on $target"),
    
    // Format operations
    'format-mkfs': _("Formatting $target"),
    'format-erase': _("Erasing $target"),
    
    // Generic cleanup
    'cleanup': _("Cleaning up"),
    'other': _("Performing operation on $target")
};

function job_description(job) {
    const op = job.Operation;
    let desc = job_descriptions[op] || job_descriptions.other;
    
    // Target object resolution
    let target_name = _("Unknown");
    if (job.Objects && job.Objects.length > 0) {
        const obj_path = job.Objects[0];
        // Resolve target names based on object type
        target_name = resolve_target_name(obj_path);
    }
    
    return desc.replace("$target", target_name);
}

function resolve_target_name(obj_path) {
    // Implementation to resolve object paths to human-readable names
    // Handle blocks, drives, volumes, etc.
    return "device";
}

const JobRow = ({ job, client }) => {
    const [expanded, setExpanded] = React.useState(false);
    
    const description = job_description(job);
    const progress = job.Progress;
    const can_cancel = job.Cancelable;
    
    const cancel_job = () => {
        job.Cancel({}).catch(error => {
            // Handle cancellation errors
        });
    };

    return (
        <DataListItem isExpanded={expanded}>
            <DataListItemRow>
                <DataListItemCells
                    dataListCells={[
                        <DataListCell key="description">
                            <div className="job-description">
                                {description}
                            </div>
                            {progress !== undefined && (
                                <Progress 
                                    value={progress * 100} 
                                    measureLocation={ProgressMeasureLocation.outside}
                                    title={_("Progress")} />
                            )}
                        </DataListCell>,
                        <DataListCell key="actions" alignRight>
                            {can_cancel && (
                                <Button variant="danger" 
                                        size="sm" 
                                        onClick={cancel_job}>
                                    {_("Cancel")}
                                </Button>
                            )}
                            <Spinner size="md" />
                        </DataListCell>
                    ]}
                />
            </DataListItemRow>
        </DataListItem>
    );
};

export const JobsPanel = ({ client }) => {
    const jobs = Object.values(client.jobs || {});
    
    if (jobs.length === 0)
        return null;

    return (
        <CardBody>
            <h3>{_("Background Operations")}</h3>
            <DataList aria-label={_("Storage operations")}>
                {jobs.map(job => (
                    <JobRow key={job.path} job={job} client={client} />
                ))}
            </DataList>
        </CardBody>
    );
};
```

## **7. Network Storage Implementation**

### **7.1 NFS Management (nfs/nfs.jsx)**
```jsx
import cockpit from "cockpit";
import React from "react";
import client from "../client";

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { CardBody } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { DescriptionList } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";

import { NetworkIcon } from "../icons/gnome-icons.jsx";
import {
    dialog_open, TextInput, ComboBox, CheckBoxes,
    StopProcessesMessage, stop_processes_danger_message
} from "../dialog.jsx";

import { StorageUsageBar } from "../storage-controls.jsx";
import {
    StorageCard, StorageDescription,
    new_page, new_card, PAGE_CATEGORY_NETWORK,
    navigate_to_new_card_location, navigate_away_from_card
} from "../pages.jsx";
import { parse_options, unparse_options, extract_option } from "../utils.js";

const _ = cockpit.gettext;

export function make_nfs_page(parent, entry) {
    const nfs_card = new_card({
        title: _("NFS mount"),
        next: null,
        page_location: ["nfs", entry.fields[1]],
        page_name: entry.fields[0] + ":" + entry.fields[1],
        page_icon: NetworkIcon,
        page_category: PAGE_CATEGORY_NETWORK,
        component: NFSCard,
        props: { entry },
        actions: [
            {
                title: _("Edit"),
                action: () => nfs_fstab_dialog(entry, nfs_card)
            },
            {
                title: _("Remove"),
                action: () => remove_nfs_mount(entry),
                danger: true
            }
        ]
    });

    new_page(parent, nfs_card);
}

export function nfs_fstab_dialog(entry, card) {
    const mount_options = entry ? entry.fields[3] : "defaults";
    const split_options = parse_options(mount_options == "defaults" ? "" : mount_options);
    const opt_auto = !extract_option(split_options, "noauto");
    const opt_ro = extract_option(split_options, "ro");
    const extra_options = unparse_options(split_options);

    function mounting_options(vals) {
        let opts = [];
        if (!vals.mount_options.auto)
            opts.push("noauto");
        if (vals.mount_options.ro)
            opts.push("ro");
        if (vals.mount_options.extra !== false)
            opts = opts.concat(parse_options(vals.mount_options.extra));
        return unparse_options(opts);
    }

    const dlg = dialog_open({
        Title: entry ? _("NFS mount settings") : _("New NFS mount"),
        Fields: [
            TextInput("server", _("Server address"),
                      {
                          value: entry ? entry.fields[0].split(":")[0] : "",
                          validate: (val) => {
                              if (val === "")
                                  return _("Server address cannot be empty");
                          }
                      }),
            ComboBox("remote", _("Path on server"),
                     {
                         value: entry ? entry.fields[0].split(":")[1] : "",
                         choices: [],
                         validate: (val) => {
                             if (val === "")
                                 return _("Path on server cannot be empty");
                         }
                     }),
            TextInput("dir", _("Local mount point"),
                      {
                          value: entry ? entry.fields[1] : "",
                          validate: (val) => {
                              if (val === "")
                                  return _("Mount point cannot be empty");
                              if (val[0] !== "/")
                                  return _("Mount point must be an absolute path");
                          }
                      }),
            CheckBoxes("mount_options", _("Mount options"),
                       {
                           value: {
                               auto: opt_auto,
                               ro: opt_ro,
                               extra: extra_options || false
                           },
                           fields: [
                               { tag: "auto", title: _("Mount at boot") },
                               { tag: "ro", title: _("Mount read only") },
                               { tag: "extra", title: _("Extra options"), type: "text" }
                           ]
                       })
        ],
        Action: {
            Title: entry ? _("Save") : _("Add"),
            action: function (vals) {
                const remote_fsname = vals.server + ":" + vals.remote;
                const mount_options = mounting_options(vals);
                const fields = [remote_fsname, vals.dir, "nfs", 
                               mount_options === "" ? "defaults" : mount_options, "0", "0"];
                
                return modify_fstab_entry(entry, fields);
            }
        }
    });

    // Auto-populate server exports
    const server_input = dlg.querySelector('[data-field="server"] input');
    const remote_combo = dlg.querySelector('[data-field="remote"]');
    
    if (server_input) {
        server_input.addEventListener('change', () => {
            const server = server_input.value;
            if (server) {
                get_exported_directories(server)
                    .then(dirs => {
                        // Update combo box choices
                    })
                    .catch(() => {
                        // Handle error
                    });
            }
        });
    }
}

function get_exported_directories(server) {
    return cockpit.spawn(["showmount", "-e", "--no-headers", server], { err: "message" })
            .then(function (output) {
                const dirs = [];
                output.split("\n").forEach(function (line) {
                    const d = line.split(" ")[0];
                    if (d) dirs.push(d);
                });
                return dirs;
            });
}

function modify_fstab_entry(old_entry, new_fields) {
    // Implementation for modifying /etc/fstab
    return client.run(async () => {
        // Use appropriate system calls to modify fstab
    });
}

function remove_nfs_mount(entry) {
    return client.run(async () => {
        // Implementation for removing NFS mount
    });
}

const NFSCard = ({ card, entry }) => {
    const [server, path] = entry.fields[0].split(":");
    const mount_point = entry.fields[1];
    const mount_options = entry.fields[3];
    
    return (
        <StorageCard card={card}>
            <CardBody>
                <DescriptionList className="pf-m-horizontal-on-sm">
                    <StorageDescription title={_("Server")} value={server} />
                    <StorageDescription title={_("Remote path")} value={path} />
                    <StorageDescription title={_("Mount point")} value={mount_point} />
                    <StorageDescription title={_("Mount options")} value={mount_options} />
                </DescriptionList>
            </CardBody>
        </StorageCard>
    );
};
```

### **7.2 iSCSI Management (iscsi/session.jsx)**
```jsx
import cockpit from "cockpit";
import React from "react";
import client from "../client";

import { CardBody } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { DescriptionList } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";

import { NetworkIcon } from "../icons/gnome-icons.jsx";
import {
    new_page, new_card, PAGE_CATEGORY_NETWORK,
    StorageDescription, ChildrenTable, StorageCard
} from "../pages.jsx";

import { make_drive_page } from "../drive/drive.jsx";

const _ = cockpit.gettext;

export function make_iscsi_session_page(parent, session) {
    const session_card = new_card({
        title: _("iSCSI portal"),
        next: null,
        page_location: ["iscsi", session.data.target_name],
        page_name: session.data.target_name,
        page_icon: NetworkIcon,
        page_category: PAGE_CATEGORY_NETWORK,
        component: ISCSISessionCard,
        props: { session },
        actions: [
            {
                title: _("Disconnect"),
                action: () => disconnect_iscsi_session(session, parent),
                danger: true
            },
        ]
    });

    const drives_card = new_card({
        title: _("iSCSI drives"),
        next: session_card,
        component: ISCSIDrivesCard,
        props: { session },
    });

    const p = new_page(parent, drives_card);

    // Add associated drives
    if (client.iscsi_sessions_drives[session.path])
        client.iscsi_sessions_drives[session.path].forEach(d => make_drive_page(p, d));
}

async function disconnect_iscsi_session(session, goto_page) {
    await client.run(async () => {
        await session.Logout({ 'node.startup': { t: 's', v: "manual" } });
        cockpit.location.go(goto_page.location);
    });
}

const ISCSIDrivesCard = ({ card, session }) => {
    return (
        <StorageCard card={card}>
            <ChildrenTable
                emptyCaption={_("No drives found")}
                aria-label={_("iSCSI drives")}
                page={card.page} />
        </StorageCard>
    );
};

const ISCSISessionCard = ({ card, session }) => {
    return (
        <StorageCard card={card}>
            <CardBody>
                <DescriptionList className="pf-m-horizontal-on-sm">
                    <StorageDescription title={_("Address")} value={session.data.address} />
                    <StorageDescription title={_("Target")} value={session.data.target_name} />
                    <StorageDescription title={_("Portal")} value={session.data.portal_address} />
                    <StorageDescription title={_("Interface")} value={session.data.interface} />
                </DescriptionList>
            </CardBody>
        </StorageCard>
    );
};
```

## **8. Advanced Storage Features**

### **8.1 LVM Management Structure**
```jsx
// lvm2/volume-group.jsx
export function make_lvm2_volume_group_page(parent, vgroup) {
    const vgroup_card = new_card({
        title: _("Volume group"),
        next: null,
        page_location: ["vg", vgroup.Name],
        page_name: vgroup.Name,
        component: VolumeGroupCard,
        props: { vgroup },
        actions: [
            {
                title: _("Create logical volume"),
                action: () => create_logical_volume_dialog(vgroup)
            },
            {
                title: _("Delete"),
                action: () => delete_volume_group(vgroup),
                danger: true
            }
        ]
    });

    const p = new_page(parent, vgroup_card);

    // Add logical volumes
    client.vgroups_lvols[vgroup.path].forEach(lv => {
        make_logical_volume_page(p, lv);
    });
    
    // Add physical volumes
    client.vgroups_pvols[vgroup.path].forEach(pv => {
        make_physical_volume_page(p, pv);
    });
}

// lvm2/create-logical-volume-dialog.jsx
export function create_logical_volume_dialog(vgroup) {
    dialog_open({
        Title: _("Create logical volume"),
        Fields: [
            TextInput("name", _("Name"), {
                validate: (val) => {
                    if (val === "") return _("Name cannot be empty");
                    if (!/^[a-zA-Z0-9._-]+$/.test(val)) 
                        return _("Name contains invalid characters");
                }
            }),
            SizeSlider("size", _("Size"), {
                max: vgroup.FreeSize,
                round: 1024 * 1024
            }),
            SelectOne("purpose", _("Purpose"), [
                { value: "block", title: _("Block device for filesystems") },
                { value: "pool", title: _("Pool for thinly provisioned volumes") }
            ])
        ],
        Action: {
            Title: _("Create"),
            action: async (vals) => {
                return client.create_logical_volume(vgroup, vals.name, vals.size, vals.purpose);
            }
        }
    });
}
```

### **8.2 RAID Management Structure** 
```jsx
// mdraid/create-dialog.jsx
export function create_mdraid() {
    dialog_open({
        Title: _("Create MDRAID device"),
        Fields: [
            SelectMany("disks", _("Disks"), {
                choices: get_available_disks(),
                validate: (val) => {
                    if (val.length < 2) return _("At least 2 disks required");
                }
            }),
            SelectOne("level", _("RAID Level"), [
                { value: "raid0", title: _("RAID 0 (Stripe)") },
                { value: "raid1", title: _("RAID 1 (Mirror)") },
                { value: "raid5", title: _("RAID 5 (Distributed parity)") },
                { value: "raid6", title: _("RAID 6 (Double parity)") },
                { value: "raid10", title: _("RAID 10 (Stripe of mirrors)") }
            ]),
            TextInput("name", _("Name"), {
                value: "",
                validate: (val) => {
                    if (val === "") return _("Name cannot be empty");
                }
            }),
            SizeSlider("chunk", _("Chunk size"), {
                value: 512 * 1024,
                min: 64 * 1024,
                max: 1024 * 1024,
                round: 64 * 1024
            })
        ],
        Action: {
            Title: _("Create"),
            action: async (vals) => {
                return client.create_mdraid(vals.disks, vals.level, vals.name, vals.chunk);
            }
        }
    });
}

function get_available_disks() {
    // Return list of available disks for RAID creation
    return Object.keys(client.drives)
        .filter(path => /* check if disk is available */)
        .map(path => ({
            value: path,
            title: client.drives[path].Model + " (" + client.drives[path].Size + ")"
        }));
}
```

### **8.3 Encryption Management**
```jsx
// crypto/encryption.jsx
export function make_encryption_page(parent, block) {
    const encryption_card = new_card({
        title: _("Encryption"),
        component: EncryptionCard,
        props: { block },
        actions: [
            {
                title: block.IdUsage === "crypto" ? _("Unlock") : _("Lock"),
                action: () => toggle_encryption(block)
            },
            {
                title: _("Change passphrase"),
                action: () => change_passphrase_dialog(block)
            },
            {
                title: _("Add key"),
                action: () => add_key_dialog(block)
            }
        ]
    });

    new_page(parent, encryption_card);
}

function toggle_encryption(block) {
    if (block.IdUsage === "crypto") {
        // Unlock
        return unlock_dialog(block);
    } else {
        // Lock
        return client.run(async () => {
            await block.Lock({});
        });
    }
}

function unlock_dialog(block) {
    dialog_open({
        Title: _("Unlock encrypted device"),
        Fields: [
            PassInput("passphrase", _("Passphrase"), {
                validate: (val) => {
                    if (val === "") return _("Passphrase cannot be empty");
                }
            })
        ],
        Action: {
            Title: _("Unlock"),
            action: async (vals) => {
                return client.unlock_luks(block, vals.passphrase);
            }
        }
    });
}
```

## **9. Build System and Development Workflow**

### **9.1 Enhanced files.js Registration**
```javascript
// Add to files.js
const info = {
    entries: [
        // ... existing entries
        "storage-manager/storage-manager.jsx",
    ],

    files: [
        // ... existing files  
        "storage-manager/index.html",
    ],

    tests: [
        // ... existing tests
        "storage-manager/test-util.js",
    ]
};
```

### **9.2 Development Commands**
```powershell
# Install dependencies
tools/node-modules make_package_lock_json

# Build storage-manager module only
node build.js storage-manager

# Watch mode for development  
node build.js -w storage-manager

# Production build
$env:NODE_ENV = "production"; node build.js storage-manager

# Run tests
npm test -- storage-manager

# Lint code
npm run eslint pkg/storage-manager/

# Type check
npx tsc --noEmit
```

## **10. Implementation Roadmap**

### **10.1 Phase 1: Core Infrastructure (Week 1-2)**
- [ ] Set up basic module structure
- [ ] Implement client.js with UDisks2 integration
- [ ] Create pages.jsx navigation framework
- [ ] Implement dialog.jsx framework
- [ ] Set up basic styling and build system

### **10.2 Phase 2: Block Device Management (Week 3-4)**
- [ ] Implement drive management
- [ ] Add partition management
- [ ] Create filesystem operations
- [ ] Implement mounting/unmounting
- [ ] Add SMART monitoring

### **10.3 Phase 3: Advanced Storage (Week 5-7)**
- [ ] Implement LVM2 management
- [ ] Add MDRAID support
- [ ] Create encryption (LUKS) management
- [ ] Implement BTRFS support
- [ ] Add Stratis integration

### **10.4 Phase 4: Network Storage (Week 8-9)**
- [ ] Implement NFS mount management
- [ ] Add iSCSI session handling
- [ ] Create network storage discovery
- [ ] Implement remote storage monitoring

### **10.5 Phase 5: Monitoring and Polish (Week 10-11)**
- [ ] Implement performance monitoring plots
- [ ] Add job progress tracking
- [ ] Create comprehensive logging
- [ ] Implement error handling and recovery
- [ ] Add comprehensive testing

### **10.6 Phase 6: Integration and Documentation (Week 12)**
- [ ] Final integration testing
- [ ] Performance optimization
- [ ] Documentation and help system
- [ ] Accessibility compliance
- [ ] Security review

## **11. Testing Strategy**

### **11.1 Unit Testing**
```javascript
// test-util.js
import * as utils from "./utils.js";
import QUnit from "qunit-tests";

QUnit.test("parse_mount_options", function (assert) {
    const checks = [
        ["defaults", {}],
        ["rw,auto", { rw: true, auto: true }],
        ["ro,noauto,user", { ro: true, noauto: true, user: true }]
    ];

    assert.expect(checks.length);
    for (let i = 0; i < checks.length; i++) {
        assert.deepEqual(
            utils.parse_mount_options(checks[i][0]), 
            checks[i][1],
            `parse_mount_options(${checks[i][0]})`
        );
    }
});

QUnit.test("format_storage_size", function (assert) {
    const checks = [
        [1024, "1.0 KiB"],
        [1048576, "1.0 MiB"],
        [1073741824, "1.0 GiB"]
    ];

    assert.expect(checks.length);
    for (let i = 0; i < checks.length; i++) {
        assert.strictEqual(
            utils.format_storage_size(checks[i][0]), 
            checks[i][1],
            `format_storage_size(${checks[i][0]}) = ${checks[i][1]}`
        );
    }
});
```

### **11.2 Integration Testing**
- Test module loading and initialization
- Verify D-Bus communication
- Test privilege escalation
- Validate storage operations
- Test error conditions and recovery

### **11.3 Browser Testing**
- Cross-browser compatibility
- Responsive design validation
- Accessibility compliance
- Performance benchmarking

## **12. Security Considerations**

### **12.1 Privilege Management**
- Use superuser module for privilege escalation
- Validate all user inputs
- Sanitize command-line arguments
- Implement proper error handling

### **12.2 Data Protection**
- Secure passphrase handling
- Protect encryption keys
- Validate storage operations
- Implement audit logging

## **13. Deployment and Maintenance**

### **13.1 Package Integration**
- Integrate with distribution packaging
- Set up automatic testing
- Implement feature detection
- Handle dependency management

### **13.2 Monitoring and Support**
- Implement comprehensive logging
- Create diagnostic tools
- Set up performance monitoring
- Plan maintenance procedures

This comprehensive SOP provides a complete roadmap for developing a full-featured storage management module that matches the complexity and functionality of the Cockpit storaged module. The implementation should be done incrementally, following the phased approach outlined in the roadmap.
