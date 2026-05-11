# luci-app-wifimgr — Capability Analysis
**HW:** BPI-R4 / MT7996E (BE19000) / OpenWrt 25.12-SNAPSHOT / FW 4.4.26.03  
**Zdroje:** MTK Programming Guide v4.14, HW testy doc1-4, layer0 inventory, design docs A-C  
**Datum:** 2026-05-07

---

## 1. Cíl projektu

Nový LuCI modul pro BPI-R4 (MT7996E single-wiphy, WiFi 7 MLO) který:
- Správně čte a zapisuje **všechny funkční parametry** MT7996E přes UCI/ubus/hostapd/iw/debugfs
- Nahrazuje mainline luci-app-wireless který s touto kartou nefunguje správně
- Zobrazuje live runtime stav (per-link channel/txpower/utilization/klienti)
- Validuje MTK-specifické závislosti (country+sku_idx, SAE+ieee80211w, 6G+WPA3 atd.)

---

## 2. Co UMÍME číst

### 2.1 UCI konfigurace
| Sekce | Parametry | Stav |
|---|---|---|
| wifi-device | band, channel, htmode, country, sku_idx, disabled, noscan, background_radar, txpower | ✓ |
| wifi-device MTK | mbssid, mu_onoff, he_twt_responder, etxbfen, itxbfen, sr_enable, sr_enhanced, lpi_enable, beacon_dup, sku_idx | ✓ |
| wifi-iface | device (list), mode, ssid, encryption, key, ieee80211w, network, hidden, isolate, wmm, maxassoc, mlo | ✓ |
| wifi-iface MTK | beacon_prot, sae_pwe, fils_discovery_min/max_interval, unsol_bcast_probe_resp_interval, rnr, assoc_phy, mld_id, mld_allowed_links, mld_addr, eml_disable | ✓ |

### 2.2 Runtime — ubus
| Volání | Data | Poznámka |
|---|---|---|
| `network.wireless status` | radio up/down, config, ifname per section | stations[] vždy prázdné — nepoužívat |
| `hostapd.phy0.N-ap0 get_status` | status, freq, channel, op_class, airtime.utilization, dfs.cac_active | legacy iface only |
| `hostapd.ap-mld-1 get_status` | status, freq — ale jen link0! | per-link → hostapd_cli -l N |
| `iwinfo info {phy0.N-ap0}` | channel, txpower, htmodes, hwmodes, hardware.name | MLD vrací garbage — nepoužívat |
| `network.interface.wwan status` | up, ipv4-address, l3_device | pro STA L3 stav |

### 2.3 Runtime — hostapd_cli
| Příkaz | Data |
|---|---|
| `hostapd_cli -i ap-mld-1 stat` | state, num_links, ap_mld_type (STR/EMLSR), mld_addr, chan_util_avg, bss[] |
| `hostapd_cli -i ap-mld-1 -l N stat` | freq, channel, eht_oper_chwidth, max_txpower, chan_util_avg per link |
| `hostapd_cli -i ap-mld-1 all_sta` | MAC, flags[EHT/6GHZ], signal, peer_addr[N], nstr_bitmap, emlsr_support |
| `hostapd_cli -i phy0.N-ap0 stat` | state, freq, channel, num_sta, chan_util_avg |

### 2.4 Runtime — iw
| Příkaz | Data |
|---|---|
| `iw dev` | všechny iface, type, channel, width, txpower; MLD → per-link channel/width/txpower |
| `iw dev <iface> station dump` | klienti: signal per-link, tx/rx bitrate s EHT-MCS, connected_time |
| `iw dev <sta-iface> link` | STA: BSSID, per-link freq/signal/bitrate |
| `iw phy0 info` | ciphers, htmodes, antenna bitmaps per radio |
| `iw phy0 channels` | dostupné kanály, DFS state, max txpower |
| `iw reg get` | regulatory domain, freq ranges, max EIRP, DFS scheme |

### 2.5 debugfs / sysfs
| Cesta | Data |
|---|---|
| `.../mt76/fw_version` | FW verze, ROM/WM/WA/DSP patch, Adie ID |
| `.../mt76/sku_disable` | 0=SKU aktivní, 1=bez regulace |
| `.../mt76/band{0,1,2}/txpower_info` | SKU/RegDB/eeprom max, front-end loss, LPI, thermal |
| `.../mt76/dfs_status` | DFS channel state per wdev |
| `.../netdev:<ifname>/link-N/txpower` | per-link live txpower — nejspolehlivější zdroj |
| `.../netdev:<ifname>/mt76_links_info` | MLO topologie debug |
| `/sys/class/thermal/thermal_zone*/temp` | teplota v milli-°C |
| `/proc/version` | kernel verze |

---

## 3. Co UMÍME zapisovat

### 3.1 Radio (wifi-device)
| Parametr | Funguje | Poznámka |
|---|---|---|
| channel | ✓ wifi | ACS = `auto` |
| htmode | ✓ wifi | EHT20/40/80/160/320 |
| country + sku_idx | ✓ reboot | **Vždy společně.** Bez sku_idx country nemá efekt na TX power |
| txpower | ✓ wifi | Funguje jen pokud sku_idx nastaven |
| disabled | ⚠ destruktivní | Re-enable může vyžadovat power cycle |
| noscan | ⚠ nestabilní | Změna doporučena s rebooten, může způsobit wifi hang |
| background_radar | ✓ wifi | Zero-Wait DFS (5G) |
| mbssid | ✓ wifi | 11v MBSS — vždy 1 na 6G |
| mu_onoff | ✓ wifi | bitmap: 0=DL-OFDMA, 1=UL-OFDMA, 2=DL-MIMO, 3=UL-MIMO |
| he_twt_responder | ✓ wifi | TWT on/off |
| sr_enable / sr_enhanced | ✓ wifi | Spatial Reuse |
| etxbfen / itxbfen | ✓ wifi | Beamforming |
| lpi_enable | ✓ wifi | Low Power Indoor — 6G only |

### 3.2 Interface (wifi-iface)
| Parametr | Funguje | Poznámka |
|---|---|---|
| ssid | ✓ wifi | |
| encryption | ✓ wifi | none/psk2/sae/sae-mixed/owe/sae-ext/sae-ext-mixed + volitelný cipher |
| key | ✓ wifi | |
| ieee80211w | ✓ wifi | 2=required — automaticky pro SAE/WPA3 |
| network | ✓ wifi | bridge assignment |
| hidden / isolate / wmm / maxassoc | ✓ wifi | |
| mlo + list device | ✓ wifi | MP4.3 formát — ověřeno |
| mode (ap/sta) | ✓ wifi | |
| beacon_prot | ✓ wifi | Vyžaduje ieee80211w≠0; hostapd u EHT+PMF nastaví auto |
| sae_pwe | ✓ wifi | 0=looping, 1=H2E, 2=mixed; povinné `2` pro 6G SAE |
| fils_discovery_min/max_interval | ✓ wifi | 6G only |
| unsol_bcast_probe_resp_interval | ✓ wifi | 6G only |
| assoc_phy | ✓ wifi | STA mode — MTK single-wiphy (≤MP4.2) |
| mld_assoc_band | ✓ wifi | STA MLD — **povinné** pro MLO STA (MP4.3) |
| mld_allowed_links | ✓ wifi | AP MLD — bitmap aktivních bandů (1=2G, 2=5G, 4=6G) |
| mld_addr | ✓ wifi | custom MLD MAC (optional) |
| eml_disable | ✓ wifi | EMLSR on/off |

### 3.3 Systém
| Operace | Funguje |
|---|---|
| wifi restart | ⚠ ~70% spolehlivost, může hang — nutný timeout/polling |
| reboot | ✓ ~95% |

---

## 4. Co NEUMÍME / NEJDE

| Věc | Důvod |
|---|---|
| txantenna / rxantenna | `iw phy0 set antenna` → **FAIL -95** — HW nepodporuje |
| vif_txpower | Deprecated od MP4.2 — nikdy nezapisovat |
| hwmode | Deprecated — nahrazeno band+htmode |
| rnr (UCI) | mac80211.sh bug — vždy zapíše 1, UCI hodnota ignorována |
| tx_burst | MTK internal parametr |
| assocresp_elements | MTK hardcoded vendor IE |
| chan_switch (bez restartu) | `hostapd_cli -i <iface> -l N chan_switch` existuje, ale není implementováno v layer2 |
| Antenna bitmap write | HW nepodporuje |
| TTLM / A-T2LM | Out of scope v1 |
| WPS | Out of scope |
| Mesh / 802.11s | Out of scope |
| AFC | Out of scope |
| eml_resp (UCI) | Deprecated od MP4.3 — nastavit přes debugfs |
| WPA Enterprise (802.1X) | Out of scope |

---

## 5. Kritické závislosti (validace v layer2)

Toto jsou místa kde mainline LuCI zapíše half-config bez chyby:

| Akce | Musí se zapsat společně | Co se stane jinak |
|---|---|---|
| country změna | sku_idx=0 na všech 3 radiích | country nemá efekt na TX power |
| txpower | sku_idx musí být nastaven | driver ignoruje nebo jde na max bez regulace |
| SAE/WPA3 | ieee80211w=2 | hostapd odmítne start |
| 6G iface | jen sae nebo owe | hostapd odmítne start |
| MLD s 6G linkem | jen sae nebo owe | 6G link nevznikne |
| MLD AP | mode=ap povinný | netifd sekci tiše zahodí |
| 6G SAE | sae_pwe=2 | hostapd vyžaduje H2E |
| STA MLO | mld_assoc_band povinný | MLO STA nevznikne |
| radio disabled=1 | varování — destruktivní | re-enable může vyžadovat power cycle |
| mlo toggle | varování — destruktivní | MLD MAC se změní, klienti odpojeni |
| AP+STA (extender) | STA musí být radio0 pro MLO extender | concurrent AP+STA selže |
| AP+STA (extender) | žádný AP MLD pokud STA není MLO | nekompatibilní konfigurace |

---

## 6. Architektura — stav implementace

### Layer 1 (atomické operace)
**Stav: kompletní.** Všechny funkce z Doc A jsou implementovány:
`uci_read/write/add/delete/list_add/list_del`, `ubus_wireless_status`, `ubus_hostapd_legacy_status`, `ubus_iwinfo_info/devices`, `ubus_network_interface`, `hostapd_stat/all_sta/sta`, `iw_dev/station_dump/link/scan/phy_info/channels/reg`, `wpa_status/wpa_scan_results`, `sysfs_read/thermal/fw_version/sku_disable/txpower_info/dfs_status/link_txpower/mt76_links_info/kernel_version`, `system_wifi_restart/wifi_reload/reboot/logs/exec`

### Layer 2 (funkční bloky)
**Stav: ~85% kompletní.** Strukturálně správné, mezery v konkrétních parametrech:

| Funkce | Stav | Poznámka |
|---|---|---|
| `radio_get_all()` | ✓ opraveno | legacyIf lookup z ubus (ne hardcoded ap0) |
| `radio_set()` | ⚠ mezera | chybí `lpi_enable`, `mu_onoff` |
| `iface_get_all()` | ✓ | včetně `key` pole |
| `iface_add()` / `iface_set()` | ✓ | |
| `mld_get_all()` | ✓ opraveno | bw_mhz z iw dev (ne ewToMhz fallback) |
| `mld_add()` | ⚠ mezera | chybí `mld_allowed_links`, `mld_addr`, `eml_disable` |
| `mld_set()` | ⚠ mezera | stejné |
| `clients_get_all()` | ✓ | |
| `uplink_get_all()` | ✓ | |
| `uplink_connect()` | 🔴 blocker | chybí `mld_assoc_band` — STA MLD nefunguje |
| `system_apply_poll()` | ✓ opraveno | fáze: resetting/mld_setup/ready |
| `radio_get_antenna_info()` | ✗ chybí | definováno v spec, neimplementováno |

### Layer 3 (wizardy)
**Stav: základní wizardy fungují, STA MLD ne.**

| Wizard | Stav |
|---|---|
| `wizard_ap` | ✓ |
| `wizard_mlo` | ✓ ověřeno na HW |
| `wizard_sta` | 🔴 legacy STA OK, MLO STA nefunguje (chybí mld_assoc_band) |
| `wizard_repeater` | ✓ základní |
| `wizard_country` | ✓ |
| `wizard_backhaul` | ✗ není (P2) |

### UI (index.js)
**Stav: funkční základ, chybí Uplink tab a Basic/Advanced.**

| Prvek | Stav |
|---|---|
| Overview tab | ✓ |
| Networks tab (AP/MLD) | ✓ expand/collapse, edit form |
| Radios tab | ✓ |
| Clients tab | ✓ |
| Diagnostics tab | ✓ |
| Uplink tab (STA) | ✗ chybí — STA data jsou schovaná v Networks |
| Basic/Advanced mode | ✗ odstraněno v předchozí session |
| Radio-centric Overview | ✗ — aktuálně network-centric |

---

## 7. Známé HW/FW quirks (důležité pro implementaci)

| Quirk | Detail |
|---|---|
| `eht_oper_chwidth` mapping | MT7988A firmware: 0=40MHz, 1=80MHz, 2=160MHz, 9=320MHz — **liší se od IEEE spec** (kde 1=40, 2=80). Primárně používat iw dev width string. |
| wifi restart spolehlivost | ~70% — implementovat polling + timeout 3min + fallback "zkuste reboot" |
| `ubus stations[]` | Vždy prázdné — pro klienty vždy iw station dump |
| `ubus iwinfo` pro MLD | txpower=0, htmode=NOHT — data jsou chybná, nepoužívat |
| `hostapd get_status` přes ubus | Jen link0 data pro MLD iface |
| MLD MAC | Může se změnit po mlo toggle nebo power cycle |
| sku_disable quirk | Může se flipnout na 1 po power cycle bez zjevné příčiny (driver bug) |
| ap1 skip v naming | Interface naming: phy0.0-ap0, phy0.0-ap2 — ap1 chybí (rezervováno pro MLD) |
| noscan | noscan=0 může způsobit wifi hang — doporučit reboot |
| 5G DFS kanály | CAC 60s (ETSI) — apply flow musí čekat |

---

## 8. Shrnutí — co chybí pro "vše co manuál popisuje"

### Priorita 1 — opravit před testováním STA módu
- [ ] `mld_assoc_band` v `uplink_connect()` + `wizard_sta`

### Priorita 2 — pro plnou parameter coverage
- [ ] `lpi_enable` v `radio_set()` + Radios UI
- [ ] `mld_allowed_links` v `mld_add()` + `mld_set()`
- [ ] `eml_disable` v `mld_add()` + `mld_set()`
- [ ] `sae-ext` / `sae-ext-mixed` do encryption selectů
- [ ] Cipher selection (`sae+gcmp128`) — aspoň v Advanced mode
- [ ] Extender validační pravidla v layer2

### Priorita 3 — nice to have
- [ ] `mld_addr` v `mld_add()`
- [ ] `beacon_prot` explicitní write
- [ ] `chan_switch` runtime (bez wifi restartu)
- [ ] `radio_get_antenna_info()` implementace
- [ ] `eht_oper_chwidth` tabulka opravit na MT7988A hodnoty

### UI — samostatné rozhodnutí
- [ ] Uplink tab (STA stav, scan, connect)
- [ ] Basic/Advanced mode (bylo záměrně odstraněno — znovu zvážit)
- [ ] Radio-centric Overview (dle nového návrhu)

---

*WOZIWRT+CLAUDE — Květen 2026*
