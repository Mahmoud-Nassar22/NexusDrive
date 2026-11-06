FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

RUN mkdir -p /data 
#just creates an empty folder called /data inside the container, at build time.

VOLUME ["/data"] 
# declares a mount point inside the container to PERSIST data or share it with other containers 


EXPOSE 5001

CMD ["python", "app.py"]
