# Quick Elections

Minimal FastAPI + React app for running lightweight elections on Railway. Participants enter their name to join. Using the special keyword (default: `TrentAdmin`) unlocks the admin console to launch and close polls. Results update live and remain publicly visible.

## Prerequisites

- Python 3.10+
- Node.js 18+

## Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Environment variables:

- `ADMIN_KEYWORD` – optional override for the admin login keyword (defaults to `TrentAdmin`).

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Development uses Vite's proxy so API calls hit the FastAPI server running on port `8000`.

To build production assets (served by FastAPI):

```bash
cd frontend
npm run build
```

The generated `frontend/dist` directory is mounted automatically by FastAPI.

## Railway Deployment

1. Add a new Railway service pointing to this repository.
2. Configure the build steps:
   - `pip install -r requirements.txt`
   - `cd frontend && npm install && npm run build`
3. Set the start command to `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` (already defined in `Procfile`).
4. (Optional) Set the `ADMIN_KEYWORD` variable for your admin login.

Once deployed, users can visit the Railway URL to log in and interact with polls directly.
# elections
