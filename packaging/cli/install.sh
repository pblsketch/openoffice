#!/bin/sh
# IeumOffice command line, installed without the desktop app.
#
#   curl -fsSL https://ieumoffice.com/cli/install.sh | sh
#
# Flags (after `sh -s --` when piping):
#   --version <v>   release to install (default: the version this script shipped with)
#   --prefix <dir>  where the files live (default: $XDG_DATA_HOME/ieumoffice-cli)
#   --bin <dir>     where the `ieumoffice` launcher goes (default: $XDG_BIN_HOME or ~/.local/bin)
#   --node <path>   use this Node 22+ instead of the one on PATH
#   --uninstall     remove the launcher and the installed files
#
# It writes only the two folders above and needs no root. When the machine has
# no Node 22, the official build from nodejs.org is downloaded, checked against
# nodejs.org's SHASUMS256.txt and unpacked under --prefix. No telemetry, no
# shell profile edits, no other program is touched.
set -eu

REPO=pblsketch/openoffice
# bumped by the release step together with the published archive
DEFAULT_VERSION=0.12.9
NODE_VERSION=22.12.0
MARKER='# ieumoffice launcher (command-line install)'

: "${HOME:?HOME is not set}"

VERSION=$DEFAULT_VERSION
PREFIX=${XDG_DATA_HOME:-$HOME/.local/share}/ieumoffice-cli
BIN=${XDG_BIN_HOME:-$HOME/.local/bin}
NODE_ARG=
UNINSTALL=

say() { printf '%s\n' "$*"; }
die() {
  printf 'install.sh: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'TEXT'
IeumOffice command line, installed without the desktop app.

  sh install.sh [--version <v>] [--prefix <dir>] [--bin <dir>] [--node <path>] [--uninstall]

  --version <v>   release to install (default: the one this script shipped with)
  --prefix <dir>  where the files live (default: $XDG_DATA_HOME/ieumoffice-cli)
  --bin <dir>     where the ieumoffice launcher goes (default: ~/.local/bin)
  --node <path>   use this Node 22+ instead of the one on PATH
  --uninstall     remove the launcher and the installed files
TEXT
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION=${2:?--version needs a value}; shift 2 ;;
    --prefix) PREFIX=${2:?--prefix needs a value}; shift 2 ;;
    --bin) BIN=${2:?--bin needs a value}; shift 2 ;;
    --node) NODE_ARG=${2:?--node needs a value}; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

# --- removing -----------------------------------------------------------------

if [ -n "$UNINSTALL" ]; then
  launcher=$BIN/ieumoffice
  if [ -f "$launcher" ] && grep -qF "$MARKER" "$launcher" 2>/dev/null; then
    rm -f "$launcher"
    say "removed $launcher"
  elif [ -e "$launcher" ] || [ -L "$launcher" ]; then
    say "left $launcher alone: it was not installed by this script"
  fi
  rm -rf "$PREFIX"
  say "removed $PREFIX"
  exit 0
fi

# --- platform -----------------------------------------------------------------

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) die "unsupported operating system: $(uname -s)" ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac
[ "$os-$arch" = linux-x64 ] || die "this release ships a command-line build for Linux x64 only (this machine is $os-$arch)"

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1"; }
  download() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO- "$1"; }
  download() { wget -qO "$2" "$1"; }
else
  die "curl or wget is required"
fi

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'
  else die "no sha256 tool (sha256sum, shasum or openssl)"
  fi
}

# verify <file> <shasums file>  — the sums file lists "<hex>  <name>"
verify() {
  name=$(basename "$1")
  expected=$(awk -v name="$name" '$2 == name { print $1 }' "$2")
  [ -n "$expected" ] || die "no checksum for $name"
  actual=$(sha256_of "$1")
  [ "$expected" = "$actual" ] || die "checksum mismatch for $name"
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

# --- Node 22 ------------------------------------------------------------------

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

node_bin=
if [ -n "$NODE_ARG" ]; then
  [ -x "$NODE_ARG" ] || die "--node is not executable: $NODE_ARG"
  [ "$(node_major "$NODE_ARG")" -ge 22 ] || die "--node must be Node 22 or newer: $NODE_ARG"
  node_bin=$NODE_ARG
elif command -v node >/dev/null 2>&1 && [ "$(node_major node)" -ge 22 ]; then
  node_bin=$(command -v node)
fi

if [ -z "$node_bin" ]; then
  say "Node 22 or newer was not found; downloading Node v$NODE_VERSION from nodejs.org"
  base="https://nodejs.org/dist/v$NODE_VERSION"
  fetch "$base/SHASUMS256.txt" > "$tmp/node-SHASUMS256.txt"
  download "$base/node-v$NODE_VERSION-$os-$arch.tar.gz" "$tmp/node.tar.gz"
  verify "$tmp/node.tar.gz" "$tmp/node-SHASUMS256.txt"
  tar -xzf "$tmp/node.tar.gz" -C "$tmp"
  mkdir -p "$PREFIX"
  rm -rf "$PREFIX/runtime"
  mv "$tmp/node-v$NODE_VERSION-$os-$arch" "$PREFIX/runtime"
  node_bin=$PREFIX/runtime/bin/node
fi

"$node_bin" -e "" || die "Node at $node_bin does not run"

# --- the command line ---------------------------------------------------------

say "installing IeumOffice command line $VERSION"
asset="ieumoffice-cli_${VERSION}_${os}-${arch}.tar.gz"
base="https://github.com/$REPO/releases/download/v$VERSION"
download "$base/$asset" "$tmp/$asset"
download "$base/$asset.sha256" "$tmp/$asset.sha256"
verify "$tmp/$asset" "$tmp/$asset.sha256"

rm -rf "$PREFIX/$VERSION"
mkdir -p "$PREFIX"
tar -xzf "$tmp/$asset" -C "$PREFIX"
mv "$PREFIX/ieumoffice-cli" "$PREFIX/$VERSION"
ln -sfn "$VERSION" "$PREFIX/current"

mkdir -p "$BIN"
launcher=$BIN/ieumoffice
if [ -L "$launcher" ]; then
  case "$(readlink "$launcher")" in
    "$PREFIX"/*) ;;
    *) die "$launcher belongs to another program; move it away first" ;;
  esac
elif [ -e "$launcher" ]; then
  grep -qF "$MARKER" "$launcher" 2>/dev/null ||
    die "$launcher belongs to another program; move it away first"
fi

cat > "$launcher" <<EOF
#!/bin/sh
$MARKER
exec "$node_bin" "$PREFIX/current/cli/genoffice.cjs" "\$@"
EOF
chmod 755 "$launcher"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) say "Add $BIN to PATH for future shells: export PATH=\"$BIN:\$PATH\"" ;;
esac

"$launcher" --version || die "the launcher did not run"
say "installed: $launcher"
