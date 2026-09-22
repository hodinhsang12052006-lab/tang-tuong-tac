// Node 18+ has native fetch
const BASE_URL = 'http://localhost:3005';

async function runTest() {
    console.log('--- TEST BẮT ĐẦU: KIỂM THỬ KHẢO SÁT TIỆM NAILS & ADMIN PORTAL ---');
    const timestamp = Date.now();
    const testUsername = `nail_boss_${timestamp}`;
    const testEmail = `nail_boss_${timestamp}@gmail.com`;

    // 1. Đăng ký tài khoản kèm khảo sát thực trạng tiệm Nails
    console.log('\n[1] Gửi payload đăng ký 2 bước kèm dữ liệu khảo sát tiệm Nails...');
    const registerPayload = {
        fullName: 'Tina Trần (Queen Nails)',
        username: testUsername,
        email: testEmail,
        phone: `+1832${Math.floor(1000000 + Math.random() * 9000000)}`,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        salonName: 'Queen Nails & Organic Spa',
        salonLocation: 'Houston, TX 77084',
        salonScale: '8-15 thợ (Salon lớn, đông khách)',
        customerTraffic: 'Khách vãng lai bấp bênh, vắng khách đầu tuần (Thứ 2 - Thứ 4)',
        hasWebsite: 'Chưa có website',
        existingPlatforms: ['Google Maps (GMB)', 'Facebook Fanpage', 'Instagram', 'Clover/Square POS'],
        marketingGoal: 'Đưa tiệm lên Top 1 Google Maps gần đây (Local SEO)'
    };

    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerPayload)
    });
    const regData = await regRes.json();
    console.log('Phản hồi đăng ký:', regData);

    if (!regRes.ok || !regData.success) {
        throw new Error(`Đăng ký thất bại: ${JSON.stringify(regData)}`);
    }

    if (!regData.user.salonName || regData.user.salonName !== registerPayload.salonName) {
        throw new Error(`Trường salonName không khớp: ${regData.user.salonName}`);
    }
    console.log('✅ Bước 1 PASS: User đã được đăng ký và lưu khảo sát tiệm Nails thành công!');

    // 2. Đăng nhập với tài khoản Admin
    console.log('\n[2] Đăng nhập bằng tài khoản Quản Trị Viên (Admin)...');
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            emailOrPhone: 'hodinhsang30052003@gmail.com',
            password: '123456Az@'
        })
    });
    const adminLoginData = await adminLoginRes.json();

    if (!adminLoginData.success) {
        throw new Error(`Admin đăng nhập thất bại: ${JSON.stringify(adminLoginData)}`);
    }
    const adminToken = adminLoginData.token;
    console.log(`✅ Bước 2 PASS: Admin đăng nhập thành công. Role: ${adminLoginData.user.role}`);

    // 3. Admin tải danh sách Users để xem hồ sơ khảo sát
    console.log('\n[3] Admin gọi API /api/admin/users để kiểm tra hồ sơ khảo sát tiệm Nails...');
    const usersRes = await fetch(`${BASE_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const usersData = await usersRes.json();
    if (!usersRes.ok || !usersData.success) {
        throw new Error(`Admin lấy users thất bại: ${JSON.stringify(usersData)}`);
    }

    const targetUser = usersData.data.find(u => u.username === testUsername);
    if (!targetUser) {
        throw new Error(`Không tìm thấy user ${testUsername} trong danh sách của Admin!`);
    }

    console.log('\n[HỒ SƠ KHẢO SÁT MÀ ADMIN THẤY ĐƯỢC]:');
    console.log(`- Họ và tên chủ tiệm: ${targetUser.fullName}`);
    console.log(`- SĐT liên hệ: ${targetUser.phone}`);
    console.log(`- Tên tiệm Nails: ${targetUser.salonName}`);
    console.log(`- Địa chỉ/Khu vực: ${targetUser.salonLocation}`);
    console.log(`- Quy mô tiệm: ${targetUser.salonScale}`);
    console.log(`- Hiện trạng lượng khách: ${targetUser.customerTraffic}`);
    console.log(`- Tình trạng website: ${targetUser.hasWebsite}`);
    console.log(`- Nền tảng số đang có: ${JSON.stringify(targetUser.existingPlatforms)}`);
    console.log(`- Mục tiêu Marketing số 1: ${targetUser.marketingGoal}`);
    console.log(`- Trạng thái khảo sát: ${targetUser.surveyCompleted}`);

    if (
        targetUser.salonName === registerPayload.salonName &&
        targetUser.salonLocation === registerPayload.salonLocation &&
        targetUser.customerTraffic === registerPayload.customerTraffic &&
        targetUser.marketingGoal === registerPayload.marketingGoal &&
        targetUser.existingPlatforms.length === 4
    ) {
        console.log('\n🎉 TẤT CẢ THÔNG TIN KHẢO SÁT TIỆM NAILS ĐÃ ĐƯỢC ADMIN TIẾP NHẬN CHÍNH XÁC 100%!');
    } else {
        throw new Error('Dữ liệu khảo sát của Admin không khớp với dữ liệu đăng ký!');
    }
}

runTest().catch(err => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
});
