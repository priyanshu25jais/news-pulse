from datetime import datetime, timedelta, timezone

from pymongo import MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError

import config


def connect():
    if not config.MONGODB_URI:
        raise RuntimeError("MONGODB_URI is not set - add it to scraper/.env")
    client = MongoClient(config.MONGODB_URI, tz_aware=True, serverSelectionTimeoutMS=15000)
    return client, client[config.MONGODB_DB]


def create_indexes(db):
    # The two unique indexes are what stop the same article being stored twice.
    db.articles.create_index("url", unique=True)
    db.articles.create_index([("source", 1), ("title_hash", 1)], unique=True)
    db.articles.create_index("published_at")
    db.articles.create_index("cluster_id")


def existing_urls(db, urls):
    return {doc["url"] for doc in db.articles.find({"url": {"$in": urls}}, {"url": 1})}


def insert_article(db, article):
    """Returns the new id, or None if the article is already stored."""
    try:
        return db.articles.insert_one(article).inserted_id
    except DuplicateKeyError:
        return None


def save_body(db, article_id, body, error):
    db.articles.update_one(
        {"_id": article_id},
        {"$set": {"body": body, "extraction_status": "ok" if body else "failed", "extraction_error": error}},
    )


def recent_articles(db, days):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    fields = {"title": 1, "summary": 1, "body": 1, "source": 1, "published_at": 1, "cluster_id": 1}
    return list(db.articles.find({"published_at": {"$gte": since}}, fields).sort("_id", 1))


def next_cluster_id(db):
    counter = db.counters.find_one_and_update(
        {"_id": "clusters"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return counter["seq"]
