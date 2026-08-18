#!/bin/zsh
set -e
cd "${0:A:h}"
exec /opt/homebrew/bin/python3 server.py
