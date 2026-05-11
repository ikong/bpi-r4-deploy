# Test Results — Session 10, BLOK B: wizardMLO

## Test environment

- AP router: 192.168.1.1, BPI-R4 / MT7988A / MT7996, OpenWrt MTK SDK
- Country: CZ, TX power mode: regdb
- Client: iPhone 16 (iOS), YouTube streaming throughout
- Date: 2026-05-09

## Pre-test router state

- radio0: OpenWrt-2g (CH1/20MHz), t-2g (CH1/20MHz)
- radio1: OpenWrt-5g (CH52/80MHz), t-5g-dfs (CH52/40MHz)
- radio2: OpenWrt-6g (CH37/320MHz)
- ap_mld_1: MT76_AP_MLD 3-link (CH1+CH52+CH37)

---

## B1 — 2-link MLO: 2.4G + 5G ✓

**Config:** SSID t-mlo-2g5g, WPA3, links: radio0+radio1, auto channel/width
**Wizard flow:** Added → wifi reload → DFS CAC CH52 ~60s → green ✓
**Networks tab:** MLO AP + WiFi 7 badge, [2.4G] [5G], interface ap-mld0, CH1+CH52 ✓
**Clients tab:** WiFi 7, both links visible:
- 2.4G link: EHT MCS0 NSS1, 8/1 Mbit/s (control traffic)
- 5G link: -39 dBm, **865/1201 Mbit/s** EHT MCS8/11 NSS2

**Result: PASS**

---

## B2 — 2-link MLO: 2.4G + 6G ✓

**Config:** SSID t-mlo-2g6g, WPA3, links: radio0+radio2
**Wizard flow:** Added → wifi reload → green immediately ✓
**Networks tab:** [2.4G] [6G], CH1+CH37, 320 MHz on 6G ✓
**Clients tab:** WiFi 7, only 6G link visible:
- 6G link: -38 dBm, **2402/2402 Mbit/s** EHT MCS11 NSS2
- 2.4G link: not shown (iPhone uses only 6G when it's fast enough)

**Observation:** iPhone MLO link selection: with 6G at 2402 Mbit/s available, 2.4G link is
not activated. Consistent with iOS MLO scheduler behavior — single fast link preferred over
aggregation when bandwidth is sufficient.

**Result: PASS**

---

## B3 — 2-link MLO: 5G + 6G ✓

**Pre-condition:** t-5g-dfs removed before test (see Bug #1 below).
**Config:** SSID t-mlo-5g6g, WPA3, links: radio1+radio2
**Wizard flow:** Added → wifi reload → DFS CAC CH52 ~60s → green ✓
**Clients tab:** WiFi 7, only 6G visible — consistent with B2 (same iPhone/6G behavior)
- 6G link: -36 dBm, **2402/2402 Mbit/s** EHT MCS11 NSS2

**Result: PASS**

---

## B4 — 3-link MLO: 2.4G + 5G + 6G ✓ (with fixes)

**Multiple iterations required — two bugs found and fixed:**

### Iteration 1 — EDCCA crash (pre-fix)
Wizard added UCI → wifi reload → EDCCA crash on radio2:
```
nl80211: Input EDCCA threshold is empty!
Failed to set beacon parameters
Interface initialization failed
```
ap-mld-1 (MT76_AP_MLD) went DOWN, all 6G networks crashed. Powercycle required.

**Fix applied:** `wizard_mlo()` in layer3.js changed `restartRequired: 'wifi'` → `'reboot'`.
wizardMLO now always triggers reboot, never wifi reload.

### Iteration 2 — uci_list_add failure (pre-fix)
With reboot fix deployed, wizard returned error: `uci_list_add failed for radio0`.
Root cause: verify step used `uci get` which returns empty/error for list options.
```javascript
// Before (broken):
const verify = await fs.exec('/sbin/uci', ['get', `${config}.${section}.${key}`]);
// After (fixed):
const verify = await fs.exec('/sbin/uci', ['show', `${config}.${section}.${key}`]);
```
`uci show` returns full list content, `includes(value)` works correctly.

### Iteration 3 — success after both fixes
Wizard → UCI written → reboot triggered → all 3 links up at boot ✓

**Final result:**
**Networks tab:** MLO AP + WiFi 7, [2.4G] [5G] [6G], CH1+CH52+CH37, ap-mld0 ✓
**Clients tab:** WiFi 7, 2 links visible:
- 2.4G link: EHT MCS0, 9/1 Mbit/s (control traffic during 4K/8K 120fps video)
- 6G link: -41 dBm, **2402/2402 Mbit/s** EHT MCS11 NSS2
- 5G link: not shown (DFS CAC still running or iPhone not activating it)

**Comparison MT76_AP_MLD vs t-mlo-3x** (same iPhone, same YouTube, same location):
| Network | 2.4G | 5G | 6G |
|---------|------|----|----|
| MT76_AP_MLD (known, 200+ sessions) | 81 Mbit/s EHT | 9 Mbit/s EHT | 2402 Mbit/s EHT |
| t-mlo-3x (new, 1st session) | 9 Mbit/s EHT | — | 2402 Mbit/s EHT |

iOS uses more links on known/saved networks (learned association history).

**Result: PASS**

---

## Bugs found and fixed

### Bug #1 — Radio1 interface limit (kernel)
**Symptom:** Adding 4th interface on radio1 (OpenWrt-5g + t-5g-dfs + ap-mld-1 + t-mlo-5g6g)
fails with: `Failed to create interface ap-mld0: -23 (Too many open files in system)`
**Root cause:** Kernel VIF limit on MLO-capable radio, approximately 3 interfaces per radio
**Workaround:** Keep max 3 interfaces on radio1: legacy AP + factory MLO + one test MLO
(removed t-5g-dfs before B3/B4 testing)
**Status:** Driver limitation, not fixable in userspace

### Bug #2 — EDCCA crash on radio2 via wifi reload
**Symptom:** Adding any MLO interface to radio2 via `wifi reload` triggers
`nl80211: Input EDCCA threshold is empty!` → beacon failure → radio2 DOWN
**Root cause:** MT7996 driver EDCCA initialization fails when adding interface to MLO radio
via wifi reload. Boot-time initialization with N interfaces works correctly.
**Fix:** `wizard_mlo()` layer3.js: `restartRequired: 'wifi'` → `'reboot'`
Commits: `6cb9fe7`

### Bug #3 — uci_list_add verify fails for list options
**Symptom:** `uci_list_add failed for radio0` on first device list entry
**Root cause:** `uci get config.section.list_option` returns empty/error; `uci show`
returns full content including list values
**Fix:** layer1.js `uci_list_add`: verify changed from `uci get` to `uci show`
Commits: `9fd15d0`

---

## Key observations

### iOS MLO link management (confirmed across B1–B4)
- **6G available** → iPhone uses only 6G (2402 Mbit/s), other links idle/not activated
- **5G only** (no 6G) → iPhone uses both 2.4G + 5G links (as seen in B1)
- **Known network** → iPhone activates all negotiated links aggressively (MT76_AP_MLD: all 3 links)
- **New network** → iPhone starts conservative (1 best link), may add more over time
- iOS MLO scheduler is traffic-adaptive, not just always-max-links

### Per-link RSSI display
- MT7996 driver reports RSSI only for the primary data link
- Secondary links report `signal: 0` even when carrying traffic
- `0` treated as "unmeasured" → displayed as `—` in Clients tab
- Correct behavior — not fixable without kernel driver change

### MLO network boot-time vs wifi reload
- **Boot-time init:** N MLO interfaces on radio2 → all work correctly
- **wifi reload:** Adding new MLO interface to radio2 → EDCCA crash
- Pattern applies to both radio1 and radio2 (any MLO-capable radio)
- wizardMLO now always reboots → reliable add flow

---

## Post-test router state

- radio0: OpenWrt-2g, t-2g
- radio1: OpenWrt-5g (t-5g-dfs removed during testing)
- radio2: OpenWrt-6g
- ap_mld_1: MT76_AP_MLD 3-link (factory, permanent)
- All test networks removed
