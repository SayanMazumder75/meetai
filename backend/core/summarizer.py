"""
summarizer.py
Extractive summarisation using sumy (no API, no GPU).
Also extracts action items and key points with simple heuristics.
"""

import re
import logging
import nltk

logger = logging.getLogger(__name__)

# Download required NLTK data on first run
def _ensure_nltk():
    for pkg in ["punkt", "punkt_tab", "stopwords"]:
        try:
            nltk.data.find(f"tokenizers/{pkg}" if "punkt" in pkg else f"corpora/{pkg}")
        except LookupError:
            nltk.download(pkg, quiet=True)

_ensure_nltk()

from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lsa import LsaSummarizer
from sumy.nlp.stemmers import Stemmer
from sumy.utils import get_stop_words


ACTION_PATTERNS = [
    r"\b(will|should|must|need to|going to|have to|shall|todo|action|follow.?up)\b",
    r"\b(assign|delegate|schedule|book|send|prepare|review|check|update|fix|deploy)\b",
]
ACTION_RE = re.compile("|".join(ACTION_PATTERNS), re.IGNORECASE)

KEY_PATTERNS = [
    r"\b(decided|agreed|confirmed|approved|rejected|resolved|concluded)\b",
    r"\b(important|critical|key|main|primary|essential|significant)\b",
]
KEY_RE = re.compile("|".join(KEY_PATTERNS), re.IGNORECASE)


def summarize(chunks: list, num_sentences: int = 5) -> dict:
    """
    chunks: list of Chunk dataclass instances or dicts with .text
    Returns: {"summary": str, "action_items": [...], "key_points": [...]}
    """
    texts = []
    for c in chunks:
        t = c.text if hasattr(c, "text") else c.get("text", "")
        if t.strip():
            texts.append(t.strip())

    full_text = " ".join(texts)

    if len(full_text.split()) < 20:
        return {"summary": "", "action_items": [], "key_points": []}

    # Split into sentences for heuristic extraction
    sentences = re.split(r"(?<=[.!?])\s+", full_text)

    # Extractive summary via LSA
    try:
        parser    = PlaintextParser.from_string(full_text, Tokenizer("english"))
        stemmer   = Stemmer("english")
        summarizer = LsaSummarizer(stemmer)
        summarizer.stop_words = get_stop_words("english")
        summary_sentences = [str(s) for s in summarizer(parser.document, num_sentences)]
        summary = " ".join(summary_sentences)
    except Exception as e:
        logger.warning(f"Summarizer failed: {e}")
        # Fallback: first N sentences
        summary = " ".join(sentences[:num_sentences])

    # Action items
    action_items = []
    for sent in sentences:
        if ACTION_RE.search(sent) and len(sent.split()) > 4:
            clean = sent.strip().rstrip(".")
            if clean and clean not in action_items:
                action_items.append(clean)
        if len(action_items) >= 6:
            break

    # Key points
    key_points = []
    for sent in sentences:
        if KEY_RE.search(sent) and len(sent.split()) > 4:
            clean = sent.strip().rstrip(".")
            if clean and clean not in key_points:
                key_points.append(clean)
        if len(key_points) >= 6:
            break

    return {
        "summary": summary,
        "action_items": action_items[:5],
        "key_points": key_points[:5],
    }
