# Cinder Block Storage Configuration Guide
## All Configuration Options for Deployment with Multiple Backends

**Document Version:** 1.0  
**Date:** September 8, 2025  
**Kolla Ansible Version:** stable/2024.1  
**Target Audience:** Deployment Team  

---

## Table of Contents
1. [Overview](#overview)
2. [Basic Configuration](#basic-configuration)
3. [Backend Configuration](#backend-configuration)
4. [Multiple Backend Setup](#multiple-backend-setup)
5. [Backup Configuration](#backup-configuration)
6. [Advanced Configuration](#advanced-configuration)
7. [Performance Tuning](#performance-tuning)
8. [Troubleshooting](#troubleshooting)

---

## 1. Overview

Cinder provides block storage as a service in OpenStack. This guide covers all available configuration options for deploying Cinder with multiple storage backends using Kolla Ansible.

### 1.1 Supported Storage Backends
- **LVM** - Local Logical Volume Manager
- **Ceph RBD** - Ceph RADOS Block Device
- **NFS** - Network File System
- **iSCSI** - External iSCSI storage systems
- **VMware VMDK** - VMware Virtual Machine Disk
- **VMware vSphere** - VMware vStorage Object
- **Hitachi NAS Platform NFS** - Hitachi NFS storage
- **Quobyte** - Quobyte distributed storage
- **Pure Storage** - Pure FlashArray (iSCSI, FC, NVMe-RoCE)

---

## 2. Basic Configuration

### 2.1 Essential Settings (globals.yml)

```yaml
# Enable Cinder Service
enable_cinder: "yes"

# Enable Cinder Backup Service
enable_cinder_backup: "yes"

# Enable iSCSI daemon (required for LVM and external iSCSI)
enable_iscsid: "{{ enable_cinder | bool and enable_cinder_backend_iscsi | bool }}"

# Service Configuration
cinder_keystone_user: "cinder"
cinder_api_port: "8776"
cinder_api_listen_port: "{{ cinder_api_port }}"
cinder_api_public_port: "{{ cinder_api_port }}"

# FQDN Configuration
cinder_internal_fqdn: "{{ kolla_internal_fqdn }}"
cinder_external_fqdn: "{{ kolla_external_fqdn }}"
```

### 2.2 Performance Settings

```yaml
# API Workers
cinder_api_workers: "{{ openstack_service_workers }}"

# TLS Backend
cinder_enable_tls_backend: "{{ kolla_enable_tls_backend }}"

# Coordination Backend (for multiple volume services)
cinder_coordination_backend: "{{ 'redis' if enable_redis | bool else 'etcd' if enable_etcd | bool else '' }}"

# Enable conversion tmpfs for better performance
cinder_enable_conversion_tmpfs: false  # Set to true for better performance

# RPC Version Control
cinder_rpc_version_startup_delay: 30
```

---

## 3. Backend Configuration

### 3.1 LVM Backend

```yaml
# Enable LVM Backend
enable_cinder_backend_lvm: "yes"
enable_cinder_backend_iscsi: "{{ enable_cinder_backend_lvm | bool }}"

# LVM Configuration
cinder_volume_group: "cinder-volumes"
cinder_target_helper: "{{ 'lioadm' if ansible_facts.os_family == 'RedHat' else 'tgtadm' }}"

# Backend Name (optional customization)
cinder_backend_lvm_name: "lvm-1"
```

**Prerequisites for LVM:**
```bash
# Create volume group on storage nodes
pvcreate /dev/sdb /dev/sdc
vgcreate cinder-volumes /dev/sdb /dev/sdc

# For development (file-backed storage)
free_device=$(losetup -f)
fallocate -l 20G /var/lib/cinder_data.img
losetup $free_device /var/lib/cinder_data.img
pvcreate $free_device
vgcreate cinder-volumes $free_device
```

### 3.2 Ceph RBD Backend

```yaml
# Enable Ceph Backend
cinder_backend_ceph: "yes"

# Ceph Configuration
ceph_cinder_pool_name: "volumes"
ceph_cinder_user: "cinder"
ceph_cinder_keyring: "client.{{ ceph_cinder_user }}.keyring"

# Multiple Ceph Clusters (Advanced)
cinder_ceph_backends:
  - name: "rbd-1"
    cluster: "ceph"
    enabled: "{{ cinder_backend_ceph | bool }}"
  - name: "rbd-2"
    cluster: "ceph2"
    availability_zone: "az2"
    enabled: "{{ cinder_backend_ceph | bool }}"

# Backend Name (optional customization)
cinder_backend_ceph_name: "rbd-1"
```

**Required Files:**
- `/etc/kolla/config/cinder/ceph.conf`
- `/etc/kolla/config/cinder/ceph.client.cinder.keyring`

### 3.3 NFS Backend

```yaml
# Enable NFS Backend
enable_cinder_backend_nfs: "yes"

# Backend Name (optional customization)
cinder_backend_nfs_name: "nfs-1"
```

**Required Files:**
- `/etc/kolla/config/cinder/nfs_shares`

**Example nfs_shares file:**
```
storage01:/kolla_nfs
storage02:/kolla_nfs
storage03:/kolla_nfs
```

### 3.4 External iSCSI Backend

```yaml
# Enable External iSCSI Backend
enable_cinder_backend_iscsi: "yes"
enable_cinder_backend_lvm: "no"  # Disable LVM when using external iSCSI
```

### 3.5 VMware Backends

#### VMware VMDK Backend
```yaml
# Enable VMware VMDK Backend
cinder_backend_vmwarevc_vmdk: "yes"

# VMware Configuration (add to globals.yml)
vmware_vcenter_host_ip: "vcenter.example.com"
vmware_vcenter_host_username: "administrator@vsphere.local"
vmware_vcenter_host_password: "password"
vmware_vcenter_cluster_name: "cluster1"

# Backend Name (optional customization)
cinder_backend_vmwarevc_vmdk_name: "vmwarevc-vmdk"
```

#### VMware vStorage Object Backend
```yaml
# Enable VMware vStorage Object Backend
cinder_backend_vmware_vstorage_object: "yes"

# Uses same VMware configuration as VMDK backend
# Backend Name (optional customization)
cinder_backend_vmware_vstorage_object_name: "vmware-vstorage-object"
```

### 3.6 Hitachi NAS Platform NFS Backend

```yaml
# Enable Hitachi NAS Platform NFS Backend
enable_cinder_backend_hnas_nfs: "yes"

# Hitachi Configuration
hnas_nfs_backend: "hnas_nfs_backend"
hnas_nfs_username: "supervisor"
hnas_nfs_password: "supervisor"
hnas_nfs_mgmt_ip0: "192.168.1.100"
hnas_nfs_svc0_volume_type: "nfs"
hnas_nfs_svc0_hdp: "fs-cinder"

# Backend Name (optional customization)
cinder_backend_hnas_nfs_name: "hnas-nfs"
```

### 3.7 Quobyte Backend

```yaml
# Enable Quobyte Backend
enable_cinder_backend_quobyte: "yes"

# Quobyte Configuration
quobyte_storage_host: "quobyte.example.com"
quobyte_storage_volume: "cinder-volumes"

# Backend Name (optional customization)
cinder_backend_quobyte_name: "QuobyteHD"
```

### 3.8 Pure Storage Backends

#### Pure Storage iSCSI
```yaml
# Enable Pure Storage iSCSI Backend
enable_cinder_backend_pure_iscsi: "yes"

# Pure Storage Configuration
pure_api_token: "your-api-token"
pure_san_ip: "192.168.1.100"

# Backend Names (optional customization)
cinder_backend_pure_iscsi_name: "Pure-FlashArray-iscsi"
pure_iscsi_backend: "pure_iscsi_backend"
```

#### Pure Storage Fibre Channel
```yaml
# Enable Pure Storage FC Backend
enable_cinder_backend_pure_fc: "yes"

# Uses same Pure Storage configuration
# Backend Names (optional customization)
cinder_backend_pure_fc_name: "Pure-FlashArray-fc"
pure_fc_backend: "pure_fc_backend"
```

#### Pure Storage NVMe-RoCE (OpenStack Zed+)
```yaml
# Enable Pure Storage NVMe-RoCE Backend
enable_cinder_backend_pure_roce: "yes"

# Uses same Pure Storage configuration
# Backend Names (optional customization)
cinder_backend_pure_roce_name: "Pure-FlashArray-roce"
```

---

## 4. Multiple Backend Setup

### 4.1 Enable Multiple Backends

```yaml
# Example: Multiple backends enabled simultaneously
enable_cinder_backend_lvm: "yes"
cinder_backend_ceph: "yes"
enable_cinder_backend_nfs: "yes"
enable_cinder_backend_pure_iscsi: "yes"

# Custom backend names for identification
cinder_backend_lvm_name: "local-lvm"
cinder_backend_ceph_name: "ceph-ssd"
cinder_backend_nfs_name: "shared-nfs"
cinder_backend_pure_iscsi_name: "pure-fast"
```

### 4.2 Advanced Multi-Ceph Configuration

```yaml
# Multiple Ceph clusters with different purposes
cinder_ceph_backends:
  - name: "ceph-ssd"
    cluster: "ceph"
    enabled: "{{ cinder_backend_ceph | bool }}"
    availability_zone: "nova"
  - name: "ceph-hdd"
    cluster: "ceph-hdd"
    enabled: "{{ cinder_backend_ceph | bool }}"
    availability_zone: "nova"
  - name: "ceph-replica"
    cluster: "ceph-replica"
    enabled: "{{ cinder_backend_ceph | bool }}"
    availability_zone: "replica-zone"
```

**Required configuration files for multi-Ceph:**
```bash
# For each cluster, create:
/etc/kolla/config/cinder/ceph.conf              # Primary cluster
/etc/kolla/config/cinder/ceph-hdd.conf          # Secondary cluster
/etc/kolla/config/cinder/ceph-replica.conf      # Replica cluster

# And corresponding keyrings:
/etc/kolla/config/cinder/ceph.client.cinder.keyring
/etc/kolla/config/cinder/ceph-hdd.client.cinder.keyring
/etc/kolla/config/cinder/ceph-replica.client.cinder.keyring
```

### 4.3 Skip Backend Validation

```yaml
# For custom or unsupported backends
skip_cinder_backend_check: True
```

---

## 5. Backup Configuration

### 5.1 Ceph Backup Backend

```yaml
# Enable Ceph for backups
cinder_backup_driver: "ceph"

# Ceph Backup Configuration
ceph_cinder_backup_pool_name: "backups"
ceph_cinder_backup_user: "cinder-backup"
ceph_cinder_backup_keyring: "client.{{ ceph_cinder_backup_user }}.keyring"

# Multiple Ceph backend for backup
cinder_backup_backend_ceph_name: "rbd-1"
cinder_backup_ceph_backend: "{{ cinder_ceph_backends | selectattr('name', 'equalto', cinder_backup_backend_ceph_name) | list | first }}"
```

### 5.2 Swift Backup Backend

```yaml
# Enable Swift for backups
enable_swift: "yes"
cinder_backup_driver: "swift"
```

### 5.3 NFS Backup Backend

```yaml
# Enable NFS for backups
cinder_backup_driver: "nfs"
cinder_backup_share: "192.168.1.100:/backup"
cinder_backup_mount_options_nfs: "vers=4,noatime,nodiratime"
```

### 5.4 S3 Backup Backend

```yaml
# Enable S3 for backups
cinder_backup_driver: "s3"

# S3 Configuration
cinder_backup_s3_url: "http://127.0.0.1:9000"
cinder_backup_s3_bucket: "cinder-backups"
cinder_backup_s3_access_key: "minio"
cinder_backup_s3_secret_key: "admin-password"

# Or use global S3 settings
s3_url: "http://s3.example.com"
s3_bucket: "openstack-backups"
s3_access_key: "access-key"
s3_secret_key: "secret-key"
```

---

## 6. Advanced Configuration

### 6.1 Notification Configuration

```yaml
# Enable notifications for monitoring
cinder_notification_topics:
  - name: notifications
    enabled: "{{ enable_ceilometer | bool }}"

cinder_enabled_notification_topics: "{{ cinder_notification_topics | selectattr('enabled', 'equalto', true) | list }}"
```

### 6.2 Policy Configuration

```yaml
# Custom policy file
cinder_policy_file: "policy.json"
enable_cinder_horizon_policy_file: "{{ enable_cinder }}"
```

### 6.3 Database Configuration

```yaml
# Database settings
cinder_database_name: "cinder"
cinder_database_user: "cinder"
cinder_database_address: "{{ database_address }}:{{ database_port }}"

# Database sharding (for large deployments)
cinder_database_shard_id: "{{ mariadb_default_database_shard_id | int }}"
```

### 6.4 Container Configuration

```yaml
# Container dimensions
cinder_api_dimensions: "{{ default_container_dimensions }}"
cinder_volume_dimensions: "{{ default_container_dimensions }}"
cinder_scheduler_dimensions: "{{ default_container_dimensions }}"
cinder_backup_dimensions: "{{ default_container_dimensions }}"

# Extra volumes
cinder_extra_volumes: "{{ default_extra_volumes }}"
cinder_api_extra_volumes: "{{ cinder_extra_volumes }}"
cinder_volume_extra_volumes: "{{ cinder_extra_volumes }}"
cinder_scheduler_extra_volumes: "{{ cinder_extra_volumes }}"
cinder_backup_extra_volumes: "{{ cinder_extra_volumes }}"

# Health checks
cinder_api_enable_healthchecks: "{{ enable_container_healthchecks }}"
cinder_volume_enable_healthchecks: "{{ enable_container_healthchecks }}"
```

---

## 7. Performance Tuning

### 7.1 High Performance Settings

```yaml
# Enable tmpfs for image conversion (improves performance)
cinder_enable_conversion_tmpfs: true

# Increase API workers for high load
cinder_api_workers: 8

# Coordination backend for multi-volume scenarios
cinder_coordination_backend: "redis"
enable_redis: "yes"

# RPC tuning
cinder_rpc_version_startup_delay: 10  # Reduce for faster startup
```

### 7.2 Volume Service Tuning

```yaml
# Multiple volume services for load distribution
# Deploy cinder-volume on multiple nodes with different backends
# Example inventory configuration:
# [cinder-volume:children]
# cinder-volume-lvm
# cinder-volume-ceph
# cinder-volume-nfs
```

---

## 8. Configuration Examples

### 8.1 Complete Multi-Backend Configuration

```yaml
# Basic Cinder Configuration
enable_cinder: "yes"
enable_cinder_backup: "yes"
enable_redis: "yes"

# Multiple Storage Backends
enable_cinder_backend_lvm: "yes"
cinder_backend_ceph: "yes"
enable_cinder_backend_nfs: "yes"
enable_cinder_backend_pure_iscsi: "yes"

# Backend Names
cinder_backend_lvm_name: "local-storage"
cinder_backend_ceph_name: "ceph-ssd"
cinder_backend_nfs_name: "shared-storage"
cinder_backend_pure_iscsi_name: "pure-performance"

# LVM Configuration
cinder_volume_group: "cinder-volumes"

# Ceph Configuration
ceph_cinder_pool_name: "volumes"
ceph_cinder_user: "cinder"

# Multiple Ceph Clusters
cinder_ceph_backends:
  - name: "ceph-ssd"
    cluster: "ceph"
    enabled: "{{ cinder_backend_ceph | bool }}"
  - name: "ceph-hdd"
    cluster: "ceph-hdd"
    enabled: "{{ cinder_backend_ceph | bool }}"

# Pure Storage Configuration
pure_api_token: "your-api-token"
pure_san_ip: "192.168.1.100"

# Backup Configuration
cinder_backup_driver: "ceph"
ceph_cinder_backup_pool_name: "backups"

# Performance Settings
cinder_enable_conversion_tmpfs: true
cinder_api_workers: 6
cinder_coordination_backend: "redis"

# High Availability
cinder_rpc_version_startup_delay: 15
```

### 8.2 Required Configuration Files

**For NFS Backend:**
```bash
# /etc/kolla/config/cinder/nfs_shares
storage01.example.com:/export/cinder
storage02.example.com:/export/cinder
storage03.example.com:/export/cinder
```

**For Ceph Backend:**
```bash
# /etc/kolla/config/cinder/ceph.conf
[global]
fsid = your-ceph-fsid
mon_initial_members = ceph-mon-1,ceph-mon-2,ceph-mon-3
mon_host = 192.168.1.10,192.168.1.11,192.168.1.12
auth_cluster_required = cephx
auth_service_required = cephx
auth_client_required = cephx

# /etc/kolla/config/cinder/ceph.client.cinder.keyring
[client.cinder]
key = your-ceph-client-key
caps mon = "profile rbd"
caps osd = "profile rbd pool=volumes, profile rbd pool=backups"
```

**For Custom Configuration:**
```bash
# /etc/kolla/config/cinder.conf
[DEFAULT]
# Custom settings here

[your-custom-backend]
volume_driver = your.custom.driver.Class
custom_parameter = value
```

---

## 9. Deployment Commands

### 9.1 Deploy Cinder
```bash
# Deploy only Cinder services
kolla-ansible -i inventory deploy --tags cinder

# Deploy with dependencies
kolla-ansible -i inventory deploy --tags common,keystone,mariadb,memcached,rabbitmq,cinder

# Reconfigure after changes
kolla-ansible -i inventory reconfigure --tags cinder
```

### 9.2 Validation Commands
```bash
# Check service status
docker ps | grep cinder

# Verify configuration
kolla-ansible -i inventory check --tags cinder

# Test volume creation
source /etc/kolla/admin-openrc.sh
openstack volume create --size 1 test-volume
openstack volume list
```

---

## 10. Troubleshooting

### 10.1 Common Issues

**Backend not appearing in volume types:**
```bash
# Check enabled backends
grep enabled_backends /etc/kolla/config/cinder/cinder.conf

# Verify backend configuration
openstack volume service list
```

**iSCSI connection issues:**
```bash
# Check iSCSI daemon
docker logs iscsid

# Verify target configuration
docker exec cinder_volume cat /etc/cinder/cinder.conf
```

**Ceph connection issues:**
```bash
# Test Ceph connectivity
docker exec cinder_volume ceph -s --conf /etc/ceph/ceph.conf

# Check keyring permissions
ls -la /etc/kolla/config/cinder/ceph.*
```

### 10.2 Log Locations
```bash
# Container logs
docker logs cinder_api
docker logs cinder_volume
docker logs cinder_scheduler
docker logs cinder_backup

# Service logs
/var/log/kolla/cinder/cinder-api.log
/var/log/kolla/cinder/cinder-volume.log
/var/log/kolla/cinder/cinder-scheduler.log
/var/log/kolla/cinder/cinder-backup.log
```

---

## 11. Post-Deployment Configuration

### 11.1 Volume Types Creation
```bash
# Create volume types for different backends
source /etc/kolla/admin-openrc.sh

# LVM volume type
openstack volume type create lvm
openstack volume type set --property volume_backend_name=local-storage lvm

# Ceph volume type
openstack volume type create ceph-ssd
openstack volume type set --property volume_backend_name=ceph-ssd ceph-ssd

# NFS volume type
openstack volume type create nfs
openstack volume type set --property volume_backend_name=shared-storage nfs

# Pure Storage volume type
openstack volume type create pure-fast
openstack volume type set --property volume_backend_name=pure-performance pure-fast
```

### 11.2 Quality of Service (QoS)
```bash
# Create QoS specs
openstack volume qos create high-performance \
  --property read_iops_sec=3000 \
  --property write_iops_sec=3000

openstack volume qos create standard \
  --property read_iops_sec=1000 \
  --property write_iops_sec=1000

# Associate QoS with volume types
openstack volume qos associate high-performance pure-fast
openstack volume qos associate standard lvm
```

---

This comprehensive guide covers all available configuration options for deploying Cinder with multiple backends in Kolla Ansible. Each backend can be configured independently, and multiple backends can be enabled simultaneously to provide different storage tiers and capabilities to your OpenStack cloud.
