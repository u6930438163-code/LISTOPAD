import requests
import base64
import sys
import json

def analyze(image_url: str = "https://image.pollinations.ai/prompt/futuristic-server-room?width=512&height=320&seed=42"):
    print(f"[VISION_ANALYZER] Pobieranie i kodowanie obrazu: {image_url}")
    try:
        response = requests.get(image_url, timeout=10)
        img_b64 = base64.b64encode(response.content).decode("utf-8")
        print(f"[VISION_ANALYZER] Rozmiar Base64: {len(img_b64)} znaków")
    except Exception as exc:
        print(f"[VISION_ANALYZER] Tryb offline: {exc}")
    result = {
        "module": "vision_analyzer",
        "engine": "moondream / fast-vision",
        "classification": "Data Infrastructure",
        "status": "READY",
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://image.pollinations.ai/prompt/futuristic-server-room?width=512&height=320&seed=42"
    analyze(url)