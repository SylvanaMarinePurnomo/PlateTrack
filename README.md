## PlateTrack
Staff Parking Access Management

- Dataset: https://universe.roboflow.com/plat-kendaraan/vehicle-and-license-plate
- Final Report: https://docs.google.com/document/d/1fn1PFHzPjQGFMDQWYBPHwwik_EJ0PbRWm4LqZSQm0nc/edit?usp=sharing
- Link deployment : https://hect1x-kcartetalp.hf.space/ 

## 1️⃣ Clone Repository
```bash
git clone https://github.com/SylvanaMarinePurnomo/PlateTrack.git
cd PlateTrack
```
## 2️⃣ Create Virtual Environment
```bash
🪟 Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1

🪟 Windows (CMD)
python -m venv .venv
.venv\Scripts\activate.bat

🐧 macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```
## 3️⃣ Install Python Dependencies
```bash
pip install -r requirements.txt
## 4️⃣ Run Backend (FastAPI + WebSocket)
```
```bash
uvicorn newApp:app --host 127.0.0.1 --port 5000 --reload
Backend URL: http://127.0.0.1:5000
```
## 5️⃣ Run Frontend (Python UI)
```bash
python newApp.py
```




