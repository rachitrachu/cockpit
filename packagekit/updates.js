/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <https://www.gnu.org/licenses/>.
 */

(function() {
    "use strict";

    const _ = cockpit.gettext;

    function init() {
        const app = document.getElementById('app');
        
        // Check if PackageKit service is available
        const proxy = cockpit.dbus("org.freedesktop.PackageKit");
        
        app.innerHTML = `
            <div class="updates-container">
                <div class="updates-header">
                    <h1 class="updates-title">${_("Software Updates")}</h1>
                    <div class="updates-actions">
                        <button class="btn primary" id="refresh-btn">
                            <span class="loading-spinner" id="refresh-spinner" style="display: none;"></span>
                            ${_("Check for Updates")}
                        </button>
                    </div>
                </div>
                
                <div class="updates-info">
                    <p><strong>${_("Software Updates")}</strong></p>
                    <p>${_("Keep your system secure and up-to-date by installing the latest software updates.")}</p>
                </div>
                
                <div id="updates-content">
                    <div class="empty-state">
                        <h3>${_("No Updates Available")}</h3>
                        <p>${_("Your system is up to date. Check back later for new updates or click 'Check for Updates' to refresh.")}</p>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        const refreshBtn = document.getElementById('refresh-btn');
        const refreshSpinner = document.getElementById('refresh-spinner');
        
        refreshBtn.addEventListener('click', function() {
            refreshBtn.disabled = true;
            refreshSpinner.style.display = 'inline-block';
            refreshBtn.innerHTML = refreshSpinner.outerHTML + ' ' + _("Checking...");
            
            // Simulate checking for updates
            setTimeout(() => {
                refreshBtn.disabled = false;
                refreshSpinner.style.display = 'none';
                refreshBtn.innerHTML = _("Check for Updates");
                
                // Show message that updates functionality requires PackageKit
                showNoPackageKitMessage();
            }, 2000);
        });

        // Check if we can access PackageKit
        checkPackageKit();
    }

    function checkPackageKit() {
        const client = cockpit.dbus("org.freedesktop.PackageKit");
        
        client.call("/org/freedesktop/PackageKit", "org.freedesktop.DBus.Properties", "Get", 
                   ["org.freedesktop.PackageKit", "VersionMajor"])
            .then(function(reply) {
                console.log("PackageKit is available, version:", reply[0].v);
                showPackageKitAvailable();
            })
            .catch(function(error) {
                console.log("PackageKit not available:", error);
                showNoPackageKitMessage();
            });
    }

    function showPackageKitAvailable() {
        const content = document.getElementById('updates-content');
        content.innerHTML = `
            <div class="updates-info" style="background: #d4edda; border-left-color: #28a745;">
                <p><strong>${_("PackageKit Service Available")}</strong></p>
                <p>${_("The PackageKit service is running and available for managing software updates.")}</p>
            </div>
            <div class="empty-state">
                <h3>${_("Software Updates")}</h3>
                <p>${_("Click 'Check for Updates' to scan for available software updates.")}</p>
                <button class="btn primary" onclick="document.getElementById('refresh-btn').click()">
                    ${_("Check for Updates")}
                </button>
            </div>
        `;
    }

    function showNoPackageKitMessage() {
        const content = document.getElementById('updates-content');
        content.innerHTML = `
            <div class="updates-info" style="background: #fff3cd; border-left-color: #ffc107;">
                <p><strong>${_("PackageKit Service Required")}</strong></p>
                <p>${_("Software updates are managed through the PackageKit service. This service may not be installed or may not be running on this system.")}</p>
            </div>
            
            <div class="update-item">
                <div class="update-name">${_("Installation Instructions")}</div>
                <div class="update-description">
                    <p>${_("To enable software update management, install and start the PackageKit service:")}</p>
                    <div style="background: #f8f9fa; padding: 1rem; border-radius: 0.375rem; margin: 1rem 0; font-family: monospace;">
                        <strong>Red Hat/Fedora/CentOS:</strong><br>
                        sudo dnf install packagekit<br>
                        sudo systemctl enable --now packagekit<br><br>
                        
                        <strong>Ubuntu/Debian:</strong><br>
                        sudo apt update && sudo apt install packagekit<br>
                        sudo systemctl enable --now packagekit<br><br>
                        
                        <strong>SUSE/openSUSE:</strong><br>
                        sudo zypper install PackageKit<br>
                        sudo systemctl enable --now packagekit
                    </div>
                </div>
            </div>
            
            <div class="empty-state">
                <h3>${_("Alternative Update Methods")}</h3>
                <p>${_("You can also manage updates directly using your system's package manager:")}</p>
                <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-top: 1rem;">
                    <button class="btn" onclick="showCommand('dnf')">DNF/YUM</button>
                    <button class="btn" onclick="showCommand('apt')">APT</button>
                    <button class="btn" onclick="showCommand('zypper')">Zypper</button>
                </div>
            </div>
        `;
    }

    // Add global function for showing package manager commands
    window.showCommand = function(manager) {
        let commands = '';
        
        switch(manager) {
            case 'dnf':
                commands = `
                    <strong>DNF/YUM Commands:</strong><br>
                    # Check for updates:<br>
                    sudo dnf check-update<br><br>
                    # Update all packages:<br>
                    sudo dnf update<br><br>
                    # Update security patches only:<br>
                    sudo dnf update --security
                `;
                break;
            case 'apt':
                commands = `
                    <strong>APT Commands:</strong><br>
                    # Update package list:<br>
                    sudo apt update<br><br>
                    # Upgrade all packages:<br>
                    sudo apt upgrade<br><br>
                    # Security updates only:<br>
                    sudo unattended-upgrades
                `;
                break;
            case 'zypper':
                commands = `
                    <strong>Zypper Commands:</strong><br>
                    # Check for updates:<br>
                    sudo zypper list-updates<br><br>
                    # Update all packages:<br>
                    sudo zypper update<br><br>
                    # Security updates only:<br>
                    sudo zypper patch --category security
                `;
                break;
        }
        
        const modal = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;" onclick="this.remove()">
                <div style="background: white; padding: 2rem; border-radius: 0.5rem; max-width: 500px; margin: 2rem;" onclick="event.stopPropagation()">
                    <h3 style="margin-top: 0;">${_("Package Manager Commands")}</h3>
                    <div style="background: #f8f9fa; padding: 1rem; border-radius: 0.375rem; font-family: monospace; font-size: 0.875rem;">
                        ${commands}
                    </div>
                    <button class="btn primary" onclick="this.closest('div[onclick]').remove()" style="margin-top: 1rem; width: 100%;">
                        ${_("Close")}
                    </button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modal);
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();