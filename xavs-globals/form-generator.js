/* 
 * XAVS Globals Form Generator
 * Dynamically generates forms based on configuration schema
 */

class FormGenerator {
    constructor(containerId, schema, serviceSchema) {
        this.container = document.getElementById(containerId);
        this.schema = schema;
        this.serviceSchema = serviceSchema;
        this.formData = {};
        this.validators = new Map();
        this.dependencies = new Map();
        
        if (!this.container) {
            throw new Error(`Container with id '${containerId}' not found`);
        }
    }

    // Generate complete form
    generateForm() {
        this.container.innerHTML = '';
        
        // Create tabbed interface
        const tabsContainer = this.createTabs();
        const contentContainer = this.createTabContent();
        
        this.container.appendChild(tabsContainer);
        this.container.appendChild(contentContainer);
        
        // Generate configuration sections
        this.generateConfigurationTabs(contentContainer);
        
        // Generate service sections
        this.generateServiceTabs(contentContainer);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Activate first tab
        this.activateTab('network');
    }

    // Create tab navigation
    createTabs() {
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'nav nav-tabs mb-3';
        tabsContainer.setAttribute('role', 'tablist');

        // Configuration tabs
        const configTabs = Object.keys(this.schema).map(key => ({
            id: key,
            title: this.schema[key].title,
            type: 'config'
        }));

        // Service tabs
        const serviceTabs = Object.keys(this.serviceSchema).map(key => ({
            id: `services-${key}`,
            title: this.serviceSchema[key].title,
            type: 'service'
        }));

        const allTabs = [...configTabs, ...serviceTabs];

        allTabs.forEach((tab, index) => {
            const tabButton = document.createElement('button');
            tabButton.className = `nav-link ${index === 0 ? 'active' : ''}`;
            tabButton.id = `${tab.id}-tab`;
            tabButton.setAttribute('data-bs-toggle', 'tab');
            tabButton.setAttribute('data-bs-target', `#${tab.id}`);
            tabButton.setAttribute('type', 'button');
            tabButton.setAttribute('role', 'tab');
            tabButton.textContent = tab.title;
            
            tabsContainer.appendChild(tabButton);
        });

        return tabsContainer;
    }

    // Create tab content container
    createTabContent() {
        const contentContainer = document.createElement('div');
        contentContainer.className = 'tab-content';
        return contentContainer;
    }

    // Generate configuration tabs
    generateConfigurationTabs(contentContainer) {
        Object.keys(this.schema).forEach((sectionKey, index) => {
            const section = this.schema[sectionKey];
            const tabPane = document.createElement('div');
            tabPane.className = `tab-pane fade ${index === 0 ? 'show active' : ''}`;
            tabPane.id = sectionKey;
            tabPane.setAttribute('role', 'tabpanel');
            
            // Section header
            const header = document.createElement('h4');
            header.className = 'mb-3';
            header.textContent = section.title;
            tabPane.appendChild(header);

            // Fields container
            const fieldsContainer = document.createElement('div');
            fieldsContainer.className = 'row';
            
            Object.keys(section.fields).forEach(fieldKey => {
                const field = section.fields[fieldKey];
                const fieldElement = this.createField(fieldKey, field);
                fieldsContainer.appendChild(fieldElement);
            });

            tabPane.appendChild(fieldsContainer);
            contentContainer.appendChild(tabPane);
        });
    }

    // Generate service tabs
    generateServiceTabs(contentContainer) {
        Object.keys(this.serviceSchema).forEach((sectionKey) => {
            const section = this.serviceSchema[sectionKey];
            const tabPane = document.createElement('div');
            tabPane.className = 'tab-pane fade';
            tabPane.id = `services-${sectionKey}`;
            tabPane.setAttribute('role', 'tabpanel');
            
            // Section header
            const header = document.createElement('h4');
            header.className = 'mb-3';
            header.textContent = section.title;
            tabPane.appendChild(header);

            // Services container
            const servicesContainer = document.createElement('div');
            servicesContainer.className = 'row';
            
            Object.keys(section.services).forEach(serviceKey => {
                const service = section.services[serviceKey];
                const serviceElement = this.createServiceToggle(serviceKey, service);
                servicesContainer.appendChild(serviceElement);
            });

            tabPane.appendChild(servicesContainer);
            contentContainer.appendChild(tabPane);
        });
    }

    // Create individual field
    createField(fieldKey, field) {
        const fieldContainer = document.createElement('div');
        fieldContainer.className = 'col-md-6 mb-3';

        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        // Label
        const label = document.createElement('label');
        label.className = 'form-label';
        label.setAttribute('for', fieldKey);
        label.textContent = field.label;
        if (field.required) {
            label.innerHTML += ' <span class="text-danger">*</span>';
        }

        // Input field
        let input;
        switch (field.type) {
            case 'select':
                input = this.createSelectField(fieldKey, field);
                break;
            case 'boolean':
                return this.createBooleanField(fieldKey, field, fieldContainer);
            case 'number':
                input = this.createNumberField(fieldKey, field);
                break;
            case 'text':
            default:
                input = this.createTextField(fieldKey, field);
                break;
        }

        // Help text
        const helpText = document.createElement('div');
        helpText.className = 'form-text text-muted';
        helpText.textContent = field.description;

        formGroup.appendChild(label);
        formGroup.appendChild(input);
        formGroup.appendChild(helpText);
        fieldContainer.appendChild(formGroup);

        // Store validator if needed
        if (field.validation) {
            this.validators.set(fieldKey, field.validation);
        }

        return fieldContainer;
    }

    // Create text field
    createTextField(fieldKey, field) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control';
        input.id = fieldKey;
        input.name = fieldKey;
        if (field.default !== undefined) {
            input.value = field.default;
        }
        if (field.required) {
            input.required = true;
        }
        return input;
    }

    // Create number field
    createNumberField(fieldKey, field) {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'form-control';
        input.id = fieldKey;
        input.name = fieldKey;
        if (field.default !== undefined) {
            input.value = field.default;
        }
        if (field.min !== undefined) {
            input.min = field.min;
        }
        if (field.max !== undefined) {
            input.max = field.max;
        }
        if (field.required) {
            input.required = true;
        }
        return input;
    }

    // Create select field
    createSelectField(fieldKey, field) {
        const select = document.createElement('select');
        select.className = 'form-control form-select';
        select.id = fieldKey;
        select.name = fieldKey;
        
        if (!field.required) {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select an option...';
            select.appendChild(defaultOption);
        }

        field.options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            if (option.value === field.default) {
                optionElement.selected = true;
            }
            select.appendChild(optionElement);
        });

        return select;
    }

    // Create boolean field (checkbox)
    createBooleanField(fieldKey, field, container) {
        container.className = 'col-md-12 mb-3';
        
        const formCheck = document.createElement('div');
        formCheck.className = 'form-check';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'form-check-input';
        input.id = fieldKey;
        input.name = fieldKey;
        input.checked = field.default || false;

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.setAttribute('for', fieldKey);
        label.innerHTML = `<strong>${field.label}</strong>`;

        const helpText = document.createElement('div');
        helpText.className = 'form-text text-muted mt-1';
        helpText.textContent = field.description;

        formCheck.appendChild(input);
        formCheck.appendChild(label);
        formCheck.appendChild(helpText);
        container.appendChild(formCheck);

        return container;
    }

    // Create service toggle
    createServiceToggle(serviceKey, service) {
        const serviceContainer = document.createElement('div');
        serviceContainer.className = 'col-md-6 mb-3';

        const card = document.createElement('div');
        card.className = 'card h-100';

        const cardBody = document.createElement('div');
        cardBody.className = 'card-body';

        const formCheck = document.createElement('div');
        formCheck.className = 'form-check';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'form-check-input';
        input.id = serviceKey;
        input.name = serviceKey;
        input.checked = service.default || false;

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.setAttribute('for', serviceKey);
        label.innerHTML = `<strong>${service.label}</strong>`;

        const description = document.createElement('p');
        description.className = 'card-text text-muted mt-2 mb-0';
        description.style.fontSize = '0.9em';
        description.textContent = service.description;

        // Dependencies info
        if (service.dependsOn && service.dependsOn.length > 0) {
            const depInfo = document.createElement('small');
            depInfo.className = 'text-info d-block mt-1';
            depInfo.innerHTML = `<i class="fas fa-link"></i> Requires: ${service.dependsOn.join(', ')}`;
            description.appendChild(depInfo);
        }

        formCheck.appendChild(input);
        formCheck.appendChild(label);
        cardBody.appendChild(formCheck);
        cardBody.appendChild(description);
        card.appendChild(cardBody);
        serviceContainer.appendChild(card);

        // Store dependencies
        if (service.dependsOn) {
            this.dependencies.set(serviceKey, service.dependsOn);
        }

        return serviceContainer;
    }

    // Set up event listeners
    setupEventListeners() {
        // Tab switching
        const tabButtons = this.container.querySelectorAll('[data-bs-toggle="tab"]');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const targetId = e.target.getAttribute('data-bs-target').substring(1);
                this.activateTab(targetId);
            });
        });

        // Form validation
        const inputs = this.container.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('change', () => this.handleFieldChange(input));
        });

        // Service dependencies
        const serviceCheckboxes = this.container.querySelectorAll('input[type="checkbox"]');
        serviceCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.handleServiceDependencies(checkbox));
        });
    }

    // Activate tab
    activateTab(tabId) {
        // Deactivate all tabs
        const allTabs = this.container.querySelectorAll('.nav-link');
        const allPanes = this.container.querySelectorAll('.tab-pane');

        allTabs.forEach(tab => tab.classList.remove('active'));
        allPanes.forEach(pane => {
            pane.classList.remove('show', 'active');
        });

        // Activate selected tab
        const activeTab = this.container.querySelector(`#${tabId}-tab`);
        const activePane = this.container.querySelector(`#${tabId}`);

        if (activeTab && activePane) {
            activeTab.classList.add('active');
            activePane.classList.add('show', 'active');
        }
    }

    // Validate field
    validateField(input) {
        const fieldKey = input.name;
        const validator = this.validators.get(fieldKey);
        
        if (validator && input.value) {
            const isValid = validator.test(input.value);
            
            if (isValid) {
                input.classList.remove('is-invalid');
                input.classList.add('is-valid');
            } else {
                input.classList.remove('is-valid');
                input.classList.add('is-invalid');
            }
        } else if (input.required && !input.value) {
            input.classList.add('is-invalid');
        } else {
            input.classList.remove('is-invalid', 'is-valid');
        }
    }

    // Handle field changes
    handleFieldChange(input) {
        this.validateField(input);
        // Store in form data
        this.formData[input.name] = input.type === 'checkbox' ? input.checked : input.value;
    }

    // Handle service dependencies
    handleServiceDependencies(checkbox) {
        const serviceKey = checkbox.name;
        const dependencies = this.dependencies.get(serviceKey);

        if (checkbox.checked && dependencies) {
            // Auto-enable dependencies
            dependencies.forEach(depKey => {
                const depCheckbox = this.container.querySelector(`#${depKey}`);
                if (depCheckbox && !depCheckbox.checked) {
                    depCheckbox.checked = true;
                    this.handleFieldChange(depCheckbox);
                }
            });
        }

        this.handleFieldChange(checkbox);
    }

    // Get form data
    getFormData() {
        const data = {};
        
        // Get all form inputs
        const inputs = this.container.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                if (input.checked) {
                    data[input.name] = input.type === 'checkbox' ? 'yes' : input.value;
                }
            } else if (input.value && input.value.trim()) {
                data[input.name] = input.value.trim();
            }
        });

        return data;
    }

    // Set form data
    setFormData(data) {
        Object.keys(data).forEach(key => {
            const input = this.container.querySelector(`#${key}`);
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = data[key] === 'yes' || data[key] === true || data[key] === 'true';
                } else {
                    input.value = data[key];
                }
                this.handleFieldChange(input);
            }
        });
    }

    // Validate entire form
    validateForm() {
        let isValid = true;
        const errors = [];

        // Validate all required fields
        const requiredInputs = this.container.querySelectorAll('input[required], select[required]');
        requiredInputs.forEach(input => {
            if (!input.value || input.value.trim() === '') {
                isValid = false;
                errors.push(`${input.previousElementSibling.textContent.replace(' *', '')} is required`);
                input.classList.add('is-invalid');
            }
        });

        // Validate using custom validators
        const inputs = this.container.querySelectorAll('input, select');
        inputs.forEach(input => {
            this.validateField(input);
            if (input.classList.contains('is-invalid')) {
                isValid = false;
            }
        });

        return { isValid, errors };
    }

    // Reset form
    resetForm() {
        const inputs = this.container.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                const fieldKey = input.name;
                // Find default value in schema
                let defaultValue = false;
                
                // Check service schema first
                Object.values(this.serviceSchema).forEach(section => {
                    if (section.services[fieldKey]) {
                        defaultValue = section.services[fieldKey].default || false;
                    }
                });
                
                input.checked = defaultValue;
            } else {
                // Find default value in config schema
                let defaultValue = '';
                Object.values(this.schema).forEach(section => {
                    if (section.fields[input.name]) {
                        defaultValue = section.fields[input.name].default || '';
                    }
                });
                input.value = defaultValue;
            }
            
            input.classList.remove('is-invalid', 'is-valid');
        });
        
        this.formData = {};
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormGenerator;
} else {
    window.FormGenerator = FormGenerator;
}
