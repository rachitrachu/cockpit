/* XAVS Overview JavaScript */
(function() {
    'use strict';

    // Initialize the overview page
    function init() {
        console.log('XAVS Overview page initialized');
        
        // Check if cockpit is available
        if (typeof cockpit !== 'undefined') {
            // Set up any cockpit-specific functionality
            setupCockpitIntegration();
        }
    }

    function setupCockpitIntegration() {
        // Handle theme changes
        document.addEventListener('DOMContentLoaded', function() {
            // Apply current cockpit theme
            applyCockpitTheme();
        });
    }

    function applyCockpitTheme() {
        // This will automatically inherit Cockpit's CSS variables
        // No additional theme handling needed
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
