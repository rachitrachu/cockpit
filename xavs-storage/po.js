// XAVS Storage Module Translations
// This file contains translation strings for the XAVS Storage module

(function (root, factory) {
    if (typeof exports === 'object') {
        // Node.js
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define([], factory);
    } else {
        // Browser globals
        root.po = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    // Translation dictionary for XAVS Storage
    var translations = {
        "": {
            "language": "en",
            "plural-forms": "nplurals=2; plural=(n != 1);"
        },
        "XAVS Storage": ["XAVS Storage"],
        "Storage": ["Storage"],
        "Disks": ["Disks"],
        "Filesystems": ["Filesystems"],
        "RAID": ["RAID"],
        "Volume Groups": ["Volume Groups"],
        "NFS": ["NFS"],
        "iSCSI": ["iSCSI"],
        "Drives": ["Drives"],
        "Mount": ["Mount"],
        "Unmount": ["Unmount"],
        "Format": ["Format"],
        "Partition": ["Partition"],
        "Delete": ["Delete"],
        "Edit": ["Edit"],
        "Size": ["Size"],
        "Used": ["Used"],
        "Available": ["Available"],
        "Mounted": ["Mounted"],
        "Device": ["Device"],
        "Type": ["Type"],
        "Label": ["Label"],
        "UUID": ["UUID"],
        "Mount Point": ["Mount Point"],
        "Options": ["Options"],
        "Actions": ["Actions"],
        "Properties": ["Properties"],
        "Overview": ["Overview"],
        "Details": ["Details"],
        "Health": ["Health"],
        "Performance": ["Performance"],
        "Create": ["Create"],
        "Add": ["Add"],
        "Remove": ["Remove"],
        "Start": ["Start"],
        "Stop": ["Stop"],
        "Refresh": ["Refresh"],
        "Apply": ["Apply"],
        "Cancel": ["Cancel"],
        "Save": ["Save"],
        "Close": ["Close"],
        "OK": ["OK"],
        "Yes": ["Yes"],
        "No": ["No"],
        "Warning": ["Warning"],
        "Error": ["Error"],
        "Information": ["Information"],
        "Confirmation": ["Confirmation"],
        "Loading...": ["Loading..."],
        "Please wait...": ["Please wait..."],
        "No data available": ["No data available"],
        "Operation completed successfully": ["Operation completed successfully"],
        "Operation failed": ["Operation failed"],
        "Are you sure?": ["Are you sure?"],
        "This action cannot be undone": ["This action cannot be undone"],
        "Disk Usage": ["Disk Usage"],
        "Free Space": ["Free Space"],
        "Total Space": ["Total Space"],
        "File System": ["File System"],
        "Block Device": ["Block Device"],
        "Partition Table": ["Partition Table"],
        "Serial Number": ["Serial Number"],
        "Model": ["Model"],
        "Vendor": ["Vendor"],
        "WWN": ["WWN"],
        "Connection": ["Connection"],
        "Logical Volumes": ["Logical Volumes"],
        "Physical Volumes": ["Physical Volumes"],
        "Volume Group": ["Volume Group"],
        "RAID Level": ["RAID Level"],
        "RAID Devices": ["RAID Devices"],
        "Array State": ["Array State"],
        "Sync Status": ["Sync Status"],
        "Bitmap": ["Bitmap"],
        "Clean": ["Clean"],
        "Active": ["Active"],
        "Inactive": ["Inactive"],
        "Failed": ["Failed"],
        "Spare": ["Spare"],
        "Online": ["Online"],
        "Offline": ["Offline"],
        "Degraded": ["Degraded"],
        "Rebuilding": ["Rebuilding"],
        "Checking": ["Checking"],
        "Idle": ["Idle"],
        "Resync": ["Resync"],
        "Recovery": ["Recovery"]
    };

    // Simple gettext-like function
    function gettext(msgid) {
        if (translations[msgid] && translations[msgid][0]) {
            return translations[msgid][0];
        }
        return msgid;
    }

    // Alias for convenience
    function _(msgid) {
        return gettext(msgid);
    }

    // Ngettext-like function for plural forms
    function ngettext(msgid, msgid_plural, n) {
        var key = msgid;
        if (translations[key] && translations[key].length > 1) {
            var pluralForm = (n != 1) ? 1 : 0;
            return translations[key][pluralForm] || (n == 1 ? msgid : msgid_plural);
        }
        return n == 1 ? msgid : msgid_plural;
    }

    // Return public API
    return {
        gettext: gettext,
        _: _,
        ngettext: ngettext,
        translations: translations
    };
}));
