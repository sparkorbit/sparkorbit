"""Tests for source-fetch HTML detail extraction."""

from __future__ import annotations

import sys
from pathlib import Path

from bs4 import BeautifulSoup

# Make source_fetch importable when running from repo root.
sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1] / "pipelines" / "source_fetch" / "scripts"),
)

from source_fetch.adapters import extract_body_text, extract_detail_fields


def test_extract_detail_fields_uses_deepmind_body_selectors() -> None:
    html = """
    <html>
      <head>
        <meta property="og:title" content="SIMA 2: A Gemini-Powered AI Agent for 3D Virtual Worlds">
        <meta name="description" content="Introducing SIMA 2, the next milestone in our research.">
        <meta name="author" content="SIMA Team">
        <meta property="article:published_time" content="2025-11-13T18:55:00+00:00">
      </head>
      <body>
        <main id="page-content">
          <div class="cover">
            <h1>SIMA 2: An Agent that Plays, Reasons, and Learns With You in Virtual 3D Worlds</h1>
          </div>
          <div class="rich-text">
            <p>Last year, we introduced SIMA, a generalist AI that could follow basic instructions across a wide range of virtual environments.</p>
          </div>
          <div class="rich-text">
            <h2>The Power of Reasoning</h2>
            <p>SIMA 2 integrates Gemini reasoning abilities to pursue high-level goals in games.</p>
          </div>
          <article class="card card-blog">
            <h3>Genie 3</h3>
            <p>Learn more</p>
          </article>
          <article class="card card-blog">
            <h3>Gemini Robotics</h3>
            <p>September 2025 Google DeepMind Learn more</p>
          </article>
        </main>
      </body>
    </html>
    """
    soup = BeautifulSoup(html, "html.parser")

    detail_fields = extract_detail_fields(
        soup,
        fallback_title=None,
        fallback_date=None,
        body_selectors=["main .rich-text"],
    )

    assert detail_fields["title"] == "SIMA 2: A Gemini-Powered AI Agent for 3D Virtual Worlds"
    assert detail_fields["author"] == "SIMA Team"
    assert detail_fields["published_at"] == "2025-11-13T18:55:00Z"
    assert "Last year, we introduced SIMA" in detail_fields["body_text"]
    assert "The Power of Reasoning" in detail_fields["body_text"]
    assert "Genie 3" not in detail_fields["body_text"]
    assert "Gemini Robotics" not in detail_fields["body_text"]


def test_extract_body_text_keeps_generic_fallback_when_selector_misses() -> None:
    html = """
    <html>
      <body>
        <article>
          <h1>Simple Article</h1>
          <p>This is the actual body text.</p>
        </article>
      </body>
    </html>
    """
    soup = BeautifulSoup(html, "html.parser")

    body_text = extract_body_text(soup, [".missing-selector"])

    assert body_text == "Simple Article This is the actual body text."
