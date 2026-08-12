# Clawland multiplayer — deploy

Two always-on realms: **Phobos** (`:4577`) and **Deimos** (`:4578`).

## What only *you* can do (Oracle account — ~5 min)
I can't create the account or click through Oracle's console (it's tied to your identity + card, and I have no access to it). These steps are yours:

1. **oracle.com/cloud/free** → sign up (throwaway email fine; debit/prepaid card just verifies, never charged on Always-Free). Pick a **home region near your players** (permanent).
2. **Compute → Instances → Create** → image **Ubuntu 24.04**, shape **Ampere VM.Standard.A1.Flex** (2 OCPU / 12 GB). Upload your SSH public key. If you hit *"Out of host capacity,"* retry / switch Availability Domain — it's not you.
3. **Networking → your VCN → Security List → add Ingress rules:** Source `0.0.0.0/0`, TCP, destination ports **4577** and **4578**.

## What's turnkey (paste, and I can help live)
On the box:
```bash
ssh -i your-key ubuntu@YOUR_PUBLIC_IP
# get the code onto the box (git clone your repo, OR scp the claudemon folder up)
cd claudemon
bash deploy/setup.sh
```
That installs Node, opens the box firewall, and runs **both realms as auto-restarting systemd services**. Then:

- Phobos → `http://YOUR_PUBLIC_IP:4577`
- Deimos → `http://YOUR_PUBLIC_IP:4578`

## Optional later: HTTPS/wss + a domain
For a clean `https://` address (needed if the client is ever served from a secure origin), point a domain at the IP and put **Caddy** in front (auto-TLS). Not required for the MVP — players can hit the `http://IP:port` directly.

## Handy
```bash
journalctl -u clawland-phobos -f          # live logs
sudo systemctl restart clawland-phobos    # restart a realm
git pull && sudo systemctl restart clawland-phobos clawland-deimos   # deploy an update
```
