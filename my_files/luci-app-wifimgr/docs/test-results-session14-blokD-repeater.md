# BLOK D — wizardRepeater Test Results
**Session 14 — 2026-05-10**

## Test setup

| Role | Router | IP | Notes |
|------|--------|----|-------|
| STA test device | 192.168.1.1 | — | wired, wizard run here |
| AP target | 10.20.30.1 | — | IPsec tunnel; wifi reload only |
| Uplink SSID | OpenWrt-2g | radio0 | sae-mixed/testtest on 10.20.30.1 |
| Local AP SSID | repeater-5g | radio1 | created by wizard on 192.168.1.1 |

## Test case

### D2 — wizardRepeater (radio0 uplink + radio1 local AP)

| Item | Value |
|------|-------|
| Uplink radio | radio0 (2.4 GHz) |
| Uplink SSID | OpenWrt-2g (sae-mixed/testtest) |
| Local AP radio | radio1 (5 GHz) |
| Local AP SSID | repeater-5g |
| STA interface | phy0.0-sta1, wpa_state=COMPLETED |
| wwan IP | 192.168.2.198/24 from AP router DHCP |
| Local AP interface | phy0.1-ap2, state=ENABLED |
| iPhone on repeater-5g | 192.168.1.126/24, GW 192.168.1.1 |
| Ping upstream GW | 0% packet loss to 192.168.2.1 |
| Result | **PASS** |
| Notes | L3 NAT repeater — clients get STA router IP, traffic NAT'd to upstream |

## Bugs found and fixed

### Fix 1 — AP iface missing network='lan'
**Symptom:** Repeater AP (`repeater-5g`) created with `net=` empty → clients couldn't get DHCP.  
**Root cause:** `wizard_repeater` in layer3 passed `ap_params` without `network` field. `iface_add` doesn't auto-add network for AP mode.  
**Fix:** `wizard_repeater` now uses `Object.assign({ encryption: apEnc, network: 'lan' }, ap_params)`.

### Fix 2 — No validation for same radio selection
**Symptom:** Wizard allowed selecting radio0 for both uplink STA and local AP → two STAs on same radio, neither connected.  
**Fix:** Validation added before `applyFlow`: if `uplinkRadioSel.value === apRadioSel.value` → show error "Uplink and local AP must use different radios".

### Fix 3 — apRadioSel default conflicts with uplinkRadioSel
**Symptom:** `apRadioSel` defaults to radio0. If user selects radio0 as uplink, they get the validation error without an obvious fix.  
**Fix:** When step2 opens, auto-switch `apRadioSel` to the opposite radio: `if (apRadioSel.value === uplinkRadioSel.value) apRadioSel.value = ...`.

### Fix 4 — No repeater badge in Networks tab
**Symptom:** Repeater STA appeared in Networks tab without any indication it's a repeater uplink.  
**Fix:** `wizard_repeater` tags the STA UCI iface with `repeater='1'`. `iface_get_all()` exposes `repeater: sec.repeater === '1'`. `netRow()` shows green "repeater" badge when `iface.repeater` is true.

## Technical observations

- **wpa_supplicant contention:** With MLO STA active (all 3 radios) + repeater STA on radio0, wpa_supplicant logs `SCAN-FAILED ret=-16 (EBUSY)` initially. Both STAs share the same wpa_supplicant instance. After settling (~30s), both connect successfully.
- **AP ifname numbering:** Repeater AP on radio1 got ifname `phy0.1-ap2` (not ap1) because radio1 already had STA-5g on phy0.1-ap0 and STA-MLO taking phy0.1-ap1. netifd auto-increments.
- **L3 vs L2:** Repeater is pure L3 NAT. Clients get 192.168.1.x from STA router dnsmasq and use 192.168.1.1 as gateway. No DHCP forwarding, no L2 bridge. Contrast with relayd (L2 bridge, clients get upstream IP).
- **"No internet" in test:** Expected — AP router (10.20.30.1) test setup doesn't have WAN configured for 192.168.2.x subnet. Not a repeater bug.

## BLOK D final summary

| Test | Result |
|------|--------|
| D1 WDS (4-address bridge) | ✓ PASS |
| D1 relayd (ARP proxy bridge) | ✓ PASS |
| D2 Repeater (L3 NAT) | ✓ PASS |

**All BLOK D tests complete. All wizards tested on real hardware.**

## Roadmap to production (v1)

| # | Item | Status |
|---|------|--------|
| — | Edit form smoke test (STA + MLO STA) | TODO ~15 min |
| — | Package install test (`apk add` clean router) | TODO ~1 hr |
| — | First-run test (factory reset → install → wizards) | TODO ~2 hr |
| bonus | WDS/relayd/repeater on 5G | TODO |
| bonus | MLO variants of L2/L3 modes | TODO |
