# Session Report — 2026-05-05

## Implemented

### UI Redesign (index.js)
Complete rewrite of `htdocs/luci-static/resources/view/wifimgr/index.js` per `UI_BRIEF.md`:
- **6 tabs**: Overview, Radios (Advanced only), Networks, WiFi Connection (shown when STA exists), Clients (shown when AP exists), Diagnostics
- **Basic/Advanced mode toggle** — persisted in `localStorage`, rerenders active tab on change
- **Band pills** — color-coded per radio: 2.4 GHz blue, 5 GHz green, 6 GHz amber
- **Signal bars** — 5-bar SVG widget scaled from RSSI
- **5 modal wizards**: Add AP, Add MLO AP, Connect (STA/Uplink), Repeater, Country/Regulatory
- **Apply flow** — fire-and-forget `layer3.start_apply('wifi')`, poll every 3 s, phase progress bar (resetting → starting → mld_setup → ready); Basic shows plain "Applying changes...", Advanced shows phase labels
- **Poll** — tab content refreshes every 10 s via `poll.add`; only active tab is re-rendered

### layer3.js fixes
- Added `'require baseclass'` and `return baseclass.extend(Layer3)` (was bare object return — broke LuCI module system)
- Changed `'require wifimgr/layer2'` → `'require wifimgr/layer2 as layer2'`
- Fixed `load_diag` txpower extraction: `tp0 && tp0.ok ? tp0.data : null` (was reading `.raw` which does not exist)

### layer2.js — mld_get_all txpower fix
`mld_get_all()` previously read per-link txpower from sysfs `band${li}/txpower_info`:

```
MU TX Power (Auto/Manual): 26/0 [0.5 dBm]
```

`parseTxpowerDbm` interpreted this as `26 × 0.5 = 13 dBm`, which is the hardware SKU cap, not the actual operating TX power.

Fix: added `layer1.iw_dev()` to the initial `Promise.all`, built an `iwLinkTxp[ifname][linkId]` map from the parsed `mld_links[li].txpower` fields in `iw dev` output (actual per-link HW values: band0=3 dBm, band1=23 dBm, band2=5 dBm), and used that in preference to the sysfs value.

### ACL fix — /bin/ubus exec permission
`layer1.ubus_wireless_status()` calls `fs.exec('/bin/ubus', ...)`. Without an ACL entry, rpcd returns code 6 (`UBUS_STATUS_PERMISSION_DENIED`), causing `ubusRes.ok = false`. This propagated as `up: false` for all radios and missing uplink IP addresses.

Fix: added `"/bin/ubus": ["exec"]` to `root/usr/share/rpcd/acl.d/luci-app-wifimgr.json` under `read.file`.

## Tested on Router (192.168.1.1)

- MLO STA configured on `wifinet0` connecting to SSID `STA_MLD` (WiFi 7 MLO, radio0+radio1+radio2):
  - `wpa_state=COMPLETED`, signal −22 dBm
  - Per-link txpower reads correctly: band0=3 dBm, band1=23 dBm, band2=5 dBm
  - WiFi Connection tab appears in UI when STA is present
- All three radios show `up: true` after ACL fix
- New UI deployed and loaded in browser; tab navigation, Basic/Advanced toggle, and band pills verified visually

## Known Issues

### MLO STA DHCP — no lease
`network.wwan` DHCP interface created; `udhcpc` sends discovers from `sta-mld0` but receives no OFFER. tcpdump captured an IGMP query from `192.168.2.1` on `sta-mld0`, indicating the upstream AP (`STA_MLD`) is on the `192.168.2.x` subnet, not `10.20.30.x` as expected. Root cause not fully diagnosed — likely a routing or subnet mismatch on the upstream AP side.

### L2 testing (relayd / WDS) — blocked
Verifying relayd and WDS L2 bridging requires confirming that the router's MAC appears on the upstream switch/AP. This requires read/write access to the upstream router at `10.20.30.1`, which is not available in the current test setup. All L2 tests are deferred.

### Browser UI — not fully validated
The new UI was loaded and spot-checked. The following were not formally exercised end-to-end:
- All 5 modal wizards (open, fill, submit, apply flow)
- Repeater wizard (two-radio flow)
- Country wizard (reboot flow)
- Clients tab (requires associated stations)
- Diagnostics tab txpower section (requires txpower data from all 3 bands)
- Poll flicker on active form inputs during background refresh

## What Remains

- Full browser UI walkthrough of all tabs and wizards
- L2 method testing (relayd, WDS) — requires upstream router access
- Resolve MLO STA DHCP issue (upstream AP subnet mismatch)
- Validate apply flow phase labels in Advanced mode
- Test Diagnostics tab with real txpower data from all 3 bands
