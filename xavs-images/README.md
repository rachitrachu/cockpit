# xAVS Docker Images Management

A Cockpit module for managing Docker images from Xloud repository and configuring local Docker registry for xAVS deployments.

## Features

- **🐳 Docker Registry Management** - Start/stop local registry on port 4000
- **📦 Image Operations** - Pull from Xloud repository, push to local registry  
- **⚙️ Configuration Management** - Automatic Docker daemon setup for insecure registries
- **📝 Images List Management** - Manage hardcoded list of xAVS deployment images
- **🗑️ Registry Cleanup** - Clear registry content or delete entire registry with volumes
- **📊 Registry Analytics** - View registry info, storage usage, and performance stats
- **🎨 Modern Interface** - Professional web UI with real-time feedback
- **🔒 Safety Features** - Confirmation dialogs for destructive operations

## Installation

1. **Copy module to Cockpit**:
   ```bash
   sudo cp -r xavs-images /usr/share/cockpit/
   ```

2. **Restart Cockpit**:
   ```bash
   sudo systemctl restart cockpit
   ```

3. **Access via web browser**:
   ```
   https://your-server:9090
   ```

## Usage

1. **Navigate** to Applications → xAVS Images in Cockpit
2. **Configure** Docker daemon for insecure registry (Configuration tab)
3. **Manage Registry** - Start registry, push images, and browse catalog (Registry Management tab)
4. **Pull Images** from Xloud repository (Extract/Pull tab)
5. **Monitor Operations** through comprehensive logging (Logs tab)

### Registry Management (Unified Tab)

The Registry Management tab provides a complete workflow for Docker registry operations:

**Registry Control**:
- **Start/Stop Registry**: Manage local Docker registry container
- **Status Monitoring**: Real-time registry health checks
- **Docker Service**: Restart Docker daemon when needed

**Image Operations**:
- **Smart Push**: Automatically detects and pushes available Docker images
- **Progress Tracking**: Real-time progress bars and detailed logging
- **Automatic Tagging**: Images are properly tagged for local registry

**Registry Catalog**:
- **Browse Contents**: View all images stored in the registry
- **Inspect Images**: Get detailed information about stored images
- **Real-time Updates**: Catalog refreshes after push operations

**Information & Analytics**:
- **Registry Info**: View container details, performance stats, network configuration
- **Storage Usage**: Analyze disk usage, volume sizes, and data distribution

**Maintenance Operations**:
- **Clear Content**: Remove all images but keep registry container running
- **Delete Registry**: Completely remove registry container, volumes, and all data

⚠️ **Safety Features**: All destructive operations require explicit confirmation

## Default Images

The module includes a comprehensive list of **70+ Kolla container images** for xAVS OpenStack deployment:

### Core Services
- **Identity**: keystone, keystone-fernet, keystone-ssh
- **Compute**: nova-api, nova-conductor, nova-scheduler, nova-compute, nova-libvirt, nova-novncproxy, nova-ssh
- **Networking**: neutron-server, neutron-dhcp-agent, neutron-l3-agent, neutron-metadata-agent, neutron-openvswitch-agent, neutron-bgp-dragent, neutron-metering-agent
- **Storage**: cinder-api, cinder-scheduler, cinder-volume, cinder-backup, glance-api
- **Dashboard**: horizon
- **Database**: mariadb-server, mariadb-clustercheck, memcached, rabbitmq
- **Orchestration**: heat-api, heat-engine, heat-api-cfn
- **Placement**: placement-api

### Advanced Services
- **Telemetry**: ceilometer-compute, ceilometer-central, ceilometer-notification, ceilometer-ipmi, ceilometer-base
- **Metrics**: gnocchi-api, gnocchi-metricd, gnocchi-statsd, gnocchi-base
- **Alarming**: aodh-api, aodh-notifier, aodh-evaluator, aodh-listener, aodh-expirer, aodh-base
- **Instance HA**: masakari-api, masakari-engine, masakari-monitors, masakari-base
- **Infrastructure Optimization**: watcher-api, watcher-applier, watcher-engine
- **Multi-cloud Dashboard**: skyline-apiserver, skyline-console
- **Key Management**: barbican-api, barbican-keystone-listener, barbican-worker, barbican-base

### Infrastructure Components
- **High Availability**: hacluster-pacemaker, hacluster-corosync, hacluster-base, hacluster-pcs, keepalived, haproxy
- **Networking**: openvswitch-vswitchd, openvswitch-db-server, ovn-controller, ovn-northd, ovn-sb-db-server, ovn-nb-db-server
- **Storage**: iscsid, tgtd
- **Utilities**: kolla-toolbox, fluentd, cron

The complete list is maintained in `images-list.txt` and can be customized for specific deployment requirements.

## Requirements

- **Cockpit** 200+ 
- **Docker** 20.10+
- **Root privileges** for Docker operations

## Architecture

Built using **pure Cockpit APIs** with modular image list management:
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Cockpit's native `spawn()` and `file()` APIs
- **Icons**: FontAwesome (bundled)
- **Images List**: External `images-list.txt` file dynamically loaded
- **No external dependencies**: Pure Cockpit implementation

## Security

- Uses Cockpit's built-in authentication and privilege escalation
- All shell commands are properly escaped for security
- File operations use Cockpit's permission-aware file API
- Supports standard Cockpit multi-user access controls

## Configuration Files

- **Images List Template**: `/usr/share/cockpit/xavs-images/images-list.txt`
- **Runtime Images List**: `/etc/xavs/images.list` (generated from template)
- **Docker Config**: `/etc/docker/daemon.json`
- **Registry Data**: Docker volume `registry:/var/lib/registry`

## Support

- **Version**: 1.0.0
- **License**: MIT
- **Compatibility**: xAVS 2024.1+

---

For detailed documentation, see the `docs/` directory.
