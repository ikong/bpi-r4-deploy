# Next Session Briefing

## Project

LuCI module for BPI-R4 (MT7988A, WiFi 7). Three-layer architecture:
- `layer1.js` — raw HW access (UCI, ubus, iw, hostapd_cli, wpa_cli, sysfs)
- `layer2.js` — structured data model (radio_get_all, mld_get_all, clients_get_all, uplink_get_all, …)
- `layer3.js` — wizard orchestration (wizard_ap, wizard_mlo, wizard_sta, wizard_repeater, wizard_country)
- `index.js` — view (6 tabs, Basic/Advanced mode, 5 modal wizards, apply flow)

Router: `root@192.168.1.1`. Files deploy via `cat file | ssh root@192.168.1.1 'cat > /path'` (no sftp).  
Web root: `/www/luci-static/resources/wifimgr/` and `/www/luci-static/resources/view/wifimgr/`.

## Current Router State (end of 2026-05-05)

The router was restarted multiple times during txpower testing. After the final `wifi reload`:
- `sta-mld0` MLD connection to `STA_MLD` may not be fully re-established
- `ap-mld-1` may be partially up (some links missing until hostapd finishes MLD setup)
- `network.wwan` DHCP interface exists but has **no IP lease** (see Known Issues)
- `wireless.radio1.txpower` is **not set** in UCI (correct — was restored after test)

If links look incomplete: `wifi restart` (full stop/start) usually recovers faster than `wifi reload`.

## What Was Completed Today

### Commits (newest first)

| Hash | Summary |
|------|---------|
| `740fbc4` | Fix clients EHT detection, WiFi 7 summary count, per-link uplink data |
| `5cc77e3` | Fix iw_dev data traversal bug (4 callers in layer2) |
| `33072a8` | SESSION_REPORT.md |
| `0e6ce7d` | UI redesign (index.js) + radio up:false + txpower 13 dBm fixes |

### Bugs fixed today

**iw_dev data traversal (critical, 4 places in layer2.js)**  
`iw_dev()` returns `ok({ raw, interfaces: parseIwDev(...) })`. All four callers were doing
`for (const phyData of Object.values(devRes.data))` which iterates `[rawString, phyMap]`.
Neither has `.interfaces`, so all inner loops were no-ops:
- `clients_get_all` → always returned `[]`
- `buildStaIfaceMap` → always `{ mlo: null, legacy: {} }` → `uplink_get_all` returned `[]`
- `radio_get_all` → `iwTxpower` map always empty
- `mld_get_all` → `iwLinkTxp` map always empty

Fix: `Object.values(devRes.data.interfaces || {})` in all four places.

**Per-link BW/Signal/TX/RX dashes in WiFi Connection tab**  
`parseStaMldLinks` parses `iw dev sta-mld0 link` which only has BSSID + freq per link.
Signal, bitrate, and BW come from `iw station dump` per-link data which was already fetched
but only used for aggregate signal. Fix: after `parseStaMldLinks`, enrich each link from
`dumpRes.data[0].links[link_id]`; BW parsed from bitrate string ("288.2 MBit/s **160MHz**…").

**EHT flag not detected / WiFi 7 summary count wrong**  
`extractClientFlags` checked `staData.eht_capab_info` — hostapd outputs `eht_capab` (no `_info`).
Fix: added `eht_capab` to the check. Also both WiFi 7 summary counters (Overview + Clients tabs)
used `flags.indexOf('EHT')` while the badge used `c.is_mld` — changed both counters to `c.is_mld`.

## Known Issues

### MLO STA DHCP — no lease
`network.wwan` DHCP interface created; `udhcpc` sends discovers from `sta-mld0` but no OFFER.
`tcpdump` captured IGMP query from `192.168.2.1` on `sta-mld0` → the upstream AP (`STA_MLD`)
is on `192.168.2.x`, not `10.20.30.x` as expected. Root cause is a subnet mismatch on the
upstream AP. **Cannot probe further without write access to the upstream router (10.20.30.1).**

### L2 testing (relayd / WDS) blocked
Verifying L2 bridging requires confirming that the router's MAC appears on the upstream switch.
Needs read/write access to the upstream router.

### Browser UI not fully validated
Spot-checked only. Not exercised:
- All 5 modal wizards (open → fill → submit → apply flow)
- Repeater wizard (two-radio flow)
- Country wizard (reboot flow)
- Clients tab Disconnect button (requires associated STA)
- Diagnostics tab txpower section (needs all 3 bands active)
- Poll flicker on active form inputs during background refresh

### `phy0.1-sta1` orphan interface
After multiple `wifi reload` cycles a `phy0.1-sta1` managed interface appears in `iw dev`
alongside `sta-mld0`. It has no associations and no txpower. Likely a leftover from the
MLO STA driver teardown sequence. Clears on fresh `wifi restart`.

## HW Quirks Discovered Today

### MT7988A txpower behavior with sku_disable=0, sku_idx=0 (CZ)

Test: set `wireless.radio1.txpower=15`, `uci commit`, `wifi reload`.

**Result: txpower=15 took effect.** `iw dev` showed sta-mld0 link 1 (5 GHz) change from
23 dBm → 15 dBm. The `txpower` UCI parameter is **not ignored** — it works as a requested
operating power. The SKU table enforces a **ceiling**, not a floor: you can reduce below
the SKU max but cannot exceed it.

`txpower_info` sysfs `MU TX Power (Auto/Manual): 26/0 [0.5 dBm]`:
- This is **not** the operating txpower. It is the MT76 driver's MU-MIMO specific power cap
  (26 × 0.5 dBm = 13 dBm). The radio operating power (23 dBm) is separate and visible in
  `iw dev` per-interface/per-link `txpower` field.
- `TX Front-end Loss` changed from `6,6,6,6` → `4,4,4,4` after setting txpower=15 and reload.
  The driver recalculates front-end loss calibration when target power changes. Meaning unclear;
  needs Layer 0 documentation to interpret.

**Unexpected SKU state change after powercycle:**  
Before powercycle: `txpower_info` showed `SKU: enable` for band1 (5 GHz).  
After powercycle: `txpower_info` showed `SKU: disable` for band1.  
Country and sku_idx were unchanged (both still `CZ` / `0`). Root cause unknown — possibly
the wifi reload + power-off sequence left the driver in a state that persisted in a config
file, or the MT76 firmware initialises SKU differently on cold boot vs warm reload.
**This should be investigated** before implementing the txpower UI control.

## Suggested Next Steps (in order)

1. **Verify all fixes from today work** — reload LuCI page in browser, check:
   - Clients tab shows connected clients (iw_dev traversal fix)
   - WiFi Connection per-link table has BW/Signal/TX/RX values
   - WiFi 7 summary count matches badge count

2. **Full UI walkthrough** — exercise every tab and wizard in both Basic and Advanced modes.
   File any rendering bugs found.

3. **Investigate SKU: enable → disable change after powercycle.**  
   Fresh cold boot → read `txpower_info` for all 3 bands. Compare with warm-reload state.
   Check if `sku_disable` sysfs knob or UCI config is being modified somewhere in the
   wifi reload path.

4. **txpower UI control design** — based on the confirmed HW behavior:
   - Display: show `iw dev` per-link txpower as actual operating power
   - Control: `radio_set(id, { txpower: value })` works; clamp UI slider to known band max
   - When `sku_disable=0`: UI should note "SKU regulated — max N dBm" and grey out values above
   - When `sku_disable=1`: UI should allow up to eFuse max
   - Do not rely on `txpower_info` MU field for operating power

5. **Resolve MLO STA DHCP** — requires coordinating with whoever manages the upstream AP
   (`STA_MLD` / 192.168.2.x network). Confirm correct subnet, then test DHCP + connectivity.

6. **L2 method testing (relayd / WDS)** — blocked on upstream router access.
