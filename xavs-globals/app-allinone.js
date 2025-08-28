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
        visibleWhen: { field: 'volume_driver', equals: 'LVM' }
      },
      enable_cinder_backend_nfs: {
        type: 'toggle',
        label: 'Enable NFS Backend',
        description: 'Make sure you have configured NFS in the shares tab.',
        default: 'no',
        required: false,
        visibleWhen: { field: 'volume_driver', equals: 'NFS' }
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

/* Ensure checkbox switches store 'yes'/'no' values */
function wireFlatSwitches() {
  document.querySelectorAll('.switch-input').forEach(chk => {
    const setVal = () => { chk.value = chk.checked ? 'yes' : 'no'; };
    setVal();
    chk.addEventListener('change', setVal);
  });
}

/* Status panel */
function showStatus(message, type = 'info') {
  const el = document.getElementById('status_panel');
  if (el) {
    el.className = `alert alert-${type}`;
    el.textContent = message;
    el.style.display = 'block';
    if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 5000);
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
  try {
    if (!formGenerator) throw new Error('Form generator not initialized');
    const errs = formGenerator.validateForm();
    if (errs.length) {
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

    showStatus(`Configuration saved to ${filePath}`, 'success');
    return filePath;
  } catch (e) {
    console.error('Save failed:', e);
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

      if (e.target.id === 'basics_network_interface') syncExternalInterfaceOptions();
      if (e.target.id === 'network_neutron_external_interface') hookExternalInterfaceBehavior();

      if (e.target.id === 'storage_volume_driver' || e.target.id === 'storage_enable_cinder')
        await updateVGOptionsAndHint();

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

/* ===================== EVENTS & HELP ===================== */
function setupEventListeners() {
  document.getElementById('save')?.addEventListener('click', () => { saveConfiguration().catch(console.error); });
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
        const depVal = values[`${sectionKey}.${field.visibleWhen.field}`] || '';
        if (field.visibleWhen.equals === '__NONEMPTY__') {
          show = depVal.trim() !== '';
        } else {
          show = (depVal === field.visibleWhen.equals);
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
