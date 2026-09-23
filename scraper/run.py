"""Runs the whole pipeline: read RSS feeds -> save new articles -> group into topics.

Usage: python run.py
Safe to run again and again: already-stored articles are skipped.
"""
import json
import sys
import time

import cluster
import db
import ingest


def main():
    started = time.time()
    result = {"ok": False}
    client = None
    try:
        client, database = db.connect()
        db.create_indexes(database)
        result["ingest"] = ingest.ingest(database)
        result["cluster"] = cluster.update_clusters(database)
        result["ok"] = result["ingest"]["feeds_ok"] > 0
        if not result["ok"]:
            result["error"] = "all feeds failed to download"
    except Exception as error:
        result["error"] = str(error)
    finally:
        if client:
            client.close()

    result["seconds"] = round(time.time() - started, 1)
    # The Node API reads this last line to report the job result.
    print("RESULT " + json.dumps(result, default=str), flush=True)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
