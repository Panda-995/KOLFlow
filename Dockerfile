# 构建阶段
FROM node:20-alpine AS builder

# 使用阿里云镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装编译原生模块所需的工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（使用淘宝 npm 镜像加速）
RUN npm config set registry https://registry.npmmirror.com && npm ci

# 复制源代码
COPY . .

# 构建前端
RUN npm run build

# 生产阶段
FROM node:20-alpine AS production

# 使用阿里云镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装编译原生模块所需的工具（better-sqlite3 需要）
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装生产依赖 + tsx（使用淘宝 npm 镜像加速）
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --only=production && \
    npm install tsx && \
    npm cache clean --force

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/tsconfig.json ./tsconfig.json

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
CMD ["npx", "tsx", "server.ts"]