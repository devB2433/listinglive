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

- `VIDEO_PROVIDER=seedance`
- `ARK_PROFILE=test`
- `ARK_TRANSPORT=rest`
- `ARK_REQUEST_STYLE=prompt_flags`
- `ARK_TEST_VIDEO_MODEL_ID=ep-20260307234310-k24x7`
- `ARK_PRODUCTION_VIDEO_MODEL_ID=ep-20260307215031-lgmpq`

`prompt_flags` 风格表示：

- 内部仍保留结构化参数：`prompt`、`resolution`、`duration`、`aspect_ratio`
- 发给 Ark 时，优先拼成官方示例风格的文本提示词，例如：

```text
Create a gentle push-in camera move based on this image. --resolution 1080p --duration 5 --ratio 16:9 --camerafixed false --watermark false
```

这样做的原因是：更贴近官方 curl 示例，也更便于排障和与 API 文档比对。

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

- 后端读取到有效的 `ARK_API_KEY`
- `ARK_VIDEO_MODEL_ID` 正确
- 后端与 Celery worker 已重启
- 输入图片宽度不小于 `300px`

推荐关键配置：

```env
VIDEO_PROVIDER=seedance
ARK_PROFILE=test
ARK_API_KEY=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_VIDEO_MODEL_ID=
ARK_PRODUCTION_API_KEY=
ARK_PRODUCTION_VIDEO_MODEL_ID=ep-20260307215031-lgmpq
ARK_TEST_API_KEY=
ARK_TEST_VIDEO_MODEL_ID=ep-20260307234310-k24x7
ARK_TRANSPORT=rest
ARK_REQUEST_STYLE=prompt_flags
```

切换规则：

- 常规使用：改 `ARK_PROFILE=test|production`
- 临时强制覆盖：直接设置 `ARK_API_KEY` 或 `ARK_VIDEO_MODEL_ID`

---

## 9. 已完成验证

本方案已完成以下验证：

- 本地回归测试通过
- 使用真实 `ARK_API_KEY` 成功创建远端任务
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
