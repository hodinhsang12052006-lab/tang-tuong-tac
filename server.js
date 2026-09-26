const Sentry = require('@sentry/node');
require('dotenv').config();

// Khởi tạo Sentry theo dõi lỗi và hiệu năng hệ thống
Sentry.init({
    dsn: process.env.SENTRY_DSN || '<DÁN_MÃ_DSN_CỦA_BẠN_VÀO_ĐÂY>',
    tracesSampleRate: 1.0,
});

/**
 * server.js
 * Điểm khởi chạy chính (Entry Point) của hệ thống SMM Panel Bitpawnetwork.
 * Lắp ráp toàn bộ các module: HTML Pages, Mongoose Models, API Controllers, Webhook nạp tiền, Cron Jobs và JWT Middlewares.
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Import các Module Backend tự thiết lập ở các giai đoạn trước
const { User, Service } = require('./models');
const { verifyUser, verifyAdmin } = require('./authMiddleware');
const { syncAndMarkup, placeOrder, getMyOrders, getAllOrders, getServices, getAllUsers, updateOrderStatus, getAdminStats, syncViaProducts, getViaProducts, buyVia, getMyViaOrders, getAllViaOrders, saveSettings, getSetting, getBankInfo } = require('./apiController');
const { requestDeposit, approveDeposit, rejectDeposit, getUserTransactions, getAllPendingTransactions } = require('./paymentController');
const { register, login, getProfile } = require('./authController');
const { initStatusCronJob } = require('./cronJob');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bitpawnetwork';

// Tin tưởng header X-Forwarded-* từ 1 lớp proxy phía trước (Vercel/Nginx),
// bắt buộc phải có để express-rate-limit đọc đúng IP thực của client thay vì IP của proxy
app.set('trust proxy', 1);

// Hàm tự động khởi tạo tài khoản Admin mặc định (chỉ chạy khi có cấu hình trong .env)
async function seedAdminUser() {
    try {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD;

        if (!adminEmail || !adminPassword) {
            console.warn('[Database Seed] Bỏ qua tạo tài khoản Admin mặc định: thiếu ADMIN_EMAIL/ADMIN_DEFAULT_PASSWORD trong .env');
            return;
        }

        const existingAdmin = await User.findOne({ email: adminEmail });

        if (!existingAdmin) {
            // Mật khẩu sẽ tự động được mã hóa (hash) bởi middleware pre('save') trong models.js
            const newAdmin = new User({
                username: 'admin',
                email: adminEmail,
                password: adminPassword,
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
            const defaultProviderUrl = process.env.PROVIDER_API_URL || 'https://subvip247.com/api/v2';
            const defaultServices = [
                {
                    serviceId: "1",
                    name: "Tăng Likes Bài Viết Facebook",
                    providerUrl: defaultProviderUrl,
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
                    providerUrl: defaultProviderUrl,
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
                    providerUrl: defaultProviderUrl,
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
// Phục vụ các file tĩnh trong thư mục public với bộ đệm (Caching) tối ưu hiệu năng
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Tăng tốc độ tải trang, giảm tải CPU khi có hàng ngàn lượt truy cập đồng thời
    etag: true
}));

// Định nghĩa các bộ giới hạn tần suất yêu cầu (Rate Limiters)
// Cho phép tải mượt mà hơn 3000 requests / 15 phút, chống DoS/DDoS mà không làm nghẽn lượng truy cập lớn
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 3000, // Đảm bảo đáp ứng 1000+ requests liên tục mà không bao giờ bị nghẽn
    message: { success: false, message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 60, // Nâng trần cho các thao tác đăng ký / đăng nhập hợp lệ
    message: { success: false, message: 'Quá nhiều yêu cầu xác thực. Vui lòng chờ 1 phút.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const paymentLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 30,
    message: { success: false, message: 'Bạn đang gửi yêu cầu nạp tiền quá nhanh. Vui lòng thử lại sau 1 phút.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Bảo vệ tiêu đề HTTP & chống tấn công Clickjacking / Sniffing
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Áp dụng giới hạn rate limit riêng cho các tuyến /api
app.use('/api', apiLimiter);
// Giới hạn CORS về (các) origin frontend đã khai báo trong .env (phân tách bằng dấu phẩy nếu nhiều origin)
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
}));
app.use(express.json({ limit: '5mb' })); // Hỗ trợ JSON an toàn
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

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

// Middleware đảm bảo kết nối MongoDB trước khi xử lý yêu cầu (Hỗ trợ Vercel Serverless Cold Start)
app.use(async (req, res, next) => {
    if (mongoose.connection.readyState === 0) {
        try {
            await mongoose.connect(MONGO_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
        } catch (err) {
            console.error('[Serverless DB Connect Error]', err.message);
        }
    }
    next();
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
app.post('/api/auth/register', authLimiter, register);
app.post('/api/auth/login', authLimiter, login);
app.get('/api/auth/me', verifyUser, getProfile);

// Tuyến nạp tiền thủ công (Gửi yêu cầu & Lịch sử cá nhân)
app.post('/api/payments/request', paymentLimiter, verifyUser, requestDeposit);
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
app.get('/api/admin/settings/:key', verifyUser, verifyAdmin, getSetting);

// Tuyến thông tin ngân hàng nạp tiền (công khai, Admin chỉnh qua /api/admin/settings key=bank_info)
app.get('/api/config/bank-info', getBankInfo);

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
// 4.5. BỘ XỬ LÝ LỖI TOÀN CỤC & CHỐNG SẬP MÁY CHỦ (ANTI-CRASH)
// ==========================================
app.use((err, req, res, next) => {
    // Ghi nhận lỗi tới Sentry Dashboard
    if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(err);
    }
    // Tuyệt đối không để lộ stack trace hoặc cấu trúc thư mục ra ngoài client
    console.error('[Protected Error Handler]', err.message || err);
    if (err.type === 'entity.parse.failed' || err.status === 400) {
        return res.status(400).json({ success: false, message: 'Dữ liệu yêu cầu không hợp lệ.' });
    }
    return res.status(err.status || 500).json({
        success: false,
        message: 'Đã xảy ra lỗi hệ thống nội bộ. Vui lòng thử lại sau.'
    });
});

// Chống sập tiến trình Node.js khi gặp lỗi ngoại lệ hoặc unhandled promise
process.on('uncaughtException', (err) => {
    console.error('[SECURITY ANTI-CRASH - Uncaught Exception]:', err.message || err);
    if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(err);
    }
    // Lỗi khởi động cổng (vd: cổng đã bị chiếm) là lỗi KHÔNG THỂ tự phục hồi —
    // phải để tiến trình thoát hẳn (thay vì "chống sập" và sống sót ở trạng thái treo,
    // gây zombie process âm thầm chiếm kết nối MongoDB, giành tài nguyên với tiến trình chạy thật)
    if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
        console.error('[FATAL] Không thể khởi động server (lỗi cổng). Thoát tiến trình.');
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('[SECURITY ANTI-CRASH - Unhandled Rejection]:', reason);
    if (Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(reason);
    }
});

// ==========================================
// 5. KHỞI CHẠY MÁY CHỦ EXPRESS SERVER
// ==========================================
// Cấu hình middleware bắt lỗi Sentry ngay trước dòng app.listen
Sentry.setupExpressErrorHandler(app);

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
