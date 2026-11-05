import os
import requests
from flask import Flask, render_template, request, redirect, url_for, session, flash, send_file
import io

app = Flask(__name__)
app.secret_key = os.environ.get("FRONTEND_SECRET", "dev-frontend-secret")

AUTH_SERVICE_URL = os.environ.get("AUTH_SERVICE_URL", "http://auth-service:5001")
FILE_SERVICE_URL = os.environ.get("FILE_SERVICE_URL", "http://file-service:5002")


@app.route("/health")
def health():
    return {"status": "ok", "service": "frontend"}, 200


@app.route("/", methods=["GET"])
def index():
    if "token" not in session:
        return redirect(url_for("login"))

    resp = requests.get(
        f"{FILE_SERVICE_URL}/files",
        headers={"Authorization": f"Bearer {session['token']}"},
        timeout=5,
    )
    files = resp.json().get("files", []) if resp.status_code == 200 else []
    return render_template("index.html", username=session.get("username"), files=files)


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        resp = requests.post(
            f"{AUTH_SERVICE_URL}/register",
            json={"username": username, "password": password},
            timeout=5,
        )
        if resp.status_code == 201:
            flash("Account created, please log in.")
            return redirect(url_for("login"))
        flash(resp.json().get("error", "registration failed"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        resp = requests.post(
            f"{AUTH_SERVICE_URL}/login",
            json={"username": username, "password": password},
            timeout=5,
        )
        if resp.status_code == 200:
            session["token"] = resp.json()["token"]
            session["username"] = username
            return redirect(url_for("index"))
        flash(resp.json().get("error", "login failed"))
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/upload", methods=["POST"])
def upload():
    if "token" not in session:
        return redirect(url_for("login"))

    if "file" not in request.files:
        flash("no file selected")
        return redirect(url_for("index"))

    f = request.files["file"]
    resp = requests.post(
        f"{FILE_SERVICE_URL}/upload",
        headers={"Authorization": f"Bearer {session['token']}"},
        files={"file": (f.filename, f.stream, f.mimetype)},
        timeout=10,
    )
    if resp.status_code != 201:
        flash(resp.json().get("error", "upload failed"))
    return redirect(url_for("index"))


@app.route("/download/<path:filename>")
def download(filename):
    if "token" not in session:
        return redirect(url_for("login"))

    resp = requests.get(
        f"{FILE_SERVICE_URL}/download/{filename}",
        headers={"Authorization": f"Bearer {session['token']}"},
        timeout=10,
    )
    if resp.status_code != 200:
        flash("download failed")
        return redirect(url_for("index"))

    return send_file(
        io.BytesIO(resp.content),
        download_name=filename,
        as_attachment=True,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
