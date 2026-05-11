# OpenWrt mainline MT7996 / BPI-R4 — stav výzkumu (2026-05-09)

## Kontext

Paralelně s vývojem luci-app-wifimgr jsme provedli průzkum stavu mainstream OpenWrt komunity
ohledně MT7996 (WiFi 7, BPI-R4). Výsledky vysvětlují proč komunitní přístupy narážejí na problémy
které náš MTK-SDK-based přístup nemá.

---

## 1. Architektura wiphy — kernel driver

MT7996 driver (mt76, mainline) používá **single wiphy**:

- `mt7996_init_wiphy()` vytvoří jeden `ieee80211_hw` se třemi `wiphy_radio` záznamy (`n_radio=3`)
- Všechna tři pásma (2.4G / 5G / 6G) jsou pod jedním `phy0`
- `NL80211_ATTR_VIF_RADIO_MASK` váže VIF na konkrétní pásmo
- `WIPHY_FLAG_SUPPORTS_MLO` nastaven → kernel MLO infrastruktura je v pořádku

**Závěr:** Na úrovni kernelu/driveru je architektura správná. Problém není zde.

---

## 2. AP MLO v mainline OpenWrt userspace — nefunguje

Přestože kernel driver MLO podporuje, **netifd / mac80211.sh v mainline OpenWrt AP MLO nepřekládá**
UCI config na hostapd parametry `mld_ap=1`, `mld_id`, `mld_addr`.

Výsledek při pokusu o MLO přes mainline UCI:
- Vzniknou dva APs se stejným SSID
- Žádný AP MLD nevznikne
- hostapd nedostane MLD konfiguraci

Stav k 2026-05-09: ~rok vývoje, AP MLO v mainline OpenWrt stále broken.

**Náš přístup (MTK SDK):** netifd patches + hostapd patches z MTK SDK tento překlad implementují.
Proto máme funkční AP MLO již od poloviny roku 2025.

---

## 3. TX power cold-boot deadlock — analýza

### Mechanismus (potvrzen v kódu)

`mt7996/main.c` ~řádek 1027:

```c
if (changed & BSS_CHANGED_TXPOWER &&
    info->txpower != phy->txpower) {
    phy->txpower = info->txpower;
    mt7996_mcu_set_txpower_sku(phy);
}
```

Pokud `info->txpower == phy->txpower` → podmínka false → MCU call se nespustí → TMAC zůstane 0 → výstupní výkon ≈ 3 dBm.

Inicializace v `__mt7996_init_txpower()`:
```c
phy->txpower = max(phy->txpower, chan->max_power);
```

Na BPI-R4 s nulovými EEPROM záznamy: `chan->max_power ≈ 0` → `phy->txpower ≈ 0`.
Při prvním `BSS_CHANGED_TXPOWER` s `info->txpower ≈ 0` → rovnost → deadlock.

### Existující opravy upstream

| Fix | Autor | Datum | Stav |
|-----|-------|-------|------|
| `959a2d40`: initialize phy txpower | Felix Fietkau | 2025-01-03 | Mergnuto |
| PR #968: use tx_power from fw if EEPROM=0 | Ivan Mironov | 2025 | **Nemergnuto** |

PR #968 řeší BPI-R4 specifickou variantu (nulové EEPROM) — stále čeká na merge.

### Co komunita neidentifikovala

V žádné public diskusi (forum.openwrt.org, banana-pi.org forum, GitHub issues) nebyl popsán
přesný mechanismus `phy->txpower == info->txpower → false → MCU nikdy nevolán`.
Komunita řeší symptom (špatný EEPROM soubor nebo špatná hodnota txpower v UCI),
nikoli logiku deadlocku.

### Náš hotplug fix

`/etc/hotplug.d/net/10-mt7996-txpower-fix` obchází deadlock nezávisle na EEPROM:
- Trigger: `phy0.0-ap0 add`
- Bootstrap: `iw phy phy0 set txpower fixed <X±1> radio N` → `iw phy phy0 set txpower auto radio N`
- Tím `info->txpower ≠ phy->txpower` → podmínka true → MCU call proběhne → TMAC správně nastaven

Tento přístup funguje spolehlivě přes powercycle, ověřen na 7 zemích × 3 TX power módech.

---

## 4. Zdroje

- https://github.com/openwrt/mt76 — `mt7996/init.c`, `mt7996/main.c`
- https://github.com/openwrt/mt76/pull/968 — EEPROM zeros txpower fix
- https://github.com/openwrt/openwrt/issues/17489 — "wifi txpower value very low"
- https://forum.openwrt.org/t/banana-bpi-r4-wifi7-status/201051 — BPI-R4 WiFi7 status
