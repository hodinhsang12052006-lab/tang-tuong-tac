/**
 * server.js
 * Điểm khởi chạy chính (Entry Point) của hệ thống SMM Panel Bitpawnetwork.
 * Lắp ráp toàn bộ các module: HTML Pages, Mongoose Models, API Controllers, Webhook nạp tiền, Cron Jobs và JWT Middlewares.
 */

// Load các biến môi trường cấu hình trong tệp .env
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Import các Module Backend tự thiết lập ở các giai đoạn trước
const { User, Service } = require('./models');
const { verifyUser, verifyAdmin } = require('./authMiddleware');
const { syncAndMarkup, placeOrder, getMyOrders, getAllOrders, getServices, getAllUsers, updateOrderStatus, getAdminStats, syncViaProducts, getViaProducts, buyVia, getMyViaOrders, getAllViaOrders, saveSettings, getSetting } = require('./apiController');
const { requestDeposit, approveDeposit, rejectDeposit, getUserTransactions, getAllPendingTransactions } = require('./paymentController');
const { register, login, getProfile } = require('./authController');
const { initStatusCronJob } = require('./cronJob');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bitpawnetwork';

// Hàm tự động khởi tạo tài khoản Admin mặc định
async function seedAdminUser() {
    try {
        const adminEmail = 'hodinhsang30052003@gmail.com';
        const existingAdmin = await User.findOne({ email: adminEmail });
        
        if (!existingAdmin) {
            // Mật khẩu sẽ tự động được mã hóa (hash) bởi middleware pre('save') trong models.js
            const newAdmin = new User({
                username: 'admin',
                email: adminEmail,
                password: '123456Az@',
                balance: 1000.0,
                role: 'admin'
            });
            await newAdmin.save();
            console.log('[Database Seed] Đã tạo thành công tài khoản Admin mặc định: ' + adminEmail);
        } else {
            console.log('[Database Seed] Tài khoản Admin mặc định đã tồn tại.');
        }
    } catch (error) {
        console.error('[Database Seed Error] Lỗi tự động tạo tài khoản Admin:', error.message);
    }
}

async function seedDefaultServices() {
    try {
        const count = await Service.countDocuments();
        if (count === 0) {
            const defaultServices = [
                {
                    serviceId: "1",
                    name: "Tăng Likes Bài Viết Facebook",
                    originalPrice: 0.5,
                    sellingPrice: 0.8,
                    min: 100,
                    max: 100000,
                    speed: "10K/ngày",
                    start: "0 - 15p",
                    warranty: "Không",
                    status: true,
                    category: "Facebook"
                },
                {
                    serviceId: "2",
                    name: "Tăng Followers TikTok",
                    originalPrice: 3.0,
                    sellingPrice: 4.5,
                    min: 100,
                    max: 20000,
                    speed: "3K/ngày",
                    start: "15 - 30p",
                    warranty: "30 ngày",
                    status: true,
                    category: "TikTok"
                },
                {
                    serviceId: "3",
                    name: "Tăng Views Video YouTube",
                    originalPrice: 2.8,
                    sellingPrice: 4.2,
                    min: 500,
                    max: 100000,
                    speed: "10K/ngày",
                    start: "1 - 3h",
                    warranty: "30 ngày",
                    status: true,
                    category: "YouTube"
                }
            ];
            await Service.insertMany(defaultServices);
            console.log('[Database Seed] Đã tự động tạo các dịch vụ SMM mặc định vào MongoDB.');
        } else {
            console.log('[Database Seed] Danh sách dịch vụ SMM đã tồn tại.');
        }
    } catch (error) {
        console.error('[Database Seed Error] Lỗi tự động tạo dịch vụ SMM:', error.message);
    }
}

// ==========================================
// 1. CẤU HÌNH MIDDLEWARE HỆ THỐNG
// ==========================================
// Định nghĩa các bộ giới hạn tần suất yêu cầu (Rate Limiters)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 1000,
    message: { success: false, message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const authPaymentLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 10,
    message: { success: false, message: 'Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau 1 phút.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(globalLimiter); // Áp dụng giới hạn toàn cục
app.use(cors()); // Cho phép gọi API chéo tên miền (Cross-Origin Resource Sharing)
app.use(express.json()); // Phân tích Request Body dạng JSON
app.use(express.urlencoded({ extended: true })); // Phân tích Request Body dạng Form Urlencoded

// Phục vụ các file tĩnh trong thư mục public (ví dụ các tệp css, JS Client, ảnh, v.v.)
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 2. KẾT NỐI CƠ SỞ DỮ LIỆU MONGODB
// ==========================================
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(async () => {
    console.log('[Database] Kết nối thành công tới MongoDB Database.');
    // Tự động seed tài khoản admin
    await seedAdminUser();
    // Tự động seed dịch vụ mặc định
    await seedDefaultServices();
    
    // Khởi động tiến trình kiểm tra đơn hàng tự động chạy ngầm (chỉ chạy khi không ở môi trường Vercel Serverless)
    if (!process.env.VERCEL) {
        initStatusCronJob();
    }
})
.catch((err) => {
    console.error('[Database Error] Không thể kết nối tới MongoDB:', err.message);
    console.warn('[Database Alert] Vui lòng đảm bảo dịch vụ MongoDB đã được khởi động trên máy chủ.');
});

// ==========================================
// 3. ĐỊNH NGHĨA ROUTING TRANG GIAO DIỆN (UI Pages)
// ==========================================

// Trang chủ (Landing Page)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Bảng điều khiển khách hàng (User Dashboard)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Bảng điều khiển quản trị (Admin Dashboard)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ==========================================
// 4. ĐĂNG KÝ CÁC TUYẾN API HỆ THỐNG (API Routing)
// ==========================================

// Tuyến xác thực người dùng (Auth Register & Login)
app.post('/api/auth/register', authPaymentLimiter, register);
app.post('/api/auth/login', authPaymentLimiter, login);
app.get('/api/auth/me', verifyUser, getProfile);

// Tuyến nạp tiền thủ công (Gửi yêu cầu & Lịch sử cá nhân)
app.post('/api/payments/request', authPaymentLimiter, verifyUser, requestDeposit);
app.get('/api/payments/my-transactions', verifyUser, getUserTransactions);
app.get('/api/user/transactions', verifyUser, getUserTransactions);

// Các tuyến phê duyệt nạp tiền dành cho Admin
app.get('/api/payments/pending', verifyUser, verifyAdmin, getAllPendingTransactions);
app.get('/api/admin/transactions/pending', verifyUser, verifyAdmin, getAllPendingTransactions);
app.post('/api/payments/approve/:txId', verifyUser, verifyAdmin, approveDeposit);
app.post('/api/payments/reject/:txId', verifyUser, verifyAdmin, rejectDeposit);

// Tuyến đặt đơn hàng và lịch sử đơn hàng
app.post('/api/orders', verifyUser, placeOrder);
app.get('/api/orders/my-orders', verifyUser, getMyOrders);
app.get('/api/orders', verifyUser, getMyOrders);
app.get('/api/admin/orders', verifyUser, verifyAdmin, getAllOrders);
app.post('/api/admin/orders/update-status/:orderId', verifyUser, verifyAdmin, updateOrderStatus);
app.get('/api/admin/users', verifyUser, verifyAdmin, getAllUsers);
app.get('/api/admin/stats', verifyUser, verifyAdmin, getAdminStats);
app.get('/api/services', getServices);

// Tuyến Shop Via/Clone tích hợp
app.post('/api/via/sync', verifyUser, verifyAdmin, syncViaProducts);
app.post('/api/admin/sync-via', verifyUser, verifyAdmin, syncViaProducts);
app.get('/api/via/products', getViaProducts);
app.post('/api/via/buy', verifyUser, buyVia);
app.get('/api/via/orders', verifyUser, getMyViaOrders);
app.get('/api/admin/via-orders', verifyUser, verifyAdmin, getAllViaOrders);

// Tuyến đồng bộ API và Markup giá: Yêu cầu quyền Admin (được bảo vệ kép)
// POST /api/admin/sync-services
app.post('/api/admin/sync-services', verifyUser, verifyAdmin, syncAndMarkup);

// Cấu hình Hệ thống (Admin settings)
app.post('/api/admin/settings', verifyUser, verifyAdmin, saveSettings);
app.get('/api/admin/settings/:key', verifyUser, getSetting);

// Tuyến tỷ giá USD/VND (Binance + 3% markup)
app.get('/api/config/exchange-rate', (req, res) => {
    const baseRate = 25400;
    const markup = 1.03;
    const finalRate = Math.round(baseRate * markup);
    res.json({ success: true, rate: finalRate });
});

// Tuyến kiểm tra sức khỏe hệ thống (Health Check)
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Hệ thống SMM Panel Bitpawnetwork đang hoạt động tốt.',
        timestamp: new Date()
    });
});

// ==========================================
// 5. KHỞI CHẠY MÁY CHỦ EXPRESS SERVER
// ==========================================
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`===========================================================`);
        console.log(`🚀 Bitpawnetwork Server đang chạy trên cổng: ${PORT}`);
        console.log(`🔗 Trang chủ (Landing Page): http://localhost:${PORT}`);
        console.log(`🔗 Khách hàng (User Dashboard): http://localhost:${PORT}/dashboard`);
        console.log(`🔗 Quản trị viên (Admin Dashboard): http://localhost:${PORT}/admin`);
        console.log(`===========================================================`);
    });
}

module.exports = app;
