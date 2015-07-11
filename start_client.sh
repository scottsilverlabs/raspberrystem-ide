#!/bin/sh

# Cache corruption on sudden shutdown (or other cases) can cause missing file
# or broken image links.  So start with a clean cache on every boot.
rm -rf $HOME/.cache/chromium

# A hard shutdown causes Chromium to report "didn't shut down correctly"...
# Clean files responsible for this (Note: this method is ad-hoc, there's no
# clearly defined way to do this).
rm -f $HOME/.config/chromium/Default/Preferences
rm -f $HOME/.config/chromium/SingletonLock

# Run!
chromium --kiosk localhost
