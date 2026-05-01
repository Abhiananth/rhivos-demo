FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn
COPY service.py .
ENV SERVICE_NAME=qm-service
ENV CRITICALITY=QM
EXPOSE 8000
CMD ["python", "service.py"]
