#!/bin/bash
cd "$(dirname "$0")" || exit 1

# Finder starts command files with a shorter PATH than an interactive shell.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请先安装 Node.js 20 或更新版本。"
  read -r -p "按回车键关闭窗口..."
  exit 1
fi

if [ ! -f dist/index.html ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "未找到 npm，无法构建项目。"
    read -r -p "按回车键关闭窗口..."
    exit 1
  fi
  echo "正在准备项目，首次运行可能需要几分钟..."
  if [ ! -x node_modules/.bin/vite ]; then
    npm ci || { echo "依赖安装失败，请检查网络后重试。"; read -r -p "按回车键关闭窗口..."; exit 1; }
  fi
  npm run build || { echo "项目构建失败。"; read -r -p "按回车键关闭窗口..."; exit 1; }
fi

echo "正在启动青岬港..."
node local-server.cjs
result=$?
if [ "$result" -ne 0 ]; then
  echo "启动失败，请查看上方信息。"
  read -r -p "按回车键关闭窗口..."
fi
