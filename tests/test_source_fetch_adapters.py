"""Tests for source-fetch HTML detail extraction."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

from bs4 import BeautifulSoup
import httpx

# Make source_fetch importable when running from repo root.
sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1] / "pipelines" / "source_fetch" / "scripts"),
)

from source_fetch import adapters
from source_fetch.adapters import extract_body_text, extract_detail_fields, fetch_rss_source
from source_fetch.models import SourceConfig


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


def test_fetch_rss_source_honors_detail_body_selectors(monkeypatch) -> None:
    rss_xml = """
    <rss version="2.0">
      <channel>
        <title>Example Feed</title>
        <link>https://example.com/feed.xml</link>
        <item>
          <title>Market-Moving Update</title>
          <link>https://example.com/news/market-moving-update</link>
          <guid>item-1</guid>
          <pubDate>Mon, 23 Mar 2026 11:00:00 GMT</pubDate>
          <description>Short summary.</description>
        </item>
      </channel>
    </rss>
    """.strip()
    detail_html = """
    <html>
      <head>
        <meta property="og:title" content="Market-Moving Update">
        <meta name="description" content="Short summary.">
      </head>
      <body>
        <div class="article-body">
          <p>The actual press release body.</p>
          <p>It should be captured ahead of unrelated cards.</p>
        </div>
        <article class="related-card">
          <h2>Related article title</h2>
          <p>Unrelated teaser copy.</p>
        </article>
      </body>
    </html>
    """.strip()

    def fake_parse(_text: str) -> SimpleNamespace:
        return SimpleNamespace(
            feed={"title": "Example Feed", "link": "https://example.com/feed.xml"},
            entries=[
                {
                    "title": "Market-Moving Update",
                    "link": "https://example.com/news/market-moving-update",
                    "id": "item-1",
                    "guid": "item-1",
                    "published": "Mon, 23 Mar 2026 11:00:00 GMT",
                    "summary": "Short summary.",
                    "description": "Short summary.",
                    "links": [{"rel": "alternate", "href": "https://example.com/news/market-moving-update"}],
                }
            ],
        )

    monkeypatch.setattr(adapters.feedparser, "parse", fake_parse)

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://example.com/feed.xml":
            return httpx.Response(200, text=rss_xml)
        if str(request.url) == "https://example.com/news/market-moving-update":
            return httpx.Response(200, text=detail_html)
        raise AssertionError(f"unexpected url: {request.url}")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    source = SourceConfig(
        name="test_press_rss",
        category="company",
        method="rss",
        endpoint="https://example.com/feed.xml",
        doc_type="news",
        parser="rss",
        extra={
            "fetch_detail": True,
            "detail_body_selectors": [".article-body"],
        },
    )

    result = fetch_rss_source(client, source, "run-123", 1)

    assert len(result.documents) == 1
    body_text = result.documents[0]["body_text"]
    assert "The actual press release body." in body_text
    assert "Related article title" not in body_text
