# News Pulse

News Pulse pulls live articles from 4 news RSS feeds, groups articles about the same story into **topic clusters**, and shows each cluster on a **timeline** from its first article to its latest.

| | Link |
|---|---|
| Live frontend | https://news-pulse-zeta-ten.vercel.app |
| Live backend API | https://news-pulse-api-huni.onrender.com |
| Video walkthrough | YOUR-VIDEO-LINK |

---

## Features

| Assignment item | Status |
|---|---|
| Pull from 3+ RSS feeds, normalise formats, fetch full article text, no duplicates, re-runnable | Done (4 feeds) |
| Group articles into topics — Option B (TF-IDF) | Done |
| API: `/clusters`, `/clusters/:id`, `/timeline`, `/ingest/trigger`, `/ingest/status/:jobId` | Done |
| Timeline, cluster detail view, filter by source, "Refresh data" button | Done |
| Stretch: auto-refresh (timeline reloads every 60 seconds) | Done |
| Stretch: visual cluster sizing (bigger topic = thicker, darker bar) | Done |
| Stretch: cross-source story merging | Not built separately — articles from different outlets already join the same topic when their wording matches |

## Architecture overview

```mermaid
flowchart LR
  A[RSS feeds] --> B[Scraper<br/>Python]
  B --> C[(MongoDB Atlas)]
  C --> D[API<br/>Node.js + Express]
  D --> E[Website<br/>React]
  E -- Refresh data --> D
  D -- runs --> B
```

1. The **scraper** downloads the RSS feeds and converts every item to the same format.
2. It skips articles that are already saved, stores the new ones in MongoDB, and downloads their full text.
3. It groups the articles from the last 7 days into topics and saves the topics.
4. The **API** reads MongoDB and returns topics, articles and timeline data.
5. The **website** draws the timeline. "Refresh data" asks the API to run the scraper again.

## What runs where, and why

| Part | Folder | Runs on | Why |
|---|---|---|---|
| Scraper | `/scraper` | GitHub Actions every 2 hours, and inside the API container on Render | Free scheduled runs keep data fresh; the API can also start it on demand for "Refresh data" |
| API | `/backend` | Render (Docker) | Free Node hosting; Docker puts Node and Python in one container so the API can run the scraper |
| Website | `/frontend` | Vercel | Free, fast hosting for a React site |
| Database | — | MongoDB Atlas (free tier) | Hosted database; each article is one document |

Environment variables are set on Render, Vercel and GitHub, never committed to the repo.

## News sources

| Source | RSS feed |
|---|---|
| BBC News | http://feeds.bbci.co.uk/news/rss.xml |
| NPR | https://feeds.npr.org/1001/rss.xml |
| The Guardian | https://www.theguardian.com/world/rss |
| Al Jazeera | https://www.aljazeera.com/xml/rss/all.xml |

## Scraper (Part 1a)

- **Different feed formats:** every item is converted to one schema. The summary comes from `<description>`, or from `<content:encoded>` when the description is empty. The date comes from `pubDate`, `dc:date` or `updated`, in any format. If there is no date, the time we first saw the article is used and marked as estimated.
- **Full article text:** each new article page is downloaded and its main text is extracted with `trafilatura`, with a BeautifulSoup fallback. If a page fails, the error is saved on that article and the run continues.
- **No duplicates:** MongoDB has a unique index on the URL and on source + headline. Tracking parameters like `utm_source` are removed from URLs first.
- **Re-runnable:** URLs already in the database are skipped, so each run only processes new articles.

## Topic grouping (Part 1b)

### Approach: Option B — TF-IDF, and why

TF-IDF gives a high weight to words that are special to an article ("ceasefire", "wildfires") and a low weight to words found everywhere ("said", "government"). Those special words are what show that two articles are about the same story. It is fast, needs no training, and every step is easy to explain.

### How articles end up in the same topic (`scraper/cluster.py`)

1. **Text:** headline (3 times, so it counts more) + summary + the first 1200 characters of the article body. Lines that repeat in 2 or more articles from the same outlet (page template text such as "follow topics…") are removed first.
2. **TF-IDF vectors:** English stop words and common news words ("said", weekdays, outlet names) are removed. Words found in more than 30% of articles are ignored.
3. **Cosine similarity** between every pair of articles (0 = nothing in common, 1 = same text).
4. **Agglomerative clustering, average linkage:** keep merging the two most similar groups while their average similarity is at least **0.20**. Average linkage stops a long chain of "A is like B, B is like C" from pulling unrelated stories together.
5. **Label:** the top 3 TF-IDF words shared by the topic's articles, plus the most typical headline.

Saved for each topic: cluster id, label, its articles, and each article's published time. Cluster ids stay the same between runs when most of the articles are the same.

### How I picked the parameters

- **Similarity threshold 0.20:** I ran the pipeline on real feed data with 0.15, 0.20 and 0.30 and compared the timelines. At 0.15, separate Iran stories (the Witkoff talks and the "annihilate" threat) merged into one broad 5-article topic. At 0.30, real stories were split: Typhoon Dujuan and the Mexico hurricane no longer formed topics, and the Houthis and Al-Sharaa topics lost articles. 0.20 kept each story together without merging different ones.
- **Headline weight 3 and 1200 body characters:** the headline and first paragraphs describe the story best; later paragraphs add background and noise.
- **7-day window and at least 2 articles per topic on the timeline:** keeps the timeline readable.

### Limitation

TF-IDF matches **words, not meaning**. "Fed" and "Federal Reserve", or "Greek" and "Greece", count as different words, so one story can sometimes split into two topics. Sentence embeddings would fix this.

## API (Part 2)

| Endpoint | Returns |
|---|---|
| `GET /clusters` | All topics: label, article count, time range (first → latest article) |
| `GET /clusters/:id` | One topic with all its articles, oldest first |
| `GET /timeline` | Topics for the chart: label, start, end, article count, intensity (0–1 size metric) |
| `POST /ingest/trigger` | Starts the scraper and returns a `jobId` |
| `GET /ingest/status/:jobId` | `running`, `succeeded` or `failed`, with the result |

Optional filters: `sources=BBC News,NPR`, `minSize=2`, `from=2026-09-20`.
Status codes: `400` bad input, `404` not found, `409` scraper already running, `500` server error.

## Setup instructions (run locally)

You need Python 3.11+, Node.js 20+ and a MongoDB Atlas connection string.

**1. Scraper**
```bash
cd scraper
python -m venv .venv
.venv\Scripts\activate           
pip install -r requirements.txt
copy .env.example .env           
python run.py
```

**2. Backend**
```bash
cd backend
npm install
copy .env.example .env           # same MONGODB_URI
npm run dev                      # http://localhost:4000
```

**3. Frontend**
```bash
cd frontend
npm install
copy .env.example .env           # VITE_API_URL=http://localhost:4000
npm run dev                      # http://localhost:5173
```

The backend finds the scraper's Python in `scraper/.venv` automatically, so "Refresh data" also works locally.

## Environment variables

| Where | Variable | Example |
|---|---|---|
| scraper, backend | `MONGODB_URI` | `mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/` |
| scraper, backend | `MONGODB_DB` | `newspulse` |
| backend | `CORS_ORIGIN` | `https://your-app.vercel.app` |
| frontend | `VITE_API_URL` | `https://your-api.onrender.com` |

## Assumptions

- A "topic" is one news story or event (for example "Typhoon in Japan"), not a broad category like "Politics".
- The brief says "Next.js / React". I used React with Vite, because the app is a single page and does not need server rendering.
- The timeline shows topics with at least 2 articles from the last 7 days.
- Render's free plan sleeps when unused, so the first request can take 30–50 seconds.
