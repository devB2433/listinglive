"""
转场效果配置加载
"""
import json
from dataclasses import dataclass

from backend.core.config import settings


@dataclass(frozen=True)
class TransitionEffectConfig:
    effect_key: str
    name: str
    prompt: str
    sort_order: int
    is_enabled: bool = True


def load_transition_effects() -> tuple[TransitionEffectConfig, ...]:
    path = settings.TRANSITION_EFFECT_CONFIG_FILE
    if not path.exists():
        raise FileNotFoundError(f"Transition effect config not found: {path}")

    raw_payload = json.loads(path.read_text(encoding="utf-8"))
    effect_payloads = raw_payload.get("effects") if isinstance(raw_payload, dict) else raw_payload
    if not isinstance(effect_payloads, list):
        raise ValueError(f"Invalid transition effect config format: {path}")

    items: list[TransitionEffectConfig] = []
    for index, payload in enumerate(effect_payloads):
        if not isinstance(payload, dict):
            raise ValueError(f"Transition effect entry at index {index} must be an object")
        items.append(
            TransitionEffectConfig(
                effect_key=str(payload["effect_key"]),
                name=str(payload["name"]),
                prompt=str(payload["prompt"]),
                sort_order=int(payload["sort_order"]),
                is_enabled=bool(payload.get("is_enabled", True)),
            )
        )
    return tuple(items)
