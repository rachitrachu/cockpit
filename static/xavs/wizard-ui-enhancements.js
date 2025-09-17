/**
 * XAVS Wizard UI Enhancement Utilities
 * JavaScript utilities for enhanced user experience
 */

(function() {
    'use strict';

    class XAVSWizardUI {
        constructor() {
            this.initialized = false;
        }

        initialize() {
            if (this.initialized) return;
            
            console.log('[XAVS Wizard UI] Initializing UI enhancements...');
            
            // Setup form enhancements
            this.setupFormEnhancements();
            
            // Setup container observers
            this.setupContainerObserver();
            
            // Setup accessibility improvements
            this.setupAccessibility();
            
            this.initialized = true;
            console.log('[XAVS Wizard UI] UI enhancements initialized');
        }

        /**
         * Setup form enhancement behaviors
         */
        setupFormEnhancements() {
            // Auto-enhance forms as they're added to the DOM
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.enhanceElement(node);
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Enhance existing elements
            this.enhanceElement(document.body);
        }

        /**
         * Enhance a specific element and its children
         */
        enhanceElement(element) {
            // Enhance form inputs
            const inputs = element.querySelectorAll('input, textarea, select');
            inputs.forEach(input => this.enhanceInput(input));

            // Enhance containers
            const containers = element.querySelectorAll('.module-container');
            containers.forEach(container => this.enhanceContainer(container));
        }

        /**
         * Enhance individual form inputs
         */
        enhanceInput(input) {
            if (input.hasAttribute('data-enhanced')) return;
            input.setAttribute('data-enhanced', 'true');

            // Add real-time validation
            input.addEventListener('blur', () => this.validateInput(input));
            input.addEventListener('input', () => this.clearValidationState(input));

            // Add placeholder animations
            if (input.type === 'text' || input.type === 'email' || input.type === 'password') {
                this.setupFloatingLabel(input);
            }
        }

        /**
         * Setup floating label effect
         */
        setupFloatingLabel(input) {
            const label = input.previousElementSibling;
            if (!label || label.tagName !== 'LABEL') return;

            const updateLabelState = () => {
                if (input.value || input === document.activeElement) {
                    label.style.transform = 'translateY(-24px) scale(0.85)';
                    label.style.color = 'var(--brand, #197560)';
                } else {
                    label.style.transform = 'translateY(0) scale(1)';
                    label.style.color = 'var(--text-muted, #6b7280)';
                }
            };

            input.addEventListener('focus', updateLabelState);
            input.addEventListener('blur', updateLabelState);
            input.addEventListener('input', updateLabelState);
            
            // Initial state
            updateLabelState();
        }

        /**
         * Validate individual input
         */
        validateInput(input) {
            let isValid = true;
            let message = '';

            // Remove existing validation classes
            this.clearValidationState(input);

            // Basic validation rules
            if (input.hasAttribute('required') && !input.value.trim()) {
                isValid = false;
                message = 'This field is required';
            } else if (input.type === 'email' && input.value && !this.isValidEmail(input.value)) {
                isValid = false;
                message = 'Please enter a valid email address';
            } else if (input.type === 'url' && input.value && !this.isValidUrl(input.value)) {
                isValid = false;
                message = 'Please enter a valid URL';
            } else if (input.hasAttribute('pattern') && input.value && !new RegExp(input.pattern).test(input.value)) {
                isValid = false;
                message = input.getAttribute('data-pattern-message') || 'Please enter a valid value';
            }

            // Apply validation state
            if (!isValid) {
                input.classList.add('error');
                this.showValidationMessage(input, message, 'error');
            } else if (input.value) {
                input.classList.add('success');
            }

            return isValid;
        }

        /**
         * Clear validation state
         */
        clearValidationState(input) {
            input.classList.remove('error', 'success');
            this.removeValidationMessage(input);
        }

        /**
         * Show validation message
         */
        showValidationMessage(input, message, type) {
            this.removeValidationMessage(input);

            const messageElement = document.createElement('div');
            messageElement.className = `${type}-message`;
            messageElement.textContent = message;
            messageElement.setAttribute('data-validation-message', 'true');

            input.parentNode.appendChild(messageElement);
        }

        /**
         * Remove validation message
         */
        removeValidationMessage(input) {
            const existingMessage = input.parentNode.querySelector('[data-validation-message]');
            if (existingMessage) {
                existingMessage.remove();
            }
        }

        /**
         * Enhance container appearance
         */
        enhanceContainer(container) {
            if (container.hasAttribute('data-container-enhanced')) return;
            container.setAttribute('data-container-enhanced', 'true');

            // Add hover effects
            container.addEventListener('mouseenter', () => {
                container.style.transform = 'translateY(-2px)';
            });

            container.addEventListener('mouseleave', () => {
                container.style.transform = 'translateY(0)';
            });

            // Add focus management
            const firstInput = container.querySelector('input, textarea, select');
            if (firstInput) {
                // Auto-focus first input when container is shown
                const observer = new MutationObserver(() => {
                    if (container.style.display !== 'none' && container.offsetParent !== null) {
                        setTimeout(() => firstInput.focus(), 300);
                        observer.disconnect();
                    }
                });

                observer.observe(container, {
                    attributes: true,
                    attributeFilter: ['style']
                });
            }
        }

        /**
         * Setup container visibility observer
         */
        setupContainerObserver() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }
                });
            }, {
                threshold: 0.1
            });

            // Observe all module containers
            document.querySelectorAll('.module-container').forEach(container => {
                observer.observe(container);
            });
        }

        /**
         * Setup accessibility improvements
         */
        setupAccessibility() {
            // Add skip links
            this.addSkipLinks();

            // Improve keyboard navigation
            this.improveKeyboardNavigation();

            // Add ARIA labels where missing
            this.addAriaLabels();
        }

        /**
         * Add skip navigation links
         */
        addSkipLinks() {
            const skipLink = document.createElement('a');
            skipLink.href = '#wizard-module-container';
            skipLink.textContent = 'Skip to main content';
            skipLink.className = 'skip-link';
            skipLink.style.cssText = `
                position: absolute;
                top: -40px;
                left: 6px;
                background: var(--brand, #197560);
                color: white;
                padding: 8px;
                text-decoration: none;
                border-radius: 4px;
                z-index: 1000;
                transition: top 0.3s;
            `;

            skipLink.addEventListener('focus', () => {
                skipLink.style.top = '6px';
            });

            skipLink.addEventListener('blur', () => {
                skipLink.style.top = '-40px';
            });

            document.body.insertBefore(skipLink, document.body.firstChild);
        }

        /**
         * Improve keyboard navigation
         */
        improveKeyboardNavigation() {
            document.addEventListener('keydown', (e) => {
                // Alt + N for next step
                if (e.altKey && e.key === 'n') {
                    e.preventDefault();
                    const nextBtn = document.getElementById('wizard-next-btn');
                    if (nextBtn && !nextBtn.disabled) {
                        nextBtn.click();
                    }
                }

                // Alt + P for previous step
                if (e.altKey && e.key === 'p') {
                    e.preventDefault();
                    const prevBtn = document.getElementById('wizard-prev-btn');
                    if (prevBtn && !prevBtn.disabled) {
                        prevBtn.click();
                    }
                }

                // Escape to show help
                if (e.key === 'F1') {
                    e.preventDefault();
                    const helpBtn = document.getElementById('wizard-help');
                    if (helpBtn) {
                        helpBtn.click();
                    }
                }
            });
        }

        /**
         * Add missing ARIA labels
         */
        addAriaLabels() {
            // Add labels to inputs without them
            document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])').forEach(input => {
                const label = input.previousElementSibling;
                if (label && label.tagName === 'LABEL') {
                    const labelId = label.id || `label-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    label.id = labelId;
                    input.setAttribute('aria-labelledby', labelId);
                }
            });
        }

        /**
         * Utility functions
         */
        isValidEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }

        isValidUrl(url) {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.xavsWizardUI = new XAVSWizardUI();
            window.xavsWizardUI.initialize();
        });
    } else {
        window.xavsWizardUI = new XAVSWizardUI();
        window.xavsWizardUI.initialize();
    }

})();