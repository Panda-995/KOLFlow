#!/bin/sh
# 容器入口：迁移应用数据属主后以非 root 的 node 用户运行服务。
# 旧版本镜像以 root 运行，已存在的数据卷内文件可能属于 root，
# 首次启动新镜像时需要先修正属主，否则 node 用户无法读写数据库。
set -e

data_dir="${DATA_DIR:-/app/data}"
# 显式导出：若外部传入空值，应用侧会回退到错误目录（/），与这里创建的目录不一致
export DATA_DIR="$data_dir"
mkdir -p "$data_dir" || true

# SQLite must be able to create its journal/WAL beside the database. A NAS
# share can reject chown even when the container's root user can write it.
can_write_data() {
  if [ ! -d "$data_dir/uploads" ]; then
    if [ "$1" = root ]; then
      mkdir -p "$data_dir/uploads" || return 1
    else
      su-exec "$1" mkdir -p "$data_dir/uploads" || return 1
    fi
  fi
  probe_script='
    dir=$1
    [ -d "$dir" ] && [ -d "$dir/uploads" ] || exit 1
    for location in "$dir" "$dir/uploads"; do
      probe=$(mktemp "$location/.kolflow-write-check.XXXXXX") || exit 1
      rm -f "$probe" || exit 1
    done
    for name in database.sqlite database.sqlite-wal database.sqlite-shm; do
      file="$dir/$name"
      [ ! -e "$file" ] || { [ -f "$file" ] && [ -r "$file" ] && [ -w "$file" ]; } || exit 1
    done
  '
  if [ "$1" = root ]; then
    sh -c "$probe_script" sh "$data_dir"
  else
    su-exec "$1" sh -c "$probe_script" sh "$data_dir"
  fi
}

if [ "$(id -u)" = "0" ]; then
  # 目录属主正确不代表旧 SQLite 文件也可写。只处理本应用的路径，
  # 不递归修改用户选择的共享目录内其他文件的权限。
  for target in "$data_dir" "$data_dir/uploads" \
    "$data_dir/database.sqlite" "$data_dir/database.sqlite-wal" "$data_dir/database.sqlite-shm"; do
    if [ -e "$target" ]; then
      chown node:node "$target" 2>/dev/null || true
    fi
  done
  if can_write_data node; then
    export HOME=/app
    exec su-exec node:node "$@"
  fi
  # A shared folder can keep its NAS owner's UID when chown is denied. Run as
  # that owner before considering root; this also keeps SQLite WAL writable.
  for candidate_file in "$data_dir/database.sqlite" "$data_dir"; do
    [ -e "$candidate_file" ] || continue
    owner=$(stat -c '%u:%g' "$candidate_file" 2>/dev/null || true)
    case "$owner" in
      ''|0:*|1000:1000) continue ;;
    esac
    if can_write_data "$owner"; then
      echo "KOLFlow: NAS folder rejects chown; using its writable owner $owner." >&2
      export HOME=/app
      exec su-exec "$owner" "$@"
    fi
  done
  if [ "${ALLOW_ROOT_DATA_FALLBACK:-false}" = true ] && can_write_data root; then
    echo "KOLFlow: data folder is not writable by the app user or folder owner; continuing as container root for this mount." >&2
    exec "$@"
  fi
  echo "KOLFlow: cannot write SQLite data in $data_dir (database, WAL/SHM or uploads). Check the selected NAS folder's write permission and mount mode; existing files were not changed." >&2
  exit 73
fi

if ! can_write_data root; then
  echo "KOLFlow: cannot write SQLite data in $data_dir. Check the selected NAS folder's write permission and mount mode." >&2
  exit 73
fi
exec "$@"
