/*
 * XAVS Storage Client
 * Comprehensive UDisks2 client for storage management
 * Based on Cockpit storage patterns
 */

import cockpit from 'cockpit';

const _ = cockpit.gettext;

// Storage client state
export class StorageClient {
    constructor() {
        this.superuser = cockpit.dbus(null, { superuser: "try" });
        this.udisks = cockpit.dbus("org.freedesktop.UDisks2", { superuser: "try" });
        
        // Storage objects
        this.drives = new Map();
        this.blocks = new Map();
        this.mdraids = new Map();
        this.vgroups = new Map();
        this.lvols = new Map();
        this.pvols = new Map();
        this.filesystems = new Map();
        this.jobs = new Map();
        
        // Event callbacks
        this.callbacks = new Set();
        
        // Initialize monitoring
        this.init_monitoring();
    }
    
    init_monitoring() {
        console.log("Initializing storage monitoring...");
        
        // Monitor UDisks2 ObjectManager
        this.udisks.subscribe({
            interface: "org.freedesktop.DBus.ObjectManager",
            path: "/org/freedesktop/UDisks2"
        }, (path, iface, signal, args) => {
            if (signal === "InterfacesAdded" || signal === "InterfacesRemoved") {
                console.log("Storage change detected:", signal, path);
                this.refresh_objects();
            }
        });
        
        // Initial load
        this.refresh_objects();
    }
    
    refresh_objects() {
        console.log("Refreshing storage objects...");
        
        return this.udisks.call("/org/freedesktop/UDisks2",
                                "org.freedesktop.DBus.ObjectManager", 
                                "GetManagedObjects", [])
            .then(result => {
                this.process_objects(result[0] || {});
                this.notify_callbacks();
                console.log("Storage objects refreshed");
            })
            .catch(error => {
                console.error("Failed to refresh storage objects:", error);
                throw error;
            });
    }
    
    process_objects(objects) {
        // Clear existing data
        this.drives.clear();
        this.blocks.clear();
        this.mdraids.clear();
        this.vgroups.clear();
        this.lvols.clear();
        this.pvols.clear();
        this.filesystems.clear();
        this.jobs.clear();
        
        // Process all objects
        for (const [path, interfaces] of Object.entries(objects)) {
            this.process_object(path, interfaces);
        }
    }
    
    process_object(path, interfaces) {
        // Process drives
        if (interfaces["org.freedesktop.UDisks2.Drive"]) {
            const drive = {
                path: path,
                ...interfaces["org.freedesktop.UDisks2.Drive"]
            };
            this.drives.set(path, drive);
        }
        
        // Process block devices
        if (interfaces["org.freedesktop.UDisks2.Block"]) {
            const block = {
                path: path,
                ...interfaces["org.freedesktop.UDisks2.Block"]
            };
            
            // Add partition info if available
            if (interfaces["org.freedesktop.UDisks2.Partition"]) {
                block.partition = interfaces["org.freedesktop.UDisks2.Partition"];
            }
            
            // Add encryption info if available
            if (interfaces["org.freedesktop.UDisks2.Encrypted"]) {
                block.encrypted = interfaces["org.freedesktop.UDisks2.Encrypted"];
            }
            
            this.blocks.set(path, block);
        }
        
        // Process filesystems
        if (interfaces["org.freedesktop.UDisks2.Filesystem"]) {
            const filesystem = {
                path: path,
                ...interfaces["org.freedesktop.UDisks2.Filesystem"]
            };
            this.filesystems.set(path, filesystem);
        }
        
        // Process MD RAID
        if (interfaces["org.freedesktop.UDisks2.MDRaid"]) {
            const mdraid = {
                path: path,
                ...interfaces["org.freedesktop.UDisks2.MDRaid"]
            };
            this.mdraids.set(path, mdraid);
        }
        
        // Process LVM Volume Groups
        if (interfaces["org.freedesktop.UDisks2.VolumeGroup"]) {
            const vgroup = {
                path: path,
                ...interfaces["org.freedesktop.UDisks2.VolumeGroup"]
            };
            this.vgroups.set(path, vgroup);
        }
        
        // Process LVM Logical Volumes
        if (interfaces["org.freedesktop.UDisks2.LogicalVolume"]) {
            const lvol = {
                path: path,
                ...interfaces["org.freedesktop.UDisks2.LogicalVolume"]
            };
            this.lvols.set(path, lvol);
        }
        
        // Process LVM Physical Volumes
        if (interfaces["org.freedesktop.UDisks2.PhysicalVolume"]) {
            const pvol = {
                path: path,
                ...interfaces["org.freedesktop.UDisks2.PhysicalVolume"]
            };
            this.pvols.set(path, pvol);
        }
        
        // Process jobs
        if (interfaces["org.freedesktop.UDisks2.Job"]) {
            const job = {
                path: path,
                ...interfaces["org.freedesktop.UDisks2.Job"]
            };
            this.jobs.set(path, job);
        }
    }
    
    // Callback management
    add_callback(callback) {
        this.callbacks.add(callback);
    }
    
    remove_callback(callback) {
        this.callbacks.delete(callback);
    }
    
    notify_callbacks() {
        this.callbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error("Error in storage callback:", error);
            }
        });
    }
    
    // Utility methods
    get_drive_for_block(block_path) {
        const block = this.blocks.get(block_path);
        if (block && block.Drive) {
            return this.drives.get(block.Drive.v);
        }
        return null;
    }
    
    get_blocks_for_drive(drive_path) {
        const blocks = [];
        for (const block of this.blocks.values()) {
            if (block.Drive && block.Drive.v === drive_path) {
                blocks.push(block);
            }
        }
        return blocks;
    }
    
    get_filesystem_for_block(block_path) {
        return this.filesystems.get(block_path);
    }
    
    // Storage operations
    format_device(device_path, filesystem_type) {
        return this.udisks.call(device_path,
                               "org.freedesktop.UDisks2.Block", 
                               "Format",
                               [filesystem_type, {}]);
    }
    
    mount_filesystem(device_path, mount_point = "") {
        return this.udisks.call(device_path,
                               "org.freedesktop.UDisks2.Filesystem",
                               "Mount",
                               [{}]);
    }
    
    unmount_filesystem(device_path) {
        return this.udisks.call(device_path,
                               "org.freedesktop.UDisks2.Filesystem",
                               "Unmount",
                               [{}]);
    }
    
    create_partition_table(device_path, table_type = "gpt") {
        return this.udisks.call(device_path,
                               "org.freedesktop.UDisks2.Block",
                               "CreatePartitionTable",
                               [table_type, {}]);
    }
    
    create_partition(device_path, offset, size, type = "") {
        return this.udisks.call(device_path,
                               "org.freedesktop.UDisks2.PartitionTable",
                               "CreatePartition",
                               [offset, size, type, "", {}]);
    }
    
    delete_partition(partition_path) {
        return this.udisks.call(partition_path,
                               "org.freedesktop.UDisks2.Partition",
                               "Delete",
                               [{}]);
    }
    
    // LVM operations
    create_volume_group(name, device_paths) {
        return this.udisks.call("/org/freedesktop/UDisks2/Manager",
                               "org.freedesktop.UDisks2.Manager.LVM2",
                               "VolumeGroupCreate",
                               [name, device_paths, {}]);
    }
    
    create_logical_volume(vg_path, name, size) {
        return this.udisks.call(vg_path,
                               "org.freedesktop.UDisks2.VolumeGroup",
                               "CreateLogicalVolume",
                               [name, size, {}]);
    }
    
    // RAID operations
    create_raid(level, name, device_paths) {
        return this.udisks.call("/org/freedesktop/UDisks2/Manager",
                               "org.freedesktop.UDisks2.Manager.MDRaid",
                               "CreateRAID",
                               [device_paths, level, name, {}]);
    }
    
    // Get summary statistics
    get_storage_summary() {
        let total_drives = this.drives.size;
        let total_capacity = 0;
        let used_capacity = 0;
        let free_capacity = 0;
        
        // Calculate drive capacity
        for (const drive of this.drives.values()) {
            if (drive.Size && drive.Size.v) {
                total_capacity += drive.Size.v;
            }
        }
        
        // Calculate filesystem usage
        for (const filesystem of this.filesystems.values()) {
            if (filesystem.Size && filesystem.Size.v) {
                const total = filesystem.Size.v;
                // This is a simplified calculation - in reality we'd need more complex logic
                used_capacity += total * 0.1; // Assume 10% usage for demo
            }
        }
        
        free_capacity = total_capacity - used_capacity;
        
        return {
            drives: total_drives,
            total_capacity,
            used_capacity,
            free_capacity,
            block_devices: this.blocks.size,
            filesystems: this.filesystems.size,
            raids: this.mdraids.size,
            volume_groups: this.vgroups.size,
            logical_volumes: this.lvols.size
        };
    }
}

// Global storage client instance
export let client = null;

// Initialize the storage client
export function init_client() {
    if (!client) {
        client = new StorageClient();
    }
    return client;
}
