import torch
import os
from ultralytics import YOLO


TRAIN_NAME = "train_lpr" 
PROJECT_NAME = "runs/detect" 

def main():

    model = YOLO("yolo11n.pt")       


    print(f"CUDA Available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        print("Using CPU for training/validation.")


    print("\n--- Starting YOLO Model Training ---")


    model.train(
        data="dataset/data.yaml",
        epochs=50,
        imgsz=640,
        batch=8,
        device=0 if torch.cuda.is_available() else 'cpu',
        project=PROJECT_NAME,
        name=TRAIN_NAME,
        workers=0 
    )


    best_weights_path = os.path.join(PROJECT_NAME, TRAIN_NAME, 'weights', 'best.pt')
    

    if os.path.exists(best_weights_path):
        print(f"\n--- Loading and Validating Final Model from: {best_weights_path} ---")
        
        final_model = YOLO(best_weights_path)
        
        metrics = final_model.val(
            data="dataset/data.yaml",
            imgsz=640,
            device=0 if torch.cuda.is_available() else 'cpu', 
        )


        print("\n--- Final Detection Metrics for Report ---")
        print(f"mAP@50 (Target Metric): {metrics.box.map50:.4f}")
        print(f"mAP@0.5:0.95: {metrics.box.map:.4f}")
        print(f"Precision: {metrics.box.precision:.4f}")
        print(f"Recall: {metrics.box.recall:.4f}")
        
    else:
        print(f"\nError: Could not find best weights at {best_weights_path}. Check training logs.")

if __name__ == "__main__":
    main()