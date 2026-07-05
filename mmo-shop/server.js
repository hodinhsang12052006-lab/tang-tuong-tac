/**
 * server.js
 * Backend chính cho MMO Reseller Shop
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sourceApi = require('./sourceApi');

const app = express();
const PORT = 3006;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// --- Helper Functions to Load and Save data ---
function readConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            return { api_key: "MOCK_API_KEY_WINVIA", markup_percent: 15 };
        }
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        return { api_key: "MOCK_API_KEY_WINVIA", markup_percent: 15 };
    }
}

function writeConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function readDb() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            return { users: {} };
        }
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
        return { users: {} };
    }
}

function writeDb(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// --- Endpoints ---

// Đăng nhập không mật khẩu bằng số điện thoại
app.post('/api/auth/login', (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp số điện thoại' });
    }

    const db = readDb();
    if (!db.users[phone]) {
        // Tạo tài khoản mới mặc định cấp $150
        db.users[phone] = {
            username: phone,
            balance: 150.00,
            purchases: [],
            deposits: []
        };
        writeDb(db);
    }

    return res.status(200).json({
        success: true,
        user: db.users[phone]
    });
});

// Lấy thông tin cá nhân của User
app.get('/api/user/profile', (req, res) => {
    const { phone } = req.query;
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Thiếu số điện thoại' });
    }

    const db = readDb();
    const user = db.users[phone];
    if (!user) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    return res.status(200).json({ success: true, user });
});

// Lấy danh sách sản phẩm (kéo từ API nguồn và cộng thêm % lợi nhuận)
app.get('/api/products', async (req, res) => {
    const config = readConfig();
    const products = await sourceApi.fetchProducts(config.api_key);
    
    // Cộng thêm markup lợi nhuận do Admin thiết lập
    const markupMultiplier = 1 + (parseFloat(config.markup_percent) / 100);
    
    const formattedProducts = products.map(p => {
        const sellingPrice = parseFloat((p.original_price * markupMultiplier).toFixed(2));
        return {
            id: p.id,
            name: p.name,
            category: p.category,
            country: p.country || 'Global',
            flag: p.flag || '🌐',
            friends: p.friends || '0 - 100',
            original_price: p.original_price, // giữ giá gốc cho backend tính lợi nhuận
            selling_price: sellingPrice,
            stock: p.stock
        };
    });

    return res.status(200).json({
        success: true,
        data: formattedProducts,
        markup_percent: config.markup_percent
    });
});

// Mua sản phẩm
app.post('/api/buy', async (req, res) => {
    const { phone, productId, quantity } = req.body;
    const qty = parseInt(quantity);
    
    if (!phone || !productId || !qty || qty <= 0) {
        return res.status(400).json({ success: false, message: 'Dữ liệu mua hàng không hợp lệ' });
    }

    const db = readDb();
    const user = db.users[phone];
    if (!user) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng' });
    }

    const config = readConfig();
    const products = await sourceApi.fetchProducts(config.api_key);
    const product = products.find(p => p.id === productId);

    if (!product) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm này' });
    }

    if (product.stock < qty) {
        return res.status(400).json({ success: false, message: 'Số lượng hàng trong kho không đủ' });
    }

    const markupMultiplier = 1 + (parseFloat(config.markup_percent) / 100);
    const sellingPrice = parseFloat((product.original_price * markupMultiplier).toFixed(2));
    const totalCharge = parseFloat((sellingPrice * qty).toFixed(2));

    if (user.balance < totalCharge) {
        return res.status(400).json({ success: false, message: `Số dư tài khoản không đủ. Cần $${totalCharge} nhưng chỉ có $${user.balance.toFixed(2)}` });
    }

    // Giảm số dư user
    user.balance = parseFloat((user.balance - totalCharge).toFixed(2));
    
    // Giả lập lấy tài nguyên trả về
    const rawAccounts = [];
    const countries = { "Vietnam": "VN", "Philippines": "PH", "United States": "US" };
    const shortCode = countries[product.country] || "GLOBAL";
    
    for (let i = 0; i < qty; i++) {
        const randomId = Math.floor(1000000000 + Math.random() * 9000000000);
        const pass = Math.random().toString(36).substring(2, 10);
        const twoFa = Math.random().toString(36).substring(2, 18).toUpperCase();
        rawAccounts.push(`${shortCode}_${randomId}|${pass}|${twoFa}|cookie_mock_data_for_login`);
    }

    // Lưu giao dịch mua
    const purchaseRecord = {
        purchaseId: 'MMO_' + Date.now() + Math.floor(Math.random() * 100),
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitPrice: sellingPrice,
        originalUnitPrice: product.original_price,
        totalCharge: totalCharge,
        accounts: rawAccounts,
        createdAt: new Date().toISOString()
    };

    user.purchases.unshift(purchaseRecord);
    writeDb(db);

    return res.status(200).json({
        success: true,
        message: 'Mua tài khoản thành công!',
        purchase: purchaseRecord,
        newBalance: user.balance
    });
});

// Nạp tiền thủ công (Gửi bill nạp)
app.post('/api/deposit', (req, res) => {
    const { phone, amountVnd, txid } = req.body;
    const amount = parseFloat(amountVnd);
    if (!phone || !amount || amount <= 0 || !txid) {
        return res.status(400).json({ success: false, message: 'Thông tin nạp tiền không hợp lệ' });
    }

    const db = readDb();
    const user = db.users[phone];
    if (!user) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng' });
    }

    // Tỷ giá cứng nạp tiền MMO: 1 USD = 25,000 VNĐ
    const usdAmount = parseFloat((amount / 25000).toFixed(2));

    const depositRecord = {
        txid: txid,
        amountVnd: amount,
        amountUsd: usdAmount,
        status: 'Pending', // Pending chờ admin duyệt
        createdAt: new Date().toISOString()
    };

    user.deposits.unshift(depositRecord);
    writeDb(db);

    return res.status(200).json({
        success: true,
        message: 'Đã gửi yêu cầu nạp tiền! Chờ Admin phê duyệt.',
        deposit: depositRecord
    });
});

// --- ADMIN API ENDPOINTS ---

// Lấy cấu hình hệ thống
app.get('/api/config', (req, res) => {
    const config = readConfig();
    return res.status(200).json({ success: true, config });
});

// Cập nhật cấu hình hệ thống
app.post('/api/config', (req, res) => {
    const { api_key, markup_percent } = req.body;
    if (markup_percent === undefined) {
        return res.status(400).json({ success: false, message: 'Thiếu phần trăm lợi nhuận' });
    }

    const config = {
        api_key: api_key || 'MOCK_API_KEY_WINVIA',
        markup_percent: parseFloat(markup_percent)
    };

    writeConfig(config);
    return res.status(200).json({ success: true, message: 'Đã cập nhật cấu hình hệ thống!', config });
});

// Duyệt nạp tiền cho user
app.post('/api/admin/approve-deposit', (req, res) => {
    const { phone, txid } = req.body;
    if (!phone || !txid) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin phê duyệt' });
    }

    const db = readDb();
    const user = db.users[phone];
    if (!user) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const deposit = user.deposits.find(d => d.txid === txid);
    if (!deposit) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch nạp tiền' });
    }

    if (deposit.status !== 'Pending') {
        return res.status(400).json({ success: false, message: 'Giao dịch này đã được xử lý từ trước' });
    }

    // Cộng số dư
    deposit.status = 'Success';
    user.balance = parseFloat((user.balance + deposit.amountUsd).toFixed(2));
    writeDb(db);

    return res.status(200).json({
        success: true,
        message: `Phê duyệt thành công! Cộng thêm $${deposit.amountUsd} cho người dùng.`,
        newBalance: user.balance
    });
});

// Lấy danh sách toàn bộ các yêu cầu nạp tiền trong hệ thống
app.get('/api/admin/deposits', (req, res) => {
    const db = readDb();
    const allDeposits = [];
    Object.keys(db.users).forEach(phone => {
        const user = db.users[phone];
        user.deposits.forEach(d => {
            allDeposits.push({
                phone: phone,
                ...d
            });
        });
    });
    return res.status(200).json({ success: true, data: allDeposits });
});

// Lấy toàn bộ lịch sử đơn hàng bán được và thống kê doanh thu lợi nhuận
app.get('/api/admin/stats', (req, res) => {
    const db = readDb();
    let totalOrdersCount = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    const allPurchases = [];

    Object.keys(db.users).forEach(phone => {
        const user = db.users[phone];
        user.purchases.forEach(p => {
            totalOrdersCount++;
            totalRevenue += p.totalCharge;
            // Lợi nhuận = bán ra - gốc
            const cost = p.originalUnitPrice * p.quantity;
            const profit = p.totalCharge - cost;
            totalProfit += profit;

            allPurchases.push({
                phone: phone,
                ...p,
                cost: cost,
                profit: profit
            });
        });
    });

    return res.status(200).json({
        success: true,
        stats: {
            totalOrders: totalOrdersCount,
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            totalProfit: parseFloat(totalProfit.toFixed(2))
        },
        purchases: allPurchases
    });
});

// Khởi động cổng lắng nghe
app.listen(PORT, () => {
    console.log(`==========================================`);
    console.log(`🚀 MMO Reseller Shop Server is running at:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`==========================================`);
});
