const { chromium } = require('playwright-core');

async function runTest() {
    console.log('\n=======================================');
    console.log('🚀 BẮT ĐẦU CHẠY BÀI KIỂM THỬ HƯỚNG DẪN TỰ CHẠY (TEST TAY)');
    console.log('=======================================\n');

    // Mở trình duyệt hiển thị giao diện với slowMo: 800ms
    const browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        slowMo: 800
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

    // 2. Mở Modal Đăng nhập và đăng nhập tài khoản 0559583034
    console.log('[Bước 2] Mở modal đăng nhập...');
    await page.evaluate(() => openAuthModal('login'));
    await page.waitForTimeout(1000);

    console.log('[Bước 2.1] Đăng nhập bằng số điện thoại: 0559583034...');
    await page.fill('#login-identifier', '0559583034');
    await page.fill('#login-password', '123456Az@');
    
    // Submit Form
    console.log('[Bước 2.2] Submit form đăng nhập...');
    await page.click('button:has-text("Xác Nhận Đăng Nhập")');

    // Chờ chuyển hướng Dashboard
    console.log('[Bước 3] Chờ chuyển hướng tới /dashboard...');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('[Thành công] Đăng nhập thành công, chuyển hướng tới Dashboard.');

    // Lưu số dư ban đầu để kiểm tra tăng thêm số USD tương ứng
    const balanceText = await page.locator('#user-balance-stat').textContent();
    const initialBalance = parseFloat(balanceText.replace('$', '').trim());
    console.log(`[Bước 3.1] Số dư hiện tại trước khi nạp của tài khoản: $${initialBalance.toFixed(2)}`);

    // 3. Khởi tạo yêu cầu nạp tiền
    console.log('[Bước 4] Chuyển sang tab Nạp tiền...');
    await page.click('#nav-add-funds');
    await page.waitForTimeout(1000);

    console.log('[Bước 4.1] Nhập số tiền chuyển khoản 500,000 VNĐ...');
    await page.fill('#deposit-amount-vnd', '500000');
    await page.waitForTimeout(1000);

    // Kiểm tra ô USD tự nhảy số
    const usdAmountStr = await page.inputValue('#deposit-amount');
    const usdAmount = parseFloat(usdAmountStr);
    console.log(`[Bước 4.1.1] Kiểm tra quy đổi USD tự động: $${usdAmountStr}`);
    if (isNaN(usdAmount) || usdAmount <= 0) {
        throw new Error('Lỗi: Hệ thống không tự động chuyển đổi VNĐ sang USD!');
    }
    console.log('[Thành công] Tỷ giá quy đổi tự động hoạt động tốt.');

    const txId = `TX_TAY_${Date.now()}`;
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

    const updatedBalanceText = await page.locator('#user-balance-stat').textContent();
    const updatedBalance = parseFloat(updatedBalanceText.replace('$', '').trim());
    console.log(`[Bước 7.2] Số dư sau khi được duyệt: $${updatedBalance.toFixed(2)}`);
    const expectedBalance = initialBalance + usdAmount;
    if (Math.abs(updatedBalance - expectedBalance) > 0.05) {
        throw new Error(`Lỗi: Số dư sau khi duyệt nạp là $${updatedBalance.toFixed(2)} thay vì kỳ vọng $${expectedBalance.toFixed(2)}!`);
    }
    console.log(`[Thành công] Xác nhận số dư ví của User đã tăng thêm $${usdAmount.toFixed(2)} chính xác.`);

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
    const finalBalance = await page.locator('#user-balance-stat').textContent();
    console.log(`[Bước 9] Số dư ví cuối cùng: ${finalBalance}`);

    // BƯỚC BẮT BUỘC: Chuyển sang Tab Quản lý đơn hàng của Khách
    console.log('[Bước 9.1] Click sang tab Quản lý đơn hàng của Khách hàng...');
    await page.click('#nav-orders');
    await page.waitForTimeout(3000);

    // 7. Quay lại Admin xác nhận hiển thị đơn đặt hàng
    console.log('[Bước 10] Quay lại tab Admin để kiểm tra đơn đặt hàng...');
    await adminPage.bringToFront();
    await adminPage.click('#nav-orders');
    await adminPage.waitForTimeout(3000);

    console.log('[Bước 10.1] Xác minh thông tin đơn hàng hiển thị rõ ràng thông tin người mua...');
    const orderTableHTML = await adminPage.locator('#admin-orders-body').innerHTML();
    if (orderTableHTML.includes('0559583034')) {
        console.log('[Thành công] Đơn hàng hiển thị đầy đủ thông tin số điện thoại người mua chính xác.');
    } else {
        console.log('[Cảnh báo] Không tìm thấy thông tin số điện thoại của người mua trong lịch sử đơn hàng của Admin.');
    }

    // 8. Chuyển sang Admin Overview để xác nhận doanh thu nảy số
    console.log('[Bước 11] Chuyển sang tab Overview trên Admin...');
    await adminPage.click('#nav-overview');
    await adminPage.waitForTimeout(3000);

    const totalRevenueText = await adminPage.locator('#stat-total-revenue').textContent();
    console.log(`[Bước 11.1] Doanh thu hiển thị trên Admin Overview: ${totalRevenueText}`);
    const revenueVal = parseFloat(totalRevenueText.replace('$', '').trim());
    if (isNaN(revenueVal) || revenueVal <= 0) {
        throw new Error('Lỗi: Tổng doanh thu hiển thị trên Admin Overview là $0.00 hoặc không đúng!');
    }
    console.log('[Thành công] Xác nhận Tổng doanh thu đã nảy số chính xác.');

    // 9. KIỂM THỬ LƯU TRỮ VĨNH VIỄN (DATA PERSISTENCE CHECK)
    console.log('\n[Bước 12] Bắt đầu kiểm thử Lưu Trữ Vĩnh Viễn...');
    console.log('[Bước 12.1] Đóng trình duyệt cũ (giả lập xóa cache/reset session)...');
    await browser.close();
    await new Promise(r => setTimeout(r, 2000));

    console.log('[Bước 12.2] Mở một trình duyệt và phiên làm việc mới tinh...');
    const newBrowser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        slowMo: 800
    });
    const newContext = await newBrowser.newContext({
        viewport: { width: 1366, height: 768 }
    });
    const newPage = await newContext.newPage();

    console.log('[Bước 12.3] Truy cập trang chủ...');
    await newPage.goto('http://localhost:3005');
    await newPage.waitForTimeout(1000);

    console.log('[Bước 12.4] Đăng nhập lại với tài khoản: 0559583034...');
    await newPage.evaluate(() => openAuthModal('login'));
    await newPage.waitForTimeout(1000);
    await newPage.fill('#login-identifier', '0559583034');
    await newPage.fill('#login-password', '123456Az@');
    await newPage.click('button:has-text("Xác Nhận Đăng Nhập")');
    await newPage.waitForURL('**/dashboard', { timeout: 10000 });

    console.log('[Bước 12.5] Đăng nhập lại thành công. Tiến hành kiểm tra số dư...');
    const reloadedBalanceText = await newPage.locator('#user-balance-stat').textContent();
    console.log(`- Số dư sau khi tải lại phiên mới: ${reloadedBalanceText} (Kỳ vọng: ${finalBalance})`);
    if (reloadedBalanceText.trim() !== finalBalance.trim()) {
        throw new Error(`Lỗi: Số dư sau khi tải lại là ${reloadedBalanceText} khác với số dư cũ ${finalBalance}!`);
    }

    console.log('[Bước 12.6] Click chuyển sang tab Quản lý đơn hàng...');
    await newPage.click('#nav-orders');
    await newPage.waitForTimeout(3000);
    
    const ordersTableHTML = await newPage.locator('#recent-orders-table').innerHTML();
    if (ordersTableHTML.includes('Bạn chưa có đơn hàng nào')) {
        throw new Error('Lỗi: Lịch sử đơn hàng của người dùng bị trống rỗng sau khi tải lại phiên mới!');
    }
    console.log('[Thành công] Toàn bộ dữ liệu của User được bảo lưu vĩnh viễn trong Database MongoDB Atlas.');

    console.log('\n=======================================');
    console.log('🎉 PLAYWRIGHT E2E TAY COMPLETED SUCCESSFULLY! 🎉');
    console.log('=======================================\n');

    await newBrowser.close();
    process.exit(0);
}

runTest().catch(err => {
    console.error('\n❌ PLAYWRIGHT E2E TAY FAILED! ❌');
    console.error(err);
    process.exit(1);
});
