# syntax=docker/dockerfile:1

# ========== 构建阶段 ==========
FROM node:20.19-alpine AS build

WORKDIR /app

# better-sqlite3 等原生依赖在 Alpine 上可能需要本地编译（仅构建阶段需要）
RUN apk add --no-cache python3 make g++

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci && \
    npm cache clean --force

# 复制源码
COPY . .

# 构建前端与服务端，并裁剪开发依赖
RUN npm run build && \
    npm run build:server && \
    npm prune --omit=dev

# ========== 生产阶段 ==========
FROM node:20.19-alpine

WORKDIR /app

# 仅运行时所需的极小依赖：su-exec 用于启动时降权
RUN apk add --no-cache su-exec

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/build ./build
# 发布验证脚本在容器内执行（docker-publish 的 Compose 验证步骤依赖它）
COPY scripts/verify-release-runtime.mjs scripts/verify-storage-migration.mjs /app/scripts/
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    mkdir -p /app/data/uploads && \
    chown -R node:node /app/data

EXPOSE 3000

VOLUME ["/app/data"]

# 容器内自检健康接口
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# 以 node 用户运行；entrypoint 负责数据目录属主迁移后降权
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "build/server.js"]
