# luci-app-wifimgr — UI Design Brief
# For Claude Code implementation
# WOZIWRT+CLAUDE | May 2026

---

## OVERVIEW

Redesign the existing UI (index.js + layer3.js) according to this specification.
Keep all Layer 1 and Layer 2 code unchanged.
Only view files and layer3.js wizards are in scope.

---

## TERMINOLOGY — MANDATORY

These replacements are non-negotiable. Wrong terms must not appear anywhere in the UI.

| Old (forbidden) | New (use this) |
|-----------------|----------------|
| Uplink          | WiFi Connection |
| STA             | (never show to user — use context: "connected to", "repeater") |
| uplink iface    | WiFi connection |
| MLD             | WiFi 7 (show "WiFi 7" to user, keep "MLD" only in technical details in Advanced) |
| PENDING_RELOAD  | "Applying changes..." |
| PENDING_REBOOT  | "Reboot required" |
| ERROR           | "Failed" |
| BUSY            | "Please wait..." |
| ieee80211w      | (never show — internal only) |
| sku_idx         | (never show in Basic — internal only) |
| htmode          | Channel width |
| noscan          | (never show in Basic) |

---

## MODE SYSTEM

### Two modes: Basic and Advanced

Default mode on first load: **Basic**.
Persistence: localStorage key 'wifimgr_mode' = 'basic' or 'advanced'.

Mode toggle button: top-right corner of the page, always visible.
- In Basic: button label = "Advanced mode"
- In Advanced: button label = "Basic mode"

Switching mode reloads the current tab content immediately (no page reload).

### What changes between modes:

| Element | Basic | Advanced |
|---------|-------|----------|
| Overview radio cards | Band + role only ("Access point", "Repeater", "Idle") | Full stats: channel, htmode, txpower, utilization, antenna count |
| Overview MLD section | SSID + "WiFi 7 · 3 bands · WPA3" | Full per-link data: channel, freq, bandwidth, txpower, utilization |
| Overview Legacy APs | SSID + status badge only | SSID + encryption + band + status |
| Radios tab | Hidden | Visible |
| Networks tab | Simplified (SSID + security type only, add/remove) | Full parameters + collapsible details |
| WiFi Connection tab | Simplified (SSID + signal + status) | Full: per-link signal, bitrate, IP, L2 method, wpa_state |
| Clients tab | Name/MAC + signal + connected time | Full: per-link MLD data, flags (EHT/HE/VHT), bitrate |
| Diagnostics tab | Thermal + FW version only | Full: txpower_info per band, DFS status, kernel, mt76 debug, logs |
| Wizards | Main navigation — large action buttons | Available as secondary action in each tab |
| L2 method (WiFi Connection wizard) | Human descriptions (see below) | Technical: NAT / relayd / WDS |
| Apply flow | Progress bar only: "Applying changes..." | Phase details: stopping / starting / mld_setup / ready |
| Validation errors | Human sentences: "This network requires WPA3" | Technical: "6 GHz interface requires sae or owe encryption" |

---

## TAB STRUCTURE

### Tab names and visibility:

| Tab name | Visible in Basic | Visible in Advanced | Condition |
|----------|-----------------|---------------------|-----------|
| Overview | Yes | Yes | Always |
| Radios | No | Yes | Always (Advanced only) |
| Networks | Yes | Yes | Always |
| WiFi Connection | Yes | Yes | Only if STA iface exists |
| Clients | Yes | Yes | Only if AP iface exists |
| Diagnostics | Yes | Yes | Always |

---

## OVERVIEW TAB

### Radio cards (always 3 — one per physical radio)

Each card shows the physical radio state.
Card layout: band label (2.4 GHz / 5 GHz / 6 GHz) + UP/DOWN badge.

Basic mode card body:
  Role description: "Access point", "WiFi 7 access point", "Repeater", "Idle"

Advanced mode card body:
  CH {channel} · {htmode} · TX {txpower_actual} dBm · Util {chan_util}% · Ant {antenna_count}

### MLD section (if MLD iface exists)

Header: dot indicator (green=ENABLED) + SSID in quotes + ifname in muted text
Right side: "{ap_mld_type} · {num_links} links · {encryption label}"

Per-link cards (one per link, colored by band):
  2.4 GHz color: blue
  5 GHz color: green
  6 GHz color: amber

Basic mode link card: "CH {channel} · {bw_mhz} MHz · TX {txpower} dBm"
Advanced mode link card: above + "Freq {freq} MHz · Util {chan_util}%"

### Legacy APs section (if any non-MLD AP ifaces exist)

List of rows. Each row:
  Band pill (colored: blue=2.4, green=5, amber=6) + SSID + encryption label + status badge

### WiFi Connection section (if STA iface exists)

Basic: "Connected to: {ssid} · Signal: {signal} dBm · {wpa_state label}"
Advanced: above + IP address + bitrate + L2 method + per-link data if MLO

### Footer bar (always visible at bottom of Overview)

"Clients: {N} total · WiFi 7: {M} EHT · SKU: {country} {active/inactive} · FW: {fw_version}"

Poll interval: 10 seconds. Preserve collapsible states across polls.

---

## RADIOS TAB (Advanced only)

One section per radio (radio0, radio1, radio2).
Each section is collapsible. Default: all expanded.

Fields per radio:
  - Channel (dropdown or "auto")
  - Channel width (htmode) — dropdown
  - TX power (txpower) — number input or "auto"
  - Country + sku_idx — only editable via Country wizard (button opens wizard)
  - DFS: background_radar toggle
  - noscan toggle
  - Disabled toggle (with destructive warning)

Apply button per radio → calls radio_set() → system_apply() with correct restart type.
Country change → always show reboot warning before applying.

---

## NETWORKS TAB

List of all wifi-iface sections (MLD + legacy AP).
Each network is a collapsible card.

Card header (always visible):
  Band pill(s) + SSID + encryption label + mode badge (AP / WiFi 7 AP) + status

Card body (collapsed by default, expand on click):

  Basic mode:
    SSID (editable) + password (editable) + security type (simplified dropdown)
    Save button

  Advanced mode:
    All parameters: ssid, encryption, key, hidden, isolate, wmm, maxassoc
    MLD-specific: per-link channel info (read-only, from mld_get_all)
    Save button + validation errors inline

Add network button: opens wizard selector
  - "Add access point" → wizard_ap_setup
  - "Add WiFi 7 (MLO)" → wizard_mlo_setup

Remove button on each card: with confirmation dialog.
Destructive warning if MLD: "Removing this network disconnects all clients on all bands."

---

## WIFI CONNECTION TAB (replaces "Uplink")

Visible only when at least one STA iface exists.

If no STA iface: tab is hidden (not just empty).

### Connection status card

Shows current connection state from uplink_get_all().

Basic:
  Large status: connected icon + SSID + "Connected" / "Disconnected"
  Signal strength indicator (visual bar, not just number)
  IP address if connected

Advanced:
  Above + wpa_state + bssid + ap_mld_addr (if MLO) + wifi_generation
  Per-link table: link_id | freq | channel | bw_mhz | signal | tx_bitrate | rx_bitrate
  L2 method badge: "NAT" / "Bridge (relayd)" / "WDS"

### Connect to network button → opens wizard_sta_connect

Wizard steps:
  1. Select radio (Advanced only — Basic auto-selects)
  2. Scan for networks → show list with signal bars + SSID + encryption icon
  3. Enter password
  4. L2 method selection:
     Basic: "Standard (NAT)" / "Bridge mode (relayd)" / "High performance (WDS — MTK only)"
     Advanced: NAT / relayd / WDS (raw labels)
  5. Apply → system_apply('wifi')

### Disconnect button: with confirmation. Calls uplink_disconnect().

Poll interval: 10 seconds.

---

## CLIENTS TAB

Visible only when at least one AP iface exists.

### Summary bar
"Total: {N} clients · WiFi 7: {M} EHT · Average signal: {avg} dBm"

### Client list

Each client is a row (or collapsible card in Advanced).

Basic row:
  MAC / hostname + signal bar + connected time

Advanced row (collapsible):
  MAC + is_mld badge + flags (EHT / HE / VHT) + signal + tx_bitrate + rx_bitrate
  If MLD client: per-link table: link_id | signal | tx_bitrate | rx_bitrate
  Deauth button (with confirmation)

Poll interval: 10 seconds.

---

## DIAGNOSTICS TAB

Always visible in both modes.

### Basic mode shows:
  - FW version
  - Thermal: visual temperature bars for each zone
  - SKU status + country

### Advanced mode adds:
  - Kernel version
  - Regulatory domain (iw reg get raw output, collapsible)
  - TX power info per band (collapsible, raw sysfs output)
  - DFS status (collapsible)
  - System logs (collapsible, last 100 lines)

Thermal poll interval: 30 seconds.
All collapsibles: preserve state across polls.

---

## WIZARDS (layer3.js)

All wizards are modal dialogs (not separate pages).
Wizards are available in both Basic and Advanced.
In Basic: wizards are the primary way to configure.
In Advanced: wizards are secondary (button in each tab).

### wizard_ap_setup
Steps: [Select radio (Advanced) / SSID / Password / Security (Advanced: full, Basic: auto sae-mixed)] → Apply
Basic: auto-selects best available radio.

### wizard_mlo_setup
Steps: [Select radios (Advanced: checkboxes, Basic: auto 5G+6G)] / SSID / Password → Apply
Show info: "6 GHz requires WPA3 — selected automatically."

### wizard_sta_connect
Steps: Scan → Select network → Password → L2 method → Apply
Basic: L2 method shown with human descriptions (see WiFi Connection tab above).

### wizard_repeater
Steps: Select upstream network (scan) → Password → Select local AP radio → Local SSID → Apply

### wizard_country
Steps: Select country → Warning dialog ("Reboot required, WiFi will be unavailable ~60s") → Apply
Always available in: Radios tab (Advanced) + Settings (Basic).

---

## APPLY FLOW (shared across all tabs and wizards)

Implement as a single shared function used everywhere.

Steps:
1. Disable all inputs + show spinner
2. Call the appropriate V2 set/add/remove function
3. Check restartRequired from result
4. If restartRequired === 'none': show "Saved" badge, re-enable inputs
5. If restartRequired === 'wifi': show progress bar, call system_apply('wifi'), poll every 3s
6. If restartRequired === 'reboot': show reboot warning dialog first, then system_apply('reboot')
7. On completion: reload tab data, show "Done" or "Reboot required — please wait"
8. On timeout (3 min): show "Timeout — try rebooting manually"

Basic progress: simple "Applying changes..." with spinner
Advanced progress: phase label: "Stopping WiFi..." / "Starting..." / "Enabling WiFi 7..." / "Done"

Destructive operations (mlo toggle, radio disable, country change, remove network):
  Always show confirmation dialog before step 2.

---

## VISUAL RULES

- Dark background on radio band pills: blue for 2.4 GHz, green for 5 GHz, amber for 6 GHz
- Status badges: green=ENABLED/UP, red=DOWN, gray=DISABLED, yellow=PENDING
- Signal strength: show as dBm number + visual bar (4 bars: >-50 / -50 to -65 / -65 to -75 / <-75)
- All collapsibles: animate open/close, preserve state in localStorage
- Poll updates: update data in-place without full re-render (no flicker)
- Mode toggle: smooth transition, no page reload
- Error messages: inline below the relevant field, not in a toast or alert
- Success: brief green badge ("Saved") that fades after 2 seconds
- Loading states: skeleton placeholders, not spinners blocking the whole tab

---

## WHAT NOT TO DO

- Never show raw UCI section names (cfg093579, wifinet0) to user in Basic mode
- Never show ieee80211w, noscan, background_radar in Basic mode
- Never use the word "Uplink" anywhere in the UI
- Never use "STA" anywhere visible to the user
- Never use "MLD" in Basic mode — use "WiFi 7" instead
- Never show raw hostapd/wpa_cli output to user
- Never block the entire UI while polling — always keep the rest of the page responsive

---
# END OF UI DESIGN BRIEF
