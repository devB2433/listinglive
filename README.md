# ListingLive 后端

## 本地开发

### 1. 环境

- Python 3.11+
- PostgreSQL 15+
- Redis 7+

### 2. 启动基础设施（Docker）

```bash
docker-compose up -d postgres redis
```

### 3. 安装依赖

```bash
pip install -r requirements.txt
cd frontend && npm install
```

### 4. 环境变量

复制 `.env.example` 为 `.env` 并按需修改（数据库、Redis、SECRET_KEY 等）。

### 5. 数据库迁移

```bash
# 从项目根目录执行，PYTHONPATH 需包含项目根
set PYTHONPATH=%CD%   # Windows
alembic upgrade head
```

## 推荐启动方式

统一使用固定端口：

- 前端：`http://localhost:3001`
- 后端：`http://127.0.0.1:8003`

### 一键重启（推荐）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\restart-dev.ps1
```

这个脚本会：
- 先停止占用 `3001` / `8003` 的旧项目进程
- 自动启动 `postgres` / `redis`
- 重启后端、Celery worker 和前端
- 把日志写到 `.runtime/`

### 仅停止前后端与 worker

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\stop-dev.ps1
```

### 手动启动 API

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8003
```

### 手动启动前端

```bash
cd frontend
npm run dev:fixed
```

## 测试账号

迁移 002 会创建测试账号（仅当 `ENABLE_TEST_ACCOUNT=true` 时可登录）：

- 用户名：`root`
- 密码：`root`

## API 文档

启动后访问：http://127.0.0.1:8003/docs

## 健康检查

```bash
curl http://127.0.0.1:8003/health
```
