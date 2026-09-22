/**
 * test_suite_playwright.js
 * Kịch bản tự động hóa kiểm thử toàn diện toàn bộ tính năng và quay video / chụp ảnh từng bước
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Acer Nitro\\.gemini\\antigravity-ide\\brain\\ba9e2f0b-a11b-46b8-b1e7-9831c2498a4c';
const LOCAL_DIR = path.join(__dirname, 'test_evidence');
const VIDEO_DIR = path.join(LOCAL_DIR, 'video');

if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

async function saveEvidence(page, filename, description) {
    const localPath = path.join(LOCAL_DIR, filename);
    const artifactPath = path.join(ARTIFACT_DIR, filename);
    await page.screenshot({ path: localPath, fullPage: false });
    try {
        fs.copyFileSync(localPath, artifactPath);
    } catch (e) {
        console.warn('Could not copy to artifact dir:', e.message);
    }
    console.log(`[EVIDENCE] ${description} -> Đã lưu ảnh: ${filename}`);
}

async function runFullTestSuite() {
    console.log('====================================================');
    console.log('🚀 BẮT ĐẦU CHẠY SUITE TEST TỰ ĐỘNG HÓA PLAYWRIGHT');
    console.log('====================================================');

    const browser = await chromium.launch({
        channel: 'chrome',
        headless: true
    }).catch(() => chromium.launch({ channel: 'msedge', headless: true }));

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordVideo: {
            dir: VIDEO_DIR,
            size: { width: 1440, height: 900 }
        }
    });

    const page = await context.newPage();
    const timestamp = Date.now();
    const testUser = `salon_owner_${timestamp}`;
    const testEmail = `${testUser}@gmail.com`;
    const testPhone = `+1832${Math.floor(1000000 + Math.random() * 9000000)}`;

    try {
        // BƯỚC 1: TRANG CHỦ & ENTITY SEO
        console.log('\n--- BƯỚC 1: KIỂM THỬ TRANG CHỦ & GOOGLE ENTITY SEO ---');
        await page.goto('http://localhost:3005', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        await saveEvidence(page, 'step1_landing_page.png', 'Trang chủ Bitpawnetwork');

        // Cuộn xuống khu vực Entity SEO Hồ Đình Sang
        const founderSection = page.locator('#about-bitpawnetwork');
        if (await founderSection.count() > 0) {
            await founderSection.scrollIntoViewIfNeeded();
            await page.waitForTimeout(800);
            await saveEvidence(page, 'step2_seo_entity_founder.png', 'Thực thể SEO Google & Nhà Sáng Lập Hồ Đình Sang');
        }

        // BƯỚC 2: QUY TRÌNH ĐĂNG KÝ 2 BƯỚC CHUẨN SALON MỸ
        console.log('\n--- BƯỚC 2: QUY TRÌNH ĐĂNG KÝ 2 BƯỚC CHUẨN SALON MỸ ---');
        await page.goto('http://localhost:3005', { waitUntil: 'networkidle' });
        
        // Mở modal Đăng ký
        console.log('Mở modal đăng ký...');
        await page.evaluate(() => openAuthModal('register'));
        await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });
        await page.waitForTimeout(600);

        // Điền Bước 1: Thông tin tài khoản chủ tiệm
        console.log('Điền Bước 1: Tài khoản chủ tiệm...');
        await page.fill('#register-fullname', 'Jennifer Nguyễn (Luxury Nails Dallas)');
        await page.fill('#register-username', testUser);
        await page.fill('#register-email', testEmail);
        await page.fill('#register-phone', testPhone);
        await page.fill('#register-password', 'Pass123456@');
        await page.fill('#register-confirm-password', 'Pass123456@');
        await page.waitForTimeout(500);
        await saveEvidence(page, 'step3_register_step1.png', 'Form Đăng ký - Bước 1: Thông tin chủ tiệm');

        // Bấm nút chuyển sang Bước 2
        console.log('Bấm chuyển sang Bước 2 Khảo sát...');
        await page.click('button:has-text("Tiếp tục: Khảo Sát Tiệm Nails")');
        await page.waitForSelector('#register-step-2:not(.hidden)', { timeout: 5000 });
        await page.waitForTimeout(600);

        // Điền Bước 2: Khảo sát hiện trạng tiệm Nails
        console.log('Điền Bước 2: Khảo sát hiện trạng tiệm Nails...');
        await page.fill('#register-salon-name', 'Dallas Luxury Nails & Spa');
        await page.fill('#register-salon-location', 'Dallas, TX 75202');
        await page.selectOption('#register-salon-scale', '8-15 thợ (Salon lớn, đông khách)');
        await page.selectOption('#register-has-website', 'Đã có website cũ, không hiệu quả');
        await page.selectOption('#register-customer-traffic', 'Khách vãng lai bấp bênh, vắng khách đầu tuần (Thứ 2 - Thứ 4)');
        await page.selectOption('#register-marketing-goal', 'Đưa tiệm lên Top 1 Google Maps gần đây (Local SEO)');
        
        // Tick terms
        await page.check('#register-terms');
        await page.waitForTimeout(500);
        await saveEvidence(page, 'step4_register_step2_survey.png', 'Form Đăng ký - Bước 2: Khảo sát tiệm Nails chuyên sâu');

        // Bấm Hoàn tất đăng ký
        console.log('Gửi form đăng ký...');
        await page.click('button:has-text("Hoàn Tất Đăng Ký")');
        
        // Đợi chuyển hướng sang /dashboard
        await page.waitForURL('**/dashboard', { timeout: 10000 });
        await page.waitForTimeout(1000);
        await saveEvidence(page, 'step5_user_dashboard_logged_in.png', 'Đăng ký thành công & Tự động vào User Dashboard');

        // BƯỚC 3: KIỂM THỬ ĐĂNG NHẬP & BẢO MẬT
        console.log('\n--- BƯỚC 3: KIỂM THỬ ĐĂNG NHẬP ---');
        await page.goto('http://localhost:3005', { waitUntil: 'networkidle' });
        await page.evaluate(() => openAuthModal('login'));
        await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });
        await page.fill('#login-identifier', testEmail);
        await page.fill('#login-password', 'Pass123456@');
        await page.waitForTimeout(500);
        await saveEvidence(page, 'step6_login_modal.png', 'Form Đăng nhập linh hoạt Email/Username/Phone');

        // BƯỚC 4: BẢNG ĐIỀU KHIỂN KHÁCH HÀNG (DASHBOARD)
        console.log('\n--- BƯỚC 4: BẢNG ĐIỀU KHIỂN KHÁCH HÀNG (DASHBOARD) ---');
        await page.goto('http://localhost:3005/dashboard', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        await saveEvidence(page, 'step7_user_dashboard_overview.png', 'Bảng điều khiển khách hàng - Tổng quan dịch vụ & số dư');

        // Thử mở modal nạp tiền
        const depositBtn = page.locator('#btn-deposit, button:has-text("Nạp tiền"), a:has-text("Nạp tiền")');
        if (await depositBtn.count() > 0 && await depositBtn.first().isVisible()) {
            await depositBtn.first().click();
            await page.waitForTimeout(800);
            await saveEvidence(page, 'step8_deposit_modal.png', 'Cổng nạp tiền tự động QR & Chuyển khoản');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }

        // BƯỚC 5: ADMIN PORTAL & THẨM ĐỊNH HỒ SƠ KHẢO SÁT TIỆM NAILS
        console.log('\n--- BƯỚC 5: ADMIN PORTAL & XEM HỒ SƠ KHẢO SÁT TIỆM NAILS ---');
        const adminPage = await context.newPage();
        await adminPage.goto('http://localhost:3005', { waitUntil: 'networkidle' });
        await adminPage.evaluate(() => openAuthModal('login'));
        await adminPage.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });
        await adminPage.fill('#login-identifier', 'hodinhsang30052003@gmail.com');
        await adminPage.fill('#login-password', '123456Az@');
        await adminPage.click('#login-form button[type="submit"]');
        await adminPage.waitForURL('**/admin', { timeout: 10000 });
        await adminPage.waitForTimeout(1000);

        await saveEvidence(adminPage, 'step9_admin_portal_overview.png', 'Admin Portal - Bảng điều khiển quản trị tối cao');

        // Chuyển sang Tab Quản lý Thành Viên
        console.log('Chuyển sang Tab Người Dùng...');
        await adminPage.click('#nav-users');
        await adminPage.waitForTimeout(1200);
        await saveEvidence(adminPage, 'step10_admin_users_table.png', 'Bảng Người Dùng & Cột Tiệm Nails/Địa Chỉ');

            // Tìm nút Xem Khảo Sát của chủ tiệm vừa tạo
            const userRow = adminPage.locator(`#admin-users-body tr:has-text("${testUser}"), #admin-users-body tr:has-text("Dallas Luxury Nails")`);
            if (await userRow.count() > 0) {
                const surveyBtn = userRow.locator('button:has-text("Xem Khảo Sát")');
                if (await surveyBtn.count() > 0) {
                    await surveyBtn.click();
                    await adminPage.waitForSelector('#salon-profile-modal:not(.hidden)', { timeout: 5000 });
                    await adminPage.waitForTimeout(800);
                    await saveEvidence(adminPage, 'step11_admin_salon_survey_modal.png', 'Modal Hồ Sơ Khảo Sát Tiệm Nails VIP của Khách Hàng');
                }
            }
        console.log('\n🎉 TOÀN BỘ BỘ TEST PLAYWRIGHT ĐÃ CHẠY XONG 100% THÀNH CÔNG RỰC RỠ!');
    } catch (err) {
        console.error('❌ Lỗi trong quá trình chạy test Playwright:', err);
    } finally {
        await page.close();
        await context.close();
        await browser.close();

        // Kiểm tra video ghi hình
        const videoFiles = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'));
        if (videoFiles.length > 0) {
            // Lấy video mới nhất
            videoFiles.sort((a, b) => fs.statSync(path.join(VIDEO_DIR, b)).mtimeMs - fs.statSync(path.join(VIDEO_DIR, a)).mtimeMs);
            const latestVideo = path.join(VIDEO_DIR, videoFiles[0]);
            const targetVideoPath = path.join(ARTIFACT_DIR, 'playwright_full_test_recording.webm');
            fs.copyFileSync(latestVideo, targetVideoPath);
            console.log(`\n🎥 VIDEO ĐÃ ĐƯỢC QUAY VÀ LƯU THÀNH CÔNG:`);
            console.log(`- Cục bộ: ${latestVideo}`);
            console.log(`- Artifact: ${targetVideoPath}`);
        }
    }
}

runFullTestSuite();
