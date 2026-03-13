import base64
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image

from backend.services.video_provider import (
    _draw_profile_card_frame,
    ArkRequestBuilder,
    ArkRestTransport,
    ArkSdkTransport,
    DataUrlArkInputResolver,
    apply_avatar_to_frame,
    apply_logo_to_frame,
    render_profile_card_preview_bytes,
)


class VideoProviderTests(unittest.TestCase):
    def test_data_url_input_resolver_uses_local_file_content(self) -> None:
        resolver = DataUrlArkInputResolver()
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "sample.png"
            Image.new("RGB", (400, 400), color=(12, 34, 56)).save(image_path)

            data_url = resolver._build_image_reference_url(image_path)

        prefix, encoded = data_url.split(",", 1)
        self.assertEqual(prefix, "data:image/png;base64")
        self.assertTrue(base64.b64decode(encoded))

    def test_data_url_input_resolver_rejects_images_that_are_too_small(self) -> None:
        resolver = DataUrlArkInputResolver()
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "tiny.png"
            Image.new("RGB", (64, 64), color=(12, 34, 56)).save(image_path)

            with self.assertRaises(ValueError) as context:
                resolver._build_image_reference_url(image_path)

        self.assertIn("300px", str(context.exception))

    def test_sdk_transport_snapshot_reads_official_fields(self) -> None:
        transport = ArkSdkTransport(api_key="test", base_url="https://example.com/api/v3", timeout_seconds=60)
        task = SimpleNamespace(
            id="cgt-123",
            status="succeeded",
            content=SimpleNamespace(video_url="https://example.com/video.mp4", file_url=None),
            error=None,
        )

        snapshot = transport._snapshot_from_sdk_task(task)

        self.assertEqual(snapshot.status, "succeeded")
        self.assertEqual(snapshot.video_url, "https://example.com/video.mp4")
        self.assertEqual(snapshot.provider_task_ids, {"provider_task_id": "cgt-123"})

    def test_rest_transport_snapshot_reads_official_fields(self) -> None:
        transport = ArkRestTransport(api_key="test", base_url="https://example.com/api/v3", timeout_seconds=60)

        snapshot = transport._snapshot_from_payload(
            {
                "id": "cgt-456",
                "status": "failed",
                "error": {"message": "capacity busy"},
                "content": {"file_url": "https://example.com/video.mp4"},
            }
        )

        self.assertEqual(snapshot.status, "failed")
        self.assertEqual(snapshot.video_url, "https://example.com/video.mp4")
        self.assertEqual(snapshot.error_message, "capacity busy")

    def test_request_builder_prompt_flags_style_embeds_control_flags(self) -> None:
        builder = ArkRequestBuilder()

        request = builder.build_request(
            model="ep-test",
            prompt="请以这张照片为基础，缓慢推进镜头",
            image_reference_url="https://example.com/sample.png",
            resolution="1080p",
            aspect_ratio="16:9",
            duration_seconds=5,
            request_style="prompt_flags",
            camera_fixed=False,
            watermark=False,
        )

        self.assertEqual(request.model, "ep-test")
        self.assertIsNone(request.resolution)
        self.assertIn("--resolution 1080p", request.content[0]["text"])
        self.assertIn("--duration 5", request.content[0]["text"])
        self.assertIn("--ratio 16:9", request.content[0]["text"])

    def test_apply_logo_to_frame_overlays_bottom_right_pixels(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            logo_path = Path(temp_dir) / "logo.png"
            Image.new("RGBA", (20, 20), color=(255, 0, 0, 255)).save(logo_path)
            frame = Image.fromarray(np.full((200, 200, 4), fill_value=255, dtype=np.uint8), mode="RGBA")

            result = apply_logo_to_frame(frame, logo_path)

        self.assertEqual(result.size, frame.size)
        self.assertNotEqual(result.getpixel((170, 170)), (255, 255, 255, 255))

    def test_apply_avatar_to_frame_uses_smaller_corner_overlay(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            avatar_path = Path(temp_dir) / "avatar.png"
            Image.new("RGBA", (100, 100), color=(255, 0, 0, 255)).save(avatar_path)
            frame = Image.fromarray(np.full((200, 200, 4), fill_value=255, dtype=np.uint8), mode="RGBA")

            result = apply_avatar_to_frame(frame, avatar_path, "bottom_right")

        self.assertEqual(result.size, frame.size)
        self.assertEqual(result.getpixel((145, 145)), (255, 255, 255, 255))
        self.assertNotEqual(result.getpixel((170, 170)), (255, 255, 255, 255))

    def test_profile_card_templates_render_distinct_outputs(self) -> None:
        base_card_data = {
            "template_key": "clean_light",
            "full_name": "Alex Agent",
            "phone": "123-456-7890",
            "contact_address": "123 Main Street, Toronto",
            "brokerage_name": "ListingLive Realty",
            "include_name": True,
            "include_phone": True,
            "include_address": True,
            "include_brokerage_name": True,
            "include_avatar": False,
            "include_logo": False,
        }

        clean = _draw_profile_card_frame(width=640, height=360, card_data=base_card_data)
        dark = _draw_profile_card_frame(width=640, height=360, card_data={**base_card_data, "template_key": "brand_dark"})
        focus = _draw_profile_card_frame(width=640, height=360, card_data={**base_card_data, "template_key": "agent_focus"})

        self.assertEqual(clean.size, (640, 360))
        self.assertEqual(dark.size, (640, 360))
        self.assertEqual(focus.size, (640, 360))
        self.assertNotEqual(clean.getpixel((20, 20)), dark.getpixel((20, 20)))
        self.assertNotEqual(clean.getpixel((20, 20)), focus.getpixel((20, 20)))

    def test_profile_card_preview_bytes_returns_png_image(self) -> None:
        png_bytes = render_profile_card_preview_bytes(
            card_data={
                "template_key": "brand_dark",
                "full_name": "Alex Agent",
                "phone": "123-456-7890",
                "contact_address": "123 Main Street, Toronto",
                "brokerage_name": "ListingLive Realty",
                "include_name": True,
                "include_phone": True,
                "include_address": True,
                "include_brokerage_name": True,
                "include_avatar": False,
                "include_logo": False,
            }
        )

        self.assertTrue(png_bytes.startswith(b"\x89PNG"))
        with Image.open(BytesIO(png_bytes)) as image:
            self.assertEqual(image.size, (1920, 1088))


if __name__ == "__main__":
    unittest.main()
