#!/bin/bash
set -e

# Install any new dependencies added by merged tasks
pnpm install --frozen-lockfile=false
