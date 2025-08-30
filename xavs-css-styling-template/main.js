// Theme sync for Cockpit dark/light mode
function syncThemeFromParent() {
	try {
		var parentDoc = (window.parent && window.parent !== window) ? window.parent.document : document;
		var theme = null;
		if (parentDoc.documentElement.classList.contains('pf-v6-theme-dark')) {
			theme = 'dark';
		} else if (parentDoc.documentElement.classList.contains('pf-v6-theme-light')) {
			theme = 'light';
		}
		var ourHtml = document.documentElement;
		ourHtml.classList.remove('theme-dark', 'theme-light');
		if (theme === 'dark') {
			ourHtml.classList.add('theme-dark');
		} else if (theme === 'light') {
			ourHtml.classList.add('theme-light');
		}
	} catch (e) {}
}
syncThemeFromParent();
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', syncThemeFromParent);
} else {
	syncThemeFromParent();
}
setTimeout(syncThemeFromParent, 100);
setTimeout(syncThemeFromParent, 300);
if (window.parent && window.parent !== window) {
	var parentDoc = window.parent.document;
	var observer1 = new window.parent.MutationObserver(syncThemeFromParent);
	observer1.observe(parentDoc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
	if (parentDoc.body) {
		var observer2 = new window.parent.MutationObserver(syncThemeFromParent);
		observer2.observe(parentDoc.body, { attributes: true, attributeFilter: ['data-theme'] });
	}
}
console.log('Rachit Module loaded and theme sync enabled');
