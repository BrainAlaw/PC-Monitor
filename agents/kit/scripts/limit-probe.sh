#!/usr/bin/env bash
# Scheduled paid probes were removed. This command never calls an AI provider.
set -euo pipefail
echo 'Periodic PONG probes are disabled. The mission runner handles pool cooldowns and bounded recovery.'
