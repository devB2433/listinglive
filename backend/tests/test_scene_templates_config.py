import unittest

from backend.core.scene_templates import (
    SCENE_TEMPLATE_PROPERTY_TYPE_APARTMENT_RENTAL,
    SCENE_TEMPLATE_PROPERTY_TYPE_LUXURY_HOME,
    SCENE_TEMPLATE_PROPERTY_TYPE_STANDARD_HOME,
    load_scene_templates,
    validate_scene_template_property_type,
)


class SceneTemplateConfigTests(unittest.TestCase):
    def test_load_scene_templates_includes_property_types(self) -> None:
        templates = load_scene_templates()

        self.assertGreater(len(templates), 0)
        for template in templates:
            self.assertGreater(len(template.property_types), 0)
            self.assertTrue(
                set(template.property_types).issubset(
                    {
                        SCENE_TEMPLATE_PROPERTY_TYPE_STANDARD_HOME,
                        SCENE_TEMPLATE_PROPERTY_TYPE_LUXURY_HOME,
                        SCENE_TEMPLATE_PROPERTY_TYPE_APARTMENT_RENTAL,
                    }
                )
            )

    def test_validate_scene_template_property_type_rejects_unknown_value(self) -> None:
        with self.assertRaises(ValueError):
            validate_scene_template_property_type("unknown")


if __name__ == "__main__":
    unittest.main()
