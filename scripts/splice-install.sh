#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Splice — Git Mergetool Installer
# ════════════════════════════════════════════════════════════════════════
# One-command setup:  bash <(curl -fsSL https://...)  —or—
#                     ./scripts/splice-install.sh
#
# What it does:
#   1. Locates (or builds) the Splice binary
#   2. Configures git to use Splice as the default mergetool
#   3. Sets conflict style to zdiff3 (richer conflict markers)
#   4. Optionally symlinks Splice into ~/.local/bin or /usr/local/bin
# ════════════════════════════════════════════════════════════════════════

# macOS default bash (3.2) doesn't support pipefail — guard against that
set -euo pipefail 2>/dev/null || set -euo

# ── Constants ─────────────────────────────────────────────────────────
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly BINARY_NAME="splice"

# Colors (disabled when not in terminal)
if [[ -t 1 ]]; then
    readonly GREEN='\033[0;32m'
    readonly YELLOW='\033[1;33m'
    readonly RED='\033[0;31m'
    readonly CYAN='\033[0;36m'
    readonly BOLD='\033[1m'
    readonly NC='\033[0m' # No Color
else
    readonly GREEN='' YELLOW='' RED='' CYAN='' BOLD='' NC=''
fi

log()  { echo -e "${GREEN}✔${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✘${NC} $1" >&2; }
info() { echo -e "${CYAN}ℹ${NC} $1"; }
header() { echo -e "\n${BOLD}━━━ $1 ━━━${NC}\n"; }

# ── Usage / Help ──────────────────────────────────────────────────────
usage() {
    cat <<EOF
${BOLD}Usage:${NC} $(basename "$0") [options]

${BOLD}Options:${NC}
  --prefix <dir>     Install prefix for symlink (default: auto-detect)
                     Examples: ~/.local/bin, /usr/local/bin
  --build            Force a fresh release build via \`cargo build --release\`
  --debug            Use the debug build instead of release
  --no-symlink       Skip creating a symlink in PATH
  --dry-run          Print what would be done without making changes
  --uninstall        Remove Splice from git mergetool configuration
  --help, -h         Show this help message

${BOLD}Examples:${NC}
  $(basename "$0")                    # Auto-detect and configure
  $(basename "$0") --prefix ~/.local  # Symlink into ~/.local/bin
  $(basename "$0") --dry-run          # Preview without changes
  $(basename "$0") --uninstall        # Remove git config
EOF
    exit 0
}

# ── Detect platform ───────────────────────────────────────────────────
detect_platform() {
    case "$(uname -s)" in
        Darwin*)  echo "macos" ;;
        Linux*)   echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *)        echo "unknown" ;;
    esac
}

# ── Find the Splice binary ────────────────────────────────────────────
find_binary() {
    local build_type="$1"
    local binary=""

    # 1. Check if 'splice' is already in PATH
    if command -v "$BINARY_NAME" &>/dev/null; then
        binary="$(command -v "$BINARY_NAME")"
        log "Found Splice in PATH: ${binary}"
        echo "$binary"
        return 0
    fi

    # 2. Check common build output locations
    local candidates
    candidates=()
    local platform
    platform="$(detect_platform)"

    if [[ "$build_type" == "debug" ]]; then
        candidates+=("$PROJECT_ROOT/src-tauri/target/debug/$BINARY_NAME")
    else
        # Release builds
        candidates+=("$PROJECT_ROOT/src-tauri/target/release/$BINARY_NAME")
        # Tauri .app bundle on macOS
        if [[ "$platform" == "macos" ]]; then
            candidates+=("$PROJECT_ROOT/src-tauri/target/release/bundle/macos/Splice.app/Contents/MacOS/$BINARY_NAME")
        fi
        # Tauri .deb / AppImage on Linux
        if [[ "$platform" == "linux" ]]; then
            local arch
            arch="$(uname -m)"
            # Glob for deb package name (version varies)
            for f in "$PROJECT_ROOT/src-tauri/target/release/bundle/deb"/splice_*/usr/bin/"$BINARY_NAME"; do
              if [[ -f "$f" ]]; then
                candidates+=("$f")
              fi
            done
        fi
        # Cargo install location
        candidates+=("$HOME/.cargo/bin/$BINARY_NAME")
    fi

    for c in "${candidates[@]}"; do
        if [[ -x "$c" ]]; then
            binary="$c"
            break
        fi
    done

    if [[ -n "$binary" ]]; then
        log "Found binary: ${binary}"
        echo "$binary"
        return 0
    fi

    return 1
}

# ── Build Splice ──────────────────────────────────────────────────────
build_splice() {
    local build_type="$1"
    info "Building Splice (${build_type}) — this may take a minute..."

    # Check for Rust
    if ! command -v cargo &>/dev/null; then
        err "Rust is not installed. Install it first: https://rustup.rs"
        exit 1
    fi

    if [[ "$build_type" == "debug" ]]; then
        (cd "$PROJECT_ROOT/src-tauri" && cargo build)
    else
        # Build with cargo — simpler and more reliable than npx tauri
        (cd "$PROJECT_ROOT/src-tauri" && cargo build --release)
    fi

    # Verify build succeeded
    if [[ "$build_type" == "debug" ]]; then
        local binary="$PROJECT_ROOT/src-tauri/target/debug/$BINARY_NAME"
    else
        local binary="$PROJECT_ROOT/src-tauri/target/release/$BINARY_NAME"
    fi

    if [[ ! -x "$binary" ]]; then
        err "Build failed — expected binary at: ${binary}"
        exit 1
    fi

    log "Build complete: ${binary}"
    echo "$binary"
}

# ── Detect prefix for symlink ─────────────────────────────────────────
detect_prefix() {
    local platform
    platform="$(detect_platform)"

    if [[ "$platform" == "windows" ]]; then
        # On Windows, just add to PATH via git config
        echo ""
        return 0
    fi

    # Prefer ~/.local/bin (XDG), then ~/bin, then /usr/local/bin
    if [[ -d "$HOME/.local/bin" ]]; then
        echo "$HOME/.local/bin"
    elif [[ -d "$HOME/bin" ]]; then
        echo "$HOME/bin"
    elif [[ -d "/usr/local/bin" && -w "/usr/local/bin" ]]; then
        echo "/usr/local/bin"
    elif [[ -d "$HOME/.cargo/bin" ]]; then
        echo "$HOME/.cargo/bin"
    else
        echo "$HOME/.local/bin"
    fi
}

# ── Configure git ─────────────────────────────────────────────────────
configure_git() {
    local binary_path="$1"
    local dry_run="$2"

    # Skip if no binary path (e.g. dry-run without finding binary)
    if [[ -z "$binary_path" ]]; then
        return 0
    fi

    header "Configuring Git"

    # Ensure binary path is absolute
    binary_path="$(cd "$(dirname "$binary_path")" && pwd)/$(basename "$binary_path")"

    local cmd="\"${binary_path}\" --local=\"\$LOCAL\" --base=\"\$BASE\" --remote=\"\$REMOTE\" --result=\"\$MERGED\""

    if [[ "$dry_run" == "1" ]]; then
        info "[DRY RUN] Would run:"
        echo "  git config --global merge.conflictStyle zdiff3"
        echo "  git config --global merge.tool splice"
        echo "  git config --global mergetool.splice.cmd ${cmd}"
        echo "  git config --global mergetool.splice.trustExitCode true"
    else
        git config --global merge.conflictStyle zdiff3
        git config --global merge.tool splice
        git config --global "mergetool.splice.cmd" "$cmd"
        git config --global mergetool.splice.trustExitCode true
        log "Git configured: Splice is now your default mergetool"
    fi

    # Show current config
    info "Current git config:"
    echo "  merge.conflictStyle        = $(git config --global merge.conflictStyle || echo '(not set)')"
    echo "  merge.tool                 = $(git config --global merge.tool || echo '(not set)')"
    echo "  mergetool.splice.cmd       = $(git config --global mergetool.splice.cmd || echo '(not set)')"
    echo "  mergetool.splice.trustExitCode = $(git config --global mergetool.splice.trustExitCode || echo '(not set)')"
}

# ── Create symlink ────────────────────────────────────────────────────
create_symlink() {
    local binary_path="$1"
    local prefix="$2"
    local dry_run="$3"

    if [[ -z "$prefix" ]]; then
        return 0
    fi

    # Create prefix directory if it doesn't exist
    if [[ ! -d "$prefix" ]]; then
        if [[ "$dry_run" == "1" ]]; then
            info "[DRY RUN] Would create directory: ${prefix}"
        else
            mkdir -p "$prefix"
        fi
    fi

    local link_target="$prefix/$BINARY_NAME"

    local exists=false
    [[ -f "$link_target" || -L "$link_target" ]] && exists=true

    if [[ "$dry_run" == "1" ]]; then
        if $exists; then
            info "[DRY RUN] Would update symlink: ${link_target} → ${binary_path}"
        else
            info "[DRY RUN] Would create symlink: ${link_target} → ${binary_path}"
        fi
    else
        if $exists; then
            ln -sf "$binary_path" "$link_target"
            log "Updated symlink: ${link_target}"
        else
            ln -s "$binary_path" "$link_target"
            log "Created symlink: ${link_target}"
        fi
    fi

    # Suggest adding to PATH if not already there
    if [[ "$dry_run" != "1" ]]; then
        local in_path=false
        IFS=':' read -ra PATH_DIRS <<< "$PATH"
        for dir in "${PATH_DIRS[@]}"; do
            if [[ "$(cd "$dir" 2>/dev/null && pwd)" == "$(cd "$prefix" && pwd)" ]]; then
                in_path=true
                break
            fi
        done

        if ! $in_path; then
            warn "${prefix} is not in your PATH"
            info "Add this to your ~/.bashrc, ~/.zshrc, or equivalent:"
            echo "  export PATH=\"\$PATH:${prefix}\""
        fi
    fi
}

# ── Uninstall ─────────────────────────────────────────────────────────
uninstall_splice() {
    local dry_run="$1"
    header "Uninstalling Splice Mergetool"

    if [[ "$dry_run" == "1" ]]; then
        info "[DRY RUN] Would unset git config keys:"
        echo "  git config --global --unset merge.tool"
        echo "  git config --global --unset mergetool.splice.cmd"
        echo "  git config --global --unset mergetool.splice.trustExitCode"
    else
        git config --global --unset merge.tool 2>/dev/null || true
        git config --global --unset mergetool.splice.cmd 2>/dev/null || true
        git config --global --unset mergetool.splice.trustExitCode 2>/dev/null || true
        log "Git mergetool configuration removed"
    fi
}

# ════════════════════════════════════════════════════════════════════════
# ── Main ──────────────────────────────────────────────────────────────
# ════════════════════════════════════════════════════════════════════════

main() {
    local build_type="release"
    local prefix=""
    local auto_prefix=true
    local skip_symlink=false
    local dry_run=false
    local force_build=false
    local do_uninstall=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help|-h) usage ;;
            --prefix) shift; prefix="$1"; auto_prefix=false ;;
            --build) force_build=true ;;
            --debug) build_type="debug" ;;
            --no-symlink) skip_symlink=true ;;
            --dry-run) dry_run=true ;;
            --uninstall) do_uninstall=true ;;
            *) err "Unknown option: $1"; usage ;;
        esac
        shift
    done

    local dry_run_flag="0"
    $dry_run && dry_run_flag="1"

    echo ""
    info "Splice Installer — $(detect_platform)"
    $dry_run && warn "DRY RUN — no changes will be made"
    echo ""

    # ── Uninstall mode ────────────────────────────────────────────────
    if $do_uninstall; then
        uninstall_splice "$dry_run_flag"
        echo ""
        log "Done."
        exit 0
    fi

    # ── Find or build the binary ──────────────────────────────────────
    local binary_path=""
    if $dry_run; then
        header "Looking for Splice"
        if binary_path="$(find_binary "$build_type")"; then
            info "[DRY RUN] Would use existing binary: ${binary_path}"
        else
            info "[DRY RUN] Would build Splice (${build_type}) and install to ~/.local/bin"
        fi
    elif $force_build; then
        header "Building Splice"
        binary_path="$(build_splice "$build_type")"
    else
        header "Locating Splice"
        if binary_path="$(find_binary "$build_type")"; then
            : # found
        else
            warn "Binary not found — building now..."
            binary_path="$(build_splice "$build_type")"
        fi
    fi

    # ── Auto-detect prefix ────────────────────────────────────────────
    if $auto_prefix && ! $skip_symlink; then
        prefix="$(detect_prefix)"
    fi

    # ── Configure git ─────────────────────────────────────────────────
    configure_git "$binary_path" "$dry_run_flag"

    # ── Create symlink ────────────────────────────────────────────────
    if ! $skip_symlink; then
        header "Installing Symlink"
        create_symlink "$binary_path" "$prefix" "$dry_run_flag"
    fi

    # ── Done ───────────────────────────────────────────────────────────
    header "Summary"
    log "Binary:     ${binary_path}"
    log "Symlink:    ${prefix}/${BINARY_NAME}"
    $skip_symlink && info "Symlink:    skipped"
    log "Mergetool:  splice"
    log "Config:     ~/.gitconfig"

    echo ""
    if $dry_run; then
        warn "Dry run complete — no changes were made"
    else
        log "Splice is ready! Run ${BOLD}git mergetool${NC} in a conflicted repo to start."
    fi
    echo ""
}

main "$@"
