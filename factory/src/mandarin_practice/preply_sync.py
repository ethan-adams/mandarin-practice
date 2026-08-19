from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse

from mandarin_practice.ingest import ingest_lessons


PREPLY_HOME_URL = "https://preply.com/en/home"
APP_DATA_DIR = Path.home() / ".local" / "share" / "mandarin-practice"
DEFAULT_PREPLY_PROFILE_DIR = APP_DATA_DIR / "preply-browser-profile"
DEFAULT_PREPLY_STAGING_DIR = APP_DATA_DIR / "preply-downloads"


@dataclass(frozen=True)
class PreplyMaterial:
    url: str
    filename: str
    path: Path | None = None


class PlaywrightPreplyBrowser:
    def sync(
        self,
        *,
        profile_dir: Path,
        staging_dir: Path,
        start_url: str,
        dry_run: bool,
        limit: int = 0,
        timeout_ms: int = 30_000,
    ) -> list[PreplyMaterial]:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise SystemExit(
                "Preply browser sync requires Playwright. Install it with "
                "`uv sync --extra preply` and `uv run playwright install chromium`, "
                "or keep using `uv run mandarin import-preply --source ~/Downloads`."
            ) from exc

        profile_dir.mkdir(parents=True, exist_ok=True)
        staging_dir.mkdir(parents=True, exist_ok=True)

        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                str(profile_dir),
                accept_downloads=True,
                headless=False,
            )
            try:
                page = context.pages[0] if context.pages else context.new_page()
                page.goto(start_url, wait_until="domcontentloaded", timeout=timeout_ms)
                if _looks_logged_out(page.url):
                    _wait_for_manual_login(page, profile_dir, start_url, timeout_ms)

                try:
                    page.wait_for_load_state("networkidle", timeout=5_000)
                except Exception:
                    pass

                candidates = _dedupe_materials(_find_pdf_links(page))
                selected = candidates[:limit] if limit > 0 else candidates
                if dry_run:
                    return selected

                downloaded: list[PreplyMaterial] = []
                for material in selected:
                    response = context.request.get(material.url, timeout=timeout_ms)
                    content_type = response.headers.get("content-type", "")
                    if not response.ok or ("pdf" not in content_type.lower() and not material.filename.lower().endswith(".pdf")):
                        print(f"skip {material.filename}: did not look like a PDF download")
                        continue

                    target = _unique_staging_path(staging_dir, material.filename)
                    target.write_bytes(response.body())
                    downloaded.append(PreplyMaterial(url=material.url, filename=material.filename, path=target))
                return downloaded
            finally:
                context.close()


def sync_preply_lessons(
    *,
    profile_dir: Path = DEFAULT_PREPLY_PROFILE_DIR,
    staging_dir: Path = DEFAULT_PREPLY_STAGING_DIR,
    start_url: str = PREPLY_HOME_URL,
    dry_run: bool = False,
    limit: int = 0,
    adapter: PlaywrightPreplyBrowser | None = None,
) -> None:
    profile_dir = profile_dir.expanduser()
    staging_dir = staging_dir.expanduser()

    browser = adapter or PlaywrightPreplyBrowser()
    materials = browser.sync(
        profile_dir=profile_dir,
        staging_dir=staging_dir,
        start_url=start_url,
        dry_run=dry_run,
        limit=limit,
    )

    if dry_run:
        if not materials:
            print("No likely Preply PDF materials found.")
            print(f"Browser profile: {profile_dir}")
            return
        print("Likely Preply PDF materials:")
        for material in materials:
            print(f"candidate {material.filename}: {material.url}")
        return

    downloaded = [material for material in materials if material.path is not None]
    if not downloaded:
        print("No Preply PDFs downloaded.")
        print(f"Browser profile: {profile_dir}")
        return

    print(f"Downloaded {len(downloaded)} PDF(s) to {staging_dir}")
    ingest_lessons(staging_dir, "*.pdf", normalize_preply=True)


def _looks_logged_out(url: str) -> bool:
    parsed = urlparse(url)
    return "/login" in parsed.path or "/signup" in parsed.path


def _login_instructions(profile_dir: Path) -> str:
    return (
        "Preply opened in a dedicated local browser profile but is not logged in.\n"
        "Log in manually in the opened browser window.\n"
        f"Browser profile: {profile_dir}\n"
        "The CLI does not accept or store Preply passwords."
    )


def _wait_for_manual_login(page: object, profile_dir: Path, start_url: str, timeout_ms: int) -> None:
    if not sys.stdin.isatty():
        raise SystemExit(_login_instructions(profile_dir))

    print(_login_instructions(profile_dir))
    input("Press Enter here after the browser is logged in, or Ctrl-C to stop. ")
    page.goto(start_url, wait_until="domcontentloaded", timeout=timeout_ms)
    if _looks_logged_out(page.url):
        raise SystemExit("Preply still appears to be logged out. Rerun `uv run mandarin preply sync` after login succeeds.")


def _find_pdf_links(page: object) -> list[PreplyMaterial]:
    anchors = page.locator("a").evaluate_all(
        """
        anchors => anchors.map(anchor => ({
          href: anchor.href || "",
          text: (anchor.innerText || anchor.textContent || "").trim()
        }))
        """
    )
    materials: list[PreplyMaterial] = []
    for anchor in anchors:
        href = str(anchor.get("href", "")).strip()
        text = str(anchor.get("text", "")).strip()
        if not href or not _looks_like_pdf_material(href, text):
            continue
        materials.append(PreplyMaterial(url=href, filename=_filename_from_link(href, text)))
    return materials


def _looks_like_pdf_material(href: str, text: str) -> bool:
    haystack = f"{href} {text}".lower()
    return ".pdf" in haystack and any(term in haystack for term in ["pdf", "lesson", "material", "notes"])


def _filename_from_link(href: str, text: str) -> str:
    parsed = urlparse(href)
    name = unquote(Path(parsed.path).name)
    if not name.lower().endswith(".pdf"):
        name = f"{text or 'preply-material'}.pdf"
    name = re.sub(r"[^A-Za-z0-9._ -]+", "-", name).strip(" .-")
    return name or "preply-material.pdf"


def _dedupe_materials(materials: list[PreplyMaterial]) -> list[PreplyMaterial]:
    seen: set[str] = set()
    deduped: list[PreplyMaterial] = []
    for material in materials:
        if material.url in seen:
            continue
        seen.add(material.url)
        deduped.append(material)
    return deduped


def _unique_staging_path(staging_dir: Path, filename: str) -> Path:
    target = staging_dir / filename
    if not target.exists():
        return target

    stem = target.stem
    suffix = target.suffix
    index = 2
    while True:
        candidate = staging_dir / f"{stem}-{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1
