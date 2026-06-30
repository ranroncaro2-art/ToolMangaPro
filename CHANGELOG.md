# Nhật ký cập nhật (Changelog) - Phiên Bản 2.0.0

Phiên bản này mang lại các cải tiến lớn về việc quản lý chi phí API Key và đơn giản hóa cấu hình hệ thống.

### Chi tiết các cập nhật:
1. **Xoay Vòng Nhiều API Key Gemini Tự Động (Multi-key Fallover):**
   - Hỗ trợ nhập và dán danh sách nhiều API Key Gemini cùng một lúc (phân cách bằng dòng mới, dấu phẩy `,` hoặc dấu chấm phẩy `;`).
   - Khi một key hết quota (lượt gọi miễn phí) hoặc gặp lỗi kết nối, hệ thống sẽ tự động chuyển sang sử dụng key tiếp theo trong danh sách mà không làm gián đoạn tiến trình công việc của bạn.
   - Cơ chế tự động bỏ qua việc xoay vòng và báo lỗi ngay lập tức khi phát hiện lỗi block nội dung (Safety/Prohibited Content) từ phía Google để bạn kịp thời chỉnh sửa kịch bản.

2. **Gộp Cấu HÌnh API Key:**
   - Loại bỏ ô nhập `API Key Free` riêng biệt để tránh nhầm lẫn. Giờ đây tất cả các tác vụ LLM (Chia cảnh, Viết prompt) và tác vụ tự động gán giọng đọc (Multi-Voice) đều dùng chung một ô cấu hình `API Key` duy nhất.
   - Khi chọn nhà cung cấp là **Google Gemini**, ô nhập key sẽ tự động chuyển sang dạng hộp thoại nhiều dòng (`textarea`) để bạn dễ dàng dán danh sách key từ Notepad.

3. **Tự Động Di Trú Dữ Liệu Cấu Hình Cũ (Auto Migration):**
   - Khi khởi chạy phiên bản 2.0.0 lần đầu tiên, nếu bạn đã thiết lập khóa ở ô `API Key Free` trước đó, hệ thống sẽ tự động gộp khóa đó vào danh sách `API Key` chính giúp bạn không bị mất dữ liệu cấu hình cũ.

4. **Hiển thị phiên bản 2.0.0:**
   - Số phiên bản 2.0.0 được hiển thị rõ ràng trên thanh tiêu đề/cấu hình của ứng dụng để người dùng dễ nhận biết.
