#!/bin/bash
# Publica o binário do Backlog.md com o conector do canon como versão do fork (nó 1.34.10.6).
# Os fluxos do GitHub ficam desligados no fork, então compila aqui com o scripts/build.ts deles.
# Uso: src/canon/release.sh <n>   →  tag canon-v<versão deles>-<n>, pré-release com as seis plataformas.
set -euo pipefail
N="${1:?uso: src/canon/release.sh <n>}"
cd "$(dirname "$0")/../.."
VERSION=$(jq -r .version package.json)
TAG="canon-v$VERSION-$N"
OUT=$(mktemp -d)
for target in darwin-arm64 darwin-x64 linux-x64-baseline linux-arm64 windows-x64-baseline windows-arm64; do
  ext=""; [[ $target == windows* ]] && ext=".exe"
  BACKLOG_BUILD_VERSION="$VERSION-canon.$N" BACKLOG_BUILD_TARGET="bun-$target" \
    BACKLOG_BUILD_OUTFILE="$OUT/backlog-bun-$target$ext" bun scripts/build.ts >/dev/null
done
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { git tag "$TAG"; git push -q origin "$TAG"; }
gh release create "$TAG" -R drummondjunior/Backlog.md --prerelease --title "$TAG" \
  --notes "Backlog.md $VERSION com o conector do drummond-canon (branch canon, $(git rev-parse --short HEAD))." \
  "$OUT"/backlog-bun-*
echo "$TAG"
