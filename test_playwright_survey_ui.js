const { chromium } = require('playwright-core');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Acer Nitro\\.gemini\\antigravity-ide\\brain\\ba9e2f0b-a11b-46b8-b1e7-9831c2498a4c';

async function runE2ESurveyTest() {
    console.log('🚀 BẮT ĐẦU KIỂM THỬ PLAYWRIGHT E2E: LUỒNG ĐĂNG KÝ KHẢO SÁT & ADMIN XEM HỒ SƠ NAILS');

    const browser = await chromium.launch({
        headless: true,
        channel: 'chrome'
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });

    const page = await context.newPage();
    const timestamp = Date.now();
    const testUsername = `salon_pro_${timestamp}`;
    const testEmail = `salon_pro_${timestamp}@gmail.com`;
    const testPhone = `+1832${Math.floor(1000000 + Math.random() * 9000000)}`;

    try {
        // 1. Mở trang chủ
        console.log('\n[1] Truy cập trang chủ Landing Page: http://localhost:3005 ...');
        await page.goto('http://localhost:3005', { waitUntil: 'networkidle' });

        // 2. Mở Auth Modal và chuyển sang tab Đăng Ký
        console.log('[2] Mở modal đăng ký...');
        await page.evaluate(() => openAuthModal('register'));
        await page.waitForSelector('#auth-modal:not(.hidden)');
        await page.waitForTimeout(500);

        // 3. Điền Bước 1: Tài khoản chủ tiệm
        console.log('[3] Điền Bước 1: Thông tin tài khoản chủ tiệm...');
        await page.fill('#register-fullname', 'Helen Đỗ (Diamond Nails Houston)');
        await page.fill('#register-username', testUsername);
        await page.fill('#register-email', testEmail);
        await page.fill('#register-phone', testPhone);
        await page.fill('#register-password', 'HelenPass123!');
        await page.fill('#register-confirm-password', 'HelenPass123!');

        // Bấm nút chuyển sang Bước 2
        console.log('[4] Bấm "Tiếp tục: Khảo Sát Tiệm Nails ➔"...');
        await page.click('button:has-text("Tiếp tục: Khảo Sát Tiệm Nails")');
        await page.waitForTimeout(500);

        // Kiểm tra xem Bước 2 đã hiển thị chưa
        const isStep2Visible = await page.isVisible('#register-step-2:not(.hidden)');
        if (!isStep2Visible) {
            throw new Error('Bước 2 khảo sát không hiển thị sau khi bấm tiếp tục!');
        }
        console.log('✅ Bước 2 khảo sát tiệm Nails đã kích hoạt thành công!');

        // 5. Điền Bước 2: Khảo sát hiện trạng tiệm Nails
        console.log('[5] Điền thông tin khảo sát hiện trạng tiệm Nails...');
        await page.fill('#register-salon-name', 'Diamond Luxury Nails & Spa');
        await page.fill('#register-salon-location', 'Dallas, TX 75001');
        await page.selectOption('#register-salon-scale', '8-15 thợ (Salon lớn, đông khách)');
        await page.selectOption('#register-has-website', 'Chưa có website');
        await page.selectOption('#register-customer-traffic', 'Khách vãng lai bấp bênh, vắng khách đầu tuần (Thứ 2 - Thứ 4)');
        await page.selectOption('#register-marketing-goal', 'Đưa tiệm lên Top 1 Google Maps gần đây (Local SEO)');

        // Tick terms
        await page.check('#register-terms');

        // Chụp ảnh màn hình Form khảo sát bước 2
        const surveyScreenshotPath = path.join(ARTIFACT_DIR, 'salon_survey_registration_ui.png');
        await page.screenshot({ path: surveyScreenshotPath });
        console.log(`📸 Đã chụp ảnh giao diện đăng ký khảo sát: ${surveyScreenshotPath}`);

        // 6. Gửi form đăng ký
        console.log('[6] Gửi form hoàn tất đăng ký...');
        await page.click('button:has-text("Hoàn Tất Đăng Ký")');

        // Đợi chuyển hướng sang /dashboard
        await page.waitForURL('**/dashboard', { timeout: 10000 });
        console.log('✅ Đăng ký thành công và tự động chuyển hướng vào User Dashboard!');

        // 7. Mở Admin Portal bằng session mới
        console.log('\n[7] Đăng nhập bằng tài khoản Quản Trị Viên (Admin)...');
        const adminPage = await context.newPage();
        await adminPage.goto('http://localhost:3005', { waitUntil: 'networkidle' });
        await adminPage.evaluate(() => openAuthModal('login'));
        await adminPage.waitForSelector('#auth-modal:not(.hidden)');

        await adminPage.fill('#login-identifier', 'hodinhsang30052003@gmail.com');
        await adminPage.fill('#login-password', '123456Az@');
        await adminPage.click('#login-form button[type="submit"]');

        // Đợi chuyển hướng vào /admin
        await adminPage.waitForURL('**/admin', { timeout: 10000 });
        console.log('✅ Admin đăng nhập thành công vào Admin Portal (/admin)!');

        // 8. Chuyển sang Tab Tài khoản khách hàng
        console.log('[8] Chuyển sang Tab Tài khoản người dùng trong Admin Portal...');
        await adminPage.click('#nav-users');
        await adminPage.waitForTimeout(1000);

        // Tìm dòng chứa tài khoản vừa tạo
        const userRow = adminPage.locator(`#admin-users-body tr:has-text("${testUsername}")`);
        await userRow.waitFor({ state: 'visible', timeout: 5000 });

        const salonText = await userRow.innerText();
        console.log('Nội dung hàng user trong Admin:', salonText);

        if (!salonText.includes('Diamond Luxury Nails & Spa')) {
            throw new Error('Cột Tiệm Nails không hiển thị tên tiệm Nails trong Admin!');
        }
        console.log('✅ Cột Tiệm Nails & Địa chỉ hiển thị chính xác tên tiệm!');

        // 9. Bấm nút "Xem Khảo Sát" để mở Modal chi tiết
        console.log('[9] Bấm nút "Xem Khảo Sát" để mở Modal chi tiết hồ sơ...');
        const viewSurveyBtn = userRow.locator('button:has-text("Xem Khảo Sát")');
        await viewSurveyBtn.click();
        await adminPage.waitForSelector('#salon-profile-modal:not(.hidden)', { timeout: 5000 });
        await adminPage.waitForTimeout(500);

        // Kiểm tra nội dung trong Modal
        const modalTitle = await adminPage.textContent('#modal-salon-title');
        const ownerFullName = await adminPage.textContent('#modal-user-fullname');
        const salonLocation = await adminPage.textContent('#modal-salon-location');
        const salonGoal = await adminPage.textContent('#modal-marketing-goal');

        console.log(`- Tiêu đề modal: ${modalTitle}`);
        console.log(`- Chủ tiệm: ${ownerFullName}`);
        console.log(`- Khu vực: ${salonLocation}`);
        console.log(`- Mục tiêu: ${salonGoal}`);

        if (!modalTitle.includes('Diamond Luxury Nails & Spa') || !ownerFullName.includes('Helen Đỗ')) {
            throw new Error('Dữ liệu trên Modal Admin không hiển thị đúng thông tin khảo sát!');
        }

        // Chụp ảnh màn hình Modal chi tiết hồ sơ khảo sát mà Admin xem
        const adminModalScreenshotPath = path.join(ARTIFACT_DIR, 'admin_salon_profile_modal.png');
        await adminPage.screenshot({ path: adminModalScreenshotPath });
        console.log(`📸 Đã chụp ảnh Modal hồ sơ tiệm Nails trong Admin Portal: ${adminModalScreenshotPath}`);

        console.log('\n🎉 TOÀN BỘ LUỒNG E2E TEST: ĐĂNG KÝ KHẢO SÁT -> ADMIN QUẢN LÝ HỒ SƠ ĐÃ THÀNH CÔNG 100%!');
    } catch (err) {
        console.error('❌ LỖI TRONG QUÁ TRÌNH TEST:', err);
        throw err;
    } finally {
        await browser.close();
    }
}

runE2ESurveyTest().catch(err => {
    console.error(err);
    process.exit(1);
});
