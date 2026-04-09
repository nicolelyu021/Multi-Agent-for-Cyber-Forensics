.PHONY: dev backend frontend db seed clean

# Start everything
dev: db backend frontend

# Neo4j
db:
	docker compose up -d neo4j

db-down:
	docker compose down

# Backend (activate venv first)
backend:
	cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8000

# Frontend
frontend:
	cd frontend && npm run dev

# Data pipeline (run from project root with backend venv active)
download:
	source backend/.venv/bin/activate && python data/scripts/download_enron.py

parse:
	source backend/.venv/bin/activate && python data/scripts/parse_maildir.py

import:
	source backend/.venv/bin/activate && python data/scripts/import_neo4j.py

seed:
	source backend/.venv/bin/activate && python data/scripts/seed_curated.py

# Full data pipeline
data-pipeline: download parse import seed

# De-identified data pipeline
deidentify:
	source backend/.venv/bin/activate && python data/scripts/prepare_deidentified.py

import-deidentified:
	source backend/.venv/bin/activate && python data/scripts/import_neo4j.py --deidentified

data-pipeline-deidentified: download parse deidentify import-deidentified

clean:
	docker compose down -v
	rm -f backend/forensic.db
