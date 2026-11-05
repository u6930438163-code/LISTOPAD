import base64
import json

def analyze(image_path: str = "/tmp/system_schema.jpg"):
    return {
        "engine": "vision_engine (moondream)",
        "image_path": image_path,
        "status": "Engine ready."
    }

if __name__ == "__main__":
    print("Engine ready.")
    print(json.dumps(analyze(), indent=2))
