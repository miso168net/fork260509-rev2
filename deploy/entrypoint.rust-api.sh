#!/bin/sh
set -e

case "$1" in
  server)
    exec /usr/local/bin/server
    ;;
  migration)
    shift
    exec /usr/local/bin/migration "$@"
    ;;
  cleanup-job)
    shift
    exec /usr/local/bin/cleanup-job "$@"
    ;;
  *)
    echo "usage: entrypoint.sh {server|migration|cleanup-job}" >&2
    exit 64
    ;;
esac
