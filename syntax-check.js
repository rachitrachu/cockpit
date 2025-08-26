#!/usr/bin/env node

// Simple syntax check for main.js
const fs = require('fs');

try {
    const content = fs.readFileSync('xos-networking/main.js', 'utf8');
    
    console.log('Checking JavaScript syntax...');
    
    try {
        // Try to parse the JavaScript
        new Function(content);
        console.log('? JavaScript syntax is VALID');
        
        // Check for netplanAction function
        if (content.includes('async function netplanAction')) {
            console.log('? netplanAction function is present');
        } else {
            console.log('? netplanAction function is MISSING');
        }
        
        // Check for function calls
        const bondCalls = (content.match(/netplanAction\(/g) || []).length;
        console.log(`? Found ${bondCalls} netplanAction calls`);
        
    } catch (syntaxError) {
        console.log('? JavaScript syntax ERROR:');
        console.log('   Message:', syntaxError.message);
        
        // Try to find line number if possible
        const errorString = syntaxError.toString();
        if (errorString.includes('line')) {
            console.log('   Error string:', errorString);
        }
        
        // Basic line-by-line check
        const lines = content.split('\n');
        let braceCount = 0;
        let inFunction = false;
        
        for (let i = 0; i < Math.min(lines.length, 100); i++) {
            const line = lines[i];
            const openBraces = (line.match(/{/g) || []).length;
            const closeBraces = (line.match(/}/g) || []).length;
            braceCount += openBraces - closeBraces;
            
            if (line.includes('function ') || line.includes('=> {')) {
                inFunction = true;
            }
            
            if (braceCount < 0) {
                console.log(`? Extra closing brace at line ${i + 1}: ${line.trim()}`);
                break;
            }
        }
        
        console.log(`Final brace count: ${braceCount} (should be 0)`);
    }
    
} catch (error) {
    console.error('? Error reading file:', error.message);
}