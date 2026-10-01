FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY registry.py agent_executor.py __main__.py ./
USER nobody
CMD ["python", "__main__.py"]
