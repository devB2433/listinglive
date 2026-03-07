import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import imageio.v2 as imageio
import numpy as np

from backend.services.video_merge_service import merge_segment_videos
from backend.services.video_service import get_segment_progress


class LongVideoHelperTests(unittest.TestCase):
    def test_get_segment_progress_for_long_task(self) -> None:
        task = SimpleNamespace(
            task_type="long",
            image_keys=["a", "b", "c"],
            provider_task_ids={"completed_segments": 2},
            status="processing",
        )

        segment_count, completed_segments = get_segment_progress(task)
        self.assertEqual(segment_count, 3)
        self.assertEqual(completed_segments, 2)

    def test_merge_segment_videos_outputs_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            first = temp_path / "first.mp4"
            second = temp_path / "second.mp4"
            output = temp_path / "merged.mp4"

            self._write_segment(first, (255, 0, 0))
            self._write_segment(second, (0, 0, 255))

            merge_segment_videos([first, second], output, fps=8)

            self.assertTrue(output.exists())
            reader = imageio.get_reader(output, format="FFMPEG")
            first_frame = reader.get_data(0)
            reader.close()
            self.assertEqual(first_frame.shape[0], 64)
            self.assertEqual(first_frame.shape[1], 64)

    @staticmethod
    def _write_segment(path: Path, color: tuple[int, int, int]) -> None:
        frames = [np.full((64, 64, 3), color, dtype=np.uint8) for _ in range(8)]
        with imageio.get_writer(path, fps=8, codec="libx264", format="FFMPEG") as writer:
            for frame in frames:
                writer.append_data(frame)


if __name__ == "__main__":
    unittest.main()
