import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.core.ai_provider_config import VideoProviderConfig, load_video_provider_config
from backend.services.video_provider import LocalVideoProvider, SeedanceVideoProvider, get_video_provider


class AiProviderConfigTests(unittest.TestCase):
    def test_load_video_provider_config_reads_toml_with_comments(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "ai_provider.toml"
            config_path.write_text(
                "\n".join(
                    [
                        "# comment",
                        "[video]",
                        'provider = "seedance"',
                        'base_url = "https://example.com/api/v3"',
                        'api_key = "key-123"',
                        'model_id = "ep-123"',
                        'transport = "rest"',
                        'request_style = "prompt_flags"',
                        "camera_fixed = false",
                        "watermark = false",
                        "timeout_seconds = 61",
                        "download_timeout_seconds = 301",
                        "",
                    ]
                ),
                encoding="utf-8",
            )

            config = load_video_provider_config(config_path)

        self.assertEqual(config.provider, "seedance")
        self.assertEqual(config.base_url, "https://example.com/api/v3")
        self.assertEqual(config.api_key, "key-123")
        self.assertEqual(config.model_id, "ep-123")
        self.assertEqual(config.transport, "rest")
        self.assertEqual(config.request_style, "prompt_flags")
        self.assertEqual(config.timeout_seconds, 61)
        self.assertEqual(config.download_timeout_seconds, 301)

    def test_load_video_provider_config_rejects_missing_required_remote_field(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "ai_provider.toml"
            config_path.write_text(
                "\n".join(
                    [
                        "[video]",
                        'provider = "seedance"',
                        'base_url = "https://example.com/api/v3"',
                        'model_id = "ep-123"',
                        "",
                    ]
                ),
                encoding="utf-8",
            )

            with self.assertRaises(RuntimeError) as context:
                load_video_provider_config(config_path)

        self.assertIn("video.api_key", str(context.exception))

    def test_load_video_provider_config_allows_local_provider_without_remote_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "ai_provider.toml"
            config_path.write_text(
                "\n".join(
                    [
                        "[video]",
                        'provider = "local"',
                        "",
                    ]
                ),
                encoding="utf-8",
            )

            config = load_video_provider_config(config_path)

        self.assertEqual(config.provider, "local")
        self.assertIsNone(config.api_key)
        self.assertIsNone(config.model_id)

    def test_get_video_provider_uses_unified_provider_config(self) -> None:
        with patch(
            "backend.services.video_provider.get_video_provider_config",
            return_value=VideoProviderConfig(
                provider="local",
                base_url=None,
                api_key=None,
                model_id=None,
            ),
        ):
            provider = get_video_provider()

        self.assertIsInstance(provider, LocalVideoProvider)

        with patch(
            "backend.services.video_provider.get_video_provider_config",
            return_value=VideoProviderConfig(
                provider="seedance",
                base_url="https://example.com/api/v3",
                api_key="key-123",
                model_id="ep-123",
                transport="rest",
            ),
        ):
            provider = get_video_provider()

        self.assertIsInstance(provider, SeedanceVideoProvider)


if __name__ == "__main__":
    unittest.main()
