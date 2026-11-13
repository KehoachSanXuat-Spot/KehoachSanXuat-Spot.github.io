import os
import uvicorn
import gradio as gr
from server import app as fastapi_app

# Giao diện thông tin nhẹ khi mở trực tiếp link Space
with gr.Blocks(title="Xưởng Hàn Spot - CP-SAT Backend") as demo:
    gr.Markdown(
        """
        # ⚡ Xưởng Hàn Spot — CP-SAT Solver Backend
        **Động cơ máy chủ giải lịch điều độ sản xuất (FJSP) & Đồng bộ dữ liệu SharePoint**
        
        - 🚀 **Phần cứng**: 2 vCPU • 16 GB RAM (Hugging Face Spaces)
        - 🌐 **Giao diện Web xưởng**: [kehoachsanxuat-spot.github.io](https://kehoachsanxuat-spot.github.io)
        - 🟢 **Trạng thái**: API sẵn sàng hoạt động (FastAPI + OR-Tools)
        """
    )

# Ghép toàn bộ API của FastAPI vào cùng server (ưu tiên tất cả các route /api/...)
app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
