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

### 4. 环境变量与 AI provider 配置

复制 `.env.example` 为 `.env` 并按需修改（数据库、Redis、SECRET_KEY 等）。

视频模型接入改为单独维护：

1. 复制 `config/ai_provider.toml.example` 为 `config/ai_provider.toml`
2. 在 `config/ai_provider.toml` 中填写唯一一套 `provider / api_key / model_id / transport`
3. 如需改路径，再通过 `.env` 中的 `AI_PROVIDER_CONFIG_PATH` 覆盖

推荐运维流程：

1. 平时只改 `config/ai_provider.toml`
2. 不改 `.env` 里的旧 `ARK_* / SEEDANCE_*` 字段
3. 改完执行 `scripts/dev/restart-dev.ps1` 让后端和 worker 重新加载配置

关键字段说明：

- `provider`：当前建议用 `seedance`，本地调试可切到 `local`
- `base_url`：Ark 接入地址，通常保持默认即可
- `api_key`：唯一正式 key
- `model_id`：当前实际调用的视频模型 ID
- `transport`：`rest` 或 `sdk`，默认建议 `rest`
- `request_style`：默认 `prompt_flags`
- `camera_fixed`：是否固定镜头
- `watermark`：是否让 provider 输出水印
- `timeout_seconds`：创建任务和查状态时的接口超时
- `download_timeout_seconds`：下载成品视频的超时

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
- 重启后端、Celery worker、Celery Beat（定时检查异常任务）和前端
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

## Ark 视频生成

当前正式视频生成方案见：

- `doc/ark_video_generation_core.md`

核心结论：

- 正式 provider 为 `SeedanceVideoProvider`
- 当前默认走 Ark REST API
- 代码同时保留 SDK transport，可通过配置切换
- 所有生成结果都必须先下载回我方存储，再通过我方接口提供给用户

建议的 `config/ai_provider.toml`：

```toml
[video]
provider = "seedance"
base_url = "https://ark.cn-beijing.volces.com/api/v3"
api_key = "replace-with-your-api-key"
model_id = "replace-with-your-model-id"
transport = "rest"
request_style = "prompt_flags"
camera_fixed = false
watermark = false
timeout_seconds = 60
download_timeout_seconds = 300
default_model = "doubao-seedance-1-0-pro-fast-251015"
```

本地调试如果只想走本地 provider，可改成：

```toml
[video]
provider = "local"
transport = "rest"
request_style = "prompt_flags"
camera_fixed = false
watermark = false
timeout_seconds = 60
download_timeout_seconds = 300
default_model = "doubao-seedance-1-0-pro-fast-251015"
```

## Stripe 接入

Stripe 相关的真实环境接入步骤见：

- `doc/stripe_setup_checklist.md`

Price ID 回填工具：

- `config/stripe_price_ids.example.json`
- `scripts/billing/sync_stripe_price_ids.py`

当前默认商品目录：

- 订阅：`Basic (CAD 9.9 / 20 credits)`、`Pro (CAD 19.9 / 50 credits)`、`Ultimate (CAD 49.9 / 150 credits)`
- 配额包：`pack_10 (CAD 5 / 10 credits)`、`pack_50 (CAD 20 / 50 credits)`、`pack_150 (CAD 50 / 150 credits)`

## 健康检查

```bash
curl http://127.0.0.1:8003/health
```
