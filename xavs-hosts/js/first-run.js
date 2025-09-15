import { CONFIG_PATH } from "./constants.js";

/**
 * First-Run Wizard for XAVS Hosts
 * Provides guided setup experience for users coming from xavs-bootstrap
 */

// First-run detection and management
export class FirstRunManager {
    constructor() {
        this.isFirstRun = false;
        this.currentStep = 0;
        this.wizardData = {
            deploymentType: null, // 'all-in-one' or 'multi-node'
            currentHost: null,
            additionalHosts: [],
            sshSetup: false
        };
    }

    /**
     * Detect if this is a first-run scenario
     */
    async detectFirstRun() {
        try {
            // Check 1: Bootstrap completion indicators
            const hasBootstrapStructure = await this.checkBootstrapCompletion();
            
            // Check 2: No existing hosts configuration
            const hasExistingHosts = await this.checkExistingHosts();
            
            // Check 3: Session indicators (for now, we'll use file-based detection)
            const isCleanState = !hasExistingHosts;

            this.isFirstRun = hasBootstrapStructure && isCleanState;
            
            console.log('First-run detection:', {
                hasBootstrapStructure,
                hasExistingHosts,
                isCleanState,
                isFirstRun: this.isFirstRun
            });

            return this.isFirstRun;
        } catch (error) {
            console.warn('First-run detection failed:', error);
            this.isFirstRun = false;
            return false;
        }
    }

    /**
     * Check if bootstrap module has completed setup
     */
    async checkBootstrapCompletion() {
        try {
            // Check for bootstrap-created directories and files
            const checks = [
                this.fileExists('/etc/xavs'),
                this.fileExists('/etc/xavs/globals.yml'),
                this.fileExists('/opt/xenv')
            ];

            const results = await Promise.all(checks);
            return results.every(exists => exists);
        } catch (error) {
            console.warn('Bootstrap completion check failed:', error);
            return false;
        }
    }

    /**
     * Check if hosts are already configured
     */
    async checkExistingHosts() {
        try {
            const content = await cockpit.file(CONFIG_PATH, { superuser: "try" }).read();
            if (!content || !content.trim()) return false;
            
            const hosts = JSON.parse(content);
            return Array.isArray(hosts) && hosts.length > 0;
        } catch (error) {
            // File doesn't exist or is invalid - this is expected for first run
            return false;
        }
    }

    /**
     * Helper to check if a file exists
     */
    async fileExists(path) {
        try {
            await cockpit.spawn(["test", "-f", path], { err: "message" });
            return true;
        } catch {
            try {
                await cockpit.spawn(["test", "-d", path], { err: "message" });
                return true;
            } catch {
                return false;
            }
        }
    }

    /**
     * Get current host information
     */
    async getCurrentHostInfo() {
        try {
            const hostname = await cockpit.spawn(["hostname"], { err: "message" });
            const ip = await this.detectLocalIP();
            
            return {
                hostname: hostname.trim(),
                ip: ip,
                roles: ["deployment"] // Always assign deployment role to current host
            };
        } catch (error) {
            console.warn('Failed to get current host info:', error);
            return {
                hostname: "localhost",
                ip: "127.0.0.1",
                roles: ["deployment"]
            };
        }
    }

    /**
     * Detect local IP address
     */
    async detectLocalIP() {
        try {
            // Try to get the primary IP address
            const result = await cockpit.spawn([
                "bash", "-c", 
                "ip route get 8.8.8.8 | grep -oP 'src \\K\\S+' | head -1"
            ], { err: "message" });
            
            const ip = result.trim();
            if (ip && this.isValidIP(ip)) {
                return ip;
            }
        } catch (error) {
            console.warn('Primary IP detection failed, trying fallback:', error);
        }

        try {
            // Fallback: get first non-loopback IP
            const result = await cockpit.spawn([
                "bash", "-c",
                "hostname -I | awk '{print $1}'"
            ], { err: "message" });
            
            const ip = result.trim();
            if (ip && this.isValidIP(ip)) {
                return ip;
            }
        } catch (error) {
            console.warn('Fallback IP detection failed:', error);
        }

        // Final fallback
        return "192.168.1.100";
    }

    /**
     * Basic IP validation
     */
    isValidIP(ip) {
        const pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!pattern.test(ip)) return false;
        
        return ip.split('.').every(octet => {
            const num = parseInt(octet, 10);
            return num >= 0 && num <= 255;
        });
    }

    /**
     * Initialize wizard data with current host
     */
    async initializeWizardData() {
        this.wizardData.currentHost = await this.getCurrentHostInfo();
        this.currentStep = 0;
    }

    /**
     * Get wizard configuration
     */
    getWizardData() {
        return { ...this.wizardData };
    }

    /**
     * Update wizard data
     */
    updateWizardData(updates) {
        this.wizardData = { ...this.wizardData, ...updates };
    }

    /**
     * Get current step
     */
    getCurrentStep() {
        return this.currentStep;
    }

    /**
     * Move to next step
     */
    nextStep() {
        this.currentStep++;
        return this.currentStep;
    }

    /**
     * Move to previous step
     */
    previousStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
        }
        return this.currentStep;
    }

    /**
     * Reset wizard state
     */
    reset() {
        this.currentStep = 0;
        this.wizardData = {
            deploymentType: null,
            currentHost: null,
            additionalHosts: [],
            sshSetup: false
        };
    }

    /**
     * Mark first-run as completed
     */
    markCompleted() {
        // We can use localStorage or a file-based approach
        // For now, we'll rely on the presence of hosts configuration
        this.isFirstRun = false;
    }
}

// Export singleton instance
export const firstRunManager = new FirstRunManager();