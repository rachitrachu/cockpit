#!/usr/bin/env python3
import sys
import yaml
import os
import subprocess
import json
import traceback
import shutil
import re

NETPLAN_DIR = '/etc/netplan'
NETPLAN_FILE = '99-cockpit.yaml'


def get_interface_status():
    """Get status of all network interfaces using ifconfig"""
    try:
        output = subprocess.check_output(['ifconfig', '-a'], universal_newlines=True)
        interfaces = {}
        current_if = None
        
        for line in output.split('\n'):
            # New interface section starts
            if line and not line.startswith(' '):
                match = re.match(r'^(\w+):', line)
                if match:
                    current_if = match.group(1)
                    interfaces[current_if] = {
                        'up': 'UP' in line,
                        'running': 'RUNNING' in line,
                        'mtu': re.search(r'mtu\s+(\d+)', line).group(1) if re.search(r'mtu\s+(\d+)', line) else None
                    }
            
            # IP address line
            elif line.strip().startswith('inet '):
                if current_if:
                    match = re.search(r'inet (\d+\.\d+\.\d+\.\d+)', line)
                    if match:
                        interfaces[current_if]['ipv4'] = match.group(1)
            
            # MAC address line
            elif line.strip().startswith('ether '):
                if current_if:
                    match = re.search(r'ether ([\da-f:]+)', line)
                    if match:
                        interfaces[current_if]['mac'] = match.group(1)
                        
        return interfaces
    except Exception as e:
        print(f"Error getting interface status: {e}", file=sys.stderr)
        return {}

def load_netplan():
    """Load netplan configuration from file"""
    config = {}
    try:
        path = os.path.join(NETPLAN_DIR, NETPLAN_FILE)
        
        # Create file with basic structure if it doesn't exist
        if not os.path.exists(path):
            config = {
                'network': {
                    'version': 2,
                    'renderer': 'networkd',
                    'ethernets': {},
                    'vlans': {},
                    'bridges': {},
                    'bonds': {}
                }
            }
            write_netplan(NETPLAN_FILE, config)
        else:
            with open(path) as f:
                loaded = yaml.safe_load(f)
                config = loaded if loaded else {}

        return config

    except Exception as e:
        print(json.dumps({'error': f'Failed to load netplan config: {e}'}), file=sys.stdout, flush=True)
        sys.exit(1)


def write_netplan(fname, data):
    """Write netplan configuration to file with correct permissions
    
    Netplan requires configuration files to have restricted permissions:
    - Owner: read/write (0600)
    - Group: no access
    - Others: no access
    """
    try:
        # Validate and fix configuration
        network = data.get('network', {})
        
        # Check for any conflicts
        conflicts = validate_interface_usage(network)
        if conflicts:
            # Auto-fix the configuration
            fix_vlan_on_bond(network)
            
            # Recheck for any remaining conflicts
            conflicts = validate_interface_usage(network)
            if conflicts:
                raise Exception(f"Invalid network configuration: {'; '.join(conflicts)}")
                
        # Create directory with secure permissions
        if not os.path.exists(NETPLAN_DIR):
            os.makedirs(NETPLAN_DIR, mode=0o755)  # drwxr-xr-x
        path = os.path.join(NETPLAN_DIR, fname)
        
        # First write with restrictive umask
        old_umask = os.umask(0o077)  # Ensure file is created with secure permissions
        try:
            # Ensure basic network structure is correct
            if 'network' not in data:
                data = {'network': {}}
            network = data['network']
            
            # Ensure required fields
            network.setdefault('version', 2)
            network.setdefault('renderer', 'networkd')
            
            # Sort sections in standard order
            ordered_network = {}
            for section in ['version', 'renderer', 'ethernets', 'vlans', 'bridges', 'bonds']:
                if section in network:
                    ordered_network[section] = network[section]
            data['network'] = ordered_network
            
            with open(path, 'w') as f:
                # Use block style for sequences and mappings
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
        finally:
            os.umask(old_umask)
            
        # Double-check permissions are correct
        os.chmod(path, 0o600)  # rw-------
    except Exception as e:
        print(json.dumps({'error': f'Failed to write netplan config: {e}'}), file=sys.stdout, flush=True)
        sys.exit(1)

def backup_netplan():
    """Create backup of current netplan configuration"""
    try:
        orig_path = os.path.join(NETPLAN_DIR, NETPLAN_FILE)
        backup_path = os.path.join(NETPLAN_DIR, f'{NETPLAN_FILE}.bak')
        
        if os.path.exists(orig_path):
            shutil.copy2(orig_path, backup_path)
            return backup_path
        return None
    except Exception as e:
        print(f"DEBUG: Failed to create backup: {e}", file=sys.stderr, flush=True)
        return None

def restore_netplan_backup(backup_path):
    """Restore netplan configuration from backup"""
    if backup_path and os.path.exists(backup_path):
        try:
            orig_path = os.path.join(NETPLAN_DIR, NETPLAN_FILE)
            shutil.copy2(backup_path, orig_path)
            os.remove(backup_path)
            return True
        except Exception as e:
            print(f"DEBUG: Failed to restore backup: {e}", file=sys.stderr, flush=True)
    return False


def apply_netplan_changes(timeout=10):
    """Apply netplan changes using the appropriate sequence based on config type:
    For bonds and bridges:
    1. netplan generate
    2. netplan apply (skip try as it's not supported for bonds/bridges)
    
    For other changes:
    1. netplan generate
    2. netplan try
    3. netplan apply if try succeeds
    """
    try:
        # Step 1: Generate systemd-networkd configuration
        print("DEBUG: Generating systemd-networkd configuration...", file=sys.stderr, flush=True)
        result = subprocess.run(['netplan', 'generate'],
                              check=True, capture_output=True, text=True)
        print("DEBUG: netplan generate succeeded", file=sys.stderr, flush=True)

        # Check if config has bonds or bridges (read current config)
        current_config = None
        try:
            with open(os.path.join(NETPLAN_DIR, NETPLAN_FILE), 'r') as f:
                current_config = yaml.safe_load(f)
        except Exception:
            current_config = {'network': {}}

        network = current_config.get('network', {})
        has_bonds = bool(network.get('bonds'))
        has_bridges = bool(network.get('bridges'))

        # For bonds and bridges, skip 'try' and go straight to apply
        if has_bonds or has_bridges:
            print("DEBUG: Bonds or bridges present, skipping netplan try...", file=sys.stderr, flush=True)
            print("DEBUG: Applying configuration directly...", file=sys.stderr, flush=True)
            result = subprocess.run(['netplan', 'apply'],
                                  check=True, capture_output=True, text=True)
            print("DEBUG: netplan apply succeeded", file=sys.stderr, flush=True)
            return True

        # For other changes, use try before apply
        print(f"DEBUG: Testing configuration with {timeout}s timeout...", file=sys.stderr, flush=True)
        try:
            result = subprocess.run(['netplan', 'try', '--timeout', str(timeout)],
                                  check=True, capture_output=True, text=True)
            print("DEBUG: netplan try succeeded", file=sys.stderr, flush=True)
        except subprocess.CalledProcessError as e:
            err = e.stderr or str(e)
            hint = None
            if 'YAML' in err or 'yaml' in err:
                hint = 'Check your netplan YAML syntax for errors.'
            elif 'duplicate' in err:
                hint = 'Check for duplicate IP addresses, interface names, or routes.'
            elif 'missing' in err:
                hint = 'A required field may be missing.'
            elif 'Invalid' in err or 'invalid' in err:
                hint = 'Check for invalid values in your netplan file.'
            elif 'not found' in err:
                hint = 'A referenced device or key was not found.'
            elif 'reverting custom parameters' in e.stdout:
                # Direct apply needed for bonds/bridges
                print("DEBUG: Configuration requires direct apply...", file=sys.stderr, flush=True)
                result = subprocess.run(['netplan', 'apply'],
                                      check=True, capture_output=True, text=True)
                print("DEBUG: netplan apply succeeded", file=sys.stderr, flush=True)
                return True
            print(json.dumps({
                'error': f'Configuration test failed: {err}',
                'hint': hint,
                'stdout': e.stdout,
                'stderr': e.stderr
            }), file=sys.stdout, flush=True)
            raise

        # Step 3: Apply the configuration
        print("DEBUG: Applying configuration...", file=sys.stderr, flush=True)
        result = subprocess.run(['netplan', 'apply'],
                              check=True, capture_output=True, text=True)
        print("DEBUG: netplan apply succeeded", file=sys.stderr, flush=True)
        return True

    except subprocess.CalledProcessError as e:
        print(json.dumps({
            'error': f'Netplan operation failed: {e.stderr}',
            'stdout': e.stdout,
            'stderr': e.stderr
        }), file=sys.stdout, flush=True)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'error': f'Unexpected error during netplan operation: {str(e)}'
        }), file=sys.stdout, flush=True)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print(json.dumps({
            'error': 'Netplan try command timed out - configuration may be invalid',
            'hint': 'Check for syntax errors, missing fields, or network conflicts.'
        }), file=sys.stdout, flush=True)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        err = e.stderr or str(e)
        hint = None
        
        if 'YAML' in err or 'yaml' in err:
            hint = 'Check your netplan YAML syntax for errors (indentation, colons, etc.).'
        elif 'duplicate' in err:
            hint = 'Check for duplicate IP addresses, interface names, or routes.'
        elif 'missing' in err:
            hint = 'A required field may be missing in your netplan configuration.'
        elif 'Invalid' in err or 'invalid' in err:
            hint = 'Check for invalid values in your netplan file (e.g., wrong IP format, device name, etc.).'
        elif 'not found' in err:
            hint = 'A referenced device or key was not found. Check interface names and keys.'
        elif 'Address already in use' in err:
            hint = 'The IP address you are trying to assign is already in use.'
        elif 'Permission denied' in err:
            hint = 'You may not have permission to apply netplan. Try running as root.'
        
        print(json.dumps({
            'error': f'Netplan try failed: {err}',
            'hint': hint,
            'stdout': e.stdout,
            'stderr': e.stderr,
            'returncode': e.returncode
        }), file=sys.stdout, flush=True)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'error': f'Unexpected error during netplan try: {str(e)}',
            'hint': 'Check your netplan configuration and system logs for more details.'
        }), file=sys.stdout, flush=True)
        sys.exit(1)


def ensure_network_root(netplan):
    if 'network' not in netplan or not isinstance(netplan['network'], dict):
        netplan['network'] = {}
    net = netplan['network']
    # Enforce standard Linux networking
    net.setdefault('version', 2)
    net['renderer'] = 'networkd'
    return net


def ensure_ethernets(network):
    if 'ethernets' not in network or not isinstance(network['ethernets'], dict):
        network['ethernets'] = {}
    return network['ethernets']

def validate_interface_name(name, interface_type):
    """Validate interface name format"""
    if not name:
        return "Interface name is required"
    
    if interface_type == 'vlans':
        if '.' not in name:
            return "VLAN interface name must be in format 'interface.vlan_id'"
        base, vid = name.split('.')
        if not vid.isdigit():
            return "VLAN ID must be a number"
        if int(vid) < 1 or int(vid) > 4094:
            return "VLAN ID must be between 1 and 4094"
            
    elif interface_type == 'bonds':
        if not name.startswith('bond'):
            return "Bond interface name must start with 'bond'"
            
    elif interface_type == 'bridges':
        if not name.startswith('br'):
            return "Bridge interface name must start with 'br'"
            
    return None

def validate_interface_usage(network):
    """Validate that interfaces are not used in conflicting ways"""
    # Track where each interface is used
    interface_usage = {}
    
    def register_usage(iface, usage_type, parent=None):
        if iface not in interface_usage:
            interface_usage[iface] = []
        interface_usage[iface].append({'type': usage_type, 'parent': parent})
    
    # Check bonds
    if 'bonds' in network:
        for bond_name, bond_config in network['bonds'].items():
            if 'interfaces' in bond_config:
                for member in bond_config['interfaces']:
                    register_usage(member, 'bond_member', bond_name)
    
    # Check bridges
    if 'bridges' in network:
        for bridge_name, bridge_config in network['bridges'].items():
            if 'interfaces' in bridge_config:
                for member in bridge_config['interfaces']:
                    register_usage(member, 'bridge_member', bridge_name)
    
    # Check VLANs
    if 'vlans' in network:
        for vlan_name, vlan_config in network['vlans'].items():
            if 'link' in vlan_config:
                register_usage(vlan_config['link'], 'vlan_parent', vlan_name)
    
    # Check for conflicts
    conflicts = []
    for iface, usages in interface_usage.items():
        if len(usages) > 1:
            # It's okay for a bond to be a VLAN parent
            # But physical interfaces can't be both bond/bridge members and VLAN parents
            has_bond = any(u['type'] == 'bond_member' for u in usages)
            has_bridge = any(u['type'] == 'bridge_member' for u in usages)
            has_vlan = any(u['type'] == 'vlan_parent' for u in usages)
            is_bond = any(u['parent'] and u['parent'].startswith('bond') for u in usages)
            
            if not is_bond and (has_bond or has_bridge) and has_vlan:
                conflicts.append(f"Interface {iface} is used as both a bond/bridge member and VLAN parent")
            elif has_bond and has_bridge:
                conflicts.append(f"Interface {iface} cannot be both a bond member and bridge member")
    
    return conflicts

def fix_vlan_on_bond(network):
    """Move VLANs to be on top of bonds if their parent interfaces are bond members"""
    if 'vlans' not in network or 'bonds' not in network:
        return
    
    # Build map of which interfaces are in which bonds
    bond_members = {}
    for bond_name, bond_config in network['bonds'].items():
        if 'interfaces' in bond_config:
            for member in bond_config['interfaces']:
                bond_members[member] = bond_name
    
    # Check each VLAN
    vlans_to_move = {}
    for vlan_name, vlan_config in network['vlans'].items():
        if 'link' in vlan_config and vlan_config['link'] in bond_members:
            # This VLAN's parent interface is part of a bond
            old_parent = vlan_config['link']
            new_parent = bond_members[old_parent]
            
            # Create new VLAN name based on bond
            vlan_id = vlan_config['id']
            new_vlan_name = f"{new_parent}.{vlan_id}"
            
            # Store for moving
            vlans_to_move[vlan_name] = {
                'new_name': new_vlan_name,
                'new_parent': new_parent,
                'config': vlan_config.copy()
            }
    
    # Apply the moves
    for old_name, move_info in vlans_to_move.items():
        # Remove old VLAN
        del network['vlans'][old_name]
        
        # Create new VLAN on bond
        move_info['config']['link'] = move_info['new_parent']
        network['vlans'][move_info['new_name']] = move_info['config']


def add_empty_ethernets(network, ifaces):
    """Add ethernet interfaces to the network config with proper defaults
    
    Args:
        network: The network configuration dictionary
        ifaces: List of interface names to add
    
    Each interface will be added to the ethernets section with:
    - optional: true (avoids boot delays for unplugged interfaces)
    - existing settings preserved if present
    """
    # Ensure ethernets section exists
    if 'ethernets' not in network:
        network['ethernets'] = {}
    
    for iface in ifaces:
        # Skip if not a physical interface name
        if (iface.startswith('bond') or 
            iface.startswith('br') or 
            iface.startswith('vlan') or
            '.' in iface):
            continue
            
        # Add or update interface config
        if iface not in network['ethernets']:
            network['ethernets'][iface] = {}
            
        # Always mark as optional to avoid boot delays
        network['ethernets'][iface]['optional'] = True


def main():
    """Main entry point for parsing JSON input and taking action
    
    Actions that modify network config:
    - set_mtu: Set MTU for an interface using netplan
    - set_interface_state: Set UP/DOWN state using netplan
    - try_config: Test a new netplan config before applying
    - apply_config: Apply a tested netplan config
    - add_bridge: Add a network bridge
    - add_bond: Add a network bond
    - add_vlan: Add a VLAN interface
    - delete_interface: Delete an interface config
    
    Read-only actions:
    - load_netplan: Get current netplan config
    - get_status: Get status of all interfaces via ifconfig
    """
    try:
        # Debug: Print initial info
        print(f"DEBUG: Starting netplan_manager.py", file=sys.stderr, flush=True)
        print(f"DEBUG: Working directory: {os.getcwd()}", file=sys.stderr, flush=True)
        print(f"DEBUG: Netplan directory: {NETPLAN_DIR}", file=sys.stderr, flush=True)
        
        # Create netplan directory if it doesn't exist
        if not os.path.exists(NETPLAN_DIR):
            print(f"DEBUG: Creating netplan directory", file=sys.stderr, flush=True)
            os.makedirs(NETPLAN_DIR, mode=0o755, exist_ok=True)
        
        # Read JSON input
        input_data = sys.stdin.read().strip()
        if not input_data:
            print(json.dumps({'error': 'No input provided'}), file=sys.stdout, flush=True)
            sys.exit(1)
        
        print(f"DEBUG: Received input: {input_data}", file=sys.stderr, flush=True)
        
        data = json.loads(input_data)
        action = data.get('action')
        config = data.get('config', {})
        print(f"DEBUG: Action={action}, Config={config}", file=sys.stderr, flush=True)
        
        if action == 'load_netplan':
            netplan = load_netplan()
            print(json.dumps({'success': True, 'config': netplan}), file=sys.stdout, flush=True)
            return
            
        elif action == 'get_status':
            # Get interface status using ifconfig
            status = get_interface_status()
            print(json.dumps({'success': True, 'status': status}), file=sys.stdout, flush=True)
            return
            
        # Load existing netplan configuration
        netplan = load_netplan()
        network = ensure_network_root(netplan)        # Always merge new constructs, never overwrite
        if action == 'add_bond':
            # Add bonding interface
            bond_name = config.get('name')
            bond_mode = config.get('mode', 'active-backup')
            bond_interfaces = config.get('interfaces', [])
            miimon = config.get('miimon')
            primary = config.get('primary')
            
            # Validate bond name
            error = validate_interface_name(bond_name, 'bonds')
            if error:
                print(json.dumps({'error': error}), flush=True)
                sys.exit(1)
                
            if not bond_interfaces:
                print(json.dumps({'error': 'Bond interfaces are required'}), flush=True)
                sys.exit(1)
            
            if len(bond_interfaces) < 2:
                print(json.dumps({'error': 'At least 2 interfaces required for bonding'}), flush=True)
                sys.exit(1)
            
            # Ensure ethernets section exists for slave interfaces
            add_empty_ethernets(network, bond_interfaces)
            
            # Create bonds section
            if 'bonds' not in network:
                network['bonds'] = {}
            
            # Configure the bond
            bond_config = {
                'interfaces': bond_interfaces,
                'parameters': {
                    'mode': bond_mode
                }
            }
            
            # Add MII monitoring if specified
            if miimon and isinstance(miimon, int) and miimon > 0:
                bond_config['parameters']['mii-monitor-interval'] = miimon
            
            # Add primary interface if specified and valid
            if primary and primary in bond_interfaces:
                bond_config['parameters']['primary'] = primary
            
            # Add additional parameters based on mode
            if bond_mode == '802.3ad':
                bond_config['parameters']['lacp-rate'] = 'fast'
                bond_config['parameters']['transmit-hash-policy'] = 'layer3+4'
            elif bond_mode in ['balance-tlb', 'balance-alb']:
                if not miimon:
                    bond_config['parameters']['mii-monitor-interval'] = 100
            
            network['bonds'][bond_name] = bond_config
        elif action == 'add_vlan':
            # Validate VLAN interface name
            vlan_name = config.get('name')
            if vlan_name and '@' in vlan_name and '.' in vlan_name:
                vlan_name = vlan_name.split('@')[0]
                print(f"DEBUG: Normalized VLAN interface name from '{config['name']}' to '{vlan_name}'", file=sys.stderr, flush=True)
                config['name'] = vlan_name
            
            # Validate name format
            error = validate_interface_name(vlan_name, 'vlans')
            if error:
                print(json.dumps({'error': error}), flush=True)
                sys.exit(1)
            
            # Ensure parent link exists in ethernets
            link = config.get('link')
            if link:
                add_empty_ethernets(network, [link])
            network.setdefault('vlans', {})
            
            # Build VLAN configuration
            vlan_config = {
                'id': config['id'],
                'link': link
            }
            
            # Check if static IP is provided
            static_ip = config.get('static_ip')
            gateway = config.get('gateway')
            mtu = config.get('mtu')
            
            if static_ip and static_ip.strip():
                # Configure static IP
                vlan_config['dhcp4'] = False
                vlan_config['addresses'] = [static_ip]
                
                # Add gateway if provided
                if gateway and gateway.strip():
                    vlan_config['gateway4'] = gateway
            else:
                # Use DHCP if no static IP provided
                vlan_config['dhcp4'] = True
            
            # Add MTU if provided
            if mtu and isinstance(mtu, int) and mtu > 0:
                vlan_config['mtu'] = mtu
            
            network['vlans'][config['name']] = vlan_config
            print(f"DEBUG: Created VLAN {config['name']} with config: {vlan_config}", file=sys.stderr, flush=True)
        elif action == 'add_bridge':
            bridge_name = config.get('name')
            bridge_interfaces = list(config.get('interfaces') or [])
            
            # Validate bridge name
            error = validate_interface_name(bridge_name, 'bridges')
            if error:
                print(json.dumps({'error': error}), flush=True)
                sys.exit(1)
                
            if not bridge_interfaces:
                print(json.dumps({'error': 'At least one interface is required for bridge'}), flush=True)
                sys.exit(1)
            
            # Verify interfaces are available
            all_used_interfaces = set()
            
            # Check bonds
            if 'bonds' in network:
                for _, bond_config in network['bonds'].items():
                    if 'interfaces' in bond_config:
                        all_used_interfaces.update(bond_config['interfaces'])
            
            # Check bridges (except this one if it exists)
            if 'bridges' in network:
                for br_name, br_config in network['bridges'].items():
                    if br_name != bridge_name and 'interfaces' in br_config:
                        all_used_interfaces.update(br_config['interfaces'])
            
            # Check VLANs
            if 'vlans' in network:
                for _, vlan_config in network['vlans'].items():
                    if 'link' in vlan_config:
                        all_used_interfaces.add(vlan_config['link'])
            
            # Check for conflicts
            conflicts = [iface for iface in bridge_interfaces if iface in all_used_interfaces]
            if conflicts:
                print(json.dumps({
                    'error': f"Cannot add bridge: interfaces already in use: {', '.join(conflicts)}",
                    'hint': 'The specified interfaces are already used in another bond, bridge, or VLAN configuration'
                }), flush=True)
                sys.exit(1)
            
            # Create basic interface configs if they don't exist
            add_empty_ethernets(network, bridge_interfaces)
            
            # Create bridge
            network.setdefault('bridges', {})
            bridge_config = {
                'interfaces': bridge_interfaces,
                'dhcp4': True
            }
            
            # Add STP config if specified
            if 'stp' in config:
                bridge_config['parameters'] = {
                    'stp': bool(config['stp'])
                }
            
            network['bridges'][bridge_name] = bridge_config
            print(f"DEBUG: Creating bridge {bridge_name} with config: {bridge_config}", file=sys.stderr, flush=True)
            print("DEBUG: Note: Bridge creation requires direct netplan apply", file=sys.stderr, flush=True)
        elif action == 'delete':
            # config: {type, name}
            interface_type = config.get('type')
            interface_name = config.get('name')
            
            # Normalize VLAN interface names for deletion (check both forms)
            search_names = [interface_name]
            if interface_type == 'vlans' and '@' in interface_name and '.' in interface_name:
                # For @-suffixed VLAN names, also search for normalized name
                normalized_name = interface_name.split('@')[0]
                search_names.append(normalized_name)
            elif interface_type == 'vlans' and '.' in interface_name and '@' not in interface_name:
                # For normalized VLAN names, also search for @-suffixed name
                parts = interface_name.split('.')
                if len(parts) == 2:
                    suffixed_name = f"{interface_name}@{parts[0]}"
                    search_names.append(suffixed_name)
            
            print(f"DEBUG: Delete action - type='{interface_type}', name='{interface_name}'", file=sys.stderr, flush=True)
            print(f"DEBUG: Will search for names: {search_names}", file=sys.stderr, flush=True)
            print(f"DEBUG: Current network sections: {list(network.keys())}", file=sys.stderr, flush=True)
            
            if interface_type and interface_name:
                if interface_type in network:
                    print(f"DEBUG: Found section '{interface_type}' in network config", file=sys.stderr, flush=True)
                    print(f"DEBUG: Interfaces in '{interface_type}': {list(network[interface_type].keys()) if isinstance(network[interface_type], dict) else 'Not a dict'}", file=sys.stderr, flush=True)
                    
                    # Find which name exists in the config (could be normalized or @-suffixed)
                    found_name = None
                    if isinstance(network[interface_type], dict):
                        for search_name in search_names:
                            if search_name in network[interface_type]:
                                found_name = search_name
                                break
                    
                    if found_name:
                        # Remove the interface from the configuration
                        print(f"DEBUG: Removing '{found_name}' from '{interface_type}' section", file=sys.stderr, flush=True)
                        del network[interface_type][found_name]
                        print(f"DEBUG: Successfully deleted {interface_type}/{found_name} from netplan config", file=sys.stderr, flush=True)
                        
                        # If the section is now empty, optionally remove it
                        if not network[interface_type]:
                            print(f"DEBUG: Section '{interface_type}' is now empty, removing it", file=sys.stderr, flush=True)
                            del network[interface_type]
                        
                        # Try to delete the actual interface using ip link (best-effort)
                        # Handle different interface name formats for the ip command
                        try:
                            # Determine the correct interface name for ip commands
                            ip_interface_name = interface_name
                            
                            # For VLAN interfaces, try different naming formats
                            if interface_type == 'vlans':
                                # Try original name first
                                print(f"DEBUG: Attempting to delete interface '{ip_interface_name}' using ip command", file=sys.stderr, flush=True)
                                try:
                                    result = subprocess.run(['ip', 'link', 'delete', ip_interface_name], 
                                                           stdout=subprocess.PIPE, 
                                                           stderr=subprocess.PIPE, 
                                                           text=True,
                                                           check=True)
                                    print(f"DEBUG: Successfully deleted interface '{ip_interface_name}' via ip command", file=sys.stderr, flush=True)
                                except subprocess.CalledProcessError as e1:
                                    print(f"DEBUG: First attempt failed: {e1.stderr}", file=sys.stderr, flush=True)
                                    
                                    # If original name failed and contains @, try normalized name
                                    if '@' in ip_interface_name:
                                        normalized_name = ip_interface_name.split('@')[0]
                                        print(f"DEBUG: Trying normalized interface name '{normalized_name}'", file=sys.stderr, flush=True)
                                        try:
                                            result = subprocess.run(['ip', 'link', 'delete', normalized_name], 
                                                                   stdout=subprocess.PIPE, 
                                                                   stderr=subprocess.PIPE, 
                                                                   text=True,
                                                                   check=True)
                                            print(f"DEBUG: Successfully deleted interface '{normalized_name}' via ip command", file=sys.stderr, flush=True)
                                        except subprocess.CalledProcessError as e2:
                                            print(f"DEBUG: Normalized name also failed: {e2.stderr}", file=sys.stderr, flush=True)
                                            # Try with full @ notation if it exists on system
                                            if '.' in normalized_name:
                                                parts = normalized_name.split('.')
                                                if len(parts) == 2:
                                                    full_name = f"{normalized_name}@{parts[0]}"
                                                    print(f"DEBUG: Trying full @ notation '{full_name}'", file=sys.stderr, flush=True)
                                                    try:
                                                        result = subprocess.run(['ip', 'link', 'delete', full_name], 
                                                                               stdout=subprocess.PIPE, 
                                                                               stderr=subprocess.PIPE, 
                                                                               text=True,
                                                                               check=True)
                                                        print(f"DEBUG: Successfully deleted interface '{full_name}' via ip command", file=sys.stderr, flush=True)
                                                    except subprocess.CalledProcessError as e3:
                                                        print(f"DEBUG: Full @ notation also failed: {e3.stderr}", file=sys.stderr, flush=True)
                                                        # Last attempt failed, but don't fail the entire operation
                                                        pass
                                    else:
                                        # No @ in name, can't try alternative
                                        pass
                            else:
                                # For non-VLAN interfaces, we only need to remove from netplan
                                # The actual interface changes will be handled by netplan apply
                                print(f"DEBUG: Interface '{ip_interface_name}' removed from netplan config", file=sys.stderr, flush=True)
                                print(f"DEBUG: Interface will be removed when netplan apply is called", file=sys.stderr, flush=True)
                                
                        except Exception as e:
                            print(f"DEBUG: Exception during delete operation: {e}", file=sys.stderr, flush=True)
                            
                    else:
                        error_msg = f"Interface '{interface_name}' (searched for {search_names}) not found in '{interface_type}' section"
                        print(f"DEBUG: {error_msg}", file=sys.stderr, flush=True)
                        print(json.dumps({'error': error_msg}), file=sys.stdout, flush=True)
                        sys.exit(1)
                else:
                    error_msg = f"Section '{interface_type}' not found in network configuration"
                    print(f"DEBUG: {error_msg}", file=sys.stderr, flush=True)
                    print(json.dumps({'error': error_msg}), file=sys.stdout, flush=True)
                    sys.exit(1)
            else:
                error_msg = "Missing 'type' or 'name' in delete configuration"
                print(f"DEBUG: {error_msg}", file=sys.stderr, flush=True)
                print(json.dumps({'error': error_msg}), file=sys.stdout, flush=True)
                sys.exit(1)
        elif action == 'set_ip':
            # Set IP address configuration for an interface
            iface_name = config.get('name')
            static_ip = config.get('static_ip')
            gateway = config.get('gateway')
            dns = config.get('dns')
            
            if not iface_name or not static_ip:
                print(json.dumps({'error': 'Interface name and static IP are required'}), flush=True)
                sys.exit(1)
            
            # Normalize VLAN interface names (remove @parent suffix if present)
            original_iface_name = iface_name
            if '@' in iface_name and '.' in iface_name:
                # Handle VLAN names like eno4.1144@eno4 -> eno4.1144
                iface_name = iface_name.split('@')[0]
                print(f"DEBUG: Normalized VLAN interface name from '{original_iface_name}' to '{iface_name}'", file=sys.stderr, flush=True)
                
                # Migrate any existing @-suffixed VLAN config to the normalized name
                if 'vlans' in network and original_iface_name in network['vlans']:
                    print(f"DEBUG: Migrating existing config from '{original_iface_name}' to '{iface_name}'", file=sys.stderr, flush=True)
                    existing_config = network['vlans'][original_iface_name]
                    network['vlans'][iface_name] = existing_config
                    del network['vlans'][original_iface_name]
            
            # Debug: Print current action information
            print(f"DEBUG: Configuring IP for {iface_name}: static_ip={static_ip}, gateway={gateway}, dns={dns}", file=sys.stderr, flush=True)
            
            # Determine the correct section based on interface type
            target_section = None
            target_config = None
            
            if iface_name.startswith('bond'):
                # Bond interface - configure in bonds section
                if 'bonds' in network and iface_name in network['bonds']:
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
                else:
                    # Create bond section if it doesn't exist
                    network.setdefault('bonds', {})
                    network['bonds'][iface_name] = {'interfaces': []}
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
            elif iface_name.startswith('br'):
                # Bridge interface - configure in bridges section
                if 'bridges' in network and iface_name in network['bridges']:
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
                else:
                    # Create bridge section if it doesn't exist
                    network.setdefault('bridges', {})
                    network['bridges'][iface_name] = {'interfaces': []}
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
            elif '.' in iface_name and not iface_name.startswith('br'):
                # VLAN interface - configure in vlans section
                if 'vlans' in network and iface_name in network['vlans']:
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
                else:
                    # Create basic VLAN config if it doesn't exist
                    network.setdefault('vlans', {})
                    parts = iface_name.split('.')
                    network['vlans'][iface_name] = {
                        'id': int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 1,
                        'link': parts[0] if len(parts) > 0 else 'eth0'
                    }
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
            else:
                # Regular interface - configure in ethernets section
                add_empty_ethernets(network, [iface_name])
                target_section = 'ethernets'
                target_config = network['ethernets'][iface_name]
            
            # Configure the IP settings
            if target_config is not None:
                target_config['dhcp4'] = False  # Disable DHCP for static IP
                target_config['addresses'] = [static_ip]
                
                # Set gateway if provided
                if gateway:
                    target_config['gateway4'] = gateway
                
                # Set DNS if provided  
                if dns:
                    dns_list = [d.strip() for d in dns.split(',') if d.strip()]
                    if dns_list:
                        target_config['nameservers'] = {'addresses': dns_list}
                        
                print(f"DEBUG: Configured IP for {iface_name} in {target_section} section", file=sys.stderr, flush=True)
                print(f"DEBUG: Config now: {target_config}", file=sys.stderr, flush=True)
            else:
                raise Exception(f"Could not determine configuration section for interface {iface_name}")

        elif action == 'set_mtu':
            # Set MTU for an interface
            iface_name = config.get('name')
            mtu_value = config.get('mtu')
            
            if not iface_name or not mtu_value:
                print(json.dumps({'error': 'Interface name and MTU value are required'}), flush=True)
                sys.exit(1)
            
            if not isinstance(mtu_value, int) or mtu_value < 68 or mtu_value > 9000:
                print(json.dumps({'error': 'MTU must be an integer between 68 and 9000'}), flush=True)
                sys.exit(1)
            
            # Determine the correct section based on interface type
            target_section = None
            target_config = None
            
            if iface_name.startswith('bond'):
                # Bond interface - configure in bonds section
                if 'bonds' in network and iface_name in network['bonds']:
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
                else:
                    # Create bond section if it doesn't exist
                    network.setdefault('bonds', {})
                    network['bonds'][iface_name] = {'interfaces': []}
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
            elif iface_name.startswith('br'):
                # Bridge interface - configure in bridges section
                if 'bridges' in network and iface_name in network['bridges']:
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
                else:
                    # Create bridge section if it doesn't exist
                    network.setdefault('bridges', {})
                    network['bridges'][iface_name] = {'interfaces': []}
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
            elif '.' in iface_name and not iface_name.startswith('br'):
                # VLAN interface - configure in vlans section
                if 'vlans' in network and iface_name in network['vlans']:
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
                else:
                    # Create basic VLAN config if it doesn't exist
                    network.setdefault('vlans', {})
                    parts = iface_name.split('.')
                    network['vlans'][iface_name] = {
                        'id': int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 1,
                        'link': parts[0] if len(parts) > 0 else 'eth0'
                    }
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
            else:
                # Regular interface - configure in ethernets section
                add_empty_ethernets(network, [iface_name])
                target_section = 'ethernets'
                target_config = network['ethernets'][iface_name]
            
            # Set MTU
            if target_config is not None:
                target_config['mtu'] = mtu_value
                print(f"Set MTU {mtu_value} for {iface_name} in {target_section} section", file=sys.stderr, flush=True)
            else:
                raise Exception(f"Could not determine configuration section for interface {iface_name}")
        
        elif action == 'try_config':
            # Test netplan configuration with try before applying
            timeout = config.get('timeout', 10)
            
            import shutil
            netplan_path = os.path.join(NETPLAN_DIR, NETPLAN_FILE)
            backup_path = os.path.join(NETPLAN_DIR, NETPLAN_FILE + '.bak')
            # Backup the original file if it exists
            if os.path.exists(netplan_path):
                shutil.copy2(netplan_path, backup_path)
                print(f"DEBUG: Backed up {netplan_path} to {backup_path}", file=sys.stderr, flush=True)
            else:
                backup_path = None

            # Detect if config contains a bond or bridge (skip netplan try if so)
            has_bond = 'bonds' in netplan.get('network', {}) and netplan['network']['bonds']
            has_bridge = 'bridges' in netplan.get('network', {}) and netplan['network']['bridges']
            if has_bond or has_bridge:
                # Write new config
                write_netplan(NETPLAN_FILE, netplan)
                print(f"DEBUG: Wrote netplan file {NETPLAN_FILE} (bond/bridge present), skipping netplan try", file=sys.stderr, flush=True)
                print(json.dumps({
                    'result': 'skipped_try',
                    'warning': 'Netplan try is not supported for bonds or bridges. Configuration was written, but not tested. Please use netplan apply and verify manually.'
                }), file=sys.stdout, flush=True)
                # Clean up backup file if it exists
                if backup_path and os.path.exists(backup_path):
                    os.remove(backup_path)
                    print(f"DEBUG: Removed backup file {backup_path}", file=sys.stderr, flush=True)
                return

            try:
                # Write new config
                write_netplan(NETPLAN_FILE, netplan)
                print(f"DEBUG: Successfully wrote netplan file {NETPLAN_FILE} for testing", file=sys.stderr, flush=True)
                # Test the configuration
                apply_netplan_changes(timeout)
                print(f"DEBUG: Successfully tested and applied netplan configuration", file=sys.stderr, flush=True)
                print(json.dumps({'result': 'success'}), file=sys.stdout, flush=True)
                return
            except Exception as e:
                # If netplan try failed, restore the backup
                if backup_path and os.path.exists(backup_path):
                    shutil.copy2(backup_path, netplan_path)
                    print(f"DEBUG: Restored {netplan_path} from {backup_path} after failure", file=sys.stderr, flush=True)
                elif backup_path is None and os.path.exists(netplan_path):
                    # If there was no original file, remove the new one
                    os.remove(netplan_path)
                    print(f"DEBUG: Removed new file {netplan_path} after failure (no original existed)", file=sys.stderr, flush=True)
                raise
            finally:
                # Clean up backup file if it exists
                if backup_path and os.path.exists(backup_path):
                    os.remove(backup_path)
                    print(f"DEBUG: Removed backup file {backup_path}", file=sys.stderr, flush=True)
        
        elif action == 'apply_config':
            # Apply netplan configuration (assumes config is already written)
            apply_netplan_changes()
            print(f"DEBUG: Successfully applied netplan", file=sys.stderr, flush=True)
            
            print(json.dumps({'result': 'apply_success'}), file=sys.stdout, flush=True)
            return
        
        elif action == 'set_interface_state':
            # Set interface up/down state via netplan configuration
            iface_name = config.get('name')
            state = config.get('state', 'up').lower()
            
            if not iface_name:
                print(json.dumps({'error': 'Interface name is required'}), flush=True)
                sys.exit(1)
            
            if state not in ['up', 'down']:
                print(json.dumps({'error': 'State must be "up" or "down"'}), flush=True)
                sys.exit(1)
            
            # Determine the correct section based on interface type
            target_section = None
            target_config = None
            
            if iface_name.startswith('bond'):
                # Bond interface
                if 'bonds' in network and iface_name in network['bonds']:
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
                else:
                    network.setdefault('bonds', {})
                    network['bonds'][iface_name] = {'interfaces': []}
                    target_section = 'bonds'
                    target_config = network['bonds'][iface_name]
            elif iface_name.startswith('br'):
                # Bridge interface
                if 'bridges' in network and iface_name in network['bridges']:
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
                else:
                    network.setdefault('bridges', {})
                    network['bridges'][iface_name] = {'interfaces': []}
                    target_section = 'bridges'
                    target_config = network['bridges'][iface_name]
            elif '.' in iface_name and not iface_name.startswith('br'):
                # VLAN interface
                if 'vlans' in network and iface_name in network['vlans']:
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
                else:
                    network.setdefault('vlans', {})
                    parts = iface_name.split('.')
                    network['vlans'][iface_name] = {
                        'id': int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 1,
                        'link': parts[0] if len(parts) > 0 else 'eth0'
                    }
                    target_section = 'vlans'
                    target_config = network['vlans'][iface_name]
            else:
                # Regular interface
                add_empty_ethernets(network, [iface_name])
                target_section = 'ethernets'
                target_config = network['ethernets'][iface_name]
            
            # Set interface state
            if target_config is not None:
                if state == 'up':
                    # Enable DHCP for UP state (or keep existing static config)
                    if 'addresses' not in target_config and 'dhcp4' not in target_config:
                        target_config['dhcp4'] = True
                    # Remove any explicit 'optional' setting that keeps interface down
                    target_config.pop('optional', None)
                else:  # down
                    # Set interface as optional (won't be brought up automatically)
                    target_config['optional'] = True
                    # Remove DHCP if no static addresses
                    if 'addresses' not in target_config:
                        target_config.pop('dhcp4', None)
                        target_config.pop('dhcp6', None)
                
                print(f"Set {iface_name} state to {state} in {target_section} section", file=sys.stderr, flush=True)
            else:
                raise Exception(f"Could not determine configuration section for interface {iface_name}")
        
        else:
            print(json.dumps({'error': 'Unknown action'}), file=sys.stdout, flush=True)
            sys.exit(1)

        # Write and apply config for actions that modify it
        if action not in ['load_netplan', 'try_config', 'apply_config']:
            write_netplan(NETPLAN_FILE, netplan)
            apply_netplan_changes()
            print(json.dumps({'success': True}), flush=True)
            
    except Exception as e:
        print(f"DEBUG: Exception occurred: {e}", file=sys.stderr, flush=True)
        print(f"DEBUG: Exception type: {type(e).__name__}", file=sys.stderr, flush=True)
        print(json.dumps({
            'error': str(e),
            'trace': traceback.format_exc()
        }), flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
