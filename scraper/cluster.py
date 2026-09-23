"""Groups articles into topics with TF-IDF + cosine similarity (Option B).

1. Each article becomes text: headline x3 + summary + start of the body
   (page boilerplate that repeats across articles is removed first).
2. TF-IDF turns the text into word weights: words that are rare overall
   ("ceasefire") weigh a lot, words that are everywhere ("said") weigh little.
3. Cosine similarity compares every pair of articles (0 = unrelated, 1 = same).
4. Agglomerative clustering (average linkage) keeps merging the two most similar
   groups until no pair is at least SIMILARITY_THRESHOLD similar on average.
5. Label = top 3 words the articles share + the most typical headline.
"""
import re
from collections import Counter
from datetime import datetime, timezone

import numpy as np
from pymongo import UpdateOne
from sklearn.cluster import AgglomerativeClustering
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer

import config
import db

# Common news words and outlet names that say nothing about the topic.
NEWS_STOP_WORDS = {
    "said", "says", "say", "told", "year", "years", "new", "news", "week", "day", "days",
    "time", "people", "like", "just", "mr", "mrs", "ms", "including", "according",
    "image", "images", "caption", "getty", "reuters", "ap", "afp", "copyright", "photo",
    "live", "video", "watch", "listen", "read", "updates", "update", "latest", "report",
    "bbc", "npr", "guardian", "al", "jazeera", "aljazeera", "published", "monday", "tuesday",
    "wednesday", "thursday", "friday", "saturday", "sunday", "yesterday", "today", "month",
    "percent", "million", "billion", "old", "make", "made", "going", "want", "way",
}
STOP_WORDS = sorted(ENGLISH_STOP_WORDS | NEWS_STOP_WORDS)


def remove_repeated_lines(articles):
    counts = Counter()
    for article in articles:
        lines = {line.strip() for line in (article.get("body") or "").splitlines() if line.strip()}
        counts.update((article["source"], line) for line in lines)
    for article in articles:
        lines = (article.get("body") or "").splitlines()
        article["body"] = "\n".join(line for line in lines if counts[(article["source"], line.strip())] < 2)


def article_text(article):
    title = article.get("title") or ""
    summary = article.get("summary") or ""
    body = (article.get("body") or "")[: config.BODY_CHARS]
    text = " ".join([title] * config.TITLE_WEIGHT + [summary, body])
    return re.sub(r"['’]s\b", "", text) 


def top_terms(centroid, doc_counts, vocab, k=3):
    """Highest-weighted words of the cluster that appear in at least 2 of its articles."""
    min_docs = 2 if doc_counts.max() >= 2 else 1
    terms = []
    for i in np.argsort(-centroid):
        if centroid[i] <= 0 or len(terms) == k:
            break
        if doc_counts[i] >= min_docs:
            terms.append(vocab[i])
    return terms


def group_articles(articles):
    """Returns a list of clusters: {article_ids, label, top_terms, representative_title}."""
    if not articles:
        return []
    remove_repeated_lines(articles)
    ids = [a["_id"] for a in articles]
    titles = [a["title"] for a in articles]
    if len(articles) == 1:
        return [{"article_ids": ids, "label": titles[0], "top_terms": [], "representative_title": titles[0]}]

    vectorizer = TfidfVectorizer(
        stop_words=STOP_WORDS,
        sublinear_tf=True,
        max_df=0.3 if len(articles) >= 20 else 1.0,  # ignore words found in >30% of articles
        token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z'-]+[a-zA-Z]\b",
        strip_accents="unicode",
    )
    try:
        vectors = vectorizer.fit_transform([article_text(a) for a in articles])
    except ValueError:  # no usable words at all
        return [{"article_ids": [i], "label": t, "top_terms": [], "representative_title": t}
                for i, t in zip(ids, titles)]

    # Vectors are length-normalised, so a dot product is the cosine similarity.
    similarity = np.clip((vectors @ vectors.T).toarray(), 0, 1)
    distance = 1 - similarity
    np.fill_diagonal(distance, 0)

    labels = AgglomerativeClustering(
        n_clusters=None,
        metric="precomputed",
        linkage="average",
        distance_threshold=1 - config.SIMILARITY_THRESHOLD,
    ).fit_predict(distance)

    vocab = vectorizer.get_feature_names_out()
    clusters = []
    for label in np.unique(labels):
        members = np.where(labels == label)[0]
        member_vectors = vectors[members]
        centroid = np.asarray(member_vectors.mean(axis=0)).ravel()
        doc_counts = np.asarray((member_vectors > 0).sum(axis=0)).ravel()
        terms = top_terms(centroid, doc_counts, vocab)

        # The most typical headline is the one closest to the cluster centre.
        closeness = np.asarray(member_vectors @ centroid).ravel()
        representative = titles[members[int(np.argmax(closeness))]]

        clusters.append({
            "article_ids": [ids[i] for i in members],
            "label": " · ".join(t.title() for t in terms) if len(members) > 1 and terms else representative,
            "top_terms": terms,
            "representative_title": representative,
        })
    clusters.sort(key=lambda c: -len(c["article_ids"]))
    return clusters


def update_clusters(database):
    articles = db.recent_articles(database, config.CLUSTER_WINDOW_DAYS)
    clusters = group_articles(articles)
    now = datetime.now(timezone.utc)

    # Keep cluster ids stable between runs: a new cluster reuses the old id
    # if at least half of its articles (or of the old cluster) are the same.
    old_cluster_of = {a["_id"]: a["cluster_id"] for a in articles if a.get("cluster_id")}
    old_sizes = Counter(old_cluster_of.values())
    used_ids = set()

    for cluster in clusters:
        overlap = Counter(old_cluster_of[i] for i in cluster["article_ids"] if i in old_cluster_of)
        cluster_id = None
        for old_id, shared in overlap.most_common():
            if old_id in used_ids:
                continue
            if shared / len(cluster["article_ids"]) >= 0.5 or shared / old_sizes[old_id] >= 0.5:
                cluster_id = old_id
            break

        fields = {
            "label": cluster["label"],
            "top_terms": cluster["top_terms"],
            "representative_title": cluster["representative_title"],
            "updated_at": now,
        }
        if cluster_id is None:
            cluster_id = db.next_cluster_id(database)
            database.clusters.insert_one({"_id": cluster_id, **fields, "created_at": now})
        else:
            database.clusters.update_one({"_id": cluster_id}, {"$set": fields})
        used_ids.add(cluster_id)
        database.articles.update_many({"_id": {"$in": cluster["article_ids"]}}, {"$set": {"cluster_id": cluster_id}})

    # Store article count and first/last article time on each cluster.
    totals = list(database.articles.aggregate([
        {"$match": {"cluster_id": {"$ne": None}}},
        {"$group": {"_id": "$cluster_id", "count": {"$sum": 1},
                    "start": {"$min": "$published_at"}, "end": {"$max": "$published_at"}}},
    ]))
    if totals:
        database.clusters.bulk_write([
            UpdateOne({"_id": t["_id"]}, {"$set": {"article_count": t["count"], "start_time": t["start"], "end_time": t["end"]}})
            for t in totals
        ])
    database.clusters.delete_many({"_id": {"$nin": [t["_id"] for t in totals]}})

    return {
        "articles": len(articles),
        "clusters": len(clusters),
        "clusters_with_2_plus_articles": sum(1 for c in clusters if len(c["article_ids"]) > 1),
    }
