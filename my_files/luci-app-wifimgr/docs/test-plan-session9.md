# Test Plan — Session 9: Wizard Add/Remove + L2

## BLOK A — wizardAP add/remove (AP router 192.168.1.1)

**A1** — 2.4G AP: Add `t-2g` WPA2 radio0 → verify Networks tab → connect phone → Clients tab → Remove  
**A2** — 5G AP non-DFS: Add `t-5g` WPA2 radio1 CH36 → verify → connect → Remove  
**A3** — 5G AP DFS: Add `t-5g-dfs` radio1 CH52 → wait ~60s CAC → verify → Remove  
**A4** — 6G AP: Add `t-6g` WPA3 radio2 → verify (SSID visible on iPhone 16) → Remove  
**A5** — Edit: existing `default_radio0` → change SSID → Save → verify WiFi restart → revert  

---

## BLOK B — wizardMLO add/remove (AP router)

**B1** — 2-link 2.4G+5G: `t-mlo-25`, toggle [6G] OFF → verify 2 band pills → connect iPhone 16 → Clients 2 links → Remove  
**B2** — 2-link 2.4G+6G: `t-mlo-26`, toggle [5G] OFF → verify → Remove  
**B3** — 2-link 5G+6G: `t-mlo-56`, toggle [2.4G] OFF → verify → Remove  
**B4** — 3-link: `t-mlo-3x` WPA3 all bands → verify 3 band pills → connect iPhone 16 → Clients 3 links → Remove  

---

## BLOK C — wizardStation (STA router 10.20.30.1)

*Before each step: verify tunnel `ping 10.20.30.1`*

**C1** — 2G STA: Add STA `OpenWrt-2g` radio0 → verify connected → AP router Clients tab → Remove  
**C2** — 5G STA: Add STA `OpenWrt-5g` radio1 → verify → Remove  
**C3** — MLO STA (untested!): wizardStation → toggle MLO ON → Assoc band select → verify → Remove  

---

## BLOK D — WDS + relayd (STA router → AP router)

*First: check `ssh root@10.20.30.1 'opkg list-installed | grep relayd'`*  
*WDS needs: AP router BSSID from Networks tab detail view*

**D1** — WDS: STA router wizardWDS → SSID `OpenWrt-5g`, remote MAC=AP BSSID, mode=WDS  
→ verify L2 bridge: `ping 192.168.1.1` from STA router → Remove  

**D2** — relayd: same wizard, mode=relayd → verify L2 relay → Remove  

**IPsec recovery if tunnel drops:** `swanctl --initiate --ike <ike-name> --child <child-name>`
