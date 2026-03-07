import unittest
from types import SimpleNamespace
from uuid import uuid4

from backend.services.entitlement_service import PermissionDeniedError
from backend.services.video_service import resolve_long_video_segments
from backend.schemas.video import LongVideoSegmentInput


class LongVideoAdvancedTests(unittest.TestCase):
    def test_resolve_segments_allows_advanced_reorder_and_overrides(self) -> None:
        template_a = uuid4()
        template_b = uuid4()
        template_c = uuid4()
        access_context = SimpleNamespace(
            capabilities=(
                "merge_per_image_template",
                "merge_per_segment_duration",
                "merge_drag_reorder",
            )
        )

        segments = resolve_long_video_segments(
            image_keys=["a", "b", "c"],
            scene_template_id=template_a,
            duration_seconds=4,
            segments=[
                LongVideoSegmentInput(image_key="c", scene_template_id=template_c, duration_seconds=6, sort_order=2),
                LongVideoSegmentInput(image_key="a", scene_template_id=template_a, duration_seconds=4, sort_order=1),
                LongVideoSegmentInput(image_key="b", scene_template_id=template_b, duration_seconds=5, sort_order=0),
            ],
            access_context=access_context,
        )

        self.assertEqual([segment.image_key for segment in segments], ["b", "a", "c"])
        self.assertEqual([segment.sort_order for segment in segments], [0, 1, 2])
        self.assertEqual([segment.duration_seconds for segment in segments], [5, 4, 6])

    def test_resolve_segments_blocks_per_image_template_without_capability(self) -> None:
        template_a = uuid4()
        template_b = uuid4()
        access_context = SimpleNamespace(capabilities=("merge_per_segment_duration", "merge_drag_reorder"))

        with self.assertRaises(PermissionDeniedError) as context:
            resolve_long_video_segments(
                image_keys=["a", "b"],
                scene_template_id=template_a,
                duration_seconds=4,
                segments=[
                    LongVideoSegmentInput(image_key="a", scene_template_id=template_a, duration_seconds=4, sort_order=0),
                    LongVideoSegmentInput(image_key="b", scene_template_id=template_b, duration_seconds=4, sort_order=1),
                ],
                access_context=access_context,
            )

        self.assertEqual(context.exception.code, "videos.long.perImageTemplateDenied")

    def test_resolve_segments_blocks_per_segment_duration_without_capability(self) -> None:
        template_a = uuid4()
        access_context = SimpleNamespace(capabilities=("merge_per_image_template", "merge_drag_reorder"))

        with self.assertRaises(PermissionDeniedError) as context:
            resolve_long_video_segments(
                image_keys=["a", "b"],
                scene_template_id=template_a,
                duration_seconds=4,
                segments=[
                    LongVideoSegmentInput(image_key="a", scene_template_id=template_a, duration_seconds=4, sort_order=0),
                    LongVideoSegmentInput(image_key="b", scene_template_id=template_a, duration_seconds=6, sort_order=1),
                ],
                access_context=access_context,
            )

        self.assertEqual(context.exception.code, "videos.long.perSegmentDurationDenied")

    def test_resolve_segments_blocks_reorder_without_capability(self) -> None:
        template_a = uuid4()
        access_context = SimpleNamespace(capabilities=("merge_per_image_template", "merge_per_segment_duration"))

        with self.assertRaises(PermissionDeniedError) as context:
            resolve_long_video_segments(
                image_keys=["a", "b"],
                scene_template_id=template_a,
                duration_seconds=4,
                segments=[
                    LongVideoSegmentInput(image_key="b", scene_template_id=template_a, duration_seconds=4, sort_order=0),
                    LongVideoSegmentInput(image_key="a", scene_template_id=template_a, duration_seconds=4, sort_order=1),
                ],
                access_context=access_context,
            )

        self.assertEqual(context.exception.code, "videos.long.dragReorderDenied")


if __name__ == "__main__":
    unittest.main()
