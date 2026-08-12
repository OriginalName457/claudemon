#!/usr/bin/env bash
# ============================================================================
#  Clawland multiplayer — one-shot setup for a fresh Ubuntu box (Oracle A1 etc.)
#  Run this ON the server after the repo is present (git clone or scp):
#     bash deploy/setup.sh
#  Stands up TWO always-on realms as systemd services:  Phobos :4577  Deimos :4578
# ============================================================================
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ME="$(whoami)"
echo "==> Clawland setup | repo: $REPO | user: $ME"

# 1) Node LTS (only if missing)
if ! command -v node >/dev/null 2>&1; then
  echo "==> installing Node.js 22.x"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "==> node $(node -v)"

# 2) open the game ports (Oracle Ubuntu blocks everything but 22 by default)
echo "==> opening TCP 4577-4578 in iptables"
for P in 4577 4578; do
  sudo iptables -C INPUT -p tcp --dport "$P" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT -p tcp --dport "$P" -j ACCEPT
done
if ! command -v netfilter-persistent >/dev/null 2>&1; then sudo apt-get install -y iptables-persistent; fi
sudo netfilter-persistent save

# 3) systemd service per realm (auto-restart, survives reboot)
make_service () {
  local NAME="$1" REALM="$2" PORT="$3"
  sudo tee "/etc/systemd/system/${NAME}.service" >/dev/null <<EOF
[Unit]
Description=Clawland realm ${REALM}
After=network.target

[Service]
Type=simple
User=${ME}
WorkingDirectory=${REPO}
Environment=CLAWLAND_REALM=${REALM}
Environment=CLAWLAND_PORT=${PORT}
ExecStart=$(command -v node) ${REPO}/src/server-mp.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
}
make_service clawland-phobos Phobos 4577
make_service clawland-deimos Deimos 4578
sudo systemctl daemon-reload
sudo systemctl enable --now clawland-phobos clawland-deimos
sleep 1
sudo systemctl --no-pager --lines=3 status clawland-phobos || true

PUB="$(curl -s ifconfig.me || echo YOUR_PUBLIC_IP)"
cat <<DONE

==> DONE. Two realms are running & set to auto-start:
      Phobos   http://${PUB}:4577
      Deimos   http://${PUB}:4578

  Logs:      journalctl -u clawland-phobos -f
  Restart:   sudo systemctl restart clawland-phobos
  Update:    git pull && sudo systemctl restart clawland-phobos clawland-deimos

  ⚠ ONE THING ONLY YOU CAN DO (Oracle console, ~1 min):
    Networking → your VCN → Security List → add Ingress rules:
       Source 0.0.0.0/0 · TCP · destination ports 4577 and 4578
    (The iptables step above handles the box; this opens Oracle's cloud firewall.)
DONE
