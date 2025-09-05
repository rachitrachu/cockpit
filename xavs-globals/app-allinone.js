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
        validation: /^(?:\d{1,3}\.){3}\d{1,3}$/
      },
      kolla_external_vip_address: {
        type: 'text',
        label: 'External VIP Address',
        description: 'Public-facing API VIP (optional).',
        placeholder: 'Externally reachable VIP for public APIs (e.g., 203.0.113.10)',
        default: '',
        required: false,
        validation: /^(?:\d{1,3}\.){3}\d{1,3}$/
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
        validation: /^[a-z0-9.-]+$/i,
        visibleWhen: { field: 'domain_setup', equals: 'yes' }
      },
      kolla_external_fqdn: {
        type: 'text',
        label: 'External FQDN',
        description: 'Should resolve to External VIP Address',
        placeholder: 'e.g., xavs.example.com',
        default: '',
        required: false,
        validation: /^[a-z0-9.-]+$/i,
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
        type: 'text',
        label: 'Internal FQDN Cert Path',
        description: 'Path to certificate for Internal FQDN',
        placeholder: 'Consolidated PEM (e.g., /etc/kolla/certificates/xloud.pem)',
        default: '',
        required: false,
        visibleWhen: { field: 'kolla_enable_tls_internal', equals: 'yes' }
      },
      kolla_external_fqdn_cert: {
        type: 'text',
        label: 'External FQDN Cert Path',
        description: 'Path to certificate for External FQDN',
        placeholder: 'Consolidated PEM (e.g., /etc/kolla/certificates/xloud.pem)',
        default: '',
        required: false,
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
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'volume_driver', equals: 'LVM' }
        ]
      },
      enable_cinder_backend_nfs: {
        type: 'toggle',
        label: 'Enable NFS Backend',
        description: 'Make sure you have configured NFS in the shares tab.',
        default: 'no',
        required: false,
        visibleWhen: { field: 'volume_driver', equals: 'NFS' }
      },
      nfs_share_path: {
        type: 'text',
        label: 'NFS Share Path',
        description: 'NFS share path for Cinder volumes (e.g., nfs-server:/path/to/share)',
        placeholder: '192.168.1.100:/srv/nfs/cinder',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'volume_driver', equals: 'NFS' },
          { field: 'enable_cinder_backend_nfs', equals: 'yes' }
        ]
      },
      note_ceph: {
        type: 'note',
        label: '',
        description: 'These features are coming in future. Please refer to XLOUD guide: https://xloud.tech/knowledgeBase/getting-started for Ceph-based deployment.',
        visibleWhen: { field: 'volume_driver', equals: 'CEPH' }
      },
      note_san: {
        type: 'note',
        label: '',
        description: 'These features are coming in future. Please refer to XLOUD guide: https://xloud.tech/knowledgeBase/getting-started for SAN-based deployment.',
        visibleWhen: { field: 'volume_driver', equals: 'SAN' }
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
          <h6><i class="fas fa-wrench"></i> Custom YAML Guidelines:</h6>
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
  },

  logs: {
    title: 'Logs',
    description: 'Configuration and activity logs',
    fields: {
      // This will be handled specially in the form generator
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
    
    // Tab icons mapping
    const tabIcons = {
      'basics': 'fas fa-cog',
      'network': 'fas fa-network-wired', 
      'storage': 'fas fa-hdd',
      'monitoring': 'fas fa-chart-line',
      'custom': 'fas fa-wrench',
      'logs': 'fas fa-terminal'
    };
    
    for (const [sectionKey, section] of Object.entries(this.schema)) {
      const icon = tabIcons[sectionKey] || 'fas fa-cog';
      formHtml += `
        <li class="nav-item" role="presentation">
          <button class="nav-link ${isFirst ? 'active' : ''}" id="${sectionKey}-tab" data-bs-toggle="tab"
                  data-bs-target="#${sectionKey}-pane" type="button" role="tab">
            <i class="${icon}"></i> ${section.title}
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
      if (sectionKey === 'logs') {
        // Special handling for logs section
        formHtml += `
          <div class="col-12">
            <div class="config-log-section">
              <div class="config-log-header">
                <h6><i class="fas fa-terminal"></i> Configuration Log</h6>
                <button type="button" id="clear-log-btn" class="btn btn-sm btn-outline-muted">
                  <i class="fas fa-trash"></i> Clear
                </button>
              </div>
              <div id="config-log" class="config-log-content">
                <div class="log-entry log-info">
                  <span class="log-time"></span>
                  <span class="log-message">Configuration interface initialized</span>
                </div>
              </div>
            </div>
          </div>`;
      } else {
        // Regular fields
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

              <!-- EXACT HTML from button.html -->
              <label class="switch">
                <input ${defYes ? 'checked' : ''} type="checkbox" id="${fieldId}" name="${fieldId}" class="switch-input">
                <div class="slider">
                  <div class="circle">
                    <svg class="cross" xml:space="preserve" style="enable-background:new 0 0 512 512" viewBox="0 0 365.696 365.696" y="0" x="0" height="6" width="6" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" xmlns="http://www.w3.org/2000/svg">
                      <g>
                        <path data-original="#000000" fill="currentColor" d="M243.188 182.86 356.32 69.726c12.5-12.5 12.5-32.766 0-45.247L341.238 9.398c-12.504-12.503-32.77-12.503-45.25 0L182.86 122.528 69.727 9.374c-12.5-12.5-32.766-12.5-45.247 0L9.375 24.457c-12.5 12.504-12.5 32.77 0 45.25l113.152 113.152L9.398 295.99c-12.503 12.503-12.503 32.769 0 45.25L24.48 356.32c12.5 12.5 32.766 12.5 45.247 0l113.132-113.132L295.99 356.32c12.503 12.5 32.769 12.5 45.25 0l15.081-15.082c12.5-12.504 12.5-32.77 0-45.25zm0 0"></path>
                      </g>
                    </svg>
                    <svg class="checkmark" xml:space="preserve" style="enable-background:new 0 0 512 512" viewBox="0 0 24 24" y="0" x="0" height="10" width="10" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" xmlns="http://www.w3.org/2000/svg">
                      <g>
                        <path class="" data-original="#000000" fill="currentColor" d="M9.707 19.121a.997.997 0 0 1-1.414 0l-5.646-5.647a1.5 1.5 0 0 1 0-2.121l.707-.707a1.5 1.5 0 0 1 2.121 0L9 14.171l9.525-9.525a1.5 1.5 0 0 1 2.121 0l.707.707a1.5 1.5 0 0 1 0 2.121z"></path>
                      </g>
                    </svg>
                  </div>
                </div>
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
      } // Close the else block for regular fields

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
    
    // Evaluate visibility after switches are set to defaults
    evaluateVisibility(this.container, this.schema);
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
      } else {
        data[section][field] = input.value;
      }
    });
    return data;
  }

  validateForm() {
    const errors = [];
    const inputs = this.container.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      const wrapper = input.closest('[style*="margin-bottom"]');
      if (wrapper && wrapper.style.display === 'none') return;

      const parts = (input.name || '').split('_');
      if (parts.length < 2) return;
      const section = parts[0];
      const key     = parts.slice(1).join('_');
      const fieldDef = CONFIG_SCHEMA?.[section]?.fields?.[key];
      if (!fieldDef) return;

      const label = wrapper ? (wrapper.querySelector('.form-label')?.textContent || key) : key;

      if (fieldDef.type !== 'toggle' && fieldDef.type !== 'note') {
        if (fieldDef.required && !String(input.value || '').trim()) {
          errors.push(`${label.trim()} is required`);
          input.classList.add('is-invalid');
          return;
        }
        if (fieldDef.validation && input.value) {
          try {
            const re = fieldDef.validation;
            if (!re.test(input.value)) {
              errors.push(`${label.trim()} has invalid format`);
              input.classList.add('is-invalid');
              return;
            }
          } catch (e) {}
        }
      }
      input.classList.remove('is-invalid');
    });
    return errors;
  }
}

/* ===================== VALIDATION UTILITIES ===================== */
function isValidIPv4(ip) {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

function isValidDomain(domain) {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  return domainRegex.test(domain) && domain.length <= 253;
}

function validateField(input, fieldDef) {
  const value = input.value.trim();
  const errors = [];

  // Check if required
  if (fieldDef.required && !value) {
    errors.push('This field is required');
    return errors;
  }

  // Skip validation if empty and not required
  if (!value) return errors;

  // Check specific field types by name/id
  const fieldId = input.id || input.name || '';
  
  if (fieldId.includes('vip_address') || fieldId.includes('ip_address')) {
    if (!isValidIPv4(value)) {
      errors.push('Please enter a valid IP address (e.g., 192.168.1.100)');
    }
  }

  if (fieldId.includes('fqdn') || fieldId.includes('domain')) {
    if (!isValidDomain(value)) {
      errors.push('Please enter a valid domain name (e.g., example.com)');
    }
  }

  // Check regex validation if provided
  if (fieldDef.validation && !fieldDef.validation.test(value)) {
    errors.push('Invalid format');
  }

  return errors;
}

function validateAllFields() {
  if (!formGenerator) return { isValid: false, errors: [] };
  
  const allErrors = [];
  let isValid = true;
  
  // Get current form values for conditional validation
  const formValues = {};
  const inputs = formGenerator.container.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    const parts = (input.name || '').split('_');
    if (parts.length >= 2) {
      const section = parts[0];
      const key = parts.slice(1).join('_');
      const value = input.classList.contains('switch-input') ? (input.checked ? 'yes' : 'no') : input.value;
      formValues[`${section}.${key}`] = value;
    }
  });
  
  inputs.forEach(input => {
    // Skip hidden fields
    const wrapper = input.closest('[style*="margin-bottom"]');
    if (wrapper && wrapper.style.display === 'none') return;
    
    // Get field definition
    const parts = (input.name || '').split('_');
    if (parts.length < 2) return;
    const section = parts[0];
    const key = parts.slice(1).join('_');
    const fieldDef = CONFIG_SCHEMA?.[section]?.fields?.[key];
    if (!fieldDef) return;
    
    // Skip toggles and notes
    if (fieldDef.type === 'toggle' || fieldDef.type === 'note') return;
    
    const fieldId = `${section}_${key}`;
    const fieldLabel = wrapper?.querySelector('.form-label')?.textContent?.replace('*', '').trim() || key;
    
    // Check if this field should be conditionally required
    let isConditionallyRequired = fieldDef.required;
    
    // Apply your specific conditional requirements
    
    // 1. Internal VIP address is always required (already marked as required: true)
    
    // 2. If domain setup is enabled then internal FQDN is required
    if (fieldId === 'basics_kolla_internal_fqdn') {
      isConditionallyRequired = formValues['basics.domain_setup'] === 'yes';
    }
    
    // 3. If any TLS option is enabled - then path for cert file required
    if (fieldId === 'basics_kolla_internal_fqdn_cert') {
      isConditionallyRequired = formValues['basics.kolla_enable_tls_internal'] === 'yes';
    }
    if (fieldId === 'basics_kolla_external_fqdn_cert') {
      isConditionallyRequired = formValues['basics.kolla_enable_tls_external'] === 'yes';
    }
    
    // 4. If Cinder is enabled and volume driver is LVM then VG is required
    if (fieldId === 'storage_cinder_volume_group') {
      isConditionallyRequired = formValues['storage.enable_cinder'] === 'yes' && 
                               formValues['storage.volume_driver'] === 'LVM';
    }
    
    // 4. If Cinder is enabled and volume driver is NFS then NFS backend must be enabled
    if (fieldId === 'storage_enable_cinder_backend_nfs') {
      if (formValues['storage.enable_cinder'] === 'yes' && formValues['storage.volume_driver'] === 'NFS') {
        // For NFS, the toggle must be enabled
        const isNfsEnabled = input.classList.contains('switch-input') ? input.checked : input.value === 'yes';
        if (!isNfsEnabled) {
          isValid = false;
          input.classList.add('field-required');
          allErrors.push({
            field: fieldId,
            label: fieldLabel,
            errors: ['NFS backend must be enabled when using NFS volume driver']
          });
          return; // Skip other validation for this field
        }
      }
    }
    
    // 5. If NFS backend is enabled then NFS share path is required
    if (fieldId === 'storage_nfs_share_path') {
      isConditionallyRequired = formValues['storage.enable_cinder'] === 'yes' && 
                               formValues['storage.volume_driver'] === 'NFS' &&
                               formValues['storage.enable_cinder_backend_nfs'] === 'yes';
    }
    
    // Validate regular field requirements
    if (isConditionallyRequired) {
      const fieldErrors = validateField(input, { ...fieldDef, required: true });
      if (fieldErrors.length > 0) {
        isValid = false;
        input.classList.add('field-required');
        allErrors.push({
          field: fieldId,
          label: fieldLabel,
          errors: fieldErrors
        });
      } else {
        input.classList.remove('field-required');
      }
    } else {
      // Field is not required, just validate format if value exists
      const fieldErrors = validateField(input, { ...fieldDef, required: false });
      if (fieldErrors.length > 0) {
        isValid = false;
        input.classList.add('field-required');
        allErrors.push({
          field: fieldId,
          label: fieldLabel,
          errors: fieldErrors
        });
      } else {
        input.classList.remove('field-required');
      }
    }
  });
  
  return { isValid, errors: allErrors };
}

function updateSaveButtonState() {
  const saveBtn = document.getElementById('save');
  if (!saveBtn) return;
  
  const validation = validateAllFields();
  
  if (validation.isValid) {
    saveBtn.disabled = false;
    saveBtn.classList.remove('btn-disabled');
    saveBtn.classList.add('btn-brand');
  } else {
    saveBtn.disabled = true;
    saveBtn.classList.add('btn-disabled');
    saveBtn.classList.remove('btn-brand');
  }
}

let formGenerator = null;

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

/* ========== Switch CSS now in style.css - no injection needed ========== */
function injectSwitchCSS() {
  // Switch CSS is now properly defined in style.css
  // No injection needed to avoid conflicts
}

/* Ensure checkbox switches store 'yes'/'no' values */
function wireFlatSwitches() {
  document.querySelectorAll('.switch input[type="checkbox"]').forEach(chk => {
    const setVal = () => { chk.value = chk.checked ? 'yes' : 'no'; };
    setVal();
    chk.addEventListener('change', setVal);
  });
}

/* Status panel */
function showStatus(message, type = 'info') {
  // Add to log instead of showing banner
  addConfigLog(message, type);
  
  // Only show banner for critical errors
  if (type === 'danger' || type === 'error') {
    const el = document.getElementById('status_panel');
    if (el) {
      el.className = `alert alert-${type === 'error' ? 'danger' : type}`;
      el.textContent = message;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
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
    yaml += `# ${comments[sectionKey] || (sectionKey.toUpperCase() + ' Configuration')}\n`;

    const isStorage  = (sectionKey === 'storage');
    const isAdvanced = (sectionKey === 'advanced');

    for (const [key, value] of Object.entries(sectionValue)) {
      if (value === undefined || value === null || value === '') continue;
      if (YAML_SKIP_KEYS.has(key)) continue;
      if (YAML_ONLY_IF_YES.has(key) && String(value).toLowerCase() !== 'yes') continue;
      if (isStorage && (key === 'enable_cinder_backend_nfs' || key === 'cinder_volume_group' || key === 'nfs_share_path')) continue;
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
          if (String(sectionValue.enable_cinder_backend_nfs || 'no').toLowerCase() === 'yes') {
            writeKV('enable_cinder_backend_nfs', 'yes');
            const nfsPath = sectionValue.nfs_share_path || '';
            if (nfsPath) {
              writeKV('nfs_share_path', nfsPath);
            }
          }
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
  showStatus('Validating configuration...', 'info');
  
  // Validate required fields and highlight any missing ones
  const validationErrors = validateRequiredFields();
  if (validationErrors.length > 0) {
    addConfigLog(`Validation failed: ${validationErrors.length} required field(s) missing`, 'error');
    showStatus('Please fill in all required fields (highlighted in red)', 'danger');
    return;
  }
  
  try {
    if (!formGenerator) throw new Error('Form generator not initialized');
    const errs = formGenerator.validateForm();
    if (errs.length) {
      addConfigLog('Form validation failed', 'error');
      showStatus('Validation failed. Please check required fields.', 'danger');
      console.error('Validation errors:', errs);
      return;
    }

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
    await cockpit.spawn(['bash', '-lc', cmd], { superuser: 'require', err: 'out' });

    const readback = await cockpit.file(filePath).read();
    if (!readback || !readback.length) throw new Error('Configuration file seems empty');

    addConfigLog(`Configuration successfully saved to ${filePath}`, 'success');
    showStatus(`Configuration saved to ${filePath}`, 'success');
    return filePath;
  } catch (e) {
    console.error('Save failed:', e);
    addConfigLog(`Save failed: ${e.message}`, 'error');
    showStatus('Failed to save configuration: ' + e.message, 'danger');
  }
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

    // Reactivity
    formGenerator.container.addEventListener('change', async (e) => {
      if (!e.target || !e.target.name) return;

      // Log field changes
      const fieldLabel = document.querySelector(`label[for="${e.target.id}"]`)?.textContent.replace('*', '').trim() || e.target.name;
      const newValue = e.target.type === 'checkbox' ? (e.target.checked ? 'Yes' : 'No') : e.target.value;
      
      if (newValue) {
        logFieldChange(fieldLabel, newValue);
        // Remove required field highlighting if filled
        e.target.classList.remove('field-required');
      }

      if (e.target.id === 'basics_network_interface') syncExternalInterfaceOptions();
      if (e.target.id === 'network_neutron_external_interface') hookExternalInterfaceBehavior();

      if (e.target.id === 'storage_volume_driver' || e.target.id === 'storage_enable_cinder')
        await updateVGOptionsAndHint();

      evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
      
      // Update save button state after any change
      setTimeout(updateSaveButtonState, 100);
    });

    // Add input event listeners for real-time validation
    formGenerator.container.addEventListener('input', (e) => {
      // Get field definition for validation
      const parts = (e.target.name || '').split('_');
      if (parts.length >= 2) {
        const section = parts[0];
        const key = parts.slice(1).join('_');
        const fieldDef = CONFIG_SCHEMA?.[section]?.fields?.[key];
        
        if (fieldDef) {
          const errors = validateField(e.target, fieldDef);
          if (errors.length > 0) {
            e.target.classList.add('field-required');
            e.target.title = errors.join(', ');
          } else {
            e.target.classList.remove('field-required');
            e.target.title = '';
          }
        }
      }
      
      // Update save button state after input
      setTimeout(updateSaveButtonState, 100);
    });

    setupEventListeners();
    setupHelpUX();     // hover & click
    evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
    
    // Initialize save button state
    setTimeout(updateSaveButtonState, 500);
    
    showStatus('Configuration UI ready', 'success');
  } catch (e) {
    console.error('Init failed:', e);
    showStatus('Failed to load: ' + e.message, 'danger');
  }
});

/* ===================== CONFIGURATION LOGGING ===================== */
function addConfigLog(message, type = 'info') {
  const logContainer = document.getElementById('config-log');
  if (!logContainer) return;
  
  const timestamp = new Date().toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  logEntry.innerHTML = `
    <span class="log-time">${timestamp}</span>
    <span class="log-message">${message}</span>
  `;
  
  logContainer.appendChild(logEntry);
  
  // Auto-scroll to bottom
  logContainer.scrollTop = logContainer.scrollHeight;
  
  // Update bottom status bar with most recent activity and color coding
  const recentActivity = document.getElementById('recent-activity');
  const statusBar = document.querySelector('.bottom-status-bar');
  if (recentActivity && statusBar) {
    recentActivity.textContent = `${timestamp} - ${message}`;
    
    // Remove existing status classes
    statusBar.classList.remove('status-info', 'status-success', 'status-warning', 'status-error');
    
    // Add appropriate status class for color coding
    const statusClass = type === 'success' ? 'status-success' : 
                       type === 'warning' ? 'status-warning' : 
                       type === 'error' ? 'status-error' : 'status-info';
    statusBar.classList.add(statusClass);
  }
  
  // Limit to 50 entries
  const entries = logContainer.querySelectorAll('.log-entry');
  if (entries.length > 50) {
    entries[0].remove();
  }
}

function clearConfigLog() {
  const logContainer = document.getElementById('config-log');
  if (logContainer) {
    logContainer.innerHTML = '';
    addConfigLog('Configuration log cleared', 'info');
  }
}

function validateRequiredFields() {
  const requiredFields = document.querySelectorAll('[required]');
  let hasErrors = false;
  let missingFields = [];
  
  requiredFields.forEach(field => {
    const value = field.type === 'checkbox' ? field.checked : field.value.trim();
    const isEmpty = field.type === 'checkbox' ? !value : !value;
    
    if (isEmpty) {
      field.classList.add('field-required');
      hasErrors = true;
      
      // Get field label
      const label = document.querySelector(`label[for="${field.id}"]`);
      const fieldName = label ? label.textContent.replace('*', '').trim() : field.name;
      missingFields.push(fieldName);
    } else {
      field.classList.remove('field-required');
    }
  });
  
  if (hasErrors) {
    addConfigLog(`Please fill required fields: ${missingFields.join(', ')}`, 'error');
    return false;
  }
  
  return true;
}

function logFieldChange(fieldName, newValue, oldValue = '') {
  if (newValue !== oldValue) {
    const message = oldValue 
      ? `${fieldName} changed from "${oldValue}" to "${newValue}"`
      : `${fieldName} set to "${newValue}"`;
    addConfigLog(message, 'info');
  }
}

/* ===================== ENHANCED STATUS FUNCTION ===================== */
function setupEventListeners() {
  document.getElementById('save')?.addEventListener('click', (e) => { 
    // Check if button is disabled
    if (e.target.disabled || e.target.classList.contains('btn-disabled')) {
      e.preventDefault();
      e.stopPropagation();
      
      // Show validation popup
      const validation = validateAllFields();
      if (!validation.isValid) {
        let errorMessage = 'Please fill out required details first:\n\n';
        validation.errors.forEach(error => {
          errorMessage += `• ${error.label}: ${error.errors.join(', ')}\n`;
        });
        
        // Create a modal instead of alert
        showValidationModal(errorMessage);
        return false;
      }
    }
    
    saveConfiguration().catch(console.error); 
  });
  document.getElementById('load_config_btn')?.addEventListener('click', () => { loadSavedConfiguration().catch(console.error); });
  document.getElementById('preview_config_btn')?.addEventListener('click', () => { previewConfiguration(); });
  document.getElementById('download_config_btn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); downloadConfiguration(); });
  document.getElementById('reset_config_btn')?.addEventListener('click', () => { resetToDefaults(); });
  
  // Setup dropdown functionality
  setupDropdownMenus();
  
  // Setup clear log button
  document.getElementById('clear-log-btn')?.addEventListener('click', clearConfigLog);
  
  // Setup tab functionality
  setupTabFunctionality();
  
  // Setup view logs button
  document.getElementById('view-logs-btn')?.addEventListener('click', () => {
    switchToLogsTab();
  });

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

/* ===================== TAB FUNCTIONALITY ===================== */
function setupTabFunctionality() {
  // The tabs are already handled by the existing form generator
  // No additional setup needed for the built-in tab system
}

function switchToTab(activeTab, configTab, logsTab, configPane, logsPane) {
  // Not needed - using original tab system
}

function switchToLogsTab() {
  // Switch to the logs tab using the original tab system
  const logsTab = document.getElementById('logs-tab');
  if (logsTab) {
    logsTab.click();
  }
}

function showValidationModal(message) {
  // Remove existing modal if any
  const existingModal = document.getElementById('validationModal');
  if (existingModal) existingModal.remove();
  
  const html = `
    <div class="modal" id="validationModal" role="dialog" aria-modal="true" style="z-index:11000;">
      <div class="modal-content" style="border-radius:12px;border:1px solid #ef4444;max-width:500px;">
        <div class="modal-body" style="padding:20px;">
          <h5 style="color:#ef4444;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
            <i class="fas fa-exclamation-triangle"></i>
            Validation Required
          </h5>
          <div style="white-space:pre-line;font-size:14px;line-height:1.5;">${message}</div>
        </div>
        <div class="modal-foot" style="border-top:1px solid var(--border,#d1d5db);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-brand" id="validation_ok_modal">Understood</button>
        </div>
      </div>
    </div>`;
  
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('validationModal');
  
  const close = () => { modal.remove(); };
  document.getElementById('validation_ok_modal')?.addEventListener('click', close, { once: true });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
}

/* ===================== DROPDOWN MENUS ===================== */
function setupDropdownMenus() {
  // Setup actions dropdown
  const actionsBtn = document.querySelector('.dropdown-toggle');
  const actionsMenu = document.querySelector('.dropdown-menu');
  
  if (actionsBtn && actionsMenu) {
    // Toggle dropdown on button click
    actionsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      actionsMenu.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!actionsBtn.contains(e.target) && !actionsMenu.contains(e.target)) {
        actionsMenu.classList.remove('show');
      }
    });
    
    // Handle dropdown item clicks
    actionsMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      
      e.preventDefault();
      actionsMenu.classList.remove('show');
      
      // Handle different actions based on text content
      const text = item.textContent.trim();
      if (text.includes('Load Configuration')) {
        loadSavedConfiguration().catch(console.error);
      } else if (text.includes('Preview YAML')) {
        previewConfiguration();
      } else if (text.includes('Export YAML')) {
        downloadConfiguration();
      }
    });
  }
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
        populateFormFromConfig(parsed);
        evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
        syncExternalInterfaceOptions();
        hookExternalInterfaceBehavior();
        await updateVGOptionsAndHint();
        wireFlatSwitches();
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
    'nfs_share_path': 'storage',

    // monitoring
    'enable_prometheus': 'monitoring',
    'enable_grafana': 'monitoring',
    'enable_central_logging': 'monitoring',

    // advanced
    'enable_barbican': 'advanced'
  };
  return map[key] || null;
}

function populateFormFromConfig(cfg) {
  if (!formGenerator || !formGenerator.container) return;
  for (const [section, fields] of Object.entries(cfg)) {
    for (const [key, value] of Object.entries(fields)) {
      const id = `${section}_${key}`;
      const el = formGenerator.container.querySelector(`#${id}`);
      if (!el) continue;

      if (el.classList.contains('switch-input')) {
        el.checked = String(value).toLowerCase() === 'yes';
        el.value   = el.checked ? 'yes' : 'no';
      } else if (el.tagName === 'SELECT') {
        if (![...el.options].some(o => o.value === value)) {
          const opt = document.createElement('option'); opt.value = value; opt.textContent = value; el.appendChild(opt);
        }
        el.value = value;
      } else {
        el.value = value;
      }
    }
  }
}

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
        if (Array.isArray(field.visibleWhen)) {
          // Multiple conditions - ALL must be true
          show = field.visibleWhen.every(condition => {
            const depVal = values[`${sectionKey}.${condition.field}`] || '';
            if (condition.equals === '__NONEMPTY__') {
              return depVal.trim() !== '';
            } else {
              return (depVal === condition.equals);
            }
          });
        } else {
          // Single condition
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

/* ===================== NETWORK / VG ===================== */
async function detectNetworkInterfaces() {
  try {
    const out = await cockpit.spawn(
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

async function updateVGOptionsAndHint() {
  const driverEl = document.getElementById('storage_volume_driver');
  const cinderChk = document.getElementById('storage_enable_cinder'); // switch-input
  const vgSelect  = document.getElementById('storage_cinder_volume_group');
  const vgHint    = document.getElementById('cinder_vg_hint');

  if (!driverEl || !vgSelect || !cinderChk) return;

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
