
import warnings
warnings.filterwarnings("ignore")

import cv2
import numpy as np
import re
import base64

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from paddleocr import PaddleOCR
from ultralytics import YOLO


MODEL_PATH = "weights/best.pt"

TRUSTED_PLATES = [
    "BE1653AAG",
    "B1030NZQ",
]

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
    best_match_plate = None
    min_distance = float("inf")

    for trusted_plate in trusted_plates:
        L_t = len(trusted_plate)

        for L_w in range(max(1, L_t - threshold), L_t + threshold + 1):
            for start_index in range(len(ocr_text) - L_w + 1):
                window = ocr_text[start_index:start_index + L_w]
                distance = levenshtein_distance(window, trusted_plate)

                if distance < min_distance and distance <= threshold:
                    min_distance = distance
                    best_match_plate = trusted_plate
                    if min_distance == 0:
                        return best_match_plate, min_distance

    if min_distance <= threshold:
        return best_match_plate, min_distance
    return None, float("inf")


def get_best_ocr_result_paddleocr(ocr_results):
    if not ocr_results or not isinstance(ocr_results, list) or not ocr_results[0]:
        return None

    first_result_dict = ocr_results[0]
    if isinstance(first_result_dict, dict) and "rec_texts" in first_result_dict:
        return "".join(first_result_dict["rec_texts"]).replace(" ", "").upper()

    return None


def clean_plate_text(raw_text):
    if not raw_text:
        return ""
    return re.sub(r"[^A-Z0-9]", "", raw_text)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    print("WebSocket connected")

    try:
        while True:
            data = await ws.receive_json()

            if data.get("type") != "image":
                continue

            img_bytes = base64.b64decode(data["image"])
            np_img = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

            h_img, w_img = img.shape[:2]

            results = plate_model(img, imgsz=640, conf=0.25, verbose=False)[0]

            best_overall_conf = 0.0
            best_ocr_plate_text_raw = "N/A"
            best_ocr_yolo_conf = 0.0

            if results.boxes:
                for box in results.boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])

                    pad_h = int((y2 - y1) * 0.1)
                    pad_w = int((x2 - x1) * 0.1)

                    y1p = max(0, y1 - pad_h)
                    y2p = min(h_img, y2 + pad_h)
                    x1p = max(0, x1 - pad_w)
                    x2p = min(w_img, x2 + pad_w)

                    crop = img[y1p:y2p, x1p:x2p]
                    if crop.size == 0:
                        continue

                    if conf > best_overall_conf:
                        best_overall_conf = conf

                    try:
                        ocr_output = ocr_engine.ocr(crop)
                        raw_text = get_best_ocr_result_paddleocr(ocr_output)
                    except:
                        continue

                    if raw_text and conf > best_ocr_yolo_conf:
                        best_ocr_plate_text_raw = raw_text
                        best_ocr_yolo_conf = conf

            access_status = "DENIED"
            final_plate_text = "N/A"
            status = "READ_FAILED"

            if best_ocr_plate_text_raw != "N/A":
                cleaned = clean_plate_text(best_ocr_plate_text_raw)

                if cleaned:
                    match, dist = find_best_match_fuzzy(
                        cleaned, TRUSTED_PLATES, EDIT_DISTANCE_THRESHOLD
                    )

                    if match:
                        access_status = "GRANTED"
                        final_plate_text = match
                    else:
                        final_plate_text = cleaned

                    status = "SUCCESS"

            await ws.send_json({
                "type": "result",
                "status": status,
                "plate_text": final_plate_text,
                "yolo_confidence": best_ocr_yolo_conf,
                "access_status": access_status
            })

    except WebSocketDisconnect:
        print("WebSocket disconnected")

