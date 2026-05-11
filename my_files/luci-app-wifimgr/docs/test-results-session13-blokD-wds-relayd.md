# BLOK D — wizardWDS + relayd Test Results
**Session 13 — 2026-05-10**

## Test setup

| Role | Router | IP | Notes |
|------|--------|----|-------|
| STA test device | 192.168.1.1 | — | wired, wizards run here |
| AP target | 10.20.30.1 | — | IPsec tunnel; wifi reload only (network restart kills tunnel) |
| AP target SSID | OpenWrt-2g | — | radio0, sae-mixed/testtest, on 10.20.30.1 |

## Test cases

### D1 — WDS (4-address mode bridge)

| Item | Value |
|------|-------|
| AP side | wds-test AP on radio0 (10.20.30.1), Open encryption, wds=1 |
| STA side | wds-test STA on radio0 (192.168.1.1), Open, wds=1 |
| Result | **PASS** |
| Verification | `iw dev phy0.0-sta0 info` → `4addr: on` |
| Bridge FDB | AP MAC visible in `bridge fdb show br-lan` |
| Link state | wpa_state=COMPLETED, Signal −38 dBm |
| Throughput | 286.7 Mbit/s EHT-MCS 11 WiFi 7 |
| Notes | WDS badge shown in Networks tab; WDS checkbox in wizardAP and edit form |

### D1 — relayd (ARP proxy bridge)

| Item | Value |
|------|-------|
| Wizard | WDS / Bridge → type "relayd (ARP proxy)" |
| Target SSID | OpenWrt-2g (10.20.30.1, sae-mixed/testtest) |
| Radio | radio0 (2.4 GHz) |
| STA network | relayd_up (DHCP) |
| relay_bridge | relayd_up + lan, proto=relay, forward_bcast=1, forward_dhcp=1 |
| relayd process | `/usr/sbin/relayd -I phy0.0-sta1 -I br-lan -B -D` |
| Client test | iPhone on STA-2g → IP **192.168.2.164/24**, GW 192.168.2.1 (AP router DHCP) |
| Result | **PASS** |
| Clean test | Full end-to-end: Remove → hard refresh → wizard → verified without manual intervention |

## Bugs found and fixed

### Fix 1 — relayd bridged wrong interface (MLO STA instead of new STA)
**Symptom:** `relayd -I sta-mld0 -I br-lan` — used MLO STA instead of new relayd STA.  
**Root cause:** `wizard_relayd` used `network='wwan'`; MLO STA (wifinet0) also uses `network='wwan'`. relayd's init script resolves 'wwan' → first interface in `/var/state/network` = sta-mld0.  
**Fix:** `wizard_relayd` (layer3) now uses `network='relayd_up'`; `relayd_setup` bridges `'relayd_up' ↔ 'lan'`.

### Fix 2 — clients got 192.168.1.x instead of 192.168.2.x from AP router
**Symptom:** iPhone connected to STA-2g got 192.168.1.164 (STA router LAN), not 192.168.2.x (AP router DHCP via relay).  
**Root cause:** Local dnsmasq on br-lan responds to DHCP faster than the relay can forward to upstream AP router.  
**Fix:** `relayd_setup` (layer1) now automatically sets `dhcp.lan.ignore=1` and restarts dnsmasq. `relayd_remove` restores it.

### Fix 3 — relayd badge shown on all interfaces (including APs)
**Symptom:** All Networks tab entries showed "relayd" badge after wizard ran.  
**Root cause:** `relayd_get()` returned `uplink_nets: ['relayd_up', 'lan']`; badge check used `.includes()` → matched all AP ifaces with `network='lan'`.  
**Fix:** `relayd_get()` now returns `uplink_net: nets[0]` (single string, first net = uplink only). Badge check uses `=== uplink_net`.

### Fix 4 — Remove button didn't clean up relayd network config
**Symptom:** Removing relayd STA via UI left `network.relay_bridge`, `network.relayd_up`, and `dhcp.lan.ignore=1` in UCI. dnsmasq stayed disabled.  
**Fix:** Remove button in `netRow()` detects if removed iface is relayd uplink (`iface.network === data.relayd.uplink_net`) and auto-calls `layer2.relayd_remove()` after `iface_remove()`.

### Fix 5 — wizard_relayd used old cached layer3.js (first test run)
**Symptom:** First wizard test ran with old browser-cached layer3.js → STA got `network='wwan'` instead of `'relayd_up'`. Wizard appeared to succeed but relayd bridged wrong interface.  
**Workaround:** Hard refresh (Cmd+Shift+R) before running wizard. Second clean test confirmed fix works end-to-end.

## relayd technical notes

- `/etc/init.d/relayd` reads all `proto=relay` interfaces from network UCI via `config_foreach start_relay interface`
- Resolves network names to kernel ifnames via `fixup_interface()` + `/var/state/network`
- `service_triggers`: `procd_add_raw_trigger "interface.*" 2000 /etc/init.d/relayd restart` — restarts on every interface event (2 s debounce)
- Startup timing: relayd resolves ifnames at start time. If `relayd_up` DHCP hasn't completed yet, `/var/state/network` won't have ifname → relayd won't start. Automatic retry via interface trigger once DHCP completes.
- `relayd` package: `relayd-2025.10.04~708a76fa-r1`, installed via `apk`, autostart via `/etc/rc.d/S80relayd`

## New features added (UI)

- **"relayd" badge** (blue) in Networks tab on STA entry that serves as relay uplink
- **Auto dnsmasq management**: wizard enables `dhcp.lan.ignore=1`; remove restores it
- **`relayd_get()` in layer2**: detects active relayd config, exposes `uplink_net` to UI via `data.relayd`
- **Remove cleanup**: Remove button auto-calls `relayd_remove()` for relayd uplink STAs

## Router state after BLOK D (WDS + relayd)

**192.168.1.1 (STA router):**
- STA-2g / STA-5g / STA-6g (renamed factory APs, permanent)
- STA-MLO (MLO AP, ap_mld_1, sae-mixed/testtest, permanent)
- MT76_AP_MLD STA (MLO STA → 10.20.30.1, sta-mld0, wwan, permanent)
- OpenWrt-2g relayd STA (radio0, relayd_up) — added/removed during test

**10.20.30.1 (AP router):**
- MT76_AP_MLD (MLO AP, 3-link, sae-mixed/testtest)
- OpenWrt-2g (radio0, sae-mixed/testtest) — relayd/WDS/repeater test target

---

## Remaining BLOK D

| # | Test | Status |
|---|------|--------|
| D1 WDS | wizardWDS → WDS (4-address) | **PASS** |
| D1 relayd | wizardWDS → relayd (ARP proxy) | **PASS** |
| D2 | wizardRepeater | **TODO** |

## Roadmap to production (v1)

| # | Item | Status |
|---|------|--------|
| D2 | wizardRepeater | TODO — never tested on HW |
| — | Edit form: STA + MLO STA smoke test | TODO |
| — | Package install test (`apk add` on clean router) | TODO |
| — | First-run test (factory reset → install → wizard flow) | TODO |
| — | UX: Manual TX power "Apply & Reboot" only on mode change | TODO |
