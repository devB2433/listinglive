"""
视频生成 provider 抽象
"""
import asyncio
import base64
import mimetypes
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx
import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from volcenginesdkarkruntime import AsyncArk

from backend.core.ai_provider_config import VideoProviderConfig, get_video_provider_config
from backend.core.config import settings
from backend.services.storage_service import get_local_path

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


def _resolve_overlay_position(
    frame: Image.Image,
    overlay: Image.Image,
    position: str,
    margin: int = 20,
) -> tuple[int, int]:
    if position == "top_left":
        return margin, margin
    if position == "top_right":
        return frame.width - overlay.width - margin, margin
    if position == "bottom_left":
        return margin, frame.height - overlay.height - margin
    return frame.width - overlay.width - margin, frame.height - overlay.height - margin


def _resolve_overlay_free_position(
    frame: Image.Image,
    overlay: Image.Image,
    *,
    position_x: float | None,
    position_y: float | None,
    margin: int = 20,
) -> tuple[int, int] | None:
    if position_x is None or position_y is None:
        return None
    max_x = max(frame.width - overlay.width - margin, margin)
    max_y = max(frame.height - overlay.height - margin, margin)
    available_width = max(max_x - margin, 0)
    available_height = max(max_y - margin, 0)
    x = int(round(margin + available_width * min(max(position_x, 0.0), 1.0)))
    y = int(round(margin + available_height * min(max(position_y, 0.0), 1.0)))
    return x, y


def apply_logo_to_frame(
    frame: Image.Image,
    logo_path: Path,
    position_x: float | None = None,
    position_y: float | None = None,
) -> Image.Image:
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
    position = _resolve_overlay_free_position(
        frame,
        logo,
        position_x=position_x,
        position_y=position_y,
        margin=margin,
    ) or _resolve_overlay_position(frame, logo, "bottom_right", margin)
    frame.alpha_composite(logo, dest=position)
    return frame


def apply_logo_to_video_file(
    video_path: Path,
    logo_path: Path,
    position_x: float | None = None,
    position_y: float | None = None,
) -> None:
    temp_output_path = video_path.with_name(f"{video_path.stem}.logo{video_path.suffix}")
    reader = imageio.get_reader(video_path, format="FFMPEG")
    meta = reader.get_meta_data()
    fps = meta.get("fps") or settings.VIDEO_FPS
    try:
        with imageio.get_writer(temp_output_path, fps=fps, codec="libx264", format="FFMPEG") as writer:
            for frame in reader:
                image = Image.fromarray(frame).convert("RGBA")
                watermarked = apply_logo_to_frame(image, logo_path, position_x, position_y)
                writer.append_data(np.asarray(watermarked.convert("RGB")))
    finally:
        reader.close()
    temp_output_path.replace(video_path)


def apply_avatar_to_frame(
    frame: Image.Image,
    avatar_path: Path,
    position: str,
    position_x: float | None = None,
    position_y: float | None = None,
) -> Image.Image:
    frame = frame.copy()
    with Image.open(avatar_path) as avatar_image:
        avatar = avatar_image.convert("RGBA")

    target_width = max(int(frame.width * 0.09), 1)
    scale = min(target_width / max(avatar.width, 1), 1.0)
    avatar = avatar.resize(
        (max(LocalVideoProvider._make_even(int(avatar.width * scale)), 2), max(LocalVideoProvider._make_even(int(avatar.height * scale)), 2)),
        Image.Resampling.LANCZOS,
    )
    position_xy = _resolve_overlay_free_position(
        frame,
        avatar,
        position_x=position_x,
        position_y=position_y,
    ) or _resolve_overlay_position(frame, avatar, position)
    frame.alpha_composite(avatar, dest=position_xy)
    return frame


def apply_avatar_to_video_file(
    video_path: Path,
    avatar_path: Path,
    position: str,
    position_x: float | None = None,
    position_y: float | None = None,
) -> None:
    temp_output_path = video_path.with_name(f"{video_path.stem}.avatar{video_path.suffix}")
    reader = imageio.get_reader(video_path, format="FFMPEG")
    meta = reader.get_meta_data()
    fps = meta.get("fps") or settings.VIDEO_FPS
    try:
        with imageio.get_writer(temp_output_path, fps=fps, codec="libx264", format="FFMPEG") as writer:
            for frame in reader:
                image = Image.fromarray(frame).convert("RGBA")
                with_avatar = apply_avatar_to_frame(image, avatar_path, position, position_x, position_y)
                writer.append_data(np.asarray(with_avatar.convert("RGB")))
    finally:
        reader.close()
    temp_output_path.replace(video_path)


def _load_font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _load_accent_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "Segoe Script.ttf",
        "segoesc.ttf",
        "Brush Script MT Italic.ttf",
        "BRUSHSCI.TTF",
        "Lucida Handwriting Italic.ttf",
        "LHANDW.TTF",
        "Georgia Italic.ttf",
        "georgiai.ttf",
        "Times New Roman Italic.ttf",
        "timesi.ttf",
        "DejaVuSerif-Italic.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return _load_font(size)


def _measure_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    if not text:
        return 0
    box = draw.textbbox((0, 0), text, font=font)
    return max(box[2] - box[0], 0)


def _fit_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> str:
    if _measure_text(draw, text, font) <= max_width:
        return text
    candidate = text.rstrip()
    while candidate and _measure_text(draw, f"{candidate}...", font) > max_width:
        candidate = candidate[:-1]
    return f"{candidate.rstrip()}..." if candidate else "..."


def _wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.ImageFont,
    *,
    max_width: int,
    max_lines: int = 2,
) -> list[str]:
    value = str(text or "").strip()
    if not value:
        return []

    parts = value.split()
    tokens = parts if len(parts) > 1 else list(value)
    joiner = " " if len(parts) > 1 else ""
    lines: list[str] = []
    current = ""

    for token in tokens:
        candidate = f"{current}{joiner if current else ''}{token}"
        if not current or _measure_text(draw, candidate, font) <= max_width:
            current = candidate
            continue

        lines.append(current)
        if len(lines) >= max_lines:
            lines[-1] = _fit_text(draw, lines[-1], font, max_width)
            return lines
        current = token

    if current:
        lines.append(current)

    if len(lines) > max_lines:
        lines = lines[:max_lines]

    if len(lines) == max_lines and tokens:
        consumed = joiner.join(lines).replace("...", "").strip()
        if consumed != value:
            lines[-1] = _fit_text(draw, lines[-1], font, max_width)
    return lines


def _draw_lines(
    draw: ImageDraw.ImageDraw,
    *,
    x: int,
    y: int,
    lines: list[str],
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int, int],
    line_gap: int,
) -> int:
    current_y = y
    for line in lines:
        draw.text((x, current_y), line, fill=fill, font=font)
        box = draw.textbbox((x, current_y), line, font=font)
        current_y = box[3] + line_gap
    return current_y


def _load_asset_image(asset_key: str | None) -> Image.Image | None:
    if not asset_key:
        return None
    asset_path = get_local_path(str(asset_key))
    if not asset_path.exists():
        return None
    with Image.open(asset_path) as asset_image:
        return asset_image.convert("RGBA")


def _resize_to_fit(image: Image.Image, *, max_width: int, max_height: int) -> Image.Image:
    scale = min(max_width / max(image.width, 1), max_height / max(image.height, 1), 1.0)
    return image.resize((max(int(image.width * scale), 1), max(int(image.height * scale), 1)), Image.Resampling.LANCZOS)


def _draw_contact_chips(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    *,
    start_x: int,
    start_y: int,
    max_width: int,
    entries: list[str],
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int, int],
    chip_fill: tuple[int, int, int, int],
) -> int:
    cursor_x = start_x
    cursor_y = start_y
    chip_gap = 14
    row_gap = 14

    for entry in entries:
        if not entry:
            continue
        content = _fit_text(draw, entry, font, max_width=max_width - 36)
        box = draw.textbbox((0, 0), content, font=font)
        chip_width = min(max_width, max(box[2] - box[0] + 28, 100))
        chip_height = max(box[3] - box[1] + 18, 34)
        if cursor_x + chip_width > start_x + max_width:
            cursor_x = start_x
            cursor_y += chip_height + row_gap
        draw.rounded_rectangle((cursor_x, cursor_y, cursor_x + chip_width, cursor_y + chip_height), radius=chip_height // 2, fill=chip_fill)
        draw.text((cursor_x + 14, cursor_y + 9), content, fill=fill, font=font)
        cursor_x += chip_width + chip_gap
    return cursor_y


def _draw_profile_card_clean_light(
    *,
    width: int,
    height: int,
    card_data: dict[str, Any],
) -> Image.Image:
    image = Image.new("RGBA", (width, height), (244, 247, 251, 255))
    draw = ImageDraw.Draw(image)
    panel_margin_x = max(int(width * 0.055), 48)
    panel_margin_y = max(int(height * 0.1), 54)
    panel = (panel_margin_x, panel_margin_y, width - panel_margin_x, height - panel_margin_y)
    draw.rounded_rectangle(panel, radius=34, fill=(255, 255, 255, 255))
    accent_width = max(int((panel[2] - panel[0]) * 0.28), 180)
    draw.rounded_rectangle((panel[0], panel[1], panel[0] + accent_width, panel[1] + 18), radius=18, fill=(37, 99, 235, 255))

    avatar = _load_asset_image(card_data.get("avatar_key") if card_data.get("include_avatar") else None)
    logo = _load_asset_image(card_data.get("logo_key") if card_data.get("include_logo") else None)
    title_font = _load_font(max(int(height * 0.1), 38), bold=True)
    body_font = _load_font(max(int(height * 0.048), 20))
    caption_font = _load_font(max(int(height * 0.04), 18))

    content_x = panel[0] + 48
    content_y = panel[1] + 54
    text_x = content_x
    if avatar is not None:
        avatar = _resize_to_fit(avatar, max_width=120, max_height=120)
        avatar_y = content_y + 10
        image.alpha_composite(avatar, dest=(content_x, avatar_y))
        text_x = content_x + avatar.width + 34

    if logo is not None:
        logo = _resize_to_fit(logo, max_width=max(int(width * 0.16), 110), max_height=72)
        image.alpha_composite(logo, dest=(panel[2] - logo.width - 34, panel[1] + 38))

    current_y = content_y
    if card_data.get("include_name"):
        name_lines = _wrap_text(draw, str(card_data.get("full_name") or ""), title_font, max_width=panel[2] - text_x - 48, max_lines=2)
        current_y = _draw_lines(draw, x=text_x, y=current_y, lines=name_lines, font=title_font, fill=(15, 23, 42, 255), line_gap=8)
    if card_data.get("include_brokerage_name"):
        brokerage_lines = _wrap_text(draw, str(card_data.get("brokerage_name") or ""), body_font, max_width=panel[2] - text_x - 48, max_lines=1)
        current_y = _draw_lines(draw, x=text_x, y=current_y + 4, lines=brokerage_lines, font=body_font, fill=(37, 99, 235, 255), line_gap=8)

    details: list[str] = []
    if card_data.get("include_phone"):
        details.append(str(card_data.get("phone") or ""))
    if card_data.get("include_address"):
        details.append(str(card_data.get("contact_address") or ""))
    _draw_contact_chips(
        image,
        draw,
        start_x=content_x,
        start_y=max(current_y + 28, panel[1] + 180),
        max_width=panel[2] - content_x - 40,
        entries=details,
        font=caption_font,
        fill=(51, 65, 85, 255),
        chip_fill=(239, 246, 255, 255),
    )
    return image


def _draw_profile_card_brand_dark(
    *,
    width: int,
    height: int,
    card_data: dict[str, Any],
) -> Image.Image:
    bg = (35, 37, 54, 255)
    gold = (232, 164, 44, 255)
    white = (242, 242, 244, 255)
    image = Image.new("RGBA", (width, height), bg)
    draw = ImageDraw.Draw(image)
    border_margin = max(int(width * 0.035), 28)
    draw.rectangle((border_margin, border_margin, width - border_margin, height - border_margin), outline=gold, width=5)

    avatar = _load_asset_image(card_data.get("avatar_key") if card_data.get("include_avatar") else None)
    title_font = _load_font(max(int(height * 0.11), 42), bold=True)
    subtitle_font = _load_font(max(int(height * 0.05), 21), bold=True)
    slogan_font = _load_accent_font(max(int(height * 0.05), 21))
    body_font = _load_font(max(int(height * 0.048), 19))

    content_left = border_margin + max(int(width * 0.035), 28)
    top_y = border_margin + max(int(height * 0.05), 18)
    right_limit = width - border_margin - max(int(width * 0.035), 28)
    avatar_size = max(int(width * 0.12), 86)
    avatar_slot_x = right_limit - avatar_size
    text_limit = avatar_slot_x - content_left - max(int(width * 0.04), 20)

    current_y = top_y
    if card_data.get("include_name"):
        name_lines = _wrap_text(draw, str(card_data.get("full_name") or "").upper(), title_font, max_width=text_limit, max_lines=2)
        current_y = _draw_lines(draw, x=content_left, y=current_y, lines=name_lines, font=title_font, fill=white, line_gap=6)

    brokerage_text = str(card_data.get("brokerage_name") or "").strip()
    if brokerage_text:
        brokerage = _fit_text(draw, brokerage_text.upper(), subtitle_font, max_width=text_limit)
        brokerage_box = draw.textbbox((0, 0), brokerage, font=subtitle_font)
        brokerage_y = current_y + 8
        draw.text((content_left, brokerage_y), brokerage, fill=gold, font=subtitle_font)
        current_y = brokerage_y + (brokerage_box[3] - brokerage_box[1])

    slogan_text = str(card_data.get("slogan") or "").strip()
    if avatar is not None:
        avatar = _resize_to_fit(avatar, max_width=avatar_size, max_height=avatar_size)
        avatar_frame = Image.new("RGBA", (avatar_size + 18, avatar_size + 18), (255, 255, 255, 0))
        avatar_frame_draw = ImageDraw.Draw(avatar_frame)
        avatar_frame_draw.ellipse((0, 0, avatar_frame.width - 1, avatar_frame.height - 1), outline=gold, width=3, fill=(255, 255, 255, 10))
        avatar_frame.alpha_composite(avatar, dest=((avatar_frame.width - avatar.width) // 2, (avatar_frame.height - avatar.height) // 2))
        image.alpha_composite(avatar_frame, dest=(avatar_slot_x - 9, top_y + 8))

    divider_y = height - border_margin - max(int(height * 0.25), 132)
    draw.line((content_left, divider_y, right_limit - max(int(width * 0.06), 34), divider_y), fill=gold, width=3)

    if slogan_text:
        slogan_lines = _wrap_text(
            draw,
            slogan_text,
            slogan_font,
            max_width=max(text_limit + max(int(width * 0.06), 40), text_limit),
            max_lines=2,
        )
        slogan_y = min(
            max(current_y + max(int(height * 0.075), 34), top_y + max(int(height * 0.22), 90)),
            divider_y - max(int(height * 0.12), 52),
        )
        _draw_lines(
            draw,
            x=content_left,
            y=slogan_y,
            lines=slogan_lines,
            font=slogan_font,
            fill=(233, 223, 200, 235),
            line_gap=8,
        )

    icon_size = max(int(height * 0.064), 28)
    row_gap = max(int(height * 0.032), 14)
    col_gap = max(int(width * 0.08), 60)
    left_col_x = content_left
    right_col_x = content_left + max(int(width * 0.33), 250)
    row_1_y = divider_y + max(int(height * 0.045), 18)
    row_2_y = row_1_y + icon_size + row_gap

    def draw_contact_icon(x: int, y: int, kind: str) -> None:
        draw.rectangle((x, y, x + icon_size, y + icon_size), fill=gold)
        cx = x + icon_size / 2
        cy = y + icon_size / 2
        stroke = max(icon_size // 10, 2)
        fg = bg
        if kind == "phone":
            draw.arc((x + 6, y + 6, x + icon_size - 10, y + icon_size - 2), start=120, end=240, fill=fg, width=stroke)
            draw.arc((x + 10, y + 2, x + icon_size - 6, y + icon_size - 10), start=300, end=60, fill=fg, width=stroke)
            draw.line((x + 11, y + icon_size - 10, x + 17, y + icon_size - 5), fill=fg, width=stroke)
            draw.line((x + icon_size - 17, y + 5, x + icon_size - 11, y + 10), fill=fg, width=stroke)
        elif kind == "address":
            draw.ellipse((cx - icon_size * 0.18, y + 7, cx + icon_size * 0.18, y + 7 + icon_size * 0.36), outline=fg, width=stroke)
            draw.polygon([(cx, y + icon_size - 7), (cx - icon_size * 0.18, y + icon_size * 0.5), (cx + icon_size * 0.18, y + icon_size * 0.5)], outline=fg, fill=None)
            draw.ellipse((cx - icon_size * 0.05, y + icon_size * 0.28, cx + icon_size * 0.05, y + icon_size * 0.38), fill=fg)
        elif kind == "homepage":
            draw.ellipse((x + 6, y + 6, x + icon_size - 6, y + icon_size - 6), outline=fg, width=stroke)
            draw.arc((x + 8, y + 11, x + icon_size - 8, y + icon_size - 11), start=0, end=180, fill=fg, width=max(stroke - 1, 1))
            draw.arc((x + 8, y + 11, x + icon_size - 8, y + icon_size - 11), start=180, end=360, fill=fg, width=max(stroke - 1, 1))
            draw.line((cx, y + 7, cx, y + icon_size - 7), fill=fg, width=max(stroke - 1, 1))
            draw.line((x + 9, cy, x + icon_size - 9, cy), fill=fg, width=max(stroke - 1, 1))
        else:
            draw.rectangle((x + 6, y + 10, x + icon_size - 6, y + icon_size - 10), outline=fg, width=stroke)
            draw.line((x + 6, y + 10, cx, cy + 2), fill=fg, width=max(stroke - 1, 1))
            draw.line((x + icon_size - 6, y + 10, cx, cy + 2), fill=fg, width=max(stroke - 1, 1))

    def draw_contact_item(x: int, y: int, kind: str, value: str) -> None:
        if not value.strip():
            return
        draw_contact_icon(x, y, kind)
        draw.text(
            (x + icon_size + 14, y + 2),
            _fit_text(draw, value, body_font, max_width=max(int(width * 0.26), 180)),
            fill=white,
            font=body_font,
        )

    draw_contact_item(left_col_x, row_1_y, "phone", str(card_data.get("phone") or ""))
    draw_contact_item(left_col_x, row_2_y, "address", str(card_data.get("contact_address") or ""))
    draw_contact_item(right_col_x, row_1_y, "homepage", str(card_data.get("homepage") or ""))
    draw_contact_item(right_col_x, row_2_y, "email", str(card_data.get("email") or ""))

    building_width = max(int(width * 0.2), 150)
    building_height = max(int(height * 0.34), 120)
    building_left = width - border_margin - building_width - max(int(width * 0.012), 8)
    building_bottom = height - border_margin + 1
    roof_peak_x = building_left + building_width * 0.5
    roof_peak_y = building_bottom - building_height - max(int(height * 0.02), 12)
    outline_points = [
        (building_left, building_bottom),
        (building_left, building_bottom - building_height * 0.58),
        (building_left + building_width * 0.18, building_bottom - building_height * 0.72),
        (building_left + building_width * 0.18, building_bottom - building_height * 0.88),
        (roof_peak_x, roof_peak_y),
        (building_left + building_width * 0.82, building_bottom - building_height * 0.88),
        (building_left + building_width * 0.82, building_bottom - building_height * 0.72),
        (building_left + building_width, building_bottom - building_height * 0.58),
        (building_left + building_width, building_bottom),
    ]
    draw.line(outline_points, fill=gold, width=4, joint="curve")
    for index in range(7):
        line_x = int(building_left + building_width * 0.16 + index * building_width * 0.09)
        top = int(building_bottom - building_height * (0.82 if index % 2 == 0 else 0.74))
        draw.line((line_x, building_bottom - 4, line_x, top), fill=white, width=3)

    return image


def _draw_profile_card_agent_focus(
    *,
    width: int,
    height: int,
    card_data: dict[str, Any],
) -> Image.Image:
    image = Image.new("RGBA", (width, height), (249, 250, 251, 255))
    draw = ImageDraw.Draw(image)
    outer_margin_x = max(int(width * 0.06), 52)
    outer_margin_y = max(int(height * 0.12), 58)
    card = (outer_margin_x, outer_margin_y, width - outer_margin_x, height - outer_margin_y)
    draw.rounded_rectangle(card, radius=34, fill=(255, 255, 255, 255))

    left_panel_width = max(int((card[2] - card[0]) * 0.32), 220)
    left_panel = (card[0], card[1], card[0] + left_panel_width, card[3])
    draw.rounded_rectangle(left_panel, radius=34, fill=(30, 64, 175, 255))

    avatar = _load_asset_image(card_data.get("avatar_key") if card_data.get("include_avatar") else None)
    logo = _load_asset_image(card_data.get("logo_key") if card_data.get("include_logo") else None)
    title_font = _load_font(max(int(height * 0.098), 38), bold=True)
    body_font = _load_font(max(int(height * 0.046), 20))
    caption_font = _load_font(max(int(height * 0.038), 18))

    if avatar is not None:
        avatar = _resize_to_fit(avatar, max_width=150, max_height=150)
        avatar_x = left_panel[0] + (left_panel_width - avatar.width) // 2
        avatar_y = left_panel[1] + 48
        image.alpha_composite(avatar, dest=(avatar_x, avatar_y))
        draw.text((left_panel[0] + 34, avatar_y + avatar.height + 30), "Contact your agent", fill=(219, 234, 254, 255), font=caption_font)
    else:
        draw.text((left_panel[0] + 34, left_panel[1] + 54), "Listing agent", fill=(219, 234, 254, 255), font=caption_font)

    if logo is not None:
        logo = _resize_to_fit(logo, max_width=max(int(width * 0.14), 100), max_height=68)
        image.alpha_composite(logo, dest=(card[2] - logo.width - 38, card[1] + 36))

    text_x = left_panel[2] + 40
    current_y = card[1] + 58
    if card_data.get("include_name"):
        name_lines = _wrap_text(draw, str(card_data.get("full_name") or ""), title_font, max_width=card[2] - text_x - 42, max_lines=2)
        current_y = _draw_lines(draw, x=text_x, y=current_y, lines=name_lines, font=title_font, fill=(17, 24, 39, 255), line_gap=8)
    if card_data.get("include_brokerage_name"):
        brokerage_lines = _wrap_text(draw, str(card_data.get("brokerage_name") or ""), body_font, max_width=card[2] - text_x - 42, max_lines=2)
        current_y = _draw_lines(draw, x=text_x, y=current_y + 8, lines=brokerage_lines, font=body_font, fill=(37, 99, 235, 255), line_gap=6)

    details: list[str] = []
    if card_data.get("include_phone"):
        details.append(str(card_data.get("phone") or ""))
    if card_data.get("include_address"):
        details.append(str(card_data.get("contact_address") or ""))

    section_y = current_y + 28
    for detail in details:
        detail_lines = _wrap_text(draw, detail, body_font, max_width=card[2] - text_x - 42, max_lines=2)
        detail_height = max(len(detail_lines), 1) * 34 + 26
        draw.rounded_rectangle((text_x, section_y, card[2] - 36, section_y + detail_height), radius=24, fill=(241, 245, 249, 255))
        section_y = _draw_lines(draw, x=text_x + 18, y=section_y + 14, lines=detail_lines, font=body_font, fill=(51, 65, 85, 255), line_gap=6) + 14
    return image


def _get_video_canvas_size(resolution: str, aspect_ratio: str) -> tuple[int, int]:
    base = RESOLUTION_BASE[resolution]
    ratio_width, ratio_height = ASPECT_RATIO_MAP["16:9" if aspect_ratio == "adaptive" else aspect_ratio]
    if ratio_width >= ratio_height:
        height = base
        width = int(base * ratio_width / ratio_height)
    else:
        width = base
        height = int(base * ratio_height / ratio_width)
    return LocalVideoProvider._make_macroblock(width), LocalVideoProvider._make_macroblock(height)


def _draw_profile_card_frame(
    *,
    width: int,
    height: int,
    card_data: dict[str, Any],
) -> Image.Image:
    template_key = str(card_data.get("template_key") or "clean_light")
    if template_key == "brand_dark":
        return _draw_profile_card_brand_dark(width=width, height=height, card_data=card_data)
    if template_key == "agent_focus":
        return _draw_profile_card_agent_focus(width=width, height=height, card_data=card_data)
    return _draw_profile_card_clean_light(width=width, height=height, card_data=card_data)


def create_profile_card_video(
    *,
    output_path: Path,
    card_data: dict[str, Any],
    resolution: str,
    aspect_ratio: str,
    fps: int,
    duration_seconds: int = 2,
) -> None:
    width, height = _get_video_canvas_size(resolution, aspect_ratio)
    frame = _draw_profile_card_frame(width=width, height=height, card_data=card_data)
    frame_count = max(duration_seconds * fps, 1)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with imageio.get_writer(output_path, fps=fps, codec="libx264", format="FFMPEG") as writer:
        rgb_frame = np.asarray(frame.convert("RGB"))
        for _ in range(frame_count):
            writer.append_data(rgb_frame)


def render_profile_card_preview_bytes(
    *,
    card_data: dict[str, Any],
    resolution: str = "1080p",
    aspect_ratio: str = "16:9",
) -> bytes:
    width, height = _get_video_canvas_size(resolution, aspect_ratio)
    frame = _draw_profile_card_frame(width=width, height=height, card_data=card_data)
    output = BytesIO()
    frame.save(output, format="PNG")
    return output.getvalue()
