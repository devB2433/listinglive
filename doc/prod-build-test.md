# 本地模拟生产环境编译与部署测试

用于在本地（Windows 或 Linux）验证生产 Docker 镜像能否成功构建，并可选择启动整栈做一次访问测试。

## 1. 仅编译（不启动服务）

在项目根目录执行：

```bash
docker compose --env-file .env.prod.test -f docker-compose.prod.yml build frontend api worker beat
```

- 使用仓库内的 `.env.prod.test`，其中已写好 `NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_API_URL` 等，与生产一致。
- 会构建四个镜像：`listinglive-frontend`、`listinglive-api`、`listinglive-worker`、`listinglive-beat`。
- 构建成功即说明生产编译流程正常，和服务器上执行 `update.sh` 时的构建一致。
- **前端资源**：`frontend/Dockerfile.prod` 会 `COPY content/media ./public/media`（首页 Hero 三图一视频）。若仓库中无 `content/media`，部署脚本会自动创建空目录以保证构建通过，但首页媒体会 404；生产环境请确保 `content/media` 内已提交所需图片与视频。

## 2. 编译并启动整栈（可选）

若需要本地启动“类生产”环境并访问页面：

1. **确保测试用配置目录和 ai 配置存在**（首次执行一次即可）：
   - 创建目录：`.tmp/prod-test/config/`
   - 在该目录下创建 `ai_provider.toml`，内容为：
     ```toml
     [video]
     provider = "local"
     ```
   （`provider = "local"` 表示本地模拟，无需真实视频 API key。`.tmp/` 已在 .gitignore 中，不会进仓库。）

2. **启动**（在项目根目录）：
   ```bash
   docker compose --env-file .env.prod.test -f docker-compose.prod.yml up -d postgres redis
   ```
   等待 postgres、redis 健康后：

   ```bash
   docker compose --env-file .env.prod.test -f docker-compose.prod.yml run --rm api alembic upgrade head
   docker compose --env-file .env.prod.test -f docker-compose.prod.yml up -d api worker beat frontend reverse-proxy
   ```

3. **访问**：浏览器打开 `http://localhost:3001`（`PROXY_PORT=3001`）。

4. **停止**：
   ```bash
   docker compose --env-file .env.prod.test -f docker-compose.prod.yml down
   ```

## 3. 与真实生产的关系

- `.env.prod.test` 仅用于本地测试，已加入 `.gitignore`，不会提交。
- 真实生产使用 `scripts/prod/update.sh`，并读取服务器上的 `/opt/listinglive/config/.env.prod`。
- 本地用 `.env.prod.test` 模拟的只是“同样的 compose 与构建参数”，便于在合并前自测生产构建是否报错。
