"""
场景模板配置加载
"""
import json
from dataclasses import dataclass

from backend.core.config import settings


@dataclass(frozen=True)
class SceneTemplateConfig:
    template_key: str
    category: str
    name: str
    prompt: str
    sort_order: int
    is_enabled: bool = True


SCENE_TEMPLATE_CATEGORY_SHORT = "short"
SCENE_TEMPLATE_CATEGORY_LONG_UNIFIED = "long_unified"
_VALID_TEMPLATE_CATEGORIES = {
    SCENE_TEMPLATE_CATEGORY_SHORT,
    SCENE_TEMPLATE_CATEGORY_LONG_UNIFIED,
}


def load_scene_templates() -> tuple[SceneTemplateConfig, ...]:
    path = settings.SCENE_TEMPLATE_CONFIG_FILE
    if not path.exists():
        raise FileNotFoundError(f"Scene template config not found: {path}")

    raw_payload = json.loads(path.read_text(encoding="utf-8"))
    template_payloads = raw_payload.get("templates") if isinstance(raw_payload, dict) else raw_payload
    if not isinstance(template_payloads, list):
        raise ValueError(f"Invalid scene template config format: {path}")

    items: list[SceneTemplateConfig] = []
    for index, payload in enumerate(template_payloads):
        if not isinstance(payload, dict):
            raise ValueError(f"Scene template entry at index {index} must be an object")
        category = str(payload["category"])
        if category not in _VALID_TEMPLATE_CATEGORIES:
            raise ValueError(f"Unsupported scene template category '{category}' in {path}")
        items.append(
            SceneTemplateConfig(
                template_key=str(payload["template_key"]),
                category=category,
                name=str(payload["name"]),
                prompt=str(payload["prompt"]),
                sort_order=int(payload["sort_order"]),
                is_enabled=bool(payload.get("is_enabled", True)),
            )
        )
    return tuple(items)
