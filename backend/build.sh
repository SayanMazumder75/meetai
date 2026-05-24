#!/usr/bin/env bash
set -e
pip install --upgrade pip
pip install -r requirements.txt
python -c "import nltk; nltk.download('punkt', quiet=True); nltk.download('punkt_tab', quiet=True); nltk.download('stopwords', quiet=True)"
python -c "from core.transcriber import get_model; get_model()" || true
