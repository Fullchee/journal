#!/usr/bin/env bash
#
# Installs what a new developer needs on macOS or Linux. It takes no input:
# every stage checks before it acts, so a re-run only does the work that is
# still missing. Tests are left to CI; this script runs lint and typecheck.
#
# Usage: scripts/setup.sh
#        SETUP_ANDROID=0 scripts/setup.sh   # skip the Android toolchain
#
# Everything above the "STAGES" marker is the wizard library: do not hand-edit
# it. Author the per-step stages below the marker.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library: delightful, consistent UX, identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
	BOLD=$(tput bold)
	DIM=$(tput dim)
	RESET=$(tput sgr0)
	BLUE=$(tput setaf 4)
	GREEN=$(tput setaf 2)
	YELLOW=$(tput setaf 3)
else
	BOLD=""
	DIM=""
	RESET=""
	BLUE=""
	GREEN=""
	YELLOW=""
fi

# Author sets this at the top of the stages section.
TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()    # KEYs written to ENV_FILE this run
WRITTEN_SECRET=() # secret NAMEs set this run
SKIPPED=()        # things we couldn't do (e.g. gh missing)

# _clear wipes the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
	[[ -t 1 ]] || return 0
	if command -v tput >/dev/null 2>&1 && tput clear 2>/dev/null; then return 0; fi
	printf '\033[2J\033[3J\033[H'
}

# banner "Title" shows the opening frame: what this script does.
banner() {
	_clear
	printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
	printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
	printf '%s  Runs unattended: no prompts. Every stage checks before it acts, so a\n' "$DIM"
	printf '  re-run only does the work that is still missing. Stop any time with\n'
	printf '  Ctrl-C and re-run later.%s\n' "$RESET"
}

# stage "Name" clears the screen, then announces a stage and shows progress.
# Clearing keeps only the current step on screen.
stage() {
	_clear
	_STAGE_INDEX=$((_STAGE_INDEX + 1))
	printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
		"$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

# say "..." prints a plain instruction line.
say() { printf '  %s\n' "$1"; }
# step "..." is a numbered-feeling action the human takes in the browser.
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# open_url URL opens it in the human's browser, cross-platform incl. WSL.
open_url() {
	local url="$1"
	printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
	{
		if command -v wslview >/dev/null 2>&1; then
			wslview "$url"
		elif command -v explorer.exe >/dev/null 2>&1; then
			explorer.exe "$url"
		elif command -v xdg-open >/dev/null 2>&1; then
			xdg-open "$url"
		elif command -v open >/dev/null 2>&1; then
			open "$url"
		else false; fi
	} >/dev/null 2>&1 || warn "couldn't open a browser, so visit it manually: $url"
}

# finish clears, then shows a closing summary of everything configured.
finish() {
	_clear
	printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
	((${#WRITTEN_ENV[@]})) && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
	((${#WRITTEN_SECRET[@]})) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
	if ((${#SKIPPED[@]})); then
		printf '\n'
		warn "still to do by hand:"
		for s in "${SKIPPED[@]}"; do note "  - $s"; done
	fi
	printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES: author this section. One stage() per step the script takes.
# Set TOTAL_STAGES to match the stages you write.
# Keep every stage inside run_wizard and the last line as is: bash parses the
# whole file before the first stage runs, so an edit mid-run can't break it.
# ──────────────────────────────────────────────────────────────────────────

run_wizard() {

	TOTAL_STAGES=7

	cd "$(git rev-parse --show-toplevel)"
	MISE_FILE="mise.local.toml"
	NODE_VERSION=$(cat .nvmrc)
	BUN_VERSION=$(sed -n 's/.*"packageManager": "bun@\([^"]*\)".*/\1/p' package.json)
	OS=$(uname -s)
	SETUP_ANDROID="${SETUP_ANDROID:-1}"

	# ok "msg" marks a step that already passed.
	ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }

	# have_cmd NAME is true when NAME is on PATH.
	have_cmd() { command -v "$1" >/dev/null 2>&1; }

	# have_version CMD VERSION is true when CMD reports VERSION (a leading v is fine).
	have_version() {
		"$1" --version 2>/dev/null | sed 's/^v//' | grep -qE "^${2//./\\.}([.-]|$)"
	}

	banner "journal-native: new developer setup (macOS or Linux)"

	stage "mise (installs Node and Bun per repo)"
	if ! have_cmd mise && [[ -x "$HOME/.local/bin/mise" ]]; then PATH="$HOME/.local/bin:$PATH"; fi
	if have_cmd mise; then
		ok "mise $(mise --version | cut -d' ' -f1) found"
	else
		say "Installing mise with the official script."
		curl -fsSL https://mise.run | sh
		PATH="$HOME/.local/bin:$PATH"
		if have_cmd mise; then
			ok "installed mise"
		else
			warn "The mise install failed. Install it from https://mise.jdx.dev, then re-run."
			exit 1
		fi
	fi
	if [[ -z "${MISE_SHELL:-}" ]]; then
		warn "Your shell doesn't activate mise yet. Add this line to ~/.zshrc (or ~/.bashrc), then open a new terminal:"
		# shellcheck disable=SC2016 # these lines are printed for the owner to paste, so they stay unexpanded
		say '  eval "$(mise activate zsh)"'
	fi

	stage "Node $NODE_VERSION, Bun $BUN_VERSION and uv"
	say "Pins them in $MISE_FILE (git ignores it), matching .nvmrc and package.json. uv runs the detect-secrets pre-commit hook."
	if [[ -f "$MISE_FILE" ]] && have_version node "$NODE_VERSION" && have_version bun "$BUN_VERSION" && have_cmd uv; then
		ok "already pinned: node $(node --version), bun $(bun --version), $(uv --version)"
	else
		mise use --path "$MISE_FILE" "node@$NODE_VERSION" "bun@$BUN_VERSION" uv
		mise trust "$MISE_FILE" >/dev/null
		eval "$(mise env -s bash)"
		ok "node $(node --version)"
		ok "bun $(bun --version)"
		ok "$(uv --version)"
	fi

	stage "Dependencies"
	say "bun install fetches every workspace, generates Expo's route types and installs the pre-push hook."
	scripts/install-if-lock-changed.sh
	ok "dependencies installed"
	HOOK=$(git rev-parse --git-path hooks/pre-push)
	if [[ -f "$HOOK" ]]; then
		ok "pre-push hook installed (oxlint, stylelint, fallow)"
	elif bunx lefthook install; then
		ok "pre-push hook installed (oxlint, stylelint, fallow)"
	else
		warn "No pre-push hook."
		SKIPPED+=("bunx lefthook install")
	fi

	stage "Worktree approvals"
	say "Worktrunk asks before it runs .config/wt.toml commands, and a headless agent cannot answer, so its worktree setup fails. Approve them once."
	if ! have_cmd wt; then
		warn "wt (Worktrunk) is not installed, so worktree commands are not approved."
		SKIPPED+=("install Worktrunk, then: wt config approvals add --yes")
	elif wt config approvals add --yes >/dev/null; then
		ok "wt.toml commands approved"
	else
		warn "Approving the wt.toml commands failed."
		SKIPPED+=("wt config approvals add --yes")
	fi

	stage "Environment"
	say ".env is committed and holds only public values; varlock checks it against .env.schema."
	note "Override a value for your machine in .env.local (git ignores it). Never put a secret in either."
	if bunx varlock load >/dev/null; then
		ok "env is valid"
	else
		warn "varlock found a problem above. Fix .env.local, then re-run."
		SKIPPED+=("fix env (bunx varlock load)")
	fi

	stage "Prove it works"
	say "Runs lint and typecheck, the checks that catch most mistakes. Tests run in CI."
	if bun run lint && bun run typecheck; then
		ok "lint and typecheck pass"
	else
		warn "A check failed above."
		SKIPPED+=("fix the failing check, then: bun run lint && bun run typecheck")
	fi

	stage "Android toolchain"
	say "Android Studio, JDK 21, ccache and the Android SDK. Skip it with SETUP_ANDROID=0."
	ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
	if [[ -z "$ANDROID_SDK" ]]; then
		if [[ "$OS" == Darwin ]]; then
			ANDROID_SDK="$HOME/Library/Android/sdk"
		else ANDROID_SDK="$HOME/Android/Sdk"; fi
	fi

	# find_sdkmanager prints sdkmanager's path from the SDK, PATH or Homebrew's cask.
	find_sdkmanager() {
		local candidate="$ANDROID_SDK/cmdline-tools/latest/bin/sdkmanager"
		if [[ -x "$candidate" ]]; then
			printf '%s' "$candidate"
			return 0
		fi
		candidate=$(command -v sdkmanager 2>/dev/null || true)
		if [[ -n "$candidate" ]]; then
			printf '%s' "$candidate"
			return 0
		fi
		if have_cmd brew; then
			candidate="$(brew --prefix)/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager"
			if [[ -x "$candidate" ]]; then
				printf '%s' "$candidate"
				return 0
			fi
		fi
		return 1
	}
	if [[ "$SETUP_ANDROID" == 0 ]]; then
		ok "skipped: SETUP_ANDROID=0"
	else
		if [[ "$OS" == Darwin ]]; then
			if ! have_cmd brew; then
				warn "Homebrew is missing; install it from https://brew.sh, then re-run."
				open_url "https://brew.sh"
				SKIPPED+=("brew install --cask android-studio android-commandlinetools && brew install ccache openjdk@21")
			else
				if [[ -d "/Applications/Android Studio.app" ]]; then
					ok "Android Studio found"
				elif brew install --cask android-studio; then
					ok "installed Android Studio"
				else
					warn "Android Studio install failed."
					SKIPPED+=("brew install --cask android-studio")
				fi
				if have_cmd ccache; then
					ok "ccache found"
				elif brew install ccache; then
					ok "installed ccache"
				else
					warn "ccache install failed."
					SKIPPED+=("brew install ccache")
				fi
				if /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
					ok "JDK 21 found"
				elif brew install openjdk@21; then
					# Register the keg-only JDK where java_home and /usr/bin/java look, so no shell export is needed.
					mkdir -p "$HOME/Library/Java/JavaVirtualMachines"
					ln -sfn "$(brew --prefix openjdk@21)/libexec/openjdk.jdk" "$HOME/Library/Java/JavaVirtualMachines/openjdk-21.jdk"
					ok "installed JDK 21"
				else
					warn "JDK 21 install failed."
					SKIPPED+=("brew install openjdk@21")
				fi
				if find_sdkmanager >/dev/null; then
					ok "sdkmanager found"
				elif brew install --cask android-commandlinetools; then
					ok "installed the Android command-line tools"
				else
					warn "The command-line tools install failed."
					SKIPPED+=("brew install --cask android-commandlinetools")
				fi
			fi
		elif have_cmd ccache && have_cmd javac; then
			ok "ccache and a JDK found"
		else
			step "Install JDK 21 and ccache with your package manager (e.g. sudo apt install openjdk-21-jdk ccache)."
			SKIPPED+=("install JDK 21 and ccache")
		fi

		# The SDK packages and licences: Gradle then downloads any missing platform, build-tools and NDK itself.
		if SDKMANAGER=$(find_sdkmanager); then
			if [[ -z "${JAVA_HOME:-}" ]]; then
				JAVA_HOME=$(/usr/libexec/java_home -v 21 2>/dev/null || true)
				export JAVA_HOME
			fi
			if [[ -d "$ANDROID_SDK/platform-tools" ]]; then
				ok "platform-tools found"
			elif "$SDKMANAGER" --sdk_root="$ANDROID_SDK" platform-tools >/dev/null; then
				ok "installed platform-tools"
			else
				warn "platform-tools install failed."
				SKIPPED+=("$SDKMANAGER --sdk_root=$ANDROID_SDK platform-tools")
			fi
			if [[ -f "$ANDROID_SDK/licenses/android-sdk-license" ]]; then
				ok "SDK licences already accepted"
			elif "$SDKMANAGER" --sdk_root="$ANDROID_SDK" --licenses >/dev/null < <(yes); then
				ok "accepted the SDK licences"
			else
				warn "Could not accept the SDK licences."
				SKIPPED+=("$SDKMANAGER --sdk_root=$ANDROID_SDK --licenses")
			fi
			ok "Android SDK at $ANDROID_SDK"

			# Android 36: the Android 37 image was unstable. Play Store lets the emulator install apps like a phone.
			AVD=android-36-with-play-store
			AVD_ABI=x86_64
			[[ "$(uname -m)" == arm64 || "$(uname -m)" == aarch64 ]] && AVD_ABI=arm64-v8a
			AVD_IMAGE="system-images;android-36;google_apis_playstore;$AVD_ABI"
			if "$ANDROID_SDK/emulator/emulator" -list-avds 2>/dev/null | grep -qx "$AVD"; then
				ok "$AVD emulator found"
			elif "$SDKMANAGER" --sdk_root="$ANDROID_SDK" emulator "$AVD_IMAGE" >/dev/null &&
				echo no | "$(dirname "$SDKMANAGER")/avdmanager" create avd -n "$AVD" -k "$AVD_IMAGE" -d pixel_6 >/dev/null; then
				# 4 cores and 4 GB RAM: with fewer, System UI ANRs fail every e2e flow. avdmanager writes PlayStore.enabled=no.
				AVD_CONFIG="$HOME/.android/avd/$AVD.avd/config.ini"
				{ grep -vE '^(hw\.cpu\.ncore|hw\.ramSize|hw\.keyboard|PlayStore\.enabled)=' "$AVD_CONFIG" || true; } >"$AVD_CONFIG.tmp"
				printf 'hw.cpu.ncore=4\nhw.ramSize=4096\nhw.keyboard=yes\nPlayStore.enabled=yes\n' >>"$AVD_CONFIG.tmp"
				mv "$AVD_CONFIG.tmp" "$AVD_CONFIG"
				ok "created the $AVD emulator"
			else
				warn "Creating the $AVD emulator failed."
				SKIPPED+=("$SDKMANAGER --sdk_root=$ANDROID_SDK emulator '$AVD_IMAGE', then re-run")
			fi
		else
			warn "No sdkmanager, so the Android SDK is not set up."
			SKIPPED+=("install the Android command-line tools, then re-run")
		fi
		note "Start the emulator with bun run emulator, or plug in a phone with USB debugging on."
		note "First dev build: bunx expo run:android (10+ minutes the first time)."
	fi

	finish
	say "${BOLD}Start developing${RESET}"
	step "Web:     bunx expo start --web"
	step "Android: bunx expo run:android (after the Android stage)"
	note "Maestro e2e flows: see .maestro/README.md."
	note "Owner only, EAS Update token: scripts/setup-eas-update.sh."
	printf '\n'
}

run_wizard "$@"
exit
