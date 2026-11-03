#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME}/.config/systemd/user"

mkdir -p "${TARGET_DIR}"

cp "${SCRIPT_DIR}/rsstg-poller.service" "${TARGET_DIR}/"
cp "${SCRIPT_DIR}/rsstg-poller.timer" "${TARGET_DIR}/"

systemctl --user daemon-reload
systemctl --user enable --now rsstg-poller.timer

echo "✅ rsstg systemd user timer successfully installed and started!"
echo "Status:"
systemctl --user status rsstg-poller.timer --no-pager

