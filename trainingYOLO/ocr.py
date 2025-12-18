import warnings
import cv2
import numpy as np
import os
import csv
import glob
import time
from paddleocr import PaddleOCR
from ultralytics import YOLO


warnings.filterwarnings('ignore')


MODEL_PATH = "runs/detect/train_lpr5/weights/best.pt" 
INPUT_DIR = "dataset/test/images" 
OUTPUT_DIR = "pipeline_results" 
CSV_FILE_NAME = "lpr_summary_full_run.csv" 
os.makedirs(OUTPUT_DIR, exist_ok=True)


def get_best_ocr_result_paddleocr(ocr_results):

    if not ocr_results or not isinstance(ocr_results, list) or not ocr_results[0]:
        return None


    first_result_list = ocr_results[0]
    
    recognized_text = ""
    

    for box_info in first_result_list:
        if isinstance(box_info, list) and len(box_info) == 2:

            text_result = box_info[1]
            if isinstance(text_result, tuple) and len(text_result) == 2:
                recognized_text += str(text_result[0])


    cleaned_text = recognized_text.strip().replace(' ', '').upper()
    
    return cleaned_text


def run_yolo_to_paddle_pipeline(img_path, plate_model, ocr_engine):

    img = cv2.imread(img_path)
    if img is None:
        return "ERROR_READING_IMAGE", "N/A", 0.0


    results = plate_model(img, verbose=False)[0] 
    
    if not results.boxes or len(results.boxes) == 0:
        return "NO_DETECTION", "N/A", 0.0

    best_box = None
    best_conf = 0.0
    
    for box in results.boxes:
        conf = box.conf.item()
        if conf > best_conf:
            best_conf = conf
            best_box = box.xyxy[0].cpu().numpy().astype(int)

    if best_box is None:
        return "NO_DETECTION", "N/A", 0.0

    x1, y1, x2, y2 = best_box
    

    h, w, _ = img.shape
    

    pad_h = int((y2 - y1) * 0.1)
    pad_w = int((x2 - x1) * 0.1)

    x1_pad = max(0, x1 - pad_w)
    y1_pad = max(0, y1 - pad_h)
    x2_pad = min(w, x2 + pad_w)
    y2_pad = min(h, y2 + pad_h)
    
    plate_crop = img[y1_pad:y2_pad, x1_pad:x2_pad]
    
    if plate_crop.size == 0:
        return "READ_FAILED_AFTER_DETECTION", "N/A", best_conf

    try:
        ocr_results = ocr_engine.ocr(plate_crop, det=False, cls=False, rec=True)
        ocr_result = get_best_ocr_result_paddleocr(ocr_results)
        
        if ocr_result and len(ocr_result) > 1: 
             return "SUCCESS", ocr_result, best_conf
        else:
             return "READ_FAILED_AFTER_DETECTION", ocr_result, best_conf
            
    except Exception as e:
        return f"OCR_ENGINE_ERROR", str(e), best_conf
    


def main_pipeline_run():

    try:

        plate_model = YOLO(MODEL_PATH)

        ocr_engine = PaddleOCR(use_angle_cls=True, lang='en')
    except Exception as e:
        print(f"Error loading models: {e}")
        print("Please ensure your YOLO model path is correct and PaddleOCR is installed.")
        return


    file_list = glob.glob(os.path.join(INPUT_DIR, "*"))
    if not file_list:
        print(f"No images found in {INPUT_DIR}. Please check the path.")
        return

    print(f"Starting YOLO-PaddleOCR pipeline on {len(file_list)} images...")
    all_results_data = []
    
    total_time = 0
    success_count = 0
    no_detection_count = 0
    read_fail_count = 0
    
    for i, img_path in enumerate(file_list):
        base_name = os.path.basename(img_path)
        
        start_time = time.time()
        status, ocr_result, yolo_confidence = run_yolo_to_paddle_pipeline(img_path, plate_model, ocr_engine)
        end_time = time.time()
 
        execution_time = end_time - start_time
        total_time += execution_time
        
        if status == "SUCCESS":
            success_count += 1
        elif status == "NO_DETECTION":
            no_detection_count += 1
        elif "FAILED" in status or "ERROR" in status:
            read_fail_count += 1
            

        all_results_data.append({
            'File Name': base_name,
            'Status': status,
            'OCR Result': ocr_result,
            'YOLO Detection Confidence': f"{yolo_confidence:.4f}" if status == "SUCCESS" else "N/A",
            'Execution Time (s)': f"{execution_time:.4f}"
        })
        
        print(f"[{i+1}/{len(file_list)}] {base_name}: Status={status}, Read Plate={ocr_result} (Time: {execution_time:.4f}s)")
    

    output_file_path = os.path.join(OUTPUT_DIR, CSV_FILE_NAME)
    fieldnames = ['File Name', 'Status', 'OCR Result', 'YOLO Detection Confidence', 'Execution Time (s)']

    with open(output_file_path, 'w', newline='') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_results_data)


    total_images = len(file_list)
    
    avg_time = total_time / total_images if total_images > 0 else 0
    dsr = (total_images - no_detection_count) / total_images * 100 if total_images > 0 else 0
    ocr_cr = success_count / total_images * 100 if total_images > 0 else 0

    print(f"Total Images Processed: {total_images}")
    print(f"Total Successful Reads: {success_count} (OCR Completion Rate: {ocr_cr:.2f}%)")
    print(f"Total No Detections: {no_detection_count}")
    print(f"Detection Success Rate (DSR): {dsr:.2f}%")
    print(f"Average Execution Time: {avg_time:.4f} seconds (Target: <= 0.65s)")
    print(f"Detailed results saved to: {output_file_path}")


if __name__ == "__main__":
    main_pipeline_run()