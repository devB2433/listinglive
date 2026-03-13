"""
长视频片段合并服务
"""
from pathlib import Path

import imageio.v2 as imageio
import numpy as np
from PIL import Image


def merge_segment_videos(
    segment_paths: list[Path],
    output_path: Path,
    *,
    fps: int,
) -> None:
    if len(segment_paths) < 2:
        raise ValueError("长视频至少需要 2 个片段")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    expected_size: tuple[int, int] | None = None
    with imageio.get_writer(output_path, fps=fps, codec="libx264", format="FFMPEG") as writer:
        for path in segment_paths:
            if not path.exists():
                raise FileNotFoundError(f"片段文件不存在: {path}")
            reader = imageio.get_reader(path, format="FFMPEG")
            try:
                has_frames = False
                for frame in reader:
                    has_frames = True
                    if expected_size is None:
                        expected_size = (frame.shape[1], frame.shape[0])
                    writer.append_data(_normalize_frame_size(frame, expected_size))
                if not has_frames:
                    raise ValueError(f"片段为空: {path}")
            finally:
                reader.close()


def _normalize_frame_size(frame: np.ndarray, expected_size: tuple[int, int]) -> np.ndarray:
    width, height = expected_size
    if frame.shape[1] == width and frame.shape[0] == height:
        return frame
    image = Image.fromarray(frame)
    resized = image.resize((width, height), Image.Resampling.LANCZOS)
    return np.asarray(resized)
