#!/usr/bin/env bash
set -euo pipefail

cd /var/www/personal-index

mkdir -p logs run

if [ -f run/site-content-api.pid ] && kill -0 "$(cat run/site-content-api.pid)" 2>/dev/null; then
  exit 0
fi

nohup node server/site-content-api.mjs > logs/site-content-api.log 2>&1 < /dev/null &
echo "$!" > run/site-content-api.pid
