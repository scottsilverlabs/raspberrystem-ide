#!/bin/sh

# Cache corruption on sudden shutdown (or other cases) can cause missing file
# or broken image links.  So start with a clean cache on every boot.
rm -rf ~/.cache/chromium

chromium --kiosk localhost
