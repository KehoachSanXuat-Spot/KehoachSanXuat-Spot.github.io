# ============================================================
# Dockerfile cho Hugging Face Spaces (2 vCPU + 16GB RAM)
# Chạy backend FastAPI + OR-Tools CP-SAT giải lịch điều độ xưởng
# ============================================================
FROM python:3.11-slim

WORKDIR /app

# Cài đặt công cụ hệ thống tối thiểu
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Tạo user UID 1000 theo chuẩn Hugging Face Spaces
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1

# Cài đặt dependencies Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ mã nguồn vào container
COPY --chown=user:user . .

# Chuyển quyền sang user
USER user

# Hugging Face Spaces sử dụng cổng 7860
EXPOSE 7860

# Khởi chạy server FastAPI
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-7860}"]
