#!/bin/bash
# Curtis chạy khi đã duyệt đưa factory lên production: push factory → tạo PR factory→main → merge.
# Dùng: bash scripts/release-to-main.sh "Tiêu đề PR"
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=CurtisLuong/CRM
TITLE="${1:-factory → main}"
[ "$(git branch --show-current)" = "factory" ] || { echo "❌ Phải đứng ở nhánh factory."; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "❌ Còn thay đổi chưa commit."; exit 1; }

git push "$(git remote get-url origin)" factory:factory
PR=$(gh pr list -R "$REPO" --base main --head factory --state open --json number --jq '.[0].number')
if [ -z "$PR" ]; then
  gh pr create -R "$REPO" --base main --head factory --title "$TITLE" --body "Curtis duyệt $(date +%d/%m/%Y). Chi tiết: docs/STATE.md."
fi
gh pr merge -R "$REPO" factory --merge
echo "✅ Đã merge factory vào main. Theo dõi build APK: https://github.com/$REPO/actions"
