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
        
        if (!app) {
            return;
        }
        
        app.innerHTML = `
            <div style="max-width: 800px; margin: 2rem auto; padding: 2rem; font-family: system-ui, sans-serif;">
                <h1>Software Updates</h1>
                <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 0.5rem; margin: 1rem 0;">
                    <p><strong>Package management is handled by your system's package manager.</strong></p>
                    <p>Use the appropriate commands for your distribution to check for and install updates.</p>
                </div>
                <div style="background: white; border: 1px solid #dee2e6; border-radius: 0.5rem; padding: 1.5rem;">
                    <h3>Common Update Commands:</h3>
                    <p><strong>Ubuntu/Debian:</strong> <code>sudo apt update && sudo apt upgrade</code></p>
                    <p><strong>Red Hat/Fedora:</strong> <code>sudo dnf update</code></p>
                    <p><strong>openSUSE:</strong> <code>sudo zypper update</code></p>
                </div>
            </div>
        `;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();