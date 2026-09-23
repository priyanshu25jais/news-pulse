import calendar
import hashlib
import html
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import feedparser
import requests
import trafilatura
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

import config
import db

session = requests.Session()
session.headers["User-Agent"] = config.USER_AGENT

TRACKING_PARAMS = re.compile(r"^(utm_\w+|at_\w+|fbclid|gclid|ocid|cmp|src|ref)$", re.IGNORECASE)


def clean_text(raw):
    """HTML snippet -> plain text."""
    if not raw:
        return ""
    text = html.unescape(BeautifulSoup(raw, "html.parser").get_text(" "))
    return re.sub(r"\s+", " ", text).strip()


def clean_url(url):
    """Remove tracking parameters and #fragments so one article has one URL."""
    parts = urlsplit(url.strip())
    query = [(k, v) for k, v in parse_qsl(parts.query) if not TRACKING_PARAMS.match(k)]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme, parts.netloc.lower(), path, urlencode(query), ""))


def title_hash(source, title):
    normalized = re.sub(r"[^\w\s]", " ", title.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return hashlib.sha1(f"{source}|{normalized}".encode()).hexdigest()


def parse_date(entry, now):
    """Returns (date, estimated). Feeds use pubDate, dc:date, updated, or nothing at all."""
    for key in ("published_parsed", "updated_parsed"):
        if entry.get(key):
            date = datetime.fromtimestamp(calendar.timegm(entry[key]), tz=timezone.utc)
            return min(date, now), False

    for key in ("published", "updated", "dc_date", "date"):
        if entry.get(key):
            try:
                date = date_parser.parse(entry[key], fuzzy=True)
            except (ValueError, OverflowError):
                continue
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            return min(date.astimezone(timezone.utc), now), False

    # No usable date: use the time we first saw it and mark it as estimated.
    return now, True


def normalize(entry, source, now):
    """Map one feed entry (whatever its format) to our schema. Returns (article, feed_text)."""
    title = clean_text(entry.get("title"))
    link = entry.get("link")
    if not title or not link:
        return None

    # Some feeds put the text in <description>, others only in <content:encoded>.
    content = clean_text(entry["content"][0].get("value")) if entry.get("content") else ""
    summary = clean_text(entry.get("summary") or entry.get("description"))
    if len(summary) < 40 and content:
        summary = content[:600]

    published_at, estimated = parse_date(entry, now)
    return {
        "url": clean_url(link),
        "title": title,
        "title_hash": title_hash(source, title),
        "source": source,
        "summary": summary,
        "body": None,
        "published_at": published_at,
        "published_at_estimated": estimated,
        "fetched_at": now,
        "extraction_status": "pending",
        "extraction_error": None,
        "cluster_id": None,
    }, content


def fetch_feed(url):
    response = session.get(url, timeout=config.REQUEST_TIMEOUT)
    response.raise_for_status()
    feed = feedparser.parse(response.content)
    if feed.bozo and not feed.entries:
        raise ValueError(f"could not parse feed: {feed.bozo_exception}")
    return feed.entries


def extract_body(url):
    """Download the article page and pull out the main text. Returns (text, error)."""
    try:
        response = session.get(url, timeout=config.REQUEST_TIMEOUT)
        response.raise_for_status()
        text = trafilatura.extract(response.text)
        if not text or len(text) < 200:
            # Fallback: join the paragraphs on the page.
            soup = BeautifulSoup(response.text, "html.parser")
            for tag in soup(["nav", "header", "footer", "aside", "form"]):
                tag.decompose()
            main = soup.find("article") or soup.find("main") or soup
            paragraphs = [p.get_text(" ", strip=True) for p in main.find_all("p")]
            text = "\n".join(p for p in paragraphs if len(p) > 40)
        if not text or len(text) < 200:
            return None, "no article text found"
        return text, None
    except Exception as error:  # one bad page must not stop the run
        return None, str(error)[:300]


def ingest(database):
    now = datetime.now(timezone.utc)
    stats = {"feeds_ok": 0, "feed_errors": [], "new_articles": 0, "bodies_extracted": 0, "bodies_failed": 0}
    new_articles = []  # (id, url, text from the feed itself)

    for source, feed_url in config.FEEDS.items():
        try:
            entries = fetch_feed(feed_url)
        except Exception as error:
            stats["feed_errors"].append(f"{source}: {error}")
            print(f"{source}: FAILED - {error}")
            continue
        stats["feeds_ok"] += 1

        parsed = [result for entry in entries if (result := normalize(entry, source, now))]
        known = db.existing_urls(database, [article["url"] for article, _ in parsed])
        fresh = [(article, content) for article, content in parsed if article["url"] not in known]

        added = 0
        for article, content in fresh[: config.MAX_NEW_PER_FEED]:
            article_id = db.insert_article(database, article)
            if article_id:
                new_articles.append((article_id, article["url"], content))
                added += 1
        stats["new_articles"] += added
        print(f"{source}: {len(entries)} entries, {added} new")

    # Only new articles need their full text, so re-runs are fast.
    with ThreadPoolExecutor(config.DOWNLOAD_THREADS) as pool:
        results = pool.map(extract_body, [url for _, url, _ in new_articles])
        for (article_id, _, feed_content), (body, error) in zip(new_articles, results):
            if not body and len(feed_content) >= 200:
                body, error = feed_content, None
            db.save_body(database, article_id, body, error)
            stats["bodies_extracted" if body else "bodies_failed"] += 1

    return stats
