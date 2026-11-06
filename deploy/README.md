# Deploy

The live demo runs on one small Ubuntu server: the checkout server and the demo shop as systemd services (as a non-root `till` user), and Caddy for HTTPS, serving the pay app's static build.

1. As `till`: clone the repo to `~/till`, `bun install`, put `.env` and `merchants.json` in the repo root (`chmod 600`), and set `VITE_API_URL`, `PAY_APP_URL` and `SHOP_URL` to the live URLs (`https://api.till.ishtails.xyz`, `https://pay.till.ishtails.xyz`, `https://till.ishtails.xyz`).
2. Build `apps/pay` (`bun run build`) on a bigger machine with the live `VITE_API_URL` and copy `dist/` up: on a 1 GB server the build runs out of memory.
3. As root: copy the two `.service` files to `/etc/systemd/system/`, `systemctl enable --now till-server till-shop`, and copy `Caddyfile` to `/etc/caddy/Caddyfile`, then `systemctl reload caddy`.

The agent demo runs on a laptop with the `claude` CLI, pointed at the live shop.
