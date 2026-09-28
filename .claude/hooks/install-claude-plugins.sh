#!/bin/bash
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# oss@cedricziel depends on coderabbit@claude-plugins-official, so that
# marketplace must be known before oss can load.
claude plugin marketplace add anthropics/claude-plugins-official >/dev/null
claude plugin marketplace add cedricziel/claude-plugins >/dev/null
claude plugin install oss@cedricziel >/dev/null
exit 0
