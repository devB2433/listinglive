"""
视频生成 provider 抽象
"""
import asyncio
import base64
import mimetypes
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import imageio.v2 as imageio
import numpy as np
from PIL import Image
from volcenginesdkarkruntime import AsyncArk

from backend.core.ai_provider_config import VideoProviderConfig, get_video_provider_config
from backend.core.config import settings

RESOLUTION_BASE = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
}

ASPECT_RATIO_MAP = {
    "16:9": (16, 9),
    "9:16": (9, 16),
    "1:1": (1, 1),
}


@dataclass
class GeneratedVideo:
    provider_name: str
    provider_task_ids: dict[str, str]


@dataclass
class SubmittedVideoTask:
    provider_name: str
    provider_task_id: str
    provider_task_ids: dict[str, str]


@dataclass
class ProviderTaskSnapshot:
    status: str
    video_url: str | None = None
    error_message: str | None = None
    provider_task_ids: dict[str, str] | None = None


class VideoProvider(ABC):
    provider_name: str
    supports_remote_lifecycle = False

    @abstractmethod
    async def generate_image_to_video(
        self,
        *,
        input_path: Path,
        output_path: Path,
        prompt: str,
        resolution: str,
        aspect_ratio: str,
        duration_seconds: int,
        logo_path: Path | None = None,
    ) -> GeneratedVideo:
        raise NotImplementedError


class AsyncTaskVideoProvider(VideoProvider):
    supports_remote_lifecycle = True

    @abstractmethod
    async def submit_image_to_video(
        self,
        *,
        input_path: Path,
        prompt: str,
        resolution: str,
        aspect_ratio: str,
        duration_seconds: int,
        logo_path: Path | None = None,
    ) -> SubmittedVideoTask:
        raise NotImplementedError

    @abstractmethod
    async def get_video_task(self, provider_task_id: str) -> ProviderTaskSnapshot:
        raise NotImplementedError

    async def wait_for_video_task(self, provider_task_id: str) -> ProviderTaskSnapshot:
        timeout_seconds = max(settings.VIDEO_MAX_POLL_SECONDS, settings.VIDEO_POLL_INTERVAL_SECONDS)
        deadline = asyncio.get_running_loop().time() + timeout_seconds

        while True:
            snapshot = await self.get_video_task(provider_task_id)
            if snapshot.status == "succeeded":
                return snapshot
            if snapshot.status == "failed":
                raise RuntimeError(snapshot.error_message or "视频生成失败")
            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError(f"视频生成任务轮询超时: {provider_task_id}")
            await asyncio.sleep(max(settings.VIDEO_POLL_INTERVAL_SECONDS, 1))

    async def download_generated_video(self, video_url: str, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        provider_config = get_video_provider_config()
        timeout = httpx.Timeout(
            connect=30,
            read=max(provider_config.download_timeout_seconds, 30),
            write=30,
            pool=30,
        )
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            async with client.stream("GET", video_url) as response:
                response.raise_for_status()
                with output_path.open("wb") as output_file:
                    async for chunk in response.aiter_bytes():
                        output_file.write(chunk)

    async def generate_image_to_video(
        self,
        *,
        input_path: Path,
        output_path: Path,
        prompt: str,
        resolution: str,
        aspect_ratio: str,
        duration_seconds: int,
        logo_path: Path | None = None,
    ) -> GeneratedVideo:
        submitted = await self.submit_image_to_video(
            input_path=input_path,
            prompt=prompt,
            resolution=resolution,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
            logo_path=logo_path,
        )
        snapshot = await self.wait_for_video_task(submitted.provider_task_id)
        if not snapshot.video_url:
            raise RuntimeError("视频生成成功，但未返回可下载的视频地址")
        await self.download_generated_video(snapshot.video_url, output_path)
        if logo_path is not None and logo_path.exists():
            await asyncio.to_thread(apply_logo_to_video_file, output_path, logo_path)
        provider_task_ids = {
            **submitted.provider_task_ids,
            "provider_task_id": submitted.provider_task_id,
        }
        if snapshot.provider_task_ids:
            provider_task_ids.update(snapshot.provider_task_ids)
        return GeneratedVideo(provider_name=self.provider_name, provider_task_ids=provider_task_ids)


class LocalVideoProvider(VideoProvider):
    provider_name = "local"

    def __init__(self) -> None:
        self.fps = settings.VIDEO_FPS
        self.simulated_delay_seconds = max(settings.LOCAL_VIDEO_PROVIDER_DELAY_SECONDS, 0)

    async def generate_image_to_video(
        self,
        *,
        input_path: Path,
        output_path: Path,
        prompt: str,
        resolution: str,
        aspect_ratio: str,
        duration_seconds: int,
        logo_path: Path | None = None,
    ) -> GeneratedVideo:
        if self.simulated_delay_seconds > 0:
            await asyncio.sleep(self.simulated_delay_seconds)
        await asyncio.to_thread(
            self._generate_sync,
            input_path,
            output_path,
            prompt,
            resolution,
            aspect_ratio,
            duration_seconds,
            logo_path,
        )
        return GeneratedVideo(
            provider_name=self.provider_name,
            provider_task_ids={"local_task_id": uuid.uuid4().hex},
        )

    def _generate_sync(
        self,
        input_path: Path,
        output_path: Path,
        prompt: str,
        resolution: str,
        aspect_ratio: str,
        duration_seconds: int,
        logo_path: Path | None,
    ) -> None:
        if not input_path.exists():
            raise FileNotFoundError(f"源图片不存在: {input_path}")

        with Image.open(input_path) as image:
            source = image.convert("RGBA")

        target_size = self._get_target_size(source.size, resolution, aspect_ratio)
        frame_count = max(duration_seconds * self.fps, 1)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with imageio.get_writer(output_path, fps=self.fps, codec="libx264", format="FFMPEG") as writer:
            for idx in range(frame_count):
                progress = idx / max(frame_count - 1, 1)
                frame = self._build_frame(source, target_size, progress)
                if logo_path is not None and logo_path.exists():
                    frame = apply_logo_to_frame(frame, logo_path)
                writer.append_data(np.asarray(frame.convert("RGB")))

    def _get_target_size(self, source_size: tuple[int, int], resolution: str, aspect_ratio: str) -> tuple[int, int]:
        base = RESOLUTION_BASE[resolution]
        if aspect_ratio == "adaptive":
            source_width, source_height = source_size
            source_ratio = source_width / max(source_height, 1)
            height = base
            width = int(height * source_ratio)
        else:
            ratio_width, ratio_height = ASPECT_RATIO_MAP[aspect_ratio]
            if ratio_width >= ratio_height:
                height = base
                width = int(base * ratio_width / ratio_height)
            else:
                width = base
                height = int(base * ratio_height / ratio_width)
        return self._make_macroblock(width), self._make_macroblock(height)

    def _build_frame(self, source: Image.Image, target_size: tuple[int, int], progress: float) -> Image.Image:
        target_width, target_height = target_size
        zoom = 1.0 + progress * 0.08
        resized = source.resize(
            (self._make_even(int(source.width * zoom)), self._make_even(int(source.height * zoom))),
            Image.Resampling.LANCZOS,
        )
        left = max((resized.width - target_width) // 2, 0)
        top = max((resized.height - target_height) // 2, 0)
        frame = resized.crop((left, top, left + target_width, top + target_height))
        if frame.size != target_size:
            frame = frame.resize(target_size, Image.Resampling.LANCZOS)
        return frame

    @staticmethod
    def _make_even(value: int) -> int:
        value = max(value, 2)
        return value if value % 2 == 0 else value + 1

    @staticmethod
    def _make_macroblock(value: int) -> int:
        value = max(value, 16)
        remainder = value % 16
        if remainder == 0:
            return value
        return value + (16 - remainder)


@dataclass
class ArkCreateTaskRequest:
    model: str
    content: list[dict[str, Any]]
    resolution: str | None = None
    ratio: str | None = None
    duration: int | None = None
    camera_fixed: bool | None = None
    watermark: bool | None = None


class ArkInputResolver(ABC):
    @abstractmethod
    async def resolve_image_reference(self, input_path: Path) -> str:
        raise NotImplementedError


class DataUrlArkInputResolver(ArkInputResolver):
    MIN_IMAGE_WIDTH = 300

    @staticmethod
    def _guess_content_type(input_path: Path) -> str:
        guessed, _ = mimetypes.guess_type(input_path.name)
        return guessed or "application/octet-stream"

    def _validate_image(self, input_path: Path) -> None:
        with Image.open(input_path) as image:
            if image.width < self.MIN_IMAGE_WIDTH:
                raise ValueError(f"图生视频输入图片宽度至少需要 {self.MIN_IMAGE_WIDTH}px")

    def _build_image_reference_url(self, input_path: Path) -> str:
        self._validate_image(input_path)
        content_type = self._guess_content_type(input_path)
        encoded = base64.b64encode(input_path.read_bytes()).decode("ascii")
        return f"data:{content_type};base64,{encoded}"

    async def resolve_image_reference(self, input_path: Path) -> str:
        if not input_path.exists():
            raise FileNotFoundError(f"源图片不存在: {input_path}")
        return await asyncio.to_thread(self._build_image_reference_url, input_path)


class ArkRequestBuilder:
    @staticmethod
    def _bool_flag(value: bool) -> str:
        return "true" if value else "false"

    def build_request(
        self,
        *,
        model: str,
        prompt: str,
        image_reference_url: str,
        resolution: str,
        aspect_ratio: str,
        duration_seconds: int,
        request_style: str,
        camera_fixed: bool,
        watermark: bool,
    ) -> ArkCreateTaskRequest:
        if request_style == "prompt_flags":
            prompt_with_flags = (
                f"{prompt} --resolution {resolution} --duration {duration_seconds} "
                f"--ratio {aspect_ratio} --camerafixed {self._bool_flag(camera_fixed)} "
                f"--watermark {self._bool_flag(watermark)}"
            ).strip()
            return ArkCreateTaskRequest(
                model=model,
                content=[
                    {
                        "type": "text",
                        "text": prompt_with_flags,
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_reference_url,
                        },
                    },
                ],
            )

        return ArkCreateTaskRequest(
            model=model,
            content=[
                {
                    "type": "text",
                    "text": prompt,
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": image_reference_url,
                    },
                },
            ],
            resolution=resolution,
            ratio=aspect_ratio,
            duration=duration_seconds,
            camera_fixed=camera_fixed,
            watermark=watermark,
        )


class ArkTransport(ABC):
    @abstractmethod
    async def create_task(self, request: ArkCreateTaskRequest) -> str:
        raise NotImplementedError

    @abstractmethod
    async def get_task(self, provider_task_id: str) -> ProviderTaskSnapshot:
        raise NotImplementedError


class ArkRestTransport(ArkTransport):
    def __init__(self, *, api_key: str, base_url: str, timeout_seconds: int) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _task_url(self, provider_task_id: str | None = None) -> str:
        if provider_task_id:
            return f"{self.base_url}/contents/generations/tasks/{provider_task_id}"
        return f"{self.base_url}/contents/generations/tasks"

    @staticmethod
    def _normalize_status(raw_status: str | None) -> str:
        normalized_status = str(raw_status or "").strip().lower()
        if normalized_status in {"queued", "pending", "created", "submitted"}:
            return "queued"
        if normalized_status in {"processing", "running", "in_progress"}:
            return "processing"
        if normalized_status in {"succeeded", "success", "completed"}:
            return "succeeded"
        if normalized_status in {"failed", "error", "canceled", "cancelled"}:
            return "failed"
        return "processing"

    @staticmethod
    def _extract_error_message(payload: dict[str, Any]) -> str | None:
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        failure_reason = payload.get("failure_reason")
        if isinstance(failure_reason, dict):
            message = failure_reason.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
        return None

    def _snapshot_from_payload(self, payload: dict[str, Any]) -> ProviderTaskSnapshot:
        content = payload.get("content")
        if not isinstance(content, dict):
            content = {}
        provider_task_id = payload.get("id")
        return ProviderTaskSnapshot(
            status=self._normalize_status(payload.get("status")),
            video_url=content.get("video_url") or content.get("file_url"),
            error_message=self._extract_error_message(payload),
            provider_task_ids={"provider_task_id": provider_task_id} if isinstance(provider_task_id, str) else None,
        )

    def _raise_for_status_with_detail(self, response: httpx.Response) -> None:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            try:
                payload = response.json()
            except Exception:
                payload = None
            if isinstance(payload, dict):
                detail = self._extract_error_message(payload)
                if detail:
                    raise RuntimeError(detail) from exc
            raise

    async def create_task(self, request: ArkCreateTaskRequest) -> str:
        payload: dict[str, Any] = {
            "model": request.model,
            "content": request.content,
        }
        if request.resolution is not None:
            payload["resolution"] = request.resolution
        if request.ratio is not None:
            payload["ratio"] = request.ratio
        if request.duration is not None:
            payload["duration"] = request.duration
        if request.camera_fixed is not None:
            payload["camera_fixed"] = request.camera_fixed
        if request.watermark is not None:
            payload["watermark"] = request.watermark

        timeout = httpx.Timeout(
            connect=max(self.timeout_seconds, 10),
            read=max(self.timeout_seconds, 10),
            write=max(self.timeout_seconds, 10),
            pool=max(self.timeout_seconds, 10),
        )
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(self._task_url(), headers=self._headers(), json=payload)
            self._raise_for_status_with_detail(response)
            response_payload = response.json()

        provider_task_id = response_payload.get("id")
        if not isinstance(provider_task_id, str) or not provider_task_id.strip():
            raise RuntimeError("Ark REST 创建任务成功，但未返回任务 ID")
        return provider_task_id

    async def get_task(self, provider_task_id: str) -> ProviderTaskSnapshot:
        timeout = httpx.Timeout(
            connect=max(self.timeout_seconds, 10),
            read=max(self.timeout_seconds, 10),
            write=max(self.timeout_seconds, 10),
            pool=max(self.timeout_seconds, 10),
        )
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(self._task_url(provider_task_id), headers=self._headers())
            self._raise_for_status_with_detail(response)
            payload = response.json()
        return self._snapshot_from_payload(payload)


class ArkSdkTransport(ArkTransport):
    def __init__(self, *, api_key: str, base_url: str, timeout_seconds: int) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds

    def _client(self) -> AsyncArk:
        return AsyncArk(base_url=self.base_url, api_key=self.api_key)

    @staticmethod
    def _normalize_status(raw_status: str | None) -> str:
        normalized_status = str(raw_status or "").strip().lower()
        if normalized_status in {"queued", "pending", "created", "submitted"}:
            return "queued"
        if normalized_status in {"processing", "running", "in_progress"}:
            return "processing"
        if normalized_status in {"succeeded", "success", "completed"}:
            return "succeeded"
        if normalized_status in {"failed", "error", "canceled", "cancelled"}:
            return "failed"
        return "processing"

    def _snapshot_from_sdk_task(self, task: Any) -> ProviderTaskSnapshot:
        content = getattr(task, "content", None)
        error = getattr(task, "error", None)
        provider_task_id = getattr(task, "id", None)
        return ProviderTaskSnapshot(
            status=self._normalize_status(getattr(task, "status", None)),
            video_url=getattr(content, "video_url", None) or getattr(content, "file_url", None),
            error_message=getattr(error, "message", None),
            provider_task_ids={"provider_task_id": provider_task_id} if isinstance(provider_task_id, str) else None,
        )

    async def create_task(self, request: ArkCreateTaskRequest) -> str:
        client = self._client()
        try:
            create_result = await client.content_generation.tasks.create(
                model=request.model,
                content=request.content,
                resolution=request.resolution,
                ratio=request.ratio,
                duration=request.duration,
                camera_fixed=request.camera_fixed,
                watermark=request.watermark,
                timeout=self.timeout_seconds,
            )
        finally:
            await client.close()

        provider_task_id = getattr(create_result, "id", None)
        if not isinstance(provider_task_id, str) or not provider_task_id.strip():
            raise RuntimeError("Ark SDK 创建任务成功，但未返回任务 ID")
        return provider_task_id

    async def get_task(self, provider_task_id: str) -> ProviderTaskSnapshot:
        client = self._client()
        try:
            result = await client.content_generation.tasks.get(
                task_id=provider_task_id,
                timeout=self.timeout_seconds,
            )
        finally:
            await client.close()
        return self._snapshot_from_sdk_task(result)


class SeedanceVideoProvider(AsyncTaskVideoProvider):
    provider_name = "seedance"

    def __init__(
        self,
        *,
        config: VideoProviderConfig | None = None,
        transport: ArkTransport | None = None,
        input_resolver: ArkInputResolver | None = None,
        request_builder: ArkRequestBuilder | None = None,
    ) -> None:
        self.config = config or get_video_provider_config()
        self.transport = transport or self._build_transport()
        self.input_resolver = input_resolver or DataUrlArkInputResolver()
        self.request_builder = request_builder or ArkRequestBuilder()

    def _get_api_key(self) -> str:
        api_key = self.config.api_key
        if not api_key:
            raise RuntimeError("Ark API Key 未配置，请先设置 config/ai_provider.toml 中的 video.api_key")
        return api_key

    def _build_transport(self) -> ArkTransport:
        transport_mode = self.config.transport.lower()
        common_kwargs = {
            "api_key": self._get_api_key(),
            "base_url": self.config.base_url,
            "timeout_seconds": self.config.timeout_seconds,
        }
        if transport_mode == "sdk":
            return ArkSdkTransport(**common_kwargs)
        if transport_mode == "rest":
            return ArkRestTransport(**common_kwargs)
        raise RuntimeError(f"暂不支持的 Ark transport: {self.config.transport}")

    async def submit_image_to_video(
        self,
        *,
        input_path: Path,
        prompt: str,
        resolution: str,
        aspect_ratio: str,
        duration_seconds: int,
        logo_path: Path | None = None,
    ) -> SubmittedVideoTask:
        image_reference_url = await self.input_resolver.resolve_image_reference(input_path)
        request = self.request_builder.build_request(
            model=self.config.model_id or self.config.default_model,
            prompt=prompt,
            image_reference_url=image_reference_url,
            resolution=resolution,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
            request_style=self.config.request_style.lower(),
            camera_fixed=self.config.camera_fixed,
            watermark=self.config.watermark,
        )
        provider_task_id = await self.transport.create_task(request)
        return SubmittedVideoTask(
            provider_name=self.provider_name,
            provider_task_id=provider_task_id,
            provider_task_ids={"provider_task_id": provider_task_id},
        )

    async def get_video_task(self, provider_task_id: str) -> ProviderTaskSnapshot:
        return await self.transport.get_task(provider_task_id)


def get_video_provider() -> VideoProvider:
    provider_config = get_video_provider_config()
    if provider_config.provider == "local":
        return LocalVideoProvider()
    if provider_config.provider == "seedance":
        return SeedanceVideoProvider(config=provider_config)
    raise RuntimeError(f"暂不支持的视频 provider: {provider_config.provider}")


def apply_logo_to_frame(frame: Image.Image, logo_path: Path) -> Image.Image:
    frame = frame.copy()
    with Image.open(logo_path) as logo_image:
        logo = logo_image.convert("RGBA")

    target_width = max(int(frame.width * 0.15), 1)
    scale = min(target_width / max(logo.width, 1), 1.0)
    logo = logo.resize(
        (max(LocalVideoProvider._make_even(int(logo.width * scale)), 2), max(LocalVideoProvider._make_even(int(logo.height * scale)), 2)),
        Image.Resampling.LANCZOS,
    )
    alpha = logo.getchannel("A")
    alpha = alpha.point(lambda value: int(value * 0.7))
    logo.putalpha(alpha)

    margin = 20
    position = (frame.width - logo.width - margin, frame.height - logo.height - margin)
    frame.alpha_composite(logo, dest=position)
    return frame


def apply_logo_to_video_file(video_path: Path, logo_path: Path) -> None:
    temp_output_path = video_path.with_name(f"{video_path.stem}.logo{video_path.suffix}")
    reader = imageio.get_reader(video_path, format="FFMPEG")
    meta = reader.get_meta_data()
    fps = meta.get("fps") or settings.VIDEO_FPS
    try:
        with imageio.get_writer(temp_output_path, fps=fps, codec="libx264", format="FFMPEG") as writer:
            for frame in reader:
                image = Image.fromarray(frame).convert("RGBA")
                watermarked = apply_logo_to_frame(image, logo_path)
                writer.append_data(np.asarray(watermarked.convert("RGB")))
    finally:
        reader.close()
    temp_output_path.replace(video_path)
