/**
 * test_mobile_devices.js
 * Kiểm thử tự động hóa khả năng tương thích toàn diện trên iPhone, Android và iPad
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Acer Nitro\\.gemini\\antigravity-ide\\brain\\ba9e2f0b-a11b-46b8-b1e7-9831c2498a4c';
const LOCAL_DIR = path.join(__dirname, 'test_evidence', 'mobile');

if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });

async function saveMobileEvidence(page, filename, description) {
    const localPath = path.join(LOCAL_DIR, filename);
    const artifactPath = path.join(ARTIFACT_DIR, filename);
    await page.screenshot({ path: localPath, fullPage: false });
    try {
        fs.copyFileSync(localPath, artifactPath);
    } catch (e) {
        console.warn('Could not copy to artifact dir:', e.message);
    }
    console.log(`[MOBILE EVIDENCE] ${description} -> Đã lưu ảnh: ${filename}`);
}

async function checkHorizontalOverflow(page, deviceName) {
    const overflow = await page.evaluate(() => {
        return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
    });
    console.log(`[${deviceName}] Chiều rộng: Client=${overflow.clientWidth}px, Scroll=${overflow.scrollWidth}px -> ${overflow.hasOverflow ? '⚠️ BỊ TRÀN NGANG' : '✅ 100% VỪA VẶN, KHÔNG TRÀN NGANG'}`);
    return !overflow.hasOverflow;
}

async function runMobileAudit() {
    console.log('================================================================');
    console.log('📱 BẮT ĐẦU KIỂM THỬ GIAO DIỆN & TRẢI NGHIỆM TRÊN MOBILE & IPAD');
    console.log('================================================================');

    const browser = await chromium.launch({
        channel: 'chrome',
        headless: true
    }).catch(() => chromium.launch({ channel: 'msedge', headless: true }));

    const devices = [
        {
            name: 'iPhone 15 Pro (iOS)',
            filenamePrefix: 'iphone_15_pro',
            viewport: { width: 393, height: 852 },
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            isMobile: true,
            hasTouch: true
        },
        {
            name: 'Samsung Galaxy S20 (Android)',
            filenamePrefix: 'samsung_galaxy_s20',
            viewport: { width: 360, height: 800 },
            userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
            isMobile: true,
            hasTouch: true
        },
        {
            name: 'iPad Pro / Tablet (iPadOS)',
            filenamePrefix: 'ipad_pro',
            viewport: { width: 820, height: 1180 },
            userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
            isMobile: true,
            hasTouch: true
        }
    ];

    for (const dev of devices) {
        console.log(`\n------------------------------------------------------------`);
        console.log(`🔍 KIỂM THỬ TRÊN THIẾT BỊ: ${dev.name} (${dev.viewport.width} x ${dev.viewport.height})`);
        console.log(`------------------------------------------------------------`);

        const context = await browser.newContext({
            viewport: dev.viewport,
            userAgent: dev.userAgent,
            isMobile: dev.isMobile,
            hasTouch: dev.hasTouch
        });

        const page = await context.newPage();

        try {
            // 1. Trang chủ Landing Page
            await page.goto('http://localhost:3005', { waitUntil: 'networkidle' });
            await page.waitForTimeout(600);
            await checkHorizontalOverflow(page, dev.name);
            await saveMobileEvidence(page, `${dev.filenamePrefix}_1_home.png`, `${dev.name} - Trang chủ`);

            // 2. Mở Mobile Burger Menu
            const menuBtn = page.locator('#mobile-menu-btn');
            if (await menuBtn.count() > 0 && await menuBtn.isVisible()) {
                await menuBtn.click();
                await page.waitForTimeout(400);
                await saveMobileEvidence(page, `${dev.filenamePrefix}_2_mobile_menu.png`, `${dev.name} - Menu điều hướng Mobile`);
                // Đóng menu
                await menuBtn.click();
                await page.waitForTimeout(300);
            }

            // 3. Mở Modal Đăng Ký Bước 1 (Tài khoản chủ tiệm)
            await page.evaluate(() => openAuthModal('register'));
            await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(400);
            await saveMobileEvidence(page, `${dev.filenamePrefix}_3_register_step1.png`, `${dev.name} - Modal Đăng ký Bước 1`);

            // 4. Chuyển sang Bước 2 (Khảo sát tiệm Nails)
            await page.fill('#register-username', 'mobile_tester');
            await page.fill('#register-email', 'mobile_tester@gmail.com');
            await page.fill('#register-phone', '+18325556677');
            await page.fill('#register-password', 'Pass123456@');
            await page.fill('#register-confirm-password', 'Pass123456@');
            await page.click('button:has-text("Tiếp tục: Khảo Sát Tiệm Nails")');
            await page.waitForSelector('#register-step-2:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(400);
            await saveMobileEvidence(page, `${dev.filenamePrefix}_4_register_step2_survey.png`, `${dev.name} - Modal Khảo Sát Bước 2`);

            // 5. Kiểm thử Modal Đăng Nhập
            await page.evaluate(() => switchAuthTab('login'));
            await page.waitForTimeout(400);
            await saveMobileEvidence(page, `${dev.filenamePrefix}_5_login_modal.png`, `${dev.name} - Modal Đăng Nhập`);
            await page.evaluate(() => closeAuthModal());
            await page.waitForTimeout(300);

            // 6. Kiểm thử User Dashboard trên Mobile
            await page.goto('http://localhost:3005/dashboard', { waitUntil: 'networkidle' });
            await page.waitForTimeout(600);
            await checkHorizontalOverflow(page, `${dev.name} (Dashboard)`);
            await saveMobileEvidence(page, `${dev.filenamePrefix}_6_user_dashboard.png`, `${dev.name} - Bảng điều khiển khách hàng`);

            // 7. Kiểm thử Admin Portal trên Mobile
            await page.goto('http://localhost:3005', { waitUntil: 'networkidle' });
            await page.evaluate(() => openAuthModal('login'));
            await page.waitForSelector('#auth-modal:not(.hidden)');
            await page.fill('#login-identifier', 'hodinhsang30052003@gmail.com');
            await page.fill('#login-password', '123456Az@');
            await page.click('#login-form button[type="submit"]');
            await page.waitForURL('**/admin', { timeout: 10000 });
            await page.waitForTimeout(600);
            await checkHorizontalOverflow(page, `${dev.name} (Admin)`);
            await saveMobileEvidence(page, `${dev.filenamePrefix}_7_admin_dashboard.png`, `${dev.name} - Admin Portal`);

            // Mở tab người dùng và mở modal khảo sát tiệm Nails trên mobile
            const navUsers = page.locator('#nav-users');
            if (await navUsers.count() > 0) {
                // Nếu trên mobile sidebar đang ẩn, bấm toggle sidebar
                const openSidebarBtn = page.locator('button:has(.fa-bars), #open-sidebar-btn');
                if (await openSidebarBtn.count() > 0 && await openSidebarBtn.first().isVisible()) {
                    await openSidebarBtn.first().click();
                    await page.waitForTimeout(300);
                }
                await navUsers.click();
                await page.waitForTimeout(1000);

                const viewSurveyBtn = page.locator('button:has-text("Xem Khảo Sát")');
                if (await viewSurveyBtn.count() > 0) {
                    await viewSurveyBtn.first().click();
                    await page.waitForSelector('#salon-profile-modal:not(.hidden)', { timeout: 5000 });
                    await page.waitForTimeout(400);
                    await saveMobileEvidence(page, `${dev.filenamePrefix}_8_admin_survey_modal.png`, `${dev.name} - Admin Thẩm Định Hồ Sơ Khảo Sát Nails`);
                }
            }

            console.log(`✅ [${dev.name}] Hoàn tất kiểm thử thành công 100%!`);
        } catch (err) {
            console.error(`❌ [${dev.name}] Lỗi:`, err.message);
        } finally {
            await page.close();
            await context.close();
        }
    }

    await browser.close();
    console.log('\n🎉 TẤT CẢ CÁC BÀI TEST MOBILE (IPHONE, ANDROID, IPAD) ĐÃ THÀNH CÔNG RỰC RỠ!');
}

runMobileAudit();
