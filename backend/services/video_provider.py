"""
视频生成 provider 抽象
"""
import asyncio
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image

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


class VideoProvider(ABC):
    provider_name: str

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


class LocalVideoProvider(VideoProvider):
    provider_name = "local"

    def __init__(self) -> None:
        self.fps = settings.VIDEO_FPS

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
                    frame = self._apply_logo(frame, logo_path)
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

    def _apply_logo(self, frame: Image.Image, logo_path: Path) -> Image.Image:
        frame = frame.copy()
        with Image.open(logo_path) as logo_image:
            logo = logo_image.convert("RGBA")

        target_width = max(int(frame.width * 0.15), 1)
        scale = min(target_width / max(logo.width, 1), 1.0)
        logo = logo.resize(
            (max(self._make_even(int(logo.width * scale)), 2), max(self._make_even(int(logo.height * scale)), 2)),
            Image.Resampling.LANCZOS,
        )
        alpha = logo.getchannel("A")
        alpha = alpha.point(lambda value: int(value * 0.7))
        logo.putalpha(alpha)

        margin = 20
        position = (frame.width - logo.width - margin, frame.height - logo.height - margin)
        frame.alpha_composite(logo, dest=position)
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


class SeedanceVideoProvider(VideoProvider):
    provider_name = "seedance"

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
        # Reminder: when the real Seedance client is integrated, do not expose
        # the provider's finished-video URL directly to users. The backend must
        # first download the generated video into our own storage and then serve
        # it through the existing task download API.
        raise RuntimeError("当前仓库还未接入正式 Seedance 客户端，请先使用 VIDEO_PROVIDER=local")


def get_video_provider() -> VideoProvider:
    if settings.VIDEO_PROVIDER == "local":
        return LocalVideoProvider()
    if settings.VIDEO_PROVIDER == "seedance":
        return SeedanceVideoProvider()
    raise RuntimeError(f"暂不支持的视频 provider: {settings.VIDEO_PROVIDER}")
