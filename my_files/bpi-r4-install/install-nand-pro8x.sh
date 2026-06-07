#!/bin/sh
# BPI-R4 Pro 8X - Install rescue system to NAND
# Run from SD card: sh /root/bpi-r4-install/install-nand-pro8x.sh

set -e

# Image search order: explicit argument, /tmp/, embedded SD card copy
if [ -n "${1:-}" ]; then
    NAND_IMG="$1"
elif [ -f "/tmp/openwrt-mediatek-filogic-bananapi_bpi-r4-pro-8x-snand-img.bin" ]; then
    NAND_IMG="/tmp/openwrt-mediatek-filogic-bananapi_bpi-r4-pro-8x-snand-img.bin"
elif [ -f "/tmp/snand-img.bin" ]; then
    NAND_IMG="/tmp/snand-img.bin"
else
    NAND_IMG="/root/install-dir/.snand-img.bin"
fi

echo ""
echo "=================================================="
echo "  BPI-R4 Pro 8X - Install rescue system to NAND"
echo "=================================================="
echo ""

# Verify we are running from SD card
if ! grep -q "fitrw" /proc/mounts 2>/dev/null; then
    echo "ERROR: This script must be run from the SD card!"
    echo "       Make sure the DIP switch is set to SD boot."
    exit 1
fi

echo "OK: System is running from SD card."
echo ""

# Verify image exists
if [ ! -f "${NAND_IMG}" ]; then
    echo "ERROR: Image file not found: ${NAND_IMG}"
    echo "       Download snand-img.bin to /tmp/ or pass path as argument."
    exit 1
fi

echo "OK: Pro 8X image found ($(du -h ${NAND_IMG} | cut -f1))."
echo ""

# Verify NAND device is available
if ! grep -q '"nand"' /proc/mtd 2>/dev/null; then
    echo "ERROR: NAND device not found in /proc/mtd!"
    exit 1
fi

echo "OK: NAND device found."
echo ""

# Final warning before flashing
echo "WARNING: The entire NAND flash will be overwritten!"
echo "         Press ENTER to continue or CTRL+C to cancel."
read _

echo ""
echo "Flashing Pro 8X image to NAND..."
mtd -e nand write "${NAND_IMG}" nand

echo ""
echo "Initializing U-Boot environment..."
ubidetach -p /dev/mtd2 2>/dev/null || true
ubiattach -p /dev/mtd2
fw_setenv -f nvme_boot "" 2>/dev/null && echo "OK: U-Boot env initialized." || echo "WARNING: fw_setenv failed -- env will initialize on first NAND boot."
ubidetach -p /dev/mtd2 2>/dev/null || true

echo ""
echo "=================================================="
echo "  DONE! Rescue system installed to NAND."
echo "=================================================="
echo ""
echo "Next steps:"
echo "  1. Power off the device"
echo "  2. Switch DIP to NAND boot"
echo "  3. Power on the device"
echo "  4. Login via SSH and run:"
echo "     sh /root/bpi-r4-install/install-nvme.sh"
echo ""
