#!/bin/sh
# 容器入口：迁移应用数据属主后以非 root 的 node 用户运行服务。
# 旧版本镜像以 root 运行，已存在的数据卷内文件可能属于 root，
# 首次启动新镜像时需要先修正属主，否则 node 用户无法读写数据库。
set -e

data_dir="${DATA_DIR:-/app/data}"
# 显式导出：若外部传入空值，应用侧会回退到错误目录（/），与这里创建的目录不一致
export DATA_DIR="$data_dir"
mkdir -p "$data_dir" "$data_dir/uploads" || true

if [ "$(id -u)" = "0" ]; then
  # 目录属主正确不代表旧 SQLite 文件也可写。只处理本应用的路径，
  # 不递归修改用户选择的共享目录内其他文件的权限。
  for target in "$data_dir" "$data_dir/uploads" \
    "$data_dir/database.sqlite" "$data_dir/database.sqlite-wal" "$data_dir/database.sqlite-shm"; do
    if [ -e "$target" ]; then
      chown node:node "$target" 2>/dev/null || true
    fi
  done
  export HOME=/app
  exec su-exec node:node "$@"
fi

exec "$@"
