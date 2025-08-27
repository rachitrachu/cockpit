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

    // Simple updates module to prevent font loading errors
    const _ = cockpit.gettext;

    // Override any font loading attempts
    if (typeof FontFace !== 'undefined') {
        const originalFontFace = window.FontFace;
        window.FontFace = function(family, source, descriptors) {
            if (family && family.includes('RedHat')) {
                console.log('Blocked RedHat font loading:', family);
                return null;
            }
            return new originalFontFace(family, source, descriptors);
        };
    }

    function init() {
        const app = document.getElementById('app');
        
        if (!app) {
            console.log('Updates app container not found');
            return;
        }
        
        app.innerHTML = `
            <div class="updates-container">
                <div class="updates-header">
                    <h1 class="updates-title">${_("Software Updates")}</h1>
                </div>
                
                <div class="updates-info">
                    <p><strong>${_("Software Updates")}</strong></p>
                    <p>${_("Keep your system secure and up-to-date by installing the latest software updates.")}</p>
                </div>
                
                <div id="updates-content">
                    <div class="empty-state">
                        <h3>${_("Update Management")}</h3>
                        <p>${_("Use your system's package manager to check for and install updates.")}</p>
                        <div style="margin-top: 2rem; padding: 1rem; background: #f8f9fa; border-radius: 0.375rem; text-align: left;">
                            <strong>Quick Commands:</strong><br>
                            <code style="background: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; margin: 0.25rem; display: inline-block;">sudo apt update && sudo apt upgrade</code> (Ubuntu/Debian)<br>
                            <code style="background: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; margin: 0.25rem; display: inline-block;">sudo dnf update</code> (Red Hat/Fedora)<br>
                            <code style="background: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; margin: 0.25rem; display: inline-block;">sudo zypper update</code> (openSUSE)
                        </div>
                    </div>
                </div>
            </div>
        `;

        console.log('Simple updates interface loaded');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();