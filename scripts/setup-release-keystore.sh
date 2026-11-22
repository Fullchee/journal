#!/usr/bin/env bash
# Create the owner's release keystore once and point the main checkout's mise.local.toml at it.
# Back up the keystore and its password: losing either means uninstalling the app to install a new APK.
set -euo pipefail

keystore="$HOME/.config/journal/release.keystore"
main_checkout="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
mise_file="$main_checkout/mise.local.toml"

if grep -q '^JOURNAL_KEYSTORE_PATH' "$mise_file" 2>/dev/null; then
	echo "$mise_file already sets JOURNAL_KEYSTORE_PATH; nothing to do."
	exit 0
fi

if [[ -e $keystore ]]; then
	echo "$keystore exists but $mise_file has no password for it. Add JOURNAL_KEYSTORE_PATH and JOURNAL_KEYSTORE_PASSWORD by hand." >&2
	exit 1
fi

password="$(openssl rand -hex 24)"
mkdir -p "$(dirname "$keystore")"
keytool -genkeypair -noprompt \
	-keystore "$keystore" -storetype PKCS12 -storepass "$password" \
	-alias journal -keyalg RSA -keysize 4096 -validity 36500 \
	-dname "CN=Journal"
chmod 600 "$keystore"

# Insert under [env] so the values stay in that table whatever follows it.
tmp="$(mktemp)"
awk -v path="$keystore" -v password="$password" '
	{ print }
	/^\[env\]$/ { printf "JOURNAL_KEYSTORE_PATH = \"%s\"\nJOURNAL_KEYSTORE_PASSWORD = \"%s\"\n", path, password }
' "$mise_file" >"$tmp"
cat "$tmp" >"$mise_file"
rm "$tmp"

echo "Created $keystore and added its path and password to $mise_file."
echo "Back up both to your password manager, then copy mise.local.toml into open worktrees."
