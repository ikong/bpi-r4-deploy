# BLOK C — wizardStation Test Results
**Session 11 — 2026-05-09**

## Test setup

| Role | Router | IP | Notes |
|------|--------|----|-------|
| MLO AP (target) | 10.20.30.1 | — | factory ap_mld_1, SSID MT76_AP_MLD, sae-mixed/testtest |
| STA test device | 192.168.1.1 | — | wizardStation run here; has direct LAN access |

> Note: Roles are opposite to initial plan — STA wizard was run on 192.168.1.1,
> connecting to 10.20.30.1's MT76_AP_MLD AP. 10.20.30.1 is accessible only via
> IPsec tunnel; network restart would break the tunnel (wifi reload only).

## Test cases

### C1 — 2G STA (radio0)
| Item | Value |
|------|-------|
| Radio | radio0 (2.4 GHz) |
| Target SSID | OpenWrt-2g |
| Encryption | sae-mixed / testtest |
| Interface | wwan |
| Result | **PASS** |
| IP obtained | Yes (DHCP via wwan) |
| Notes | Required fix: `uci_ensure_network_iface` — wwan entry missing from /etc/config/network |

### C2 — 5G STA (radio1)
| Item | Value |
|------|-------|
| Radio | radio1 (5 GHz) |
| Target SSID | OpenWrt-5g |
| Encryption | sae-mixed / testtest |
| Interface | wwan |
| Result | **PASS** |
| IP obtained | Yes (DHCP via wwan) |
| Notes | Required fix: sae-mixed added to STA_ENC_OPTS (was missing, caused SCANNING forever) |

### C3 — MLO STA (radio0 + radio1 + radio2)
| Item | Value |
|------|-------|
| Radios | radio0 + radio1 + radio2 |
| Target SSID | MT76_AP_MLD |
| Encryption | sae-mixed / testtest |
| Interface | sta-mld0 |
| Network (L3) | wwan |
| Result | **PASS** |
| IP obtained | 192.168.2.149/24 via DHCP |
| Gateway | 192.168.2.1 (10.20.30.1 LAN) |
| Ping | 0% loss, ~1 ms RTT |
| Links | CH1 (2.4G) + CH52 (5G) + CH37 (6G), all 3 active |
| Peak UL (5G) | 1441 Mbit/s EHT MCS9 NSS3 |
| Notes | AP side (10.20.30.1 Clients tab) confirmed all 3 links |

## Bugs found and fixed

### Fix 1 — wwan network entry missing (`c66ed81`)
**Symptom:** STA added successfully but no IP obtained — `ubus call network.interface.wwan status` → interface not found.  
**Root cause:** `iface_add` in layer2 wrote the wireless UCI entry but didn't create `network.wwan=interface;proto=dhcp`. netifd never started DHCP client.  
**Fix:** `uci_ensure_network_iface(name)` added to layer1; called by `iface_add` for `mode === 'sta'`.

### Fix 2 — SSID duplicate check blocked STA (`6c55fac`)
**Symptom:** wizardStation rejected adding STA with same SSID as an existing local AP.  
**Root cause:** `iface_add` SSID duplicate check ran for all modes including STA.  
**Fix:** Condition changed to `if (params.ssid && mode !== 'sta')`.

### Fix 3 — sae-mixed missing from STA encryption selector (`f4e599d`)
**Symptom:** wizardStation offered only auto/WPA3/WPA2/Open — no WPA2+WPA3 option. STA stuck at SCANNING when AP uses transition mode (sae-mixed).  
**Fix:** `sae-mixed` added to `STA_ENC_OPTS` for radio0 and radio1 in index.js.

### Fix 4 — MLO STA link data empty in Networks tab (`901f140`)
**Symptom:** After C3 connected, Networks tab showed links 0/1/2 all with `—` for Freq/CH/BW/TX.  
**Root cause:** `mld_get_all()` read link data via `hostapd_stat(ifname, li)` — but MLO STA uses wpa_supplicant, not hostapd. hostapd returns nothing.  
**Fix:** For `mode === 'sta'` in `mld_get_all()`: call `layer1.iw_link(ifname)` instead; parse with `parseStaMldLinks()`; compute channel from freq via `freqToChannel()`.  
**Limitation:** `iw dev sta-mld0 link` does not report `width:` or `tx power:` per link — bw_mhz and txpower remain `—` (kernel/driver limitation, not fixable in userspace).  
**Bonus fix:** iw dev MLD link channel regex changed from `^\t{3,}` to `^[ \t]{3,}` — the lines use 2 tabs + spaces, not 3 tabs.

## AP router prep changes (session 11)
- All AP networks standardized to testtest password (sae-mixed or sae)
- AP router br-lan /32 netmask bug fixed: `uci set network.lan.netmask='255.255.255.0'`
- Factory APs on 192.168.1.1 renamed: STA-2g / STA-5g / STA-6g / STA-MLO

## Known limitations confirmed
- **6G STA (non-MLO):** Not functional — driver routes band2 through MLD code path; non-MLO 6G STA scan finds nothing (confirmed by MTK manual §30.3)
- **MLO STA link BW/TX:** Kernel does not expose per-link bandwidth or txpower for managed (STA) mode interfaces via `iw link`

## Router state after BLOK C
**192.168.1.1:**
- STA-MLO (MLO AP, ap-mld-1, sae-mixed/testtest)
- cfg083579 (MLO STA → MT76_AP_MLD on 10.20.30.1, sta-mld0, wwan, 192.168.2.149)
- STA-2g / STA-5g / STA-6g (renamed factory APs)
- OpenWrt-2g / t-2g / OpenWrt-5g (legacy APs, sae-mixed/testtest)

**10.20.30.1:**
- ap_mld_1: MT76_AP_MLD (MLO AP, 3-link, sae-mixed/testtest) — target for C3

---

## Roadmap to production (v1)

### Remaining blockers
| # | Item | Notes |
|---|------|-------|
| D | wizardWDS test | BLOK D — WDS + relayd, never tested on real HW |
| D | wizardRepeater test | Exists in code, never tested on real HW |
| — | Edit form: STA + MLO STA | Quick smoke test needed |
| — | Package install test | `apk add` on clean router via local VM build tree |
| — | First-run test | Factory reset → install → full wizard flow from scratch |

**APK build:** local Ubuntu VM (aarch64_cortex-a53, MTK SDK patches). GH Actions not viable — no MTK SDK Docker image exists or will exist.

### V2 roadmap (post-production)

**Highest priority — scan (test first, 30 min):**
- `uplink_scan()` already exists in layer2
- Verify if WiFi scan works on our MTK SDK build tree
- If yes: wizardStation "Scan" button — biggest possible UX improvement (auto-detect SSID/encryption)
- If yes: Channel advisor in Radios tab (show neighbor AP occupancy, recommend least-used channel)

**WiFi 7 specific:**
- Preamble Puncturing — EHT subchannel exclusion for DFS coexistence; hostapd config exists, UI missing
- EMLSR dynamic enable/disable without reboot (need to verify driver support first)
- MLO link add/remove without reboot (currently blocked by EDCCA kernel bug)

**Diagnostics:**
- Uplink tab — dedicated STA status (signal, bitrate, roaming history, disconnect button)
- Full TX power section (TMAC / path_delta / output dBm per band, all 3 active simultaneously)

**Not planned:**
- 802.11s mesh — different architecture entirely; no WiFi 7 / MLO mesh stack exists yet
- Captive portal / traffic shaping — covered by existing luci-app-nodogsplash / luci-app-sqm
- OpenWrt packages feed submission — MTK SDK out-of-tree patches preclude mainline review
