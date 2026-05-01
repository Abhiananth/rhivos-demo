FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn
COPY service.py .
ENV SERVICE_NAME=asil-b-service
ENV CRITICALITY=ASIL-B
EXPOSE 8000
CMD ["python", "service.py"]
