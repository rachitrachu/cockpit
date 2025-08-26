/* XOS Networking - Simple Text Icon Fix */
/* Use this if Unicode symbols are not displaying */

(function() {
    'use strict';
    
    // Simple text-based icon replacement
    function replaceUnicodeWithText() {
        console.log('Applying text-based icon fixes...');
        
        // Define replacements
        const replacements = {
            '?': '[OK]',
            '?': '[X]', 
            '?': '[ERROR]',
            '?': '[SUCCESS]',
            '??': '[WARNING]',
            '?': '[WARNING]',
            '??': '[INFO]',
            '?': '[INFO]',
            '??': '[CONFIG]',
            '??': '[SAVE]',
            '??': '[SEARCH]',
            '?': '[APPLY]',
            '??': '[TEST]',
            '??': '[REFRESH]',
            '??': '[?]'  // Replace question marks
        };
        
        // Get all text nodes in the document
        function getTextNodes(node) {
            let textNodes = [];
            if (node.nodeType === Node.TEXT_NODE) {
                textNodes.push(node);
            } else {
                for (let child of node.childNodes) {
                    textNodes = textNodes.concat(getTextNodes(child));
                }
            }
            return textNodes;
        }
        
        // Replace text in all text nodes
        const textNodes = getTextNodes(document.body);
        let replacementCount = 0;
        
        textNodes.forEach(node => {
            let text = node.textContent;
            let modified = false;
            
            Object.keys(replacements).forEach(symbol => {
                if (text.includes(symbol)) {
                    text = text.replace(new RegExp(symbol, 'g'), replacements[symbol]);
                    modified = true;
                    replacementCount++;
                }
            });
            
            if (modified) {
                node.textContent = text;
            }
        });
        
        console.log(`Replaced ${replacementCount} Unicode symbols with text`);
    }
    
    // Apply fixes when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', replaceUnicodeWithText);
    } else {
        replaceUnicodeWithText();
    }
    
    // Also apply fixes when new content is added (for modals, etc.)
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length > 0) {
                // Small delay to let content settle
                setTimeout(replaceUnicodeWithText, 100);
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Export function for manual use
    window.fixUnicodeSymbols = replaceUnicodeWithText;
    
})();