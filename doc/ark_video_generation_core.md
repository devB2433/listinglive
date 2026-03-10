# Ark 视频生成核心文档

**项目**: ListingLive  
**状态**: 当前正式生效  
**最后更新**: 2026-03-07

---

## 1. 当前正式方案

ListingLive 当前的视频生成正式链路统一基于 **Volcengine Ark / Seedance**。

- 正式 provider：`SeedanceVideoProvider`
- 正式默认 transport：`REST`
- 可切换 transport：`REST` / `SDK`
- 正式默认请求风格：`prompt_flags`
- 用户下载的视频必须先由后端下载回我方存储，再通过我方接口提供下载

当前代码层面的职责拆分：

- `SeedanceVideoProvider`
  统一编排“创建任务 -> 轮询状态 -> 下载成品 -> 本地后处理 logo”
- `ArkRequestBuilder`
  负责把内部参数转换成 Ark 请求体
- `ArkTransport`
  负责真正调用 Ark API
- `ArkInputResolver`
  负责把本地图片转换成 Ark 可接受的输入引用

---

## 2. 为什么这样设计

Ark/Seedance 在业务上只有一套能力，但官方同时支持两种调用形态：

- 官方 SDK
- 纯 REST API

对 ListingLive 而言，这两者只是“传输方式”不同，不应该变成两个独立业务 provider。  
因此系统保持 **单一正式 provider**，而在 provider 内部把 transport 抽象出来，避免后续出现两套重复的轮询、下载、错误处理和任务记录逻辑。

---

## 3. 当前默认行为

当前默认配置：

- `.env` 只保留 `AI_PROVIDER_CONFIG_PATH`
- 实际视频接入由 `config/ai_provider.toml` 提供
- 当前正式 provider 为 `seedance`
- 当前默认 transport 为 `rest`
- 当前默认 request_style 为 `prompt_flags`

`prompt_flags` 风格表示：

- 内部仍保留结构化参数：`prompt`、`resolution`、`duration`、`aspect_ratio`
- 发给 Ark 时，优先拼成官方示例风格的文本提示词，例如：

```text
Create a gentle push-in camera move based on this image. --resolution 1080p --duration 5 --ratio 16:9 --camerafixed false --watermark false
```

这样做的原因是：更贴近官方 curl 示例，也更便于排障和与 API 文档比对。

---

## 3.1 运维配置方式

当前推荐的维护方式是：

1. 仓库保留 `config/ai_provider.toml.example`
2. 本地或服务器维护 `config/ai_provider.toml`
3. 如有特殊目录需求，再通过 `.env` 中的 `AI_PROVIDER_CONFIG_PATH` 覆盖

日常运维只需要关注一个文件：

- `config/ai_provider.toml`

推荐修改顺序：

1. 先改 `video.api_key`
2. 再改 `video.model_id`
3. 如确有需要再改 `transport / request_style / timeout`
4. 重启后端与 worker

字段说明：

- `video.provider`：`seedance` 或 `local`
- `video.base_url`：Ark API 根地址，远端 provider 必填
- `video.api_key`：远端 provider 的唯一 key，远端 provider 必填
- `video.model_id`：当前正式模型 ID，远端 provider 必填
- `video.transport`：`rest` 或 `sdk`
- `video.request_style`：`prompt_flags` 或 `structured`
- `video.camera_fixed`：是否向 provider 传固定镜头参数
- `video.watermark`：是否请求 provider 生成带水印结果
- `video.timeout_seconds`：调用远端创建/查询接口时的超时
- `video.download_timeout_seconds`：下载远端视频成品时的超时
- `video.default_model`：兜底模型名，通常不需要频繁改

---

## 4. 代码结构

核心文件：

- `backend/services/video_provider.py`
- `backend/services/video_service.py`
- `backend/core/config.py`

`video_provider.py` 中的关键层次：

- `SeedanceVideoProvider`
- `ArkRequestBuilder`
- `ArkRestTransport`
- `ArkSdkTransport`
- `DataUrlArkInputResolver`

当前默认 transport 是 `ArkRestTransport`，但 `ArkSdkTransport` 已保留，可通过配置切换。

---

## 5. 图片输入规则

当前默认输入解析器是 `DataUrlArkInputResolver`。

它的行为是：

- 读取本地图片
- 转换成 `data:image/...;base64,...`
- 作为 `image_url.url` 提交给 Ark

已通过远端实测确认：

- Ark 接口会接受这种图片引用方式
- 输入图片宽度至少需要 `300px`

因此代码中已加入本地前置校验：

- 若图片宽度小于 `300px`，会在本地直接报错，而不是把 `400 Bad Request` 留到远端

---

## 6. 远端任务链路

### 6.1 创建任务

REST 默认路径：

- `POST /api/v3/contents/generations/tasks`

SDK 对应调用：

- `client.content_generation.tasks.create(...)`

### 6.2 查询任务

REST 默认路径：

- `GET /api/v3/contents/generations/tasks/{id}`

SDK 对应调用：

- `client.content_generation.tasks.get(task_id=...)`

### 6.3 成功后处理

任务成功后：

1. 读取 Ark 返回的 `content.video_url` 或 `content.file_url`
2. 后端下载视频到我方存储
3. 如有 logo，则在本地对成品视频执行后处理加水印
4. 更新 `video_tasks` 状态与下载信息

---

## 7. 存储红线

这是当前实现必须遵守的核心规则：

- 不直接把 Ark 返回的视频地址透传给前端
- 不让用户直接下载第三方临时 URL
- 必须先下载到我方存储，再通过我方受控下载接口返回

这条规则同时适用于：

- 短视频
- 长视频片段
- 长视频最终合并结果

---

## 8. UI 测试前提

要在 UI 中测试视频生成，至少需要满足：

- 后端读取到有效的 `config/ai_provider.toml`
- `video.api_key` 与 `video.model_id` 正确
- 后端与 Celery worker 已重启
- 输入图片宽度不小于 `300px`

推荐关键配置：

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

切换规则：

- 常规使用：直接改 `config/ai_provider.toml`
- 如需改配置文件位置：在 `.env` 中调整 `AI_PROVIDER_CONFIG_PATH`

排查顺序：

1. 先确认 `config/ai_provider.toml` 存在
2. 再确认 `video.api_key`、`video.model_id` 不为空
3. 再确认后端和 Celery worker 已重启
4. 如果仍失败，再检查 `transport` 是否与当前环境匹配

---

## 9. 已完成验证

本方案已完成以下验证：

- 本地回归测试通过
- 使用真实 `video.api_key` 成功创建远端任务
- 成功查询远端任务状态
- 成功完成一条端到端生成并将 mp4 下载回本地

这意味着当前主链路已经具备 UI 实测条件。

---

## 10. 后续演进建议

后续若需要增强稳定性，优先顺序建议如下：

1. 增加 `ArkFileResolver`
   通过 Ark Files API 上传图片，再把文件对象转换成更稳定的图片引用
2. 为 REST transport 增加更细粒度的错误码映射
3. 在任务记录中保留更多 provider 原始字段，便于排障
4. 如有需要，再把 `SDK` transport 切成备用正式路径
