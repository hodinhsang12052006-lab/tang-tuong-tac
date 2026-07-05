/**
 * cronJob.js
 * Tiến trình chạy ngầm (Cron Job) tự động cập nhật trạng thái đơn hàng và hoàn tiền (Refund) khi lỗi.
 * Dự án SMM Panel: Bitpawnetwork
 */

const cron = require('node-cron');
const axios = require('axios');
const mongoose = require('mongoose');
const { Order, User } = require('./models');

// Khóa API nhà cung cấp gốc để tra cứu thông tin
const PROVIDER_API_KEY = process.env.PROVIDER_API_KEY || 'MOCK_API_KEY_BITPAW';
const PROVIDER_API_URL = process.env.PROVIDER_API_URL || 'https://subvip247.com/api/v2';

/**
 * ============================================================================
 * TIẾN TRÌNH CHẠY NGẦM: CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG (Mỗi 15 phút)
 * Biểu thức Cron: mỗi 15 phút
 * ============================================================================
 */
function initStatusCronJob() {
    console.log('[Cron System] Tiến trình tự động cập nhật đơn hàng đã khởi chạy ngầm (15p/lần)...');
    
    cron.schedule('*/15 * * * *', async () => {
        console.log('[Cron Job Triggered] Bắt đầu kiểm tra trạng thái đơn hàng SMM...');

        try {
            // 1. Tìm các đơn hàng đang có trạng thái chờ hoặc đang chạy
            const activeOrders = await Order.find({
                status: { $in: ['Pending', 'Processing'] },
                providerOrderId: { $ne: null } // Đảm bảo đơn đã có ID nhà cung cấp
            }).populate('userId'); // Nạp thông tin User liên kết phục vụ nạp tiền hoàn phí nếu cần

            if (activeOrders.length === 0) {
                console.log('[Cron Job] Không có đơn hàng nào cần kiểm tra.');
                return;
            }

            // Gom nhóm các đơn hàng theo Provider URL (phòng trường hợp hệ thống liên kết nhiều API Provider)
            const providerGroups = {};
            activeOrders.forEach(order => {
                // Ta tìm ngược lại thông tin service để biết API url của Provider gốc
                const providerUrl = process.env.PROVIDER_API_URL || PROVIDER_API_URL;
                if (!providerGroups[providerUrl]) {
                    providerGroups[providerUrl] = [];
                }
                providerGroups[providerUrl].push(order);
            });

            // 2. Lặp qua từng nhóm nhà cung cấp và gọi API kiểm tra trạng thái hàng loạt (Bulk Status)
            for (const [providerUrl, orders] of Object.entries(providerGroups)) {
                // Lấy danh sách mã đơn hàng phân tách bằng dấu phẩy
                const providerOrderIds = orders.map(o => o.providerOrderId).join(',');

                console.log(`[Cron Job] Gọi API Provider: ${providerUrl} cho ${orders.length} đơn hàng...`);

                // Gọi API kiểm tra trạng thái hàng loạt dưới dạng urlencoded
                let response;
                try {
                    const params = new URLSearchParams();
                    params.append('key', PROVIDER_API_KEY);
                    params.append('action', 'status');
                    params.append('orders', providerOrderIds);

                    response = await axios.post(providerUrl, params, {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        timeout: 10000
                    });
                } catch (apiError) {
                    console.error(`[Cron API Error] Lỗi kết nối tới nhà cung cấp ${providerUrl}:`, apiError.message);
                    continue; // Bỏ qua nhóm này, tiếp tục với nhóm khác
                }

                const providerData = response.data;
                if (!providerData || typeof providerData !== 'object') {
                    console.error('[Cron API Error] Cấu trúc phản hồi không hợp lệ:', providerData);
                    continue;
                }

                // 3. Phân tích kết quả trả về từ API Provider và cập nhật vào MongoDB
                // Phản hồi SMM chuẩn thường có dạng: 
                // { "12345": { "status": "Completed", "charge": "0.15" }, "67890": { "status": "Canceled" } }
                for (const order of orders) {
                    const id = order.providerOrderId;
                    const orderStatusInfo = providerData[id];

                    if (!orderStatusInfo) {
                        console.warn(`[Cron Job Warning] Không tìm thấy dữ liệu cho mã đơn API: ${id}`);
                        continue;
                    }

                    const providerStatus = orderStatusInfo.status; // Pending, Processing, Completed, Canceled, Partial
                    
                    // Nếu trạng thái giống cũ thì không cần xử lý thêm
                    if (providerStatus === order.status) continue;

                    // Mở một session cập nhật an toàn
                    const session = await mongoose.startSession();
                    try {
                        session.startTransaction();

                        // A. XỬ LÝ HOÀN TIỀN (REFUND LOGIC) KHI ĐƠN BỊ HỦY (Canceled) HOẶC THIẾU (Refunded)
                        if (providerStatus === 'Canceled' || providerStatus === 'Refunded' || providerStatus === 'Partial') {
                            const user = await User.findById(order.userId._id).session(session);
                            if (user) {
                                let refundAmount = order.charge; // Mặc định hoàn trả toàn bộ

                                // Nếu là trạng thái Partial (Hoàn thành một phần), có thể tính toán hoàn tiền phần dư thừa:
                                // SMM API standard cung cấp trường "remains" (số lượng còn thiếu chưa chạy).
                                // refundAmount = (remains / quantity) * charge
                                if (providerStatus === 'Partial' && orderStatusInfo.remains && parseInt(orderStatusInfo.remains) > 0) {
                                    const remains = parseInt(orderStatusInfo.remains);
                                    refundAmount = parseFloat(((remains / order.quantity) * order.charge).toFixed(4));
                                }

                                if (refundAmount > 0) {
                                    const oldBalance = user.balance;
                                    user.balance = parseFloat((user.balance + refundAmount).toFixed(4));
                                    await user.save({ session });
                                    
                                    console.log(`[Refund Automated] Hoàn tiền cho User #${user.username}. Đơn hàng #${order._id} (API ID: ${id}) bị ${providerStatus}. Hoàn trả: +$${refundAmount}. Số dư: $${oldBalance} -> $${user.balance}`);
                                }
                            }
                        }

                        // B. Cập nhật trạng thái đơn hàng mới vào cơ sở dữ liệu
                        // Bản đồ ánh xạ trạng thái từ Provider sang hệ thống Bitpawnetwork
                        let localNewStatus = 'Processing';
                        if (providerStatus === 'Completed') localNewStatus = 'Completed';
                        else if (providerStatus === 'Canceled') localNewStatus = 'Canceled';
                        else if (providerStatus === 'Refunded' || providerStatus === 'Partial') localNewStatus = 'Canceled'; // Chuyển sang Canceled trên local và hoàn tiền

                        // Cập nhật bản ghi đơn hàng
                        order.status = localNewStatus;
                        await order.save({ session });

                        await session.commitTransaction();
                        session.endSession();

                        console.log(`[Order Update] Đơn hàng #${order._id} (API ID: ${id}) cập nhật trạng thái: ${order.status}`);

                    } catch (dbError) {
                        await session.abortTransaction();
                        session.endSession();
                        console.error(`[Cron DB Error] Thao tác cập nhật đơn hàng #${order._id} lỗi:`, dbError.message);
                    }
                }
            }

        } catch (error) {
            console.error('[Cron Job Exception] Lỗi nghiêm trọng:', error);
        }
    });
}

module.exports = {
    initStatusCronJob
};
