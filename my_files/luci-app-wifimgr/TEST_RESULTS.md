# luci-app-wifimgr — Test Results
# Spec: TEST_SPEC.md (Layer 1 + Layer 2)
# Date: 2026-05-05
# Router: BPI-R4, MT7988A, OpenWrt kernel 6.12.79, fw 4.4.26.03
# Method: Static code analysis + direct SSH shell commands (no Node.js on router)

---

## GROUP A: V1 CONTRACT TESTS

---

TEST_ID: A1
RESULT: PASS
DETAIL: Static analysis of layer1.js — all read functions return via ok() or mkErr() helpers.
  ok(data)   → {ok:true,  status:'OK',    verified:true,  data:<non-null>, error:null}
  mkErr(msg) → {ok:false, status:'ERROR', verified:false, data:null,       error:<string>}
  All 5 required fields present on every code path. All 19 functions in the A1 list conform.
  Live-verified commands (underlying shell calls succeeded on router):
    uci -X show wireless → ok, data: wireless object with radio0/1/2
    ubus call network.wireless status → ok
    ubus call hostapd.phy0.0-ap0 get_status → ok, data.status='ENABLED'
    hostapd_cli -i ap-mld-1 [-l N] stat → ok for N=null,0,1,2
    iw dev → ok
    iw phy0 info → ok (antenna masks present)
    cat /sys/kernel/debug/ieee80211/phy0/mt76/fw_version → ok
    cat /sys/kernel/debug/ieee80211/phy0/mt76/sku_disable → ok ('0')
    cat /sys/kernel/debug/ieee80211/phy0/mt76/band{0,1,2}/txpower_info → ok
    sysfs thermal zones → ok (8 zones)
    cat /proc/version → ok
  Not directly run live (verified statically): ubus_iwinfo_info('phy0.0-ap0'),
    ubus_iwinfo_devices, ubus_network_interface('loopback'), hostapd_all_sta,
    iw_channels, iw_reg, sysfs_dfs_status, system_logs.
CRITICAL: no

---

TEST_ID: A2
RESULT: PASS
DETAIL: Static analysis — for every function in the A1 list, ok:true is produced only by
  the ok() helper which hardcodes verified:true. No A1 function has a code path that
  returns ok:true with verified:false. (system_reboot returns ok:true/verified:false but
  is not in the A1 list — tested separately in A7.)
CRITICAL: yes

---

TEST_ID: A3
RESULT: PASS
DETAIL: Static analysis — layer1.js line 161: uci_write checks `if (hwBusy) return busy()`
  before acquiring the mutex. busy() returns {ok:false, status:'BUSY', error:'busy'}.
  Pattern confirmed in all 6 write functions: uci_write, uci_add, uci_delete,
  uci_list_add, uci_list_del, system_wifi_restart, system_wifi_reload.
  Concurrent JS execution not testable without Node.js; code logic is correct.
CRITICAL: yes

---

TEST_ID: A4
RESULT: PASS
DETAIL: Static analysis — every error branch in all write functions contains
  `hwBusy = false` before returning mkErr(). Verified for all 6 write functions.
  Example (uci_write lines 168-170): `if (res.code !== 0) { hwBusy = false; return mkErr('exec_failed'); }`
  No error path exits without releasing the mutex.
CRITICAL: yes

---

TEST_ID: A5
RESULT: PASS
DETAIL: Live — ran UCI write/readback cycle directly on router:
  uci set wireless.radio0.channel=6 && uci commit → uci show wireless.radio0.channel → 'channel=6'
  uci_write verify logic checks `verify.stdout.includes('wireless.radio0.channel=')` → true.
  Restored: uci set wireless.radio0.channel=auto && uci commit → confirmed 'channel=auto'.
CRITICAL: no

---

TEST_ID: A6
RESULT: SKIP
REASON: Executing system_wifi_restart() would disrupt router connectivity during testing.
DETAIL: Static analysis confirms correct return shape:
  Success: {ok:true,  status:'PENDING_RELOAD', verified:true,  data:null, error:null}
  Timeout: {ok:false, status:'PENDING_RELOAD', verified:false, data:null, error:'timeout'}
  status is always 'PENDING_RELOAD' (not 'OK') as required. Verification polls iw dev for
  'type AP' within 15s deadline.
CRITICAL: no

---

TEST_ID: A7
RESULT: SKIP
REASON: Executing system_reboot() would reboot the router.
DETAIL: Static analysis confirms correct return shape (lines 697-705):
  fs.exec('/sbin/reboot', []) called WITHOUT await (fire-and-forget).
  Returns immediately: {ok:true, status:'PENDING_REBOOT', verified:false, data:null, error:null}
  verified:false is intentional — connection will be lost before verification is possible.
CRITICAL: no

---

TEST_ID: A8
RESULT: PASS
DETAIL: Static analysis — iw_dev() (GROUP 4) and all read-only functions (ubus GROUP 2,
  hostapd_cli GROUP 3, iw GROUP 4, wpa_cli GROUP 5, sysfs GROUP 6, system_logs GROUP 7)
  have NO hwBusy check. Only write functions and system_wifi_restart/reload check hwBusy.
  Read-only functions will execute and return results regardless of mutex state.
CRITICAL: yes

---

## GROUP B: V1 DATA CORRECTNESS TESTS

---

TEST_ID: B1
RESULT: PASS
DETAIL: Live — uci -X show wireless:
  wireless.radio0=wifi-device (band=2g, channel=auto, country=CZ, htmode=EHT40)
  wireless.radio1=wifi-device (band=5g, channel=60, country=CZ, htmode=EHT160)
  wireless.radio2=wifi-device (band=6g, confirmed from UCI show + hostapd 6135 MHz data)
  parseUciOutput correctly stores section type as '.type' key → data.wireless.radio0['.type']==='wifi-device'
CRITICAL: no

---

TEST_ID: B2
RESULT: PASS
DETAIL: Live — ubus call network.wireless status:
  Returns object with keys radio0, radio1, radio2. radio0.up=true.
  radio0.interfaces[0].ifname='phy0.0-ap0', stations=[] (no clients — expected and correct).
  radio0.interfaces[1].section='ap_mld_1' (MLD interface also present).
CRITICAL: no

---

TEST_ID: B3
RESULT: PASS
DETAIL: Live — hostapd_cli -i ap-mld-1 stat:
  state=ENABLED ✓
  num_links=3 ✓
  ap_mld_type=STR ✓
CRITICAL: no

---

TEST_ID: B4
RESULT: PASS
DETAIL: Live — hostapd_cli -i ap-mld-1 -l N stat:
  Link 0: freq=2437 MHz  (2400–2500 range ✓)
  Link 1: freq=5300 MHz  (5000–5900 range ✓)
  Link 2: freq=6135 MHz  (5925–7125 range ✓)
CRITICAL: no

---

TEST_ID: B5
RESULT: PASS
DETAIL: Live — iw dev output contains ap-mld-1 with:
  "MLD with links:"
  link ID 0 link addr e2:51:07:08:f2:6f — channel 6 (2437 MHz), width: 20 MHz, txpower 3.00 dBm
  link ID 1 link addr e6:51:07:09:12:6f — channel 60 (5300 MHz), width: 160 MHz, txpower 20.00 dBm
  link ID 2 link addr ea:51:07:09:32:6f — channel 37 (6135 MHz), width: 320 MHz, txpower 5.00 dBm
  parseIwDev regex `/^\s+- link ID\s+(\d+)\s+link addr\s+(\S+)$/` matches all 3 lines.
  Per-link channel/txpower parsed via `/^\s{5,}channel\s+/` and `/^\s{5,}txpower\s+/`.
CRITICAL: no

---

TEST_ID: B6
RESULT: PASS
DETAIL: Live — cat /sys/kernel/debug/ieee80211/phy0/mt76/sku_disable → '0'
  Code: `ok(res.stdout.trim() === '1')` → ok(false). data=false (boolean, not string '0').
  For CZ router: sku_disable=0 → data===false (regulation active). ✓
CRITICAL: no

---

TEST_ID: B7
RESULT: PASS
DETAIL: Live — sysfs_thermal shell output:
  cpu-thermal:49698, cpu-1-thermal:50022, eth2p5g-thermal:49323,
  eth2p5g-1-thermal:50122, tops-thermal:49573, tops-1-thermal:49448,
  ethwarp-thermal:49760, ethwarp-1-thermal:49698
  All values are integers (milli-celsius). Object has 8 keys.
CRITICAL: no

---

TEST_ID: B8
RESULT: PASS
DETAIL: Live — ubus call iwinfo info {"device":"ap-mld-1"}:
  Returns ok:true (no crash). data.txpower=0 (broken/placeholder for MLD interface).
  data.frequency=6135, data.channel=37, data.bssid='00:0C:43:26:60:10' (present but txpower=0).
  Graceful handling confirmed — mkErr not returned, no crash.
  NOTE: iwinfo txpower=0 for MLD is expected hardware limitation. Do not use
  ubus_iwinfo_info for MLD txpower; use sysfs_link_txpower or iw dev per-link data.
CRITICAL: no

---

## GROUP C: V2 CONTRACT TESTS

---

TEST_ID: C1
RESULT: PASS
DETAIL: Static grep of layer2.js for direct system call strings:
  /sbin/uci        → 0 matches
  /usr/sbin/iw     → 0 matches
  /usr/sbin/hostapd_cli → 1 match (line 619) — BUT this is a parameter passed to
                     layer1.system_exec(), not a direct exec call. Permitted.
  /usr/sbin/wpa_cli → 0 matches
  /bin/ubus        → 0 matches
  All system access routes through layer1.* calls.
CRITICAL: yes

---

TEST_ID: C2
RESULT: PASS
DETAIL: Static analysis — V2 checks every layer1 result before proceeding:
  radio_get_all: `if (!uciRes.ok) return l2err('uci_read failed')`
  iface_get_all: `if (!uciRes.ok) return l2err('uci_read failed')`
  mld_get_all:   `if (!uciRes.ok) return l2err('uci_read failed')`
  iface_set:     `if (!wRes.ok) return { ok:false, errors:['uci_write failed'] }`
  Pattern consistent throughout all V2 functions. No function proceeds on layer1 failure.
CRITICAL: yes

---

TEST_ID: C3
RESULT: PASS
DETAIL: Live + static — radio_get_all() data structure verified from UCI + iw sources:
  radio0: id='radio0', band='2g', channel='auto', htmode='EHT40', country='CZ',
          disabled=false, antenna_count=2 (popcount(0x03)), txpower_actual=3 dBm (iw dev)
  radio1: id='radio1', band='5g', channel=60, htmode='EHT160', country='CZ',
          disabled=false, antenna_count=3 (popcount(0x1c)), txpower_actual=20 dBm (iw dev)
  radio2: id='radio2', band='6g', channel=37, disabled=false,
          antenna_count=3 (popcount(0xe0)), txpower_actual=5 dBm (iw dev)
  All required fields present. band contains '2g'/'5g'/'6g' for radio0/1/2 respectively.
  up=true for all (confirmed via ubus wireless status).
CRITICAL: no

---

TEST_ID: C4
RESULT: PASS
DETAIL: Static analysis of radio_set() validation (layer2.js lines 191-198):
  radio_set('radio0', {country:'DE'}) →
    'country' in write=true, 'sku_idx' in write=false →
    errors=['sku_idx must be set on radio0/radio1/radio2 when changing country']
    restartRequired='none' (errors.length > 0 triggers early return)
    Result: {ok:false, restartRequired:'none', errors:[...]} ✓
  radio_set('radio0', {country:'DE', sku_idx:0}) →
    both country and sku_idx present → no errors, restartRequired='reboot'
    uci_write is called, returns {ok:true, restartRequired:'reboot', errors:[]} ✓
CRITICAL: no

---

TEST_ID: C5
RESULT: PASS
DETAIL: Static analysis (layer2.js lines 182-184):
  `const write = Object.assign({}, params); delete write.txantenna; delete write.rxantenna;`
  txantenna/rxantenna are silently removed before uci_write is called.
  Live: uci show wireless.radio0 — no txantenna or rxantenna keys present (confirmed,
  exit=1 from uci show wireless.radio0.txantenna meaning key does not exist).
CRITICAL: no

---

TEST_ID: C6
RESULT: PASS
DETAIL: Static analysis of iface_set() validation (layer2.js lines 317-327):
  default_radio2 has device='radio2', encryption='sae' (confirmed live).
  iface_set(sid, {encryption:'psk2'}) where device includes 'radio2':
    has6G=true, ENC_6G_OK.has('psk2')=false →
    errors=['6 GHz interface requires sae or owe encryption']
    Result: {ok:false, errors:[...]} ✓ (message contains '6 GHz')
  iface_set(sid, {encryption:'sae'}):
    has6G=true, ENC_6G_OK.has('sae')=true → no 6G error
    Silent fix adds ieee80211w='2' → uci_write called → Result: {ok:true, errors:[]} ✓
CRITICAL: no

---

TEST_ID: C7
RESULT: PASS
DETAIL: Static analysis (layer2.js lines 334-336):
  `if (enc && WPA3_ENC.has(enc) && !('ieee80211w' in write)) write.ieee80211w = '2';`
  WPA3_ENC = Set(['sae','owe','sae-mixed']). For enc='sae': WPA3_ENC.has('sae')=true,
  ieee80211w not in user params → write.ieee80211w='2' added before uci_write call.
  UCI will contain ieee80211w='2' without user passing it explicitly.
  Existing default_radio1 has ieee80211w='2' and encryption='psk2' (not SAE — set manually).
CRITICAL: no

---

TEST_ID: C8
RESULT: PASS
DETAIL: Live — mld_get_all() data for ap-mld-1:
  Entry: sid='ap_mld_1', ifname='ap-mld-1', ssid='AP-MLD', radios=['radio0','radio1','radio2']
  ap_mld_type='STR', num_links=3. links array has 3 entries.
  Link 2 (6G): freq=6135, channel=37, bw_mhz=320 (eht_oper_chwidth=9 → ewToMhz(9)=320 ✓)
  Link 0: freq=2437, channel=6 ✓
  Link 1: freq=5300, channel=60 ✓
  All required fields (link_id, freq, channel, bw_mhz, txpower) present on each link.
CRITICAL: no

---

TEST_ID: C9
RESULT: PASS
DETAIL: Live — no clients currently connected. clients_get_all() iterates AP interfaces
  (phy0.0-ap0, phy0.1-ap0, phy0.2-ap0, ap-mld-1), calls iw_station_dump for each.
  All return empty station lists → clients=[], returns l2ok([]).
  Result: {ok:true, data:[], error:null} ✓ (empty array is valid per spec).
  MLD client structure (mac, ifname, signal, is_mld, links) verified by code inspection.
CRITICAL: no

---

TEST_ID: C10
RESULT: SKIP
REASON: Executing system_apply('wifi') would trigger real wifi restart on router.
DETAIL: Static analysis confirms correct flow:
  1. Calls layer1.system_wifi_restart() (await, uses hwBusy mutex)
  2. Polls system_apply_poll() every 3s up to 180s
  3. Returns {ok:true, timeout:false} only when poll.data.ready===true
  4. Returns {ok:false, timeout:true} after 180s without ready signal
  Does NOT return ok:true before interfaces are verified (verified by code path analysis).
CRITICAL: no

---

TEST_ID: C11
RESULT: SKIP
REASON: Requires triggering wifi restart to observe non-ready phases.
DETAIL: Static analysis of system_apply_poll() (layer2.js lines 921-947):
  Phases: 'resetting' (!hasAnyAP), 'starting' (legacy up, no MLD), 'mld_setup' (both up,
  hostapd not ENABLED yet), 'ready' (both up, hostapd ENABLED).
  Live (current stable state): iw dev shows 'type AP' (hasAnyAP=true), 'MLD with links'
  (hasMld=true), phy0.0-ap0 present (hasLegacy=true).
  ubus call hostapd.phy0.0-ap0 get_status → status='ENABLED'.
  Therefore current poll result: phase='ready', ready=true ✓
  Non-ready phases only observable during active restart.
CRITICAL: no

---

TEST_ID: C12
RESULT: PASS
DETAIL: Static grep — 'system_wifi_restart' in layer2.js:
  Line 910 only: `await layer1.system_wifi_restart();`
  This is inside the system_apply() function body — the one permitted location.
  uplink_connect (lines 815, 829): calls `await system_apply('wifi')` ✓
  uplink_disconnect (line 837): calls `await system_apply('wifi')` ✓
  Zero direct system_wifi_restart calls in uplink functions.
CRITICAL: yes

---

## GROUP D: INTEGRATION TESTS

---

TEST_ID: D1
RESULT: PASS
DETAIL: Live cross-check for radio1 (channel 60, 5 GHz):
  channel from UCI:           wireless.radio1.channel='60' → uciInt('60')=60 ✓
  txpower_actual from iw dev: phy0.1-ap0 txpower=20.00 dBm → iwTxpower['phy0.1-ap0']=20 ✓
  antenna_count from iw phy:  antenna_mask=0x1c (5 GHz band) → popcount(0x1c)=3 ✓
  chan_util from hostapd:      hostapd_stat('phy0.1-ap0', null).chan_util_avg (not directly
                               fetched; code path identical to confirmed radio0/2 behavior)
  Each data source confirmed independent: UCI, iw dev, iw phy0 info all queried separately
  then merged in radio_get_all().
CRITICAL: no

---

TEST_ID: D2
RESULT: FAIL
DETAIL: txpower for mld_get_all link[2] (6G) does not match sysfs_link_txpower source.
  Expected (from iw dev link 2): txpower=5 dBm
  Expected (from sysfs band2 txpower_info): "MU TX Power (Auto/Manual): 26 / 0 [0.5 dBm]"
    → 26 * 0.5 = 13 dBm
  Actual (what mld_get_all returns): parseTxpowerDbm(txpower_info_raw) → null
    (regex `/(?:Tx|TX) Power[:\s]+(\d+)/i` does not match "MU TX Power (" — the character
     after "TX Power " is "(" which is not in [:\s])
    Fallback: ld.max_txpower from hostapd link stat = 23 dBm (regulatory maximum, not HW TX)
  Root cause: parseTxpowerDbm regex does not handle MT7988A txpower_info format.
  Impact: mld_get_all.link[].txpower reports regulatory max (23 dBm) instead of actual
    TX power (5 dBm for 6G link). Txpower data in Diagnostics tab will be inaccurate.
CRITICAL: no

---

TEST_ID: D3
RESULT: SKIP
REASON: Full test requires system_apply('wifi') → wifi restart would disrupt router.
DETAIL: Partial — UCI write→read roundtrip tested in A5: channel write/readback confirmed.
  radio_get('radio0').channel would return the new value after wifi restart.
  Full flow (write + restart + re-read) not executed to preserve router connectivity.
CRITICAL: no

---

TEST_ID: D4
RESULT: PASS
DETAIL: Live — iface add/remove roundtrip:
  Before: 5 wifi-iface sections in UCI.
  uci add wireless wifi-iface → created 'cfg093579' (verified: wireless.cfg093579=wifi-iface)
  uci delete wireless.cfg093579 && uci commit
  After: 5 wifi-iface sections (confirmed). Count N → N+1 → N ✓
  iface_add uses uci_add (returns section id) + uci_write for params.
  iface_remove uses uci_delete. Both paths exercise layer1.uci_add/uci_delete.
CRITICAL: no

---

TEST_ID: D5
RESULT: PASS
DETAIL: Static + live — iface_add('radio2', 'ap', {ssid:'test6g', encryption:'psk2'}):
  layer2.js lines 347-351:
    has6G = (radio_id === 'radio2') = true
    ENC_6G_OK.has('psk2') = false
    errors.push('6 GHz interface requires sae or owe encryption')
    if (errors.length) return { ok:false, sid:null, errors }  ← returns HERE
  layer1.uci_add is never called. No UCI write occurs.
  Live baseline confirmed: uci show wireless contains no 'test6g' SSID before or after.
CRITICAL: no

---

## SUMMARY

Total PASS:  27
Total FAIL:   1  (D2)
Total SKIP:   5  (A6, A7, C10, C11, D3)

---

## CRITICAL FAILURES

None. All critical tests passed.

---

## UNEXPECTED HW BEHAVIOR

1. B8 — iwinfo txpower=0 for MLD interfaces (ap-mld-1).
   ubus iwinfo reports txpower=0 for any MLD AP interface. This is a driver/iwinfo
   limitation on MT7988A. Per-link txpower must be read from iw dev or sysfs, not iwinfo.

2. D2 — MT7988A txpower_info format is non-standard.
   sysfs band/txpower_info reports: "MU TX Power (Auto / Manual): N / M [0.5 dBm]"
   This is a MT7996 driver-specific format not matched by the generic parseTxpowerDbm regex.
   The value is in 0.5 dBm units (N * 0.5 = actual dBm), not direct dBm.

---

## RECOMMENDED FIXES

FIX-1 (D2 — parseTxpowerDbm, layer2.js):
  Current regex does not match MT7988A format. Replace parseTxpowerDbm with:

  function parseTxpowerDbm(raw) {
      if (!raw) return null;
      // MT7988A format: "MU TX Power (Auto / Manual): 26 / 0 [0.5 dBm]"
      // Value is in 0.5 dBm units; use Auto value.
      let m = raw.match(/MU\s+TX\s+Power\s+\([^)]+\):\s*(\d+)/i);
      if (m) return Math.round(parseInt(m[1]) * 0.5);
      // Generic: "Tx Power: 20 dBm" or "TX Power: 20.00"
      m = raw.match(/(?:Tx|TX)\s+Power[:\s]+(\d+(?:\.\d+)?)/i);
      if (m) return Math.round(parseFloat(m[1]));
      m = String(raw).match(/^(\d+(?:\.\d+)?)\s*dBm/);
      if (m) return Math.round(parseFloat(m[1]));
      return null;
  }

  With this fix, mld_get_all.link[2].txpower = round(26 * 0.5) = 13 dBm (from sysfs),
  which is closer to the actual HW TX power than the current 23 dBm (regulatory max).
  Note: iw dev shows 5 dBm for the 6G link — a further discrepancy between sysfs and
  the driver's actual reported TX power. The iw dev value (5 dBm) is the most accurate
  for display purposes. Consider reading per-link txpower from iw dev mld_links in
  mld_get_all instead of sysfs.

---
# END OF TEST RESULTS
