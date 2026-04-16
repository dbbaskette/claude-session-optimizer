#!/bin/bash
# Behavior controlled by env vars:
#   FAKE_EXIT - exit code (default 0)
#   FAKE_STDOUT - string to write to stdout
#   FAKE_STDERR - string to write to stderr
#   FAKE_SLEEP - seconds to sleep before exit
[ -n "$FAKE_STDOUT" ] && echo "$FAKE_STDOUT"
[ -n "$FAKE_STDERR" ] && echo "$FAKE_STDERR" 1>&2
[ -n "$FAKE_SLEEP" ] && sleep "$FAKE_SLEEP"
exit "${FAKE_EXIT:-0}"
