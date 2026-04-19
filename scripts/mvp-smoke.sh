#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[smoke] Step 1/4: full mvp check"
pnpm check:mvp

echo "[smoke] Step 2/4: runtime self-check"
if [[ -x "src-tauri/target/debug/server-launcher" ]]; then
  echo "[smoke] existing debug binary found"
else
  echo "[smoke] debug binary not found yet (normal before tauri dev run)"
fi

echo "[smoke] Step 3/4: windows target check (optional)"
if rustup target list --installed | grep -q "x86_64-pc-windows-msvc"; then
  (cd src-tauri && cargo check --target x86_64-pc-windows-msvc)
else
  echo "[smoke] skip windows cross-check: rust target x86_64-pc-windows-msvc not installed"
  echo "[smoke] hint: rustup target add x86_64-pc-windows-msvc"
fi

echo "[smoke] Step 4/4: result"
echo "[smoke] MVP smoke checks passed"
