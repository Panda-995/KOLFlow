# 生产阶段
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 等原生依赖在 Alpine 上可能需要本地编译
RUN apk add --no-cache python3 make g++

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci && \
    npm cache clean --force

# 复制源码
COPY . .

# 构建前端
RUN npm run build && \
    npm run build:server && \
    npm prune --omit=dev

# 创建数据目录
RUN mkdir -p /app/data

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# 暴露端口
EXPOSE 3000

# 数据卷
VOLUME ["/app/data"]

# 启动命令
CMD ["node", "build/server.js"]
