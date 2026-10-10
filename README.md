
# Visual Memory & Analytics Hub

A full-stack web application demonstrating memory-management concepts, collection resizing, asynchronous event handling, caching, two-pointer searching, and defensive error handling.

## Technologies Used
- Python
- Flask
- Flask-CORS
- HTML
- CSS
- JavaScript
- REST APIs and JSON

## Features
- Stack and heap visualization
- Simulated collection resizing and load-factor metrics
- Mock event polling and dashboard updates
- Two-pointer search demonstration
- Cache hits, misses, statistics, and eviction
- Structured error-handling demonstrations
- Optimistic-lock simulation

## Project Structure
- `backend/` — Flask API and backend logic
- `frontend/` — HTML, CSS, and JavaScript dashboard

## How to Run

### 1. Create and activate a virtual environment
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 2. Install dependencies
```powershell
pip install -r backend/requirements.txt
```

### 3. Start the backend
```powershell
python backend/main.py
```

### 4. Open the frontend
Open `frontend/index.html` using the VS Code Live Server extension.

The backend runs at `http://127.0.0.1:5000`.

## Note
This is an educational demonstration. Memory metrics, collision behaviour, and optimistic locking are simulated. Application state is stored in memory and resets when the backend restarts.
