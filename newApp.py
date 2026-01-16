import warnings
warnings.filterwarnings("ignore")

import cv2
import numpy as np
import re
import base64
import json
import os


from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from paddleocr import PaddleOCR
from ultralytics import YOLO


MODEL_PATH = "weights/best.pt"


TRUSTED_PLATES_FILE = "trusted_plates.json"

def load_trusted_plates():
    if not os.path.exists(TRUSTED_PLATES_FILE):
        return []

    try:
        with open(TRUSTED_PLATES_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return []
            return json.loads(content)
    except json.JSONDecodeError:
        print("[WARN] trusted_plates.json invalid or empty, resetting")
        return []



def save_trusted_plates(plates):
    with open(TRUSTED_PLATES_FILE, "w") as f:
        json.dump(plates, f, indent=2)


TRUSTED_PLATES = load_trusted_plates()
print("Trusted plates loaded:", TRUSTED_PLATES)

EDIT_DISTANCE_THRESHOLD = 2


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

plate_model = YOLO(MODEL_PATH)
ocr_engine = PaddleOCR(use_angle_cls=True, lang="en")

print("Models loaded successfully.")


def levenshtein_distance(s1, s2):
    if len(s1) > len(s2):
        s1, s2 = s2, s1

    distances = range(len(s1) + 1)
    for i2, c2 in enumerate(s2):
        new_distances = [i2 + 1]
        for i1, c1 in enumerate(s1):
            if c1 == c2:
                new_distances.append(distances[i1])
            else:
                new_distances.append(
                    1 + min(distances[i1], distances[i1 + 1], new_distances[-1])
                )
        distances = new_distances
    return distances[-1]


def find_best_match_fuzzy(ocr_text, trusted_plates, threshold):
    best_match = None
    min_dist = float("inf")

    for plate in trusted_plates:
        L = len(plate)
        for w in range(max(1, L - threshold), L + threshold + 1):
            for i in range(len(ocr_text) - w + 1):
                window = ocr_text[i:i + w]
                dist = levenshtein_distance(window, plate)
                if dist <= threshold and dist < min_dist:
                    min_dist = dist
                    best_match = plate
    return best_match


def get_best_ocr_text(ocr_results):
    if not ocr_results or not isinstance(ocr_results, list):
        return ""

    block = ocr_results[0]

    if isinstance(block, dict) and "rec_texts" in block:
        return "".join(block["rec_texts"]).replace(" ", "").upper()

    return ""



def clean_plate(text):
    return re.sub(r"[^A-Z0-9]", "", text)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    print("WebSocket connected")

    try:
        while True:
            data = await ws.receive_json()

            if data.get("type") == "add_trusted_plate":
                plate = data.get("plate", "").upper()

                if plate and plate not in TRUSTED_PLATES:
                    TRUSTED_PLATES.append(plate)
                    save_trusted_plates(TRUSTED_PLATES)
                    print(f"[TRUSTED] Plate added: {plate}")
                else:
                    print(f"[TRUSTED] Plate ignored: {plate}")

                await ws.send_json({
                    "type": "trusted_update",
                    "plates": TRUSTED_PLATES
                })
                continue
            
            if data.get("type") == "remove_trusted_plate":
                plate = data.get("plate", "").upper()

                if plate in TRUSTED_PLATES:
                    TRUSTED_PLATES.remove(plate)
                    save_trusted_plates(TRUSTED_PLATES)
                    print(f"[TRUSTED] Plate removed: {plate}")
                else:
                    print(f"[TRUSTED] Plate not found: {plate}")

                await ws.send_json({
                    "type": "trusted_update",
                    "plates": TRUSTED_PLATES
                })
                continue

            if data.get("type") == "stop":
                await ws.send_json({
                    "type": "reset"
                })
                continue

            if data.get("type") != "frame":
                continue

            img_bytes = base64.b64decode(data["image"])
            np_img = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

            h, w = img.shape[:2]

            
            results = plate_model(img, imgsz=640, conf=0.15, verbose=False)[0]
            detections = []

            if results.boxes:
                for box in results.boxes:

                  
                    cls_id = int(box.cls[0])

                    # class 0 -> class plat 
                    if cls_id != 0:
                        continue

                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    
                    pad_x = int((x2 - x1) * 0.05)
                    pad_y = int((y2 - y1) * 0.15)

                    x1 = max(0, x1 + pad_x)
                    y1 = max(0, y1 + pad_y)
                    x2 = min(w, x2 - pad_x)
                    y2 = min(h, y2 - pad_y)

                    crop = img[y1:y2, x1:x2]
                    if crop.size == 0:
                        continue
                    

                    raw = ""
                    cleaned = ""

                    try:
                        ocr_res = ocr_engine.ocr(crop)
                        raw = get_best_ocr_text(ocr_res)
                        cleaned = clean_plate(raw)
                    except Exception as e:
                        print("OCR ERROR:", e)

                    print("OCR RAW:", raw)
                    print("CLEANED:", cleaned)

                    match = find_best_match_fuzzy(
                        cleaned,
                        TRUSTED_PLATES,
                        EDIT_DISTANCE_THRESHOLD
                    )

                    detections.append({
                        "bbox": [x1, y1, x2, y2],
                        "plate": match if match else cleaned,
                        "confidence": conf,
                        "authorized": match is not None,
                        "ocr_raw": raw,
                        "ocr_cleaned": cleaned
                    })
           
            await ws.send_json({
                "type": "detections",
                "results": detections
            })

    except WebSocketDisconnect:
        print("WebSocket disconnected")
