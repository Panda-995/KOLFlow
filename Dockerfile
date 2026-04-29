# 生产阶段
FROM node:20-alpine AS production

# 使用阿里云镜像源加速
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖（使用阿里云 npm 镜像加速）
RUN npm config set registry https://registry.npmmirror.com && \
    npm install && \
    npm cache clean --force

# 复制所有源代码
COPY . .

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
