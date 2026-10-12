import importlib.util
import os
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("render_docx_windows.py")


def load_adapter():
    if not MODULE_PATH.is_file():
        return None
    spec = importlib.util.spec_from_file_location(
        "weatherpoem_render_docx_windows",
        MODULE_PATH,
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RenderDocxWindowsTests(unittest.TestCase):
    def test_soffice_command_uses_console_binary_and_valid_file_uri(self):
        adapter = load_adapter()
        self.assertIsNotNone(
            adapter,
            "Windows DOCX renderer adapter is missing",
        )
        command = adapter.normalize_soffice_command(
            [
                "soffice",
                (
                    "-env:UserInstallation=file://"
                    "C:\\Users\\tester\\AppData\\Local\\Temp\\profile"
                ),
                "--headless",
            ],
            soffice_console=(
                "C:\\Program Files\\LibreOffice\\program\\soffice.com"
            ),
        )
        self.assertEqual(
            command,
            [
                "C:\\Program Files\\LibreOffice\\program\\soffice.com",
                (
                    "-env:UserInstallation="
                    "file:///C:/Users/tester/AppData/Local/Temp/profile"
                ),
                "--headless",
            ],
        )

    def test_poppler_executable_directory_is_prepended_to_path(self):
        adapter = load_adapter()
        self.assertTrue(
            hasattr(adapter, "prepend_tool_directory"),
            "Poppler PATH adapter is missing",
        )
        value = adapter.prepend_tool_directory(
            "C:\\runtime\\poppler\\Library\\bin",
            "C:\\Windows\\System32",
        )
        self.assertEqual(
            value,
            (
                "C:\\runtime\\poppler\\Library\\bin"
                + os.pathsep
                + "C:\\Windows\\System32"
            ),
        )

    def test_latest_bundled_renderer_is_discovered_without_version_pin(self):
        adapter = load_adapter()
        with tempfile.TemporaryDirectory() as temporary_directory:
            cache_root = Path(temporary_directory)
            old_renderer = (
                cache_root
                / "26.715.12143"
                / "skills"
                / "documents"
                / "render_docx.py"
            )
            current_renderer = (
                cache_root
                / "26.723.12215"
                / "skills"
                / "documents"
                / "render_docx.py"
            )
            old_renderer.parent.mkdir(parents=True)
            current_renderer.parent.mkdir(parents=True)
            old_renderer.touch()
            current_renderer.touch()

            resolved = adapter.resolve_renderer_path(
                cache_root=cache_root,
            )

            self.assertEqual(resolved, current_renderer)

    def test_explicit_renderer_override_has_priority(self):
        adapter = load_adapter()
        override = Path("C:/runtime/documents/render_docx.py")
        self.assertEqual(
            adapter.resolve_renderer_path(
                override=override,
                cache_root=Path("C:/unused"),
            ),
            override,
        )


if __name__ == "__main__":
    unittest.main()
