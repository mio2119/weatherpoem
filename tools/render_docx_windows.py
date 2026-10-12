"""Run the bundled DOCX renderer with Windows-safe LibreOffice arguments."""

import importlib.util
import os
from pathlib import Path
import shutil
import sys


DEFAULT_DOCUMENTS_CACHE_ROOT = (
    Path.home()
    / ".codex"
    / "plugins"
    / "cache"
    / "openai-primary-runtime"
    / "documents"
)
DEFAULT_POPPLER_BIN = Path(
    "C:/Users/zzh/.cache/codex-runtimes/codex-primary-runtime/"
    "dependencies/native/poppler/Library/bin"
)
PROFILE_PREFIX = "-env:UserInstallation=file://"


def find_soffice_console():
    override = os.environ.get("WEATHERPOEM_SOFFICE_CONSOLE")
    candidates = [
        override,
        shutil.which("soffice.com"),
        (
            Path(os.environ.get("ProgramFiles", "C:/Program Files"))
            / "LibreOffice"
            / "program"
            / "soffice.com"
        ),
        (
            Path(
                os.environ.get(
                    "ProgramFiles(x86)",
                    "C:/Program Files (x86)",
                )
            )
            / "LibreOffice"
            / "program"
            / "soffice.com"
        ),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate))
    raise FileNotFoundError(
        "LibreOffice console launcher soffice.com was not found."
    )


def normalize_soffice_command(command, soffice_console=None):
    normalized = list(command)
    if not normalized or normalized[0].lower() != "soffice":
        return normalized
    normalized[0] = soffice_console or find_soffice_console()
    for index, argument in enumerate(normalized):
        if argument.startswith(PROFILE_PREFIX):
            profile_path = argument[len(PROFILE_PREFIX) :]
            normalized[index] = (
                "-env:UserInstallation="
                + Path(profile_path).resolve().as_uri()
            )
    return normalized


def prepend_tool_directory(directory, current_path):
    if not current_path:
        return str(directory)
    return str(directory) + os.pathsep + current_path


def renderer_version_key(renderer_path, cache_root):
    version = renderer_path.relative_to(cache_root).parts[0]
    try:
        return tuple(int(part) for part in version.split("."))
    except ValueError:
        return (-1,)


def resolve_renderer_path(override=None, cache_root=None):
    explicit = override or os.environ.get(
        "WEATHERPOEM_DOCUMENTS_RENDERER",
    )
    if explicit:
        return Path(explicit)
    root = Path(cache_root or DEFAULT_DOCUMENTS_CACHE_ROOT)
    candidates = [
        path
        for path in root.glob(
            "*/skills/documents/render_docx.py",
        )
        if renderer_version_key(path, root) != (-1,)
    ]
    if not candidates:
        raise FileNotFoundError(
            "Bundled DOCX renderer was not found under "
            f"the documents cache: {root}"
        )
    return max(
        candidates,
        key=lambda path: renderer_version_key(path, root),
    )


def load_renderer():
    renderer_path = resolve_renderer_path()
    if not renderer_path.is_file():
        raise FileNotFoundError(
            f"Bundled DOCX renderer was not found: {renderer_path}"
        )
    spec = importlib.util.spec_from_file_location(
        "weatherpoem_bundled_render_docx",
        renderer_path,
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    if not DEFAULT_POPPLER_BIN.is_dir():
        raise FileNotFoundError(
            f"Bundled Poppler directory was not found: {DEFAULT_POPPLER_BIN}"
        )
    os.environ["PATH"] = prepend_tool_directory(
        DEFAULT_POPPLER_BIN,
        os.environ.get("PATH", ""),
    )
    renderer = load_renderer()
    original_run_cmd = renderer._run_cmd

    def run_cmd(command, env, verbose):
        return original_run_cmd(
            normalize_soffice_command(command),
            env,
            verbose,
        )

    renderer._run_cmd = run_cmd
    renderer.main()


if __name__ == "__main__":
    main()
