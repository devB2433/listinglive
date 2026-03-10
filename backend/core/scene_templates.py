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
    property_types: tuple[str, ...]
    sort_order: int
    is_enabled: bool = True


SCENE_TEMPLATE_CATEGORY_SHORT = "short"
SCENE_TEMPLATE_CATEGORY_LONG_UNIFIED = "long_unified"
SCENE_TEMPLATE_PROPERTY_TYPE_STANDARD_HOME = "standard_home"
SCENE_TEMPLATE_PROPERTY_TYPE_LUXURY_HOME = "luxury_home"
SCENE_TEMPLATE_PROPERTY_TYPE_APARTMENT_RENTAL = "apartment_rental"
_VALID_TEMPLATE_CATEGORIES = {
    SCENE_TEMPLATE_CATEGORY_SHORT,
    SCENE_TEMPLATE_CATEGORY_LONG_UNIFIED,
}
_VALID_TEMPLATE_PROPERTY_TYPES = {
    SCENE_TEMPLATE_PROPERTY_TYPE_STANDARD_HOME,
    SCENE_TEMPLATE_PROPERTY_TYPE_LUXURY_HOME,
    SCENE_TEMPLATE_PROPERTY_TYPE_APARTMENT_RENTAL,
}


def normalize_scene_template_property_type(property_type: str) -> str:
    return property_type.strip().lower()


def validate_scene_template_property_type(property_type: str) -> str:
    normalized = normalize_scene_template_property_type(property_type)
    if normalized not in _VALID_TEMPLATE_PROPERTY_TYPES:
        raise ValueError(f"Unsupported scene template property type '{property_type}'")
    return normalized


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
        raw_property_types = payload.get("property_type")
        if not isinstance(raw_property_types, list) or not raw_property_types:
            raise ValueError(f"Scene template entry '{payload.get('template_key', index)}' must define a non-empty property_type list")
        property_types = tuple(
            dict.fromkeys(validate_scene_template_property_type(str(item)) for item in raw_property_types)
        )
        items.append(
            SceneTemplateConfig(
                template_key=str(payload["template_key"]),
                category=category,
                name=str(payload["name"]),
                prompt=str(payload["prompt"]),
                property_types=property_types,
                sort_order=int(payload["sort_order"]),
                is_enabled=bool(payload.get("is_enabled", True)),
            )
        )
    return tuple(items)
