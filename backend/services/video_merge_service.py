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
    transition_frames: int = 8,
) -> None:
    if len(segment_paths) < 2:
        raise ValueError("长视频至少需要 2 个片段")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    frames = _load_segment_frames(segment_paths)
    transition_frames = max(1, transition_frames)

    with imageio.get_writer(output_path, fps=fps, codec="libx264", format="FFMPEG") as writer:
        for index, segment_frames in enumerate(frames):
            if index == 0:
                for frame in segment_frames[:-transition_frames]:
                    writer.append_data(frame)
                continue

            previous_tail = frames[index - 1][-transition_frames:]
            current_head = segment_frames[:transition_frames]
            for previous_frame, current_frame in zip(previous_tail, current_head):
                writer.append_data(_blend_frames(previous_frame, current_frame))

            remaining_frames = segment_frames[transition_frames:-transition_frames] if index < len(frames) - 1 else segment_frames[transition_frames:]
            for frame in remaining_frames:
                writer.append_data(frame)


def _load_segment_frames(segment_paths: list[Path]) -> list[list[np.ndarray]]:
    all_frames: list[list[np.ndarray]] = []
    expected_size: tuple[int, int] | None = None

    for path in segment_paths:
        if not path.exists():
            raise FileNotFoundError(f"片段文件不存在: {path}")
        reader = imageio.get_reader(path, format="FFMPEG")
        frames = [frame for frame in reader]
        reader.close()
        if not frames:
            raise ValueError(f"片段为空: {path}")

        if expected_size is None:
            expected_size = (frames[0].shape[1], frames[0].shape[0])
        normalized = [_normalize_frame_size(frame, expected_size) for frame in frames]
        all_frames.append(normalized)

    return all_frames


def _normalize_frame_size(frame: np.ndarray, expected_size: tuple[int, int]) -> np.ndarray:
    width, height = expected_size
    if frame.shape[1] == width and frame.shape[0] == height:
        return frame
    image = Image.fromarray(frame)
    resized = image.resize((width, height), Image.Resampling.LANCZOS)
    return np.asarray(resized)


def _blend_frames(previous_frame: np.ndarray, current_frame: np.ndarray) -> np.ndarray:
    alpha = 0.5
    blended = previous_frame.astype(np.float32) * (1 - alpha) + current_frame.astype(np.float32) * alpha
    return blended.astype(np.uint8)
