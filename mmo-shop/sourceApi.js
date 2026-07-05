/**
 * sourceApi.js
 * Module kết nối và tích hợp dữ liệu với API nguồn shopwinvia.com
 */
const axios = require('axios');

const BASE_URL = 'https://shopwinvia.com';

// Danh sách sản phẩm mẫu (Fallback Mock Data) phòng khi API Key chưa có hoặc API lỗi
const MOCK_PRODUCTS = [
    {
        id: "via_vn_co_friends",
        name: "Via Việt Cổ 500-5000 Bạn Bè - Trọn Bộ Định Dạng",
        category: "VIA VIỆT",
        country: "Vietnam",
        flag: "🇻🇳",
        friends: "500 - 5000",
        original_price: 3.50, // Giá gốc USD từ nguồn
        stock: 45
    },
    {
        id: "via_vn_new_ads",
        name: "Via Việt Clone Kháng Ads Cực Khỏe - Bao Đổi Trả 24H",
        category: "VIA VIỆT",
        country: "Vietnam",
        flag: "🇻🇳",
        friends: "50 - 200",
        original_price: 1.80,
        stock: 120
    },
    {
        id: "via_ph_co_2fa",
        name: "Via Phillippines Cổ Cài Sẵn Bảo Mật 2FA Cứng Cáp",
        category: "VIA NGOẠI",
        country: "Philippines",
        flag: "🇵🇭",
        friends: "1000 - 3000",
        original_price: 4.20,
        stock: 22
    },
    {
        id: "bm_350k_limit",
        name: "BM 350K Limit - Kháng Cáo Thành Công (Doanh Nghiệp)",
        category: "BUSINESS MANAGER",
        country: "Global",
        flag: "🌐",
        friends: "N/A",
        original_price: 12.00,
        stock: 15
    },
    {
        id: "clone_us_ip_sach",
        name: "Clone US Hàng Reg Bằng IP Sạch - Nuôi Trực Tiếp",
        category: "CLONE",
        country: "United States",
        flag: "🇺🇸",
        friends: "0 - 50",
        original_price: 0.45,
        stock: 350
    }
];

/**
 * Lấy danh sách sản phẩm từ nguồn shopwinvia.com
 * @param {string} apiKey - API Key cấu hình từ Admin
 * @returns {Promise<Array>}
 */
async function fetchProducts(apiKey) {
    if (!apiKey || apiKey === 'YOUR_API_KEY' || apiKey.startsWith('MOCK_')) {
        console.log('[API Source] Sử dụng dữ liệu giả lập (Mock Data).');
        return MOCK_PRODUCTS;
    }

    try {
        const response = await axios.get(`${BASE_URL}/api/products.php`, {
            params: { api_key: apiKey },
            timeout: 5000
        });
        
        // Giả sử API trả về dạng JSON array hoặc { success: true, data: [...] }
        if (response.data && Array.isArray(response.data)) {
            return response.data;
        } else if (response.data && response.data.data) {
            return response.data.data;
        }
        
        return MOCK_PRODUCTS;
    } catch (error) {
        console.error('[API Source Error] Lỗi fetch sản phẩm từ shopwinvia:', error.message);
        // Fallback về mock data để giao diện luôn chạy mượt mà
        return MOCK_PRODUCTS;
    }
}

/**
 * Xem chi tiết đơn hàng từ nguồn
 * @param {string} apiKey 
 * @param {string} orderId 
 * @returns {Promise<Object>}
 */
async function fetchOrderDetails(apiKey, orderId) {
    if (!apiKey || apiKey === 'YOUR_API_KEY' || apiKey.startsWith('MOCK_')) {
        return {
            success: true,
            order_id: orderId,
            status: "Success",
            purchased_accounts: [
                "via_viet_co_login|pass123|2FA_KEY_MOCK",
                "via_viet_co_login2|pass1234|2FA_KEY_MOCK2"
            ]
        };
    }

    try {
        const response = await axios.get(`${BASE_URL}/api/order.php`, {
            params: { api_key: apiKey, order_id: orderId },
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error('[API Source Error] Lỗi fetch chi tiết đơn hàng:', error.message);
        return { success: false, message: error.message };
    }
}

module.exports = {
    fetchProducts,
    fetchOrderDetails,
    MOCK_PRODUCTS
};
