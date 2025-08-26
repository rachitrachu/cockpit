#!/usr/bin/env node

// Test specifically for Create Bond functionality
const fs = require('fs');

try {
    const content = fs.readFileSync('xos-networking/main.js', 'utf8');
    
    console.log('?? Testing Create Bond functionality...\n');
    
    // Check for netplanAction function definition
    const netplanActionRegex = /async\s+function\s+netplanAction\s*\(/;
    const netplanMatch = netplanActionRegex.exec(content);
    
    if (netplanMatch) {
        const lineNum = content.substring(0, netplanMatch.index).split('\n').length;
        console.log(`? netplanAction function found at line ${lineNum}`);
    } else {
        console.log('? netplanAction function NOT FOUND');
    }
    
    // Check for Create Bond button handler
    const bondButtonRegex = /btnCreateBond.*addEventListener/;
    const bondMatch = bondButtonRegex.exec(content);
    
    if (bondMatch) {
        const lineNum = content.substring(0, bondMatch.index).split('\n').length;
        console.log(`? Create Bond button handler found at line ${lineNum}`);
    } else {
        console.log('? Create Bond button handler NOT FOUND');
    }
    
    // Check for netplanAction calls in bond creation
    const bondNetplanCallRegex = /netplanAction\s*\(\s*['"`]add_bond['"`]/;
    const bondCallMatch = bondNetplanCallRegex.exec(content);
    
    if (bondCallMatch) {
        const lineNum = content.substring(0, bondCallMatch.index).split('\n').length;
        console.log(`? netplanAction('add_bond') call found at line ${lineNum}`);
    } else {
        console.log('? netplanAction(\'add_bond\') call NOT FOUND');
    }
    
    // Check function definition order
    const setupNetworkingRegex = /async\s+function\s+setupNetworkingForms\s*\(/;
    const initializeRegex = /async\s+function\s+initialize\s*\(/;
    
    const setupMatch = setupNetworkingRegex.exec(content);
    const initMatch = initializeRegex.exec(content);
    
    if (setupMatch && initMatch && netplanMatch) {
        console.log('\n?? Function definition order:');
        const functions = [
            { name: 'setupNetworkingForms', pos: setupMatch.index },
            { name: 'initialize', pos: initMatch.index },
            { name: 'netplanAction', pos: netplanMatch.index }
        ].sort((a, b) => a.pos - b.pos);
        
        functions.forEach(func => {
            const lineNum = content.substring(0, func.pos).split('\n').length;
            console.log(`  ${func.name}: line ${lineNum}`);
        });
        
        if (setupMatch.index < initMatch.index && netplanMatch.index > 0) {
            console.log('? Functions are in correct order');
        } else {
            console.log('??  Functions may be in wrong order');
        }
    }
    
    // Basic syntax check
    console.log('\n?? Basic syntax check...');
    try {
        new Function(content);
        console.log('? JavaScript syntax is valid');
    } catch (e) {
        console.log('? JavaScript syntax error:', e.message);
    }
    
    console.log('\n?? Summary:');
    console.log('If all checks pass, the "Create Bond" button should work!');
    
} catch (error) {
    console.error('? Error:', error.message);
}