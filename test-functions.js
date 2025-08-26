#!/usr/bin/env node

// Test the function definitions order in main.js
const fs = require('fs');

try {
    const content = fs.readFileSync('xos-networking/main.js', 'utf8');
    
    // Find function definitions and their positions
    const functions = [
        'setupNetworkingForms',
        'getPhysicalInterfaces', 
        'initialize',
        'netplanAction'
    ];
    
    const positions = {};
    
    functions.forEach(func => {
        const regex = new RegExp(`function\\s+${func}\\s*\\(|async\\s+function\\s+${func}\\s*\\(`, 'g');
        const match = regex.exec(content);
        if (match) {
            positions[func] = match.index;
        } else {
            console.log(`?? Function ${func} not found`);
        }
    });
    
    console.log('Function definition order:');
    Object.entries(positions)
        .sort(([,a], [,b]) => a - b)
        .forEach(([name, pos]) => {
            console.log(`${name}: position ${pos}`);
        });
    
    // Check if setupNetworkingForms is defined before initialize
    if (positions.setupNetworkingForms < positions.initialize) {
        console.log('? setupNetworkingForms is defined before initialize');
    } else {
        console.log('? setupNetworkingForms is defined after initialize');
    }
    
    // Check for basic syntax errors
    try {
        new Function(content);
        console.log('? JavaScript syntax is valid');
    } catch (syntaxError) {
        console.error('? Syntax error:', syntaxError.message);
    }
    
} catch (error) {
    console.error('? Error reading file:', error.message);
}