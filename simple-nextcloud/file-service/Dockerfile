FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

RUN mkdir -p /data/files
#just creates an empty folder called /data/files inside the container, at build time.
VOLUME ["/data/files"]
# declares a mount point inside the container to PERSIST data or share it with other containers


EXPOSE 5002

CMD ["python", "app.py"]
