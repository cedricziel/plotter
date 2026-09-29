#!/bin/sh
# Inputs the design-sync converter needs: the component .d.ts tree (types/) and the reference Storybook.
set -e
cd "$(dirname "$0")/.."
rm -rf types
npx tsc -p .design-sync/tsconfig.types.json
echo "export * from './ui/index';" > types/index.d.ts
npx storybook build -o .design-sync/sb-reference
