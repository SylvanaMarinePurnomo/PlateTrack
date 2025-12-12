import warnings
import cv2
import numpy as np
import os
import json
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


def get_best_ocr_result_paddleocr(ocr_results):
    if not ocr_results or not isinstance(ocr_results, list) or not ocr_results[0]:
        return None
    first_result_dict = ocr_results[0]
    if isinstance(first_result_dict, dict) and 'rec_texts' in first_result_dict:
        return "".join(first_result_dict['rec_texts']).strip().replace(' ', '').upper()
    return None


def run_yolo_to_paddle_pipeline_api(img_array: np.ndarray, plate_model, ocr_engine):
    if plate_model is None or ocr_engine is None:
         return "MODELS_NOT_LOADED", "N/A", 0.0

    img = img_array.copy()
    h_img, w_img = img.shape[:2]


    results = plate_model(img, imgsz=640, conf=0.25, verbose=False)[0] 
    
    if not results.boxes:
        return "NO_DETECTION", "N/A", 0.0

    best_overall_conf = 0.0 
    highest_conf_crop_data = None
    best_ocr_plate_text = "N/A"
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
            highest_conf_crop_data = plate_crop.copy() 



        try:
             ocr_output = ocr_engine.ocr(plate_crop) 
             plate_text = get_best_ocr_result_paddleocr(ocr_output)
        except Exception as e:
            print(f"PaddleOCR Runtime Error on crop (Conf {conf:.2f}): {e}")
            continue
        

        if plate_text and plate_text != "N/A" and conf > best_ocr_yolo_conf:
            best_ocr_plate_text = plate_text
            best_ocr_yolo_conf = conf
    

    
    if best_ocr_plate_text != "N/A":
        return "SUCCESS", best_ocr_plate_text, best_ocr_yolo_conf
    else:
        return "READ_FAILED", "N/A", best_overall_conf



def initialize_models():
    global plate_model, ocr_engine
    try:
        plate_model = YOLO(MODEL_PATH)
        ocr_engine = PaddleOCR(use_angle_cls=True, lang='en') 
        print("Models loaded ")
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

    status, ocr_result, yolo_confidence = run_yolo_to_paddle_pipeline_api(img_array, plate_model, ocr_engine)
    
    response_data = {
        'status': status,
        'plate_text': ocr_result,
        'yolo_confidence': float(f"{yolo_confidence:.4f}") 
    }
    
    return jsonify(response_data)


if __name__ == '__main__':
    initialize_models()
    
    app.run(host='0.0.0.0', port=5000, debug=True)