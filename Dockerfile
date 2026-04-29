# 生产阶段
FROM node:20-alpine

# 使用阿里云镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm config set registry https://registry.npmmirror.com && \
    npm install && \
    npm cache clean --force

# 复制源码
COPY . .

# 构建前端
RUN npm run build

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
