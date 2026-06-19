# Netdev patches — stav

All patches by Petr Wozniak <petr.wozniak@gmail.com>.

---

## 01 — SFP RTL8261BE RollBall probe (v8) — ACCEPTED ✅

**File:** `01-sfp-rtl8261be-rollball-v8-ACCEPTED.patch`
**Subject:** `[PATCH net-next v8] net: phy: sfp: probe for RollBall I2C-to-MDIO bridge in mdio-i2c`
**Sent:** 2026-05-27
**Status:** ACCEPTED — applied by Jakub Kicinski
**Upstream commit:** `8fe125892f40`
**Link:** https://git.kernel.org/netdev/net-next/c/8fe125892f40

Fixes RTL8261BE falsely triggering RollBall bridge detection. Added
`sfp-mdio-protocol = "none"` quirk in sfp.c for modules where the I2C
address happens to respond like a RollBall bridge.

---

## 02 — xfrm: fix xfrm_dev_offload_ok() for software SAs — Awaiting upstream

**File:** `02-xfrm-fix-offload-ok.patch`
**Subject:** `xfrm: fix xfrm_dev_offload_ok() returning true for software SAs`
**Sent:** 2026-05-27 (as part of 3-patch series with SFP)
**Status:** Awaiting upstream / changes requested on patchwork
**Patchwork:** https://patchwork.kernel.org/project/netdevbpf/list/?series=&submitter=Petr+Wozniak

Prevents xfrm_dev_offload_ok() from returning true when the SA is
software-only (no offload), which caused packets to hit the GSO offload
path and get dropped on MT7988A + IPsec.

**TODO:** Resend as standalone patch v2 with fresh Subject (not 2/3).

---

## 03 — xfrm: propagate -EINPROGRESS — Awaiting upstream

**File:** `03-xfrm-propagate-einprogress.patch`
**Subject:** `xfrm: propagate -EINPROGRESS from validate_xmit_xfrm()`
**Sent:** 2026-05-30 (as v4 per patchwork)
**Status:** Awaiting upstream
**Patchwork:** https://patchwork.kernel.org/project/netdevbpf/list/?series=&submitter=Petr+Wozniak

Propagates -EINPROGRESS return from validate_xmit_xfrm() back to the
caller instead of silently dropping it, so async crypto offload works
correctly on look-aside hardware (MT7988A EIP-197).

**TODO:** Verify HW test result, resend if needed.

---

## 04 — SFP RollBall defer probe — Rejected (corrupt patch), needs v3

**File:** `04-sfp-rollball-defer-probe.patch`
**Subject:** `net: phy: mdio-i2c: defer RollBall bridge probe to PHY discovery`
**Sent:** 2026-06-06 (v2)
**Status:** REJECTED — corrupt patch format
**Fixes:** 8fe125892f40 (our own accepted patch caused a regression for AQR113C)

Moves RollBall bridge probe from i2c_mii_init_rollball() (early, 200 ms
window) to sfp_sm_probe_for_phy() (after ~17 s module init delays).
Fixes AQR113C on FLYPRO SFP-10GT-CS-30M which needs >200 ms.
RTL8261BE: probe at 17 s correctly returns -ENODEV, PHY discovery skipped.

**TODO:** Generate clean v3 with `git format-patch`, verify patch is not corrupt,
send to netdev. Depends on 01 (8fe125892f40) being upstream.

---

## net-next tree on VM (10.33.1.66)

```
/home/ipsec/net-next/
  remote: https://git.kernel.org/pub/scm/linux/kernel/git/netdev/net-next.git
```

Local commits on top of upstream:
```
6db01f7f1  net: phy: sfp: probe for RollBall I2C-to-MDIO bridge in mdio-i2c  (= SFP v8, already upstream)
06e578a27  xfrm: fix xfrm_dev_offload_ok() returning true for software SAs    (= 02 above)
0ee43f445  xfrm: propagate -EINPROGRESS from validate_xmit_xfrm()             (= 03 above)
```

Defer patch (04) is NOT committed in the tree — only saved as `999-sfp-12-rollball-probe-defer.patch`.

## Next steps

1. **04 defer patch**: generate clean `git format-patch` from a proper commit, send as v3
2. **02 xfrm offload-ok**: resend as standalone `[PATCH net-next v2]`, not as 2/3
3. **03 xfrm EINPROGRESS**: verify HW test (IPsec + look-aside EIP-197 on BPI-R4)
