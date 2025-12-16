import warnings
import cv2
import numpy as np
import os
import json
import re 
from paddleocr import PaddleOCR
from ultralytics import YOLO
from flask import Flask, request, jsonify, Response
from flask_cors import CORS 
from werkzeug.utils import secure_filename
from io import BytesIO


warnings.filterwarnings('ignore')


app = Flask(__name__)
CORS(app) 
MODEL_PATH = "weights/best.pt" 


plate_model = None
ocr_engine = None 

TRUSTED_PLATES = [
    "BE1653AAG",
    "B1030NZQ",
]

EDIT_DISTANCE_THRESHOLD = 2 

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
                new_distances.append(1 + min((distances[i1], distances[i1 + 1], new_distances[-1])))
        distances = new_distances
    return distances[-1]

def find_best_match_fuzzy(ocr_text, trusted_plates, threshold):
    best_match_plate = None
    min_distance = float('inf')

    for trusted_plate in trusted_plates:
        L_t = len(trusted_plate)
        
        for L_w in range(max(1, L_t - threshold), L_t + threshold + 1):
            
            for start_index in range(len(ocr_text) - L_w + 1):
                end_index = start_index + L_w
                window = ocr_text[start_index:end_index]
                
                distance = levenshtein_distance(window, trusted_plate)
                
                if distance < min_distance and distance <= threshold:
                    min_distance = distance
                    best_match_plate = trusted_plate
                    if min_distance == 0:
                        return best_match_plate, min_distance
                        
    if min_distance <= threshold:
        return best_match_plate, min_distance
    else:
        return None, float('inf')


def get_best_ocr_result_paddleocr(ocr_results):
    if not ocr_results or not isinstance(ocr_results, list) or not ocr_results[0]:
        return None
    first_result_dict = ocr_results[0]
    if isinstance(first_result_dict, dict) and 'rec_texts' in first_result_dict:
        raw_text = "".join(first_result_dict['rec_texts']).strip().replace(' ', '').upper()
        return raw_text
    return None

def clean_plate_text(raw_text):
    if not raw_text:
        return ""
    
    cleaned_text = re.sub(r'[^A-Z0-9]', '', raw_text) 
    
    return cleaned_text


def run_yolo_to_paddle_pipeline_api(img_array: np.ndarray, plate_model, ocr_engine):
    if plate_model is None or ocr_engine is None:
         return "MODELS_NOT_LOADED", "N/A", 0.0, "DENIED" 

    img = img_array.copy()
    h_img, w_img = img.shape[:2]


    results = plate_model(img, imgsz=640, conf=0.25, verbose=False)[0] 
    
    if not results.boxes:
        return "NO_DETECTION", "N/A", 0.0, "DENIED" 

    best_overall_conf = 0.0 
    best_ocr_plate_text_raw = "N/A" 
    best_ocr_yolo_conf = 0.0 

    for box in results.boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
        conf = box.conf[0].cpu().item()
        pad_h = int((y2 - y1) * 0.1)
        pad_w = int((x2 - x1) * 0.1)
        y1_pad = max(0, y1 - pad_h)
        y2_pad = min(h_img, y2 + pad_h)
        x1_pad = max(0, x1 - pad_w)
        x2_pad = min(w_img, x2 + pad_w) 
        plate_crop = img[y1_pad:y2_pad, x1_pad:x2_pad]
        
        if plate_crop.size == 0:
            continue

        if conf > best_overall_conf:
            best_overall_conf = conf

        try:
             ocr_output = ocr_engine.ocr(plate_crop) 
             raw_plate_text = get_best_ocr_result_paddleocr(ocr_output)
        except Exception as e:
            print(f"PaddleOCR Runtime Error on crop (Conf {conf:.2f}): {e}")
            continue
        
        
        if raw_plate_text and raw_plate_text != "N/A" and conf > best_ocr_yolo_conf:
            best_ocr_plate_text_raw = raw_plate_text 
            best_ocr_yolo_conf = conf
    
    
    access_status = "DENIED"
    final_plate_text = "N/A"
    
    if best_ocr_plate_text_raw != "N/A":
        cleaned_ocr_text = clean_plate_text(best_ocr_plate_text_raw)
        
        if cleaned_ocr_text:
            
            matched_trusted_plate, distance = find_best_match_fuzzy(
                cleaned_ocr_text, 
                TRUSTED_PLATES, 
                EDIT_DISTANCE_THRESHOLD
            )
            
            if matched_trusted_plate:
                access_status = "GRANTED"
                final_plate_text = matched_trusted_plate 
            else:
                final_plate_text = cleaned_ocr_text 


    if final_plate_text != "N/A":
        final_status = "SUCCESS"
        return final_status, final_plate_text, best_ocr_yolo_conf, access_status 
    else:
        final_status = "READ_FAILED"
        return final_status, "N/A", best_overall_conf, "DENIED" 



def initialize_models():
    global plate_model, ocr_engine
    try:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"YOLO model weights not found at: {MODEL_PATH}")
            
        plate_model = YOLO(MODEL_PATH)
        ocr_engine = PaddleOCR(use_angle_cls=True, lang='en') 
        print("Models loaded successfully.")
    except Exception as e:
        print(f"FATAL ERROR during model loading: {e}")
        plate_model = None
        ocr_engine = None



@app.route('/recognize-plate', methods=['POST'])
def recognize_plate_endpoint():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
    
    uploaded_file = request.files['file']
    if uploaded_file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if plate_model is None or ocr_engine is None:
        return jsonify({"error": "Service not ready. Models failed to load at startup."}), 503
        
    try:
        image_bytes = uploaded_file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img_array = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img_array is None:
            return jsonify({"error": "Invalid image format. Could not decode."}), 400
        
    except Exception as e:
        return jsonify({"error": f"Image processing failed: {e}"}), 500

    status, ocr_result, yolo_confidence, access_status = run_yolo_to_paddle_pipeline_api(img_array, plate_model, ocr_engine)
    
    response_data = {
        'status': status,
        'plate_text': ocr_result,
        'yolo_confidence': float(f"{yolo_confidence:.4f}"),
        'access_status': access_status 
    }
    
    return jsonify(response_data)


if __name__ == '__main__':
    initialize_models()
    app.run(host='127.0.0.1', port=5000, debug=True)