const { chromium } = require('playwright-core');

async function runTest() {
    console.log('\n=======================================');
    console.log('🚀 BẮT ĐẦU CHẠY BÀI KIỂM THỬ E2E TRỰC QUAN TRÌNH DUYỆT (1s DELAY)');
    console.log('=======================================\n');

    // Mở trình duyệt hiển thị giao diện với slowMo: 1000ms
    const browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        slowMo: 1000
    });

    const userContext = await browser.newContext({
        viewport: { width: 1366, height: 768 }
    });
    const adminContext = await browser.newContext({
        viewport: { width: 1366, height: 768 }
    });

    const page = await userContext.newPage();

    // 1. Mở trang chủ
    console.log('[Bước 1] Mở trang chủ http://localhost:3005...');
    await page.goto('http://localhost:3005');

    // Kiểm tra logo hiển thị
    console.log('[Bước 1.1] Kiểm tra Logo cho1.jpg hiển thị ở Header...');
    const headerLogo = page.locator('header img[alt="Bitpawnetwork Logo"]');
    await headerLogo.waitFor({ state: 'visible' });
    console.log('[Thành công] Logo cho1.jpg đã hiển thị chuẩn xác.');

    // 2. Mở Modal Đăng ký
    console.log('[Bước 2] Mở modal đăng ký...');
    await page.evaluate(() => openAuthModal('register'));
    await page.waitForTimeout(1000);

    // Điền form đăng ký
    const timestamp = Date.now();
    const username = `e2e_demo_${timestamp}`;
    const email = `e2e_demo_${timestamp}@gmail.com`;

    console.log(`[Bước 2.1] Tạo tài khoản mới: ${username}...`);
    await page.fill('#register-fullname', 'Khách Hàng E2E');
    await page.fill('#register-username', username);
    await page.fill('#register-email', email);
    await page.fill('#register-phone', '0559583034');
    await page.fill('#register-password', '123456Az@');
    await page.fill('#register-confirm-password', '123456Az@');
    
    // Check Điều khoản dịch vụ
    console.log('[Bước 2.1.1] Đồng ý với điều khoản dịch vụ...');
    await page.check('#register-terms');
    
    // Submit Form
    console.log('[Bước 2.2] Submit form đăng ký...');
    await page.click('button:has-text("Tạo Tài Khoản Ngay")');

    // Chờ chuyển hướng Dashboard
    console.log('[Bước 3] Chờ chuyển hướng tới /dashboard...');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('[Thành công] Đã chuyển hướng tới Dashboard thành công.');

    // Xác nhận số dư ban đầu là $0.00
    const balanceText = await page.locator('#stat-balance').textContent();
    console.log(`[Bước 3.1] Số dư ban đầu của tài khoản: ${balanceText}`);
    if (balanceText.trim() !== '$0.00') {
        throw new Error(`Lỗi: Số dư ban đầu là ${balanceText} thay vì $0.00!`);
    }
    console.log('[Thành công] Xác nhận số dư ban đầu của ví chính xác là $0.00.');

    // 3. Khởi tạo yêu cầu nạp tiền
    console.log('[Bước 4] Chuyển sang tab Nạp tiền...');
    await page.click('#nav-add-funds');
    await page.waitForTimeout(1000);

    console.log('[Bước 4.1] Điền thông tin nạp tiền $50.00...');
    await page.fill('#deposit-amount', '50.00');
    const txId = `TX_DEMO_${timestamp}`;
    await page.fill('#deposit-txid', txId);

    console.log('[Bước 4.2] Gửi yêu cầu xác nhận nạp tiền...');
    await page.click('button:has-text("Xác nhận đã chuyển khoản")');
    await page.waitForTimeout(2000);

    // 4. Mở Admin tab mới và duyệt tiền
    console.log('[Bước 5] Mở một trình duyệt Admin độc lập...');
    const adminPage = await adminContext.newPage();
    console.log('[Bước 5.1] Truy cập trang chủ để Đăng nhập Admin...');
    await adminPage.goto('http://localhost:3005');

    // Mở modal đăng nhập trên Page 2
    await adminPage.evaluate(() => openAuthModal('login'));
    await adminPage.waitForTimeout(1000);

    console.log('[Bước 5.2] Đăng nhập tài khoản Admin...');
    await adminPage.fill('#login-identifier', 'hodinhsang30052003@gmail.com');
    await adminPage.fill('#login-password', '123456Az@');
    await adminPage.click('button:has-text("Xác Nhận Đăng Nhập")');

    // Đợi chuyển hướng và mở URL admin
    await adminPage.waitForTimeout(2000);
    await adminPage.goto('http://localhost:3005/admin');

    console.log('[Bước 6] Chuyển sang tab Quản lý nạp tiền...');
    await adminPage.click('#nav-deposits');
    await adminPage.waitForTimeout(2000);

    console.log(`[Bước 6.1] Tìm kiếm bill pending với mã TxID: ${txId}...`);
    // Thiết lập dialog auto accept cho trang Admin
    adminPage.on('dialog', async dialog => {
        console.log(`[Admin Dialog] Chấp nhận thông báo: ${dialog.message()}`);
        await dialog.accept();
    });

    const approveBtn = adminPage.locator(`tr:has-text("${txId}") button:has-text("Duyệt")`);
    await approveBtn.scrollIntoViewIfNeeded();
    await approveBtn.click();
    console.log('[Thành công] Admin đã duyệt thành công bill nạp tiền!');
    await adminPage.waitForTimeout(2500);

    // 5. Quay lại trang User và kiểm tra số dư
    console.log('[Bước 7] Trở về màn hình Khách hàng...');
    await page.bringToFront();
    console.log('[Bước 7.1] Tải lại trang (F5)...');
    await page.reload();
    await page.waitForTimeout(2000);

    const updatedBalance = await page.locator('#stat-balance').textContent();
    console.log(`[Bước 7.2] Số dư sau khi được duyệt: ${updatedBalance}`);
    if (updatedBalance.trim() !== '$50.00') {
        throw new Error(`Lỗi: Số dư sau khi duyệt nạp là ${updatedBalance} thay vì $50.00!`);
    }
    console.log('[Thành công] Xác nhận số dư ví của User đã lên $50.00 chính xác.');

    // 6. Đặt thử 1 đơn hàng mới
    console.log('[Bước 8] Thực hiện đặt đơn hàng mới...');
    await page.click('#nav-dashboard'); // Trở lại dashboard
    await page.waitForTimeout(1000);

    // Chọn dịch vụ index 1
    await page.selectOption('#order-service', { index: 1 });
    await page.fill('#order-link', 'https://facebook.com/testpost');
    await page.fill('#order-quantity', '1000');
    
    // Bấm đặt đơn
    console.log('[Bước 8.1] Gửi đơn hàng...');
    // Thiết lập dialog auto accept cho trang User
    page.on('dialog', async dialog => {
        console.log(`[User Dialog] Chấp nhận thông báo đơn hàng: ${dialog.message()}`);
        await dialog.accept();
    });
    
    await page.click('button:has-text("Tiến Hành Đặt Đơn")');
    await page.waitForTimeout(3000);

    // Xem số dư cuối cùng
    const finalBalance = await page.locator('#stat-balance').textContent();
    console.log(`[Bước 9] Số dư ví cuối cùng: ${finalBalance}`);

    console.log('\n=======================================');
    console.log('🎉 PLAYWRIGHT E2E DEMO COMPLETED SUCCESSFULLY! 🎉');
    console.log('=======================================\n');

    await browser.close();
    process.exit(0);
}

runTest().catch(err => {
    console.error('\n❌ PLAYWRIGHT E2E DEMO FAILED! ❌');
    console.error(err);
    process.exit(1);
});
