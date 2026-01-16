import os
import cv2
import numpy as np
from paddleocr import PaddleOCR
import re


ocr_engine = PaddleOCR(use_angle_cls=True, lang="en")


TEST_IMAGES_DIR = "test/images"
TEST_LABELS_DIR = "test/labels"

def extract_license_plate(text):

    cleaned = re.sub(r"[^A-Z0-9]", "", text.upper())
    
    if not cleaned:
        return ""
    

    patterns = [
        r'([A-Z]{1,2}\d{1,4}[A-Z]{1,3})', 
    ]
    

    all_matches = []
    for pattern in patterns:
        matches = re.findall(pattern, cleaned)
        for match in matches:
            if 6 <= len(match) <= 9:
                all_matches.append(match)
    

    if all_matches:
        return all_matches[0]
    
    if len(cleaned) >= 6:
        for start in range(min(3, len(cleaned))):
            for length in [8, 7, 6, 9]:
                if start + length <= len(cleaned):
                    candidate = cleaned[start:start + length]
                    if (candidate[0].isalpha() and 
                        any(c.isdigit() for c in candidate) and
                        candidate[-1].isalpha()):
                        if re.match(r'^[A-Z]{1,2}\d+[A-Z]{1,3}$', candidate):
                            return candidate
    
    return ""

def get_best_ocr_text(ocr_results):
    if not ocr_results or not isinstance(ocr_results, list):
        return ""

    block = ocr_results[0]

    if isinstance(block, dict) and "rec_texts" in block:
        return "".join(block["rec_texts"]).replace(" ", "").upper()

    return ""

def calculate_cer(reference, hypothesis):
    ref = reference.upper().strip()
    hyp = hypothesis.upper().strip()

    d = np.zeros((len(ref) + 1, len(hyp) + 1), dtype=int)
    
    for i in range(len(ref) + 1):
        d[i][0] = i
    for j in range(len(hyp) + 1):
        d[0][j] = j
    
    for i in range(1, len(ref) + 1):
        for j in range(1, len(hyp) + 1):
            if ref[i-1] == hyp[j-1]:
                cost = 0
            else:
                cost = 1
            
            d[i][j] = min(
                d[i-1][j] + 1,
                d[i][j-1] + 1,
                d[i-1][j-1] + cost
            )
    
    edit_distance = d[len(ref)][len(hyp)]
    
    if len(ref) == 0:
        return 0.0 if len(hyp) == 0 else float('inf')
    
    cer = edit_distance / len(ref)
    return cer

def read_label(label_path):
    with open(label_path, 'r', encoding='utf-8') as f:
        return f.read().strip()

def test_ocr():

    print("=" * 60)
    print("OCR Character Error Rate (CER) Testing")
    print("=" * 60)
    

    image_files = sorted([f for f in os.listdir(TEST_IMAGES_DIR) if f.endswith(('.jpg', '.jpeg', '.png'))])
    

    
    total_cer = 0
    correct_count = 0
    total_count = 0
    failed_extractions = 0
    valid_cer_count = 0
    results = []
    
    for img_file in image_files:
        file_num = os.path.splitext(img_file)[0]
        
        img_path = os.path.join(TEST_IMAGES_DIR, img_file)
        label_path = os.path.join(TEST_LABELS_DIR, f"{file_num}.txt")
        
        img = cv2.imread(img_path)

        ground_truth = read_label(label_path)
        

        try:
            ocr_res = ocr_engine.ocr(img)
            raw_ocr = get_best_ocr_text(ocr_res)
            extracted_ocr = extract_license_plate(raw_ocr)
        except Exception as e:
            print(f"OCR Error on {img_file}: {e}")
            raw_ocr = ""
            extracted_ocr = ""
        

        cleaned_ground_truth = extract_license_plate(ground_truth)
        

        is_failed_extraction = (extracted_ocr == "" or len(extracted_ocr) < 6)
        

        if is_failed_extraction:
            cer = float('inf')
            failed_extractions += 1
        else:
            cer = calculate_cer(cleaned_ground_truth, extracted_ocr)
            total_cer += cer
            valid_cer_count += 1
        

        is_correct = (extracted_ocr == cleaned_ground_truth) and not is_failed_extraction
        if is_correct:
            correct_count += 1
        
        total_count += 1
        

        results.append({
            'file': img_file,
            'ground_truth': cleaned_ground_truth,
            'raw_ocr': raw_ocr,
            'extracted_ocr': extracted_ocr,
            'cer': cer,
            'correct': is_correct,
            'failed_extraction': is_failed_extraction
        })
        
        if is_failed_extraction:
            cer_display = "FAIL"
        elif is_correct:
            cer_display = f"{cer:.4f} ({cer*100:.2f}%)"
        else:
            cer_display = f"{cer:.4f} ({cer*100:.2f}%)"
            
        print(f"\nTest {file_num}: {img_file}")
        print(f"Ground Truth: {cleaned_ground_truth}")
        print(f"Extracted OCR:{extracted_ocr if extracted_ocr else '(empty)'}")
        print(f"CER: {cer_display}")
    

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    if total_count > 0:
        accuracy = (correct_count / total_count) * 100
        incorrect_rate = (total_count - correct_count - failed_extractions) / total_count * 100
        failed_rate = (failed_extractions / total_count) * 100
        
        print(f"Correct: ({accuracy:.2f}%)")
        print(f"Incorrect: ({incorrect_rate:.2f}%)")
        print(f"Failed: ({failed_rate:.2f}%)")
        
        if valid_cer_count > 0:
            avg_cer = total_cer / valid_cer_count
            print(f"\nAverage CER (valid extractions only / fails not included): {avg_cer:.4f} ({avg_cer*100:.2f}%)")
        else:
            print(f"\nAverage CER: N/A (no valid extractions)")
        

if __name__ == "__main__":
    test_ocr()