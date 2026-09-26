/**
 * apiController.js
 * Controller xử lý các chức năng cốt lõi (Business Logic) cho hệ thống SMM Panel.
 * Dự án SMM Panel: Bitpawnetwork
 */

const axios = require('axios');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { User, Service, Order, Transaction, ViaProduct, ViaOrder, SystemConfig } = require('./models');

// Bộ nhớ đệm (Cache) cho API lấy danh sách dịch vụ (được làm mới sau 5 phút)
let servicesCache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 phút (TTL)

// Cấu hình mẫu hoặc các hằng số cấu hình hệ thống
const PROVIDER_API_KEY = process.env.PROVIDER_API_KEY || 'MOCK_API_KEY_BITPAW'; // Token nhà cung cấp gốc
const PROVIDER_API_URL = process.env.PROVIDER_API_URL || 'https://subvip247.com/api/v2'; // API URL gốc
const VIA_API_KEY = process.env.VIA_API_KEY || ''; // Token nhà cung cấp Via/Clone (shopwinvia.com)
const VIA_API_URL = process.env.VIA_API_URL || 'https://shopwinvia.com/api/products.php';

/**
 * Công thức tính % markup và giá bán ra duy nhất của toàn hệ thống (SMM & Via/Clone),
 * dùng chung ở mọi nơi tính giá để tránh lệch giá giữa lúc đồng bộ/seed và lúc hiển thị/thu tiền.
 */
function computeMarkupPercent(originalPrice) {
    const price = parseFloat(originalPrice) || 0;
    return price < 0.4 ? 100 : 40;
}
function computeSellingPrice(originalPrice) {
    const price = parseFloat(originalPrice) || 0;
    const percent = computeMarkupPercent(price);
    return parseFloat((price + (price * percent / 100)).toFixed(4));
}

/**
 * ============================================================================
 * FUNCTION 1: ĐỒNG BỘ DỊCH VỤ & TỰ ĐỘNG TĂNG GIÁ (Sync & Markup)
 * Endpoint gợi ý: POST /api/admin/sync-services
 * ============================================================================
 */
async function syncAndMarkup(req, res) {
    try {
        const activeProviderUrl = PROVIDER_API_URL || 'https://subvip247.com/api/v2';
        const activeApiKey = PROVIDER_API_KEY;

        if (!activeApiKey) {
            return res.status(500).json({ success: false, message: 'Chưa cấu hình PROVIDER_API_KEY bảo mật trên máy chủ.' });
        }

        console.log(`[API Sync] Bắt đầu đồng bộ an toàn từ: ${activeProviderUrl} (áp dụng công thức giá phân tầng chung của hệ thống)`);

        // 1. Gọi API nhà cung cấp gốc bằng POST urlencoded
        const params = new URLSearchParams();
        params.append('key', activeApiKey);
        params.append('action', 'services');

        const response = await axios.post(activeProviderUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 15000
        });

        // Xác thực kết quả trả về từ Provider gốc TRƯỚC khi xóa dữ liệu cũ,
        // tránh trường hợp provider lỗi/trả dữ liệu hỏng làm catalog dịch vụ bị xóa trắng
        const rawServices = response.data;
        if (!rawServices || !Array.isArray(rawServices)) {
            console.error('[API Sync Error] Dữ liệu từ nhà cung cấp không phải là một mảng:', rawServices);
            return res.status(502).json({
                success: false,
                message: 'Nhận dữ liệu không hợp lệ từ nhà cung cấp gốc (Có thể sai API Key hoặc URL)'
            });
        }

        // 2. Xóa sạch toàn bộ dịch vụ cũ (bao gồm dịch vụ giả) sau khi đã xác nhận dữ liệu mới hợp lệ
        await Service.deleteMany({});
        console.log(`[API Sync] Đã xóa toàn bộ dịch vụ cũ trong Database.`);

        let createdCount = 0;

        // 3. Duyệt qua mảng trả về và tạo mới dịch vụ
        for (const item of rawServices) {
            const serviceId = item.service;
            const originalPrice = parseFloat(item.rate);

            if (!serviceId || isNaN(originalPrice)) continue;

            await Service.create({
                serviceId: serviceId.toString(),
                name: item.name,
                providerUrl: activeProviderUrl,
                originalPrice: originalPrice,
                markupPercent: computeMarkupPercent(originalPrice),
                sellingPrice: computeSellingPrice(originalPrice),
                status: true
            });
            createdCount++;
        }

        console.log(`[API Sync Success] Đồng bộ hoàn thành. Tạo mới: ${createdCount}`);
        
        // Xóa cache dịch vụ để các yêu cầu tiếp theo lấy dữ liệu mới từ Database
        servicesCache = null;
        cacheTime = 0;

        return res.status(200).json({
            success: true,
            message: `Đồng bộ thành công! Đã cập nhật ${createdCount} dịch vụ thực tế từ nhà cung cấp gốc.`,
            stats: { created: createdCount }
        });

    } catch (error) {
        console.error('[API Sync Crash] Lỗi đồng bộ:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi hệ thống trong quá trình đồng bộ dịch vụ.',
            error: error.message
        });
    }
}


/**
 * ============================================================================
 * FUNCTION 2: XỬ LÝ KHÁCH HÀNG ĐẶT ĐƠN HÀNG (Place Order)
 * Endpoint gợi ý: POST /api/user/orders
 * ============================================================================
 */
const activeSmmPurchases = new Set();

async function placeOrder(req, res) {
    // CHẶN HOÀN TOÀN IDOR: CHỈ SỬ DỤNG ID TỪ JWT ĐÃ ĐƯỢC XÁC THỰC
    if (!req.user || !req.user._id) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để tiếp tục.' });
    }
    const activeUserId = req.user._id;

    const userIdStr = activeUserId.toString();
    if (activeSmmPurchases.has(userIdStr)) {
        return res.status(429).json({ success: false, message: 'Đang xử lý giao dịch trước đó, vui lòng không spam!' });
    }

    activeSmmPurchases.add(userIdStr);
    const session = await mongoose.startSession();
    
    try {
        session.startTransaction();

        const activeServiceDbId = req.body.serviceId || req.body.serviceDbId;
        const { link, quantity } = req.body;

        // 1. Kiểm tra tham số cơ bản & định dạng bảo mật
        if (!activeServiceDbId || !link || !quantity) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ thông tin đặt đơn.' });
        }

        if (!mongoose.Types.ObjectId.isValid(activeServiceDbId)) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Mã dịch vụ không hợp lệ.' });
        }

        if (typeof link !== 'string' || link.trim().length === 0 || link.length > 1000) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Đường dẫn liên kết không hợp lệ.' });
        }

        const cleanLink = link.trim();
        if (!cleanLink.startsWith('http://') && !cleanLink.startsWith('https://')) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Đường dẫn phải bắt đầu bằng http:// hoặc https://' });
        }

        const parsedQuantity = parseInt(quantity, 10);
        if (isNaN(parsedQuantity) || parsedQuantity < 10) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Số lượng đặt mua tối thiểu là 10.' });
        }

        // 2. Tìm kiếm dịch vụ trong Database cục bộ của Bitpawnetwork
        const service = await Service.findById(activeServiceDbId).session(session);
        if (!service) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Dịch vụ không tồn tại trong hệ thống' });
        }

        if (!service.status) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Dịch vụ này hiện đang tạm đóng' });
        }

        // 3. Tính toán tổng chi phí đơn hàng dựa trên công thức giá phân tầng chung của hệ thống (USD)
        const calculatedSellingPrice = computeSellingPrice(service.originalPrice);
        const totalCharge = parseFloat(((calculatedSellingPrice / 1000) * quantity).toFixed(4));

        // 4. Tìm kiếm khách hàng và kiểm tra số dư (balance)
        const user = await User.findById(activeUserId).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
        }

        // Bước a: Kiểm tra số dư tài khoản
        if (user.balance < totalCharge) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: `Số dư không đủ. Cần $${totalCharge.toFixed(2)} nhưng hiện tại chỉ có $${user.balance.toFixed(2)}` 
            });
        }

        // Bước b: Trừ tiền khách hàng (an toàn trong transaction session)
        user.balance = parseFloat((user.balance - totalCharge).toFixed(4));
        await user.save({ session, validateBeforeSave: false });

        // Tạo bản ghi đơn hàng tạm thời trong Database cục bộ
        const localOrder = new Order({
            userId: user._id,
            serviceId: service._id,
            link: link,
            quantity: quantity,
            charge: totalCharge,
            status: 'Pending'
        });
        await localOrder.save({ session });

        // 5. Gọi API đẩy đơn sang nhà cung cấp gốc (SMM Panel Provider) qua POST urlencoded
        let providerOrderId = null;
        try {
            const providerUrl = service.providerUrl || PROVIDER_API_URL;
            const activeApiKey = PROVIDER_API_KEY;

            const params = new URLSearchParams();
            params.append('key', activeApiKey);
            params.append('action', 'add');
            params.append('service', service.serviceId);
            params.append('link', link);
            params.append('quantity', quantity.toString());

            const apiResponse = await axios.post(providerUrl, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            });

            if (apiResponse.data && apiResponse.data.order) {
                providerOrderId = apiResponse.data.order.toString();
            } else if (apiResponse.data && apiResponse.data.error) {
                throw new Error(`Provider API Error: ${apiResponse.data.error}`);
            } else {
                throw new Error('Định dạng phản hồi API nhà cung cấp không xác định');
            }

        } catch (apiError) {
            console.error('[API Provider Order Error] Không thể đẩy đơn sang nhà cung cấp gốc, tạo đơn nội bộ:', apiError.message);
            providerOrderId = `LOCAL_${Date.now()}`;
        }

        localOrder.providerOrderId = providerOrderId;
        localOrder.status = 'Processing';
        await localOrder.save({ session });

        await session.commitTransaction();

        console.log(`[Order Success] Khách hàng #${user.username} mua đơn #${localOrder._id} thành công. Phí: $${totalCharge}, API ID: ${providerOrderId}`);

        return res.status(201).json({
            success: true,
            message: 'Đặt đơn hàng thành công!',
            data: {
                orderId: localOrder._id,
                charge: totalCharge,
                providerOrderId: providerOrderId,
                newBalance: user.balance
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('[Place Order Exception] Lỗi nghiêm trọng:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi nghiêm trọng khi xử lý đơn hàng.',
            error: error.message
        });
    } finally {
        session.endSession();
        activeSmmPurchases.delete(userIdStr);
    }
}

async function getMyOrders(req, res) {
    try {
        const userId = req.user._id;
        // Tìm đơn hàng, populate thông tin dịch vụ
        const orders = await Order.find({ userId }).populate('serviceId', 'name').sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('[Get My Orders Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi truy vấn đơn hàng.' });
    }
}

async function getAllOrders(req, res) {
    try {
        const orders = await Order.find()
            .populate('userId', 'username email phone')
            .populate('serviceId', 'name')
            .sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('[Get All Orders Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách đơn hàng.' });
    }
}

async function getServices(req, res) {
    try {
        const now = Date.now();

        // 1. Kiểm tra nếu DB không kết nối, nạp trực tiếp từ file cấu hình JSON để chống sập
        if (mongoose.connection.readyState !== 1) {
            console.warn('[Get Services] Database không ở trạng thái Connected (ReadyState !== 1). Đọc trực tiếp từ file cấu hình services_config.json.');
            try {
                const configPath = path.join(__dirname, 'services_config.json');
                if (fs.existsSync(configPath)) {
                    const raw = fs.readFileSync(configPath, 'utf8');
                    const services = JSON.parse(raw);
                    // Áp dụng công thức giá phân tầng chung của hệ thống (USD)
                    const servicesWithBump = services.map(s => {
                        const obj = { ...s };
                        const original = obj.originalPrice !== undefined ? obj.originalPrice : (obj.original_price || 0);
                        const sellingPrice = computeSellingPrice(original);
                        const markupPercent = computeMarkupPercent(original);
                        obj.sellingPrice = sellingPrice;
                        obj.markupPercent = markupPercent;
                        if (obj.selling_price !== undefined) obj.selling_price = sellingPrice;
                        if (obj.rate !== undefined) obj.rate = sellingPrice;
                        if (obj.price !== undefined) obj.price = sellingPrice;
                        return obj;
                    });
                    return res.status(200).json({ success: true, data: servicesWithBump });
                }
            } catch (jsonErr) {
                console.error('[Get Services] Lỗi đọc file cấu hình dự phòng:', jsonErr.message);
            }
            // Trả về mảng rỗng thay vì báo lỗi 500
            return res.status(200).json({ success: true, data: [] });
        }

        // 2. Nếu DB kết nối bình thường, kiểm tra cache trước
        if (servicesCache && (now - cacheTime < CACHE_TTL)) {
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('Cache-Control', 'public, max-age=300'); // Trình duyệt cũng được cache 5 phút
            return res.status(200).json({
                success: true,
                data: servicesCache
            });
        }

        // 3. Tìm tất cả các dịch vụ đang Active từ Database
        let services = [];
        try {
            services = await Service.find({ status: true }).sort({ serviceId: 1 });
        } catch (dbFindErr) {
            console.error('[Get Services] Lỗi truy vấn DB:', dbFindErr.message);
        }
        
        // 4. Đồng bộ các dịch vụ từ file cấu hình vào DB nếu chưa có
        try {
            const configPath = path.join(__dirname, 'services_config.json');
            if (fs.existsSync(configPath)) {
                const raw = fs.readFileSync(configPath, 'utf8');
                const defaultServices = JSON.parse(raw);
                for (const ds of defaultServices) {
                    const sid = ds.serviceId ? ds.serviceId.toString() : '';
                    try {
                        const exists = await Service.findOne({ serviceId: sid });
                        if (!exists) {
                            await Service.create({
                                ...ds,
                                providerUrl: PROVIDER_API_URL,
                                markupPercent: computeMarkupPercent(ds.originalPrice),
                                sellingPrice: computeSellingPrice(ds.originalPrice)
                            });
                        }
                    } catch (itemSeedErr) {
                        console.error(`[Get Services] Lỗi seed dịch vụ #${sid}:`, itemSeedErr.message);
                    }
                }
                services = await Service.find({ status: true }).sort({ serviceId: 1 });
            }
        } catch (seedErr) {
            console.error('[Get Services] Lỗi tự động seed dịch vụ từ cấu hình:', seedErr.message);
        }

        // Áp dụng công thức giá phân tầng chung của hệ thống (USD)
        const servicesWithBump = services.map(s => {
            const obj = s.toObject ? s.toObject() : s;
            const original = obj.originalPrice !== undefined ? obj.originalPrice : (obj.original_price || 0);
            const sellingPrice = computeSellingPrice(original);
            const markupPercent = computeMarkupPercent(original);
            obj.sellingPrice = sellingPrice;
            obj.markupPercent = markupPercent;
            if (obj.selling_price !== undefined) obj.selling_price = sellingPrice;
            if (obj.rate !== undefined) obj.rate = sellingPrice;
            if (obj.price !== undefined) obj.price = sellingPrice;
            return obj;
        });

        // Cập nhật bộ nhớ đệm
        servicesCache = servicesWithBump;
        cacheTime = now;

        res.setHeader('X-Cache', 'MISS');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).json({
            success: true,
            data: servicesWithBump
        });
    } catch (error) {
        console.error('[Get Services Error]', error);
        // Trả về mảng rỗng thay vì sập server hoặc báo lỗi 500
        return res.status(200).json({ success: true, data: [] });
    }
}

async function getAllUsers(req, res) {
    try {
        const users = await User.find({}, '-password').sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            data: users
        });
    } catch (error) {
        console.error('[Get All Users Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách người dùng.' });
    }
}

async function updateOrderStatus(req, res) {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const validStatuses = ['Pending', 'Processing', 'Completed', 'Canceled', 'Partial'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Trạng thái đơn hàng không hợp lệ.' });
        }

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ.' });
        }
        
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
        }
        
        order.status = status;
        await order.save();
        
        return res.status(200).json({
            success: true,
            message: `Cập nhật trạng thái đơn hàng sang ${status} thành công!`
        });
    } catch (error) {
        console.error('[Update Order Status Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi cập nhật trạng thái đơn hàng.' });
    }
}

async function getAdminStats(req, res) {
    try {
        // Tính Total Revenue (Tổng doanh thu) = Tổng tiền của tất cả Transaction có status là 'Approved'
        const transactions = await Transaction.find({ status: 'Approved' });
        const totalRevenue = transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

        // Tính Total Users = số lượng bản ghi trong collection Users
        const totalUsers = await User.countDocuments();

        // Lấy orders để tính chi phí và lợi nhuận cho đầy đủ các ô thống kê trong admin.html
        const orders = await Order.find().populate('serviceId', 'originalPrice');
        let totalCost = 0;
        let totalSpentOnOrders = 0;
        orders.forEach(o => {
            totalSpentOnOrders += parseFloat(o.charge || 0);
            if (o.serviceId && o.serviceId.originalPrice !== undefined) {
                totalCost += parseFloat(o.serviceId.originalPrice || 0) * (o.quantity / 1000);
            } else {
                totalCost += parseFloat(o.charge || 0) * 0.7; // default fallback
            }
        });
        const totalProfit = totalSpentOnOrders - totalCost;

        return res.status(200).json({
            success: true,
            data: {
                totalRevenue: totalRevenue,
                totalUsers: totalUsers,
                totalCost: totalCost,
                totalProfit: totalProfit
            }
        });
    } catch (error) {
        console.error('[Get Admin Stats Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi truy vấn dữ liệu thống kê.' });
    }
}

const MOCK_VIA_PRODUCTS = [
    {
        productId: "via_vn_co_friends",
        name: "Via Việt Cổ 500-5000 Bạn Bè - Trọn Bộ Định Dạng",
        category: "VIA VIỆT",
        originalPrice: 3.50,
        sellingPrice: 4.90,
        stock: 45,
        country: "Vietnam",
        flag: "🇻🇳",
        friends: "500 - 5000"
    },
    {
        productId: "via_vn_new_ads",
        name: "Via Việt Clone Kháng Ads Cực Khỏe - Bao Đổi Trả 24H",
        category: "VIA VIỆT",
        originalPrice: 1.80,
        sellingPrice: 2.52,
        stock: 120,
        country: "Vietnam",
        flag: "🇻🇳",
        friends: "50 - 200"
    },
    {
        productId: "via_ph_co_2fa",
        name: "Via Phillippines Cổ Cài Sẵn Bảo Mật 2FA Cứng Cáp",
        category: "VIA NGOẠI",
        originalPrice: 4.20,
        sellingPrice: 5.88,
        stock: 22,
        country: "Philippines",
        flag: "🇵🇭",
        friends: "1000 - 3000"
    },
    {
        productId: "bm_350k_limit",
        name: "BM 350K Limit - Kháng Cáo Thành Công (Doanh Nghiệp)",
        category: "BUSINESS MANAGER",
        originalPrice: 12.00,
        sellingPrice: 16.80,
        stock: 15,
        country: "Global",
        flag: "🌐",
        friends: "N/A"
    },
    {
        productId: "clone_us_ip_sach",
        name: "Clone US Hàng Reg Bằng IP Sạch - Nuôi Trực Tiếp",
        category: "CLONE",
        originalPrice: 0.45,
        sellingPrice: 0.63,
        stock: 350,
        country: "United States",
        flag: "🇺🇸",
        friends: "0 - 50"
    }
];

// 1. Đồng bộ sản phẩm Via/Clone từ nguồn (áp dụng công thức giá phân tầng chung)
async function syncViaProducts(req, res) {
    if (!VIA_API_KEY) {
        console.warn('[syncViaProducts] Chưa cấu hình VIA_API_KEY, chỉ dùng Mock Data.');
    }
    try {
        let products = [];
        try {
            const response = await axios.get(`${VIA_API_URL}?api_key=${VIA_API_KEY}`, { timeout: 6000 });
            if (response.data && Array.isArray(response.data)) {
                products = response.data;
            } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
                products = response.data.data;
            }
        } catch (apiError) {
            console.warn('[syncViaProducts] Gọi API lỗi, chuyển sang dùng Mock Data:', apiError.message);
        }

        if (products.length === 0) {
            products = MOCK_VIA_PRODUCTS.map(p => ({
                id: p.productId,
                name: p.name,
                category: p.category,
                price: p.originalPrice,
                original_price: p.originalPrice,
                stock: p.stock,
                country: p.country,
                flag: p.flag,
                friends: p.friends
            }));
        }

        let updatedCount = 0;
        for (const item of products) {
            const originalPrice = parseFloat(item.price || item.original_price || 1.0);
            const sellingPrice = computeSellingPrice(originalPrice);

            await ViaProduct.findOneAndUpdate(
                { productId: item.id || item.productId },
                {
                    name: item.name,
                    category: item.category || 'VIA VIỆT',
                    originalPrice: originalPrice,
                    sellingPrice: sellingPrice,
                    stock: parseInt(item.stock) || 10,
                    country: item.country || 'Vietnam',
                    flag: item.flag || '🇻🇳',
                    friends: item.friends || '0 - 100',
                    status: true,
                    updatedAt: Date.now()
                },
                { upsert: true, new: true }
            );
            updatedCount++;
        }

        return res.status(200).json({
            success: true,
            message: `Đồng bộ thành công ${updatedCount} sản phẩm Via/Clone từ nguồn (Markup 40%)!`,
            count: updatedCount
        });
    } catch (error) {
        console.error('[Sync Via Products Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đồng bộ sản phẩm Via.' });
    }
}

// 2. Lấy danh sách sản phẩm Via
async function getViaProducts(req, res) {
    try {
        const products = await ViaProduct.find({ status: true }).sort({ category: 1, sellingPrice: 1 });
        // Quét qua mảng sản phẩm và nhân giá theo phân khúc (USD)
        const mappedProducts = products.map(p => {
            const obj = p.toObject ? p.toObject() : p;
            const original = obj.originalPrice !== undefined ? obj.originalPrice : 0;
            obj.sellingPrice = computeSellingPrice(original);
            return obj;
        });
        return res.status(200).json({ success: true, data: mappedProducts });
    } catch (error) {
        console.error('[Get Via Products Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách sản phẩm Via.' });
    }
}

// 3. API đặt mua Via
async function buyVia(req, res) {
    if (!req.user || !req.user._id) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để thực hiện đặt hàng.' });
    }
    const activeUserId = req.user._id;
    const { productId, quantity } = req.body;
    const qty = parseInt(quantity, 10);

    if (!productId || typeof productId !== 'string' || isNaN(qty) || qty <= 0 || qty > 1000) {
        return res.status(400).json({ success: false, message: 'Dữ liệu mua hàng không hợp lệ (số lượng từ 1 - 1000).' });
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const user = await User.findById(activeUserId).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng.' });
        }

        const product = await ViaProduct.findOne({ productId }).session(session);
        if (!product) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Không tìm thấy gói sản phẩm Via.' });
        }

        if (product.stock < qty) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Số lượng hàng trong kho không đủ.' });
        }

        // Đảm bảo logic tính tổng tiền cũng theo công thức giá phân tầng chung của hệ thống (USD)
        const original = product.originalPrice !== undefined ? product.originalPrice : 0;
        const calculatedSellingPrice = computeSellingPrice(original);
        const totalCharge = parseFloat((calculatedSellingPrice * qty).toFixed(2));

        if (user.balance < totalCharge) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: `Số dư ví không đủ. Cần $${totalCharge} nhưng hiện có $${user.balance.toFixed(2)}` });
        }

        // Trừ tiền user
        user.balance = parseFloat((user.balance - totalCharge).toFixed(2));
        await user.save({ session, validateBeforeSave: false });

        // Trừ kho
        product.stock -= qty;
        await product.save({ session });

        // Giả lập lấy Via bàn giao
        const rawAccounts = [];
        const shortCode = product.country === 'Vietnam' ? 'VN' : (product.country === 'Philippines' ? 'PH' : 'US');
        for (let i = 0; i < qty; i++) {
            const randomId = Math.floor(1000000000 + Math.random() * 9000000000);
            const pass = Math.random().toString(36).substring(2, 10);
            const twoFa = Math.random().toString(36).substring(2, 18).toUpperCase();
            rawAccounts.push(`${shortCode}_${randomId}|${pass}|${twoFa}|cookie_mock_data_for_reseller`);
        }

        // Tạo đơn hàng mua Via
        const viaOrder = await ViaOrder.create([{
            userId: user._id,
            productId: product.productId,
            productName: product.name,
            quantity: qty,
            charge: totalCharge,
            accounts: rawAccounts,
            status: 'Success'
        }], { session });

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: 'Đặt mua nguyên liệu thành công!',
            data: viaOrder[0]
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('[Buy Via Process Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi xử lý mua hàng.' });
    }
}

// 4. Lấy lịch sử mua Via của User đang đăng nhập
async function getMyViaOrders(req, res) {
    if (!req.user || !req.user._id) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để tiếp tục.' });
    }
    const activeUserId = req.user._id;

    try {
        const orders = await ViaOrder.find({ userId: activeUserId }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: orders });
    } catch (error) {
        console.error('[Get My Via Orders Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy lịch sử mua Via.' });
    }
}

// 5. Lấy toàn bộ đơn mua SMM và Via của toàn hệ thống (Admin)
async function getAllViaOrders(req, res) {
    try {
        const orders = await ViaOrder.find().populate('userId', 'username phone').sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: orders });
    } catch (error) {
        console.error('[Get All Via Orders Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy toàn bộ lịch sử mua.' });
    }
}

// Cấu hình lưu/lấy cấu hình Admin
// Các trường hợp lệ và độ dài tối đa cho phép khi lưu thông tin ngân hàng nạp tiền (chống spam/DoS dữ liệu)
const BANK_INFO_FIELDS = { bankName: 30, accountHolder: 60, accountNumber: 30, qrImageUrl: 300 };

async function saveSettings(req, res) {
    try {
        const { key, value } = req.body;
        if (!key || typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(key) || value === undefined) {
            return res.status(400).json({ success: false, message: 'Dữ liệu cấu hình không hợp lệ.' });
        }

        if (key === 'bank_info') {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                return res.status(400).json({ success: false, message: 'Thông tin ngân hàng không hợp lệ.' });
            }
            for (const field of Object.keys(value)) {
                if (!(field in BANK_INFO_FIELDS)) {
                    return res.status(400).json({ success: false, message: `Trường không hợp lệ: ${field}` });
                }
                if (typeof value[field] !== 'string' || value[field].length > BANK_INFO_FIELDS[field]) {
                    return res.status(400).json({ success: false, message: `Trường ${field} không hợp lệ hoặc quá dài.` });
                }
            }
        }

        await SystemConfig.findOneAndUpdate(
            { key },
            { key, value },
            { upsert: true, new: true }
        );
        if (key === 'global_markup') {
            // Xóa cache dịch vụ để lần sau load lại tính toán theo tỉ lệ mới
            servicesCache = null;
            cacheTime = 0;
        }
        return res.status(200).json({ success: true, message: 'Lưu cấu hình thành công.' });
    } catch (error) {
        console.error('[Save Settings Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lưu cấu hình.' });
    }
}

async function getSetting(req, res) {
    try {
        const { key } = req.params;
        if (!key || typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(key)) {
            return res.status(400).json({ success: false, message: 'Tên cấu hình không hợp lệ.' });
        }
        const config = await SystemConfig.findOne({ key });
        return res.status(200).json({
            success: true,
            data: config ? config.value : null
        });
    } catch (error) {
        console.error('[Get Setting Error]', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy cấu hình.' });
    }
}

// Thông tin ngân hàng mặc định (dùng khi Admin chưa cấu hình gì trong SystemConfig)
const DEFAULT_BANK_INFO = {
    bankName: 'Vikki',
    accountHolder: 'HODINHSANG',
    accountNumber: '559583034',
    qrImageUrl: '/stk%20nganhang.jpg'
};

// Lấy thông tin ngân hàng nạp tiền — công khai, không cần đăng nhập (giống /api/config/exchange-rate)
async function getBankInfo(req, res) {
    try {
        const config = await SystemConfig.findOne({ key: 'bank_info' });
        const info = (config && config.value && typeof config.value === 'object')
            ? { ...DEFAULT_BANK_INFO, ...config.value }
            : DEFAULT_BANK_INFO;
        return res.status(200).json({ success: true, data: info });
    } catch (error) {
        console.error('[Get Bank Info Error]', error);
        return res.status(200).json({ success: true, data: DEFAULT_BANK_INFO });
    }
}

module.exports = {
    syncAndMarkup,
    placeOrder,
    getMyOrders,
    getAllOrders,
    getServices,
    getAllUsers,
    updateOrderStatus,
    getAdminStats,
    syncViaProducts,
    getViaProducts,
    buyVia,
    getMyViaOrders,
    getAllViaOrders,
    saveSettings,
    getSetting,
    getBankInfo
};
