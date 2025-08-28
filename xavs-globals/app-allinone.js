// XAVS Globals Configuration - Cockpit Module (with Storage restored + switch-flat toggles)
// - Uses provided switch HTML/CSS pattern (injected here) with brand colors (green #197560 / red #dc2626)
// - Quick Tips on hover and click (modal) with high z-index
// - Cockpit theme follow; networking/storage logic; YAML preview/export/load/save

console.log('XAVS Globals app starting...');

const BRAND_GREEN = '#197560';
const BRAND_RED   = '#dc2626';

let ALL_INTERFACES = [];

/* ===================== CONFIG SCHEMA ===================== */
const CONFIG_SCHEMA = {
  basics: {
    title: 'XAVS Configuration',
    description: 'Primary networking, domains, and TLS',
    fields: {
      network_interface: {
        type: 'select',
        label: 'API/Management Network Interface',
        description: 'Select the management NIC. Its IPv4 will prefill Internal VIP.',
        options: [],
        default: '',
        required: true
      },
      kolla_internal_vip_address: {
        type: 'text',
        label: 'Internal VIP Address',
        description: 'Select an interface or enter IP manually.',
        placeholder: 'Will auto-fill from selected interface (or enter manually, e.g., 10.0.1.79)',
        default: '',
        required: true,
        validation: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
      },
      kolla_external_vip_address: {
        type: 'text',
        label: 'External VIP Address',
        description: 'Public-facing API VIP (optional).',
        placeholder: 'Externally reachable VIP for public APIs (e.g., 203.0.113.10)',
        default: '',
        required: false,
        validation: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
      },
      domain_setup: {
        type: 'toggle',
        label: 'Domain Setup',
        description: 'Enable domain/FQDN configuration',
        default: 'no',
        required: true
      },
      kolla_internal_fqdn: {
        type: 'text',
        label: 'Internal FQDN',
        description: 'Should resolve to Internal VIP Address',
        placeholder: 'e.g., xavs-int.example.com',
        default: '',
        required: false,
        validation: /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
        visibleWhen: { field: 'domain_setup', equals: 'yes' }
      },
      kolla_external_fqdn: {
        type: 'text',
        label: 'External FQDN',
        description: 'Should resolve to External VIP Address',
        placeholder: 'e.g., xavs.example.com',
        default: '',
        required: false,
        validation: /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
        visibleWhen: { field: 'domain_setup', equals: 'yes' }
      },
      kolla_enable_tls_internal: {
        type: 'toggle',
        label: 'Internal API TLS',
        description: 'Enable TLS for internal APIs',
        default: 'no',
        required: true,
        visibleWhen: { field: 'domain_setup', equals: 'yes' }
      },
      kolla_enable_tls_external: {
        type: 'toggle',
        label: 'External API TLS',
        description: 'Enable TLS for external APIs',
        default: 'no',
        required: true,
        visibleWhen: { field: 'domain_setup', equals: 'yes' }
      },
      kolla_internal_fqdn_cert: {
        type: 'file',
        label: 'Internal FQDN Certificate',
        description: 'Upload certificate file for Internal FQDN (PEM format)',
        placeholder: '',
        default: '',
        required: false,
        accept: '.pem,.crt,.cert',
        uploadPath: '/etc/xavs/certificates',
        visibleWhen: { field: 'kolla_enable_tls_internal', equals: 'yes' }
      },
      kolla_external_fqdn_cert: {
        type: 'file',
        label: 'External FQDN Certificate',
        description: 'Upload certificate file for External FQDN (PEM format)',
        placeholder: '',
        default: '',
        required: false,
        accept: '.pem,.crt,.cert',
        uploadPath: '/etc/xavs/certificates',
        visibleWhen: { field: 'kolla_enable_tls_external', equals: 'yes' }
      }
    }
  },

  network: {
    title: 'Network Configuration',
    description: 'Neutron provider/external networking and extensions',
    fields: {
      neutron_external_interface: {
        type: 'select',
        label: 'Neutron External Interface',
        description: 'Interface dedicated to provider/external networks. Its current IP (if any) will become unusable.',
        default: '',
        required: false,
        options: []
      },
      enable_neutron_provider_networks: {
        type: 'toggle',
        label: 'Enable Neutron Provider Networks',
        description: 'Required when mapping a physical NIC as provider so VMs can reach external networks (Floating IP / egress).',
        default: 'yes',
        required: true,
        visibleWhen: { field: 'neutron_external_interface', equals: '__NONEMPTY__' }
      },
      enable_neutron_vpnaas: {
        type: 'toggle',
        label: 'Enable Neutron VPNaaS',
        description: 'Site-to-site/tenant VPN services.',
        default: 'no',
        required: false
      },
      enable_neutron_qos: {
        type: 'toggle',
        label: 'Enable Neutron QoS',
        description: 'Quality of Service (bandwidth limits, DSCP, min-rate).',
        default: 'no',
        required: false
      },
      enable_neutron_trunk: {
        type: 'toggle',
        label: 'Enable Neutron Trunk',
        description: '802.1Q VLAN trunking for instances.',
        default: 'no',
        required: false
      }
    }
  },

  // ===== RESTORED STORAGE =====
  storage: {
    title: 'Storage Configuration',
    description: 'Block storage options',
    fields: {
      enable_cinder: {
        type: 'toggle',
        label: 'Enable Cinder',
        description: 'Enable block storage service',
        default: 'no',
        required: true
      },
      volume_driver: {
        type: 'select',
        label: 'Volume Driver',
        description: 'Choose the Cinder backend',
        options: ['LVM', 'NFS', 'CEPH', 'SAN'],
        default: 'LVM',
        required: false,
        visibleWhen: { field: 'enable_cinder', equals: 'yes' }
      },
      cinder_volume_group: {
        type: 'select',
        label: 'Cinder Volume Group',
        description: 'Only free VGs (no active LVs) are listed.',
        options: [],
        default: '',
        required: true,
        visibleWhen: { 
          conditions: [
            { field: 'enable_cinder', equals: 'yes' },
            { field: 'volume_driver', equals: 'LVM' }
          ]
        },
        requiredWhen: { 
          conditions: [
            { field: 'enable_cinder', equals: 'yes' },
            { field: 'volume_driver', equals: 'LVM' }
          ]
        }
      },
      enable_cinder_backend_nfs: {
        type: 'toggle',
        label: 'Enable NFS Backend',
        description: 'Make sure you have configured NFS in the shares tab.',
        default: 'no',
        required: false,
        visibleWhen: { 
          conditions: [
            { field: 'enable_cinder', equals: 'yes' },
            { field: 'volume_driver', equals: 'NFS' }
          ]
        }
      },
      note_ceph: {
        type: 'note',
        label: '',
        description: 'These features are coming in future. Please refer to XLOUD guide: https://xloud.tech/knowledgeBase/getting-started for Ceph-based deployment.',
        visibleWhen: { 
          conditions: [
            { field: 'enable_cinder', equals: 'yes' },
            { field: 'volume_driver', equals: 'CEPH' }
          ]
        }
      },
      note_san: {
        type: 'note',
        label: '',
        description: 'These features are coming in future. Please refer to XLOUD guide: https://xloud.tech/knowledgeBase/getting-started for SAN-based deployment.',
        visibleWhen: { 
          conditions: [
            { field: 'enable_cinder', equals: 'yes' },
            { field: 'volume_driver', equals: 'SAN' }
          ]
        }
      }
    }
  },

  monitoring: {
    title: 'Monitoring & Logging',
    description: 'Enable/disable observability services',
    fields: {
      enable_prometheus: { type: 'toggle', label: 'Enable Prometheus', description: '', default: 'no' },
      enable_grafana:    { type: 'toggle', label: 'Enable Grafana',    description: '', default: 'no' },
      enable_central_logging: { type: 'toggle', label: 'Enable Central Logging', description: '', default: 'no' }
    }
  },

  advanced: {
    title: 'Advance Features',
    description: 'Optional platform capabilities',
    fields: {
      enable_kms: {
        type: 'toggle',
        label: 'Enable KMS',
        description: 'When enabled, Barbican will be turned on.',
        default: 'no',
        required: false
      }
    }
  },

  custom: {
    title: 'Custom Configuration',
    description: 'Append custom YAML',
    fields: {
      custom_yaml: {
        type: 'textarea',
        label: 'Custom YAML Configuration',
        description: `<div class="custom-config-help">
          <h6>🔧 Custom YAML Guidelines:</h6>
          <ul>
            <li>Use proper YAML syntax with <code>key: value</code> format</li>
            <li>Use 2 spaces for indentation (no tabs)</li>
            <li>For lists, use <code>- item</code> format</li>
            <li>Avoid duplicating keys from other sections</li>
            <li>Test your YAML syntax before saving</li>
          </ul>
        </div>`,
        placeholder: `# Add your custom configuration here`,
        rows: 15,
        required: false,
        validation: null
      },
      custom_comments: {
        type: 'textarea',
        label: 'Documentation & Comments',
        description: 'Comments will be added above your custom YAML.',
        placeholder: `Document your custom configuration here`,
        rows: 6,
        required: false
      }
    }
  }
};

/* ===================== FORM GENERATOR ===================== */
class FormGenerator {
  constructor(containerId, schema) {
    this.container = document.getElementById(containerId);
    this.schema = schema;
    if (!this.container) throw new Error(`Container with id '${containerId}' not found`);
  }

  async generateForm() {
    injectSwitchCSS(); // ensure the switch-flat CSS exists

    // Tabs header
    let formHtml = `
      <ul class="nav nav-tabs mb-2" id="configTabs" role="tablist" style="list-style:none;padding-left:0;">
    `;
    let keys = Object.keys(this.schema);
    let isFirst = true;
    for (const [sectionKey, section] of Object.entries(this.schema)) {
      formHtml += `
        <li class="nav-item" role="presentation">
          <button class="nav-link ${isFirst ? 'active' : ''}" id="${sectionKey}-tab" data-bs-toggle="tab"
                  data-bs-target="#${sectionKey}-pane" type="button" role="tab">
            ${section.title}
          </button>
        </li>`;
      isFirst = false;
    }
    formHtml += '</ul><div class="tab-content" id="configTabsContent">';

    // Panes
    isFirst = true;
    let idx = 0;
    for (const [sectionKey, section] of Object.entries(this.schema)) {
      const isActive = isFirst ? 'show active' : '';
      formHtml += `
        <div class="tab-pane fade ${isActive}" id="${sectionKey}-pane" role="tabpanel" data-tab-index="${idx}">
          <div class="card">
            <div class="card-body">
              <div class="row">`;

      // Fields loop
      for (const [fieldKey, field] of Object.entries(section.fields)) {
        const fieldId = `${sectionKey}_${fieldKey}`;
        const requiredMark = field.required ? '<span class="text-danger">*</span>' : '';
        const isTextArea = field.type === 'textarea';
        const isNote = field.type === 'note';
        const colClass = (isTextArea || isNote) ? 'col-12' : 'col-md-6';
        formHtml += `<div class="${colClass}" style="margin-bottom:18px;">`;

        if (field.type === 'toggle') {
          const defYes = String(field.default).toLowerCase() === 'yes';
          formHtml += `
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <label class="form-label" style="margin:0 12px 0 0;">${field.label} ${requiredMark}</label>

              <!-- switch-flat control -->
              <label class="switch switch-flat" style="margin:0;">
                <input class="switch-input" type="checkbox" id="${fieldId}" name="${fieldId}" ${defYes ? 'checked' : ''}/>
                <span class="switch-label" data-on="YES" data-off="NO"></span>
                <span class="switch-handle"></span>
              </label>
            </div>`;
          if (field.description)
            formHtml += `<div class="form-text">${field.description}</div>`;
          if (fieldId === 'network_neutron_external_interface')
            formHtml += `<div id="neutron_ext_ip_hint" class="form-text"></div>`;
          if (fieldId === 'storage_cinder_volume_group')
            formHtml += `<div id="cinder_vg_hint" class="form-text"></div>`;
          formHtml += `</div>`;
          continue;
        }

        // Label for non-toggles
        if (!isNote) {
          formHtml += `<label for="${fieldId}" class="form-label" style="margin-bottom:6px;">${field.label} ${requiredMark}</label>`;
        }

        // Controls
        if (field.type === 'select') {
          formHtml += `<select class="form-control" id="${fieldId}" name="${fieldId}" style="height:32px;" ${field.required ? 'required' : ''}></select>`;
        } else if (field.type === 'number') {
          const minAttr = field.min !== undefined ? `min="${field.min}"` : '';
          const maxAttr = field.max !== undefined ? `max="${field.max}"` : '';
          formHtml += `<input type="number" class="form-control" id="${fieldId}" name="${fieldId}" style="height:32px;" value="${field.default || ''}" ${minAttr} ${maxAttr} ${field.required ? 'required' : ''}>`;
        } else if (field.type === 'textarea') {
          const rows = field.rows || 4;
          const placeholder = field.placeholder ? `placeholder="${field.placeholder.replace(/"/g, '&quot;')}"` : '';
          formHtml += `<textarea class="form-control font-monospace" id="${fieldId}" name="${fieldId}" rows="${rows}" ${placeholder} ${field.required ? 'required' : ''}>${field.default || ''}</textarea>`;
        } else if (field.type === 'note') {
          formHtml += `<div id="${fieldId}" class="alert alert-warning py-2 mb-0 small">${field.description || ''}</div>`;
        } else if (field.type === 'file') {
          const acceptAttr = field.accept ? `accept="${field.accept}"` : '';
          formHtml += `<div class="file-upload-container">
            <input type="file" class="form-control" id="${fieldId}" name="${fieldId}" ${acceptAttr} ${field.required ? 'required' : ''}>
            <div class="file-status mt-2" id="${fieldId}_status" style="display: none;">
              <div class="file-info"></div>
              <div class="upload-progress" style="display: none;">
                <div class="progress">
                  <div class="progress-bar" role="progressbar" style="width: 0%"></div>
                </div>
              </div>
            </div>
          </div>`;
        } else {
          const placeholder = field.placeholder ? `placeholder="${field.placeholder.replace(/"/g, '&quot;')}"` : '';
          formHtml += `<input type="text" class="form-control" id="${fieldId}" name="${fieldId}" style="height:32px;" value="${field.default || ''}" ${placeholder} ${field.required ? 'required' : ''}>`;
        }

        if (field.description && field.type !== 'note')
          formHtml += `<div class="form-text">${field.description}</div>`;

        if (fieldId === 'network_neutron_external_interface')
          formHtml += `<div id="neutron_ext_ip_hint" class="form-text"></div>`;
        if (fieldId === 'storage_cinder_volume_group')
          formHtml += `<div id="cinder_vg_hint" class="form-text"></div>`;

        formHtml += `</div>`;
      }

      // Per-tab nav
      const prevDisabled = (idx === 0) ? 'disabled' : '';
      const nextDisabled = (idx === keys.length-1) ? 'disabled' : '';
      formHtml += `
              </div>
              <div class="tab-nav" style="margin-top:8px;padding-top:10px;border-top:1px solid var(--border, #d1d5db);display:flex;justify-content:space-between;">
                <button type="button" class="btn btn-outline-brand prev-tab" ${prevDisabled}>Back</button>
                <button type="button" class="btn btn-brand next-tab" ${nextDisabled}>Next</button>
              </div>
            </div>
          </div>
        </div>`;
      isFirst = false;
      idx++;
    }
    formHtml += '</div>';

    this.container.innerHTML = formHtml;

    this.initializeTabs();
    populateSelectOptionsFromSchema(this.container, this.schema);
    wireTabNav();
    wireFlatSwitches(); // set yes/no values on checkbox switches
    
    // Add real-time validation after a small delay to ensure DOM is ready
    setTimeout(() => {
      this.setupRealTimeValidation();
      setupFileUploadHandlers(); // Setup file upload handling
    }, 100);
  }

  initializeTabs() {
    const tabButtons = this.container.querySelectorAll('[data-bs-toggle="tab"]');
    const tabPanes   = this.container.querySelectorAll('.tab-pane');
    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('show','active'));
        button.classList.add('active');
        const targetId = button.getAttribute('data-bs-target');
        const targetPane = this.container.querySelector(targetId);
        if (targetPane) targetPane.classList.add('show','active');
      });
    });
  }

  setupRealTimeValidation() {
    // Create a flat lookup of all fields across all sections
    const allFields = {};
    for (const [sectionKey, section] of Object.entries(this.schema)) {
      if (section.fields) {
        for (const [fieldKey, fieldDef] of Object.entries(section.fields)) {
          allFields[fieldKey] = fieldDef;
        }
      }
    }
    
    // Add real-time validation for input fields with validation patterns
    const inputs = this.container.querySelectorAll('input[type="text"]');
    
    inputs.forEach(input => {
      const fullName = input.name || '';
      const id = input.id || '';
      
      // Extract field name from fieldId format: sectionKey_fieldKey
      let fieldName = '';
      if (fullName) {
        const parts = fullName.split('_');
        fieldName = parts.length > 1 ? parts.slice(1).join('_') : parts[0];
      } else if (id) {
        const parts = id.split('_');
        fieldName = parts.length > 1 ? parts.slice(1).join('_') : parts[0];
      }
      
      // Check if this field has validation in our flat lookup
      const fieldDef = allFields[fieldName];
      const hasValidation = fieldDef && fieldDef.validation;
      
      if (hasValidation) {
        // Add input event listener for real-time validation  
        const inputHandler = (e) => {
          this.validateFieldRealTime(e.target, fieldDef, fieldName);
        };
        
        const blurHandler = (e) => {
          this.validateFieldRealTime(e.target, fieldDef, fieldName);
        };
        
        input.addEventListener('input', inputHandler);
        input.addEventListener('blur', blurHandler);
        
        // Store references for potential cleanup
        input._realTimeValidationHandlers = { inputHandler, blurHandler };
      }
    });
  }

  validateFieldRealTime(input, fieldDef, fieldName) {
    const value = input.value.trim();
    const labelElement = input.closest('.form-group')?.querySelector('label');
    const label = labelElement ? labelElement.textContent : fieldName;
    
    // Clear previous validation state
    input.classList.remove('is-invalid');
    
    // Remove any existing error messages for this field
    const existingError = input.parentNode?.querySelector('.real-time-validation-error');
    if (existingError) {
      existingError.remove();
    }
    
    // Only validate if field has content
    if (value && fieldDef.validation) {
      try {
        const re = fieldDef.validation;
        const isValid = re.test(value);
        
        if (!isValid) {
          // Add validation error styling
          input.classList.add('is-invalid');
          
          // Generate specific error message
          let errorMsg = `${label.trim()} has invalid format`;
          if (fieldName.includes('vip_address') || fieldName.includes('_address')) {
            errorMsg = `Must be a valid IPv4 address (e.g., 192.168.1.100)`;
          } else if (fieldName.includes('fqdn')) {
            errorMsg = `Must be a valid domain name with at least one dot (e.g., example.com)`;
          }
          
          // Create and show error message
          const errorDiv = document.createElement('div');
          errorDiv.className = 'real-time-validation-error text-danger small mt-1';
          errorDiv.textContent = errorMsg;
          input.parentNode.appendChild(errorDiv);
          
          // Highlight the tab containing this field
          const tabPane = input.closest('.tab-pane');
          if (tabPane) {
            const tabButton = document.querySelector(`[data-bs-target="#${tabPane.id}"]`);
            if (tabButton) {
              tabButton.style.color = '#dc2626';
              tabButton.style.fontWeight = 'bold';
            }
          }
        } else {
          // Valid input - remove tab highlighting if no other invalid fields in tab
          const tabPane = input.closest('.tab-pane');
          if (tabPane) {
            const invalidFieldsInTab = tabPane.querySelectorAll('.is-invalid');
            if (invalidFieldsInTab.length === 0) {
              const tabButton = document.querySelector(`[data-bs-target="#${tabPane.id}"]`);
              if (tabButton) {
                tabButton.style.color = '';
                tabButton.style.fontWeight = '';
              }
            }
          }
        }
      } catch (e) {
        console.warn('Real-time validation error:', e);
      }
    }
  }

  getFormData() {
    const data = {};
    const inputs = this.container.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      const parts = (input.name || '').split('_');
      const section = parts[0];
      const field   = parts.slice(1).join('_');
      if (!section || !field) return;
      if (!data[section]) data[section] = {};

      if (input.classList.contains('switch-input')) {
        data[section][field] = input.checked ? 'yes' : 'no';
      } else if (input.type === 'number') {
        data[section][field] = input.value ? parseInt(input.value) : undefined;
      } else if (input.type === 'file') {
        // For file inputs, use the uploaded file path
        data[section][field] = input.getAttribute('data-file-path') || '';
      } else {
        data[section][field] = input.value;
      }
    });
    return data;
  }

  validateForm() {
    const errors = [];
    const inputs = this.container.querySelectorAll('input, select, textarea');
    console.log(`Validating ${inputs.length} form inputs...`);
    
    // First, clear all previous error states
    inputs.forEach(input => {
      input.classList.remove('is-invalid');
    });
    
    inputs.forEach(input => {
      const wrapper = input.closest('[style*="margin-bottom"]');
      const isHidden = wrapper && wrapper.style.display === 'none';
      
      if (isHidden) {
        console.log(`Skipping hidden field: ${input.name || input.id}`);
        return;
      }

      const parts = (input.name || '').split('_');
      if (parts.length < 2) {
        console.log(`Skipping field with invalid name format: ${input.name}`);
        return;
      }
      
      const section = parts[0];
      const key     = parts.slice(1).join('_');
      const fieldDef = CONFIG_SCHEMA?.[section]?.fields?.[key];
      
      if (!fieldDef) {
        console.log(`No field definition found for: ${section}.${key}`);
        return;
      }

      const label = wrapper ? (wrapper.querySelector('.form-label')?.textContent || key) : key;

      // Check if field should be required based on conditional requirements
      let isRequired = fieldDef.required;
      if (fieldDef.requiredWhen && fieldDef.requiredWhen.conditions) {
        // Get current form values for conditional logic
        const formValues = {};
        this.container.querySelectorAll('input, select, textarea').forEach(el => {
          if (!el.name) return;
          const parts = el.name.split('_');
          const sec = parts[0];
          const k = parts.slice(1).join('_');
          const val = el.classList.contains('switch-input') ? (el.checked ? 'yes' : 'no') : el.value;
          formValues[`${sec}.${k}`] = val;
        });

        // Check if ALL conditions for required are met
        const conditionResults = fieldDef.requiredWhen.conditions.map(condition => {
          const depVal = formValues[`${section}.${condition.field}`] || '';
          const result = depVal === condition.equals;
          return { condition, depVal, result };
        });
        
        const allConditionsMet = conditionResults.every(cr => cr.result);
        isRequired = allConditionsMet;
        
        console.log(`Conditional requirement check for ${section}.${key}:`, {
          defaultRequired: fieldDef.required,
          conditions: conditionResults,
          finalRequired: isRequired,
          currentValue: input.value
        });
      }

      if (fieldDef.type !== 'toggle' && fieldDef.type !== 'note') {
        if (isRequired && !String(input.value || '').trim()) {
          const errorMsg = `${label.trim()} is required`;
          errors.push(errorMsg);
          input.classList.add('is-invalid');
          console.log(`Validation error: ${errorMsg}`);
          
          // Also highlight the tab containing this field
          const tabPane = input.closest('.tab-pane');
          if (tabPane) {
            const tabId = tabPane.id.replace('-pane', '');
            const tabButton = document.querySelector(`[data-bs-target="#${tabPane.id}"]`);
            if (tabButton) {
              tabButton.style.color = '#dc2626';
              tabButton.style.fontWeight = 'bold';
            }
          }
          return;
        }
        if (fieldDef.validation && input.value) {
          try {
            const re = fieldDef.validation;
            if (!re.test(input.value)) {
              // Generate specific error messages based on field type
              let errorMsg = `${label.trim()} has invalid format`;
              if (name.includes('vip_address') || name.includes('_address')) {
                errorMsg = `${label.trim()} must be a valid IPv4 address (e.g., 192.168.1.100)`;
              } else if (name.includes('fqdn')) {
                errorMsg = `${label.trim()} must be a valid domain name (e.g., example.com or sub.example.com)`;
              }
              
              errors.push(errorMsg);
              input.classList.add('is-invalid');
              
              // Also highlight the tab containing this field
              const tabPane = input.closest('.tab-pane');
              if (tabPane) {
                const tabId = tabPane.id.replace('-pane', '');
                const tabButton = document.querySelector(`[data-bs-target="#${tabPane.id}"]`);
                if (tabButton) {
                  tabButton.style.color = '#dc2626';
                  tabButton.style.fontWeight = 'bold';
                }
              }
              return;
            }
          } catch (e) {}
        }
      }
      input.classList.remove('is-invalid');
      
      // Remove tab highlighting if field is valid
      const tabPane = input.closest('.tab-pane');
      if (tabPane && !input.classList.contains('is-invalid')) {
        const tabButton = document.querySelector(`[data-bs-target="#${tabPane.id}"]`);
        if (tabButton) {
          tabButton.style.color = '';
          tabButton.style.fontWeight = '';
        }
      }
    });
    
    // Additional validation: Certificate files must have corresponding FQDN fields
    const certificateInputs = this.container.querySelectorAll('input[type="file"]');
    certificateInputs.forEach(certInput => {
      const wrapper = certInput.closest('[style*="margin-bottom"]');
      const isHidden = wrapper && wrapper.style.display === 'none';
      
      // Skip validation for hidden certificate fields
      if (isHidden) {
        console.log(`Skipping hidden certificate field: ${certInput.id}`);
        return;
      }
      
      // Check if certificate has been uploaded (has a file or data-file-path)
      const hasFile = certInput.files && certInput.files.length > 0;
      const hasPath = certInput.getAttribute('data-file-path');
      
      if (hasFile || hasPath) {
        const fqdnValidation = validateCertificateWithFQDN(certInput);
        if (!fqdnValidation.valid) {
          const label = wrapper ? (wrapper.querySelector('.form-label')?.textContent || certInput.id) : certInput.id;
          errors.push(`${label}: ${fqdnValidation.error}`);
          
          // Highlight the certificate field
          certInput.classList.add('is-invalid');
          
          // Highlight the required FQDN field if it exists
          if (fqdnValidation.requiredField) {
            const requiredElement = document.getElementById(fqdnValidation.requiredField);
            if (requiredElement) {
              requiredElement.classList.add('is-invalid');
            }
          }
          
          // Highlight the tab containing this field
          const tabPane = certInput.closest('.tab-pane');
          if (tabPane) {
            const tabButton = document.querySelector(`[data-bs-target="#${tabPane.id}"]`);
            if (tabButton) {
              tabButton.style.color = '#dc2626';
              tabButton.style.fontWeight = 'bold';
            }
          }
          
          console.log(`Certificate-FQDN validation error: ${fqdnValidation.error}`);
        }
      }
    });
    
    // Additional validation: When TLS is enabled, corresponding certificates AND FQDNs must be provided
    const tlsCertValidations = [
      {
        tlsToggle: 'basics_kolla_enable_tls_internal',
        certField: 'basics_kolla_internal_fqdn_cert',
        fqdnField: 'basics_kolla_internal_fqdn',
        tlsType: 'Internal',
        description: 'Internal TLS'
      },
      {
        tlsToggle: 'basics_kolla_enable_tls_external', 
        certField: 'basics_kolla_external_fqdn_cert',
        fqdnField: 'basics_kolla_external_fqdn',
        tlsType: 'External',
        description: 'External TLS'
      }
    ];
    
    tlsCertValidations.forEach(validation => {
      const tlsToggle = document.getElementById(validation.tlsToggle);
      const certInput = document.getElementById(validation.certField);
      const fqdnInput = document.getElementById(validation.fqdnField);
      
      // Check if TLS toggle is enabled and visible
      const tlsWrapper = tlsToggle?.closest('[style*="margin-bottom"]');
      const tlsIsHidden = tlsWrapper && tlsWrapper.style.display === 'none';
      
      if (tlsToggle && !tlsIsHidden && tlsToggle.checked) {
        console.log(`🔍 Validating ${validation.description} requirements: TLS enabled, checking certificate and FQDN...`);
        
        let hasValidationErrors = false;
        
        // 1. Check if certificate is uploaded
        const hasFile = certInput?.files && certInput.files.length > 0;
        const hasPath = certInput?.getAttribute('data-file-path');
        
        if (!hasFile && !hasPath) {
          const errorMsg = `${validation.tlsType} TLS Certificate is required when ${validation.description} is enabled. Please upload a certificate file.`;
          errors.push(errorMsg);
          hasValidationErrors = true;
          
          if (certInput) {
            certInput.classList.add('is-invalid');
            console.log(`❌ Certificate missing for ${validation.description}`);
          }
        } else {
          console.log(`✅ Certificate found for ${validation.description}`);
        }
        
        // 2. Check if FQDN is provided
        if (!fqdnInput?.value?.trim()) {
          const fqdnErrorMsg = `${validation.tlsType} FQDN is required when ${validation.description} is enabled. Please enter a valid FQDN.`;
          errors.push(fqdnErrorMsg);
          hasValidationErrors = true;
          
          if (fqdnInput) {
            fqdnInput.classList.add('is-invalid');
            console.log(`❌ FQDN missing for ${validation.description}`);
          }
        } else {
          // 3. Validate FQDN format
          const fqdnPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
          if (!fqdnPattern.test(fqdnInput.value.trim())) {
            const fqdnFormatErrorMsg = `${validation.tlsType} FQDN must be a valid domain name (e.g., example.com or sub.example.com).`;
            errors.push(fqdnFormatErrorMsg);
            hasValidationErrors = true;
            
            if (fqdnInput) {
              fqdnInput.classList.add('is-invalid');
              console.log(`❌ Invalid FQDN format for ${validation.description}: ${fqdnInput.value}`);
            }
          } else {
            console.log(`✅ FQDN valid for ${validation.description}: ${fqdnInput.value}`);
          }
        }
        
        // 4. If both certificate and FQDN exist, validate they match
        if ((hasFile || hasPath) && fqdnInput?.value?.trim() && certInput) {
          const fqdnValidation = validateCertificateWithFQDN(certInput);
          if (!fqdnValidation.valid) {
            errors.push(`${validation.tlsType} TLS: ${fqdnValidation.error}`);
            hasValidationErrors = true;
            
            certInput.classList.add('is-invalid');
            if (fqdnInput) fqdnInput.classList.add('is-invalid');
            console.log(`❌ Certificate-FQDN mismatch for ${validation.description}: ${fqdnValidation.error}`);
          } else {
            console.log(`✅ Certificate-FQDN validation passed for ${validation.description}`);
          }
        }
        
        // Highlight tabs containing validation errors
        if (hasValidationErrors) {
          [certInput, fqdnInput].forEach(element => {
            if (element) {
              const tabPane = element.closest('.tab-pane');
              if (tabPane) {
                const tabButton = document.querySelector(`[data-bs-target="#${tabPane.id}"]`);
                if (tabButton) {
                  tabButton.style.color = '#dc2626';
                  tabButton.style.fontWeight = 'bold';
                }
              }
            }
          });
        }
        
        console.log(`${hasValidationErrors ? '❌' : '✅'} ${validation.description} validation complete`);
      }
    });
    
    console.log(`Validation complete: ${errors.length} errors found`, errors);
    return errors;
  }
}

let formGenerator = null;

/* ===================== FILE UPLOAD HANDLING ===================== */
async function setupFileUploadHandlers() {
  const fileInputs = document.querySelectorAll('input[type="file"]');
  
  fileInputs.forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const fieldName = input.name;
      const statusDiv = document.getElementById(`${fieldName}_status`);
      const fileInfo = statusDiv?.querySelector('.file-info');
      const progressDiv = statusDiv?.querySelector('.upload-progress');
      const progressBar = progressDiv?.querySelector('.progress-bar');
      
      if (!file) {
        if (statusDiv) statusDiv.style.display = 'none';
        return;
      }
      
      // Immediate validation before processing
      const validationResult = validateCertificateFile(file);
      if (!validationResult.valid) {
        console.error(`❌ File validation failed: ${validationResult.error}`);
        
        // Show validation error
        if (statusDiv && fileInfo) {
          statusDiv.style.display = 'block';
          fileInfo.innerHTML = `
            <small class="text-danger">
              <strong>Validation Failed:</strong> ${file.name}
              <br><strong>Error:</strong> ${validationResult.error}
              <br><strong>Status:</strong> <span class="text-danger">❌ Invalid file</span>
            </small>
          `;
        }
        
        // Clear the file input
        input.value = '';
        showStatus(`File validation failed: ${validationResult.error}`, 'danger');
        return;
      }
      
      // FQDN dependency validation for certificate files
      const fqdnValidationResult = validateCertificateWithFQDN(input);
      if (!fqdnValidationResult.valid) {
        console.error(`❌ FQDN validation failed: ${fqdnValidationResult.error}`);
        
        // Show FQDN validation error with helpful guidance
        if (statusDiv && fileInfo) {
          statusDiv.style.display = 'block';
          fileInfo.innerHTML = `
            <small class="text-warning">
              <strong>Missing Dependency:</strong> ${file.name}
              <br><strong>Error:</strong> ${fqdnValidationResult.error}
              <br><strong>Action Required:</strong> <span class="text-info">📝 Fill the required FQDN field first</span>
            </small>
          `;
          
          // Highlight the required field
          if (fqdnValidationResult.requiredField) {
            const requiredElement = document.getElementById(fqdnValidationResult.requiredField);
            if (requiredElement) {
              requiredElement.style.border = '2px solid #ffc107';
              requiredElement.focus();
              
              // Remove highlight after user interaction
              const removeHighlight = () => {
                requiredElement.style.border = '';
                requiredElement.removeEventListener('input', removeHighlight);
                requiredElement.removeEventListener('focus', removeHighlight);
              };
              requiredElement.addEventListener('input', removeHighlight);
              requiredElement.addEventListener('focus', removeHighlight);
            }
          }
        }
        
        // Clear the file input
        input.value = '';
        showStatus(`Certificate validation failed: ${fqdnValidationResult.error}`, 'warning');
        return;
      }
      
      // Show file info for valid files
      if (statusDiv && fileInfo) {
        statusDiv.style.display = 'block';
        fileInfo.innerHTML = `
          <small class="text-muted">
            <strong>Selected:</strong> ${file.name} (${formatFileSize(file.size)})
            <br><strong>For FQDN:</strong> <span class="text-info">${fqdnValidationResult.fqdnValue}</span>
            <br><strong>Certificate Type:</strong> ${fqdnValidationResult.certificateType}
            <br><strong>Status:</strong> <span class="text-warning">Ready to upload</span>
          </small>
        `;
      }
      
      // Add session protection and error handling
      try {
        console.log(`🔐 Starting secure upload for: ${file.name}`);
        await uploadCertificateFile(input, file);
      } catch (error) {
        console.error(`❌ Upload failed for ${file.name}:`, error);
        
        // Show error and clear input
        if (statusDiv && fileInfo) {
          fileInfo.innerHTML = `
            <small class="text-danger">
              <strong>Upload Failed:</strong> ${file.name}
              <br><strong>Error:</strong> ${error.message}
              <br><strong>Status:</strong> <span class="text-danger">❌ Upload failed</span>
            </small>
          `;
        }
        
        // Clear the problematic file
        input.value = '';
        input.removeAttribute('data-file-path');
        
        showStatus(`Upload failed: ${error.message}`, 'danger');
      }
    });
  });
}

async function uploadCertificateFile(input, file) {
  const fieldName = input.name;
  const statusDiv = document.getElementById(`${fieldName}_status`);
  const fileInfo = statusDiv?.querySelector('.file-info');
  const progressDiv = statusDiv?.querySelector('.upload-progress');
  const progressBar = progressDiv?.querySelector('.progress-bar');
  
  try {
    // Validate file before processing
    const validationResult = validateCertificateFile(file);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }
    
    // Show progress
    if (progressDiv && progressBar) {
      progressDiv.style.display = 'block';
      progressBar.style.width = '10%';
    }
    
    // Update status
    if (fileInfo) {
      fileInfo.innerHTML = `
        <small class="text-info">
          <strong>Uploading:</strong> ${file.name} (${formatFileSize(file.size)})
          <br><strong>Status:</strong> <span class="text-info">Uploading to /etc/xavs/certificates...</span>
        </small>
      `;
    }
    
    // Read file content as text (safe for certificate files)
    const fileContent = await readFileAsText(file);
    
    // Additional content validation
    if (!isCertificateContent(fileContent)) {
      throw new Error('File does not appear to contain valid certificate content');
    }
    
    // Progress update
    if (progressBar) progressBar.style.width = '50%';
    
    // Get field definition for upload path
    const fieldDef = getFieldDefinition(fieldName);
    const uploadPath = fieldDef?.uploadPath || '/etc/xavs/certificates';
    const fileName = sanitizeFileName(file.name);
    const fullPath = `${uploadPath}/${fileName}`;
    
    // Create directory if it doesn't exist
    await ensureDirectoryExists(uploadPath);
    
    // Progress update
    if (progressBar) progressBar.style.width = '75%';
    
    // Write file to target location
    await writeFileToSystem(fullPath, fileContent);
    
    // Progress complete
    if (progressBar) progressBar.style.width = '100%';
    
    // Update field value to the file path
    input.setAttribute('data-file-path', fullPath);
    
    // Success status
    if (fileInfo) {
      fileInfo.innerHTML = `
        <small class="text-success">
          <strong>Uploaded:</strong> ${file.name} (${formatFileSize(file.size)})
          <br><strong>Path:</strong> <code>${fullPath}</code>
          <br><strong>Status:</strong> <span class="text-success">✅ Upload successful</span>
        </small>
      `;
    }
    
    // Hide progress after delay
    setTimeout(() => {
      if (progressDiv) progressDiv.style.display = 'none';
    }, 2000);
    
    console.log(`✅ Certificate uploaded successfully: ${fullPath}`);
    
  } catch (error) {
    console.error('❌ Certificate upload failed:', error);
    
    // Error status
    if (fileInfo) {
      fileInfo.innerHTML = `
        <small class="text-danger">
          <strong>Upload Failed:</strong> ${file.name}
          <br><strong>Error:</strong> ${error.message}
          <br><strong>Status:</strong> <span class="text-danger">❌ Upload failed</span>
        </small>
      `;
    }
    
    // Hide progress
    if (progressDiv) progressDiv.style.display = 'none';
    
    // Show error message to user
    showStatus(`Certificate upload failed: ${error.message}`, 'danger');
  }
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    // Add timeout protection
    const timeout = setTimeout(() => {
      reject(new Error('File reading timeout - file may be too large or corrupted'));
    }, 30000); // 30 second timeout
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      clearTimeout(timeout);
      const content = e.target.result;
      
      // Additional safety check
      if (typeof content !== 'string') {
        reject(new Error('File content is not text format'));
        return;
      }
      
      // Check content size (should not exceed 5MB for certificate files)
      if (content.length > 5 * 1024 * 1024) {
        reject(new Error('File content too large for a certificate file'));
        return;
      }
      
      resolve(content);
    };
    
    reader.onerror = (e) => {
      clearTimeout(timeout);
      reject(new Error('Failed to read file: ' + (e.target.error?.message || 'Unknown error')));
    };
    
    reader.onabort = (e) => {
      clearTimeout(timeout);
      reject(new Error('File reading was aborted'));
    };
    
    try {
      reader.readAsText(file);
    } catch (error) {
      clearTimeout(timeout);
      reject(new Error('Failed to start reading file: ' + error.message));
    }
  });
}

function validateCertificateFile(file) {
  console.log(`🔍 Validating file: ${file.name}, size: ${file.size}, type: ${file.type}`);
  
  // File size limit (10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(maxSize)})`
    };
  }
  
  // Minimum file size (should be at least a few bytes)
  if (file.size < 10) {
    return {
      valid: false,
      error: 'File is too small to be a valid certificate'
    };
  }
  
  // File extension validation
  const allowedExtensions = ['.pem', '.crt', '.cert', '.cer', '.p7b', '.p7c', '.der'];
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
  
  if (!hasValidExtension) {
    return {
      valid: false,
      error: `Invalid file type. Please upload a certificate file with one of these extensions: ${allowedExtensions.join(', ')}`
    };
  }
  
  return { valid: true };
}

function validateCertificateWithFQDN(fileInputElement) {
  console.log(`🔍 Validating certificate with FQDN dependency for: ${fileInputElement.id}`);
  
  // Determine which FQDN field is required based on certificate type
  let requiredFqdnField = '';
  let certificateType = '';
  
  if (fileInputElement.id === 'basics_kolla_internal_fqdn_cert') {
    requiredFqdnField = 'basics_kolla_internal_fqdn';
    certificateType = 'Internal';
  } else if (fileInputElement.id === 'basics_kolla_external_fqdn_cert') {
    requiredFqdnField = 'basics_kolla_external_fqdn';
    certificateType = 'External';
  } else {
    // Unknown certificate type, skip validation
    return { valid: true };
  }
  
  // Check if the required FQDN field exists and has a value
  const fqdnElement = document.getElementById(requiredFqdnField);
  if (!fqdnElement) {
    return {
      valid: false,
      error: `Required FQDN field not found: ${requiredFqdnField}`
    };
  }
  
  const fqdnValue = fqdnElement.value?.trim();
  if (!fqdnValue) {
    return {
      valid: false,
      error: `${certificateType} certificate requires the ${certificateType} FQDN field to be filled. Please enter a valid FQDN in the "${certificateType} FQDN" field before uploading the certificate.`,
      requiredField: requiredFqdnField,
      certificateType: certificateType
    };
  }
  
  // Validate the FQDN format
  const fqdnPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!fqdnPattern.test(fqdnValue)) {
    return {
      valid: false,
      error: `${certificateType} certificate requires a valid FQDN format in the "${certificateType} FQDN" field. Please enter a valid FQDN (e.g., example.com) before uploading the certificate.`,
      requiredField: requiredFqdnField,
      certificateType: certificateType
    };
  }
  
  console.log(`✅ FQDN validation passed: ${certificateType} certificate with FQDN "${fqdnValue}"`);
  return { 
    valid: true, 
    fqdnValue: fqdnValue,
    certificateType: certificateType
  };
}

function isCertificateContent(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }
  
  const trimmedContent = content.trim();
  
  // Check for common certificate markers
  const certificateMarkers = [
    '-----BEGIN CERTIFICATE-----',
    '-----BEGIN TRUSTED CERTIFICATE-----',
    '-----BEGIN X509 CERTIFICATE-----',
    '-----BEGIN PKCS7-----',
    '-----BEGIN PRIVATE KEY-----',
    '-----BEGIN RSA PRIVATE KEY-----',
    '-----BEGIN EC PRIVATE KEY-----',
    '-----BEGIN PUBLIC KEY-----'
  ];
  
  const hasValidMarker = certificateMarkers.some(marker => 
    trimmedContent.includes(marker)
  );
  
  if (!hasValidMarker) {
    console.warn('⚠️ File content does not contain recognizable certificate markers');
    return false;
  }
  
  // Basic structure check for PEM format
  if (trimmedContent.includes('-----BEGIN')) {
    const beginCount = (trimmedContent.match(/-----BEGIN/g) || []).length;
    const endCount = (trimmedContent.match(/-----END/g) || []).length;
    
    if (beginCount !== endCount) {
      console.warn('⚠️ Unmatched BEGIN/END markers in certificate content');
      return false;
    }
  }
  
  return true;
}

async function ensureDirectoryExists(dirPath) {
  try {
    // Add timeout protection for directory creation
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Directory creation timeout')), 30000) // 30 second timeout
    );
    
    const createPromise = cockpit.spawn(['mkdir', '-p', dirPath], { superuser: 'require' });
    
    await Promise.race([createPromise, timeoutPromise]);
    console.log(`📁 Directory created/verified: ${dirPath}`);
  } catch (error) {
    console.warn(`⚠️ Directory creation warning: ${error.message}`);
    // Continue - directory might already exist
  }
}

async function writeFileToSystem(filePath, content) {
  try {
    // Add timeout protection for file writing
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('File write timeout')), 60000) // 60 second timeout
    );
    
    const writePromise = cockpit.file(filePath, { superuser: 'require' }).replace(content);
    
    await Promise.race([writePromise, timeoutPromise]);
    console.log(`📄 File written successfully: ${filePath}`);
  } catch (error) {
    throw new Error(`Failed to write file to ${filePath}: ${error.message}`);
  }
}

function sanitizeFileName(fileName) {
  // Remove or replace invalid characters
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFieldDefinition(fieldName) {
  // Extract field name and find in schema
  const cleanFieldName = fieldName.split('_').slice(1).join('_');
  for (const [sectionKey, section] of Object.entries(CONFIG_SCHEMA)) {
    if (section.fields && section.fields[cleanFieldName]) {
      return section.fields[cleanFieldName];
    }
  }
  return null;
}

/* ===================== THEME FOLLOW (Cockpit) ===================== */
function applyCockpitTheme() {
  const root = document.documentElement;
  const body = document.body;
  const cls = `${root.className} ${body.className}`;
  let dark = /\bpf-theme-dark\b/.test(cls) || body.getAttribute('data-theme') === 'dark' || root.getAttribute('data-theme') === 'dark';
  if (/\bpf-theme-light\b/.test(cls) || body.getAttribute('data-theme') === 'light' || root.getAttribute('data-theme') === 'light') {
    dark = false;
  }
  body.setAttribute('data-theme', dark ? 'dark' : 'light');
}
function watchCockpitTheme() {
  applyCockpitTheme();
  const obs = new MutationObserver(applyCockpitTheme);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  obs.observe(document.body,           { attributes: true, attributeFilter: ['class', 'data-theme'] });
}

/* ===================== UI HELPERS ===================== */
function populateSelectOptionsFromSchema(container, schema) {
  for (const [sectionKey, section] of Object.entries(schema)) {
    for (const [fieldKey, field] of Object.entries(section.fields)) {
      if (field.type !== 'select') continue;
      const el = container.querySelector(`#${sectionKey}_${fieldKey}`);
      if (!el) continue;

      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '— Select —';
      el.appendChild(ph);

      (field.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (field.default && field.default === opt) o.selected = true;
        el.appendChild(o);
      });
    }
  }
}

function wireTabNav() {
  const container = document.getElementById('dynamic_form_container');
  const tabs = [...container.querySelectorAll('.nav-tabs .nav-link')];
  const panes = [...container.querySelectorAll('.tab-pane')];

  function goto(i) {
    if (i < 0 || i >= panes.length) return;
    tabs.forEach(t => t.classList.remove('active'));
    panes.forEach(p => p.classList.remove('show','active'));
    tabs[i].classList.add('active');
    panes[i].classList.add('show','active');
  }

  panes.forEach((pane, i) => {
    const prev = pane.querySelector('.prev-tab');
    const next = pane.querySelector('.next-tab');
    prev && prev.addEventListener('click', () => goto(i-1));
    next && next.addEventListener('click', () => goto(i+1));
  });
}

/* ========== switch-flat CSS injection (brand, compact) ========== */
function injectSwitchCSS() {
  if (document.getElementById('xavs-switch-css')) return;
  const css = `
/* Base switch */
.switch { position: relative; display: inline-block; vertical-align: middle; }
.switch-input { position: absolute; left: -9999px; }

.switch-label {
  display: block; position: relative;
  width: 78px; height: 28px;               /* compact pill */
  border-radius: 9999px;
  border: 2px solid ${BRAND_RED};
  background: ${BRAND_RED};
  cursor: pointer; user-select: none;
  transition: background-color .18s ease, border-color .18s ease;
}

/* Off/On text via data attributes */
.switch-label:before,
.switch-label:after {
  position: absolute; top: 50%; transform: translateY(-50%);
  font-size: 12px; font-weight: 700; letter-spacing: .2px;
  color: #fff;
}
.switch-label:before { content: attr(data-off); left: 12px; opacity: 1; }
.switch-label:after  { content: attr(data-on);  right: 12px; opacity: 0; }

/* Knob */
.switch-handle {
  position: absolute; top: 5px; left: 5px;
  width: 20px; height: 20px; border-radius: 50%;
  background: #dadada;
  box-shadow: 0 2px 4px rgba(0,0,0,.2);
  transition: left .18s ease, background .18s ease;
}

/* Checked state (YES) */
.switch-input:checked ~ .switch-label {
  border-color: ${BRAND_GREEN};
  background: ${BRAND_GREEN};
}
.switch-input:checked ~ .switch-label:before { opacity: 0; }
.switch-input:checked ~ .switch-label:after  { opacity: 1; }
/* Move knob to the right (78 - (20 + 5 + 5) = 48) */
.switch-input:checked ~ .switch-handle { left: 53px; background: ${BRAND_GREEN}; }

/* Flat variant baseline */
.switch-flat { padding: 0; background: transparent; }
.switch-flat .switch-label { box-shadow: none; }
.switch-flat .switch-handle { box-shadow: none; }
  `;
  const style = document.createElement('style');
  style.id = 'xavs-switch-css';
  style.textContent = css;
  document.head.appendChild(style);
}

/* Ensure checkbox switches store 'yes'/'no' values and trigger visibility updates */
function wireFlatSwitches() {
  document.querySelectorAll('.switch-input').forEach(chk => {
    const setVal = () => { 
      chk.value = chk.checked ? 'yes' : 'no'; 
      console.log(`🔄 Switch ${chk.id} changed to: ${chk.value} (checked: ${chk.checked})`);
    };
    
    // Only set initial value if not during config loading
    if (!window.isLoadingConfiguration) {
      setVal();
    }
    
    // Remove existing listeners to avoid duplicates
    chk.removeEventListener('change', setVal);
    chk.addEventListener('change', setVal);
    
    // Also add visibility evaluation trigger
    chk.addEventListener('change', () => {
      setTimeout(() => {
        console.log(`🔍 Triggering visibility evaluation for switch: ${chk.id}`);
        evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
      }, 10);
    });
    
    // Add a click listener to ensure proper state sync
    chk.addEventListener('click', () => {
      setTimeout(() => {
        console.log(`👆 Click event on ${chk.id}: checked=${chk.checked}, value=${chk.value}`);
        
        // Ensure value always matches checked state
        const correctValue = chk.checked ? 'yes' : 'no';
        if (chk.value !== correctValue) {
          console.warn(`⚠️ Value mismatch on ${chk.id}, correcting value to match checked state...`);
          chk.value = correctValue;
          console.log(`🔧 Corrected value: ${chk.value}`);
        }
      }, 5);
    });
  });
}

/* Certificate cleanup when domain is disabled */
async function cleanupCertificatesOnDomainDisable() {
  // Don't cleanup during configuration loading
  if (window.isLoadingConfiguration) {
    console.log('🔒 Skipping certificate cleanup - configuration is being loaded');
    return;
  }
  
  console.log('🧹 Domain setup disabled - cleaning up certificate files...');
  
  const certificateFields = [
    'basics_kolla_internal_fqdn_cert',
    'basics_kolla_external_fqdn_cert'
  ];
  
  const cleanupTasks = [];
  
  for (const fieldId of certificateFields) {
    const fileInput = document.getElementById(fieldId);
    const statusDiv = document.getElementById(`${fieldId}_status`);
    
    if (fileInput) {
      // Get the current file path if any
      const filePath = fileInput.getAttribute('data-file-path');
      
      if (filePath && filePath.trim()) {
        console.log(`🗑️ Removing certificate file: ${filePath}`);
        
        // Add cleanup task for this file
        cleanupTasks.push(
          cockpit.spawn(['rm', '-f', filePath], { superuser: 'require', err: 'ignore' })
            .then(() => {
              console.log(`✅ Successfully removed: ${filePath}`);
            })
            .catch(error => {
              console.warn(`⚠️ Could not remove ${filePath}:`, error);
            })
        );
      }
      
      // Clear the file input
      fileInput.value = '';
      fileInput.removeAttribute('data-file-path');
      
      // Clear the status display
      if (statusDiv) {
        statusDiv.style.display = 'none';
        const fileInfo = statusDiv.querySelector('.file-info');
        if (fileInfo) {
          fileInfo.innerHTML = '';
        }
      }
      
      console.log(`🧽 Cleared certificate field: ${fieldId}`);
    }
  }
  
  // Also clear related FQDN fields
  const fqdnFields = [
    'basics_kolla_internal_fqdn',
    'basics_kolla_external_fqdn'
  ];
  
  fqdnFields.forEach(fieldId => {
    const fqdnInput = document.getElementById(fieldId);
    if (fqdnInput) {
      fqdnInput.value = '';
      console.log(`🧽 Cleared FQDN field: ${fieldId}`);
    }
  });
  
  // Disable TLS toggles since no certificates
  const tlsToggles = [
    'basics_kolla_enable_tls_internal',
    'basics_kolla_enable_tls_external'
  ];
  
  tlsToggles.forEach(toggleId => {
    const toggleEl = document.getElementById(toggleId);
    if (toggleEl && toggleEl.checked) {
      toggleEl.checked = false;
      toggleEl.value = 'no';
      toggleEl.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`🔒 Disabled TLS toggle: ${toggleId}`);
    }
  });
  
  // Wait for all file cleanup tasks to complete
  if (cleanupTasks.length > 0) {
    try {
      await Promise.allSettled(cleanupTasks);
      console.log('🎯 Certificate file cleanup completed');
    } catch (error) {
      console.error('❌ Error during certificate cleanup:', error);
    }
  }
  
  // Trigger visibility evaluation to hide certificate fields
  setTimeout(() => {
    evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
  }, 100);
  
  showStatus('Domain setup disabled - certificate files and related settings have been cleared', 'info');
}

/* Status panel */
function showStatus(message, type = 'info') {
  const el = document.getElementById('status_panel');
  if (el) {
    el.className = `alert alert-${type}`;
    el.textContent = message;
    el.style.display = 'block';
    
    // Clear any custom styling from validation errors
    el.style.border = '';
    el.style.boxShadow = '';
    el.style.backgroundColor = '';
    el.style.borderRadius = '';
    el.innerHTML = ''; // Clear any HTML content
    el.textContent = message; // Set as plain text
    
    // Add success styling for success messages
    if (type === 'success') {
      el.style.border = '2px solid #10b981';
      el.style.backgroundColor = '#f0fdf4';
      el.style.borderRadius = '8px';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
    } else if (type === 'info') {
      el.style.border = '2px solid #3b82f6';
      el.style.backgroundColor = '#eff6ff';
      el.style.borderRadius = '8px';
    } else if (type === 'warning') {
      el.style.border = '2px solid #f59e0b';
      el.style.backgroundColor = '#fffbeb';
      el.style.borderRadius = '8px';
    }
  }
}

/* Enhanced status panel for validation errors */
function showValidationErrors(errors) {
  const el = document.getElementById('status_panel');
  if (el && errors.length > 0) {
    el.className = 'alert alert-danger';
    
    // Create a detailed error message with more prominent styling
    let errorHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 24px; margin-right: 8px;">⚠️</span>
        <strong style="font-size: 16px;">Validation Failed - Cannot Save Configuration</strong>
      </div>
      <p style="margin: 8px 0;">Please fix the following ${errors.length} error(s) before saving:</p>
    `;
    errorHTML += '<ul style="margin: 8px 0 0 0; padding-left: 20px; line-height: 1.5;">';
    errors.forEach((error, index) => {
      errorHTML += `<li style="margin-bottom: 4px;"><strong>${index + 1}.</strong> ${error}</li>`;
    });
    errorHTML += '</ul>';
    errorHTML += '<p style="margin: 12px 0 0 0; font-size: 14px; color: #721c24;"><em>💡 Tip: Required fields are marked with red borders and will auto-focus when you click "Save".</em></p>';
    
    el.innerHTML = errorHTML;
    el.style.display = 'block';
    
    // Make it very prominent but distinct from button
    el.style.border = '2px solid #dc2626';
    el.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.15)';
    el.style.backgroundColor = '#fef2f2'; // Light red background
    el.style.borderRadius = '8px';
    
    // Scroll to the top to show the error panel
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Navigate to the first tab containing validation errors
    navigateToFirstErrorTab();
    
    // Also log to console for debugging
    console.warn('🚫 Validation errors preventing save:', errors);
  }
}

/* Navigate to the first tab containing validation errors */
function navigateToFirstErrorTab() {
  const invalidInputs = document.querySelectorAll('.is-invalid');
  if (invalidInputs.length > 0) {
    const firstInvalidInput = invalidInputs[0];
    const tabPane = firstInvalidInput.closest('.tab-pane');
    if (tabPane) {
      const tabId = tabPane.id.replace('-pane', '');
      const tabButton = document.querySelector(`[data-bs-target="#${tabPane.id}"]`);
      if (tabButton) {
        // Activate the tab using Bootstrap's tab API if available
        if (window.bootstrap && window.bootstrap.Tab) {
          const tab = new window.bootstrap.Tab(tabButton);
          tab.show();
        } else {
          // Fallback: manually trigger the tab
          tabButton.click();
        }
        
        // Focus on the first invalid input after a short delay
        setTimeout(() => {
          firstInvalidInput.focus();
          firstInvalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }
}

/* ===================== YAML GEN ===================== */
const YAML_SKIP_KEYS = new Set(['domain_setup', 'volume_driver', 'enable_kms', 'note_ceph', 'note_san']);
const YAML_ONLY_IF_YES = new Set(['enable_neutron_vpnaas','enable_neutron_qos','enable_neutron_trunk','enable_cinder_backend_nfs']);

function generateYamlContent(config) {
  let yaml = '---\n';
  yaml += '# XAVS Global Configuration Variables\n';
  yaml += `# Generated on: ${new Date().toISOString()}\n\n`;

  const comments = {
    basics: 'Primary networking, domains, and TLS',
    network: 'Network and connectivity configuration',
    storage: 'Storage services configuration',
    monitoring: 'Monitoring and logging configuration',
    advanced: 'Advanced deployment configuration',
    custom: 'User-defined custom configuration'
  };

  const writeKV = (k, v) => {
    if (typeof v === 'string') {
      if (v.includes('{{') && v.includes('}}')) yaml += `${k}: ${v}\n`;
      else if (v === 'yes' || v === 'no')       yaml += `${k}: ${v}\n`;
      else                                      yaml += `${k}: "${v}"\n`;
    } else if (typeof v === 'number')           yaml += `${k}: ${v}\n`;
    else if (typeof v === 'boolean')            yaml += `${k}: ${v ? 'yes' : 'no'}\n`;
    else if (v !== undefined && v !== null && v !== '') yaml += `${k}: "${v}"\n`;
  };

  for (const [sectionKey, sectionValue] of Object.entries(config)) {
    if (!sectionValue || Object.keys(sectionValue).length === 0) continue;
    
    // Skip processing custom section in main loop - it gets special handling later
    if (sectionKey === 'custom') continue;
    
    yaml += `# ${comments[sectionKey] || (sectionKey.toUpperCase() + ' Configuration')}\n`;

    const isStorage  = (sectionKey === 'storage');
    const isAdvanced = (sectionKey === 'advanced');

    for (const [key, value] of Object.entries(sectionValue)) {
      if (value === undefined || value === null || value === '') continue;
      if (YAML_SKIP_KEYS.has(key)) continue;
      if (YAML_ONLY_IF_YES.has(key) && String(value).toLowerCase() !== 'yes') continue;
      if (isStorage && (key === 'enable_cinder_backend_nfs' || key === 'cinder_volume_group')) continue;
      writeKV(key, value);
    }

    if (isStorage) {
      const cinderOn = String(sectionValue.enable_cinder || 'no').toLowerCase() === 'yes';
      const driver   = sectionValue.volume_driver || '';
      if (cinderOn) {
        if (driver === 'LVM') {
          const vg = sectionValue.cinder_volume_group || '';
          if (vg) { writeKV('enable_cinder_backend_lvm', 'yes'); writeKV('cinder_volume_group', vg); }
        } else if (driver === 'NFS') {
          if (String(sectionValue.enable_cinder_backend_nfs || 'no').toLowerCase() === 'yes')
            writeKV('enable_cinder_backend_nfs', 'yes');
        }
      }
    }

    if (isAdvanced) {
      if (String(sectionValue.enable_kms || 'no').toLowerCase() === 'yes')
        writeKV('enable_barbican', 'yes');
    }

    yaml += '\n';
  }

  if (config.custom && config.custom.custom_yaml && config.custom.custom_yaml.trim()) {
    // Add the actual active Custom Configuration Section
    yaml += '# Custom Configuration Section\n';
    if (config.custom.custom_comments && config.custom.custom_comments.trim()) {
      for (const line of config.custom.custom_comments.trim().split('\n')) yaml += `# ${line}\n`;
    }
    yaml += config.custom.custom_yaml.trim() + '\n\n';
  }

  yaml += '# End of XAVS Globals Configuration\n';
  return yaml;
}

/* ===================== SAVE ===================== */
async function saveConfiguration() {
  const saveButton = document.getElementById('save');
  const originalText = saveButton?.textContent || 'Save Configuration';
  
  try {
    // Update button state
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Validating...';
    }
    
    showStatus('Validating configuration...', 'info');
    
    if (!formGenerator) throw new Error('Form generator not initialized');
    
    const errs = formGenerator.validateForm();
    console.log('Validation results:', { errorCount: errs.length, errors: errs });
    
    if (errs.length) {
      showValidationErrors(errs);
      console.error('Validation errors:', errs);
      
      // Make it very clear to the user that validation failed
      showStatus(`Validation failed with ${errs.length} error(s). Please fix the highlighted fields before saving.`, 'danger');
      
      // Update save button to show it's ready for retry (not red, just informative)
      if (saveButton) {
        saveButton.style.backgroundColor = '#f59e0b'; // Warning amber instead of error red
        saveButton.style.color = '#ffffff';
        saveButton.textContent = `Please fix ${errs.length} error(s)`;
        saveButton.style.cursor = 'not-allowed';
        saveButton.disabled = true;
        
        // Re-enable after a short delay so user can try again
        setTimeout(() => {
          saveButton.style.backgroundColor = '';
          saveButton.style.color = '';
          saveButton.style.cursor = '';
          saveButton.textContent = originalText;
          saveButton.disabled = false;
        }, 2000);
      }
      
      return false; // Explicitly return false to indicate failure
    }

    // Update button for save process
    if (saveButton) {
      saveButton.textContent = 'Saving...';
    }
    
    showStatus('Configuration validation passed. Saving...', 'info');
    
    const config = formGenerator.getFormData();
    const yamlContent = generateYamlContent(config);

    const filePath = '/etc/xavs/globals.d/_99_xavs.yml';
    const backupPath = `/etc/xavs/globals.d/_99_xavs.yml.backup.${Date.now()}`;
    try { await cockpit.spawn(['cp', filePath, backupPath], { superuser: 'require', err: 'ignore' }); } catch {}

    const escaped = yamlContent.replace(/'/g, "'\\''");
    const tmpPath = `/etc/xavs/globals.d/_99_xavs.yml.tmp.${Date.now()}`;
    const cmd = `
      set -e
      mkdir -p "/etc/xavs/globals.d"
      umask 077
      echo '${escaped}' > "${tmpPath}"
      mv -f "${tmpPath}" "${filePath}"
    `;
    await safeCockpitSpawn(['bash', '-lc', cmd], [], { superuser: 'require', err: 'out' });

    const readback = await cockpit.file(filePath).read();
    if (!readback || !readback.length) throw new Error('Configuration file seems empty');

    showStatus(`✅ Configuration saved successfully to ${filePath}`, 'success');
    
    // Update button for success
    if (saveButton) {
      saveButton.style.backgroundColor = '#197560';
      saveButton.textContent = 'Saved Successfully!';
      setTimeout(() => {
        saveButton.style.backgroundColor = '';
        saveButton.textContent = originalText;
      }, 2000);
    }
    
    return filePath;
  } catch (e) {
    console.error('Save failed:', e);
    showStatus('Failed to save configuration: ' + e.message, 'danger');
    
    // Update button for error
    if (saveButton) {
      saveButton.style.backgroundColor = '#dc2626';
      saveButton.textContent = 'Save Failed';
      setTimeout(() => {
        saveButton.style.backgroundColor = '';
        saveButton.textContent = originalText;
      }, 3000);
    }
    
    return false;
  } finally {
    // Always re-enable the button
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

/* ===================== GLOBAL DEBUG HELPERS ===================== */
// For debugging real-time validation
window.testRealTimeValidation = function() {
  console.log('🧪 Testing real-time validation...');
  if (formGenerator && typeof formGenerator.setupRealTimeValidation === 'function') {
    formGenerator.setupRealTimeValidation();
    console.log('✅ Real-time validation setup called');
  } else {
    console.error('❌ FormGenerator or setupRealTimeValidation not available');
  }
};

window.checkValidationFields = function() {
  console.log('🔍 Checking validation fields...');
  const inputs = document.querySelectorAll('input[type="text"]');
  console.log(`Found ${inputs.length} text inputs:`);
  inputs.forEach(input => {
    const name = input.name || '';
    const id = input.id || '';
    const fieldName = name ? name.split('_').slice(1).join('_') : (id ? id.split('_').slice(1).join('_') : '');
    console.log(`- ${name || id} -> field: ${fieldName}`);
  });
};

/* TLS Real-Time Validation */
function setupTLSRealTimeValidation() {
  console.log('🔒 Setting up TLS real-time validation...');
  
  const tlsToggles = [
    {
      toggleId: 'basics_kolla_enable_tls_internal',
      fqdnId: 'basics_kolla_internal_fqdn',
      certId: 'basics_kolla_internal_fqdn_cert',
      type: 'Internal'
    },
    {
      toggleId: 'basics_kolla_enable_tls_external', 
      fqdnId: 'basics_kolla_external_fqdn',
      certId: 'basics_kolla_external_fqdn_cert',
      type: 'External'
    }
  ];
  
  tlsToggles.forEach(config => {
    const toggle = document.getElementById(config.toggleId);
    const fqdnInput = document.getElementById(config.fqdnId);
    const certInput = document.getElementById(config.certId);
    
    if (!toggle || !fqdnInput || !certInput) {
      console.warn(`⚠️ TLS validation setup incomplete for ${config.type}: missing elements`);
      return;
    }
    
    // Function to validate TLS requirements
    const validateTLSRequirements = () => {
      if (toggle.checked) {
        console.log(`🔍 Validating ${config.type} TLS requirements...`);
        
        // Validate FQDN
        const fqdnValue = fqdnInput.value.trim();
        const fqdnPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
        
        // Clear previous validation state
        fqdnInput.classList.remove('is-invalid');
        certInput.classList.remove('is-invalid');
        
        // Remove existing error messages
        [fqdnInput, certInput].forEach(input => {
          const existingError = input.parentNode?.querySelector('.tls-validation-error');
          if (existingError) existingError.remove();
        });
        
        let hasErrors = false;
        
        // Check FQDN
        if (!fqdnValue) {
          fqdnInput.classList.add('is-invalid');
          showTLSValidationError(fqdnInput, `${config.type} FQDN is required when ${config.type} TLS is enabled`);
          hasErrors = true;
        } else if (!fqdnPattern.test(fqdnValue)) {
          fqdnInput.classList.add('is-invalid');
          showTLSValidationError(fqdnInput, `${config.type} FQDN must be a valid domain (e.g., example.com)`);
          hasErrors = true;
        }
        
        // Check certificate
        const hasFile = certInput.files && certInput.files.length > 0;
        const hasPath = certInput.getAttribute('data-file-path');
        
        if (!hasFile && !hasPath) {
          certInput.classList.add('is-invalid');
          showTLSValidationError(certInput, `${config.type} certificate is required when ${config.type} TLS is enabled`);
          hasErrors = true;
        }
        
        console.log(`${hasErrors ? '❌' : '✅'} ${config.type} TLS validation: ${hasErrors ? 'has errors' : 'passed'}`);
      } else {
        // TLS disabled, clear any validation errors
        [fqdnInput, certInput].forEach(input => {
          input.classList.remove('is-invalid');
          const existingError = input.parentNode?.querySelector('.tls-validation-error');
          if (existingError) existingError.remove();
        });
      }
    };
    
    // Add event listeners
    toggle.addEventListener('change', validateTLSRequirements);
    fqdnInput.addEventListener('input', validateTLSRequirements);
    fqdnInput.addEventListener('blur', validateTLSRequirements);
    
    console.log(`✅ Setup TLS validation for ${config.type}`);
  });
}

function showTLSValidationError(inputElement, message) {
  // Remove any existing error message for this input
  const existingError = inputElement.parentNode?.querySelector('.tls-validation-error');
  if (existingError) existingError.remove();
  
  // Create new error message
  const errorDiv = document.createElement('div');
  errorDiv.className = 'tls-validation-error';
  errorDiv.style.cssText = 'color: #dc2626; font-size: 0.875rem; margin-top: 4px; display: block;';
  errorDiv.textContent = message;
  
  // Insert after the input element
  inputElement.parentNode.insertBefore(errorDiv, inputElement.nextSibling);
}

/* ===================== INIT ===================== */
document.addEventListener('DOMContentLoaded', async () => {
  showStatus('Loading configuration interface...', 'info');
  try {
    if (typeof cockpit === 'undefined') await new Promise(r => setTimeout(r, 800));
    if (typeof cockpit === 'undefined') throw new Error('Cockpit API not available. Open inside Cockpit.');

    watchCockpitTheme();

    ALL_INTERFACES = await updateNetworkInterfaceOptions();

    formGenerator = new FormGenerator('dynamic_form_container', CONFIG_SCHEMA);
    await formGenerator.generateForm();

    await populateInterfacesAndAutofill();
    syncExternalInterfaceOptions();
    hookExternalInterfaceBehavior();
    await updateVGOptionsAndHint();

    // Ensure real-time validation is set up after all form manipulations
    if (formGenerator && typeof formGenerator.setupRealTimeValidation === 'function') {
      formGenerator.setupRealTimeValidation();
    }
    
    // Setup TLS-specific real-time validation
    setupTLSRealTimeValidation();
    
    // Setup file upload handlers for certificate files
    await setupFileUploadHandlers();

    // Reactivity
    formGenerator.container.addEventListener('change', async (e) => {
      if (!e.target || !e.target.name) return;

      // Clear validation errors when user starts correcting them
      if (e.target.classList.contains('is-invalid')) {
        e.target.classList.remove('is-invalid');
        
        // Clear tab highlighting if this was the last invalid field in the tab
        const tabPane = e.target.closest('.tab-pane');
        if (tabPane) {
          const invalidFieldsInTab = tabPane.querySelectorAll('.is-invalid');
          if (invalidFieldsInTab.length === 0) {
            const tabButton = document.querySelector(`[data-bs-target="#${tabPane.id}"]`);
            if (tabButton) {
              tabButton.style.color = '';
              tabButton.style.fontWeight = '';
            }
          }
        }
        
        // Hide status panel if no more validation errors
        const allInvalidFields = formGenerator.container.querySelectorAll('.is-invalid');
        if (allInvalidFields.length === 0) {
          const statusPanel = document.getElementById('status_panel');
          if (statusPanel && statusPanel.classList.contains('alert-danger')) {
            statusPanel.style.display = 'none';
            statusPanel.style.border = '';
            statusPanel.style.boxShadow = '';
          }
          
          // Reset save button to normal state when all errors are cleared
          const saveButton = document.getElementById('save');
          if (saveButton) {
            saveButton.style.backgroundColor = '';
            saveButton.style.color = '';
            saveButton.style.cursor = '';
            saveButton.textContent = 'Save Configuration';
            saveButton.disabled = false;
          }
        }
      }

      if (e.target.id === 'basics_network_interface') syncExternalInterfaceOptions();
      if (e.target.id === 'network_neutron_external_interface') hookExternalInterfaceBehavior();

      if (e.target.id === 'storage_volume_driver' || e.target.id === 'storage_enable_cinder')
        await updateVGOptionsAndHint();

      // Handle domain setup cleanup when disabled (but not during config loading)
      if (e.target.id === 'basics_domain_setup' && !e.target.checked && !window.isLoadingConfiguration) {
        await cleanupCertificatesOnDomainDisable();
      }

      evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
    });

    setupEventListeners();
    setupHelpUX();     // hover & click
    evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
    showStatus('Configuration UI ready', 'success');
  } catch (e) {
    console.error('Init failed:', e);
    showStatus('Failed to load: ' + e.message, 'danger');
  }
});

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showStatus('An unexpected error occurred: ' + (event.reason?.message || event.reason), 'danger');
});

// Global error handler for JavaScript errors
window.addEventListener('error', (event) => {
  console.error('JavaScript error:', event.error);
  if (event.error && !event.error.toString().includes('Script error')) {
    showStatus('An unexpected error occurred: ' + event.error.message, 'danger');
  }
});

/* ===================== EVENTS & HELP ===================== */
function setupEventListeners() {
  document.getElementById('save')?.addEventListener('click', (e) => { 
    console.log('💾 Save button clicked');
    e.preventDefault(); 
    saveConfiguration().catch(console.error); 
  });
  document.getElementById('load_config_btn')?.addEventListener('click', () => { loadSavedConfiguration().catch(console.error); });
  document.getElementById('preview_config_btn')?.addEventListener('click', () => { previewConfiguration(); });
  document.getElementById('download_config_btn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); downloadConfiguration(); });
  document.getElementById('reset_config_btn')?.addEventListener('click', () => { resetToDefaults(); });

  // Help button click opens modal with quick tips
  document.getElementById('help_btn')?.addEventListener('click', () => openHelpModal());
}

// Quick Tips hover tooltip + click modal; high z-index
function setupHelpUX() {
  const helpBtn = document.getElementById('help_btn');
  if (!helpBtn) return;

  const hoverText =
`Quick tips:
• Start with XAVS Configuration (choose management interface & Internal VIP)
• Pick Neutron External Interface only if you need provider/FIP egress
• Use Preview YAML before save; backup is automatic
• Apply changes via deployment playbooks`;

  let tip;
  const showTip = () => {
    if (tip) return;
    tip = document.createElement('div');
    tip.textContent = hoverText;
    tip.setAttribute('role','tooltip');
    Object.assign(tip.style, {
      position: 'fixed',
      right: '24px',
      top: '64px',
      maxWidth: '420px',
      whiteSpace: 'pre-wrap',
      fontSize: '12px',
      fontWeight: '400',
      textAlign: 'left',
      lineHeight: '1.35',
      background: 'var(--surface, #fff)',
      color: 'var(--text, #111827)',
      border: `1px solid ${BRAND_GREEN}`,
      padding: '10px 12px',
      borderRadius: '10px',
      boxShadow: '0 12px 30px rgba(0,0,0,.25)',
      zIndex: '12000',
      pointerEvents: 'none'
    });
    document.body.appendChild(tip);
  };
  const hideTip = () => { if (tip && tip.parentNode) tip.parentNode.removeChild(tip); tip = null; };

  helpBtn.addEventListener('mouseenter', showTip);
  helpBtn.addEventListener('mouseleave', hideTip);
  window.addEventListener('scroll', hideTip, { passive: true });
}

function openHelpModal() {
  let m = document.getElementById('helpModal');
  if (!m) {
    const html = `
      <div class="modal" id="helpModal" role="dialog" aria-modal="true" aria-labelledby="help_title" style="z-index:11000;">
        <div class="modal-content" style="border-radius:12px;border:1px solid ${BRAND_GREEN};">
          <div class="modal-body" style="padding:14px;">
            <ul class="small" style="margin:0;padding-left:18px;line-height:1.45;font-weight:400;">
              <li>Start with <strong>XAVS Configuration</strong> (choose management interface & Internal VIP).</li>
              <li>Select a <strong>Neutron External Interface</strong> only if you need provider/FIP egress.</li>
              <li>Use <strong>Preview YAML</strong> before saving; a backup is created automatically.</li>
              <li>Run your deployment playbooks to apply changes.</li>
            </ul>
          </div>
          <div class="modal-foot" style="border-top:1px solid var(--border,#d1d5db);padding:12px 14px;display:flex;justify-content:flex-end;gap:8px;">
            <button class="btn btn-brand" id="help_ok_modal">Close</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    m = document.getElementById('helpModal');
  }
  const close = () => { m.remove(); };
  document.getElementById('help_ok_modal')?.addEventListener('click', close, { once: true });
  m.addEventListener('click', (e) => { if (e.target === m) close(); }, { once: true });
}

/* ===================== PREVIEW / DOWNLOAD / LOAD ===================== */
function previewConfiguration() {
  try {
    if (!formGenerator) throw new Error('Form generator not initialized');
    const yaml = generateYamlContent(formGenerator.getFormData());

    let m = document.getElementById('previewModal');
    if (!m) {
      const html = `
        <div class="modal" id="previewModal" role="dialog" aria-modal="true" aria-labelledby="previewTitle" style="z-index:11000;">
          <div class="modal-content" style="border-radius:12px;border:1px solid ${BRAND_GREEN};">
            <div class="modal-body" style="padding:14px;">
              <pre id="previewContent" class="yaml-terminal"></pre>
            </div>
            <div class="modal-foot" style="border-top:1px solid var(--border,#d1d5db);padding:12px 14px;display:flex;justify-content:flex-end;">
              <button type="button" id="modal_download_btn" class="btn btn-brand">Download YAML</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      m = document.getElementById('previewModal');

      m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
      const dl = document.getElementById('modal_download_btn');
      if (dl) dl.addEventListener('click', () => { downloadConfiguration(); });
    }
    document.getElementById('previewContent').textContent = yaml;
  } catch (e) {
    console.error('Preview failed:', e);
    showStatus('Failed to generate preview: ' + e.message, 'danger');
  }
}

function downloadConfiguration() {
  try {
    if (!formGenerator) throw new Error('Form generator not initialized');
    const yaml = generateYamlContent(formGenerator.getFormData());
    const blob = new Blob([yaml], { type: 'application/x-yaml' });
    const url  = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xavs_globals_${new Date().toISOString().split('T')[0]}.yml`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
    showStatus('Configuration downloaded', 'success');
  } catch (e) {
    console.error('Download failed:', e);
    showStatus('Failed to download configuration: ' + e.message, 'danger');
  }
}

async function loadSavedConfiguration() {
  showStatus('Loading saved configuration...', 'info');
  try {
    const filePath = '/etc/xavs/globals.d/_99_xavs.yml';
    const content  = await cockpit.file(filePath).read();
    if (content && content.trim().length > 0) {
      const parsed = parseYamlToConfig(content);
      if (parsed && Object.keys(parsed).length > 0) {
        console.log('📋 Loading configuration into form...', parsed);
        
        // Step 1: Ensure all event handlers are set up first
        console.log('Setting up event handlers...');
        wireFlatSwitches();
        syncExternalInterfaceOptions();
        hookExternalInterfaceBehavior();
        await updateVGOptionsAndHint();
        
        // Step 2: Populate form values and trigger events
        console.log('Populating form with configuration data...');
        populateFormFromConfig(parsed);
        
        // Step 3: Multiple visibility evaluations to ensure everything is updated
        setTimeout(() => {
          console.log('First visibility evaluation...');
          evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
        }, 100);
        
        setTimeout(() => {
          console.log('Second visibility evaluation (final)...');
          evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
          
          // Step 4: Force check all switch states and log them
          const switches = formGenerator.container.querySelectorAll('.switch-input');
          switches.forEach(switchEl => {
            console.log(`Final switch state - ${switchEl.id}: checked=${switchEl.checked}, value=${switchEl.value}`);
          });
          
        }, 300);
        
        showStatus('Configuration loaded into form', 'success');
      } else {
        showConfigPreview(content);
        showStatus('Loaded config into preview (could not auto-populate)', 'warning');
      }
    } else {
      showStatus('No saved configuration found', 'warning');
    }
  } catch (e) {
    console.error('Load failed:', e);
    showStatus('Failed to load configuration: ' + e.message, 'danger');
  }
}

function showConfigPreview(content) {
  let m = document.getElementById('previewModal');
  if (!m) { previewConfiguration(); m = document.getElementById('previewModal'); }
  document.getElementById('previewContent').textContent = content;
  m.style.display = 'block';
  m.classList.add('show');
}

/* ===================== YAML PARSE/ROUND-TRIP ===================== */
function parseYamlToConfig(yamlContent) {
  const config = {};
  const lines = yamlContent.split('\n');
  let customYaml = [];
  let customComments = [];
  let inCustom = false;
  try {
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.includes('# Custom Configuration Section')) { inCustom = true; continue; }
      if (line.includes('# End of XAVS Globals Configuration')) { inCustom = false; break; }
      if (inCustom) {
        if (line.startsWith('#') && !line.includes('Custom Configuration Section')) customComments.push(line.substring(1).trim());
        else if (line !== '') customYaml.push(lines[i]);
        continue;
      }
      if (line.startsWith('#') || line === '' || line === '---') continue;
      if (line.includes(':')) {
        const idx = line.indexOf(':');
        let key = line.substring(0, idx).trim();
        let val = line.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (val.includes('{{') && val.includes('}}')) continue;
        const section = mapKeyToSection(key);
        if (section) {
          if (!config[section]) config[section] = {};
          config[section][key] = val;
        }
      }
    }
    if (customYaml.length || customComments.length) {
      config.custom = { custom_yaml: customYaml.join('\n'), custom_comments: customComments.join('\n') };
    }
    return config;
  } catch (e) {
    console.error('YAML parse failed:', e);
    return null;
  }
}

function mapKeyToSection(key) {
  const map = {
    // basics
    'network_interface': 'basics',
    'kolla_internal_vip_address': 'basics',
    'kolla_external_vip_address': 'basics',
    'kolla_internal_fqdn': 'basics',
    'kolla_external_fqdn': 'basics',
    'kolla_enable_tls_internal': 'basics',
    'kolla_enable_tls_external': 'basics',
    'kolla_internal_fqdn_cert': 'basics',
    'kolla_external_fqdn_cert': 'basics',

    // network
    'neutron_external_interface': 'network',
    'enable_neutron_provider_networks': 'network',
    'enable_neutron_vpnaas': 'network',
    'enable_neutron_qos': 'network',
    'enable_neutron_trunk': 'network',

    // storage
    'enable_cinder': 'storage',
    'cinder_volume_group': 'storage',
    'enable_cinder_backend_lvm': 'storage',
    'enable_cinder_backend_nfs': 'storage',

    // monitoring
    'enable_prometheus': 'monitoring',
    'enable_grafana': 'monitoring',
    'enable_central_logging': 'monitoring',

    // advanced
    'enable_barbican': 'advanced',
    'enable_kms': 'advanced'
  };
  return map[key] || null;
}

// Centralized function to trigger all switches and selects in proper dependency order
function triggerAllSwitchesInOrder(enhancedConfig) {
  // Define dependency layers - each layer must complete before the next
  const dependencyLayers = [
    // Layer 1: Primary foundation switches that affect many others
    {
      name: 'Foundation Layer',
      delay: 50,
      switches: ['basics_domain_setup']
    },
    // Layer 2: TLS and security switches that depend on domain setup
    {
      name: 'Security Layer', 
      delay: 100,
      switches: ['basics_kolla_enable_tls_internal', 'basics_kolla_enable_tls_external']
    },
    // Layer 3: Storage switches that can affect UI layout
    {
      name: 'Storage Layer',
      delay: 150, 
      switches: ['storage_enable_cinder'],
      selects: ['storage_volume_driver']
    },
    // Layer 4: Backend and feature switches that depend on main features
    {
      name: 'Backend Layer',
      delay: 200,
      switches: ['storage_enable_cinder_backend_nfs']
    },
    // Layer 5: All remaining switches auto-detected from config
    {
      name: 'Remaining Layer',
      delay: 250,
      autoDetect: true
    }
  ];
  
  const triggeredElements = new Set();
  let currentDelay = 0;
  
  // Process each dependency layer
  dependencyLayers.forEach((layer, index) => {
    setTimeout(() => {
      console.log(`⚡ Processing ${layer.name}...`);
      
      if (layer.autoDetect) {
        // Auto-detect all remaining switches and selects from the config
        console.log('🔍 Auto-detecting remaining switches and selects...');
        
        for (const [section, fields] of Object.entries(enhancedConfig)) {
          for (const [key, value] of Object.entries(fields)) {
            const id = `${section}_${key}`;
            const el = formGenerator.container.querySelector(`#${id}`);
            
            if (el && !triggeredElements.has(id)) {
              if (el.classList.contains('switch-input')) {
                console.log(`Auto-triggering switch: ${id} (${el.value}) - Config value: ${value}`);
                
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('input', { bubbles: true }));
                triggeredElements.add(id);
              } else if (el.tagName === 'SELECT') {
                console.log(`Auto-triggering select: ${id} (${el.value}) - Config value: ${value}`);
                el.dispatchEvent(new Event('change', { bubbles: true }));
                triggeredElements.add(id);
              }
            }
          }
        }
      } else {
        // Process explicitly defined switches for this layer
        if (layer.switches) {
          layer.switches.forEach(switchId => {
            const el = document.getElementById(switchId);
            if (el && el.classList.contains('switch-input') && !triggeredElements.has(switchId)) {
              console.log(`🔄 Triggering ${layer.name} switch: ${switchId} (${el.value})`);
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('input', { bubbles: true }));
              triggeredElements.add(switchId);
            }
          });
        }
        
        // Process explicitly defined selects for this layer
        if (layer.selects) {
          layer.selects.forEach(selectId => {
            const el = document.getElementById(selectId);
            if (el && el.tagName === 'SELECT' && !triggeredElements.has(selectId)) {
              console.log(`🔄 Triggering ${layer.name} select: ${selectId} (${el.value})`);
              el.dispatchEvent(new Event('change', { bubbles: true }));
              triggeredElements.add(selectId);
            }
          });
        }
      }
      
      // Special handling for Volume Group after storage layer
      if (layer.name === 'Storage Layer' && enhancedConfig.storage && enhancedConfig.storage.cinder_volume_group) {
        setTimeout(async () => {
          const vgValue = enhancedConfig.storage.cinder_volume_group;
          console.log(`🎯 Special Volume Group handling: ${vgValue}`);
          await updateVGOptionsAndHint(vgValue);
        }, 50);
      }
      
    }, currentDelay + layer.delay);
    
    currentDelay += layer.delay;
  });
  
  // Final verification and cleanup
  setTimeout(() => {
    console.log('Final verification of all switch states...');
    
    for (const [section, fields] of Object.entries(enhancedConfig)) {
      for (const [key, value] of Object.entries(fields)) {
        const id = `${section}_${key}`;
        const el = formGenerator.container.querySelector(`#${id}`);
        
        if (el && el.classList.contains('switch-input')) {
          const expectedChecked = String(value).toLowerCase() === 'yes';
          
          if (el.checked !== expectedChecked) {
            console.warn(`Switch ${id} state mismatch! Expected: ${expectedChecked}, Actual: ${el.checked}. Correcting...`);
            el.checked = expectedChecked;
            el.value = expectedChecked ? 'yes' : 'no';
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            console.log(`Switch ${id} state correct: checked=${el.checked}, value=${el.value}`);
          }
        }
      }
    }
    
    // Final visibility evaluation and certificate status updates
    setTimeout(() => {
      evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
      
      // Update certificate statuses
      const internalCert = document.getElementById('basics_kolla_internal_fqdn_cert');
      const externalCert = document.getElementById('basics_kolla_external_fqdn_cert');
      
      [internalCert, externalCert].forEach(certInput => {
        if (certInput) {
          const wrapper = certInput.closest('[style*="margin-bottom"]');
          const visible = wrapper && wrapper.style.display !== 'none';
          
          if (visible) {
            const certPath = certInput.getAttribute('data-file-path');
            if (certPath && certPath.trim()) {
              updateCertificateStatus(certInput, certPath);
              const certType = certInput.id.includes('internal') ? 'Internal' : 'External';
              console.log(`✅ Updated ${certType} certificate status`);
            }
          }
        }
      });
      
      // Clear loading flag
      window.isLoadingConfiguration = false;
      
      console.log('✅ Centralized switch triggering complete!');
      
    }, 150);
    
  }, currentDelay + 300);
}

function populateFormFromConfig(cfg) {
  if (!formGenerator || !formGenerator.container) return;
  
  console.log('🔄 Populating form from configuration with cascading dependencies...', cfg);
  
  // Set loading flag to prevent clearing of values during cascading events
  window.isLoadingConfiguration = true;
  
  // Auto-detect and enable missing dependencies
  console.log('🔍 Auto-detecting missing dependencies...');
  const enhancedConfig = JSON.parse(JSON.stringify(cfg)); // Deep copy
  
  // Check if certificate fields are configured but dependencies are missing
  if (enhancedConfig.basics) {
    const hasInternalCert = enhancedConfig.basics.kolla_internal_fqdn_cert;
    const hasExternalCert = enhancedConfig.basics.kolla_external_fqdn_cert;
    const hasInternalFqdn = enhancedConfig.basics.kolla_internal_fqdn;
    const hasExternalFqdn = enhancedConfig.basics.kolla_external_fqdn;
    
    // If any domain-related fields exist, enable domain_setup
    if (hasInternalCert || hasExternalCert || hasInternalFqdn || hasExternalFqdn) {
      if (!enhancedConfig.basics.domain_setup) {
        console.log('🔧 Auto-enabling domain_setup due to domain-related configuration');
        enhancedConfig.basics.domain_setup = 'yes';
      }
    }
    
    // If internal certificate exists, enable internal TLS
    if (hasInternalCert && enhancedConfig.basics.kolla_enable_tls_internal !== 'yes') {
      console.log('🔧 Auto-enabling kolla_enable_tls_internal due to certificate configuration');
      enhancedConfig.basics.kolla_enable_tls_internal = 'yes';
    }
    
    // If external certificate exists, enable external TLS
    if (hasExternalCert && enhancedConfig.basics.kolla_enable_tls_external !== 'yes') {
      console.log('🔧 Auto-enabling kolla_enable_tls_external due to certificate configuration');
      enhancedConfig.basics.kolla_enable_tls_external = 'yes';
    }
  }
  
  // Check Cinder storage dependencies
  if (enhancedConfig.storage) {
    const hasVolumeGroup = enhancedConfig.storage.cinder_volume_group;
    const hasNfsBackend = enhancedConfig.storage.enable_cinder_backend_nfs === 'yes';
    const hasVolumeDriver = enhancedConfig.storage.volume_driver;
    
    // If any Cinder-related fields exist, enable Cinder
    if (hasVolumeGroup || hasNfsBackend || hasVolumeDriver) {
      if (!enhancedConfig.storage.enable_cinder || enhancedConfig.storage.enable_cinder !== 'yes') {
        console.log('🔧 Auto-enabling enable_cinder due to storage configuration');
        enhancedConfig.storage.enable_cinder = 'yes';
      }
    }
    
    // If volume group exists, set driver to LVM
    if (hasVolumeGroup && (!hasVolumeDriver || hasVolumeDriver !== 'LVM')) {
      console.log('🔧 Auto-setting volume_driver to LVM due to volume group configuration');
      enhancedConfig.storage.volume_driver = 'LVM';
    }
    
    // If NFS backend is enabled, set driver to NFS  
    if (hasNfsBackend && (!hasVolumeDriver || hasVolumeDriver !== 'NFS')) {
      console.log('🔧 Auto-setting volume_driver to NFS due to NFS backend configuration');
      enhancedConfig.storage.volume_driver = 'NFS';
    }
    
    // Ensure we have a volume driver if Cinder is enabled
    if (enhancedConfig.storage.enable_cinder === 'yes' && !hasVolumeDriver) {
      console.log('🔧 Auto-setting volume_driver to LVM as default for Cinder');
      enhancedConfig.storage.volume_driver = 'LVM';
    }
  }
  
  // Check Neutron provider network dependencies
  if (enhancedConfig.network) {
    const hasExternalInterface = enhancedConfig.network.neutron_external_interface;
    const hasProviderNetworks = enhancedConfig.network.enable_neutron_provider_networks === 'yes';
    
    // If provider networks are enabled but no external interface, this might need attention
    // But we'll let it pass for now as it might be configured elsewhere
    
    // If external interface exists, we might want to enable provider networks
    if (hasExternalInterface && hasExternalInterface.trim() && 
        enhancedConfig.network.enable_neutron_provider_networks !== 'yes') {
      console.log('🔧 Consider enabling neutron_provider_networks due to external interface configuration');
      // Note: We don't auto-enable this as it has complex networking implications
    }
  }
  
  // Transform config keys to match GUI elements (enable_barbican -> enable_kms)
  if (enhancedConfig.advanced && enhancedConfig.advanced.enable_barbican) {
    console.log('Transforming enable_barbican to enable_kms for GUI compatibility');
    enhancedConfig.advanced.enable_kms = enhancedConfig.advanced.enable_barbican;
    delete enhancedConfig.advanced.enable_barbican;
  }
  
  // First pass: Set all values without triggering events
  console.log('Enhanced config sections:', Object.keys(enhancedConfig));
  
  for (const [section, fields] of Object.entries(enhancedConfig)) {
    for (const [key, value] of Object.entries(fields)) {
      const id = `${section}_${key}`;
      const el = formGenerator.container.querySelector(`#${id}`);
      if (!el) {
        console.log(`⚠️ Element not found: ${id}`);
        continue;
      }

      console.log(`📝 Setting ${id} = ${value}`);

      // Special enhanced logging for enable_kms debugging
      if (id === 'advanced_enable_kms') {
        console.log(`🔑 ENABLE_KMS POPULATION DEBUG:`);
        console.log(`   - Element found: ${!!el}`);
        console.log(`   - Element classes: ${el.className}`);
        console.log(`   - Input value from config: ${value}`);
        console.log(`   - String conversion: ${String(value).toLowerCase()}`);
        console.log(`   - Will set checked to: ${String(value).toLowerCase() === 'yes'}`);
      }

      if (el.classList.contains('switch-input')) {
        const isChecked = String(value).toLowerCase() === 'yes';
        el.checked = isChecked;
        el.value = isChecked ? 'yes' : 'no';
        console.log(`🔄 Switch ${id} set to: checked=${el.checked}, value=${el.value}`);
        
        // Extra logging for enable_kms
        if (id === 'advanced_enable_kms') {
          console.log(`🔑 ENABLE_KMS AFTER SETTING:`);
          console.log(`   - Element checked: ${el.checked}`);
          console.log(`   - Element value: ${el.value}`);
          console.log(`   - Expected checked: ${isChecked}`);
          console.log(`   - Expected value: ${isChecked ? 'yes' : 'no'}`);
        }
      } else if (el.tagName === 'SELECT') {
        if (![...el.options].some(o => o.value === value)) {
          const opt = document.createElement('option'); 
          opt.value = value; 
          opt.textContent = value; 
          el.appendChild(opt);
        }
        el.value = value;
        
      } else if (el.type === 'file') {
        // Cannot programmatically set file input values for security reasons
        // Instead, store the path as a data attribute and show in status
        if (value && value.trim()) {
          el.setAttribute('data-file-path', value);
          const statusDiv = document.getElementById(`${id}_status`);
          const fileInfo = statusDiv?.querySelector('.file-info');
          if (statusDiv && fileInfo) {
            statusDiv.style.display = 'block';
            fileInfo.innerHTML = `
              <small class="text-info">
                <strong>Configured Path:</strong> <code>${value}</code>
                <br><strong>Status:</strong> <span class="text-info">📁 Loaded from configuration</span>
              </small>
            `;
          }
        }
      } else {
        el.value = value;
      }
    }
  }
  
  // Second pass: Trigger events in dependency order for cascading visibility using centralized approach
  console.log('⚡ Triggering events in centralized dependency order...');
  
  // Use centralized function to handle ALL switches systematically
  triggerAllSwitchesInOrder(enhancedConfig);
}

function updateCertificateStatus(certElement, certPath) {
  const fieldName = certElement.name || certElement.id;
  const statusDiv = document.getElementById(`${fieldName}_status`);
  const fileInfo = statusDiv?.querySelector('.file-info');
  
  if (statusDiv && fileInfo && certPath) {
    statusDiv.style.display = 'block';
    fileInfo.innerHTML = `
      <small class="text-info">
        <strong>Configured Path:</strong> <code>${certPath}</code>
        <br><strong>Status:</strong> <span class="text-info">📁 Loaded from configuration</span>
      </small>
    `;
    console.log(`✅ Updated certificate status for ${fieldName}: ${certPath}`);
  }
}

/* ===================== DEBUG FUNCTIONS ===================== */
function debugToggleStates() {
  console.log('🔍 DEBUG: Current toggle states');
  const switches = document.querySelectorAll('.switch-input');
  switches.forEach(switchEl => {
    console.log(`  ${switchEl.id}: checked=${switchEl.checked}, value=${switchEl.value}`);
  });
  return switches.length;
}

function debugLoadTestConfig() {
  console.log('🧪 DEBUG: Loading test configuration');
  const testConfig = {
    basics: {
      kolla_enable_tls_external: 'yes',
      kolla_enable_tls_internal: 'yes',
      kolla_external_fqdn: 'external.example.com',
      kolla_internal_fqdn: 'internal.example.com'
    },
    storage: {
      enable_cinder: 'yes'
    },
    network: {
      enable_neutron_provider_networks: 'yes',
      enable_neutron_dvr: 'no'
    }
  };
  
  populateFormFromConfig(testConfig);
  
  setTimeout(() => {
    console.log('🔍 After test config load:');
    debugToggleStates();
    evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
  }, 500);
  
  return testConfig;
}

function debugTestComprehensiveValidation() {
  console.log('🧪 COMPREHENSIVE VALIDATION TEST - Testing all fixes');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Clear any existing state
  const domainToggle = document.getElementById('basics_domain_setup');
  const internalTLS = document.getElementById('basics_kolla_enable_tls_internal');
  const externalTLS = document.getElementById('basics_kolla_enable_tls_external');
  const internalFqdn = document.getElementById('basics_kolla_internal_fqdn');
  const externalFqdn = document.getElementById('basics_kolla_external_fqdn');
  
  // Reset everything first
  [domainToggle, internalTLS, externalTLS].forEach(toggle => {
    if (toggle) {
      toggle.checked = false;
      toggle.value = 'no';
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  
  [internalFqdn, externalFqdn].forEach(fqdn => {
    if (fqdn) {
      fqdn.value = '';
    }
  });
  
  setTimeout(() => {
    console.log('\n🔍 TEST 1: Real-time validation when enabling TLS');
    
    // Enable domain setup
    if (domainToggle) {
      domainToggle.checked = true;
      domainToggle.value = 'yes';
      domainToggle.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('✅ Enabled domain setup');
    }
    
    setTimeout(() => {
      // Enable Internal TLS without FQDN - should show real-time error
      if (internalTLS) {
        console.log('🔘 Enabling Internal TLS without FQDN...');
        internalTLS.checked = true;
        internalTLS.value = 'yes';
        internalTLS.dispatchEvent(new Event('change', { bubbles: true }));
        
        setTimeout(() => {
          const hasError = document.querySelector('.tls-validation-error');
          console.log(`Real-time validation: ${hasError ? '✅ Error shown' : '❌ No error shown'}`);
          
          // Add FQDN - should clear real-time error
          if (internalFqdn) {
            console.log('📝 Adding Internal FQDN...');
            internalFqdn.value = 'internal.example.com';
            internalFqdn.dispatchEvent(new Event('input', { bubbles: true }));
            
            setTimeout(() => {
              const hasErrorAfter = document.querySelector('.tls-validation-error');
              console.log(`After adding FQDN: ${hasErrorAfter ? '❌ Error still there' : '✅ Error cleared'}`);
              
              // TEST 2: Save validation
              setTimeout(() => {
                console.log('\n🔍 TEST 2: Save validation with missing certificate');
                const errors = formGenerator.validateForm();
                const tlsErrors = errors.filter(err => err.includes('Certificate') || err.includes('TLS'));
                console.log(`Save validation: ${tlsErrors.length > 0 ? '✅ Certificate errors found' : '❌ No certificate errors'}`);
                tlsErrors.forEach(error => console.log(`   - ${error}`));
                
                // TEST 3: Configuration loading simulation
                setTimeout(() => {
                  console.log('\n🔍 TEST 3: Configuration loading persistence');
                  
                  const testConfig = {
                    basics: {
                      domain_setup: 'yes',
                      kolla_enable_tls_internal: 'yes',
                      kolla_enable_tls_external: 'yes',
                      kolla_internal_fqdn: 'test-internal.example.com',
                      kolla_external_fqdn: 'test-external.example.com',
                      kolla_internal_fqdn_cert: '/etc/xavs/certificates/internal.pem',
                      kolla_external_fqdn_cert: '/etc/xavs/certificates/external.pem'
                    }
                  };
                  
                  console.log('📋 Loading test configuration...');
                  populateFormFromConfig(testConfig);
                  
                  setTimeout(() => {
                    console.log('🔍 Checking if values persisted after loading...');
                    
                    const results = {};
                    results.domainSetup = domainToggle ? `${domainToggle.checked} (${domainToggle.value})` : 'N/A';
                    results.internalTLS = internalTLS ? `${internalTLS.checked} (${internalTLS.value})` : 'N/A';
                    results.externalTLS = externalTLS ? `${externalTLS.checked} (${externalTLS.value})` : 'N/A';
                    results.internalFqdn = internalFqdn ? internalFqdn.value : 'N/A';
                    results.externalFqdn = externalFqdn ? externalFqdn.value : 'N/A';
                    
                    console.log('📊 Configuration values after loading:');
                    Object.entries(results).forEach(([key, value]) => {
                      console.log(`   ${key}: ${value}`);
                    });
                    
                    // Check certificate status
                    const internalCert = document.getElementById('basics_kolla_internal_fqdn_cert');
                    const externalCert = document.getElementById('basics_kolla_external_fqdn_cert');
                    
                    [internalCert, externalCert].forEach(cert => {
                      if (cert) {
                        const certType = cert.id.includes('internal') ? 'Internal' : 'External';
                        const certPath = cert.getAttribute('data-file-path');
                        const statusDiv = document.getElementById(`${cert.id}_status`);
                        const statusVisible = statusDiv && statusDiv.style.display !== 'none';
                        
                        console.log(`   ${certType} cert: path="${certPath}", status visible=${statusVisible}`);
                      }
                    });
                    
                    console.log('\n🎯 COMPREHENSIVE VALIDATION TEST COMPLETE');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                  }, 3000); // Wait 3 seconds to see if values get cleared
                  
                }, 1000);
              }, 500);
            }, 500);
          }
        }, 500);
      }
    }, 500);
  }, 500);
}

function debugTestTLSValidation() {
  console.log('🧪 Testing comprehensive TLS-Certificate-FQDN validation...');
  
  // First ensure domain setup is enabled
  const domainToggle = document.getElementById('basics_domain_setup');
  if (domainToggle) {
    domainToggle.checked = true;
    domainToggle.value = 'yes';
    domainToggle.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('✅ Enabled domain setup');
  }
  
  setTimeout(() => {
    console.log('\n🔍 TEST 1: Enable TLS without any certificates or FQDNs');
    
    const internalTLS = document.getElementById('basics_kolla_enable_tls_internal');
    const externalTLS = document.getElementById('basics_kolla_enable_tls_external');
    
    // Enable TLS without any prerequisites
    if (internalTLS) {
      internalTLS.checked = true;
      internalTLS.value = 'yes';
      internalTLS.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('✅ Enabled internal TLS (no certificate, no FQDN)');
    }
    
    if (externalTLS) {
      externalTLS.checked = true;
      externalTLS.value = 'yes';
      externalTLS.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('✅ Enabled external TLS (no certificate, no FQDN)');
    }
    
    // Test validation - should show errors for both certificates and FQDNs
    setTimeout(() => {
      console.log('\n🔍 Running validation - should show 4 errors (2 certificates + 2 FQDNs)...');
      
      if (formGenerator) {
        const errors = formGenerator.validateForm();
        console.log(`\n📊 Validation Results: ${errors.length} errors found`);
        errors.forEach((error, index) => console.log(`   ${index + 1}. ❌ ${error}`));
        
        const expectedErrors = [
          'Internal TLS Certificate',
          'Internal FQDN', 
          'External TLS Certificate',
          'External FQDN'
        ];
        
        let foundErrors = 0;
        expectedErrors.forEach(expectedError => {
          const found = errors.some(error => error.includes(expectedError));
          if (found) {
            foundErrors++;
            console.log(`   ✅ Found expected error for: ${expectedError}`);
          } else {
            console.log(`   ❌ Missing expected error for: ${expectedError}`);
          }
        });
        
        if (foundErrors === expectedErrors.length) {
          console.log('\n🎯 TEST 1 PASSED: All TLS requirements correctly validated');
        } else {
          console.log(`\n⚠️ TEST 1 PARTIAL: Found ${foundErrors}/${expectedErrors.length} expected errors`);
        }
      }
      
      // TEST 2: Add FQDNs but no certificates
      setTimeout(() => {
        console.log('\n🔍 TEST 2: Add FQDNs but keep certificates missing');
        
        const internalFqdn = document.getElementById('basics_kolla_internal_fqdn');
        const externalFqdn = document.getElementById('basics_kolla_external_fqdn');
        
        if (internalFqdn) {
          internalFqdn.value = 'internal.example.com';
          console.log('📝 Added internal FQDN: internal.example.com');
        }
        
        if (externalFqdn) {
          externalFqdn.value = 'external.example.com';
          console.log('📝 Added external FQDN: external.example.com');
        }
        
        setTimeout(() => {
          const errors2 = formGenerator.validateForm();
          console.log(`\n📊 Validation Results: ${errors2.length} errors found`);
          errors2.forEach((error, index) => console.log(`   ${index + 1}. ❌ ${error}`));
          
          const certErrors = errors2.filter(err => err.includes('Certificate'));
          const fqdnErrors = errors2.filter(err => err.includes('FQDN'));
          
          if (certErrors.length === 2 && fqdnErrors.length === 0) {
            console.log('\n🎯 TEST 2 PASSED: Only certificate errors remain, FQDN errors cleared');
          } else {
            console.log(`\n⚠️ TEST 2 ISSUES: Expected 2 cert errors and 0 FQDN errors, got ${certErrors.length} cert and ${fqdnErrors.length} FQDN`);
          }
          
          // TEST 3: Test certificate-FQDN matching
          setTimeout(() => {
            console.log('\n🔍 TEST 3: Test certificate-FQDN matching validation');
            
            // Simulate uploading certificates
            const internalCert = document.getElementById('basics_kolla_internal_fqdn_cert');
            const externalCert = document.getElementById('basics_kolla_external_fqdn_cert');
            
            if (internalCert) {
              internalCert.setAttribute('data-file-path', '/etc/xavs/certificates/internal-cert.pem');
              console.log('📁 Simulated internal certificate upload');
            }
            
            if (externalCert) {
              externalCert.setAttribute('data-file-path', '/etc/xavs/certificates/external-cert.pem');
              console.log('📁 Simulated external certificate upload');
            }
            
            setTimeout(() => {
              const errors3 = formGenerator.validateForm();
              console.log(`\n📊 Final Validation Results: ${errors3.length} errors found`);
              errors3.forEach((error, index) => console.log(`   ${index + 1}. ❌ ${error}`));
              
              if (errors3.length === 0) {
                console.log('\n🎉 TEST 3 PASSED: All TLS requirements satisfied - ready to save!');
              } else {
                console.log(`\n⚠️ TEST 3 ISSUES: Still have ${errors3.length} validation errors`);
              }
              
              console.log('\n📋 COMPREHENSIVE TLS VALIDATION TEST COMPLETE');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            }, 300);
          }, 300);
        }, 300);
      }, 500);
    }, 500);
    
  }, 500);
}

function debugTestCertificateCleanup() {
  console.log('🧪 Testing certificate cleanup functionality...');
  
  // First enable domain setup and add some test data
  const domainToggle = document.getElementById('basics_domain_setup');
  const internalFqdnInput = document.getElementById('basics_kolla_internal_fqdn');
  const externalFqdnInput = document.getElementById('basics_kolla_external_fqdn');
  const internalCertInput = document.getElementById('basics_kolla_internal_fqdn_cert');
  const externalCertInput = document.getElementById('basics_kolla_external_fqdn_cert');
  
  // Enable domain setup first
  if (domainToggle) {
    domainToggle.checked = true;
    domainToggle.value = 'yes';
    domainToggle.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  // Add test data to FQDN fields
  setTimeout(() => {
    if (internalFqdnInput) {
      internalFqdnInput.value = 'test-internal.example.com';
      console.log('📝 Added test internal FQDN');
    }
    
    if (externalFqdnInput) {
      externalFqdnInput.value = 'test-external.example.com';
      console.log('📝 Added test external FQDN');
    }
    
    // Simulate uploaded certificates
    if (internalCertInput) {
      internalCertInput.setAttribute('data-file-path', '/etc/xavs/certificates/internal-cert.pem');
      const statusDiv = document.getElementById('basics_kolla_internal_fqdn_cert_status');
      if (statusDiv) {
        statusDiv.style.display = 'block';
        const fileInfo = statusDiv.querySelector('.file-info') || document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = '<small class="text-success">Test certificate uploaded</small>';
        statusDiv.appendChild(fileInfo);
      }
      console.log('📁 Simulated internal certificate upload');
    }
    
    if (externalCertInput) {
      externalCertInput.setAttribute('data-file-path', '/etc/xavs/certificates/external-cert.pem');
      const statusDiv = document.getElementById('basics_kolla_external_fqdn_cert_status');
      if (statusDiv) {
        statusDiv.style.display = 'block';
        const fileInfo = statusDiv.querySelector('.file-info') || document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = '<small class="text-success">Test certificate uploaded</small>';
        statusDiv.appendChild(fileInfo);
      }
      console.log('📁 Simulated external certificate upload');
    }
    
    // Now test cleanup by disabling domain setup
    setTimeout(() => {
      console.log('🧹 Now testing cleanup by disabling domain setup...');
      if (domainToggle) {
        domainToggle.checked = false;
        domainToggle.value = 'no';
        domainToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 1000);
    
  }, 500);
}

function debugTestVolumeGroupLoading() {
  console.log('🧪 Testing Volume Group loading independently...');
  
  // Simulate the configuration scenario
  const testConfig = {
    storage: {
      enable_cinder: 'yes',
      volume_driver: 'LVM',
      cinder_volume_group: 'cloud-vg2'
    }
  };
  
  // Set up dependencies first
  const cinderChk = document.getElementById('storage_enable_cinder');
  const driverEl = document.getElementById('storage_volume_driver');
  const vgSelect = document.getElementById('storage_cinder_volume_group');
  
  if (cinderChk) {
    cinderChk.checked = true;
    cinderChk.value = 'yes';
    cinderChk.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  if (driverEl) {
    driverEl.value = 'LVM';
    driverEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  // Wait a bit for dependencies to process, then call updateVGOptionsAndHint with value
  setTimeout(async () => {
    console.log('🎯 Calling updateVGOptionsAndHint with cloud-vg2...');
    await updateVGOptionsAndHint('cloud-vg2');
    
    // Check result
    if (vgSelect) {
      console.log(`📊 VG Select result: value="${vgSelect.value}", options=${[...vgSelect.options].map(o => o.value)}`);
    }
  }, 500);
}

function debugForceToggleUpdate(toggleId, value) {
  console.log(`🔧 DEBUG: Force updating toggle ${toggleId} to ${value}`);
  const el = document.getElementById(toggleId);
  if (!el) {
    console.error(`❌ Toggle element not found: ${toggleId}`);
    return false;
  }
  
  const isChecked = String(value).toLowerCase() === 'yes';
  console.log(`  Target state: checked=${isChecked}, value=${isChecked ? 'yes' : 'no'}`);
  console.log(`  Current state: checked=${el.checked}, value=${el.value}`);
  
  // Method 1: Direct property setting
  el.checked = isChecked;
  el.value = isChecked ? 'yes' : 'no';
  console.log(`  After direct setting: checked=${el.checked}, value=${el.value}`);
  
  // Method 2: Trigger events
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  
  // Method 3: Force click if state doesn't match
  setTimeout(() => {
    if (el.checked !== isChecked) {
      console.log(`  State mismatch, using click() method...`);
      el.click();
      setTimeout(() => {
        console.log(`  After click: checked=${el.checked}, value=${el.value}`);
        evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
      }, 100);
    } else {
      console.log(`  ✅ State correctly set: checked=${el.checked}, value=${el.value}`);
      evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
    }
  }, 50);
  
  return true;
}

function debugFixAllToggles() {
  console.log('🔧 DEBUG: Fixing all toggle states from current form values...');
  
  const switches = document.querySelectorAll('.switch-input');
  switches.forEach(switchEl => {
    const currentValue = switchEl.value;
    const expectedChecked = currentValue === 'yes';
    
    if (switchEl.checked !== expectedChecked) {
      console.log(`🔧 Fixing ${switchEl.id}: value=${currentValue}, checked=${switchEl.checked} -> ${expectedChecked}`);
      switchEl.checked = expectedChecked;
      switchEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  
  setTimeout(() => {
    evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
    console.log('✅ All toggle states fixed and visibility updated');
  }, 100);
}

function debugTestTLSToggle() {
  console.log('🧪 DEBUG: Testing TLS Internal toggle specifically...');
  const toggle = document.getElementById('basics_kolla_enable_tls_internal');
  
  if (!toggle) {
    console.error('❌ TLS Internal toggle not found');
    return;
  }
  
  console.log(`Current state: checked=${toggle.checked}, value=${toggle.value}`);
  
  // Test setting to 'yes'
  console.log('🔄 Setting to YES...');
  toggle.checked = true;
  toggle.value = 'yes';
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  
  setTimeout(() => {
    console.log(`After setting YES: checked=${toggle.checked}, value=${toggle.value}`);
    
    // Check if dependent field is visible
    const certField = document.getElementById('basics_kolla_internal_fqdn_cert');
    const certWrapper = certField?.closest('[style*="margin-bottom"]');
    const isVisible = certWrapper && certWrapper.style.display !== 'none';
    
    console.log(`Certificate field visible: ${isVisible}`);
    
    if (!isVisible) {
      console.log('🔄 Triggering manual visibility evaluation...');
      evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
    }
  }, 100);
}

function debugTestConfigLoad() {
  console.log('🧪 DEBUG: Testing configuration loading with TLS and Cinder enabled...');
  
  const testConfig = {
    basics: {
      domain_setup: 'yes',                    // Enable domain setup first
      kolla_enable_tls_internal: 'yes',       // Enable internal TLS
      kolla_enable_tls_external: 'no',        // External TLS disabled for this test
      kolla_internal_fqdn_cert: '/path/to/internal-cert.pem',  // Certificate path
      kolla_external_fqdn_cert: '/path/to/external-cert.pem'   // This should trigger validation error
    },
    storage: {
      enable_cinder: 'yes',                   // Enable Cinder storage
      volume_driver: 'LVM',                   // Set volume driver
      cinder_volume_group: 'cinder-volumes'  // Volume group
    },
    network: {
      enable_neutron_provider_networks: 'yes',
      neutron_external_interface: 'eth1'
    }
  };
  
  console.log('📝 Loading test config with cascading dependencies:', testConfig);
  
  // Call the actual function
  populateFormFromConfig(testConfig);
  
  // Check results after a delay
  setTimeout(() => {
    const domainSetup = document.getElementById('basics_domain_setup');
    const tlsInternal = document.getElementById('basics_kolla_enable_tls_internal');
    const enableCinder = document.getElementById('storage_enable_cinder');
    const volumeDriver = document.getElementById('storage_volume_driver');
    const volumeGroup = document.getElementById('storage_cinder_volume_group');
    
    console.log(`Domain setup after load: checked=${domainSetup?.checked}, value=${domainSetup?.value}`);
    console.log(`TLS Internal after load: checked=${tlsInternal?.checked}, value=${tlsInternal?.value}`);
    console.log(`Enable Cinder after load: checked=${enableCinder?.checked}, value=${enableCinder?.value}`);
    console.log(`Volume Driver after load: value=${volumeDriver?.value}`);
    console.log(`Volume Group after load: value=${volumeGroup?.value}`);
    
    const internalCert = document.getElementById('basics_kolla_internal_fqdn_cert');
    const volumeDriverWrapper = volumeDriver?.closest('[style*="margin-bottom"]');
    const volumeGroupWrapper = volumeGroup?.closest('[style*="margin-bottom"]');
    
    if (internalCert) {
      const internalWrapper = internalCert.closest('[style*="margin-bottom"]');
      const internalVisible = internalWrapper && internalWrapper.style.display !== 'none';
      console.log(`Internal cert field visible after load: ${internalVisible}`);
    }
    
    const volumeDriverVisible = volumeDriverWrapper && volumeDriverWrapper.style.display !== 'none';
    const volumeGroupVisible = volumeGroupWrapper && volumeGroupWrapper.style.display !== 'none';
    
    console.log(`Volume Driver field visible after load: ${volumeDriverVisible}`);
    console.log(`Volume Group field visible after load: ${volumeGroupVisible}`);
  }, 1500);
}

function debugTestCascadingDependencies() {
  console.log('🧪 DEBUG: Testing cascading dependencies step by step...');
  
  // Step 1: Reset everything
  console.log('🔄 Step 1: Resetting all toggles...');
  const allSwitches = document.querySelectorAll('.switch-input');
  allSwitches.forEach(sw => {
    sw.checked = false;
    sw.value = 'no';
    sw.dispatchEvent(new Event('change', { bubbles: true }));
  });
  
  setTimeout(() => {
    // Step 2: Enable domain setup
    console.log('🔄 Step 2: Enabling domain setup...');
    const domainSetup = document.getElementById('basics_domain_setup');
    if (domainSetup) {
      domainSetup.checked = true;
      domainSetup.value = 'yes';
      domainSetup.dispatchEvent(new Event('change', { bubbles: true }));
      
      setTimeout(() => {
        // Check if TLS toggles became visible
        const tlsInternal = document.getElementById('basics_kolla_enable_tls_internal');
        const tlsExternal = document.getElementById('basics_kolla_enable_tls_external');
        
        const tlsInternalWrapper = tlsInternal?.closest('[style*="margin-bottom"]');
        const tlsExternalWrapper = tlsExternal?.closest('[style*="margin-bottom"]');
        
        const tlsInternalVisible = tlsInternalWrapper && tlsInternalWrapper.style.display !== 'none';
        const tlsExternalVisible = tlsExternalWrapper && tlsExternalWrapper.style.display !== 'none';
        
        console.log(`After domain setup - TLS Internal visible: ${tlsInternalVisible}, TLS External visible: ${tlsExternalVisible}`);
        
        // Step 3: Enable TLS Internal
        if (tlsInternal && tlsInternalVisible) {
          console.log('🔄 Step 3: Enabling TLS Internal...');
          tlsInternal.checked = true;
          tlsInternal.value = 'yes';
          tlsInternal.dispatchEvent(new Event('change', { bubbles: true }));
          
          setTimeout(() => {
            // Check if certificate field became visible
            const internalCert = document.getElementById('basics_kolla_internal_fqdn_cert');
            const internalCertWrapper = internalCert?.closest('[style*="margin-bottom"]');
            const internalCertVisible = internalCertWrapper && internalCertWrapper.style.display !== 'none';
            
            console.log(`After TLS Internal enable - Certificate field visible: ${internalCertVisible}`);
          }, 500);
        }
      }, 500);
    }
  }, 500);
}

function debugCertificateValidation() {
  console.log('🧪 DEBUG: Testing certificate validation...');
  
  // Test scenario: Certificate uploaded but missing FQDN
  const testConfig = {
    basics: {
      domain_setup: 'yes',
      kolla_enable_tls_external: 'yes',
      // Missing kolla_external_fqdn - this should cause validation error
      kolla_external_fqdn_cert: '/path/to/external-cert.pem'
    }
  };
  
  console.log('📝 Loading config with certificate but missing FQDN:', testConfig);
  populateFormFromConfig(testConfig);
  
  // Test form validation after loading
  setTimeout(() => {
    console.log('🔍 Testing form validation...');
    const errors = formGenerator.validateForm();
    
    if (errors.length > 0) {
      console.log('✅ Validation correctly caught missing FQDN:', errors);
    } else {
      console.log('❌ Validation failed to catch missing FQDN!');
    }
  }, 2000);
}

window.debugCertificateValidation = debugCertificateValidation;

// Make debug functions globally accessible
window.debugToggleStates = debugToggleStates;
window.debugLoadTestConfig = debugLoadTestConfig;
window.debugTestComprehensiveValidation = debugTestComprehensiveValidation;
window.debugTestTLSValidation = debugTestTLSValidation;
window.debugTestCertificateCleanup = debugTestCertificateCleanup;
window.debugTestVolumeGroupLoading = debugTestVolumeGroupLoading;
window.debugForceToggleUpdate = debugForceToggleUpdate;
window.debugFixAllToggles = debugFixAllToggles;
window.cleanupCertificatesOnDomainDisable = cleanupCertificatesOnDomainDisable;

/* ===================== VISIBILITY & NETWORK/VG HELPERS ===================== */
function evaluateVisibility(container, schema) {
  const values = {};
  container.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.name) return;
    const parts = el.name.split('_');
    const section = parts[0];
    const key = parts.slice(1).join('_');
    const val = el.classList.contains('switch-input') ? (el.checked ? 'yes' : 'no') : el.value;
    values[`${section}.${key}`] = val;
  });

  for (const [sectionKey, section] of Object.entries(schema)) {
    for (const [fieldKey, field] of Object.entries(section.fields)) {
      const fieldId = `${sectionKey}_${fieldKey}`;
      const input = container.querySelector(`#${fieldId}`);
      if (!input) continue;
      const wrap = input.closest('[style*="margin-bottom"]') || input.parentElement;

      let show = true;
      if (field.visibleWhen) {
        if (field.visibleWhen.conditions) {
          // Handle compound conditions (ALL must be true)
          show = field.visibleWhen.conditions.every(condition => {
            const depVal = values[`${sectionKey}.${condition.field}`] || '';
            if (condition.equals === '__NONEMPTY__') {
              return depVal.trim() !== '';
            }
            return depVal === condition.equals;
          });
        } else {
          // Handle single condition (legacy format)
          const depVal = values[`${sectionKey}.${field.visibleWhen.field}`] || '';
          if (field.visibleWhen.equals === '__NONEMPTY__') {
            show = depVal.trim() !== '';
          } else {
            show = (depVal === field.visibleWhen.equals);
          }
        }
      }
      wrap.style.display = show ? '' : 'none';
      if (!show) {
        if (input.classList.contains('switch-input')) input.checked = String(field.default).toLowerCase() === 'yes';
        else input.value = '';
      }
    }
  }
}

/* ===================== COCKPIT ERROR HANDLING ===================== */
// Enhanced wrapper for cockpit operations with error handling
async function safeCockpitSpawn(command, args = [], options = {}) {
  try {
    return await cockpit.spawn(command, args, options);
  } catch (error) {
    const errorMsg = error.message || error.toString();
    console.error('Cockpit operation failed:', { command, args, error: errorMsg });
    
    // Don't show certain expected/benign errors in the GUI
    const benignErrors = [
      'not-found',
      'no such table: Lastlog2',
      'Failed to get current crypto policy',
      'Permission denied'
    ];
    
    const isBenign = benignErrors.some(benign => errorMsg.includes(benign));
    if (!isBenign) {
      showStatus(`System operation failed: ${errorMsg}`, 'warning');
    }
    
    throw error; // Re-throw for caller to handle
  }
}

/* ===================== NETWORK / VG ===================== */
async function detectNetworkInterfaces() {
  try {
    const out = await safeCockpitSpawn(
      ['bash', '-lc', "ifconfig -a | sed 's/[ \\t].*//;/^$/d'"],
      { superuser: 'try', err: 'message' }
    );
    let nics = out.trim().split('\n').map(s => s.trim()).filter(Boolean)
      .map(n => n.replace(/:$/, ''))
      .filter(n => n !== 'lo');
    if (!nics.length) throw new Error('no nics');
    return nics;
  } catch (e) {
    console.error('detectNetworkInterfaces:', e);
    showStatus('Could not detect interfaces; using common defaults', 'warning');
    return ['eth0','eth0.100','eth1','ens3','eno1'];
  }
}

async function updateNetworkInterfaceOptions() {
  const nics = await detectNetworkInterfaces();
  ALL_INTERFACES = nics;

  if (CONFIG_SCHEMA.basics?.fields?.network_interface) {
    CONFIG_SCHEMA.basics.fields.network_interface.options = nics;
    CONFIG_SCHEMA.basics.fields.network_interface.default = nics[0] || '';
  }
  if (CONFIG_SCHEMA.network?.fields?.neutron_external_interface) {
    CONFIG_SCHEMA.network.fields.neutron_external_interface.options = nics;
    CONFIG_SCHEMA.network.fields.neutron_external_interface.default = '';
  }
  return nics;
}

async function populateInterfacesAndAutofill() {
  try {
    const mgmt = document.getElementById('basics_network_interface');
    const vip = document.getElementById('basics_kolla_internal_vip_address');
    if (!mgmt || !vip) return;

    const getIPv4 = async (iface) => {
      const cmd = `
        (ip -o -4 addr show dev "${iface}" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1) \
        || (ifconfig "${iface}" 2>/dev/null | awk '/inet /{print $2}' | sed 's/addr://' | head -n1)
      `;
      const out = await cockpit.spawn(['bash', '-lc', cmd], { superuser: 'try', err: 'message' });
      return (out || '').trim();
    };

    const setFromSelected = async () => {
      if (!mgmt.value) return;
      
      // Don't override VIP address during configuration loading if it already has a value
      if (window.isLoadingConfiguration && vip.value && vip.value.trim()) {
        console.log('🛡️ Protecting VIP address during config loading:', vip.value);
        return;
      }
      
      const ip = await getIPv4(mgmt.value);
      if (ip) { vip.value = ip; vip.placeholder = ''; }
      else { vip.value = ''; vip.placeholder = 'No IPv4 found — enter manually'; }
    };

    await setFromSelected();
    mgmt.addEventListener('change', setFromSelected);
  } catch (e) {
    console.error('populateInterfacesAndAutofill:', e);
  }
}

function syncExternalInterfaceOptions() {
  const mgmt = document.getElementById('basics_network_interface');
  const ext = document.getElementById('network_neutron_external_interface');
  if (!mgmt || !ext) return;

  const current = ext.value;
  ext.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = '— Select —';
  ext.appendChild(ph);

  const filtered = ALL_INTERFACES.filter(n => n !== mgmt.value);
  filtered.forEach(n => {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    ext.appendChild(o);
  });

  if (current && current !== mgmt.value && filtered.includes(current)) ext.value = current;
  else ext.value = '';
}

async function hookExternalInterfaceBehavior() {
  const ext = document.getElementById('network_neutron_external_interface');
  const hint = document.getElementById('neutron_ext_ip_hint');
  if (!ext || !hint) return;

  const getIPv4 = async (iface) => {
    const cmd = `
      (ip -o -4 addr show dev "${iface}" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1) \
      || (ifconfig "${iface}" 2>/dev/null | awk '/inet /{print $2}' | sed 's/addr://' | head -n1)
    `;
    const out = await cockpit.spawn(['bash', '-lc', cmd], { superuser: 'try', err: 'message' });
    return (out || '').trim();
  };

  let msg = '';
  if (ext.value) {
    const ip = await getIPv4(ext.value);
    if (ip) msg = `Selected interface has IP ${ip}. This IP will be unusable — interface is dedicated to provider/VM traffic.`;
    else    msg = `Selected interface has no IPv4. It will be dedicated to provider/VM traffic.`;
  }
  hint.textContent = msg;
}

async function detectAvailableVolumeGroups() {
  try {
    const vgOut = await cockpit.spawn(
      ['bash','-lc', "vgs --noheadings -o vg_name | awk '{$1=$1;print}'"],
      { superuser: 'try', err: 'message' }
    );
    const allVgs = vgOut.trim().split('\n').map(s => s.trim()).filter(Boolean);

    const usedOut = await cockpit.spawn(
      ['bash','-lc', "lvs --noheadings -o vg_name,lv_attr | awk '$2 ~ /a/ {print $1}' | sort -u"],
      { superuser: 'try', err: 'message' }
    );
    const usedSet = new Set(usedOut.trim().split('\n').map(s => s.trim()).filter(Boolean));

    const freeVgs = allVgs.filter(vg => !usedSet.has(vg));
    return { freeVgs, allVgs, usedVgs: Array.from(usedSet) };
  } catch (e) {
    console.error('detectAvailableVolumeGroups:', e);
    return { freeVgs: [], allVgs: [], usedVgs: [] };
  }
}

async function updateVGOptionsAndHint(preserveValue = null) {
  const driverEl = document.getElementById('storage_volume_driver');
  const cinderChk = document.getElementById('storage_enable_cinder'); // switch-input
  const vgSelect  = document.getElementById('storage_cinder_volume_group');
  const vgHint    = document.getElementById('cinder_vg_hint');

  if (!driverEl || !vgSelect || !cinderChk) return;

  // Preserve current value if not explicitly provided
  const currentValue = preserveValue !== null ? preserveValue : vgSelect.value;

  const cinderOn = cinderChk.checked;
  const driver   = driverEl.value;

  if (!(cinderOn && driver === 'LVM')) {
    vgSelect.innerHTML = '';
    vgSelect.disabled = false;
    if (vgHint) vgHint.textContent = '';
    return;
  }

  const { freeVgs, allVgs } = await detectAvailableVolumeGroups();

  vgSelect.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = '— Select VG —';
  vgSelect.appendChild(ph);

  if (freeVgs.length) {
    freeVgs.forEach(vg => {
      const o = document.createElement('option');
      o.value = vg; o.textContent = vg;
      vgSelect.appendChild(o);
    });
    vgSelect.disabled = false;
    if (vgHint) vgHint.textContent = 'Only volume groups without active logical volumes are shown.';
    
    // Restore the value if it exists in the options
    if (currentValue && freeVgs.includes(currentValue)) {
      vgSelect.value = currentValue;
      console.log(`🎯 Restored Volume Group selection: ${currentValue}`);
    }
  } else {
    vgSelect.disabled = true;
    if (vgHint) vgHint.textContent = (allVgs.length === 0)
      ? 'No volume groups found. Please create a VG in the storage section and retry.'
      : 'No free volume groups found (all have active LVs). Create a new VG for Cinder LVM.';
  }
}

/* ===================== RESET & EXPORTS ===================== */
function resetToDefaults() {
  if (confirm('Reset all settings to defaults?')) {
    if (formGenerator) {
      formGenerator.generateForm().then(async () => {
        await populateInterfacesAndAutofill();
        syncExternalInterfaceOptions();
        hookExternalInterfaceBehavior();
        await updateVGOptionsAndHint();
        evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
        wireFlatSwitches();
        showStatus('Configuration reset', 'success');
      });
    }
  }
}

window.saveConfiguration        = saveConfiguration;
window.previewConfiguration     = previewConfiguration;
window.downloadConfiguration    = downloadConfiguration;
window.loadSavedConfiguration   = loadSavedConfiguration;
window.resetToDefaults          = resetToDefaults;
