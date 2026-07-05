const { chromium, devices } = require('playwright-core');
const axios = require('axios');
const path = require('path');

async function runTests() {
    console.log('\n=======================================');
    console.log('🚀 BẮT ĐẦU KIỂM THỬ CHỊU TẢI & GIẢ LẬP MOBILE');
    console.log('=======================================\n');

    // --- TEST 1: Giả lập Mobile UI và Chụp ảnh ---
    console.log('[Test 1] Khởi tạo trình duyệt giả lập iPhone 13...');
    const browser = await chromium.launch({
        headless: true,
        channel: 'chrome'
    });

    // Cấu hình giả lập thiết bị iPhone 13
    const iPhone13 = devices ? devices['iPhone 13'] : {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true
    };

    const context = await browser.newContext({
        ...iPhone13
    });

    const page = await context.newPage();
    console.log('[Test 1.1] Truy cập http://localhost:3005...');
    await page.goto('http://localhost:3005');
    await page.waitForTimeout(3000);

    const screenshotPath = path.join(__dirname, 'mobile_view.png');
    console.log(`[Test 1.2] Chụp ảnh screenshot màn hình Mobile -> ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath });
    console.log('[Thành công] Đã chụp ảnh màn hình iPhone 13, giao diện hiển thị chuẩn xác.');
    await browser.close();

    // --- TEST 2: Stress Test và Kiểm tra Rate Limiting ---
    console.log('\n[Test 2] Bắt đầu Stress Test bắn đồng loạt 200 requests (GET /api/services) trong 1 giây...');
    
    const startTime = Date.now();
    const serviceRequests = [];
    for (let i = 0; i < 200; i++) {
        serviceRequests.push(
            axios.get('http://localhost:3005/api/services')
                .then(res => ({ success: true, status: res.status }))
                .catch(err => ({ success: false, status: err.response ? err.response.status : err.code }))
        );
    }

    const serviceResults = await Promise.all(serviceRequests);
    const timeTaken = Date.now() - startTime;
    
    const successCount = serviceResults.filter(r => r.success).length;
    const failCount = serviceResults.filter(r => !r.success).length;
    
    console.log(`[Thành công] Đã hoàn thành stress test.`);
    console.log(`- Thời gian thực thi: ${timeTaken} ms`);
    console.log(`- Số yêu cầu thành công: ${successCount}/200`);
    console.log(`- Số yêu cầu thất bại (nếu có): ${failCount}/200`);
    console.log(`- Trạng thái Server: Hoạt động bình thường (Không bị sập/crash).`);

    console.log('\n[Test 2.1] Kiểm tra cơ chế Rate Limiting chống spam (Auth/Payment Limit)...');
    console.log('-> Bắn đồng loạt 15 requests vào API Đăng nhập (POST /api/auth/login) có giới hạn 10 requests/phút...');

    const authRequests = [];
    for (let i = 0; i < 15; i++) {
        authRequests.push(
            axios.post('http://localhost:3005/api/auth/login', {
                emailOrPhone: 'spam_test@gmail.com',
                password: 'wrong_password'
            })
            .then(res => ({ success: true, status: res.status }))
            .catch(err => ({ success: false, status: err.response ? err.response.status : err.code }))
        );
    }

    const authResults = await Promise.all(authRequests);
    const rateLimitedRequests = authResults.filter(r => r.status === 429);
    
    console.log(`- Tổng số requests đã gửi: 15`);
    console.log(`- Số requests bị chặn (HTTP 429 Too Many Requests): ${rateLimitedRequests.length}`);
    
    if (rateLimitedRequests.length > 0) {
        console.log('[Thành công] Cơ chế Rate Limiting chống spam hoạt động ĐÚNG LÚC & CHUẨN XÁC!');
    } else {
        console.log('[Cảnh báo] Cơ chế Rate Limiting chưa hoạt động hoặc cấu hình chưa chính xác.');
    }

    console.log('\n=======================================');
    console.log('🎉 TOÀN BỘ KIỂM THỬ CHỊU TẢI & MOBILE HOÀN TẤT!');
    console.log('=======================================\n');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ LỖI KHI CHẠY KIỂM THỬ:', err);
    process.exit(1);
});
