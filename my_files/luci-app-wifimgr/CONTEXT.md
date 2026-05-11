# luci-app-wifimgr — Claude Code Context
# Layer 1 implementation agent instructions
# Project: woziwrt/luci-app-wifimgr | May 2026 | WOZIWRT+CLAUDE

---

## AGENT ROLE

You are implementing Layer 1 (atomic operations) of luci-app-wifimgr, a LuCI WiFi manager
for OpenWrt on BPI-R4 (MT7988A, WiFi 7, 3 radios: radio0=2.4GHz, radio1=5GHz, radio2=6GHz).

You work autonomously: implement one function → SSH test → fix → repeat until test passes → commit → next function.
Do not proceed to next function until current passes its test.
Stop and ask the user only when you hit unexpected HW behavior not covered here.

---

## SSH ACCESS

host: 192.168.1.1
user: root
password: (none — just press enter)
command: ssh root@192.168.1.1

Router is a test device. Nothing can be permanently broken — SD card restore always available.
You have full root access. Do whatever is needed.

---

## GIT

Repo already exists. Clone and work in it:
  gh repo clone woziwrt/luci-app-wifimgr

Commit format: "V1: {function_name} tested OK"
Commit after each function passes ALL its tests.
Push after each commit.

---

## PROJECT FILE STRUCTURE

luci-app-wifimgr/
  htdocs/luci-static/resources/wifimgr/
    layer1.js          ← ALL Layer 1 functions go here
  Makefile             ← minimal OpenWrt package Makefile
  README.md

layer1.js is the ONLY file you implement in this phase.
Do not create layer2.js or any other files yet.

---

## LAYER 1 — DESIGN RULES

Layer 1 = dumb wrappers over the system. No validation, no semantics.
One logical operation = one function.
uci set + uci commit = ONE function. Never split.

### Every function returns this object:
```javascript
{
  ok: boolean,        // true ONLY when verified===true AND status==='OK'
  status: string,     // 'OK' | 'PENDING_RELOAD' | 'PENDING_REBOOT' | 'BUSY' | 'ERROR'
  verified: boolean,  // HW state was read back and matches expected value
  data: any,          // return data (null for write operations)
  error: null|string  // null | 'timeout' | 'hw_mismatch' | 'exec_failed' | 'busy'
}
```

ok must NEVER be true when verified is false. This is the most important rule.

### Verify-after-execute (mandatory for all write operations):
After every HW command, read back actual HW state via iw/ubus/sysfs (NOT from UCI)
and compare to expected value. exit code 0 is not sufficient.
Use polling where needed (check every 500ms, timeout after 10s).

### HW Mutex (hwBusy flag):
One global flag: let hwBusy = false
Before any write/HW command: if hwBusy → return {ok:false, status:'BUSY', ...}
Set hwBusy=true before command, clear after verify completes (any outcome).
Read-only functions (iw_dev, ubus_wireless_status, sysfs_read, etc.) are EXEMPT from mutex.

### Code style:
- Plain JS functions, no classes, no OOP
- Module pattern: const Layer1 = (function() { ... return { ... }; })();
- All comments in English
- LF line endings only
- No TypeScript, no transpilation

---

## HOW TO DEPLOY AND TEST ON ROUTER

Copy layer1.js to router:
  scp htdocs/luci-static/resources/wifimgr/layer1.js root@192.168.1.1:/tmp/

Test on router via Node.js or directly in browser console (LuCI loads JS from /www/).
For quick CLI testing, use a minimal test runner via SSH:
  ssh root@192.168.1.1 "node -e 'require(\"/tmp/layer1.js\"); ...'"

Or install to LuCI path for browser testing:
  ssh root@192.168.1.1 "mkdir -p /www/luci-static/resources/wifimgr/"
  scp layer1.js root@192.168.1.1:/www/luci-static/resources/wifimgr/

Verify file was copied correctly:
  ssh root@192.168.1.1 "wc -c /www/luci-static/resources/wifimgr/layer1.js"

---

## ROUTER INITIAL STATE

Before writing any code, connect via SSH and run these discovery commands to understand
the actual current state of the router — it may have leftover configuration from previous
test sessions (relayd, STA interfaces, custom UCI sections, etc.):

  iw dev
  uci show wireless
  ubus call network.wireless status
  ip link show

Use what you find as the actual baseline. Do not assume the interface list matches
the examples below — always derive it from iw dev output.

---

## ROUTER HW FACTS (critical quirks)

### Interface naming on this router (AP mode, current state):
- ap-mld-1        MLO AP (radio0+radio1+radio2 as MLD, mlo=1)
- phy0.0-ap0      Legacy AP 2.4GHz
- phy0.1-ap0      Legacy AP 5GHz  
- phy0.2-ap0      Legacy AP 6GHz
- sta-mld0        MLO STA (when STA configured, mlo=1)
- phy0.0-sta0     Legacy STA 2.4GHz (when configured)

Interface names can change after wifi restart or mlo toggle. Always discover dynamically from iw_dev().

### ubus quirks:
- ubus call iwinfo info works ONLY for legacy interfaces (phy0.N-ap0)
- For ap-mld-1: txpower=0, htmode=NOHT — this is expected/broken, do not use
- ubus call network.wireless status: stations[] is always empty — do not use for clients
- STA network interface: ubus call network.interface.wwan status

### hostapd quirks:
- Connac3 naming: hostapd-phy0.0.conf / phy0.1.conf / phy0.2.conf (different from WiFi 6!)
- hostapd_cli -i ap-mld-1 stat → MLD status with num_links, ap_mld_type=STR
- hostapd_cli -i ap-mld-1 -l N stat → per-link status (link 0/1/2)
- No hostapd API for STA side — STA uses wpa_supplicant → use wpa_cli

### rpcd quirks:
- uci add + uci set via rpcd does NOT work for wifi-iface
- Workaround: use system_exec() to run the entire UCI script as one shell command

### wifi restart quirks:
- /sbin/wifi can hang — always use timeout when calling it
- After wifi restart, interfaces may take 5-15s to come back up
- Poll for interface existence before declaring verify success

### sysfs paths:
- /sys/kernel/debug/ieee80211/phy0/mt76/fw_version
- /sys/kernel/debug/ieee80211/phy0/mt76/sku_disable
- /sys/kernel/debug/ieee80211/phy0/mt76/band0/txpower_info  (band1, band2)
- /sys/kernel/debug/ieee80211/phy0/dfs_status
- /sys/class/thermal/thermal_zone*/temp  and  .../type
- /proc/version

---

## COMPLETE FUNCTION LIST — implement in this order

### GROUP 1: UCI functions
1.  uci_read(config)
2.  uci_write(config, section, values)
3.  uci_add(config, type)
4.  uci_delete(config, section)
5.  uci_list_add(config, section, key, value)
6.  uci_list_del(config, section, key, value)

### GROUP 2: ubus functions
7.  ubus_wireless_status()
8.  ubus_hostapd_legacy_status(phy, radio_idx)
9.  ubus_iwinfo_info(ifname)
10. ubus_iwinfo_devices()
11. ubus_network_interface(name)

### GROUP 3: hostapd_cli functions
12. hostapd_stat(ifname, link)
13. hostapd_all_sta(ifname)
14. hostapd_sta(ifname, link, mac)

### GROUP 4: iw functions
15. iw_dev()
16. iw_station_dump(ifname)
17. iw_link(ifname)
18. iw_scan(ifname)
19. iw_phy_info()
20. iw_channels()
21. iw_reg()

### GROUP 5: wpa_cli functions (STA)
22. wpa_status(ifname)
23. wpa_scan_results(ifname)

### GROUP 6: sysfs functions
24. sysfs_read(path)
25. sysfs_thermal()
26. sysfs_fw_version()
27. sysfs_sku_disable()
28. sysfs_txpower_info(band_idx)
29. sysfs_dfs_status()
30. sysfs_link_txpower(ifname, link_idx)
31. sysfs_mt76_links_info(ifname)
32. sysfs_kernel_version()

### GROUP 7: system functions
33. system_wifi_restart()
34. system_wifi_reload()
35. system_reboot()
36. system_logs()
37. system_exec(cmd, args)

---

## TEST COMMANDS PER GROUP (run on router via SSH)

### UCI tests:
uci show wireless                                          # → test uci_read
uci set wireless.radio0.channel='6' && uci commit wireless # → test uci_write
uci show wireless.radio0 | grep channel                    # → verify channel=6

### ubus tests:
ubus call network.wireless status                          # → test ubus_wireless_status
ubus call hostapd.phy0.0-ap0 get_status                   # → test ubus_hostapd_legacy_status
ubus call iwinfo info '{"device":"phy0.0-ap0"}'            # → test ubus_iwinfo_info (txpower must be non-zero)
ubus call iwinfo info '{"device":"ap-mld-1"}'              # → confirm txpower=0 (expected broken)
ubus call network.interface.wwan status                    # → test ubus_network_interface

### hostapd_cli tests:
hostapd_cli -i ap-mld-1 stat                               # → state=ENABLED, num_links=3
hostapd_cli -i ap-mld-1 -l 2 stat                         # → freq=6xxx, eht_oper_chwidth=9
hostapd_cli -i ap-mld-1 all_sta                            # → client MACs (may be empty if no clients)
hostapd_cli -i phy0.0-ap0 stat                             # → legacy AP stat

### iw tests:
iw dev                                                     # → ap-mld-1 with MLD links + phy0.N-ap0
iw dev sta-mld0 link                                       # → STA only: MLD BSSID + per-link info
iw dev sta-mld0 station dump                               # → STA only: per-link signal/bitrate
iw dev phy0.0-sta0 scan 2>/dev/null | grep -E 'SSID:|signal:|freq:'
iw phy0 info                                               # → ciphers, htmodes, antenna masks
iw phy0 channels                                           # → DFS state, max TX
iw reg get                                                 # → country, DFS scheme

### wpa_cli tests (STA router only):
wpa_cli -i phy0.0-sta0 status                              # → wpa_state, bssid, wifi_generation
wpa_cli -i sta-mld0 status                                 # → ap_mld_addr, channel_width=320, SAE-EXT-KEY
wpa_cli -i phy0.0-sta0 scan_results                        # → tab-separated: bssid/freq/signal/flags/ssid

### sysfs tests:
cat /sys/kernel/debug/ieee80211/phy0/mt76/fw_version       # → Version: 4.4.x
cat /sys/kernel/debug/ieee80211/phy0/mt76/sku_disable      # → 0 or 1
cat /sys/kernel/debug/ieee80211/phy0/mt76/band0/txpower_info
for d in /sys/class/thermal/thermal_zone*; do echo $(cat $d/type): $(cat $d/temp); done

---

## WHAT COUNTS AS "TEST PASSED"

For read functions: function returns {ok:true, status:'OK', verified:true, data: <non-empty result>}
For write functions: function returns {ok:true, status:'OK', verified:true} AND HW state confirmed via read-back
For system_wifi_restart/reload: returns {ok:true, status:'PENDING_RELOAD'} immediately, then poll confirms interfaces come back up within 15s
For system_reboot: not tested (would kill SSH session)

If a function returns PENDING_RELOAD or PENDING_REBOOT and that is the correct/expected behavior for that command — that counts as passed.

---

## ON UNEXPECTED SITUATIONS

Stop immediately and ask the user if:
- A command that should exist is not found on the router
- HW behaves in a way not described in this document
- A test fails in a way you cannot diagnose within 3 attempts
- You are about to do something destructive that is not listed here

Do NOT guess at HW behavior. Do NOT invent workarounds for undocumented quirks without asking.

---

## FINAL CHECKLIST BEFORE DECLARING V1 COMPLETE

- All 37 functions implemented in layer1.js
- All functions return the standard {ok, status, verified, data, error} object
- hwBusy mutex implemented and working
- All read functions tested OK on router
- All write functions tested OK with HW verify
- layer1.js committed and pushed to woziwrt/luci-app-wifimgr
- wc -c of layer1.js recorded in final commit message

---
# END OF CONTEXT
