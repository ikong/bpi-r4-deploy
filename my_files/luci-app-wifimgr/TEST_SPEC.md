# luci-app-wifimgr — Functional Test Specification
# Layer 1 + Layer 2 only. Layer 3 / UI excluded.
# Run all tests via SSH on router (192.168.1.1).
# Report each test: PASS / FAIL / SKIP (with reason).
# Do NOT proceed to next test group if previous group has critical failures.

---

## HOW TO RUN

Deploy a test runner script to the router and execute each test via Node.js or
direct shell commands. For JS tests, use a minimal harness:

```javascript
// /tmp/run_tests.js
const L1 = require('/www/luci-static/resources/wifimgr/layer1.js');
const L2 = require('/www/luci-static/resources/wifimgr/layer2.js');
// ... test functions below
```

For shell-level tests, run directly via SSH.

---

## GROUP A: V1 CONTRACT TESTS
# These verify that every V1 function honors the return contract.
# Critical — V2 depends entirely on this contract being correct.

### A1 — Return shape: every read function
Test each read-only V1 function and verify the returned object has
exactly these fields: ok, status, verified, data, error.
- ok must be boolean
- status must be one of: 'OK' | 'PENDING_RELOAD' | 'PENDING_REBOOT' | 'BUSY' | 'ERROR'
- verified must be boolean
- data may be any type but must be present
- error must be null or string

Functions to test:
  uci_read('wireless')
  ubus_wireless_status()
  ubus_hostapd_legacy_status('phy0', 0)
  ubus_iwinfo_info('phy0.0-ap0')
  ubus_iwinfo_devices()
  ubus_network_interface('loopback')
  hostapd_stat('ap-mld-1', null)
  hostapd_stat('ap-mld-1', 0)
  hostapd_stat('ap-mld-1', 1)
  hostapd_stat('ap-mld-1', 2)
  hostapd_all_sta('ap-mld-1')
  iw_dev()
  iw_phy_info()
  iw_channels()
  iw_reg()
  sysfs_fw_version()
  sysfs_sku_disable()
  sysfs_txpower_info(0)
  sysfs_txpower_info(1)
  sysfs_txpower_info(2)
  sysfs_dfs_status()
  sysfs_thermal()
  sysfs_kernel_version()
  system_logs()

PASS criteria: all fields present, ok===true, status==='OK', verified===true, data is non-null.

### A2 — Rule: ok===true requires verified===true
For every function that returned ok:true in A1, confirm verified is also true.
If any function returns {ok:true, verified:false} → CRITICAL FAIL.

### A3 — Mutex: hwBusy blocks concurrent writes
Test sequence:
  1. Start uci_write('wireless', 'radio0', {channel:'6'}) — do NOT await
  2. Immediately call uci_write('wireless', 'radio0', {channel:'11'}) — do NOT await
  3. First call should complete normally
  4. Second call should return {ok:false, status:'BUSY', error:'busy'}

PASS criteria: second call returns BUSY, not a race condition result.

### A4 — Mutex: hwBusy always released after error
Test sequence:
  1. Call uci_write with an invalid section that will fail
  2. Verify hwBusy is false after the failed call
  3. Call a normal uci_write immediately after — must NOT return BUSY

PASS criteria: mutex released even on error path.

### A5 — Verify: uci_write does real HW readback
  1. Call uci_write('wireless', 'radio0', {channel:'6'})
  2. Verify result has verified:true
  3. SSH: uci show wireless.radio0.channel → must show channel='6'
  4. Call uci_write('wireless', 'radio0', {channel:'36'}) to restore

PASS criteria: UCI value on router matches what was written.

### A6 — system_wifi_restart: returns PENDING_RELOAD not OK
Call system_wifi_restart() and verify:
  - status === 'PENDING_RELOAD' (not 'OK' — restart is never "done" from V1 perspective)
  - verified === true (interfaces came back up within timeout)
  - ok === true

PASS criteria: correct status enum, interfaces confirmed up via iw dev.

### A7 — system_reboot: fire-and-forget, no verify
Call system_reboot() and verify return shape BEFORE router reboots:
  - status === 'PENDING_REBOOT'
  - verified === false (cannot verify — connection will be lost)
  - ok === true

DO NOT actually reboot — just check the return value shape without awaiting.
Skip actual execution of this test.

### A8 — Read-only functions exempt from mutex
  1. Set hwBusy = true manually (if accessible) OR start a slow write operation
  2. Call iw_dev() during the busy period
  3. iw_dev() must NOT return BUSY — read-only functions bypass mutex

PASS criteria: iw_dev returns ok:true even while mutex is locked.

---

## GROUP B: V1 DATA CORRECTNESS TESTS
# Verify that V1 returns real, meaningful data from the router.

### B1 — uci_read returns all 3 radios
  uci_read('wireless') → data.wireless must contain radio0, radio1, radio2
  Each must have .type === 'wifi-device'

### B2 — ubus_wireless_status returns radio data
  Result must contain radio0, radio1, radio2 keys.
  stations[] may be empty — that is expected and correct.

### B3 — hostapd_stat MLD: num_links=3, state=ENABLED
  hostapd_stat('ap-mld-1', null) →
    data.state === 'ENABLED'
    data.num_links === '3'
    data.ap_mld_type === 'STR'

### B4 — hostapd_stat per-link: correct frequencies
  hostapd_stat('ap-mld-1', 0) → data.freq in range 2400-2500
  hostapd_stat('ap-mld-1', 1) → data.freq in range 5000-5900
  hostapd_stat('ap-mld-1', 2) → data.freq in range 5925-7125

### B5 — iw_dev: MLD interface present with links
  iw_dev() → data must contain ap-mld-1 interface
  ap-mld-1 must have mld_links with 3 entries (link 0, 1, 2)

### B6 — sysfs_sku_disable: returns boolean
  sysfs_sku_disable() → data must be boolean (true or false), not string '0' or '1'
  For CZ router: data === false (sku_disable=0 means regulation active)

### B7 — sysfs_thermal: returns object with temp values
  sysfs_thermal() → data must be object with at least one key
  Values must be integers (milli-celsius), e.g. cpu-thermal: 45000

### B8 — ubus_iwinfo_info: MLD returns broken data (expected)
  ubus_iwinfo_info('ap-mld-1') →
    This call should either fail OR return txpower=0
    Confirm this is handled gracefully (no crash, returns mkErr or ok with 0 txpower)
    Document actual behavior.

---

## GROUP C: V2 CONTRACT TESTS
# Verify V2 calls only V1, never bypasses layers.
# Verify V2 never proceeds when V1 returns ok:false.

### C1 — V2 never calls UCI/iw/hostapd directly
  Static analysis: grep layer2.js for:
    /sbin/uci
    /usr/sbin/iw
    /usr/sbin/hostapd_cli
    /usr/sbin/wpa_cli
    /bin/ubus
  None of these strings must appear in layer2.js.
  All system access must go through layer1.* calls.

PASS criteria: zero direct system calls in layer2.js.

### C2 — V2 propagates V1 errors upward
  Simulate V1 failure by temporarily breaking a dependency, OR
  pass an invalid config name to layer1.uci_read and verify
  that V2 functions calling it return ok:false with meaningful error,
  not ok:true with null data.

### C3 — radio_get_all: returns 3 radios with correct structure
  radio_get_all() →
    data must be array of length 3
    each entry must have: id, band, channel, htmode, country, disabled,
    txpower_actual, antenna_count, up, freq, chan_util
    radio0: band contains '2g' or '2.4'
    radio1: band contains '5g' or '5'
    radio2: band contains '6g' or '6'

### C4 — radio_set: country change requires reboot
  radio_set('radio0', {country: 'DE'}) →
    restartRequired must === 'reboot' (not 'wifi')
    errors must contain message about sku_idx

  radio_set('radio0', {country: 'DE', sku_idx: 0}) →
    restartRequired must === 'reboot'
    errors must be empty

PASS criteria: correct restart type returned, validation enforced.

### C5 — radio_set: txantenna/rxantenna silently dropped
  radio_set('radio0', {txantenna: '3', rxantenna: '3'}) →
    Must NOT write txantenna or rxantenna to UCI
    SSH: uci show wireless.radio0 must NOT contain txantenna or rxantenna
    ok must be true (silent drop, not error)

### C6 — iface_set: 6G encryption validation
  iface_set for any iface with device including radio2:
    iface_set(sid, {encryption: 'psk2'}) →
      ok must be false
      errors must contain '6 GHz' message

  iface_set(sid, {encryption: 'sae'}) →
    ok must be true
    UCI must contain ieee80211w=2 (silently added)

### C7 — iface_set: SAE/OWE auto-adds ieee80211w
  iface_set(sid, {encryption: 'sae', key: 'testpass'}) →
    ok must be true
    SSH: uci show wireless.<sid> must contain ieee80211w='2'
    User did NOT pass ieee80211w in params — it was added silently

### C8 — mld_get_all: returns MLD with 3 links and real data
  mld_get_all() →
    data must contain at least 1 MLD entry
    entry.links must have length 3
    each link must have: link_id, freq, channel, bw_mhz, txpower
    link 2 (6G): bw_mhz must === 320 (eht_oper_chwidth=9 → 320 MHz)

### C9 — clients_get_all: returns correct structure
  clients_get_all() →
    ok must be true (even if no clients connected — empty array is valid)
    If clients present: each must have mac, ifname, signal, is_mld
    MLD clients must have links array with per-link signal

### C10 — system_apply: polls until ready, returns ok:true
  system_apply('wifi') →
    Must NOT return immediately
    Must poll until interfaces are back up
    ok must be true when interfaces confirmed up
    Must NOT return ok:true before interfaces are verified

### C11 — system_apply_poll: returns correct phases
  Call system_apply('wifi') without awaiting, then immediately poll:
  system_apply_poll() during restart →
    phase must be one of: 'resetting' | 'starting' | 'mld_setup' | 'ready'
    ready must be false during restart
  After restart completes:
    phase must === 'ready'
    ready must === true

### C12 — uplink_connect/disconnect use system_apply not system_wifi_restart
  Static analysis: grep layer2.js for 'system_wifi_restart'
  Must NOT appear outside of system_apply() function itself.
  uplink_connect and uplink_disconnect must call system_apply('wifi').

PASS criteria: zero direct system_wifi_restart calls in uplink functions.

---

## GROUP D: INTEGRATION TESTS
# End-to-end flows through V1→V2 chain.

### D1 — Full radio state read: UCI + ubus + iw combined
  radio_get_all() must combine data from multiple V1 sources:
  - channel from UCI (uci_read)
  - txpower_actual from iw_dev (real HW value)
  - chan_util from hostapd_stat
  - antenna_count from iw_phy_info
  Verify each field comes from the correct source by cross-checking
  with direct SSH commands.

### D2 — MLD per-link data accuracy
  mld_get_all() link[2] (6 GHz):
    freq must match: hostapd_cli -i ap-mld-1 -l 2 stat | grep freq
    bw_mhz must be 320 (eht_oper_chwidth=9)
    txpower must match: sysfs_link_txpower('ap-mld-1', 2)

### D3 — Write→read roundtrip: channel change
  1. radio_get('radio0') → record current channel
  2. radio_set('radio0', {channel: '11'})
  3. system_apply('wifi') → wait for completion
  4. radio_get('radio0') → channel must now === 11
  5. Restore original channel

### D4 — iface add/remove roundtrip
  1. iface_get_all() → record count N
  2. iface_add('radio0', 'ap', {ssid:'test-wifimgr', encryption:'none'})
  3. iface_get_all() → count must be N+1
  4. iface_remove(new_sid)
  5. iface_get_all() → count must be N again

### D5 — Validation chain: V2 never writes invalid config to V1
  Attempt: iface_add('radio2', 'ap', {ssid:'test6g', encryption:'psk2'})
  Expected: ok:false, errors non-empty, NO UCI write performed
  SSH verify: uci show wireless must NOT contain 'test6g'

---

## REPORTING FORMAT

For each test report:
  TEST_ID: A1
  RESULT: PASS | FAIL | SKIP
  DETAIL: (what was observed, actual vs expected values)
  CRITICAL: yes | no  (critical = blocks V2 correctness)

At the end, provide:
  - Total PASS / FAIL / SKIP counts
  - List of all CRITICAL failures
  - List of unexpected HW behavior discovered during testing
  - Recommended fixes for any failures

---
# END OF TEST SPECIFICATION
