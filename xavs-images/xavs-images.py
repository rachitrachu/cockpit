#!/usr/bin/env python3
import os, tarfile, subprocess, json, shlex
from flask import Flask, request, jsonify

app = Flask(__name__)

# Paths / constants
XDEPLOY_DIR = '/root/xdeploy/xdeploy-images/'
IMAGE_LIST = '/etc/xavs/images.list'
PUBLIC_REG = 'quay.io'
LOCAL_REG_HOST = 'docker-registry:4000'      # exact host as requested
REGISTRY_CONTAINER_NAME = 'docker-registry'  # exact container name as requested

def run_cmd(cmd: str) -> str:
    """Run shell command and capture combined output."""
    p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    out = []
    for line in p.stdout:
        out.append(line)
    p.wait()
    return ''.join(out)

def docker_container_running(name: str) -> bool:
    code = subprocess.call(f"docker ps --format '{{{{.Names}}}}' | grep -w {shlex.quote(name)} >/dev/null 2>&1", shell=True)
    return code == 0

@app.route('/xavs_images/status', methods=['POST'])
def status():
    """Return whether the docker-registry container is running."""
    return jsonify({'running': docker_container_running(REGISTRY_CONTAINER_NAME)})

@app.route('/xavs_images/catalog', methods=['POST'])
def catalog():
    """Return the local registry catalog."""
    try:
        raw = run_cmd(f"curl -s http://{LOCAL_REG_HOST}/v2/_catalog")
        data = json.loads(raw)
        return jsonify({'catalog': data.get('repositories', [])})
    except Exception:
        # if registry isn't up or curl fails
        return jsonify({'catalog': []})

@app.route('/xavs_images/extract', methods=['POST'])
def extract():
    """Extract .tar.gz at provided path, load all .tar images, remove them."""
    data = request.get_json(silent=True) or {}
    path = data.get('path', '')
    log = ''
    try:
        if not (path and path.endswith('.tar.gz') and os.path.isfile(path)):
            return jsonify({'log': 'Invalid .tar.gz path'}), 400

        os.makedirs(XDEPLOY_DIR, exist_ok=True)
        # Extract tar.gz to XDEPLOY_DIR
        with tarfile.open(path, 'r:gz') as tf:
            tf.extractall(XDEPLOY_DIR)
        log += f'Extracted archive: {path}\n'

        # Load all .tar images and remove them
        for f in sorted(os.listdir(XDEPLOY_DIR)):
            if f.endswith('.tar'):
                full = os.path.join(XDEPLOY_DIR, f)
                log += f'Loading {full}…\n'
                log += run_cmd(f'docker load -i {shlex.quote(full)}')
                os.remove(full)
                log += f'Removed {full}\n'

        return jsonify({'log': log})
    except Exception as e:
        log += f'Error: {e}\n'
        return jsonify({'log': log}), 500

@app.route('/xavs_images/pull', methods=['POST'])
def pull():
    """Pull images listed in /etc/xavs/images.list from quay.io/xavs.images/."""
    log = ''
    try:
        if not os.path.exists(IMAGE_LIST):
            return jsonify({'log': f'Missing list: {IMAGE_LIST}'}), 400
        with open(IMAGE_LIST) as f:
            for line in f:
                img = line.strip()
                if not img:
                    continue
                ref = f'{PUBLIC_REG}/xavs.images/{img}'
                log += f'Pulling {ref}\n'
                log += run_cmd(f'docker pull {shlex.quote(ref)}')
        return jsonify({'log': log})
    except Exception as e:
        log += f'Error: {e}\n'
        return jsonify({'log': log}), 500

@app.route('/xavs_images/run_registry', methods=['POST'])
def run_registry():
    """Run the local docker registry container named docker-registry and write daemon.json."""
    log = ''
    try:
        # Run registry container (idempotent-ish; if exists, docker will error; that's okay, we surface output)
        cmd = (
            f'docker run -d --network host --name {shlex.quote(REGISTRY_CONTAINER_NAME)} '
            '--restart=always -e REGISTRY_HTTP_ADDR=0.0.0.0:4000 '
            '-v registry:/var/lib/registry registry:2'
        )
        log += run_cmd(cmd)

        # Write daemon.json exactly as requested
        daemon = {
            "bridge": "none",
            "insecure-registries": [LOCAL_REG_HOST],
            "ip-forward": False,
            "iptables": False,
            "log-opts": { "max-file": "5", "max-size": "50m" }
        }
        os.makedirs('/etc/docker', exist_ok=True)
        with open('/etc/docker/daemon.json', 'w') as f:
            json.dump(daemon, f, indent=2)
        log += 'Wrote /etc/docker/daemon.json with insecure-registries ["docker-registry:4000"]\n'

        return jsonify({'log': log})
    except Exception as e:
        log += f'Error: {e}\n'
        return jsonify({'log': log}), 500

@app.route('/xavs_images/restart_docker', methods=['POST'])
def restart_docker():
    """Restart Docker to apply daemon.json updates."""
    log = run_cmd('systemctl restart docker')
    return jsonify({'log': log})

@app.route('/xavs_images/push', methods=['POST'])
def push():
    """Tag pulled images to docker-registry:4000 and push; then remove public-tagged local copies."""
    log = ''
    try:
        if not os.path.exists(IMAGE_LIST):
            return jsonify({'log': f'Missing list: {IMAGE_LIST}'}), 400
        with open(IMAGE_LIST) as f:
            for line in f:
                img = line.strip()
                if not img:
                    continue
                src = f'{PUBLIC_REG}/xavs.images/{img}'
                dest = f'{LOCAL_REG_HOST}/xavs.images/{img}'
                log += f'Tagging {src} -> {dest}\n'
                log += run_cmd(f'docker tag {shlex.quote(src)} {shlex.quote(dest)}')
                log += run_cmd(f'docker push {shlex.quote(dest)}')
                # remove only the public-tagged local image; keep the local-reg tag
                run_cmd(f'docker rmi {shlex.quote(src)} || true')
        return jsonify({'log': log})
    except Exception as e:
        log += f'Error: {e}\n'
        return jsonify({'log': log}), 500

if __name__ == '__main__':
    # For local testing (Cockpit will proxy to these routes when installed as a plugin)
    app.run(host='0.0.0.0', port=5000, debug=False)
