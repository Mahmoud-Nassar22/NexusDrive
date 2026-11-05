import os
import requests
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

app = Flask(__name__)

STORAGE_DIR = os.environ.get("STORAGE_DIR", "/data/files")
AUTH_SERVICE_URL = os.environ.get("AUTH_SERVICE_URL", "http://auth-service:5001")

os.makedirs(STORAGE_DIR, exist_ok=True)


def current_user():
    """Extracts the Bearer token and asks auth-service if it's valid.
    Returns the username, or None if invalid/missing."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        resp = requests.post(f"{AUTH_SERVICE_URL}/verify", json={"token": token}, timeout=5)
    except requests.RequestException:
        return None
    if resp.status_code != 200:
        return None
    data = resp.json()
    return data.get("username") if data.get("valid") else None


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "file-service"}), 200


@app.route("/upload", methods=["POST"])
def upload():
    username = current_user()
    if not username:
        return jsonify({"error": "unauthorized"}), 401

    if "file" not in request.files:
        return jsonify({"error": "no file part"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "empty filename"}), 400

    filename = secure_filename(file.filename)
    user_dir = os.path.join(STORAGE_DIR, username)
    os.makedirs(user_dir, exist_ok=True)
    file.save(os.path.join(user_dir, filename))

    return jsonify({"message": "uploaded", "filename": filename}), 201


@app.route("/files", methods=["GET"])
def list_files():
    username = current_user()
    if not username:
        return jsonify({"error": "unauthorized"}), 401

    user_dir = os.path.join(STORAGE_DIR, username)
    if not os.path.isdir(user_dir):
        return jsonify({"files": []}), 200

    files = os.listdir(user_dir)
    return jsonify({"files": files}), 200


@app.route("/download/<path:filename>", methods=["GET"])
def download(filename):
    username = current_user()
    if not username:
        return jsonify({"error": "unauthorized"}), 401

    user_dir = os.path.join(STORAGE_DIR, username)
    safe_name = secure_filename(filename)
    if not os.path.isfile(os.path.join(user_dir, safe_name)):
        return jsonify({"error": "not found"}), 404

    return send_from_directory(user_dir, safe_name, as_attachment=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002)
