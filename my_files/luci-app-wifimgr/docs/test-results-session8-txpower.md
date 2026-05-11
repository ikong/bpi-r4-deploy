# Test Results — TX Power + Country (Session 8, 2026-05-09)

Tested: country change + TX power mode system after two key changes:
1. All country and txpower mode changes now require **reboot** (not just wifi restart)
2. **Bug fix**: country change no longer overwrites `sku_idx` when efuse_max mode is active

Hardware: BPI-R4 (MT7988A), tri-band radio0=2.4G / radio1=5G / radio2=6G

---

## BLOK 1 — Baseline: CZ / regdb

| Test | Result |
|------|--------|
| CZ regdb, band0 2.4G | 20 dBm ✓ |
| CZ regdb, band1 5G CH36 EHT160 | 23 dBm ✓ |
| CZ regdb, band2 6G | 23 dBm ✓ |

---

## BLOK 2 — regdb: multiple countries

| Country | Result | Notes |
|---------|--------|-------|
| DE | ✓ | Standard ETSI limits |
| US | ✓ | FCC, 6G allowed |
| JP | ✓ | Lower 5G limits |
| BR | ✓ | Extreme 5G: CH36 = **5 dBm** |
| CN | ✓ | 6G band **DOWN** (regdb blocks) |
| RU | ✓ | 6G band **DOWN** (regdb blocks) |

---

## BLOK 3 — efuse_max mode

| Test | Result |
|------|--------|
| Switch CZ → efuse_max + powercycle | ✓ max power |
| Country change (CZ→DE→CZ) while in efuse_max | ✓ **stayed efuse_max** (bug fix verified) |

Before the fix: country change unconditionally wrote `sku_idx='0'`, silently switching to regdb
without any indication to the user.

---

## BLOK 4 — Manual mode

| Test | Result | Notes |
|------|--------|-------|
| Per-radio values survive powercycle | ✓ | Values persist in UCI |
| JP country, band1 set to 22 dBm | ✓ 20 dBm output | Correctly capped at country limit (min(22,20)=20) |

---

## BLOK 5 — CH149 on 5G (CZ / ETSI)

| Test | Result |
|------|--------|
| CH149 + EHT160 | ✗ AP won't start (ETSI max VHT80 in 5725–5875 MHz range) |
| CH149 + EHT80 | ✓ 13 dBm |

**Note**: SKU table has per-channel limits. CH36 in CZ = 23 dBm, CH149 = 13 dBm.
ETSI does not allow EHT (WiFi 7) on CH149 — max mode is VHT80.

---

## BLOK 6 — Switch back to regdb

| Test | Result |
|------|--------|
| efuse_max → regdb + powercycle | ✓ clean state |

---

## Final router state
- Country: **CZ**
- TX power mode: **regdb**
- band0 = 20 dBm, band1 = 23 dBm, band2 = 23 dBm

---

## Commits
- `40b1028` feat: WiFi gen badges, MLO internals in Diagnostics, reboot-on-country/txpower
- `546c352` fix: country change must not write sku_idx when in efuse_max mode
