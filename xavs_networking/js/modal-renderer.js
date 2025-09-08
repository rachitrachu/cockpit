/**
 * XAVS Networking Modal UI Renderer (2024)
 * Generates HTML forms from JSON schemas and handles form interactions
 * Production-ready modal system with validation and error handling
 */

const XAVSModalRenderer = {
  
  // **1. Core Modal Management**
  
  currentModal: null,
  schemas: {}, // Will be loaded from XAVS-Modal-Schemas.json
  
  async loadSchemas() {
    try {
      const response = await fetch('./docs/XAVS-Modal-Schemas.json');
      const data = await response.json();
      this.schemas = data.xavsSchemas;
      console.log('Loaded modal schemas:', Object.keys(this.schemas));
    } catch (error) {
      console.error('Failed to load modal schemas:', error);
      throw new Error('Could not load modal schemas');
    }
  },
  
  // **2. Modal Opening/Closing**
  
  async openModal(schemaId, data = {}, context = {}) {
    if (!this.schemas[schemaId]) {
      throw new Error(`Schema '${schemaId}' not found`);
    }
    
    const schema = this.schemas[schemaId];
    const modal = this.createModalHTML(schema, data, context);
    
    // Add to DOM
    document.body.appendChild(modal);
    this.currentModal = modal;
    
    // Bind events
    this.bindModalEvents(modal, schema, context);
    
    // Focus first input
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
    
    return new Promise((resolve, reject) => {
      modal._resolve = resolve;
      modal._reject = reject;
    });
  },
  
  closeModal(result = null) {
    if (this.currentModal) {
      if (result !== null && this.currentModal._resolve) {
        this.currentModal._resolve(result);
      } else if (this.currentModal._reject) {
        this.currentModal._reject(new Error('Modal cancelled'));
      }
      
      document.body.removeChild(this.currentModal);
      this.currentModal = null;
    }
  },
  
  // **3. HTML Generation**
  
  createModalHTML(schema, data = {}, context = {}) {
    const modal = document.createElement('div');
    modal.className = 'xavs-modal-overlay';
    modal.innerHTML = `
      <div class="xavs-modal">
        <div class="xavs-modal-header">
          <h3>
            ${this.getIcon(schema['x-meta']?.icon)} ${schema.title || 'Configuration'}
          </h3>
          <button type="button" class="xavs-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="xavs-modal-body">
          <form class="xavs-form" novalidate>
            ${this.generateFormFields(schema, data, context)}
          </form>
          <div class="xavs-modal-errors" style="display: none;"></div>
        </div>
        <div class="xavs-modal-footer">
          <button type="button" class="xavs-btn xavs-btn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="xavs-btn xavs-btn-primary" data-action="submit">
            ${schema['x-meta']?.submitText || 'Save'}
          </button>
        </div>
      </div>
    `;
    
    return modal;
  },
  
  generateFormFields(schema, data = {}, context = {}) {
    if (!schema.properties) return '';
    
    return Object.entries(schema.properties)
      .filter(([key]) => !key.startsWith('x-')) // Skip metadata
      .map(([key, fieldSchema]) => {
        return this.generateField(key, fieldSchema, data[key], context);
      })
      .join('');
  },
  
  generateField(name, schema, value = null, context = {}) {
    const fieldId = `field-${name}`;
    const isRequired = schema.required && schema.required.includes(name);
    const fieldValue = value !== null ? value : (schema.default || '');
    
    let fieldHTML = '';
    
    switch (schema.type) {
      case 'string':
        if (schema.enum) {
          fieldHTML = this.generateSelect(name, schema, fieldValue, context);
        } else {
          fieldHTML = this.generateInput(name, schema, fieldValue);
        }
        break;
        
      case 'integer':
      case 'number':
        fieldHTML = this.generateNumberInput(name, schema, fieldValue);
        break;
        
      case 'boolean':
        fieldHTML = this.generateCheckbox(name, schema, fieldValue);
        break;
        
      case 'array':
        fieldHTML = this.generateArrayField(name, schema, fieldValue || [], context);
        break;
        
      case 'object':
        fieldHTML = this.generateObjectField(name, schema, fieldValue || {}, context);
        break;
        
      default:
        fieldHTML = `<p>Unsupported field type: ${schema.type}</p>`;
    }
    
    return `
      <div class="xavs-field-group" data-field="${name}">
        <label for="${fieldId}" class="xavs-field-label">
          ${schema.title || name}
          ${isRequired ? '<span class="required">*</span>' : ''}
        </label>
        ${fieldHTML}
        ${schema.description ? `<div class="xavs-field-help">${schema.description}</div>` : ''}
        <div class="xavs-field-error" style="display: none;"></div>
      </div>
    `;
  },
  
  // **4. Field Type Generators**
  
  generateInput(name, schema, value) {
    const attrs = {
      type: schema.format === 'password' ? 'password' : 'text',
      id: `field-${name}`,
      name: name,
      value: value || '',
      placeholder: schema.examples ? schema.examples[0] : '',
      pattern: schema.pattern || '',
      maxlength: schema.maxLength || '',
      minlength: schema.minLength || ''
    };
    
    const attrString = Object.entries(attrs)
      .filter(([k, v]) => v !== '')
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    
    return `<input class="xavs-input" ${attrString}>`;
  },
  
  generateSelect(name, schema, value, context) {
    const options = schema.enum.map(option => {
      const selected = option === value ? 'selected' : '';
      return `<option value="${option}" ${selected}>${option}</option>`;
    }).join('');
    
    return `<select class="xavs-select" id="field-${name}" name="${name}">${options}</select>`;
  },
  
  generateNumberInput(name, schema, value) {
    const attrs = {
      type: 'number',
      id: `field-${name}`,
      name: name,
      value: value || '',
      min: schema.minimum || '',
      max: schema.maximum || '',
      step: schema.type === 'integer' ? '1' : 'any'
    };
    
    const attrString = Object.entries(attrs)
      .filter(([k, v]) => v !== '')
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    
    return `<input class="xavs-input" ${attrString}>`;
  },
  
  generateCheckbox(name, schema, value) {
    const checked = value === true ? 'checked' : '';
    return `
      <div class="xavs-checkbox-wrapper">
        <input type="checkbox" class="xavs-checkbox" id="field-${name}" name="${name}" ${checked}>
        <label for="field-${name}" class="xavs-checkbox-label">${schema.title || name}</label>
      </div>
    `;
  },
  
  generateArrayField(name, schema, values, context) {
    const itemSchema = schema.items;
    const uniqueId = `array-${name}-${Date.now()}`;
    
    let itemsHTML = '';
    if (values.length > 0) {
      itemsHTML = values.map((item, index) => {
        return this.generateArrayItem(name, itemSchema, item, index);
      }).join('');
    }
    
    return `
      <div class="xavs-array-field" data-array="${name}">
        <div class="xavs-array-items" id="${uniqueId}">
          ${itemsHTML}
        </div>
        <button type="button" class="xavs-btn xavs-btn-sm xavs-btn-secondary xavs-add-item" 
                data-array="${name}" data-target="${uniqueId}">
          + Add ${schema.title || name}
        </button>
      </div>
    `;
  },
  
  generateArrayItem(arrayName, itemSchema, value, index) {
    const itemId = `${arrayName}-${index}`;
    let itemHTML = '';
    
    if (itemSchema.type === 'string') {
      itemHTML = `<input class="xavs-input xavs-array-input" name="${arrayName}[]" value="${value || ''}" placeholder="${itemSchema.title || ''}">`;
    } else if (itemSchema.type === 'object') {
      // For complex objects like routes
      itemHTML = Object.entries(itemSchema.properties || {}).map(([key, subSchema]) => {
        const subValue = value && value[key] ? value[key] : '';
        return `
          <div class="xavs-inline-field">
            <label>${subSchema.title || key}</label>
            <input class="xavs-input" name="${arrayName}[${index}].${key}" value="${subValue}" 
                   placeholder="${subSchema.title || key}">
          </div>
        `;
      }).join('');
    }
    
    return `
      <div class="xavs-array-item" data-index="${index}">
        ${itemHTML}
        <button type="button" class="xavs-btn xavs-btn-sm xavs-btn-danger xavs-remove-item">Remove</button>
      </div>
    `;
  },
  
  generateObjectField(name, schema, value, context) {
    const subFields = Object.entries(schema.properties || {}).map(([key, subSchema]) => {
      const subValue = value[key];
      return this.generateField(`${name}.${key}`, subSchema, subValue, context);
    }).join('');
    
    return `
      <div class="xavs-object-field" data-object="${name}">
        <fieldset class="xavs-fieldset">
          <legend>${schema.title || name}</legend>
          ${subFields}
        </fieldset>
      </div>
    `;
  },
  
  // **5. Event Handling**
  
  bindModalEvents(modal, schema, context) {
    // Close button
    modal.querySelector('.xavs-modal-close').addEventListener('click', () => {
      this.closeModal();
    });
    
    // Cancel button
    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      this.closeModal();
    });
    
    // Submit button
    modal.querySelector('[data-action="submit"]').addEventListener('click', () => {
      this.handleSubmit(modal, schema, context);
    });
    
    // Add item buttons
    modal.querySelectorAll('.xavs-add-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.addArrayItem(e.target);
      });
    });
    
    // Remove item buttons (delegated)
    modal.addEventListener('click', (e) => {
      if (e.target.classList.contains('xavs-remove-item')) {
        this.removeArrayItem(e.target);
      }
    });
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
      }
    });
    
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentModal === modal) {
        this.closeModal();
      }
    });
  },
  
  // **6. Form Submission**
  
  async handleSubmit(modal, schema, context) {
    try {
      const formData = this.extractFormData(modal, schema);
      const errors = await this.validateFormData(formData, schema, context);
      
      if (errors.length > 0) {
        this.displayErrors(modal, errors);
        return;
      }
      
      this.closeModal(formData);
    } catch (error) {
      this.displayErrors(modal, [`Submission error: ${error.message}`]);
    }
  },
  
  extractFormData(modal, schema) {
    const form = modal.querySelector('.xavs-form');
    const data = {};
    
    // Extract simple fields
    form.querySelectorAll('input, select, textarea').forEach(input => {
      const name = input.name;
      if (!name || name.includes('[')) return; // Skip array items for now
      
      let value = input.value;
      
      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = input.value ? parseFloat(input.value) : null;
      }
      
      // Handle nested object notation (e.g., "nameservers.addresses")
      this.setNestedValue(data, name, value);
    });
    
    // Extract array fields
    form.querySelectorAll('.xavs-array-field').forEach(arrayField => {
      const arrayName = arrayField.dataset.array;
      const items = [];
      
      arrayField.querySelectorAll('.xavs-array-item').forEach((item, index) => {
        const itemData = {};
        
        item.querySelectorAll('input').forEach(input => {
          const match = input.name.match(/^([^[]+)\[(\d+)\]\.(.+)$/);
          if (match) {
            const [, arr, idx, key] = match;
            itemData[key] = input.value;
          } else if (input.name.endsWith('[]')) {
            // Simple array item
            items[index] = input.value;
            return;
          }
        });
        
        if (Object.keys(itemData).length > 0) {
          items[index] = itemData;
        }
      });
      
      data[arrayName] = items.filter(item => item !== undefined);
    });
    
    return data;
  },
  
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  },
  
  async validateFormData(data, schema, context) {
    const errors = [];
    
    // Use XAVSValidators if available
    if (typeof XAVSValidators !== 'undefined') {
      const result = XAVSValidators.validateConfiguration(data, context);
      if (result.errors) {
        errors.push(...result.errors);
      }
    }
    
    return errors;
  },
  
  displayErrors(modal, errors) {
    const errorContainer = modal.querySelector('.xavs-modal-errors');
    
    if (errors.length === 0) {
      errorContainer.style.display = 'none';
      return;
    }
    
    errorContainer.innerHTML = `
      <div class="xavs-alert xavs-alert-danger">
        <strong>Please fix the following errors:</strong>
        <ul>
          ${errors.map(error => `<li>${error}</li>`).join('')}
        </ul>
      </div>
    `;
    errorContainer.style.display = 'block';
    
    // Scroll to errors
    errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  
  // **7. Array Management**
  
  addArrayItem(button) {
    const arrayName = button.dataset.array;
    const target = document.getElementById(button.dataset.target);
    const arrayField = button.closest('.xavs-array-field');
    
    // Find the schema for this array
    // This is simplified - in practice, you'd need to track the current schema
    const itemSchema = { type: 'string', title: 'Item' }; // Placeholder
    
    const newIndex = target.children.length;
    const itemHTML = this.generateArrayItem(arrayName, itemSchema, null, newIndex);
    
    target.insertAdjacentHTML('beforeend', itemHTML);
  },
  
  removeArrayItem(button) {
    const item = button.closest('.xavs-array-item');
    item.remove();
  },
  
  // **8. Utility Functions**
  
  getIcon(iconType) {
    const icons = {
      eth: '🌐',
      vlan: '🏷️',
      bond: '🔗',
      bridge: '🌉',
      wifi: '📶'
    };
    
    return icons[iconType] || '⚙️';
  }
  
};

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = XAVSModalRenderer;
} else if (typeof window !== 'undefined') {
  window.XAVSModalRenderer = XAVSModalRenderer;
}
