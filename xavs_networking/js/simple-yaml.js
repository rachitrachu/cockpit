/**
 * Simple YAML Generator for Netplan Configuration
 * CSP-compliant alternative to js-yaml CDN dependency
 */

/**
 * Simple YAML dumper for Netplan-specific structures
 * Only handles the subset of YAML we need for network configuration
 */
function simpleYamlDump(obj, options = {}) {
  const indent = options.indent || 2;
  const lineWidth = options.lineWidth || 120;
  
  function escapeString(str) {
    if (typeof str !== 'string') return str;
    
    // Check if string needs quoting
    const needsQuoting = /[:\[\]{},|>*&!%@`]/.test(str) || 
                        /^\s|\s$/.test(str) || 
                        /^(true|false|null|yes|no|on|off|\d+\.?\d*)$/i.test(str);
    
    if (needsQuoting) {
      // Use double quotes and escape internal quotes
      return '"' + str.replace(/"/g, '\\"') + '"';
    }
    return str;
  }
  
  function dumpValue(value, depth = 0, key = null) {
    const spaces = ' '.repeat(depth * indent);
    
    if (value === null || value === undefined) {
      return 'null';
    }
    
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    
    if (typeof value === 'number') {
      return value.toString();
    }
    
    if (typeof value === 'string') {
      return escapeString(value);
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return '[]';
      }
      
      // For simple arrays (strings, numbers), use inline format if short
      const isSimpleArray = value.every(item => 
        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
      );
      
      if (isSimpleArray) {
        const inline = '[' + value.map(v => dumpValue(v)).join(', ') + ']';
        if (inline.length <= 60) {
          return inline;
        }
      }
      
      // Use block format
      return value.map(item => `\n${spaces}- ${dumpValue(item, depth + 1)}`).join('');
    }
    
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return '{}';
      }
      
      return keys.map(k => {
        const keyStr = escapeString(k);
        const val = dumpValue(value[k], depth + 1, k);
        
        // Handle multi-line values
        if (val.includes('\n')) {
          return `\n${spaces}${keyStr}:${val}`;
        } else {
          return `\n${spaces}${keyStr}: ${val}`;
        }
      }).join('');
    }
    
    return String(value);
  }
  
  return dumpValue(obj).replace(/^\n/, '');
}

/**
 * Simple YAML parser for basic structures (if needed)
 * Only handles simple key-value pairs and basic nesting
 */
function simpleYamlParse(yamlStr) {
  const lines = yamlStr.split('\n');
  const result = {};
  const stack = [{ obj: result, indent: -1 }];
  
  for (let line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') {
      continue;
    }
    
    const indent = line.length - line.trimLeft().length;
    const trimmed = line.trim();
    
    // Pop stack to correct level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    
    const current = stack[stack.length - 1].obj;
    
    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      const cleanKey = key.trim();
      
      if (value === '' || value === '{}' || value === '[]') {
        // Object or array
        current[cleanKey] = value === '[]' ? [] : {};
        stack.push({ obj: current[cleanKey], indent });
      } else {
        // Simple value
        current[cleanKey] = parseValue(value);
      }
    }
  }
  
  function parseValue(str) {
    str = str.trim();
    
    // Remove quotes
    if ((str.startsWith('"') && str.endsWith('"')) || 
        (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1);
    }
    
    // Boolean
    if (str === 'true') return true;
    if (str === 'false') return false;
    
    // Number
    if (/^\d+$/.test(str)) return parseInt(str);
    if (/^\d+\.\d+$/.test(str)) return parseFloat(str);
    
    return str;
  }
  
  return result;
}

// Create a jsyaml-compatible interface
window.jsyaml = {
  dump: simpleYamlDump,
  load: simpleYamlParse
};

// Also export individual functions
window.simpleYamlDump = simpleYamlDump;
window.simpleYamlParse = simpleYamlParse;
