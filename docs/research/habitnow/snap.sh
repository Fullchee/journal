#!/usr/bin/env bash
# usage: snap.sh name -> saves $SNAP_DIR/shots/name.png and prints visible UI nodes (* = clickable)
S="${SNAP_DIR:-${TMPDIR:-/tmp}/habitnow}"
mkdir -p "$S/shots"
sleep 3
adb exec-out screencap -p >"$S/shots/$1.png"
sips -Z 900 "$S/shots/$1.png" --out "$S/shots/$1.small.png" >/dev/null 2>&1
adb shell rm -f /sdcard/ui.xml
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb shell cat /sdcard/ui.xml | python3 -I -c '
import sys,re
x=sys.stdin.read()
for m in re.finditer(r"<node [^>]*>",x):
  n=m.group(0)
  g=lambda k:(re.search(k+r"=\"([^\"]*)\"",n) or [None,""])[1]
  t,d,b,c=g("text"),g("content-desc"),g("bounds"),g("clickable")
  rid=g("resource-id").split("/")[-1]
  if t or d or c=="true":
    print(("*" if c=="true" else " "),b,repr(t)[:140],repr(d)[:40],rid)
'
