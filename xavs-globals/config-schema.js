/* 
 * XAVS Globals Configuration Schema
 * Complete schema for all.yml configurations
 */

// Configuration schema organized by categories
const CONFIG_SCHEMA = {
    // Network Configuration
    network: {
        title: 'Network Configuration',
        fields: {
            network_interface: {
                type: 'text',
                label: 'Management Network Interface',
                description: 'Primary network interface for OpenStack management',
                default: 'eth0',
                required: true,
                validation: /^[a-zA-Z0-9-_.]+$/
            },
            kolla_internal_vip_address: {
                type: 'text',
                label: 'Internal VIP Address',
                description: 'Virtual IP address for internal OpenStack services',
                required: true,
                validation: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
            },
            kolla_external_vip_address: {
                type: 'text',
                label: 'External VIP Address',
                description: 'Virtual IP address for external OpenStack access',
                required: false,
                validation: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
            },
            neutron_external_interface: {
                type: 'text',
                label: 'Neutron External Interface',
                description: 'Network interface for external Neutron connectivity',
                default: 'eth1',
                required: false,
                validation: /^[a-zA-Z0-9-_.]+$/
            },
            api_interface: {
                type: 'text',
                label: 'API Interface',
                description: 'Interface for OpenStack API services',
                default: '{{ network_interface }}',
                required: false
            },
            tunnel_interface: {
                type: 'text',
                label: 'Tunnel Interface',
                description: 'Interface for tenant network tunnels',
                default: '{{ network_interface }}',
                required: false
            },
            neutron_plugin_agent: {
                type: 'select',
                label: 'Neutron Plugin Agent',
                description: 'Neutron networking backend',
                default: 'openvswitch',
                options: [
                    { value: 'openvswitch', label: 'Open vSwitch' },
                    { value: 'ovn', label: 'OVN (Open Virtual Network)' },
                    { value: 'linuxbridge', label: 'Linux Bridge (Experimental)' },
                    { value: 'vmware_nsxv', label: 'VMware NSX-V' },
                    { value: 'vmware_nsxv3', label: 'VMware NSX-T' },
                    { value: 'vmware_nsxp', label: 'VMware NSX Policy' },
                    { value: 'vmware_dvs', label: 'VMware DVS' }
                ]
            }
        }
    },

    // Container Configuration
    container: {
        title: 'Container Configuration',
        fields: {
            kolla_base_distro: {
                type: 'select',
                label: 'Base Distribution',
                description: 'Base Linux distribution for containers',
                default: 'rocky',
                options: [
                    { value: 'centos', label: 'CentOS' },
                    { value: 'debian', label: 'Debian' },
                    { value: 'rocky', label: 'Rocky Linux' },
                    { value: 'ubuntu', label: 'Ubuntu' }
                ]
            },
            kolla_container_engine: {
                type: 'select',
                label: 'Container Engine',
                description: 'Container runtime engine',
                default: 'docker',
                options: [
                    { value: 'docker', label: 'Docker' },
                    { value: 'podman', label: 'Podman' }
                ]
            },
            docker_registry: {
                type: 'text',
                label: 'Docker Registry',
                description: 'Container registry URL',
                default: 'quay.io',
                required: false
            },
            docker_namespace: {
                type: 'text',
                label: 'Docker Namespace',
                description: 'Container registry namespace',
                default: 'openstack.kolla',
                required: false
            },
            docker_restart_policy: {
                type: 'select',
                label: 'Container Restart Policy',
                description: 'Container restart behavior',
                default: 'unless-stopped',
                options: [
                    { value: 'no', label: 'Never restart' },
                    { value: 'on-failure', label: 'Restart on failure' },
                    { value: 'always', label: 'Always restart' },
                    { value: 'unless-stopped', label: 'Restart unless stopped' }
                ]
            }
        }
    },

    // OpenStack Configuration
    openstack: {
        title: 'OpenStack Configuration',
        fields: {
            openstack_release: {
                type: 'select',
                label: 'OpenStack Release',
                description: 'OpenStack version to deploy',
                default: '2024.1',
                options: [
                    { value: '2024.2', label: 'Dalmatian (2024.2)' },
                    { value: '2024.1', label: 'Caracal (2024.1)' },
                    { value: '2023.2', label: 'Bobcat (2023.2)' },
                    { value: '2023.1', label: 'Antelope (2023.1)' }
                ]
            },
            openstack_region_name: {
                type: 'text',
                label: 'Region Name',
                description: 'OpenStack region identifier',
                default: 'RegionOne',
                required: false
            },
            openstack_logging_debug: {
                type: 'boolean',
                label: 'Enable Debug Logging',
                description: 'Enable debug-level logging for OpenStack services',
                default: false
            }
        }
    },

    // Database Configuration
    database: {
        title: 'Database Configuration',
        fields: {
            database_user: {
                type: 'text',
                label: 'Database User',
                description: 'Database root user',
                default: 'root',
                required: false
            },
            database_port: {
                type: 'number',
                label: 'Database Port',
                description: 'MariaDB/MySQL port',
                default: 3306,
                min: 1024,
                max: 65535
            },
            database_max_pool_size: {
                type: 'number',
                label: 'Database Max Pool Size',
                description: 'Maximum database connection pool size',
                default: 1,
                min: 1,
                max: 100
            },
            mariadb_datadir_volume: {
                type: 'text',
                label: 'MariaDB Data Volume',
                description: 'Volume name for MariaDB data directory',
                default: 'mariadb',
                required: false
            }
        }
    },

    // Messaging Configuration
    messaging: {
        title: 'Messaging Configuration',
        fields: {
            om_rpc_transport: {
                type: 'select',
                label: 'RPC Transport',
                description: 'Oslo.messaging RPC transport',
                default: 'rabbit',
                options: [
                    { value: 'rabbit', label: 'RabbitMQ' },
                    { value: 'amqp', label: 'AMQP' }
                ]
            },
            rabbitmq_user: {
                type: 'text',
                label: 'RabbitMQ User',
                description: 'RabbitMQ username',
                default: 'openstack',
                required: false
            },
            rabbitmq_port: {
                type: 'number',
                label: 'RabbitMQ Port',
                description: 'RabbitMQ port (5672 for plain, 5671 for TLS)',
                default: 5672,
                min: 1024,
                max: 65535
            }
        }
    },

    // Security Configuration
    security: {
        title: 'Security Configuration',
        fields: {
            kolla_enable_tls_external: {
                type: 'boolean',
                label: 'Enable External TLS',
                description: 'Enable TLS encryption for external API access',
                default: false
            },
            kolla_enable_tls_internal: {
                type: 'boolean',
                label: 'Enable Internal TLS',
                description: 'Enable TLS encryption for internal communications',
                default: false
            },
            kolla_external_fqdn_cert: {
                type: 'text',
                label: 'External Certificate Path',
                description: 'Path to TLS certificate for external access',
                default: '/etc/ssl/certs/haproxy.pem',
                required: false
            },
            kolla_copy_ca_into_containers: {
                type: 'boolean',
                label: 'Copy CA into Containers',
                description: 'Copy CA certificates into service containers',
                default: false
            }
        }
    },

    // Storage Configuration
    storage: {
        title: 'Storage Configuration',
        fields: {
            cinder_volume_group: {
                type: 'text',
                label: 'Cinder Volume Group',
                description: 'LVM volume group for Cinder block storage',
                default: 'cinder-volumes',
                required: false
            },
            swift_storage_interface: {
                type: 'text',
                label: 'Swift Storage Interface',
                description: 'Network interface for Swift object storage',
                default: '{{ network_interface }}',
                required: false
            },
            manila_api_port: {
                type: 'number',
                label: 'Manila API Port',
                description: 'Port for Manila shared filesystem service',
                default: 8786,
                min: 1024,
                max: 65535
            }
        }
    },

    // Monitoring Configuration
    monitoring: {
        title: 'Monitoring Configuration',
        fields: {
            prometheus_port: {
                type: 'number',
                label: 'Prometheus Port',
                description: 'Port for Prometheus monitoring service',
                default: 9091,
                min: 1024,
                max: 65535
            },
            grafana_server_port: {
                type: 'number',
                label: 'Grafana Port',
                description: 'Port for Grafana dashboard service',
                default: 3000,
                min: 1024,
                max: 65535
            },
            enable_container_healthchecks: {
                type: 'boolean',
                label: 'Enable Container Healthchecks',
                description: 'Enable health monitoring for containers',
                default: true
            },
            default_container_healthcheck_interval: {
                type: 'number',
                label: 'Healthcheck Interval (seconds)',
                description: 'Interval between container health checks',
                default: 30,
                min: 5,
                max: 300
            }
        }
    },

    // Service Ports Configuration
    ports: {
        title: 'Service Ports',
        fields: {
            keystone_public_listen_port: {
                type: 'number',
                label: 'Keystone Public Port',
                description: 'Port for Keystone identity service (public)',
                default: 5000,
                min: 1024,
                max: 65535
            },
            keystone_internal_port: {
                type: 'number',
                label: 'Keystone Internal Port',
                description: 'Port for Keystone identity service (internal)',
                default: 5000,
                min: 1024,
                max: 65535
            },
            glance_api_port: {
                type: 'number',
                label: 'Glance API Port',
                description: 'Port for Glance image service',
                default: 9292,
                min: 1024,
                max: 65535
            },
            nova_api_port: {
                type: 'number',
                label: 'Nova API Port',
                description: 'Port for Nova compute service',
                default: 8774,
                min: 1024,
                max: 65535
            },
            neutron_server_port: {
                type: 'number',
                label: 'Neutron Server Port',
                description: 'Port for Neutron networking service',
                default: 9696,
                min: 1024,
                max: 65535
            },
            cinder_api_port: {
                type: 'number',
                label: 'Cinder API Port',
                description: 'Port for Cinder block storage service',
                default: 8776,
                min: 1024,
                max: 65535
            },
            heat_api_port: {
                type: 'number',
                label: 'Heat API Port',
                description: 'Port for Heat orchestration service',
                default: 8004,
                min: 1024,
                max: 65535
            },
            horizon_port: {
                type: 'number',
                label: 'Horizon Port',
                description: 'Port for Horizon dashboard (HTTP)',
                default: 80,
                min: 80,
                max: 65535
            },
            horizon_tls_port: {
                type: 'number',
                label: 'Horizon TLS Port',
                description: 'Port for Horizon dashboard (HTTPS)',
                default: 443,
                min: 443,
                max: 65535
            }
        }
    },

    // Advanced Configuration
    advanced: {
        title: 'Advanced Configuration',
        fields: {
            openstack_service_workers: {
                type: 'number',
                label: 'Service Workers',
                description: 'Number of worker processes per service',
                default: 5,
                min: 1,
                max: 32
            },
            keepalived_virtual_router_id: {
                type: 'number',
                label: 'Keepalived Virtual Router ID',
                description: 'Unique router ID for keepalived (0-255)',
                default: 51,
                min: 0,
                max: 255
            },
            haproxy_stats_port: {
                type: 'number',
                label: 'HAProxy Stats Port',
                description: 'Port for HAProxy statistics interface',
                default: 1984,
                min: 1024,
                max: 65535
            },
            docker_client_timeout: {
                type: 'number',
                label: 'Docker Client Timeout',
                description: 'Docker client timeout in seconds',
                default: 120,
                min: 30,
                max: 600
            }
        }
    }
};

// Service enable/disable options
const SERVICE_SCHEMA = {
    // Core Services
    core: {
        title: 'Core OpenStack Services',
        services: {
            enable_openstack_core: {
                label: 'Enable OpenStack Core',
                description: 'Enable core OpenStack services (Keystone, Glance, Nova, Neutron, Heat, Horizon)',
                default: true,
                affects: ['enable_glance', 'enable_keystone', 'enable_neutron', 'enable_nova', 'enable_heat', 'enable_horizon']
            },
            enable_keystone: {
                label: 'Keystone (Identity Service)',
                description: 'OpenStack identity and authentication service',
                default: true,
                dependsOn: ['enable_openstack_core']
            },
            enable_glance: {
                label: 'Glance (Image Service)',
                description: 'OpenStack image repository and management service',
                default: true,
                dependsOn: ['enable_openstack_core']
            },
            enable_nova: {
                label: 'Nova (Compute Service)',
                description: 'OpenStack compute and virtual machine management',
                default: true,
                dependsOn: ['enable_openstack_core']
            },
            enable_neutron: {
                label: 'Neutron (Networking Service)',
                description: 'OpenStack networking and SDN service',
                default: true,
                dependsOn: ['enable_openstack_core']
            },
            enable_heat: {
                label: 'Heat (Orchestration Service)',
                description: 'OpenStack orchestration and template engine',
                default: true,
                dependsOn: ['enable_openstack_core']
            },
            enable_horizon: {
                label: 'Horizon (Dashboard)',
                description: 'OpenStack web-based management interface',
                default: true,
                dependsOn: ['enable_openstack_core']
            }
        }
    },

    // Storage Services
    storage: {
        title: 'Storage Services',
        services: {
            enable_cinder: {
                label: 'Cinder (Block Storage)',
                description: 'OpenStack block storage service for persistent volumes',
                default: false,
                affects: ['enable_cinder_backup', 'enable_cinder_backend_lvm', 'enable_cinder_backend_iscsi']
            },
            enable_cinder_backend_lvm: {
                label: 'Cinder LVM Backend',
                description: 'LVM backend for Cinder block storage',
                default: false,
                dependsOn: ['enable_cinder']
            },
            enable_cinder_backup: {
                label: 'Cinder Backup Service',
                description: 'Backup service for Cinder volumes',
                default: true,
                dependsOn: ['enable_cinder']
            },
            enable_swift: {
                label: 'Swift (Object Storage)',
                description: 'OpenStack object storage service',
                default: false,
                affects: ['enable_swift_s3api', 'enable_swift_recon']
            },
            enable_swift_s3api: {
                label: 'Swift S3 API',
                description: 'Amazon S3 compatible API for Swift',
                default: false,
                dependsOn: ['enable_swift']
            },
            enable_manila: {
                label: 'Manila (Shared Filesystems)',
                description: 'OpenStack shared filesystem service',
                default: false,
                affects: ['enable_manila_backend_generic', 'enable_manila_backend_cephfs_native']
            }
        }
    },

    // Network Services
    networking: {
        title: 'Networking Services',
        services: {
            enable_neutron_dvr: {
                label: 'Neutron DVR',
                description: 'Distributed Virtual Routing for better network performance',
                default: false,
                dependsOn: ['enable_neutron']
            },
            enable_neutron_vpnaas: {
                label: 'Neutron VPNaaS',
                description: 'VPN as a Service for secure site-to-site connections',
                default: false,
                dependsOn: ['enable_neutron']
            },
            enable_neutron_fwaas: {
                label: 'Neutron FWaaS',
                description: 'Firewall as a Service for network security',
                default: false,
                dependsOn: ['enable_neutron']
            },
            enable_neutron_qos: {
                label: 'Neutron QoS',
                description: 'Quality of Service for network bandwidth management',
                default: false,
                dependsOn: ['enable_neutron']
            },
            enable_neutron_provider_networks: {
                label: 'Provider Networks',
                description: 'Direct access to external networks',
                default: false,
                dependsOn: ['enable_neutron']
            },
            enable_octavia: {
                label: 'Octavia (Load Balancer)',
                description: 'Load balancing as a service',
                default: false,
                affects: ['enable_octavia_driver_agent']
            }
        }
    },

    // Additional Services
    additional: {
        title: 'Additional Services',
        services: {
            enable_barbican: {
                label: 'Barbican (Key Management)',
                description: 'Secure key and certificate management service',
                default: false
            },
            enable_designate: {
                label: 'Designate (DNS Service)',
                description: 'DNS as a Service for domain management',
                default: false
            },
            enable_magnum: {
                label: 'Magnum (Container Orchestration)',
                description: 'Container orchestration engine API',
                default: false,
                affects: ['enable_horizon_magnum']
            },
            enable_trove: {
                label: 'Trove (Database Service)',
                description: 'Database as a Service platform',
                default: false,
                affects: ['enable_horizon_trove']
            },
            enable_ironic: {
                label: 'Ironic (Bare Metal)',
                description: 'Bare metal provisioning service',
                default: false,
                affects: ['enable_ironic_neutron_agent', 'enable_horizon_ironic']
            },
            enable_zun: {
                label: 'Zun (Container Service)',
                description: 'Container management service',
                default: false,
                affects: ['enable_horizon_zun']
            }
        }
    },

    // Monitoring & Logging
    monitoring: {
        title: 'Monitoring & Logging',
        services: {
            enable_prometheus: {
                label: 'Prometheus (Monitoring)',
                description: 'Time-series monitoring and alerting system',
                default: false,
                affects: ['enable_grafana']
            },
            enable_grafana: {
                label: 'Grafana (Dashboards)',
                description: 'Monitoring dashboards and visualization',
                default: false,
                dependsOn: ['enable_prometheus']
            },
            enable_central_logging: {
                label: 'Central Logging',
                description: 'Centralized log collection and analysis',
                default: false,
                affects: ['enable_opensearch', 'enable_opensearch_dashboards']
            },
            enable_ceilometer: {
                label: 'Ceilometer (Telemetry)',
                description: 'Usage and performance metrics collection',
                default: false,
                affects: ['enable_aodh', 'enable_gnocchi']
            },
            enable_aodh: {
                label: 'Aodh (Alarming)',
                description: 'Alarm and notification service',
                default: false,
                dependsOn: ['enable_ceilometer']
            }
        }
    },

    // Infrastructure Services
    infrastructure: {
        title: 'Infrastructure Services',
        services: {
            enable_haproxy: {
                label: 'HAProxy (Load Balancer)',
                description: 'High availability proxy and load balancer',
                default: true,
                affects: ['enable_keepalived']
            },
            enable_keepalived: {
                label: 'Keepalived (VIP Management)',
                description: 'Virtual IP and failover management',
                default: true,
                dependsOn: ['enable_haproxy']
            },
            enable_mariadb: {
                label: 'MariaDB (Database)',
                description: 'Primary database for OpenStack services',
                default: true
            },
            enable_rabbitmq: {
                label: 'RabbitMQ (Message Queue)',
                description: 'Message queue for service communication',
                default: true
            },
            enable_memcached: {
                label: 'Memcached (Caching)',
                description: 'In-memory caching for improved performance',
                default: true
            },
            enable_redis: {
                label: 'Redis (Key-Value Store)',
                description: 'In-memory data structure store',
                default: false
            },
            enable_etcd: {
                label: 'etcd (Distributed Store)',
                description: 'Distributed key-value store for coordination',
                default: false
            }
        }
    }
};

// Export schemas
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG_SCHEMA, SERVICE_SCHEMA };
} else {
    window.CONFIG_SCHEMA = CONFIG_SCHEMA;
    window.SERVICE_SCHEMA = SERVICE_SCHEMA;
}
