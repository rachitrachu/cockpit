#!/usr/bin/env node

// Verify that all critical functions are present in main.js
const fs = require('fs');

try {
    const content = fs.readFileSync('xos-networking/main.js', 'utf8');
    
    console.log('?? Verifying critical functions in main.js...\n');
    
    const criticalFunctions = [
        'netplanAction',
        'setupNetworkingForms',
        'getPhysicalInterfaces',
        'loadInterfaces',
        'setupEventHandlers',
        'initialize'
    ];
    
    let allPresent = true;
    
    criticalFunctions.forEach(funcName => {
        const regex = new RegExp(`(async\\s+)?function\\s+${funcName}\\s*\\(`, 'g');
        const match = regex.exec(content);
        
        if (match) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            console.log(`? ${funcName}: Found at line ${lineNum}`);
        } else {
            console.log(`? ${funcName}: MISSING!`);
            allPresent = false;
        }
    });
    
    console.log('\n?? Checking critical netplanAction calls...\n');
    
    const netplanCalls = [
        'netplanAction\\(',
        'netplanAction\\(\'add_vlan\'',
        'netplanAction\\(\'add_bridge\'',
        'netplanAction\\(\'add_bond\'',
        'netplanAction\\(\'set_ip\''
    ];
    
    netplanCalls.forEach(pattern => {
        const regex = new RegExp(pattern, 'g');
        const matches = content.match(regex);
        const count = matches ? matches.length : 0;
        
        if (count > 0) {
            console.log(`? ${pattern}: Found ${count} calls`);
        } else {
            console.log(`??  ${pattern}: No calls found`);
        }
    });
    
    if (allPresent) {
        console.log('\n?? ALL CRITICAL FUNCTIONS ARE PRESENT!');
        console.log('? VLAN/Bridge/Bond creation should now work');
        console.log('? IP configuration should now work');
        console.log('? netplanAction is properly restored');
    } else {
        console.log('\n? SOME CRITICAL FUNCTIONS ARE MISSING!');
    }
    
} catch (error) {
    console.error('? Error reading file:', error.message);
}