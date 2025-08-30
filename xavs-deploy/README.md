# Kolla Ansible GUI - Enhanced Progress Tracking

## Overview

This enhanced version of the Kolla Ansible deployment GUI provides structured progress tracking instead of just raw terminal output. Users can now see:

- **Real-time task status** (success, error, skipped, changed, unreachable)
- **Playbook progress** with current status
- **Summary statistics** showing counts of each task result type
- **Detailed task information** including duration and messages
- **Collapsible raw output** for troubleshooting

## Key Features

### 1. **Structured Progress Display**
- Visual indicators for each task status using color-coded icons
- Real-time updates as tasks complete
- Host-specific information for each task
- Task duration tracking

### 2. **Summary Statistics**
- Live counters for:
  - ✓ Successful tasks (ok)
  - ⚡ Changed tasks 
  - ✗ Failed tasks
  - ⊘ Skipped tasks
  - ⚠ Unreachable hosts

### 3. **Playbook Status**
- Shows current playbook name
- Indicates overall status (Running/Completed/Failed/Stopped)
- Host count information

### 4. **Modern Row-Based Layout**
- **Row 1 - Controls**: Horizontal grid layout with Action selection, Service targeting, and Host management
- **Row 2 - Deployment Progress**: Dedicated space for playbook status, task tracking, and summary statistics
- **Row 3 - Raw Output**: Full console output for debugging and detailed monitoring
- **Host List Display**: Shows all available hosts from inventory in a readable, comma-separated format
- **Responsive Design**: Adapts layout for desktop, tablet, and mobile devices
- **XAVS Brand Consistency**: Matching design system with proper color schemes

### 5. **Enhanced Error Handling**
- Graceful fallback to text parsing when JSON format is unavailable
- Detailed error messages and failure reasons
- Clear indication of user-initiated stops vs failures

## Technical Implementation

### JSON Output Parsing
The system attempts to use Ansible's JSON stdout callback for structured data:
```bash
ANSIBLE_STDOUT_CALLBACK=json kolla-ansible ...
```

### Fallback Text Parsing
When JSON output is not available, the system parses standard Ansible text output for:
- Task names from `TASK [...]` lines
- Play names from `PLAY [...]` lines  
- Task results from `ok:`, `changed:`, `failed:`, etc. lines

### Progress State Management
The application tracks:
- Current playbook name
- Task completion statistics
- Individual task results with metadata
- Overall deployment status

## Configuration

### Dynamic Host Loading
The inventory file path is set to `/root/xdeploy/nodes` and the system automatically:
- **Parses inventory file** on startup to extract all available hosts
- **Groups hosts by sections** (control, compute, network, storage, etc.)
- **Provides host selection UI** with individual checkboxes for targeted deployments
- **Includes refresh functionality** to reload hosts without restarting the application
- **Shows host count** to indicate how many hosts were found
- **Graceful fallback** to "All hosts" mode if inventory parsing fails

#### Inventory File Support
The system parses standard Ansible inventory format including:
- All section types (`[control]`, `[compute]`, `[network]`, etc.)
- Host entries with ansible variables (`host ansible_host=IP ansible_user=user`)
- Automatic filtering of special sections (`:children`, `:vars`)
- Comments and empty line handling
- Error recovery for malformed files

### Host Selection Options
- **All Hosts Mode** (default): Uses all hosts in inventory
- **Individual Selection**: Choose specific hosts for targeted operations
- **Visual Feedback**: Selected hosts shown as removable pills
- **Dynamic Updates**: Host list updates when inventory file changes

### Hardcoded Inventory
The inventory file path is hardcoded to `/root/xdeploy/nodes` as requested.

### Supported Commands
All standard Kolla Ansible commands are supported:
- bootstrap-servers (default)
- prechecks, deploy, post-deploy
- pull, reconfigure, upgrade, stop
- And others...

### Service Targeting
Commands that support the `-t` flag will show service selection options.
Commands like `bootstrap-servers` automatically disable service selection.

## UI Components

### Progress Section
- **Playbook Progress**: Shows current playbook and status
- **Summary Stats**: Live counters with color coding
- **Tasks List**: Scrollable list of completed tasks with details

### Raw Output
- Collapsible section showing full Ansible output
- Useful for debugging and detailed troubleshooting
- Maintains all original console functionality

## Usage

1. **Select Action**: Choose the Kolla Ansible command to run
2. **Choose Services** (if applicable): Select specific OpenStack services to target
3. **Select Hosts**: Choose specific hosts or use "All hosts"
4. **Run**: Click Run to start the deployment
5. **Monitor**: Watch the structured progress display for real-time updates
6. **Review**: Check the raw output section for detailed logs if needed

## Benefits

- **Better User Experience**: Clear visual feedback on deployment progress
- **Easier Troubleshooting**: Quickly identify failed tasks and their reasons
- **Professional Interface**: Modern, responsive design with meaningful status indicators
- **Backwards Compatibility**: Falls back gracefully to text parsing when needed
- **Complete Information**: Maintains access to full console output when needed

## Demo

See `demo.html` for a visual preview of what the progress display looks like with sample data.
