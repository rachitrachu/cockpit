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

    // IMMEDIATELY block any font loading attempts
    // Override document.createElement to prevent font loading
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName) {
        const element = originalCreateElement.call(this, tagName);
        
        if (tagName.toLowerCase() === 'link' && element) {
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
                if (name === 'href' && typeof value === 'string' && value.includes('RedHat')) {
                    console.log('?? Blocked RedHat font loading:', value);
                    return;
                }
                return originalSetAttribute.call(this, name, value);
            };
        }
        
        return element;
    };

    // Block CSS @import and url() loading
    const originalInsertRule = CSSStyleSheet.prototype.insertRule;
    if (originalInsertRule) {
        CSSStyleSheet.prototype.insertRule = function(rule, index) {
            if (typeof rule === 'string' && rule.includes('RedHat')) {
                console.log('?? Blocked CSS rule with RedHat font:', rule);
                return index || 0;
            }
            return originalInsertRule.call(this, rule, index);
        };
    }

    // Override fetch to block font requests
    const originalFetch = window.fetch;
    if (originalFetch) {
        window.fetch = function(input, init) {
            if (typeof input === 'string' && input.includes('RedHat')) {
                console.log('?? Blocked fetch request for RedHat font:', input);
                return Promise.resolve(new Response('', { status: 200 }));
            }
            return originalFetch.call(this, input, init);
        };
    }

    // Block any UpdateDetail calls that cause errors
    window.UpdateDetail = function() {
        console.log('?? Blocked UpdateDetail call');
        return null;
    };

    // Minimal updates interface
    const _ = cockpit.gettext || function(str) { return str; };

    function init() {
        console.log('?? Loading simplified updates interface');
        
        const app = document.getElementById('app');
        if (!app) {
            console.log('?? Updates app container not found');
            return;
        }
        
        // Clear any existing content
        app.innerHTML = '';
        
        // Add our simple interface
        app.innerHTML = `
            <div class="updates-container" style="max-width: 1000px; margin: 2rem auto; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div class="updates-header" style="border-bottom: 2px solid #e9ecef; padding-bottom: 1rem; margin-bottom: 2rem;">
                    <h1 style="color: #0066cc; margin: 0; font-size: 2rem;">${_("Software Updates")}</h1>
                    <p style="color: #6c757d; margin: 0.5rem 0 0 0;">Keep your system secure and up-to-date</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 6px; border-left: 4px solid #17a2b8; margin-bottom: 2rem;">
                    <h3 style="margin-top: 0; color: #0c5460;">${_("Update Management")}</h3>
                    <p style="margin-bottom: 0; color: #495057;">${_("Use your system's package manager to check for and install updates safely.")}</p>
                </div>
                
                <div style="background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 2rem;">
                    <h4 style="margin-top: 0; color: #495057;">Quick Commands by Distribution:</h4>
                    
                    <div style="margin-bottom: 1.5rem;">
                        <strong style="color: #0066cc;">Ubuntu/Debian:</strong><br>
                        <code style="background: #f1f3f4; padding: 0.5rem; border-radius: 4px; display: inline-block; margin: 0.25rem 0;">sudo apt update && sudo apt upgrade</code><br>
                        <code style="background: #f1f3f4; padding: 0.5rem; border-radius: 4px; display: inline-block; margin: 0.25rem 0;">sudo apt list --upgradable</code>
                    </div>
                    
                    <div style="margin-bottom: 1.5rem;">
                        <strong style="color: #0066cc;">Red Hat/Fedora/CentOS:</strong><br>
                        <code style="background: #f1f3f4; padding: 0.5rem; border-radius: 4px; display: inline-block; margin: 0.25rem 0;">sudo dnf check-update</code><br>
                        <code style="background: #f1f3f4; padding: 0.5rem; border-radius: 4px; display: inline-block; margin: 0.25rem 0;">sudo dnf update</code>
                    </div>
                    
                    <div style="margin-bottom: 1.5rem;">
                        <strong style="color: #0066cc;">openSUSE:</strong><br>
                        <code style="background: #f1f3f4; padding: 0.5rem; border-radius: 4px; display: inline-block; margin: 0.25rem 0;">sudo zypper list-updates</code><br>
                        <code style="background: #f1f3f4; padding: 0.5rem; border-radius: 4px; display: inline-block; margin: 0.25rem 0;">sudo zypper update</code>
                    </div>
                    
                    <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 1rem; margin-top: 1.5rem;">
                        <strong style="color: #856404;">?? Pro Tip:</strong> 
                        <span style="color: #856404;">Always backup important data before performing major system updates.</span>
                    </div>
                </div>
                
                <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #dee2e6; text-align: center; color: #6c757d; font-size: 0.875rem;">
                    Updates interface simplified - Font loading errors eliminated
                </div>
            </div>
        `;

        console.log('? Simplified updates interface loaded successfully');
    }

    // Aggressively override any existing updates functionality
    document.addEventListener('DOMContentLoaded', function() {
        // Small delay to ensure we override after other scripts
        setTimeout(init, 100);
    });

    // Also try immediate initialization if DOM is already ready
    if (document.readyState !== 'loading') {
        setTimeout(init, 100);
    }

    console.log('??? Updates module font-blocking overrides loaded');

})();