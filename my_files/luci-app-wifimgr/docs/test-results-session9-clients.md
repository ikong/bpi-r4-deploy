# Test Results — Clients Tab + Multi-Device (Session 9, 2026-05-09)

## What was tested
Clients tab redesign verified with 3 iPhones connected simultaneously to MT76_AP_MLD (MLO AP).
Also validated WiFi generation detection (badge + band pills) across WiFi 4/6/7 devices.

Hardware: BPI-R4 (MT7988A), AP: MT76_AP_MLD (ap-mld-1), 3-band MLO

---

## Clients tab redesign — changes

| Before | After |
|--------|-------|
| Header: MAC + badge + signal bars | Header: MAC + badge + **band pills** + signal + **speed** + time + SSID |
| Signal: iw top-level (0 dBm for MLO) | Signal: best per-link signal (correct value) |
| Per-link: Band/Link/Signal/Mode/TX/RX | Per-link: Band/Signal/↓ Download/↑ Upload |
| Bitrate: "2401.9 MBit/s 160MHz EHT-MCS 11 EHT-NSS 2 EHT-GI 0" | Bitrate: "2402 Mbit/s" + "EHT MCS11 NSS2" (2 lines) |
| Signal 0 dBm shown as green bars | Signal 0 → "—" (unmeasured/idle) |
| MLO clients collapsed by default | MLO clients **open by default** |

---

## Device test results

### iPhone 16 — WiFi 7 / MLO
- Badge: `[WiFi 7]`
- Band pills: `[2.4G][5G][6G]`
- Active link: **6G**, 2402 Mbit/s EHT-MCS 11 NSS2 ↓ / 2161 Mbit/s EHT-MCS 10 NSS2 ↑
- 5G link signal: `—` (link present but idle — iPhone 16 prefers 6G)
- Flags: EHT + HE ✓

### iPhone 11 — WiFi 6
- Badge: `[WiFi 6]`
- Band pills: `[5 GHz]`
- Connected to ap-mld-1 as legacy HE client (no 6G support, single link)
- Speed: 649 Mbit/s ↓ / 540 Mbit/s ↑ HE-MCS 6/10 NSS2
- Signal: -40 dBm
- Flags: HE + VHT ✓ (device supports both WiFi 6 and WiFi 5)

### iPhone 6s — WiFi 4
- Badge: `[WiFi 4]`
- Band pills: `[2.4G]`
- Connected to ap-mld-1 as legacy HT client (single link, 2.4G only)
- Speed: 144 Mbit/s ↓ / 130 Mbit/s ↑ MCS15 SGI
- Signal: -31 dBm ✓

---

## Key observations

- **WiFi gen detection works across all generations**: WiFi 4 (MCS), WiFi 6 (HE), WiFi 7 (EHT) auto-detected from iw bitrate string
- **Legacy client on MLO AP**: iPhone 6s + iPhone 11 both connected to ap-mld-1 as legacy non-MLO clients — AP correctly serves both MLO and legacy simultaneously
- **iPhone 16 link selection**: uses 6G exclusively for data, 2.4G and 5G links are present but idle
- **band pills accurate**: each device shows correct band(s) based on per-link frequency mapping

## Known anomaly
- Apple Watch (b2:9d:56:d4:e4:00) connected to "OpenWrt-2g" AP shows `[5 GHz]` pill — likely band pill lookup bug for clients on legacy APs. Not blocking.
