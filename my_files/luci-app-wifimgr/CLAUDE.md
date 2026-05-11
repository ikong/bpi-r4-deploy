# CLAUDE.md — luci-app-wifimgr

## What this project is

LuCI WiFi manager package for **BPI-R4** (MediaTek MT7988A, WiFi 7 / 802.11be).
Installed on OpenWrt as `luci-app-wifimgr`. The router has a single tri-band
chip (`phy0`) with three logical radios: radio0 = 2.4 GHz, radio1 = 5 GHz,
radio2 = 6 GHz. It supports Multi-Link Operation (MLO).

**Router access:** `root@192.168.1.1` (no password).  
**Deploy files:** `cat file | ssh root@192.168.1.1 'cat > /path'` (no sftp).  
**Web root (runtime):**
- `/www/luci-static/resources/wifimgr/` — layer1/2/3.js
- `/www/luci-static/resources/view/wifimgr/` — index.js

**Repo source:** `htdocs/luci-static/resources/…` mirrors the web root layout.

---

## Architecture

Three-layer JS architecture, all running inside LuCI's rpcd/ubus sandbox:

### layer1.js — raw hardware access
Direct UCI, ubus, `iw`, `hostapd_cli`, `wpa_cli`, sysfs calls.
All write operations guarded by `hwBusy` mutex.
Key functions: `uci_get`, `uci_set`, `uci_write`, `uci_list_add`, `uci_add`,
`uci_delete`, `uci_commit`, `iw_dev`, `iw_station_dump`, `hostapd_all_sta`,
`ubus_hostapd_legacy_status`, `fs_read` (sysfs).

### layer2.js — structured data model
Builds semantic objects from layer1 calls. Never touches hardware directly.
Key functions:
- `radio_get_all()` / `radio_set(id, params)`
- `iface_get_all()` / `iface_add(radio_id, mode, params)` / `iface_set` / `iface_remove`
- `mld_get_all()` / `mld_add(radio_ids, params)` / `mld_set` / `mld_remove`
- `clients_get_all()` / `uplink_get_all()`
- `system_apply()` / `system_apply_poll()` — starts `wifi reload` and polls readiness

### layer3.js — wizard orchestration
High-level workflows that call layer2 in sequence.
Key functions:
- `wizard_ap(radio_id, params)` — creates a legacy AP via `iface_add`
- `wizard_mlo(radio_ids, params)` — creates an MLO AP via `mld_add`
- `wizard_sta(radio_id, params)` — creates a STA iface
- `wizard_repeater(uplink_radio, ap_radio, ...)` — two-iface setup
- `wizard_country(country, sku_idx)` — sets country + sku_idx, wifi restart (NOT reboot — confirmed)
- `load_all()` — fetches all data for UI render
- `start_apply(type)` / `poll_apply()` — apply flow used by index.js

### index.js — view (LuCI ES module)
Plain JS, no framework. Uses `E()` (LuCI DOM helper) wrapped as `node()`.

**Tab structure (static, always visible):**
```
Networks | Radios | Clients | Diagnostics
```
Overview tab odstraněn — Networks a Radios zobrazují živý stav + konfiguraci na jednom místě.
No Basic/Advanced mode — jeden režim, vše viditelné, cílový uživatel je experienced (BPI-R4 není noob hardware).
Defined as `TAB_DEFS` constant.

**DOM helpers (do not modify):**
`node`, `sp`, `div`, `btn`, `btnDanger`, `btnSecondary`, `inputField`,
`selectEl`, `checkbox`, `formRow`, `card`, `collapsible`, `applyFlow`,
`inlineErr`, `bandPill`, `statusBadge`, `encLabel`, `muted`, `lbl`, `val`,
`openModal`

**Global state:**
`_data`, `_diag`, `_tab`, `_tabContainers`, `_tabNavBtns`, `_onApplied`

**Wizards:**
- `wizardAP(onDone)` — always-advanced: SSID/Pass/Security + collapsible (Radio/Channel/Width/TX/L3/Iface/Isolate/Hidden/MaxClients)
- `wizardMLO(onDone)` — SSID/Pass + link toggles [2.4G][5G][6G] + collapsible (per-link Channel/Width/TX + L3/Iface/Isolate)
- `wizardStation(onDone)` — SSID/Pass/Band + collapsible (IP/L3/Iface/BSSID/Enc/WDS)
- `wizardWDS(onDone)` — SSID/Pass/Remote MAC/Band + collapsible (Mode/L3/Channel/STP/Enc/Iface)
- `wizardConnect(onDone)` — existing, connects to upstream WiFi
- `wizardRepeater(onDone)` — existing, two-radio repeater
- `wizardCountry(onDone)` — existing, sets country + wifi restart (NOT reboot)

**Networks tab (`renderNetworks`):**
- "Add network ▾" dropdown button → 4 wizard options
- Flat list of rows, shared borders, no gap
- Each row: status dot + SSID + type badge (MLO/AP/STA) + band pills + enc + client count + Edit + Remove + chevron
- Click row → expand detail (3-col grid) or Edit → inline form
- `netRow()` replaces old `networkCard()`

**TX power in UI:**
- Never show `sku_idx` directly
- System-wide TX power mode (Radios tab top card): 3 modes — `Regulatory` (sku_idx=0, country SKU table), `eFuse max` (no sku_idx, requires reboot), `Manual` (sku_idx=0 + per-radio txpower)
- Per-wizard TX power selector: `Auto` (don't set txpower) or `Manual` (set `txpower=N dBm`)
- TX power inputs in radio cards appear immediately on Manual selection (live onchange), before Apply

**apply flow:** `applyFlow(container, fn, onDone)` — calls fn() which must return
a Promise resolving to `{ ok, errors, restartRequired }`. Then calls
`layer3.start_apply('wifi')` and polls `layer3.poll_apply()` every 3s.

---

## What was done (chronological)

### Sessions before 2026-05-05
- Complete three-layer architecture written (layer1/2/3)
- Initial UI with Basic/Advanced mode toggle and 6 tabs

### 2026-05-05
- Fixed `iw_dev` data traversal bug (4 callers used wrong object path)
- Fixed per-link BW/Signal/TX/RX parsing in uplink data
- Fixed EHT flag detection (`eht_capab` not `eht_capab_info`)
- Fixed WiFi 7 client count to use `c.is_mld` consistently
- UI redesign pass (radio up:false handling, txpower display)

### 2026-05-07 (session 4)
- Clients tab improvements deployed: `modeBadge` combines tx+rx bitrate (fixes iPhone showing "Legacy"), `clientLinkBand` maps link_id→radio
- `networkSel()` helper added to index.js — composite select+text widget replacing plain iface text input
- All wizards and edit forms: `ifaceSel` → `networkSel()`; dead `l3Sel` removed from wizardAP/MLO; fixed `br-lan`→`lan`
- SKU removed from all UI: wizardCountry field, Radios card, Diagnostics country card
- Diagnostics rewritten: thermal as compact inline text (no progress bars) in Firmware card footer
- WiFi chip per-band temps added: `sysfs_wifi_temp()` in layer1 reads `mt7996_phy0.{0,1,2}` via PCIe phy0 hwmon path
- `iw_survey_noise()` added to layer1: parses `[in use]` frequencies from phy0.0-ap0 survey dump
- `radio_get_all()`: added `noise` field via `iw_survey_noise()` per-radio freq lookup
- `system_get_info()`: added `wifi_temp` field via `sysfs_wifi_temp()`
- Radio Stats card added to Diagnostics: band pill + CH/Util/Noise/TX/Clients per active radio
- Fixed `chan_util_avg=126` driver bug (6G `mbssid=1`): values >100 → null; display as `n/a` everywhere
- MLO per-link util: `Math.min(lk.chan_util, 100)` clamp

### 2026-05-07 (session 3 — this session)
- `system_wifi_restart` rewritten: `wifi down` + poll for APs gone + `wifi up` (was `timeout 30 /sbin/wifi`)
- `mld_get_all()`: added missing fields: `key`, `network`, `isolate`, `mld_addr`, `mld_allowed_links`, `eml_disable`
- Investigated/fixed router: beacon errors (`Failed to set beacon parameters`) caused by bad MLO test state; restored factory config and rebooted → clean
- `docs/factory-wireless.uci` added to repo (BPI-R4 factory default wireless config)
- `docs/index-legacy-wifi7.js` added to repo (pre-decomposition UI reference)
- `isAdv()` now always returns `true` (Basic/Advanced toggle removed, Diagnostics sections now visible)
- Overview tab removed from TAB_DEFS; 4-tab structure: Networks|Radios|Clients|Diagnostics
- Clients tab: `modeBadge(bitrateStr)` — auto-detects WiFi gen from bitrate string (EHT/HE/VHT/MCS)
- Clients tab: `clientLinkBand(ifname, link_id, data)` — maps client link_id → radio via AP MLD freq
- Clients tab: per-link table columns extended: Band|Link|Signal(colored)|Mode|TX|RX; client header shows dynamic modeBadge + ifname
- Network edit form: `network` field replaced with `networkSel()` dropdown (lan/wan/wwan/guest/iot/custom)
- All wizards: `ifaceSel` replaced with `networkSel()`; dead `l3Sel` removed from wizardAP and wizardMLO; fixed wrong UCI network name `br-lan` → `lan`

### 2026-05-08 (session 5, part 1)
**Critical bug fixes + wizard testing:**
- `hostapd_ubus_stat(ifname)` added to layer1 — uses `ubus call hostapd.<ifname> get_status` instead of `hostapd_cli stat`; ubusd returns immediately if hostapd is down, preventing XHR hang
- `system_all_up()` in layer2 switched from `hostapd_stat` → `hostapd_ubus_stat`; field `state` → `status`; fixes LuCI "XHR request timed out" during wifi restart
- `system_all_up(iwRaw)` — added `iwRaw` param; skips UCI-configured AP ifaces absent from `iw dev` (radio conflict: STA or MLO blocks legacy AP on same radio)
- wizardAP: dynamic encryption options per band — 6 GHz offers only `sae` / `owe`; `ENC_OPTS` object, rebuilt on `radioSel.onchange`
- wizardAP: DFS note (orange) shown below Radio selector when 5 GHz selected
- `applyFlow`: added `lockFn` (4th param) — modal ✕ button disabled during wifi restart poll, re-enabled on `ready`/timeout/error
- `openModal`: `setCloseable(v)` callback added, passed as 3rd arg to build function; all 7 wizard `openModal` calls updated
- `applyFlow` phase label: `starting` after 15s → "DFS scan in progress (~60 s)..."
- `renderClients`: SSID shown in client header (blue `"ssid"` text) via `ifname→ssid` map from `data.ifaces`/`data.mlds`

**Wizard test results (AP router 192.168.1.1):**
- wizardAP 2G ✓, 5G ✓ (DFS CAC ~60s confirmed), MLO 3-band ✓ — all green, all connectable
- 6G tested UI only (US/CZ band mismatch on test device)

### 2026-05-08 (session 5, part 2 — STA testing + fixes)
**wizardStation testing on STA router (10.20.30.1):**
- test-2g STA ✓, test-5g STA ✓ — připojeny, viditelné jako klienti na AP routeru
- 6G STA: stuck in SCANNING — **driver limitation** (viz Key technical facts níže)

**Opravy z testování:**
- `system_wifi_restart` in layer1: přechod na `nohup /sbin/wifi reload &` — rpcd vrátí okamžitě, reload na pozadí; `ubus down/up` nedočišťovalo MLD interfaces (`ap-mld-X` zůstávalo v kernelu)
- `mld_get_all()` in layer2: přidáno pole `mode` (z UCI `sec.mode`) do vráceného mld objektu
- `iface_add()` + `mld_add()` in layer2: SSID duplicate check — před přidáním prohledá UCI, vrátí `'SSID "x" already exists'` pokud duplicita
- `modeBadge(bitrateStr, isMld)` in index: EHT single-link → badge "EHT"; pouze MLO klienti (isMld=true) dostanou "WiFi 7"
- Networks tab: MLO badge přejmenován z `'MLO'` na `'MLO AP'` nebo `'MLO STA'` podle `m.mode`
- wizardStation: label `'MLO (WiFi 7)'` → `'MLO'`; orange warning `r2Note` když band=6GHz a MLO AP aktivní na radio2
- `is_mld` check v `netRow` aktualizován: `type === 'MLO AP' || type === 'MLO STA'`

### 2026-05-08 (session 6 — cold boot TX power bug fix)
**Root cause analysis + fix for band0 3 dBm cold-boot bug:**
- After powercycle, band0 (2.4 GHz) outputs only 3 dBm instead of 20 dBm
- Root cause: `mt7996_init_txpower` sets `phy->txpower = 20` during driver probe; mac80211 fires `BSS_CHANGED_TXPOWER` with `info->txpower=20 == phy->txpower=20` → condition FALSE → `mt7996_mcu_set_txpower_sku()` never called via this path
- Hostapd vendor NL80211 call reads `txpower_cur=0` → `current_txpower=3`, `txpower_limit=0`, `la=0`, TMAC=0 — deadlock (stays at 0 forever)
- **Fix**: `iw phy phy0 set txpower fixed 1900 radio 0` → `info->txpower=19 ≠ phy->txpower=20` → triggers `BSS_CHANGED_TXPOWER` → MCU call → TMAC=32 [0.5 dBm]; then `iw phy phy0 set txpower auto radio 0` → TMAC=34 [0.5 dBm] = 20 dBm output ✓
- Fix deployed to `/etc/rc.local` on AP router (also saved as `docs/rc.local`); verified after cold reboot: BBP TX Power = 34 [0.5 dBm] ✓

### 2026-05-07 (continued session)
**layer2/layer3/index fixes (P1+P2 from capability analysis):**
- `mld_assoc_band` added to `uplink_connect()` — **BLOCKER fix for STA MLD** (MP4.3+)
- `uplink_connect()` and `uplink_disconnect()` no longer call `system_apply()` internally — fixes double-apply when called via `applyFlow`
- `WPA3_ENC` extended with `sae-ext`, `sae-ext-mixed`
- `ENC_6G_OK` corrected: only `sae`, `owe`, `sae-ext` (removed `sae-mixed` which rejected on 6G)
- `radio_get_all()` now returns `lpi_enable` field
- `wizard_sta()` in layer3: detects `mlo='1'`, routes through `uplink_connect` for MLO STA path
- `wizardStation` in index.js: added MLO toggle + Assoc band selector (shows on MLO enable, hides Band selector)

### 2026-05-09 (session 9 — wizardAP testing + critical 6G fixes)
**BLOK A testing + bug fixes:**
- `system_wifi_restart` layer1: `nohup` → subshell `( /sbin/wifi reload ) &` (nohup absent in OpenWrt busybox)
- `system_all_up` layer2: `return false` → `continue` for null ifname (anonymous UCI sections have cfg-names in ubus but @-notation breaks ifnameMap lookup)
- `wizardAP` index.js: channel/htmode moved from iface params to `radio_set` (netifd ignores these on wifi-iface level)
- `iface_add` layer2: `sae_pwe='2'` for 6G WPA3 (was in mld_add, missing from iface_add; caused iPhone refusal)
- `iface_add` layer2: `mbo='1'` + `assocresp_elements='dd07000ce700000000'` for 6G (required for Apple device beacon compatibility)
- `iface_add` layer2: after creating 6G AP, reorder any MLO section to end of UCI (`uci_reorder` → non-tx BSS #1 not #2; iOS rejects non-tx #2 but accepts #1) ← confirmed on iPhone 16
- `uci_reorder(config, section, position)` added to layer1
- `CHAN_OPTS.radio1` index.js: full DFS channel list 52-144 added
- `WIDTH_OPTS` index.js: per-radio options (radio0 max 40MHz, radio1 max 160MHz, radio2 max 320MHz)
- `uci_read` layer1: `-X` flag restored (critical — without it, anonymous sections appear as @type[N] not cfgXXX)

**EDCCA driver limitation (MT7996 + MLO):**
- Adding 3rd MBSSID to MLO radio via `wifi reload` → `nl80211: Input EDCCA threshold is empty!` → beacon fail → radio down
- Affects radio1 (5G) and radio2 (6G) — any MLO radio with MBSSID=1
- **Boot-time init with N MBSSIDs works** (confirmed: radio1 with 3 MBSSIDs boots fine)
- **wifi reload with new 3rd MBSSID crashes** → requires reboot to recover
- Workaround for wizard: after adding non-MLO AP on MLO radio, show "Reboot required" (future fix)

**iOS MBSSID non-transmitted BSS behavior:**
- iOS refuses to connect to non-transmitted BSS #2+ on 6G but accepts #1
- Fix: `iface_add` reorders MLO section to end so wizard AP is non-tx #1
- `uci reorder wireless.<mlo_sid>=99` followed by commit

**BLOK A results:**
- A1 t-2g (radio0): ✓ added, iPhone connected, removed
- A2 t-5g non-DFS (radio1, CH36): ✓ wizard flow + DFS warning
- A3 t-5g DFS (radio1, CH52): ✓ CAC ~60s, modal auto-close, iPhone connected, removed
- A4 t-6g (radio2, SAE): ✓ after UCI reorder fix, iPhone connected; removed
- A5 edit existing default_radio0 SSID: ✓ change + reconnect + revert

### 2026-05-09 (session 11 — BLOK C wizardStation testing)
**C1 2G STA, C2 5G STA, C3 MLO STA — all PASS:**
- **C1 (radio0 2G STA):** PASS — connected to OpenWrt-2g (sae-mixed/testtest), DHCP IP via wwan
- **C2 (radio1 5G STA):** PASS — connected to OpenWrt-5g (sae-mixed/testtest), DHCP IP via wwan
- **C3 (MLO STA):** PASS — `sta-mld0` connected to MT76_AP_MLD, 3 links (CH1+CH52+CH37), IP 192.168.2.149; UL 1441 Mbit/s EHT MCS9 NSS3 on 5G link

**Fixes from testing:**
- `uci_ensure_network_iface(name)` added to layer1 — atomically creates `network.<name>=interface;proto=dhcp` if missing; called by `iface_add` for STA mode to ensure netifd runs DHCP client
- `iface_add` layer2: SSID duplicate check now skipped for `mode === 'sta'` — STA legitimately connects to same SSID as local AP
- `STA_ENC_OPTS` index.js: `sae-mixed` ("WPA2/WPA3") added to radio0 and radio1 options — without it, STA stuck at SCANNING when AP uses transition mode

**AP router prep (session 11):**
- All AP router networks standardized to testtest password: OpenWrt-2g, t-2g, OpenWrt-5g, MT76_AP_MLD → sae-mixed/testtest; OpenWrt-6g → sae/testtest
- AP router br-lan /32 bug fixed: `network.lan.netmask='255.255.255.0'` was missing
- STA router factory APs renamed to STA-2g/STA-5g/STA-6g (SSID conflict with AP-side names)

**MLO STA link data fix (commit `901f140`):**
- Networks tab MLO STA entry showed `—` for all link params — hostapd_stat returns nothing for STA (wpa_supplicant, not hostapd)
- Fix in `mld_get_all()`: for `mode === 'sta'`, call `layer1.iw_link(ifname)` → parse with `parseStaMldLinks()` → `freqToChannel()` computes channel from freq
- `iw dev sta-mld0 link` gives: freq ✓, channel (computed) ✓ — does NOT give bw_mhz or txpower (kernel driver limitation for STA links)
- Also fixed iw dev channel regex: MLD link channel lines use `\t\t + spaces`, not `\t{3,}` → changed to `[ \t]{3,}`
- Also: C3 STA is on 192.168.1.1 (not 10.20.30.1) — sta-mld0, IP 192.168.2.149/24, gateway 192.168.2.1, ping 0% loss ✓

**Single wiphy scan behavior (confirmed from MTK manual §30.2.3):**
- AP MLD scan covers all 3 bands via `radios all` parameter — single wiphy unified scan
- 6G STA (non-MLO) limitation confirmed (§30.3): band2 always goes through MLD code path, non-MLO 6G STA finds nothing

### 2026-05-09 (session 8)
**WiFi gen badges + MLO internals + reboot-on-country + critical efuse_max fix:**
- `genBadge(htmode)` in index.js — WiFi 7/6/5/4 colored badge in Networks tab rows; MLO AP always → WiFi 7; legacy AP/STA derives from `data.radios[radioId].htmode`
- MLO / WiFi 7 collapsible card added to `renderDiagnostics()`: MLD address (from `statData['mld_addr[0]']`), active links, allowed links (from `sec.mld_allowed_phy_bitmap`), EMLSR/STR, per-link freq/CH/BW/BSSID
- Country change and TX power mode change both now require **reboot** (was: wifi restart). `wizard_country()` sets `restartRequired: 'reboot'`; `system_set_txpower_mode()` always returns `restartRequired: 'reboot'`
- **Critical bug fix** in `radio_set()` layer2: country change was unconditionally writing `sku_idx='0'`, silently switching efuse_max → regdb. Fix: read current `txpower_mode` from UCI before writing sku_idx; skip if `efuse_max`
- UI: Apply buttons for country/txpower relabeled "Apply & Reboot"; hint text updated
- MLO internals: fixed `mld_addr` source (UCI → hostapd statData); fixed `mld_allowed_links` field name (`mld_allowed_phy_bitmap`)

**Comprehensive testing (7 countries × 3 modes × powercycle):**
- BLOK 1 regdb: CZ=23/23/23 dBm ✓, CH36 160MHz EHT ✓
- BLOK 2 regdb countries: DE ✓, US ✓, JP ✓, BR (5G=5dBm CH36 ✓), CN (6G down ✓), RU (6G down ✓)
- BLOK 3 efuse_max: CZ → efuse_max ✓, country change stays efuse_max ✓ (bug fix verified)
- BLOK 4 manual mode: per-radio set + powercycle ✓; JP txpower cap at 20 dBm ✓
- BLOK 5 CH149 5G: CZ CH149 max VHT80 (EHT160 rejected by ETSI) → EHT80 works ✓
- BLOK 6 mode switch back regdb: clean ✓

### 2026-05-07 (previous commit `c7103e8`):
- Removed Basic/Advanced mode toggle (`_modeBtn`, `getMode()`, `isAdv()`, `setMode()`)
- Replaced dynamic `tabDefs()` with static `TAB_DEFS` constant
- Removed `wifi_conn` from tab nav
- Rewrote `renderNetworks()` — flat list with expand/collapse rows, "Add network ▾" dropdown
- Rewrote `wizardAP` — always-advanced with collapsible section
- Rewrote `wizardMLO` — fixed encryption `sae` (was `sae-mixed`), link toggle buttons, collapsible
- Added `wizardStation()` (new)
- Added `wizardWDS()` (new)
- Added `.github/workflows/build.yml` — builds APK on push/release, uploads to release page

**Commit `3042005`:**
- `mld_add`: added `mode: 'ap'` — **critical fix**, was root cause of wizardMLO failure
- `mld_add`: added `sae_pwe: '2'` for 6 GHz WPA3 — required by hostapd for SAE H2E
- `system_apply_poll`: fixed dead branch (`hasLegacy && !hasMld` was never-ready); now handles MLO-only and legacy-only correctly

---

## Key technical facts

### MLO on MT7988A
- MLO = Multi-Link Operation (WiFi 7). Single virtual AP `ap-mld0` with links on all 3 bands.
- **How netifd creates MLO:** UCI wifi-iface with `mlo='1'`, `mode='ap'`, `device='radio0' 'radio1' 'radio2'` (list). netifd `wireless.uc` detects the list + `mlo=1`, generates ifname `ap-mld0` (auto), calls hostapd via ubus with MLD config.
- **`mode='ap'` is mandatory:** `wpad_update_mlo()` in `wireless.uc` filters by `data.mode`. Without it the section is silently dropped — no MLD interface is created.
- **`sae_pwe='2'` is mandatory for 6 GHz SAE:** hostapd requires Hash-to-Element mode for 6 GHz SAE. The factory config generator (`mac80211.uc`) always sets this.
- **`encryption='sae'` not `'sae-mixed'`:** 6 GHz band rejects WPA2 fallback. Use `sae` (WPA3-only) for any MLO network that includes radio2. `sae-mixed` will fail 6 GHz link association.
- **`ieee80211w='2'` is mandatory for WPA3:** already handled by layer2 `WPA3_ENC` set check.
- Factory default creates `wireless.ap_mld_1` (named section, ifname `ap-mld-1`, SSID `MT76_AP_MLD`). The wizard creates anonymous sections; netifd auto-assigns `ap-mld0`.
- After `wifi reload`, MLO setup takes ~60s due to 5 GHz DFS CAC scan.

### apply poll (`system_apply_poll`)
Polls `iw dev` for interface state:
- No APs → `resetting`
- MLO present (`MLD with links` in raw) → check hostapd ENABLED via ubus → `ready`
- Legacy-only APs → `ready` immediately
- Bug was: `hasLegacy && !hasMld` → was never ready (now fixed)

### TX power (fully tested session 7)
- Output formula: `output_dBm = (TMAC + path_delta) × 0.5`; path_delta: band0=6, band1=9, band2=9
- eFuse max: band0=27dBm, band1=27dBm, band2=25dBm
- **MTK default (no sku_idx):** driver ignores `iw txpower` requests, runs at eFuse max. This is intentional — vendors are responsible for compliance via sku_idx + country SKU tables.
- **sku_idx='0' required for manual txpower cap:** without it driver ignores `iw txpower fixed` and uses eFuse max
- **regdb mode** (sku_idx=0, no txpower): country SKU table applied → regulatory limits enforced
- **efuse_max mode** (no sku_idx): eFuse max. REQUIRES REBOOT (kernel regdb persists through wifi reload). Cold-boot bug does NOT affect this mode (MLO path initializes TMAC correctly).
- **manual mode** (sku_idx=0, txpower=N): exact per-radio cap. sku_idx=0 mandatory.
- **Cold-boot TMAC=0 bug:** affects band0 + band2 in regdb/manual mode. Fixed by hotplug bootstrap script.
- **Hotplug** (`/etc/hotplug.d/net/10-mt7996-txpower-fix`): trigger=phy0.0-ap0 add. Bootstraps band0+band2 (fixed→restore). `_restore()` reads UCI txpower: if set → `fixed ${txpower}00`, else → `auto`.
- **wizard_country** sets ONLY country, never touches sku_idx. sku_idx managed exclusively by `system_set_txpower_mode()`.
- `system_set_txpower_mode(mode)`: regdb→sku_idx=0+clear txpower; efuse_max→delete sku_idx+clear txpower (restartRequired=reboot); manual→sku_idx=0+keep txpower

### 6G STA limitation on MT7988A
- **6G STA (non-MLO) nefunguje** na STA routeru: `wpa_cli scan_results` neobsahuje žádné 6GHz sítě
- Driver volá `mt7996_mcu_bss_mld_tlv: group_mld_id=255` pro každý scan na band2 — band2 vždy prochází MLD code path
- Scan startuje (`mt76_hw_scan: scan start`) ale nenachází žádné AP — pravděpodobně driver/firmware quirk pro 6GHz
- AP router 6GHz funguje (ap-mld-1 s aktivním link2 na ch37); STA router 6GHz scan nic nevrátí
- **2G a 5G STA fungují** — radio0 AP+STA simultánně OK; radio1 STA funguje (MLO 5G link v DFS CAC = neaktivní)
- **Workaround**: 6G STA možná funguje pouze jako součást MLO STA (mlo='1', multi-radio device list)

### Radio interface limits (MT7996 + MLO)
- **Max ~3 interfaces per MLO radio** (radio1, radio2) via wifi reload
- Exceeding limit → `Failed to create interface: -23 (Too many open files in system)`
- Boot-time init with N interfaces works; wifi reload adding Nth+1 fails
- **wizardMLO always reboots** (layer3.js) — EDCCA crash on radio2 wifi reload fixed

### iOS MLO link management (confirmed BLOK B)
- **6G available** → iPhone uses only 6G (2402 Mbit/s), other links idle
- **No 6G** → iPhone uses available links (B1: both 2.4G+5G active)
- **Known network** (many sessions) → all negotiated links used aggressively
- **New network** (1st session) → starts conservative (1 best link)
- Per-link RSSI: MT7996 driver reports signal only for primary data link; others show `0` → displayed as `—` (driver limitation, not a bug)

### Router state (as of 2026-05-10, after BLOK D partial)
**AP router (192.168.1.1):**
- Country: **CZ**, TX power mode: **regdb**
- band0=20 dBm, band1=23 dBm, band2=23 dBm
- radio0: OpenWrt-2g (sae-mixed/testtest), t-2g (sae-mixed/testtest)
- radio1: OpenWrt-5g (sae-mixed/testtest)
- radio2: OpenWrt-6g (sae/testtest)
- ap_mld_1: MT76_AP_MLD 3-link (sae-mixed/testtest, permanent)
- WiFi chip temps visible in Diagnostics: mt7996_phy0.0/1/2 via `/sys/devices/platform/soc/11300000.pcie/.../ieee80211/phy0/hwmon*`
- 6G chan_util always `n/a` (driver bug: `mbssid=1` → hostapd reports 126; discarded in layer2)

**STA router (192.168.1.1):**
- STA-2g (radio0, AP, open), STA-5g (radio1, AP, open), STA-6g (radio2, AP, wpa3) — renamed factory APs
- MT76_AP_MLD STA (MLO, all 3 bands, sae-mixed/testtest) → sta-mld0, network wwan
- OpenWrt-2g relayd STA (radio0, STA → AP router 2G, sae-mixed/testtest), network relayd_up (po testu bude smazán)
- `wireless.radio2.mbssid='0'` (bylo '1', změněno při debuggingu)
- Přístup: wired, `root@192.168.1.1` bez hesla

**AP router pro BLOK D testy (10.20.30.1):**
- ap_mld_1: MT76_AP_MLD (MLO AP, sae-mixed/testtest)
- radio0: OpenWrt-2g (sae-mixed/testtest) — cíl pro relayd/WDS/repeater testy
- Přístup: IPsec tunel přes internet, `root@10.20.30.1`; **POZOR: `network restart` shoří tunel** — pouze `wifi reload`

### Encryption reference
| UCI value | Meaning | 6 GHz OK? |
|-----------|---------|-----------|
| `none` | Open | No (must use `owe`) |
| `psk2` | WPA2-PSK | No |
| `sae-mixed` | WPA2+WPA3 | No (WPA2 fallback rejected) |
| `sae` | WPA3-SAE only | Yes |
| `owe` | OWE (open+secure) | Yes |

---

### 2026-05-10 (session 16 — bpi-r4-deploy integrace + first-run deploy)

**bpi-r4-deploy GitHub integrace:**
- Vytvořen `builder-wifimgr-universal.sh` na GitHubu (woziwrt/bpi-r4-deploy)
- Vytvořen `configs/my_defconfig-wifimgr-universal` (přidán `CONFIG_PACKAGE_luci-app-wifimgr=y`)
- VM builder: `~/bpi-r4-openwrt-builder-universal/builder-wifimgr-universal.sh`
  - `OPENWRT_COMMIT=0bcdcf67d7a59eb0ab9fab677fcfe765872f7d46` (OpenWrt 25.12, kernel 6.12.85, May 8)
  - MTK SDK HEAD (May 8, commit 7989329, tarball 602MB)
  - Wifimgr sources: `../my_files/luci-app-wifimgr/`
- **Nekompatibilita odhalena:** OpenWrt e850a972 (May 9) — mac80211 bump na 6.18.26 → MTK SDK patches selhaly (`net/wireless/core.c`, `scan.c`, `util.c`). Řešení: rollback na 0bcdcf67 (těsně před bumpem).
- Build proběhl úspěšně (~3 hodiny) — `INFO: Autobuild finished`

**Firmware nasazen na oba routery (eMMC):**
- bpi-r4-ap (10.20.30.1, br-lan 192.168.2.1/24) — hostname `bpi-r4-ap`
- bpi-r4-sta (192.168.1.1, br-lan 192.168.1.1/24) — hostname `bpi-r4-sta`
- `luci-app-wifimgr-1.0.0-r20260510` nainstalován na obou (zapečen ve firmware)
- SSIDs: `OpenWrt-ap-{2g/5g/6g}` / `MT76_AP_MLD` (AP), `OpenWrt-sta-{2g/5g/6g}` / `MT76_AP_MLD-sta` (STA)

**Release tagy updatovány (woziwrt/bpi-r4-deploy):**
- `release-4gb-standard`, `release-4gb-poe`, `release-8gb-standard`, `release-8gb-poe`
- Každý tag: emmc-img.bin, nvme-img.bin, sdcard.img.gz, snand-img.bin, bpi-r4[poe].itb
- `bpi-r4-rescue-sdcard.img.gz` zachován statický (nezměněn)

**First-run test výsledky (SSH):**
- ✅ Radios: 2G ch1 EHT40, 5G ch36 EHT160, 6G ch37 EHT320 — všechny UP
- ✅ MLO AP (ap-mld-1): 3 linky aktivní (2.4G+5G+6G)
- ✅ Thermal: CPU 48-49°C, WiFi chips 48-53°C, NVMe 40°C
- ✅ 5G STA → AP: 648.5 Mbit/s EHT160 WiFi 7, ping 1.6ms 0% loss
- ✅ LuCI (uhttpd): dostupný na obou routerech
- ✅ wifimgr soubory: layer1/2/3.js + index.js přítomny
- ⚠️ MLO STA full multi-link: vyžaduje wifimgr wizard (ruční UCI nestačí)
- ⚠️ Wizard flows: nelze testovat přes SSH — čeká na WebUI ověření

**Záloha AP router config:**
- `/Users/petr/Desktop/screenshots/etc/` — config/network, config/firewall, rc.local, swanctl/ (+ certifikáty)

### 2026-05-10 (session 15 — edit form + package install + v1.0.0 release)

**Edit form smoke test — PASS:**
- Test 1 (STA `iface_set`): změna hesla → disconnect → revert → reconnect ✓
- Test 2 (MLO STA `mld_set`): změna hesla → disconnect → revert → reconnect ✓

**Bugy nalezené a opravené:**
- `mld_set` (layer2): validace 6G enc probíhala i pro STA mode → error při editaci MLO STA s `sae-mixed`. Fix: `!isSta &&` podmínka (6G enc restriction platí jen pro AP beacon, ne STA)
- `mld_get_all` (layer2): MLO STA po wifi reload reconnectuje jako single-link (bez `Link ID:` řádků v `iw dev link`) → `links=[]` → šedá tečka. Fix: fallback — pokud `Connected to` přítomno ale `links=[]`, syntetizuj 1 link z freq/signal

**Repeater badge UX:**
- Badge `repeater` přidán i na AP stranu wizard_repeateru (layer3: `repeater:'1'` v apWrite)
- `netRow`: badge místo statického textu "repeater" ukazuje peer SSID se šipkou: STA → `→ <local-AP-ssid>`, AP → `← <uplink-ssid>`
- Fallback na "repeater uplink" / "repeater AP" pokud peer nenalezen
- WizardRepeater: přidán L3/NAT popis na začátku modalu

**Package install test — PASS na obou routerech:**
- Build: `make package/luci-app-wifimgr/compile` na Ubuntu VM → `r20260510.apk` (33 KB) ✓
- STA router (192.168.1.1): `apk add --allow-untrusted --no-network` → Upgrading r20260505 → r20260510 ✓
- AP router (10.20.30.1): fresh Installing r20260510 ✓
- Reboot obou routerů → APK přežil, WiFi up, LuCI funguje ✓

**v1.0.0 release:**
- Git tag `v1.0.0` na commitu `264cad2`
- GitHub release: https://github.com/woziwrt/luci-app-wifimgr/releases/tag/v1.0.0
- APK `luci-app-wifimgr-1.0.0-r20260510.apk` přiložen k release

---

### 2026-05-10 (session 14 — BLOK D: wizardRepeater)

**D2 wizardRepeater PASS:**
- STA (`phy0.0-sta1`) připojen na OpenWrt-2g (10.20.30.1), wpa_state=COMPLETED ✓
- wwan IP: 192.168.2.198 od AP routeru ✓
- Lokální AP (`phy0.1-ap2`, repeater-5g, radio1): state=ENABLED ✓
- iPhone na repeater-5g: 192.168.1.126/GW 192.168.1.1 (STA router DHCP) ✓
- Ping 192.168.2.1 přes wwan: 0% packet loss ✓

**Repeater bug fixes:**
- `wizard_repeater` (layer3): chyběl `network='lan'` na AP iface → klienti nedostávali DHCP
- `wizard_repeater` (layer3): `repeater='1'` tag na STA iface pro detekci badge
- `iface_get_all` (layer2): přidáno `repeater` pole
- `wizardRepeater` (index): validace uplink ≠ local AP radio; auto-switch apRadioSel na opačné radio při step2; zelený "repeater" badge v netRow
- Repeater vyžaduje **různá radia** pro uplink STA a lokální AP (validace + auto-select)

**Technické poznatky:**
- MLO STA (sta-mld0 na všech 3 radiích) + repeater STA (phy0.0-sta1) sdílí wpa_supplicant → SCAN-FAILED ret=-16 (EBUSY) při souběžném skenování. Po stabilizaci obě fungují.
- Repeater AP dostane suffix phy0.1-ap2 (ne ap1) pokud je radio1 obsazeno jiným AP — netifd auto-increments
- L3 NAT repeater: klienti dostávají 192.168.1.x od STA routeru, internet jde přes NAT (wwan → upstream gateway)

### 2026-05-10 (session 13 — BLOK D: WDS + relayd)

**D1 WDS PASS** (session 12 carry-over, confirmed session 13):
- WDS STA + AP paired: `4addr: on`, bridge FDB, State COMPLETED, 286.7 Mbit/s EHT MCS11 WiFi 7 ✓
- WDS badge in Networks tab for `wds=1` entries ✓
- WDS checkbox in wizardAP and AP edit form ✓

**D1 relayd PASS** (clean end-to-end wizard test):
- iPhone connected to STA-2g got **192.168.2.164** from AP router via L2 relay ✓
- `relayd -I phy0.0-sta1 -I br-lan -B -D` — správné rozhraní (ne sta-mld0) ✓
- Remove button automaticky volá `relayd_remove()` → čistý cleanup ✓

**Relayd code fixes + features:**
- `wizard_relayd` (layer3): `network='relayd_up'` místo `'wwan'` — bez konfliktu s MLO STA na wwan
- `relayd_setup` (layer1): auto nastaví `dhcp.lan.ignore=1` + restartuje dnsmasq — jinak lokální dnsmasq odpoví na DHCP dřív než upstream AP
- `relayd_remove` (layer1): čistí `relay_bridge` + `relayd_up` + obnoví dnsmasq
- `relayd_get()` (layer2): čte `network.relay_bridge` UCI, vrátí `{ active, uplink_net }` (první síť v listu = uplink)
- `load_all()` (layer3): přidán `relayd_get()` → `data.relayd` dostupný v UI
- `netRow()` (index): badge "relayd" (modrý) na STA kde `iface.network === data.relayd.uplink_net`
- Remove handler (index): auto-volá `layer2.relayd_remove()` při mazání relayd uplink STA

**Relayd technické poznatky:**
- `/etc/init.d/relayd` (S80relayd): procd daemon, čte `proto=relay` z network UCI, resolvuje síťová jména přes `/var/state/network` → kernel ifnames. `service_triggers` restartuje relayd na každou interface event (2s debounce).
- Relayd start timing: `relayd_up` musí mít přiřazenou IP (DHCP ok) aby netifd zapsal ifname do `/var/state/network` → jen pak init skript správně resolvuje na `phy0.0-sta1`
- `dhcp.lan.ignore=1` je povinný: bez něj lokální dnsmasq odpoví na DHCP dřív než relay přeforwarduje upstream → klient dostane 192.168.1.x místo 192.168.2.x

---

### 2026-05-11 (session 17 — v1.1.0 příprava, build pokusy)

**Co se udělalo:**
- Potvrzeno: VM `my_files/luci-app-wifimgr` byl na commitu `afe07b3` (7. května) — nesynchronizován
- Všechny soubory scp'ovány na VM `my_files/` na stav commitu `5965db5`
- Přidán `root/etc/uci-defaults/99-wifimgr-defaults` (first-run: country=CZ, key=12345678, SSID rename MT76_AP_MLD→OpenWrt-MLD)
- PKG_VERSION bumped na 1.1.0, PKG_RELEASE=20260511 — commit `b5857b8`
- First-run script committed — commit `5965db5`
- VM builder synchronizován: používá `\cp -r ../my_files/luci-app-wifimgr` (git clone NEFUNGUJE uvnitř autobuild prostředí — zakázaný terminal prompt)
- Build 3× selhal: 2× git clone issue, 1× OpenWrt mirror timeouty
- Oba routery aktualizovány ručně (scp) na aktuální JS + hotplug + menu.d

**Stav routerů (2026-05-11):**
- AP (10.20.30.1): country=CZ, regdb, TMAC 34/37 ✓, všechny soubory aktuální
- STA (192.168.1.1): country=US, efuse_max (bez sku_idx), všechny soubory aktuální
- Hotplug `/etc/hotplug.d/net/10-mt7996-txpower-fix` ✓ na obou

**Git stav:**
- Poslední commit: `5965db5` (first-run UCI defaults)
- bpi-r4-deploy: `9bfaaba` (builder-wifimgr-universal.sh pro standard variant) ✓

## What's next

### START HERE next session

**Firmware v1.1.0 build je potřeba dokončit — pak sysupgrade obou routerů.**

**Krok 1 — Build:**
Petr zkusí build lokálně (lepší download podmínky).
Nebo na VM: `cd ~/bpi-r4-openwrt-builder-universal && nohup bash builder-wifimgr-universal.sh > build-$(date +%Y%m%d-%H%M).log 2>&1 &`
- VM `my_files/` je aktuální (commit 5965db5)
- DŮLEŽITÉ: VM builder používá LOCAL my_files (ne git clone)

**Krok 2 — Sysupgrade:**
Po úspěšném buildu:
```
# AP router (10.20.30.1):
scp openwrt/bin/targets/mediatek/filogic/openwrt-mediatek-filogic-bananapi_bpi-r4-squashfs-sysupgrade.itb root@10.20.30.1:/tmp/
ssh root@10.20.30.1 'sysupgrade /tmp/*.itb'

# STA router (192.168.1.1):
scp openwrt/bin/targets/mediatek/filogic/openwrt-mediatek-filogic-bananapi_bpi-r4-squashfs-sysupgrade.itb root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'sysupgrade /tmp/*.itb'
```

**Krok 3 — Ověření first-run:**
Po prvním bootu ověřit na routerech:
- country = CZ ✓
- SSID MT76_AP_MLD → OpenWrt-MLD ✓
- key = 12345678 ✓
- hotplug script přítomen ✓
- TMAC band0+band2 správné (ne 3 dBm) ✓

**Krok 4 — Wizard testy (WebUI):**
A1.0 (country CZ) a A1.1 (2G AP) jsou hotovy na starém firmware.
Po sysupgrade začít od A2.

### v1.0.0 — co je hotovo (sessions 1–15)

**Architektura a core:**
- Třívrstvá architektura: layer1 (HW přístup) / layer2 (datový model) / layer3 (wizard orchestration)
- `hwBusy` mutex v layer1 — serializace HW operací
- `applyFlow` — wifi reload + poll readiness + DFS timeout handling + modal lock
- `system_wifi_restart` — subshell background reload, poll APs gone/up
- `uci_read` s `-X` flag (kritické pro anonymous sections)

**Wizards — všechny otestovány na HW:**
- **wizardAP** — 2G ✓, 5G non-DFS ✓, 5G DFS (~60s CAC) ✓, 6G ✓, edit ✓
- **wizardMLO** — 2G+5G ✓, 2G+6G ✓, 5G+6G ✓, 3-link ✓; vždy reboot (EDCCA fix)
- **wizardStation** — 2G STA ✓, 5G STA ✓, MLO STA (sta-mld0, 3 linky) ✓
- **wizardWDS** — 4addr bridge, 286 Mbit/s EHT MCS11 WiFi 7 ✓
- **wizardRelayd** — L2 bridge, iPhone dostane IP od upstream AP ✓
- **wizardRepeater** — L3 NAT, peer SSID badge (→/←) ✓
- **wizardCountry** — country + reboot ✓

**UI:**
- Networks tab: flat list, expand/edit/remove, badges MLO AP/STA/AP/STA + WiFi gen + WDS + relayd + repeater (→/←)
- Radios tab: per-radio stats, TX power modes (regdb/eFuse max/manual), country
- Clients tab: signal (barevný), bitrate, WiFi gen badge, disconnect
- Diagnostics: thermal, MLO internals, Radio stats, log download

**Klíčové bugy opravené během testů:**
- 6G iOS: sae_pwe + mbo + assocresp_elements + UCI reorder (non-tx BSS #1)
- efuse_max: country change nesmí přepisovat sku_idx
- mld_set: 6G enc validace jen pro AP, ne STA
- mld_get_all: single-link fallback (zelená tečka i bez MLD Link ID řádků)
- relayd: network='relayd_up' (ne 'wwan'), dhcp.lan.ignore=1 povinný
- system_all_up: null ifname skip, hostapd_ubus_stat místo hostapd_stat

**Package install:**
- Build: Ubuntu VM, `make package/luci-app-wifimgr/compile`, `aarch64_cortex-a53`
- `apk add --allow-untrusted --no-network` funguje na obou routerech ✓
- Reboot verification: APK přežije reboot, WiFi up ✓
- **Release: https://github.com/woziwrt/luci-app-wifimgr/releases/tag/v1.0.0**

### Known bugs / gaps
- **6G STA nefunguje** na STA routeru — driver limitation
- **UX: Manual mode** — "Apply & Reboot" shows even when only adjusting dBm, not mode itself
- **Clients tab**: Apple Watch shows wrong band pill — not blocking
- **Per-link RSSI**: secondary MLO links show `—` — MT7996 driver limitation (not fixable)

### Roadmap to production (v1)

**Blockers — must have:**
1. Edit form smoke test — STA + MLO STA edit forms
2. Package install test — `apk add` na čistém routeru z local VM build tree
3. First-run test — factory reset → install → celý wizard flow od začátku

**APK build:** local Ubuntu VM build tree (`aarch64_cortex-a53`, MTK SDK patches). GH Actions = dead end (no MTK SDK Docker image exists or will exist).

### V2 roadmap (post-production)

**Highest value — test first (30 min):**
- `uplink_scan()` already in layer2 — verify if scan works on our MTK SDK build tree
- If yes: wizardStation "Scan" button (auto-detect SSID/encryption) — biggest UX improvement possible
- If yes: Channel advisor in Radios tab (show neighbor AP channel utilization)

**WiFi 7 specific (medium complexity):**
- Preamble Puncturing (EHT subchannel exclusion for DFS coexistence) — hostapd config exists, UI missing
- EMLSR dynamic enable/disable without reboot (need to verify driver support)
- MLO link add/remove without reboot (blocked by EDCCA bug for now)

**Diagnostics (low-medium complexity):**
- Uplink tab — dedicated STA status (signal, bitrate, roaming, disconnect)
- Full TX power section in Diagnostics (TMAC / path_delta / output dBm per band)
- Historical channel utilization graphs (needs persistent storage / RRD)

**Not worth doing:**
- 802.11s mesh — completely different architecture, WiFi 7 single-wiphy mesh is uncharted; existing stacks (batman-adv, babeld) don't handle MLO
- Captive portal / traffic shaping — covered by existing luci-app-nodogsplash / luci-app-sqm
- OpenWrt packages feed submission — MTK SDK out-of-tree patches = never passes mainline review

### Done (from previous future-work lists)
- Log download button in Diagnostics ✓
- Country code dropdown (sorted list) in wizardCountry ✓
- DFS channel annotations in Radio tab (inline CAC note) ✓
- `he_twt_responder`, `legacy_rates`, `sr_enable`, `etxbfen` radio params ✓
- Apply flow: step-by-step progress text + timeout message ✓
- `eml_disable` in wizardMLO UI ✓
- `mld_allowed_links` in wizardMLO UI ✓
- `lpi_psd` / `lpi_bcn_enhance` / `lpi_sku_idx` in Radios edit form (6 GHz only) ✓
- Edit form in `netRow`: Channel/Width/TX for AP mode ✓
- MLO STA DHCP — testable with STA router ✓
- L2 testing (relayd/WDS) — testable with STA router ✓
- Clients tab: Disconnect button — testable with STA router ✓

---

## Build / CI

`.github/workflows/build.yml` — triggers on push to `main` and on release publish.
Uses `openwrt/gh-action-sdk@v7`, arch `aarch64_cortex-a53-24.10`.
On release: uploads `.apk` (falls back to `.ipk`) as a release asset via `gh release upload`.
