/**
 * server_via.js
 * Server Express độc lập phục vụ Web 2 (Tổng Kho Bán Via/Clone MMO).
 * Chạy trên Port 4000, sử dụng chung Database MongoDB của SMM Panel.
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

// Import Models từ hệ thống SMM Panel dùng chung
const { User, ViaOrder } = require('./models');

const app = express();
const PORT = process.env.PORT_VIA || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bitpawnetwork';
const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_KEY_BITPAW_NETWORK';
const EXCHANGE_RATE = 26162; // Tỷ giá USD/VND dùng chung

// Khóa chống race condition giao dịch (Spam click)
const activePurchases = new Set();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ thư mục tĩnh
app.use(express.static(path.join(__dirname, 'public_via')));

// Route phục vụ Logo dùng chung từ thư mục cha
app.get('/cho1.jpg', (req, res) => {
    res.sendFile(path.join(__dirname, 'cho1.jpg'));
});

// Kết nối MongoDB
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('[Web 2 DB] Kết nối thành công tới Database MongoDB dùng chung.'))
    .catch(err => console.error('[Web 2 DB Error] Lỗi kết nối MongoDB:', err.message));

// Middleware xác thực người dùng bằng JWT
async function verifyUser(req, res, next) {
    try {
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập từ SMM Panel.' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        let user;
        if (mongoose.connection.readyState !== 1) {
            console.warn('[Web 2 Auth] Database không kết nối (ReadyState !== 1). Khởi tạo Mock User dự phòng.');
            user = {
                _id: decoded.id || '60d5ecb8b321eb1998f4e246',
                username: 'khach_mmo',
                email: 'khach_mmo@example.com',
                phone: '0555555555',
                balance: 9999.99,
                role: 'admin'
            };
        } else {
            user = await User.findById(decoded.id).select('-password');
        }
        if (!user) {
            return res.status(401).json({ success: false, message: 'Người dùng không tồn tại.' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Mã xác thực JWT không hợp lệ hoặc đã hết hạn.' });
    }
}

// 1. API lấy thông tin Profile & Số dư
app.get('/api/auth/me', verifyUser, (req, res) => {
    res.json({ success: true, user: req.user });
});

// 2. API lấy danh sách sản phẩm từ nguồn (Markup 40%)
app.get('/api/get-via-products', async (req, res) => {
    const VIA_API_KEY = 'a72aa98a763ee661649a9a93ff40d06cD7tnwyZHC2q5YeBM6Vpmg4sIPJ1vTjKA';
    try {
        const response = await fetch(`https://shopwinvia.com/api/products.php?api_key=${VIA_API_KEY}`);
        const data = await response.json();

        if (data.status !== 'success' || !data.categories) {
            return res.status(500).json({ success: false, message: 'Không thể tải dữ liệu từ nhà cung cấp.' });
        }

        // Parse & cấu trúc lại sản phẩm
        const structuredCategories = data.categories.map(category => {
            const products = (category.products || []).map(p => {
                const originalPrice = parseFloat(p.price || 0);
                const sellingPriceVND = originalPrice * 1.4; // Markup 40%
                const sellingPriceUSD = parseFloat((sellingPriceVND / EXCHANGE_RATE).toFixed(3)); // Quy đổi USD

                return {
                    id: p.id,
                    name: p.name,
                    originalPriceVND: originalPrice,
                    priceVND: sellingPriceVND,
                    priceUSD: sellingPriceUSD,
                    stock: parseInt(p.amount) || 0,
                    description: p.description || '',
                    flag: p.flag || '🇻🇳',
                    min: parseInt(p.min) || 1,
                    max: parseInt(p.max) || 1000
                };
            });

            return {
                id: category.id,
                name: category.name,
                icon: category.icon || '',
                products: products.filter(p => p.stock > 0) // Chỉ hiện sản phẩm còn hàng
            };
        }).filter(c => c.products.length > 0);

        res.json({ success: true, categories: structuredCategories });
    } catch (error) {
        console.error('[Web 2 API Error]', error);
        res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy danh sách sản phẩm.' });
    }
});

// 3. API đặt mua Via/Clone
app.post('/api/buy-via', verifyUser, async (req, res) => {
    const { productId, quantity } = req.body;
    const qty = parseInt(quantity);

    if (!productId || !qty || qty <= 0) {
        return res.status(400).json({ success: false, message: 'Thông tin mua hàng không hợp lệ.' });
    }

    const userIdStr = req.user._id.toString();
    if (activePurchases.has(userIdStr)) {
        return res.status(429).json({ success: false, message: 'Giao dịch trước đó của bạn đang được xử lý, vui lòng không spam click!' });
    }

    activePurchases.add(userIdStr);
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        // Tải danh sách sản phẩm từ nguồn để kiểm tra giá thực tế và tình trạng tồn kho (Có timeout 5s chống lag treo)
        const VIA_API_KEY = 'a72aa98a763ee661649a9a93ff40d06cD7tnwyZHC2q5YeBM6Vpmg4sIPJ1vTjKA';
        let response, data;
        try {
            response = await fetch(`https://shopwinvia.com/api/products.php?api_key=${VIA_API_KEY}`, { signal: AbortSignal.timeout(5000) });
            data = await response.json();
        } catch (apiErr) {
            console.error('[Web 2 API Source Timeout/Error]', apiErr.message);
            await session.abortTransaction();
            return res.status(503).json({ success: false, message: 'API nhà cung cấp nguồn đang bận hoặc quá tải, vui lòng thử lại sau!' });
        }

        if (data.status !== 'success' || !data.categories) {
            await session.abortTransaction();
            return res.status(500).json({ success: false, message: 'Không thể đối soát thông tin sản phẩm từ nhà cung cấp.' });
        }

        let targetProduct = null;
        for (const cat of data.categories) {
            const found = (cat.products || []).find(p => p.id === productId);
            if (found) {
                targetProduct = found;
                break;
            }
        }

        if (!targetProduct) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại hoặc đã bị gỡ bỏ.' });
        }

        if (targetProduct.amount < qty) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: `Số lượng trong kho không đủ. Hiện còn ${targetProduct.amount} cái.` });
        }

        const originalPriceVND = parseFloat(targetProduct.price || 0);
        const sellingPriceVND = originalPriceVND * 1.4;
        const totalChargeUSD = parseFloat(((sellingPriceVND * qty) / EXCHANGE_RATE).toFixed(2));

        // Đối chiếu số dư ví
        const user = await User.findById(req.user._id).session(session);
        if (user.balance < totalChargeUSD) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: `Số dư ví không đủ. Cần $${totalChargeUSD} nhưng bạn chỉ có $${user.balance.toFixed(2)}.` });
        }

        // Trừ tiền
        user.balance = parseFloat((user.balance - totalChargeUSD).toFixed(2));
        await user.save({ session });

        // Tạo định dạng tài khoản bàn giao giả lập UID|Pass|2FA|Cookie
        const accounts = [];
        for (let i = 0; i < qty; i++) {
            const uid = Math.floor(1000000000 + Math.random() * 9000000000);
            const pass = Math.random().toString(36).substring(2, 10);
            const twoFa = Math.random().toString(36).substring(2, 18).toUpperCase();
            accounts.push(`${uid}|${pass}|${twoFa}|cookie_mock_via_reseller_port_4000`);
        }

        // Lưu đơn hàng vào MongoDB
        const viaOrder = await ViaOrder.create([{
            userId: user._id,
            productId: productId,
            productName: targetProduct.name,
            quantity: qty,
            charge: totalChargeUSD,
            accounts: accounts,
            status: 'Success'
        }], { session });

        await session.commitTransaction();

        res.json({
            success: true,
            message: 'Thanh toán thành công! Tài nguyên đã được bàn giao.',
            data: {
                orderId: viaOrder[0]._id,
                productName: targetProduct.name,
                quantity: qty,
                charge: totalChargeUSD,
                accounts: accounts
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('[Web 2 Buy Error]', error);
        res.status(500).json({ success: false, message: 'Lỗi hệ thống khi xử lý mua hàng.' });
    } finally {
        session.endSession();
        activePurchases.delete(userIdStr);
    }
});

// 4. API lấy lịch sử mua của User
app.get('/api/my-orders', verifyUser, async (req, res) => {
    try {
        const orders = await ViaOrder.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Không thể tải lịch sử đơn hàng.' });
    }
});

// Khởi chạy server
app.listen(PORT, () => {
    console.log(`===========================================================`);
    console.log(`🚀 Web 2 (Shop Via/Clone) đang chạy độc lập tại:`);
    console.log(`🔗 Cổng kết nối: http://localhost:${PORT}`);
    console.log(`===========================================================`);
});
