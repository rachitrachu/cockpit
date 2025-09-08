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

  // ===== COMPREHENSIVE STORAGE CONFIGURATION =====
  storage: {
    title: 'Storage Configuration',
    description: 'Comprehensive block storage and backup configuration with multiple backend support',
    fields: {
      enable_cinder: {
        type: 'toggle',
        label: 'Enable Cinder Block Storage',
        description: 'Enable OpenStack block storage service',
        default: 'no',
        required: false
      },
      enable_cinder_backup: {
        type: 'toggle',
        label: 'Enable Cinder Backup Service',
        description: 'Enable volume backup and restore functionality',
        default: 'no',
        required: false,
        visibleWhen: { field: 'enable_cinder', equals: 'yes' }
      },
      
      // ===== BACKEND SELECTION =====
      storage_backend_type: {
        type: 'select',
        label: 'Storage Backend Type',
        description: 'Choose your primary storage backend configuration',
        options: [
          'single-backend',
          'multiple-backends'
        ],
        default: 'single-backend',
        required: true,
        visibleWhen: { field: 'enable_cinder', equals: 'yes' }
      },
      
      primary_backend: {
        type: 'select',
        label: 'Primary Storage Backend',
        description: 'Select the primary storage backend for volumes',
        options: [
          'LVM',
          'Ceph RBD',
          'NFS',
          'iSCSI',
          'VMware VMDK',
          'VMware vStorage',
          'Hitachi NAS',
          'Quobyte',
          'Pure Storage iSCSI',
          'Pure Storage FC',
          'Pure Storage NVMe-RoCE'
        ],
        default: 'LVM',
        required: true,
        visibleWhen: { field: 'enable_cinder', equals: 'yes' }
      },
      
      // ===== MULTIPLE BACKEND SELECTION =====
      enable_multiple_backends_note: {
        type: 'note',
        label: 'Multiple Backend Configuration',
        description: '<div class="alert alert-info"><i class="fas fa-info-circle"></i> <strong>Multiple Backends:</strong> Enable additional storage backends to provide different storage tiers and capabilities. Each backend can serve different performance and availability requirements.</div>',
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'storage_backend_type', equals: 'multiple-backends' }
        ]
      },
      
      enable_cinder_backend_lvm: {
        type: 'toggle',
        label: 'Enable LVM Backend',
        description: 'Local Logical Volume Manager storage',
        default: 'no',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'storage_backend_type', equals: 'multiple-backends' }
        ]
      },
      
      enable_cinder_backend_ceph: {
        type: 'toggle',
        label: 'Enable Ceph RBD Backend',
        description: 'Ceph RADOS Block Device storage',
        default: 'no',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'storage_backend_type', equals: 'multiple-backends' }
        ]
      },
      
      enable_cinder_backend_nfs: {
        type: 'toggle',
        label: 'Enable NFS Backend',
        description: 'Network File System storage',
        default: 'no',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'storage_backend_type', equals: 'multiple-backends' }
        ]
      },
      
      enable_cinder_backend_iscsi: {
        type: 'toggle',
        label: 'Enable External iSCSI Backend',
        description: 'External iSCSI storage systems',
        default: 'no',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'storage_backend_type', equals: 'multiple-backends' }
        ]
      },
      
      enable_cinder_backend_vmware_vmdk: {
        type: 'toggle',
        label: 'Enable VMware VMDK Backend',
        description: 'VMware Virtual Machine Disk storage',
        default: 'no',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'storage_backend_type', equals: 'multiple-backends' }
        ]
      },
      
      enable_cinder_backend_vmware_vstorage: {
        type: 'toggle',
        label: 'Enable VMware vStorage Backend',
        description: 'VMware vStorage Object storage',
        default: 'no',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'storage_backend_type', equals: 'multiple-backends' }
        ]
      },
      
      enable_cinder_backend_pure_iscsi: {
        type: 'toggle',
        label: 'Enable Pure Storage iSCSI',
        description: 'Pure FlashArray iSCSI storage',
        default: 'no',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'storage_backend_type', equals: 'multiple-backends' }
        ]
      },
      
      enable_cinder_backend_pure_fc: {
        type: 'toggle',
        label: 'Enable Pure Storage FC',
        description: 'Pure FlashArray Fibre Channel storage',
        default: 'no',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'storage_backend_type', equals: 'multiple-backends' }
        ]
      },
      
      // ===== LVM CONFIGURATION =====
      lvm_config_section: {
        type: 'note',
        label: 'LVM Configuration',
        description: '<h6><i class="fas fa-hdd"></i> LVM Storage Backend Settings</h6>',
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'LVM' },
            { field: 'enable_cinder_backend_lvm', equals: 'yes' }
          ]
        ]
      },
      
      cinder_volume_group: {
        type: 'select',
        label: 'Cinder Volume Group',
        description: 'Only free VGs (no active LVs) are listed. <br><small class="text-info"><i class="fas fa-info-circle"></i> To create and configure LVM: <button type="button" class="btn btn-sm btn-outline-primary ms-1" id="storage-redirect-btn"><i class="fas fa-hdd"></i> Go to Storage Module</button></small>',
        options: [],
        default: 'cinder-volumes',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'LVM' },
            { field: 'enable_cinder_backend_lvm', equals: 'yes' }
          ]
        ]
      },
      
      cinder_backend_lvm_name: {
        type: 'text',
        label: 'LVM Backend Name',
        description: 'Custom name for LVM backend identification',
        placeholder: 'local-lvm',
        default: 'local-lvm',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'LVM' },
            { field: 'enable_cinder_backend_lvm', equals: 'yes' }
          ]
        ]
      },
      
      // ===== CEPH CONFIGURATION =====
      ceph_config_section: {
        type: 'note',
        label: 'Ceph RBD Configuration',
        description: '<h6><i class="fas fa-database"></i> Ceph Storage Backend Settings</h6><div class="alert alert-warning mt-2"><i class="fas fa-exclamation-triangle"></i> <strong>Required Files:</strong> Ensure you have Ceph configuration files in <code>/etc/kolla/config/cinder/</code></div>',
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'Ceph RBD' },
            { field: 'enable_cinder_backend_ceph', equals: 'yes' }
          ]
        ]
      },
      
      ceph_cinder_pool_name: {
        type: 'text',
        label: 'Ceph Pool Name',
        description: 'Ceph pool name for storing volumes',
        placeholder: 'volumes',
        default: 'volumes',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'Ceph RBD' },
            { field: 'enable_cinder_backend_ceph', equals: 'yes' }
          ]
        ]
      },
      
      ceph_cinder_user: {
        type: 'text',
        label: 'Ceph User',
        description: 'Ceph user for Cinder authentication',
        placeholder: 'cinder',
        default: 'cinder',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'Ceph RBD' },
            { field: 'enable_cinder_backend_ceph', equals: 'yes' }
          ]
        ]
      },
      
      cinder_backend_ceph_name: {
        type: 'text',
        label: 'Ceph Backend Name',
        description: 'Custom name for Ceph backend identification',
        placeholder: 'ceph-ssd',
        default: 'ceph-ssd',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'Ceph RBD' },
            { field: 'enable_cinder_backend_ceph', equals: 'yes' }
          ]
        ]
      },
      
      // ===== NFS CONFIGURATION =====
      nfs_config_section: {
        type: 'note',
        label: 'NFS Configuration',
        description: '<h6><i class="fas fa-network-wired"></i> NFS Storage Backend Settings</h6><div class="alert alert-warning mt-2"><i class="fas fa-exclamation-triangle"></i> <strong>Required File:</strong> Create <code>/etc/kolla/config/cinder/nfs_shares</code> with NFS share details</div>',
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'NFS' },
            { field: 'enable_cinder_backend_nfs', equals: 'yes' }
          ]
        ]
      },
      
      nfs_shares_config: {
        type: 'textarea',
        label: 'NFS Shares Configuration',
        description: 'List of NFS shares (one per line). Format: server:/path',
        placeholder: 'storage01.example.com:/export/cinder\nstorage02.example.com:/export/cinder\nstorage03.example.com:/export/cinder',
        rows: 4,
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'NFS' },
            { field: 'enable_cinder_backend_nfs', equals: 'yes' }
          ]
        ]
      },
      
      cinder_backend_nfs_name: {
        type: 'text',
        label: 'NFS Backend Name',
        description: 'Custom name for NFS backend identification',
        placeholder: 'shared-nfs',
        default: 'shared-nfs',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'NFS' },
            { field: 'enable_cinder_backend_nfs', equals: 'yes' }
          ]
        ]
      },
      
      // ===== VMWARE CONFIGURATION =====
      vmware_config_section: {
        type: 'note',
        label: 'VMware Configuration',
        description: '<h6><i class="fas fa-cloud"></i> VMware Storage Backend Settings</h6>',
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'VMware VMDK' },
            { field: 'primary_backend', equals: 'VMware vStorage' },
            { field: 'enable_cinder_backend_vmware_vmdk', equals: 'yes' },
            { field: 'enable_cinder_backend_vmware_vstorage', equals: 'yes' }
          ]
        ]
      },
      
      vmware_vcenter_host_ip: {
        type: 'text',
        label: 'vCenter Host IP/FQDN',
        description: 'VMware vCenter server address',
        placeholder: 'vcenter.example.com',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'VMware VMDK' },
            { field: 'primary_backend', equals: 'VMware vStorage' },
            { field: 'enable_cinder_backend_vmware_vmdk', equals: 'yes' },
            { field: 'enable_cinder_backend_vmware_vstorage', equals: 'yes' }
          ]
        ]
      },
      
      vmware_vcenter_host_username: {
        type: 'text',
        label: 'vCenter Username',
        description: 'VMware vCenter administrator username',
        placeholder: 'administrator@vsphere.local',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'VMware VMDK' },
            { field: 'primary_backend', equals: 'VMware vStorage' },
            { field: 'enable_cinder_backend_vmware_vmdk', equals: 'yes' },
            { field: 'enable_cinder_backend_vmware_vstorage', equals: 'yes' }
          ]
        ]
      },
      
      vmware_vcenter_host_password: {
        type: 'password',
        label: 'vCenter Password',
        description: 'VMware vCenter administrator password',
        placeholder: 'Enter vCenter password',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'VMware VMDK' },
            { field: 'primary_backend', equals: 'VMware vStorage' },
            { field: 'enable_cinder_backend_vmware_vmdk', equals: 'yes' },
            { field: 'enable_cinder_backend_vmware_vstorage', equals: 'yes' }
          ]
        ]
      },
      
      vmware_vcenter_cluster_name: {
        type: 'text',
        label: 'vCenter Cluster Name',
        description: 'VMware vCenter cluster name',
        placeholder: 'cluster1',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'VMware VMDK' },
            { field: 'primary_backend', equals: 'VMware vStorage' },
            { field: 'enable_cinder_backend_vmware_vmdk', equals: 'yes' },
            { field: 'enable_cinder_backend_vmware_vstorage', equals: 'yes' }
          ]
        ]
      },
      
      // ===== PURE STORAGE CONFIGURATION =====
      pure_config_section: {
        type: 'note',
        label: 'Pure Storage Configuration',
        description: '<h6><i class="fas fa-server"></i> Pure FlashArray Settings</h6>',
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'Pure Storage iSCSI' },
            { field: 'primary_backend', equals: 'Pure Storage FC' },
            { field: 'primary_backend', equals: 'Pure Storage NVMe-RoCE' },
            { field: 'enable_cinder_backend_pure_iscsi', equals: 'yes' },
            { field: 'enable_cinder_backend_pure_fc', equals: 'yes' }
          ]
        ]
      },
      
      pure_api_token: {
        type: 'password',
        label: 'Pure Storage API Token',
        description: 'API token for Pure FlashArray management',
        placeholder: 'Enter API token',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'Pure Storage iSCSI' },
            { field: 'primary_backend', equals: 'Pure Storage FC' },
            { field: 'primary_backend', equals: 'Pure Storage NVMe-RoCE' },
            { field: 'enable_cinder_backend_pure_iscsi', equals: 'yes' },
            { field: 'enable_cinder_backend_pure_fc', equals: 'yes' }
          ]
        ]
      },
      
      pure_san_ip: {
        type: 'text',
        label: 'Pure Storage SAN IP',
        description: 'Pure FlashArray management IP address',
        placeholder: '192.168.1.100',
        required: false,
        validation: /^(?:\d{1,3}\.){3}\d{1,3}$/,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          [
            { field: 'primary_backend', equals: 'Pure Storage iSCSI' },
            { field: 'primary_backend', equals: 'Pure Storage FC' },
            { field: 'primary_backend', equals: 'Pure Storage NVMe-RoCE' },
            { field: 'enable_cinder_backend_pure_iscsi', equals: 'yes' },
            { field: 'enable_cinder_backend_pure_fc', equals: 'yes' }
          ]
        ]
      },
      
      // ===== BACKUP CONFIGURATION =====
      backup_config_section: {
        type: 'note',
        label: 'Backup Configuration',
        description: '<h6><i class="fas fa-archive"></i> Volume Backup Settings</h6>',
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'enable_cinder_backup', equals: 'yes' }
        ]
      },
      
      cinder_backup_driver: {
        type: 'select',
        label: 'Backup Storage Driver',
        description: 'Choose backup storage backend',
        options: ['swift', 'ceph', 'nfs', 's3'],
        default: 'swift',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'enable_cinder_backup', equals: 'yes' }
        ]
      },
      
      ceph_backup_pool_name: {
        type: 'text',
        label: 'Ceph Backup Pool Name',
        description: 'Ceph pool for volume backups',
        placeholder: 'backups',
        default: 'backups',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'enable_cinder_backup', equals: 'yes' },
          { field: 'cinder_backup_driver', equals: 'ceph' }
        ]
      },
      
      cinder_backup_share: {
        type: 'text',
        label: 'NFS Backup Share',
        description: 'NFS share for volume backups',
        placeholder: '192.168.1.100:/backup',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'enable_cinder_backup', equals: 'yes' },
          { field: 'cinder_backup_driver', equals: 'nfs' }
        ]
      },
      
      cinder_backup_s3_url: {
        type: 'text',
        label: 'S3 Backup URL',
        description: 'S3-compatible storage URL for backups',
        placeholder: 'http://s3.example.com',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'enable_cinder_backup', equals: 'yes' },
          { field: 'cinder_backup_driver', equals: 's3' }
        ]
      },
      
      cinder_backup_s3_bucket: {
        type: 'text',
        label: 'S3 Backup Bucket',
        description: 'S3 bucket name for volume backups',
        placeholder: 'cinder-backups',
        default: 'cinder-backups',
        required: false,
        visibleWhen: [
          { field: 'enable_cinder', equals: 'yes' },
          { field: 'enable_cinder_backup', equals: 'yes' },
          { field: 'cinder_backup_driver', equals: 's3' }
        ]
      },
      
      // ===== PERFORMANCE CONFIGURATION =====
      performance_config_section: {
        type: 'note',
        label: 'Performance Configuration',
        description: '<h6><i class="fas fa-tachometer-alt"></i> Performance and Optimization Settings</h6>',
        visibleWhen: { field: 'enable_cinder', equals: 'yes' }
      },
      
      cinder_enable_conversion_tmpfs: {
        type: 'toggle',
        label: 'Enable tmpfs for Image Conversion',
        description: 'Use tmpfs for better performance during image conversion operations',
        default: 'no',
        required: false,
        visibleWhen: { field: 'enable_cinder', equals: 'yes' }
      },
      
      cinder_api_workers: {
        type: 'number',
        label: 'API Workers',
        description: 'Number of API worker processes (leave empty for auto)',
        placeholder: 'Auto-configured',
        default: '',
        required: false,
        min: 1,
        max: 32,
        visibleWhen: { field: 'enable_cinder', equals: 'yes' }
      },
      
      enable_redis_for_coordination: {
        type: 'toggle',
        label: 'Enable Redis for Coordination',
        description: 'Use Redis for coordination backend (recommended for multiple volume services)',
        default: 'no',
        required: false,
        visibleWhen: { field: 'enable_cinder', equals: 'yes' }
      },
      
      // ===== DEPLOYMENT NOTES =====
      cinder_deployment_notes: {
        type: 'note',
        label: 'Deployment Information',
        description: `<div class="cinder-deployment-info">
          <h6><i class="fas fa-info-circle"></i> Cinder Deployment Notes:</h6>
          <ul>
            <li><strong>LVM:</strong> Ensure volume groups are created and available on storage nodes</li>
            <li><strong>Ceph:</strong> Required files: <code>ceph.conf</code> and <code>ceph.client.cinder.keyring</code> in <code>/etc/kolla/config/cinder/</code></li>
            <li><strong>NFS:</strong> Required file: <code>nfs_shares</code> with share details in <code>/etc/kolla/config/cinder/</code></li>
            <li><strong>Multiple Backends:</strong> Each backend will create separate volume types for different storage tiers</li>
            <li><strong>Post-Deployment:</strong> Create volume types and QoS specs for each backend</li>
            <li><strong>Backup Service:</strong> Ensure backup storage backend is properly configured and accessible</li>
          </ul>
          <div class="alert alert-warning mt-2">
            <i class="fas fa-exclamation-triangle"></i> 
            <strong>Important:</strong> Refer to the Xloud Cinder SOP document for complete deployment procedures and backend-specific configuration
          </div>
        </div>`,
        visibleWhen: { field: 'enable_cinder', equals: 'yes' }
      }
    }
  },

  loadbalancer: {
    title: 'Load Balancer Configuration',
    description: 'OpenStack Octavia Load Balancer as a Service (LBaaS)',
    fields: {
      enable_octavia: {
        type: 'toggle',
        label: 'Enable Octavia Load Balancer',
        description: 'Enable OpenStack Octavia Load Balancer as a Service',
        default: 'no',
        required: false
      },
      enable_horizon_octavia: {
        type: 'toggle',
        label: 'Enable Horizon Octavia UI',
        description: 'Enable Octavia dashboard in Horizon',
        default: 'yes',
        required: false,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      enable_redis: {
        type: 'toggle',
        label: 'Enable Redis',
        description: 'Required for Amphora provider. Auto-enabled when Amphora is selected.',
        default: 'yes',
        required: false,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_provider_drivers: {
        type: 'select',
        label: 'Provider Drivers',
        description: 'Choose the load balancer provider(s)',
        options: [
          'amphora:Amphora provider',
          'ovn:OVN provider', 
          'amphora:Amphora provider, ovn:OVN provider'
        ],
        default: 'amphora:Amphora provider',
        required: true,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_provider_agents: {
        type: 'text',
        label: 'Provider Agents',
        description: 'Auto-configured based on provider drivers selection',
        placeholder: 'amphora_agent',
        default: 'amphora_agent',
        required: false,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_auto_configure: {
        type: 'toggle',
        label: 'Auto Configure Resources',
        description: 'Automatically register Octavia resources (flavors, networks, etc.)',
        default: 'yes',
        required: false,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_network_type: {
        type: 'select',
        label: 'Management Network Type',
        description: 'Choose network type for Amphora management. Use "provider" for production, "tenant" for testing.',
        options: ['provider', 'tenant'],
        default: 'provider',
        required: true,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_network_interface: {
        type: 'select',
        label: 'LB Management Network Interface',
        description: 'Controller interface for Octavia LB management network (required for provider networks)',
        options: [],
        default: '',
        required: false,
        visibleWhen: [
          { field: 'enable_octavia', equals: 'yes' },
          { field: 'octavia_network_type', equals: 'provider' }
        ]
      },
      octavia_amp_network_name: {
        type: 'text',
        label: 'LB Management Network Name',
        description: 'Name for the Octavia LB management network',
        placeholder: 'lb-mgmt-net',
        default: 'lb-mgmt-net',
        required: false,
        visibleWhen: [
          { field: 'enable_octavia', equals: 'yes' },
          { field: 'octavia_network_type', equals: 'provider' }
        ]
      },
      octavia_amp_network_cidr: {
        type: 'text',
        label: 'LB Management Network CIDR',
        description: 'CIDR for Octavia LB management network',
        placeholder: '10.1.0.0/24',
        default: '10.1.0.0/24',
        required: false,
        validation: /^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/,
        visibleWhen: [
          { field: 'enable_octavia', equals: 'yes' },
          { field: 'octavia_network_type', equals: 'provider' }
        ]
      },
      octavia_amp_network_vlan_id: {
        type: 'number',
        label: 'LB Management Network VLAN ID',
        description: 'VLAN ID for provider network (required for production)',
        placeholder: '1000',
        default: '',
        required: false,
        min: 1,
        max: 4094,
        visibleWhen: [
          { field: 'enable_octavia', equals: 'yes' },
          { field: 'octavia_network_type', equals: 'provider' }
        ]
      },
      octavia_amp_network_physical_network: {
        type: 'text',
        label: 'Physical Network Name',
        description: 'Physical network name (must match your Neutron configuration)',
        placeholder: 'physnet1',
        default: 'physnet1',
        required: false,
        visibleWhen: [
          { field: 'enable_octavia', equals: 'yes' },
          { field: 'octavia_network_type', equals: 'provider' }
        ]
      },
      octavia_amp_network_allocation_start: {
        type: 'text',
        label: 'IP Allocation Pool Start',
        description: 'First IP in allocation pool for Amphora instances',
        placeholder: '10.1.0.100',
        default: '10.1.0.100',
        required: false,
        validation: /^(?:\d{1,3}\.){3}\d{1,3}$/,
        visibleWhen: [
          { field: 'enable_octavia', equals: 'yes' },
          { field: 'octavia_network_type', equals: 'provider' }
        ]
      },
      octavia_amp_network_allocation_end: {
        type: 'text',
        label: 'IP Allocation Pool End',
        description: 'Last IP in allocation pool for Amphora instances',
        placeholder: '10.1.0.200',
        default: '10.1.0.200',
        required: false,
        validation: /^(?:\d{1,3}\.){3}\d{1,3}$/,
        visibleWhen: [
          { field: 'enable_octavia', equals: 'yes' },
          { field: 'octavia_network_type', equals: 'provider' }
        ]
      },
      octavia_amp_flavor_vcpus: {
        type: 'number',
        label: 'Amphora Flavor vCPUs',
        description: 'Number of vCPUs for Amphora instances',
        placeholder: '2',
        default: 2,
        required: false,
        min: 1,
        max: 16,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_amp_flavor_ram: {
        type: 'number',
        label: 'Amphora Flavor RAM (MB)',
        description: 'RAM in MB for Amphora instances',
        placeholder: '2048',
        default: 2048,
        required: false,
        min: 1024,
        max: 32768,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_amp_flavor_disk: {
        type: 'number',
        label: 'Amphora Flavor Disk (GB)',
        description: 'Disk size in GB for Amphora instances',
        placeholder: '10',
        default: 10,
        required: false,
        min: 5,
        max: 100,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_loadbalancer_topology: {
        type: 'select',
        label: 'Load Balancer Topology',
        description: 'Default topology for new load balancers',
        options: ['SINGLE', 'ACTIVE_STANDBY'],
        default: 'SINGLE',
        required: false,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_enable_tls_backend: {
        type: 'toggle',
        label: 'Enable TLS Backend',
        description: 'Enable TLS for backend communication',
        default: 'no',
        required: false,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_certs_country: {
        type: 'text',
        label: 'Certificate Country',
        description: 'Country code for certificate generation',
        placeholder: 'US',
        default: 'US',
        required: false,
        maxlength: 2,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_certs_state: {
        type: 'text',
        label: 'Certificate State',
        description: 'State/Province for certificate generation',
        placeholder: 'YourState',
        default: 'YourState',
        required: false,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_certs_organization: {
        type: 'text',
        label: 'Certificate Organization',
        description: 'Organization name for certificate generation',
        placeholder: 'YourOrganization',
        default: 'YourOrganization',
        required: false,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
      },
      octavia_deployment_notes: {
        type: 'note',
        label: 'Deployment Information',
        description: `<div class="octavia-deployment-info">
          <h6><i class="fas fa-info-circle"></i> Octavia Deployment Notes:</h6>
          <ul>
            <li><strong>Prerequisites:</strong> Ensure OpenStack core services (Nova, Neutron, Glance, Keystone) are operational</li>
            <li><strong>Network Planning:</strong> For production, use provider networks with dedicated VLAN</li>
            <li><strong>Post-Deployment:</strong> Build and register Amphora image after deployment</li>
            <li><strong>Certificates:</strong> Run certificate generation after deployment</li>
            <li><strong>Firewall:</strong> Ensure ports 9876 (API), 5555 (Health), 9443 (Management) are accessible</li>
            <li><strong>Testing:</strong> Use tenant networks for development/testing environments</li>
          </ul>
          <div class="alert alert-warning mt-2">
            <i class="fas fa-exclamation-triangle"></i> 
            <strong>Important:</strong> Refer to the Xloud Octavia SOP document for complete deployment procedures
          </div>
        </div>`,
        visibleWhen: { field: 'enable_octavia', equals: 'yes' }
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
      },
      enable_host_ha: {
        type: 'toggle',
        label: 'Enable Host HA',
        description: 'Enable High Availability for hosts.',
        default: 'no',
        required: false
      },
      enable_dynamic_cluster_optimization: {
        type: 'toggle',
        label: 'Enable Dynamic Cluster Optimization',
        description: 'Enable dynamic cluster optimization service.',
        default: 'no',
        required: false
      },
      enable_db_backup_utility: {
        type: 'toggle',
        label: 'Enable DB Backup Utility',
        description: 'Enable database backup utility.',
        default: 'no',
        required: false
      },
      enable_disk_encryption: {
        type: 'toggle',
        label: 'Enable Disk Encryption',
        description: 'Enable disk encryption using Barbican key management. Requires KMS to be enabled first.',
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
          <h6><i class="fas fa-wrench"></i> Custom YAML Guidelines:</h6>
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
  },

  logs: {
    title: 'Logs',
    description: 'Configuration and activity logs',
    fields: {
      // This will be handled specially in the form generator
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
    
    // Tab icons mapping
    const tabIcons = {
      'basics': 'fas fa-cog',
      'network': 'fas fa-network-wired', 
      'storage': 'fas fa-hdd',
      'monitoring': 'fas fa-chart-line',
      'custom': 'fas fa-wrench',
      'logs': 'fas fa-terminal'
    };
    
    for (const [sectionKey, section] of Object.entries(this.schema)) {
      const icon = tabIcons[sectionKey] || 'fas fa-cog';
      formHtml += `
        <li class="nav-item" role="presentation">
          <button class="nav-link ${isFirst ? 'active' : ''}" id="${sectionKey}-tab" data-bs-toggle="tab"
                  data-bs-target="#${sectionKey}-pane" type="button" role="tab">
            <i class="${icon}"></i> ${section.title}
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
      if (sectionKey === 'logs') {
        // Special handling for logs section
        formHtml += `
          <div class="col-12">
            <div class="config-log-section">
              <div class="config-log-header">
                <h6><i class="fas fa-terminal"></i> Configuration Log</h6>
                <button type="button" id="clear-log-btn" class="btn btn-sm btn-outline-muted">
                  <i class="fas fa-trash"></i> Clear
                </button>
              </div>
              <div id="config-log" class="config-log-content">
                <div class="log-entry log-info">
                  <span class="log-time"></span>
                  <span class="log-message">Ready</span>
                </div>
              </div>
            </div>
          </div>`;
      } else {
        // Regular fields
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

              <!-- EXACT HTML from button.html -->
              <label class="switch">
                <input ${defYes ? 'checked' : ''} type="checkbox" id="${fieldId}" name="${fieldId}" class="switch-input">
                <div class="slider">
                  <div class="circle">
                    <svg class="cross" xml:space="preserve" style="enable-background:new 0 0 512 512" viewBox="0 0 365.696 365.696" y="0" x="0" height="6" width="6" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" xmlns="http://www.w3.org/2000/svg">
                      <g>
                        <path data-original="#000000" fill="currentColor" d="M243.188 182.86 356.32 69.726c12.5-12.5 12.5-32.766 0-45.247L341.238 9.398c-12.504-12.503-32.77-12.503-45.25 0L182.86 122.528 69.727 9.374c-12.5-12.5-32.766-12.5-45.247 0L9.375 24.457c-12.5 12.504-12.5 32.77 0 45.25l113.152 113.152L9.398 295.99c-12.503 12.503-12.503 32.769 0 45.25L24.48 356.32c12.5 12.5 32.766 12.5 45.247 0l113.132-113.132L295.99 356.32c12.503 12.5 32.769 12.5 45.25 0l15.081-15.082c12.5-12.504 12.5-32.77 0-45.25zm0 0"></path>
                      </g>
                    </svg>
                    <svg class="checkmark" xml:space="preserve" style="enable-background:new 0 0 512 512" viewBox="0 0 24 24" y="0" x="0" height="10" width="10" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" xmlns="http://www.w3.org/2000/svg">
                      <g>
                        <path class="" data-original="#000000" fill="currentColor" d="M9.707 19.121a.997.997 0 0 1-1.414 0l-5.646-5.647a1.5 1.5 0 0 1 0-2.121l.707-.707a1.5 1.5 0 0 1 2.121 0L9 14.171l9.525-9.525a1.5 1.5 0 0 1 2.121 0l.707.707a1.5 1.5 0 0 1 0 2.121z"></path>
                      </g>
                    </svg>
                  </div>
                </div>
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
      } // Close the else block for regular fields

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
    
    // Evaluate visibility after switches are set to defaults
    evaluateVisibility(this.container, this.schema);
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

/* ===================== VALIDATION UTILITIES ===================== */
function isValidIPv4(ip) {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

function isValidDomain(domain) {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  return domainRegex.test(domain) && domain.length <= 253;
}

function validateField(input, fieldDef) {
  const value = input.value.trim();
  const errors = [];

  // Check if required
  if (fieldDef.required && !value) {
    errors.push('This field is required');
    return errors;
  }

  // Skip validation if empty and not required
  if (!value) return errors;

  // Check specific field types by name/id
  const fieldId = input.id || input.name || '';
  
  if (fieldId.includes('vip_address') || fieldId.includes('ip_address')) {
    if (!isValidIPv4(value)) {
      errors.push('Please enter a valid IP address (e.g., 192.168.1.100)');
    }
  }

  if (fieldId.includes('fqdn') || fieldId.includes('domain')) {
    if (!isValidDomain(value)) {
      errors.push('Please enter a valid domain name (e.g., example.com)');
    }
  }

  // Check regex validation if provided
  if (fieldDef.validation && !fieldDef.validation.test(value)) {
    errors.push('Invalid format');
  }

  return errors;
}

function validateAllFields() {
  if (!formGenerator) return { isValid: false, errors: [] };
  
  const allErrors = [];
  let isValid = true;
  
  // Get current form values for conditional validation
  const formValues = {};
  const inputs = formGenerator.container.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    const parts = (input.name || '').split('_');
    if (parts.length >= 2) {
      const section = parts[0];
      const key = parts.slice(1).join('_');
      const value = input.classList.contains('switch-input') ? (input.checked ? 'yes' : 'no') : input.value;
      formValues[`${section}.${key}`] = value;
    }
  });
  
  inputs.forEach(input => {
    // Skip hidden fields
    const wrapper = input.closest('[style*="margin-bottom"]');
    if (wrapper && wrapper.style.display === 'none') return;
    
    // Get field definition
    const parts = (input.name || '').split('_');
    if (parts.length < 2) return;
    const section = parts[0];
    const key = parts.slice(1).join('_');
    const fieldDef = CONFIG_SCHEMA?.[section]?.fields?.[key];
    if (!fieldDef) return;
    
    // Skip toggles and notes
    if (fieldDef.type === 'toggle' || fieldDef.type === 'note') return;
    
    const fieldId = `${section}_${key}`;
    const fieldLabel = wrapper?.querySelector('.form-label')?.textContent?.replace('*', '').trim() || key;
    
    // Check if field should be visible based on visibleWhen conditions
    let shouldBeVisible = true;
    if (fieldDef.visibleWhen) {
      if (Array.isArray(fieldDef.visibleWhen)) {
        // All conditions must be met (AND logic)
        shouldBeVisible = fieldDef.visibleWhen.every(condition => {
          const conditionField = `${section}.${condition.field}`;
          return formValues[conditionField] === condition.equals;
        });
      } else {
        // Single condition
        const conditionField = `${section}.${fieldDef.visibleWhen.field}`;
        shouldBeVisible = formValues[conditionField] === fieldDef.visibleWhen.equals;
      }
    }
    
    // If field should not be visible, clear any error states and skip validation
    if (!shouldBeVisible) {
      input.classList.remove('field-required');
      return;
    }
    
    // Check if this field should be conditionally required
    let isConditionallyRequired = fieldDef.required;
    
    // Apply your specific conditional requirements
    
    // 1. Internal VIP address is always required (already marked as required: true)
    
    // 2. If domain setup is enabled then internal FQDN is required
    if (fieldId === 'basics_kolla_internal_fqdn') {
      isConditionallyRequired = formValues['basics.domain_setup'] === 'yes';
    }
    
    // 3. If any TLS option is enabled - then path for cert file required
    if (fieldId === 'basics_kolla_internal_fqdn_cert') {
      isConditionallyRequired = formValues['basics.kolla_enable_tls_internal'] === 'yes';
    }
    if (fieldId === 'basics_kolla_external_fqdn_cert') {
      isConditionallyRequired = formValues['basics.kolla_enable_tls_external'] === 'yes';
    }
    
    // 4. If Cinder is enabled then volume driver is required
    if (fieldId === 'storage_volume_driver') {
      isConditionallyRequired = formValues['storage.enable_cinder'] === 'yes';
    }
    
    // 5. If Cinder is enabled and volume driver is LVM then VG is required
    if (fieldId === 'storage_cinder_volume_group') {
      isConditionallyRequired = formValues['storage.enable_cinder'] === 'yes' && 
                               formValues['storage.volume_driver'] === 'LVM';
    }
    
    // 6. If Cinder is enabled and volume driver is NFS then NFS backend must be enabled
    if (fieldId === 'storage_enable_cinder_backend_nfs') {
      if (formValues['storage.enable_cinder'] === 'yes' && formValues['storage.volume_driver'] === 'NFS') {
        // For NFS, the toggle must be enabled
        const isNfsEnabled = input.classList.contains('switch-input') ? input.checked : input.value === 'yes';
        if (!isNfsEnabled) {
          isValid = false;
          input.classList.add('field-required');
          allErrors.push({
            field: fieldId,
            label: fieldLabel,
            errors: ['NFS backend must be enabled when using NFS volume driver']
          });
          return; // Skip other validation for this field
        }
      }
    }
    
    // 7. If NFS backend is enabled then NFS share path is required
    if (fieldId === 'storage_nfs_share_path') {
      isConditionallyRequired = formValues['storage.enable_cinder'] === 'yes' && 
                               formValues['storage.volume_driver'] === 'NFS' &&
                               formValues['storage.enable_cinder_backend_nfs'] === 'yes';
    }
    
    // 8. Octavia validation rules
    if (fieldId === 'loadbalancer_octavia_network_interface') {
      isConditionallyRequired = formValues['loadbalancer.enable_octavia'] === 'yes' && 
                               formValues['loadbalancer.octavia_network_type'] === 'provider';
    }
    
    if (fieldId === 'loadbalancer_octavia_amp_network_vlan_id') {
      isConditionallyRequired = formValues['loadbalancer.enable_octavia'] === 'yes' && 
                               formValues['loadbalancer.octavia_network_type'] === 'provider';
    }
    
    if (fieldId === 'loadbalancer_octavia_amp_network_physical_network') {
      isConditionallyRequired = formValues['loadbalancer.enable_octavia'] === 'yes' && 
                               formValues['loadbalancer.octavia_network_type'] === 'provider';
    }
    
    // 9. Storage validation rules
    if (fieldId === 'storage_cinder_volume_group') {
      const backendType = formValues['storage.storage_backend_type'] || 'single-backend';
      const primaryBackend = formValues['storage.primary_backend'] || 'LVM';
      const enableLvm = formValues['storage.enable_cinder_backend_lvm'] === 'yes';
      
      isConditionallyRequired = formValues['storage.enable_cinder'] === 'yes' && 
                               ((backendType === 'single-backend' && primaryBackend === 'LVM') ||
                                (backendType === 'multiple-backends' && enableLvm));
    }
    
    if (fieldId === 'storage_vmware_vcenter_host_ip') {
      const backendType = formValues['storage.storage_backend_type'] || 'single-backend';
      const primaryBackend = formValues['storage.primary_backend'] || 'LVM';
      const enableVmwareVmdk = formValues['storage.enable_cinder_backend_vmware_vmdk'] === 'yes';
      const enableVmwareVstorage = formValues['storage.enable_cinder_backend_vmware_vstorage'] === 'yes';
      
      isConditionallyRequired = formValues['storage.enable_cinder'] === 'yes' && 
                               ((backendType === 'single-backend' && (primaryBackend === 'VMware VMDK' || primaryBackend === 'VMware vStorage')) ||
                                (backendType === 'multiple-backends' && (enableVmwareVmdk || enableVmwareVstorage)));
    }
    
    if (fieldId === 'storage_pure_api_token') {
      const backendType = formValues['storage.storage_backend_type'] || 'single-backend';
      const primaryBackend = formValues['storage.primary_backend'] || 'LVM';
      const enablePureIscsi = formValues['storage.enable_cinder_backend_pure_iscsi'] === 'yes';
      const enablePureFc = formValues['storage.enable_cinder_backend_pure_fc'] === 'yes';
      
      isConditionallyRequired = formValues['storage.enable_cinder'] === 'yes' && 
                               ((backendType === 'single-backend' && primaryBackend.includes('Pure Storage')) ||
                                (backendType === 'multiple-backends' && (enablePureIscsi || enablePureFc)));
    }
    
    // Validate regular field requirements
    if (isConditionallyRequired) {
      const fieldErrors = validateField(input, { ...fieldDef, required: true });
      if (fieldErrors.length > 0) {
        isValid = false;
        input.classList.add('field-required');
        allErrors.push({
          field: fieldId,
          label: fieldLabel,
          errors: fieldErrors
        });
      } else {
        input.classList.remove('field-required');
      }
    } else {
      // Field is not required, just validate format if value exists
      input.classList.remove('field-required');
      const value = input.classList.contains('switch-input') ? (input.checked ? 'yes' : 'no') : input.value;
      if (value) {
        const fieldErrors = validateField(input, { ...fieldDef, required: false });
        if (fieldErrors.length > 0) {
          isValid = false;
          input.classList.add('field-required');
          allErrors.push({
            field: fieldId,
            label: fieldLabel,
            errors: fieldErrors
          });
        } else {
          input.classList.remove('field-required');
        }
      }
      
      // Clear tab error indicator if this was the only error in the tab
      clearTabErrorIfNoErrors(input);
    }
  });
  
  return { isValid, errors: allErrors };
}

function updateSaveButtonState() {
  const saveBtn = document.getElementById('save');
  if (!saveBtn) return;
  
  const validation = validateAllFields();
  
  if (validation.isValid) {
    saveBtn.disabled = false;
    saveBtn.classList.remove('btn-disabled');
    saveBtn.classList.add('btn-brand');
  } else {
    saveBtn.disabled = true;
    saveBtn.classList.add('btn-disabled');
    saveBtn.classList.remove('btn-brand');
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

/* ========== Switch CSS now in style.css - no injection needed ========== */
function injectSwitchCSS() {
  // Switch CSS is now properly defined in style.css
  // No injection needed to avoid conflicts
}

/* Ensure checkbox switches store 'yes'/'no' values */
function wireFlatSwitches() {
  document.querySelectorAll('.switch input[type="checkbox"]').forEach(chk => {
    const setVal = () => { chk.value = chk.checked ? 'yes' : 'no'; };
    setVal();
    chk.addEventListener('change', setVal);
  });
}

/* Status panel */
function showStatus(message, type = 'info') {
  // Add to log instead of showing banner
  addConfigLog(message, type);
  
  // Only show banner for critical errors
  if (type === 'danger' || type === 'error') {
    const el = document.getElementById('status_panel');
    if (el) {
      el.className = `alert alert-${type === 'error' ? 'danger' : type}`;
      el.textContent = message;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
  }
}

/* ===================== YAML GEN ===================== */
const YAML_SKIP_KEYS = new Set(['domain_setup', 'volume_driver', 'enable_kms', 'enable_host_ha', 'enable_dynamic_cluster_optimization', 'enable_db_backup_utility', 'note_ceph', 'note_san', 'octavia_deployment_notes', 'octavia_amp_network_name', 'octavia_amp_network_cidr', 'octavia_amp_network_vlan_id', 'octavia_amp_network_physical_network', 'octavia_amp_network_allocation_start', 'octavia_amp_network_allocation_end', 'octavia_amp_flavor_vcpus', 'octavia_amp_flavor_ram', 'octavia_amp_flavor_disk', 'octavia_amp_ssh_key_name', 'octavia_api_workers', 'octavia_health_manager_port', 'storage_backend_type', 'primary_backend', 'lvm_config_section', 'ceph_config_section', 'nfs_config_section', 'vmware_config_section', 'pure_config_section', 'backup_config_section', 'performance_config_section', 'cinder_deployment_notes', 'enable_multiple_backends_note', 'nfs_shares_config']);
const YAML_ONLY_IF_YES = new Set(['enable_neutron_vpnaas','enable_neutron_qos','enable_neutron_trunk','enable_cinder_backend_nfs','enable_horizon_octavia','enable_redis','octavia_auto_configure','octavia_enable_tls_backend','enable_cinder_backend_lvm','enable_cinder_backend_ceph','enable_cinder_backend_iscsi','enable_cinder_backend_vmware_vmdk','enable_cinder_backend_vmware_vstorage','enable_cinder_backend_pure_iscsi','enable_cinder_backend_pure_fc','cinder_enable_conversion_tmpfs','enable_redis_for_coordination']);

function generateYamlContent(config) {
  let yaml = '---\n';
  yaml += '# XAVS Global Configuration Variables\n';
  yaml += `# Generated on: ${new Date().toISOString()}\n\n`;

  const comments = {
    basics: 'Primary networking, domains, and TLS',
    network: 'Network and connectivity configuration',
    storage: 'Storage services configuration',
    loadbalancer: 'Load Balancer services configuration',
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
      
      // Skip storage-specific fields that need special handling
      if (isStorage && (
        key === 'storage_backend_type' || 
        key === 'primary_backend' ||
        key.includes('_config_section') ||
        key.includes('_deployment_notes') ||
        key === 'nfs_shares_config' ||
        key === 'cinder_volume_group'
      )) continue;
      
      writeKV(key, value);
    }

    if (isStorage) {
      const cinderEnabled = String(sectionValue.enable_cinder || 'no').toLowerCase() === 'yes';
      
      if (cinderEnabled) {
        // Handle storage backend configuration
        const backendType = sectionValue.storage_backend_type || 'single-backend';
        const primaryBackend = sectionValue.primary_backend || 'LVM';
        
        if (backendType === 'single-backend') {
          // Single backend configuration
          yaml += '\n# Primary Storage Backend Configuration\n';
          
          switch (primaryBackend) {
            case 'LVM':
              writeKV('enable_cinder_backend_lvm', 'yes');
              if (sectionValue.cinder_volume_group) {
                writeKV('cinder_volume_group', sectionValue.cinder_volume_group);
              }
              if (sectionValue.cinder_backend_lvm_name) {
                writeKV('cinder_backend_lvm_name', sectionValue.cinder_backend_lvm_name);
              }
              break;
              
            case 'Ceph RBD':
              writeKV('cinder_backend_ceph', 'yes');
              if (sectionValue.ceph_cinder_pool_name) {
                writeKV('ceph_cinder_pool_name', sectionValue.ceph_cinder_pool_name);
              }
              if (sectionValue.ceph_cinder_user) {
                writeKV('ceph_cinder_user', sectionValue.ceph_cinder_user);
              }
              if (sectionValue.cinder_backend_ceph_name) {
                writeKV('cinder_backend_ceph_name', sectionValue.cinder_backend_ceph_name);
              }
              break;
              
            case 'NFS':
              writeKV('enable_cinder_backend_nfs', 'yes');
              if (sectionValue.cinder_backend_nfs_name) {
                writeKV('cinder_backend_nfs_name', sectionValue.cinder_backend_nfs_name);
              }
              break;
              
            case 'iSCSI':
              writeKV('enable_cinder_backend_iscsi', 'yes');
              writeKV('enable_iscsid', 'yes');
              break;
              
            case 'VMware VMDK':
              writeKV('cinder_backend_vmwarevc_vmdk', 'yes');
              break;
              
            case 'VMware vStorage':
              writeKV('cinder_backend_vmware_vstorage_object', 'yes');
              break;
              
            case 'Pure Storage iSCSI':
              writeKV('enable_cinder_backend_pure_iscsi', 'yes');
              break;
              
            case 'Pure Storage FC':
              writeKV('enable_cinder_backend_pure_fc', 'yes');
              break;
              
            case 'Pure Storage NVMe-RoCE':
              writeKV('enable_cinder_backend_pure_roce', 'yes');
              break;
          }
        } else {
          // Multiple backends configuration
          yaml += '\n# Multiple Storage Backends Configuration\n';
          
          // Generate configuration for each enabled backend
          if (String(sectionValue.enable_cinder_backend_lvm || 'no').toLowerCase() === 'yes') {
            writeKV('enable_cinder_backend_lvm', 'yes');
            if (sectionValue.cinder_volume_group) {
              writeKV('cinder_volume_group', sectionValue.cinder_volume_group);
            }
            if (sectionValue.cinder_backend_lvm_name) {
              writeKV('cinder_backend_lvm_name', sectionValue.cinder_backend_lvm_name);
            }
          }
          
          if (String(sectionValue.enable_cinder_backend_ceph || 'no').toLowerCase() === 'yes') {
            writeKV('cinder_backend_ceph', 'yes');
            if (sectionValue.ceph_cinder_pool_name) {
              writeKV('ceph_cinder_pool_name', sectionValue.ceph_cinder_pool_name);
            }
            if (sectionValue.ceph_cinder_user) {
              writeKV('ceph_cinder_user', sectionValue.ceph_cinder_user);
            }
            if (sectionValue.cinder_backend_ceph_name) {
              writeKV('cinder_backend_ceph_name', sectionValue.cinder_backend_ceph_name);
            }
          }
          
          if (String(sectionValue.enable_cinder_backend_nfs || 'no').toLowerCase() === 'yes') {
            writeKV('enable_cinder_backend_nfs', 'yes');
            if (sectionValue.cinder_backend_nfs_name) {
              writeKV('cinder_backend_nfs_name', sectionValue.cinder_backend_nfs_name);
            }
          }
          
          if (String(sectionValue.enable_cinder_backend_iscsi || 'no').toLowerCase() === 'yes') {
            writeKV('enable_cinder_backend_iscsi', 'yes');
            writeKV('enable_iscsid', 'yes');
          }
          
          if (String(sectionValue.enable_cinder_backend_vmware_vmdk || 'no').toLowerCase() === 'yes') {
            writeKV('cinder_backend_vmwarevc_vmdk', 'yes');
          }
          
          if (String(sectionValue.enable_cinder_backend_vmware_vstorage || 'no').toLowerCase() === 'yes') {
            writeKV('cinder_backend_vmware_vstorage_object', 'yes');
          }
          
          if (String(sectionValue.enable_cinder_backend_pure_iscsi || 'no').toLowerCase() === 'yes') {
            writeKV('enable_cinder_backend_pure_iscsi', 'yes');
          }
          
          if (String(sectionValue.enable_cinder_backend_pure_fc || 'no').toLowerCase() === 'yes') {
            writeKV('enable_cinder_backend_pure_fc', 'yes');
          }
        }
        
        // Handle VMware configuration
        if ((primaryBackend === 'VMware VMDK' || primaryBackend === 'VMware vStorage') ||
            (String(sectionValue.enable_cinder_backend_vmware_vmdk || 'no').toLowerCase() === 'yes') ||
            (String(sectionValue.enable_cinder_backend_vmware_vstorage || 'no').toLowerCase() === 'yes')) {
          
          yaml += '\n# VMware Configuration\n';
          if (sectionValue.vmware_vcenter_host_ip) {
            writeKV('vmware_vcenter_host_ip', sectionValue.vmware_vcenter_host_ip);
          }
          if (sectionValue.vmware_vcenter_host_username) {
            writeKV('vmware_vcenter_host_username', sectionValue.vmware_vcenter_host_username);
          }
          if (sectionValue.vmware_vcenter_host_password) {
            writeKV('vmware_vcenter_host_password', sectionValue.vmware_vcenter_host_password);
          }
          if (sectionValue.vmware_vcenter_cluster_name) {
            writeKV('vmware_vcenter_cluster_name', sectionValue.vmware_vcenter_cluster_name);
          }
        }
        
        // Handle Pure Storage configuration
        if ((primaryBackend.includes('Pure Storage')) ||
            (String(sectionValue.enable_cinder_backend_pure_iscsi || 'no').toLowerCase() === 'yes') ||
            (String(sectionValue.enable_cinder_backend_pure_fc || 'no').toLowerCase() === 'yes')) {
          
          yaml += '\n# Pure Storage Configuration\n';
          if (sectionValue.pure_api_token) {
            writeKV('pure_api_token', sectionValue.pure_api_token);
          }
          if (sectionValue.pure_san_ip) {
            writeKV('pure_san_ip', sectionValue.pure_san_ip);
          }
        }
        
        // Handle backup configuration
        if (String(sectionValue.enable_cinder_backup || 'no').toLowerCase() === 'yes') {
          yaml += '\n# Cinder Backup Configuration\n';
          if (sectionValue.cinder_backup_driver) {
            writeKV('cinder_backup_driver', sectionValue.cinder_backup_driver);
            
            // Driver-specific backup configuration
            switch (sectionValue.cinder_backup_driver) {
              case 'ceph':
                if (sectionValue.ceph_backup_pool_name) {
                  writeKV('ceph_cinder_backup_pool_name', sectionValue.ceph_backup_pool_name);
                }
                break;
              case 'nfs':
                if (sectionValue.cinder_backup_share) {
                  writeKV('cinder_backup_share', sectionValue.cinder_backup_share);
                }
                break;
              case 's3':
                if (sectionValue.cinder_backup_s3_url) {
                  writeKV('cinder_backup_s3_url', sectionValue.cinder_backup_s3_url);
                }
                if (sectionValue.cinder_backup_s3_bucket) {
                  writeKV('cinder_backup_s3_bucket', sectionValue.cinder_backup_s3_bucket);
                }
                break;
              case 'swift':
                writeKV('enable_swift', 'yes');
                break;
            }
          }
        }
        
        // Handle performance configuration
        if (String(sectionValue.enable_redis_for_coordination || 'no').toLowerCase() === 'yes') {
          writeKV('enable_redis', 'yes');
          writeKV('cinder_coordination_backend', 'redis');
        }
      }
    }

    if (isAdvanced) {
      if (String(sectionValue.enable_kms || 'no').toLowerCase() === 'yes')
        writeKV('enable_barbican', 'yes');
      
      if (String(sectionValue.enable_host_ha || 'no').toLowerCase() === 'yes') {
        yaml += '\n#Host HA\n';
        writeKV('enable_masakari', 'yes');
        writeKV('enable_hacluster', 'yes');
      }
      
      if (String(sectionValue.enable_dynamic_cluster_optimization || 'no').toLowerCase() === 'yes') {
        yaml += '\n#Watcher\n';
        writeKV('enable_watcher', 'yes');
      }
      
      if (String(sectionValue.enable_db_backup_utility || 'no').toLowerCase() === 'yes') {
        writeKV('enable_mariabackup', 'yes');
      }
    }

    // Handle Octavia Load Balancer configuration
    if (sectionKey === 'loadbalancer') {
      const octaviaEnabled = String(sectionValue.enable_octavia || 'no').toLowerCase() === 'yes';
      if (octaviaEnabled) {
        // Only generate network configuration for provider networks
        // For tenant networks, Kolla Ansible will automatically create the network
        if (sectionValue.octavia_network_type === 'provider') {
          // Generate octavia_amp_network configuration for provider networks only
          const networkName = sectionValue.octavia_amp_network_name || 'lb-mgmt-net';
          const networkCidr = sectionValue.octavia_amp_network_cidr || '10.1.0.0/24';
          const allocStart = sectionValue.octavia_amp_network_allocation_start || '10.1.0.100';
          const allocEnd = sectionValue.octavia_amp_network_allocation_end || '10.1.0.200';
          
          yaml += '# Octavia Management Network Configuration\n';
          yaml += 'octavia_amp_network:\n';
          yaml += `  name: "${networkName}"\n`;
          yaml += `  provider_network_type: "vlan"\n`;
          
          if (sectionValue.octavia_amp_network_vlan_id) {
            yaml += `  provider_segmentation_id: ${sectionValue.octavia_amp_network_vlan_id}\n`;
          }
          if (sectionValue.octavia_amp_network_physical_network) {
            yaml += `  provider_physical_network: "${sectionValue.octavia_amp_network_physical_network}"\n`;
          }
          
          yaml += `  external: false\n`;
          yaml += `  shared: false\n`;
          yaml += `  subnet:\n`;
          yaml += `    name: "${networkName.replace('-net', '-subnet')}"\n`;
          yaml += `    cidr: "${networkCidr}"\n`;
          yaml += `    allocation_pool_start: "${allocStart}"\n`;
          yaml += `    allocation_pool_end: "${allocEnd}"\n`;
          yaml += `    no_gateway_ip: yes\n`;
          yaml += `    enable_dhcp: yes\n\n`;
        }
        
        // Generate octavia_amp_flavor configuration (always needed)
        const flavorVcpus = sectionValue.octavia_amp_flavor_vcpus || 2;
        const flavorRam = sectionValue.octavia_amp_flavor_ram || 2048;
        const flavorDisk = sectionValue.octavia_amp_flavor_disk || 10;
        
        yaml += '# Octavia Amphora Flavor Configuration\n';
        yaml += 'octavia_amp_flavor:\n';
        yaml += `  name: "amphora"\n`;
        yaml += `  is_public: no\n`;
        yaml += `  vcpus: ${flavorVcpus}\n`;
        yaml += `  ram: ${flavorRam}\n`;
        yaml += `  disk: ${flavorDisk}\n\n`;
        
        // Add SSH key configuration automatically (always needed)
        yaml += '# Octavia SSH Key Configuration\n';
        yaml += 'octavia_amp_ssh_key_name: "octavia_ssh_key"\n\n';
      }
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

/* ===================== CUSTOM CONFIG FILES ===================== */
async function createCustomConfigFiles() {
  try {
    const config = formGenerator ? formGenerator.getFormData() : {};
    
    // Check if Cinder NFS backend is enabled and create nfs_shares file
    if (config.storage && String(config.storage.enable_cinder || 'no').toLowerCase() === 'yes') {
      const backendType = config.storage.storage_backend_type || 'single-backend';
      const primaryBackend = config.storage.primary_backend || 'LVM';
      const enableNfs = String(config.storage.enable_cinder_backend_nfs || 'no').toLowerCase() === 'yes';
      const nfsSharesConfig = config.storage.nfs_shares_config || '';
      
      const needsNfsConfig = (backendType === 'single-backend' && primaryBackend === 'NFS') ||
                             (backendType === 'multiple-backends' && enableNfs);
      
      if (needsNfsConfig && nfsSharesConfig.trim()) {
        try {
          // Create /etc/kolla/config/cinder directory
          await cockpit.spawn(['mkdir', '-p', '/etc/kolla/config/cinder'], { superuser: 'require', err: 'message' });
          
          // Create nfs_shares file
          await cockpit.file('/etc/kolla/config/cinder/nfs_shares').replace(nfsSharesConfig.trim());
          
          addConfigLog('NFS shares configuration file created successfully in /etc/kolla/config/cinder/nfs_shares', 'success');
          console.log('NFS shares config file created successfully');
        } catch (error) {
          addConfigLog('Failed to create NFS shares config file: ' + error.message, 'error');
          console.error('Failed to create NFS shares config file:', error);
        }
      }
    }
    
    // Check if Host HA is enabled
    if (config.advanced && String(config.advanced.enable_host_ha || 'no').toLowerCase() === 'yes') {
      try {
        // Create /etc/xavs/config directory
        await cockpit.spawn(['mkdir', '-p', '/etc/xavs/config'], { superuser: 'require', err: 'message' });
        
        // Create masakari.conf
        const masakariConf = `[instance_failure]
process_all_instances = True

[host_failure]
evacuate_all_instances = true
`;
        await cockpit.file('/etc/xavs/config/masakari.conf').replace(masakariConf);
        
        // Create masakari directory
        await cockpit.spawn(['mkdir', '-p', '/etc/xavs/config/masakari'], { superuser: 'require', err: 'message' });
        
        // Create masakari-monitors.conf
        const masakariMonitorsConf = `[host]
restrict_to_remotes = False
monitoring_driver = default
monitoring_interval = 5
disable_ipmi_check = True
`;
        await cockpit.file('/etc/xavs/config/masakari/masakari-monitors.conf').replace(masakariMonitorsConf);
        
        addConfigLog('Host HA configuration files created successfully in /etc/xavs/config/', 'success');
        console.log('Host HA config files created successfully');
      } catch (error) {
        addConfigLog('Failed to create Host HA config files: ' + error.message, 'error');
        console.error('Failed to create Host HA config files:', error);
        throw error;
      }
    }

    // Check if Disk Encryption is enabled
    if (config.advanced && String(config.advanced.enable_disk_encryption || 'no').toLowerCase() === 'yes') {
      try {
        // Create /etc/xavs/config directory
        await cockpit.spawn(['mkdir', '-p', '/etc/xavs/config'], { superuser: 'require', err: 'message' });
        
        // Create cinder directory
        await cockpit.spawn(['mkdir', '-p', '/etc/xavs/config/cinder'], { superuser: 'require', err: 'message' });
        
        // Create cinder-api.conf
        const cinderApiConf = `[key_manager]
backend = barbican
`;
        await cockpit.file('/etc/xavs/config/cinder/cinder-api.conf').replace(cinderApiConf);
        
        // Create nova directory
        await cockpit.spawn(['mkdir', '-p', '/etc/xavs/config/nova'], { superuser: 'require', err: 'message' });
        
        // Create nova-compute.conf
        const novaComputeConf = `[key_manager]
backend = barbican
`;
        await cockpit.file('/etc/xavs/config/nova/nova-compute.conf').replace(novaComputeConf);
        
        addConfigLog('Disk encryption configuration files created successfully in /etc/xavs/config/', 'success');
        console.log('Disk encryption config files created successfully');
      } catch (error) {
        addConfigLog('Failed to create disk encryption config files: ' + error.message, 'error');
        console.error('Failed to create disk encryption config files:', error);
        throw error;
      }
    }
  } catch (error) {
    console.error('Error in createCustomConfigFiles:', error);
    throw error;
  }
}

async function cleanupCustomConfigFiles() {
  try {
    const config = formGenerator ? formGenerator.getFormData() : {};
    
    // Check if Host HA is disabled and clean up its config files
    if (!config.advanced || String(config.advanced.enable_host_ha || 'no').toLowerCase() !== 'yes') {
      try {
        // Remove masakari config files if they exist
        await cockpit.spawn(['rm', '-f', '/etc/xavs/config/masakari.conf'], { superuser: 'require', err: 'ignore' });
        await cockpit.spawn(['rm', '-f', '/etc/xavs/config/masakari/masakari-monitors.conf'], { superuser: 'require', err: 'ignore' });
        await cockpit.spawn(['rmdir', '/etc/xavs/config/masakari'], { superuser: 'require', err: 'ignore' });
        
        addConfigLog('Host HA configuration files cleaned up', 'info');
        console.log('Host HA config files cleaned up successfully');
      } catch (error) {
        // Ignore cleanup errors - files might not exist
        console.log('Host HA cleanup completed (some files may not have existed)');
      }
    }
    
    // Check if Disk Encryption is disabled and clean up its config files
    if (!config.advanced || String(config.advanced.enable_disk_encryption || 'no').toLowerCase() !== 'yes') {
      try {
        // Remove disk encryption config files if they exist
        await cockpit.spawn(['rm', '-f', '/etc/xavs/config/cinder/cinder-api.conf'], { superuser: 'require', err: 'ignore' });
        await cockpit.spawn(['rmdir', '/etc/xavs/config/cinder'], { superuser: 'require', err: 'ignore' });
        await cockpit.spawn(['rm', '-f', '/etc/xavs/config/nova/nova-compute.conf'], { superuser: 'require', err: 'ignore' });
        await cockpit.spawn(['rmdir', '/etc/xavs/config/nova'], { superuser: 'require', err: 'ignore' });
        
        addConfigLog('Disk encryption configuration files cleaned up', 'info');
        console.log('Disk encryption config files cleaned up successfully');
      } catch (error) {
        // Ignore cleanup errors - files might not exist
        console.log('Disk encryption cleanup completed (some files may not have existed)');
      }
    }
    
    // Try to remove /etc/xavs/config if it's empty (after all cleanups)
    try {
      await cockpit.spawn(['rmdir', '/etc/xavs/config'], { superuser: 'require', err: 'ignore' });
    } catch (error) {
      // Ignore - directory might not be empty or might not exist
    }
    
    // Add cleanup for other features when they get custom config files
    // if (!config.advanced || String(config.advanced.enable_dynamic_cluster_optimization || 'no').toLowerCase() !== 'yes') {
    //   // Clean up Watcher config files when implemented
    // }
    
    // if (!config.advanced || String(config.advanced.enable_db_backup_utility || 'no').toLowerCase() !== 'yes') {
    //   // Clean up DB Backup config files when implemented
    // }
    
  } catch (error) {
    console.error('Error in cleanupCustomConfigFiles:', error);
    // Don't throw error for cleanup failures
  }
}

/* ===================== SAVE ===================== */
async function saveConfiguration() {
  // Validate required fields using advanced conditional validation
  const validation = validateAllFields();
  if (!validation.isValid) {
    showStatus('Please fill in all required fields (highlighted in red)', 'danger');
    
    // Log validation errors for debugging
    console.log('Validation errors:', validation.errors);
    validation.errors.forEach(error => {
      console.log(`Field ${error.field} (${error.label}): ${error.errors.join(', ')}`);
    });
    
    return;
  }
  
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

    // Clean up old config files for disabled features
    await cleanupCustomConfigFiles();
    
    // Create custom config files for enabled features
    await createCustomConfigFiles();

    addConfigLog(`Configuration saved successfully`, 'success');
    showStatus(`Configuration saved to ${filePath}`, 'success');
    return filePath;
  } catch (e) {
    console.error('Save failed:', e);
    addConfigLog(`Save failed: ${e.message}`, 'error');
    showStatus('Failed to save configuration: ' + e.message, 'danger');
  }
}

/* ===================== INIT ===================== */
document.addEventListener('DOMContentLoaded', async () => {
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
    updateOctaviaProviderAgents();
    await updateVGOptionsAndHint();

    // Load existing logs from persistent storage
    await loadConfigLogs();
    
    // Set up log refresh interval (every 5 seconds)
    setInterval(async () => {
      await loadConfigLogs();
    }, 5000);

    // Set up storage module redirect button
    setupStorageRedirectButton();

    // Reactivity
    formGenerator.container.addEventListener('change', async (e) => {
      if (!e.target || !e.target.name) return;

      // Log meaningful field changes (exclude notes, empty values, and file paths)
      const fieldLabel = document.querySelector(`label[for="${e.target.id}"]`)?.textContent.replace('*', '').trim() || e.target.name;
      const newValue = e.target.type === 'checkbox' ? (e.target.checked ? 'Yes' : 'No') : e.target.value;
      
      // Don't log empty values, note fields, or file paths
      const isFilePath = e.target.id.includes('cert') || fieldLabel.toLowerCase().includes('path') || fieldLabel.toLowerCase().includes('cert');
      
      if (newValue && newValue.trim() !== '' && !e.target.id.includes('note_') && !isFilePath) {
        // Format the field name nicely
        const cleanFieldName = fieldLabel.replace(/\s*\*\s*$/, '').trim();
        await addConfigLog(`${cleanFieldName} set to "${newValue}"`, 'info');
      }

      // Remove required field highlighting if filled
      if (e.target.value || (e.target.type === 'checkbox' && e.target.checked)) {
        e.target.classList.remove('field-required');
        // Clear tab error highlighting if this was the last error in the tab
        clearTabErrorIfNoErrors(e.target);
      }

      if (e.target.id === 'basics_network_interface') syncExternalInterfaceOptions();
      if (e.target.id === 'network_neutron_external_interface') hookExternalInterfaceBehavior();
      if (e.target.id === 'loadbalancer_octavia_provider_drivers') updateOctaviaProviderAgents();

      if (e.target.id === 'storage_volume_driver' || e.target.id === 'storage_enable_cinder' || 
          e.target.id === 'storage_storage_backend_type' || e.target.id === 'storage_primary_backend' ||
          e.target.id === 'storage_enable_cinder_backend_lvm') {
        await updateVGOptionsAndHint();
        
        // If Cinder is disabled, clear all related field errors
        if (e.target.id === 'storage_enable_cinder' && (e.target.checked === false || e.target.value === 'no')) {
          // Clear errors from all Cinder-related fields
          const cinderRelatedFields = [
            'storage_volume_driver', 'storage_cinder_volume_group', 'storage_enable_cinder_backend_nfs', 'storage_nfs_share_path',
            'storage_storage_backend_type', 'storage_primary_backend', 'storage_enable_cinder_backend_lvm',
            'storage_enable_cinder_backend_ceph', 'storage_enable_cinder_backend_nfs', 'storage_enable_cinder_backend_iscsi',
            'storage_vmware_vcenter_host_ip', 'storage_pure_api_token'
          ];
          cinderRelatedFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
              field.classList.remove('field-required');
              clearTabErrorIfNoErrors(field);
            }
          });
        }
      }

      // Handle advanced feature toggles for immediate cleanup
      if (e.target.id === 'advanced_enable_host_ha' && (e.target.checked === false || e.target.value === 'no')) {
        await addConfigLog('Host HA disabled - config files will be cleaned up on next save', 'info');
      }
      
      if (e.target.id === 'advanced_enable_dynamic_cluster_optimization' && (e.target.checked === false || e.target.value === 'no')) {
        await addConfigLog('Dynamic Cluster Optimization disabled - will be removed from configuration', 'info');
      }
      
      if (e.target.id === 'advanced_enable_db_backup_utility' && (e.target.checked === false || e.target.value === 'no')) {
        await addConfigLog('DB Backup Utility disabled - will be removed from configuration', 'info');
      }

      // Handle disk encryption dependency validation
      if (e.target.id === 'advanced_enable_disk_encryption') {
        const isEnabled = e.target.type === 'checkbox' ? e.target.checked : e.target.value === 'yes';
        if (isEnabled) {
          // Check if KMS is enabled
          const kmsToggle = document.getElementById('advanced_enable_kms');
          const kmsEnabled = kmsToggle ? (kmsToggle.type === 'checkbox' ? kmsToggle.checked : kmsToggle.value === 'yes') : false;
          
          if (!kmsEnabled) {
            // Disable disk encryption and show error
            if (e.target.type === 'checkbox') {
              e.target.checked = false;
            } else {
              e.target.value = 'no';
            }
            
            addConfigLog('Error: Enable KMS first for disk encryption', 'error');
            showStatus('Please enable KMS (Key Management Service) first before enabling disk encryption', 'danger');
            
            // Trigger change event to update form state
            e.target.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          } else {
            addConfigLog('Disk encryption enabled - encryption config files will be created on save', 'info');
          }
        } else {
          addConfigLog('Disk encryption disabled - config files will be cleaned up on next save', 'info');
        }
      }

      evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
      
      // Refresh validation state for toggle fields to clear stale errors
      if (e.target.type === 'checkbox' || e.target.classList.contains('switch-input')) {
        refreshValidationAfterToggleChange();
      } else {
        // Update save button state after any change
        setTimeout(updateSaveButtonState, 100);
      }
    });

    // Add input event listeners for real-time validation
    formGenerator.container.addEventListener('input', (e) => {
      // Get field definition for validation
      const parts = (e.target.name || '').split('_');
      if (parts.length >= 2) {
        const section = parts[0];
        const key = parts.slice(1).join('_');
        const fieldDef = CONFIG_SCHEMA?.[section]?.fields?.[key];
        
        if (fieldDef) {
          const errors = validateField(e.target, fieldDef);
          if (errors.length > 0) {
            e.target.classList.add('field-required');
            e.target.title = errors.join(', ');
          } else {
            e.target.classList.remove('field-required');
            e.target.title = '';
            
            // Clear tab error highlighting if this was the last error in the tab
            clearTabErrorIfNoErrors(e.target);
          }
        }
      }
      
      // Update save button state after input
      setTimeout(updateSaveButtonState, 100);
    });

    setupEventListeners();
    setupHelpUX();     // hover & click
    evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
    
    // Initialize save button state
    setTimeout(updateSaveButtonState, 500);
    
    // Set initial status and update timestamp
    const recentActivity = document.getElementById('recent-activity');
    if (recentActivity) {
      const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      recentActivity.textContent = `${timestamp} - Ready`;
    }
  } catch (e) {
    console.error('Init failed:', e);
    showStatus('Failed to load: ' + e.message, 'danger');
  }
});

/* ===================== CONFIGURATION LOGGING ===================== */
async function addConfigLog(message, type = 'info') {
  const logContainer = document.getElementById('config-log');
  
  const timestamp = new Date().toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  const fullTimestamp = new Date().toISOString();
  const logLine = `${fullTimestamp} [${type.toUpperCase()}] ${message}\n`;
  
  // Write to persistent log file
  try {
    await cockpit.spawn(['mkdir', '-p', '/var/log/xavs'], { superuser: 'require', err: 'ignore' });
    
    // Append to log file
    const cmd = `echo "${logLine.replace(/"/g, '\\"')}" >> /var/log/xavs/globals-config.log`;
    await cockpit.spawn(['bash', '-c', cmd], { superuser: 'require', err: 'ignore' });
  } catch (error) {
    console.warn('Failed to write to persistent log:', error);
  }
  
  // Update UI if log container exists
  if (logContainer) {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `
      <span class="log-time">${timestamp}</span>
      <span class="log-message">${message}</span>
    `;
    
    logContainer.appendChild(logEntry);
    
    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  
  // Update bottom status bar with most recent activity and color coding
  const recentActivity = document.getElementById('recent-activity');
  const statusBar = document.querySelector('.bottom-status-bar');
  if (recentActivity && statusBar) {
    recentActivity.textContent = `${timestamp} - ${message}`;
    
    // Remove existing status classes
    statusBar.classList.remove('status-info', 'status-success', 'status-warning', 'status-error');
    
    // Add appropriate status class for color coding
    const statusClass = type === 'success' ? 'status-success' : 
                       type === 'warning' ? 'status-warning' : 
                       type === 'error' ? 'status-error' : 'status-info';
    statusBar.classList.add(statusClass);
  }
  
  // Limit to 50 entries in UI
  if (logContainer) {
    const entries = logContainer.querySelectorAll('.log-entry');
    if (entries.length > 50) {
      entries[0].remove();
    }
  }
}

async function loadConfigLogs() {
  const logContainer = document.getElementById('config-log');
  if (!logContainer) return;
  
  try {
    // Read the last 50 lines from the log file
    const result = await cockpit.spawn(['tail', '-n', '50', '/var/log/xavs/globals-config.log'], { 
      superuser: 'require', 
      err: 'ignore' 
    });
    
    if (result && result.trim()) {
      // Clear existing logs
      logContainer.innerHTML = '';
      
      const lines = result.trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          const match = line.match(/^(\S+)\s+\[(\w+)\]\s+(.+)$/);
          if (match) {
            const [, fullTimestamp, type, message] = match;
            const timestamp = new Date(fullTimestamp).toLocaleTimeString('en-US', { 
              hour12: false, 
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit' 
            });
            
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${type.toLowerCase()}`;
            logEntry.innerHTML = `
              <span class="log-time">${timestamp}</span>
              <span class="log-message">${message}</span>
            `;
            
            logContainer.appendChild(logEntry);
          }
        }
      });
      
      // Auto-scroll to bottom
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  } catch (error) {
    console.warn('Failed to load persistent logs:', error);
    // Add a local log entry about the issue
    if (logContainer.children.length === 0) {
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry log-info';
      logEntry.innerHTML = `
        <span class="log-time">${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <span class="log-message">Configuration logs initialized</span>
      `;
      logContainer.appendChild(logEntry);
    }
  }
}

async function clearConfigLog() {
  try {
    // Clear the persistent log file
    await cockpit.spawn(['truncate', '-s', '0', '/var/log/xavs/globals-config.log'], { 
      superuser: 'require', 
      err: 'ignore' 
    });
  } catch (error) {
    console.warn('Failed to clear persistent log:', error);
  }
  
  const logContainer = document.getElementById('config-log');
  if (logContainer) {
    logContainer.innerHTML = '';
    await addConfigLog('Log cleared', 'info');
  }
}

function setupStorageRedirectButton() {
  // Use event delegation to handle dynamically created button
  document.addEventListener('click', async function(e) {
    if (e.target && (e.target.id === 'storage-redirect-btn' || e.target.closest('#storage-redirect-btn'))) {
      e.preventDefault();
      e.stopPropagation();
      
      try {
        if (typeof cockpit !== 'undefined' && cockpit.jump) {
          cockpit.jump('/storage');
          await addConfigLog('Redirected to Storage module for LVM configuration', 'info');
        } else {
          // Fallback: open in new tab
          const currentOrigin = window.location.origin;
          const storageUrl = `${currentOrigin}/storage`;
          window.open(storageUrl, '_blank');
          await addConfigLog('Opened Storage module in new tab', 'info');
        }
      } catch (error) {
        console.error('Failed to redirect to storage:', error);
        await addConfigLog('Failed to redirect to Storage module', 'error');
      }
    }
  });
}

function debugValidation() {
  console.log('=== VALIDATION DEBUG ===');
  
  const formValues = {};
  const inputs = formGenerator.container.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    const parts = (input.name || '').split('_');
    if (parts.length >= 2) {
      const section = parts[0];
      const key = parts.slice(1).join('_');
      const value = input.classList.contains('switch-input') ? (input.checked ? 'yes' : 'no') : input.value;
      formValues[`${section}.${key}`] = value;
    }
  });
  
  console.log('Form Values:', formValues);
  console.log('Cinder enabled:', formValues['storage.enable_cinder']);
  
  const validation = validateAllFields();
  console.log('Validation result:', validation);
  
  if (!validation.isValid) {
    console.log('Fields with errors:');
    validation.errors.forEach(error => {
      console.log(`- ${error.field} (${error.label}): ${error.errors.join(', ')}`);
    });
  }
  
  // Check which fields have error styling
  const errorFields = document.querySelectorAll('.field-required');
  console.log('Fields with error styling:', Array.from(errorFields).map(f => f.id || f.name));
}

function clearTabErrorIfNoErrors(field) {
  // Find which tab this field belongs to
  const tabPane = field.closest('.tab-pane');
  if (tabPane) {
    // Check if there are any other required fields with errors in this tab
    const errorsInTab = tabPane.querySelectorAll('.field-required');
    if (errorsInTab.length === 0) {
      const tabId = tabPane.id.replace('-pane', '-tab');
      const tab = document.getElementById(tabId);
      if (tab) {
        tab.classList.remove('tab-has-error');
      }
    }
  }
}

function refreshValidationAfterToggleChange() {
  // Re-run validation to clear any stale error states
  setTimeout(() => {
    const validation = validateAllFields();
    updateSaveButtonState();
    
    // Update tab error indicators
    Object.keys(CONFIG_SCHEMA).forEach(sectionKey => {
      const tabId = `${sectionKey}-tab`;
      const tab = document.getElementById(tabId);
      const tabPane = document.getElementById(`${sectionKey}-pane`);
      
      if (tab && tabPane) {
        const hasErrors = tabPane.querySelectorAll('.field-required').length > 0;
        if (hasErrors) {
          tab.classList.add('tab-has-error');
        } else {
          tab.classList.remove('tab-has-error');
        }
      }
    });
  }, 50);
}

/* ===================== ENHANCED STATUS FUNCTION ===================== */
function setupEventListeners() {
  document.getElementById('save')?.addEventListener('click', (e) => { 
    // Check if button is disabled
    if (e.target.disabled || e.target.classList.contains('btn-disabled')) {
      e.preventDefault();
      e.stopPropagation();
      
      // Show validation popup
      const validation = validateAllFields();
      if (!validation.isValid) {
        let errorMessage = 'Please fill out required details first:\n\n';
        validation.errors.forEach(error => {
          errorMessage += `• ${error.label}: ${error.errors.join(', ')}\n`;
        });
        
        // Create a modal instead of alert
        showValidationModal(errorMessage);
        return false;
      }
    }
    
    addConfigLog('Saving configuration...', 'info');
    saveConfiguration().catch(console.error); 
  });
  document.getElementById('load_config_btn')?.addEventListener('click', () => { 
    addConfigLog('Loading configuration...', 'info');
    loadSavedConfiguration().catch(console.error); 
  });
  document.getElementById('preview_config_btn')?.addEventListener('click', () => { previewConfiguration(); });
  document.getElementById('download_config_btn')?.addEventListener('click', (e) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    addConfigLog('Generating download...', 'info');
    downloadConfiguration(); 
  });
  document.getElementById('reset_config_btn')?.addEventListener('click', () => { resetToDefaults(); });
  
  // Setup dropdown functionality
  setupDropdownMenus();
  
  // Setup responsive footer
  setupResponsiveFooter();
  
  // Setup clear log button
  document.getElementById('clear-log-btn')?.addEventListener('click', clearConfigLog);
  
  // Setup tab functionality
  setupTabFunctionality();
  
  // Setup view logs button
  document.getElementById('view-logs-btn')?.addEventListener('click', () => {
    switchToLogsTab();
  });

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

/* ===================== TAB FUNCTIONALITY ===================== */
function setupTabFunctionality() {
  // The tabs are already handled by the existing form generator
  // No additional setup needed for the built-in tab system
}

function switchToTab(activeTab, configTab, logsTab, configPane, logsPane) {
  // Not needed - using original tab system
}

function switchToLogsTab() {
  // Switch to the logs tab using the original tab system
  const logsTab = document.getElementById('logs-tab');
  if (logsTab) {
    logsTab.click();
  }
}

function showValidationModal(message) {
  // Remove existing modal if any
  const existingModal = document.getElementById('validationModal');
  if (existingModal) existingModal.remove();
  
  const html = `
    <div class="modal" id="validationModal" role="dialog" aria-modal="true" style="z-index:11000;">
      <div class="modal-content" style="border-radius:12px;border:1px solid #ef4444;max-width:500px;">
        <div class="modal-body" style="padding:20px;">
          <h5 style="color:#ef4444;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
            <i class="fas fa-exclamation-triangle"></i>
            Validation Required
          </h5>
          <div style="white-space:pre-line;font-size:14px;line-height:1.5;">${message}</div>
        </div>
        <div class="modal-foot" style="border-top:1px solid var(--border,#d1d5db);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;">
          <button class="btn btn-brand" id="validation_ok_modal">Understood</button>
        </div>
      </div>
    </div>`;
  
  document.body.insertAdjacentHTML('beforeend', html);
  const modal = document.getElementById('validationModal');
  
  const close = () => { modal.remove(); };
  document.getElementById('validation_ok_modal')?.addEventListener('click', close, { once: true });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
}

/* ===================== RESPONSIVE FOOTER ===================== */
function setupResponsiveFooter() {
  const footer = document.querySelector('.footer-actions');
  if (!footer) return;
  
  function adjustFooterPosition() {
    const viewportHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const footerHeight = footer.offsetHeight;
    const statusBarHeight = 64; // Height of bottom status bar
    
    // Check if page is scrollable
    const isScrollable = documentHeight > viewportHeight;
    
    // Check if user is near bottom
    const distanceFromBottom = documentHeight - (scrollTop + viewportHeight);
    const nearBottom = distanceFromBottom < footerHeight + statusBarHeight + 20;
    
    if (isScrollable && !nearBottom) {
      // Page is scrollable and user not near bottom - use sticky positioning
      footer.style.position = 'sticky';
      footer.style.bottom = `${statusBarHeight}px`;
      footer.style.background = 'var(--surface)';
      footer.style.zIndex = '999';
    } else if (!isScrollable || nearBottom) {
      // Page fits in viewport or user is near bottom - use relative positioning
      footer.style.position = 'relative';
      footer.style.bottom = 'auto';
      footer.style.background = 'var(--surface)';
      footer.style.zIndex = '999';
    }
  }
  
  // Adjust on scroll and resize
  window.addEventListener('scroll', adjustFooterPosition);
  window.addEventListener('resize', adjustFooterPosition);
  
  // Initial adjustment
  setTimeout(adjustFooterPosition, 100);
  
  // Readjust when form content changes (visibility changes)
  const observer = new MutationObserver(() => {
    setTimeout(adjustFooterPosition, 100);
  });
  
  const container = document.getElementById('dynamic_form_container');
  if (container) {
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    });
  }
}

/* ===================== DROPDOWN MENUS ===================== */
function setupDropdownMenus() {
  // Setup actions dropdown
  const actionsBtn = document.querySelector('.dropdown-toggle');
  const actionsMenu = document.querySelector('.dropdown-menu');
  
  if (actionsBtn && actionsMenu) {
    // Toggle dropdown on button click
    actionsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      actionsMenu.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!actionsBtn.contains(e.target) && !actionsMenu.contains(e.target)) {
        actionsMenu.classList.remove('show');
      }
    });
    
    // Handle dropdown item clicks
    actionsMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      
      e.preventDefault();
      actionsMenu.classList.remove('show');
      
      // Handle different actions based on text content
      const text = item.textContent.trim();
      if (text.includes('Load Configuration')) {
        loadSavedConfiguration().catch(console.error);
      } else if (text.includes('Preview YAML')) {
        previewConfiguration();
      } else if (text.includes('Export YAML')) {
        downloadConfiguration();
      }
    });
  }
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
    addConfigLog('Configuration downloaded', 'success');
  } catch (e) {
    console.error('Download failed:', e);
    showStatus('Failed to download configuration: ' + e.message, 'danger');
  }
}

async function loadSavedConfiguration() {
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
        addConfigLog('Configuration loaded successfully', 'success');
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
    'enable_cinder_backup': 'storage',
    'enable_cinder_backend_lvm': 'storage',
    'enable_cinder_backend_ceph': 'storage',
    'enable_cinder_backend_nfs': 'storage',
    'enable_cinder_backend_iscsi': 'storage',
    'enable_cinder_backend_vmware_vmdk': 'storage',
    'enable_cinder_backend_vmware_vstorage': 'storage',
    'enable_cinder_backend_pure_iscsi': 'storage',
    'enable_cinder_backend_pure_fc': 'storage',
    'cinder_volume_group': 'storage',
    'cinder_backend_lvm_name': 'storage',
    'cinder_backend_ceph_name': 'storage',
    'cinder_backend_nfs_name': 'storage',
    'ceph_cinder_pool_name': 'storage',
    'ceph_cinder_user': 'storage',
    'vmware_vcenter_host_ip': 'storage',
    'vmware_vcenter_host_username': 'storage',
    'vmware_vcenter_host_password': 'storage',
    'vmware_vcenter_cluster_name': 'storage',
    'pure_api_token': 'storage',
    'pure_san_ip': 'storage',
    'cinder_backup_driver': 'storage',
    'ceph_backup_pool_name': 'storage',
    'cinder_backup_share': 'storage',
    'cinder_backup_s3_url': 'storage',
    'cinder_backup_s3_bucket': 'storage',
    'cinder_enable_conversion_tmpfs': 'storage',
    'cinder_api_workers': 'storage',
    'enable_redis_for_coordination': 'storage',
    'enable_cinder_backend_lvm': 'storage',
    'enable_cinder_backend_nfs': 'storage',
    'nfs_share_path': 'storage',

    // monitoring
    'enable_prometheus': 'monitoring',
    'enable_grafana': 'monitoring',
    'enable_central_logging': 'monitoring',

    // loadbalancer
    'enable_octavia': 'loadbalancer',
    'enable_horizon_octavia': 'loadbalancer',
    'enable_redis': 'loadbalancer',
    'octavia_provider_drivers': 'loadbalancer',
    'octavia_provider_agents': 'loadbalancer',
    'octavia_auto_configure': 'loadbalancer',
    'octavia_network_type': 'loadbalancer',
    'octavia_network_interface': 'loadbalancer',
    'octavia_loadbalancer_topology': 'loadbalancer',
    'octavia_enable_tls_backend': 'loadbalancer',
    'octavia_certs_country': 'loadbalancer',
    'octavia_certs_state': 'loadbalancer',
    'octavia_certs_organization': 'loadbalancer',
    'octavia_amp_network': 'loadbalancer',
    'octavia_amp_flavor': 'loadbalancer',

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
        if (Array.isArray(field.visibleWhen)) {
          // Multiple conditions - ALL must be true
          show = field.visibleWhen.every(condition => {
            const depVal = values[`${sectionKey}.${condition.field}`] || '';
            if (condition.equals === '__NONEMPTY__') {
              return depVal.trim() !== '';
            } else {
              return (depVal === condition.equals);
            }
          });
        } else {
          // Single condition
          const depVal = values[`${sectionKey}.${field.visibleWhen.field}`] || '';
          if (field.visibleWhen.equals === '__NONEMPTY__') {
            show = depVal.trim() !== '';
          } else {
            show = (depVal === field.visibleWhen.equals);
          }
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
    
    // List of system interfaces to filter out
    const systemInterfaces = [
      'lo',           // loopback
      'docker0',      // docker bridge
      'br-',          // docker/libvirt bridges (starts with br-)
      'virbr',        // libvirt bridges (starts with virbr)
      'veth',         // virtual ethernet (starts with veth)
      'tap',          // tap interfaces (starts with tap)
      'tun',          // tunnel interfaces (starts with tun)
      'kube',         // kubernetes interfaces (starts with kube)
      'flannel',      // flannel interfaces (starts with flannel)
      'cni',          // container network interfaces (starts with cni)
      'weave',        // weave interfaces (starts with weave)
      'vxlan'         // vxlan interfaces (starts with vxlan)
    ];
    
    let nics = out.trim().split('\n').map(s => s.trim()).filter(Boolean)
      .map(n => n.replace(/:$/, ''))
      .filter(n => {
        // Filter out system interfaces
        return !systemInterfaces.some(sysIntf => 
          n === sysIntf || n.startsWith(sysIntf)
        );
      });
      
    if (!nics.length) throw new Error('no usable network interfaces found');
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
  if (CONFIG_SCHEMA.loadbalancer?.fields?.octavia_network_interface) {
    CONFIG_SCHEMA.loadbalancer.fields.octavia_network_interface.options = nics;
    CONFIG_SCHEMA.loadbalancer.fields.octavia_network_interface.default = '';
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

function updateOctaviaProviderAgents() {
  const driverEl = document.getElementById('loadbalancer_octavia_provider_drivers');
  const agentEl = document.getElementById('loadbalancer_octavia_provider_agents');
  
  if (!driverEl || !agentEl) return;
  
  const selectedDrivers = driverEl.value;
  let agents = '';
  
  // Map provider drivers to appropriate agents
  if (selectedDrivers.includes('amphora') && selectedDrivers.includes('ovn')) {
    agents = 'amphora_agent, ovn';
  } else if (selectedDrivers.includes('amphora')) {
    agents = 'amphora_agent';
  } else if (selectedDrivers.includes('ovn')) {
    agents = 'ovn';
  }
  
  agentEl.value = agents;
  
  // Also update Redis requirement for Amphora
  const redisEl = document.getElementById('loadbalancer_enable_redis');
  if (redisEl && selectedDrivers.includes('amphora')) {
    redisEl.checked = true;
    redisEl.value = 'yes';
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
        updateOctaviaProviderAgents();
        await updateVGOptionsAndHint();
        evaluateVisibility(formGenerator.container, CONFIG_SCHEMA);
        wireFlatSwitches();
        addConfigLog('Configuration reset to defaults', 'success');
      });
    }
  }
}

window.saveConfiguration        = saveConfiguration;
window.previewConfiguration     = previewConfiguration;
window.downloadConfiguration    = downloadConfiguration;
window.loadSavedConfiguration   = loadSavedConfiguration;
window.resetToDefaults          = resetToDefaults;
window.debugValidation          = debugValidation;
