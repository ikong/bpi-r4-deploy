# RTL8261BE SFP-10G-T — 10G na BPI-R4 (OpenWrt)

## Výsledek

RTL8261BE copper SFP+ modul (OEM SFP-10G-T) funguje na plných **9.34 Gbits/sec** na BPI-R4
s MT7988A SoC a OpenWrt. Fix jsou 4 řádky kernelového kódu.

---

## Hardware

- **Modul:** OEM SFP-10G-T (Realtek RTL8261BE-CG, 10G copper SFP+)
- **Router:** Banana Pi BPI-R4 (MT7988A), SFP2 port (sfp-lan)
- **Kabel:** Cat5e/Cat6, krátká délka (testováno 2m patch kabel)
- **Protistrana:** druhý BPI-R4 se stejným modulem

---

## Problém

Linux kernel identifikoval OEM SFP-10G-T jako ROLLBALL modul a pokoušel se
komunikovat přes I2C-to-MDIO bridge protokol:

```
sfp sfp2: module OEM SFP-10G-T rev A has been found in the quirk list
sfp sfp2: probing phy device through the [MDIO_I2C_ROLLBALL] protocol
sfp sfp2: no PHY detected, 24 tries left
sfp sfp2: no PHY detected, 23 tries left
...
```

Výsledek: žádný link, modul nefunkční.

---

## Průlom — RouterOS reverse engineering

Analýzou MikroTik RouterOS 7.20.6 ARM64 (`phy_helper.ko`) jsme zjistili:

- RTL8261BE je **pure Media Converter** — žádný PHY bridge, žádný ROLLBALL
- MikroTik čte pouze EEPROM (I2C 0x50/0x51) pro identifikaci
- **Žádný MDIO přístup** — MAC si sám auto-detekuje SerDes rychlost
- RTL8261BE auto-přepíná SerDes podle výsledku copper autoneg:
  - 1G copper → 1000BASE-X SerDes
  - 2.5G copper → 2500BASE-X SerDes
  - 10G copper → 10GBASE-R SerDes

Klíčové zjištění: ROLLBALL protokol RTL8261BE vůbec nepodporuje.
Všechny předchozí pokusy selhávaly, protože šly špatným směrem.

---

## Fix

**Soubor:** `my_files/999-sfp-11-rtl8261be-mdio-none.patch`

```diff
--- a/drivers/net/phy/sfp.c
+++ b/drivers/net/phy/sfp.c
@@ -466,5 +466,10 @@ static void sfp_fixup_rollball_cc(struct sfp *sfp)
 	sfp->id.base.extended_cc = SFF8024_ECC_10GBASE_T_SFI;
 }
 
+static void sfp_fixup_rtl8261be(struct sfp *sfp)
+{
+	sfp->mdio_protocol = MDIO_I2C_NONE;
+}
+
 static void sfp_quirk_2500basex(const struct sfp_eeprom_id *id,
@@ -610,4 +615,4 @@ static const struct sfp_quirk sfp_quirks[] = {
 	SFP_QUIRK_F("ETU", "ESP-T5-R", sfp_fixup_rollball_cc),
-	SFP_QUIRK_F("OEM", "SFP-10G-T", sfp_fixup_rollball_cc),
+	SFP_QUIRK_F("OEM", "SFP-10G-T-I", sfp_fixup_rtl8261be),
+	SFP_QUIRK_F("OEM", "SFP-10G-T",   sfp_fixup_rtl8261be),
 	SFP_QUIRK_S("OEM", "SFP-2.5G-T", sfp_quirk_oem_2_5g),
```

`MDIO_I2C_NONE` říká kernelu: neprobovat žádný PHY přes I2C, nechat MAC
nastavit SerDes přímo z EEPROM (10gbase-r).

---

## Výsledky

### dmesg po aplikaci patche

```
sfp sfp2: module OEM SFP-10G-T rev A has been found in the quirk list
sfp sfp2: probing phy device through the [MDIO_I2C_NONE] protocol     ← žádný ROLLBALL
mtk_soc_eth sfp-lan: requesting link mode inband/10gbase-r             ← 10G z EEPROM
mtk_soc_eth sfp-lan: Link is Up - 10Gbps/Full - flow control off       ← link up
```

### ethtool sfp-lan

```
Supported link modes:   10000baseSR/Full
Speed:                  10000Mb/s
Duplex:                 Full
Link detected:          yes
```

### iperf3 (4 paralelní streamy, 10 sekund)

```
[SUM] 0.00-10.00 sec  10.9 GBytes  9.34 Gbits/sec  sender
[SUM] 0.00-10.01 sec  10.9 GBytes  9.32 Gbits/sec  receiver
```

**9.34 Gbits/sec — 93% line rate 10GbE.**

---

## Poznámky

- Patch pokrývá i průmyslovou variantu `SFP-10G-T-I` (stejný RTL8261BE čip)
- Bez měděného link partnera: SerDes zůstane na 10gbase-r (default RTL8261BE)
- Multi-speed (2.5G/1G): RTL8261BE auto-přepíná SerDes, ale Linux/MT7988A
  aktuálně nepodporuje MAC-level rate auto-detection — téma pro budoucí práci
- Patch je kandidát pro upstream Linux kernel (drivers/net/phy/sfp.c)

---

## Datum

Vyřešeno: 2026-05-14  
Tým: Petr (nápad MikroTik RE) + Claude (RouterOS analýza + kernel patch)
