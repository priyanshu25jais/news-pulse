import os

from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "newspulse")

FEEDS = {
    "BBC News": "http://feeds.bbci.co.uk/news/rss.xml",
    "NPR": "https://feeds.npr.org/1001/rss.xml",
    "The Guardian": "https://www.theguardian.com/world/rss",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
}

REQUEST_TIMEOUT = 15
USER_AGENT = "Mozilla/5.0 (compatible; NewsPulse/1.0)"
MAX_NEW_PER_FEED = 50
DOWNLOAD_THREADS = 8

# Clustering
CLUSTER_WINDOW_DAYS = 7        # only articles from the last 7 days are re-clustered
SIMILARITY_THRESHOLD = 0.20   # groups merge while their average cosine similarity is >= this
TITLE_WEIGHT = 3               # the headline is repeated 3x so it counts more than the body
BODY_CHARS = 1200              # only the opening of the article body is used
