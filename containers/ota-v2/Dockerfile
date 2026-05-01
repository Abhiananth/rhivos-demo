FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn
COPY service.py .
ENV SERVICE_NAME=ota-service
ENV VERSION=2.0.0
ENV BUILD_COLOR=green
EXPOSE 8000
CMD ["python", "service.py"]
