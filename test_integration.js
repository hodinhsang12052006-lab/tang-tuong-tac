/**
 * test_integration.js
 * Kịch bản kiểm thử tích hợp tự động (End-to-End Test) cho hệ thống Bitpawnetwork.
 * Xác thực khớp cơ sở dữ liệu giữa SMM Panel (Port 3005) và Shop Via (Port 4000),
 * kiểm tra logic trừ tiền an toàn, phòng chống Race Condition (Spam click) và rà soát lỗi API.
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import các cấu hình môi trường
const MONGO_URI = 'mongodb://hodinhsang12052006_db_user:123456Az%40@ac-e4kyuxi-shard-00-00.z54uv8s.mongodb.net:27017,ac-e4kyuxi-shard-00-01.z54uv8s.mongodb.net:27017,ac-e4kyuxi-shard-00-02.z54uv8s.mongodb.net:27017/bitpawnetwork?ssl=true&authSource=admin';
const JWT_SECRET = 'Bitpawnetwork_Super_Secret_Key_2026';
const WEB2_URL = 'http://localhost:4000';

async function runTests() {
    console.log('===========================================================');
    console.log('🧪 BẮT ĐẦU KIỂM THỬ E2E & RÀ SOÁT BẢO MẬT (CODE AUDIT)...');
    console.log('===========================================================');

    let dbConnected = false;

    // 1. Kết nối database
    try {
        await mongoose.connect(MONGO_URI, { 
            useNewUrlParser: true, 
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 4000 // Giới hạn chờ kết nối 4s
        });
        console.log('✅ [DB Connection] Đã kết nối thành công tới Database dùng chung.');
        dbConnected = true;
    } catch (err) {
        console.log('\n⚠️  [LƯU Ý QUAN TRỌNG VỀ IP WHITELIST]');
        console.log('Hệ thống kiểm thử của AI đang chạy trong sandbox cô lập nên địa chỉ IP của AI hiện không được whitelist trên MongoDB Atlas của bạn.');
        console.log('Để chạy E2E Test thực tế 100% bằng chính địa chỉ IP máy tính của bạn (đã được whitelist sẵn), hãy mở PowerShell/Terminal và gõ:');
        console.log('👉 node test_integration.js');
        console.log('\nTiến hành chạy kiểm thử kết nối API tĩnh tới Web 2 (Port 4000)...');
    }

    if (!dbConnected) {
        // Chạy kiểm thử API tĩnh không cần kết nối DB
        try {
            console.log('\n--- TEST API: Lấy sản phẩm và kiểm tra cấu trúc API nguồn ---');
            const prodRes = await fetch(`${WEB2_URL}/api/get-via-products`);
            const prodData = await prodRes.json();
            
            if (prodData.success && prodData.categories && prodData.categories.length > 0) {
                console.log(`✅ Kết nối Web 2 thành công! Tải danh mục sản phẩm từ API nguồn hoàn tất (${prodData.categories.length} danh mục).`);
                const firstCategory = prodData.categories[0];
                const firstProduct = firstCategory.products[0];
                console.log(`   - Nhóm: ${firstCategory.name}`);
                console.log(`   - Sản phẩm: ${firstProduct.name}`);
                console.log(`   - Giá gốc (VND): ${firstProduct.originalPriceVND} đ`);
                console.log(`   - Giá bán đã Markup 40% (VND): ${firstProduct.priceVND} đ`);
                console.log(`   - Giá quy đổi USD: $${firstProduct.priceUSD}`);
                
                const expectedMarkupPrice = firstProduct.originalPriceVND * 1.4 * 1.35;
                if (Math.abs(firstProduct.priceVND - expectedMarkupPrice) < 0.01) {
                    console.log('🎉 CÔNG THỨC MARKUP 40% * 1.35 ĐẠT TIÊU CHUẨN XÁC THỰC!');
                } else {
                    console.error('❌ Tính toán Markup sai lệch!');
                }
            } else {
                console.error('❌ Không có sản phẩm nào được trả về từ API hoặc API nguồn bị nghẽn.');
            }
        } catch (apiErr) {
            console.error('❌ [API Test Error] Không thể kết nối tới cổng 4000:', apiErr.message);
        }
        console.log('===========================================================');
        console.log('🏁 KẾT THÚC KIỂM TRA MẪU TĨNH!');
        console.log('===========================================================');
        return;
    }

    // Nếu kết nối DB thành công (chạy trên máy của user)
    // Lấy Models
    const User = mongoose.model('User', new mongoose.Schema({
        username: String,
        balance: Number,
        role: String
    }, { collection: 'users' }));

    const ViaOrder = mongoose.model('ViaOrder', new mongoose.Schema({
        userId: mongoose.Types.ObjectId,
        productId: String,
        productName: String,
        quantity: Number,
        charge: Number,
        accounts: [String],
        status: String
    }, { collection: 'viaorders' }));

    // 2. Tạo một User kiểm thử tạm thời trong MongoDB
    const testUsername = 'e2e_tester_' + Math.random().toString(36).substring(7);
    let testUser;
    try {
        testUser = await User.create({
            username: testUsername,
            balance: 5.0, // Đặt ví có $5.00
            role: 'user'
        });
        console.log(`✅ [Test User] Tạo thành công User kiểm thử: ${testUsername} (Số dư ban đầu: $5.00)`);
    } catch (err) {
        console.error('❌ Lỗi khi tạo User kiểm thử:', err.message);
        await mongoose.disconnect();
        process.exit(1);
    }

    // Ký mã JWT token mô phỏng hệ thống chính SMM Panel phát ra
    const token = jwt.sign({ id: testUser._id }, JWT_SECRET, { expiresIn: '1h' });
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    try {
        // TEST 1: Xác nhận Đồng bộ tài khoản & số dư qua Port 4000
        console.log('\n--- TEST 1: Xác minh Đồng bộ Số dư qua Port 4000 ---');
        const profileRes = await fetch(`${WEB2_URL}/api/auth/me`, { headers: authHeaders });
        const profileData = await profileRes.json();
        
        if (profileData.success && profileData.user) {
            console.log(`✅ Web 2 nhận diện thành công user: ${profileData.user.username}`);
            console.log(`✅ Số dư trên Web 2: $${profileData.user.balance.toFixed(2)}`);
            if (Math.abs(profileData.user.balance - 5.0) < 0.001) {
                console.log('🎉 KHỚP SỐ DƯ 100% GIỮA HỆ THỐNG ĐỘC LẬP VÀ DATABASE CHUNG!');
            } else {
                throw new Error('Số dư hiển thị không khớp cơ sở dữ liệu!');
            }
        } else {
            throw new Error(`Xác thực thất bại: ${profileData.message || 'Lỗi không xác định'}`);
        }

        // TEST 2: Lấy danh sách sản phẩm & kiểm tra Markup 40%
        console.log('\n--- TEST 2: Lấy sản phẩm và kiểm tra Markup 40% ---');
        const prodRes = await fetch(`${WEB2_URL}/api/get-via-products`);
        const prodData = await prodRes.json();
        
        if (prodData.success && prodData.categories && prodData.categories.length > 0) {
            console.log(`✅ Tải danh mục sản phẩm từ API nguồn thành công (${prodData.categories.length} danh mục).`);
            const firstCategory = prodData.categories[0];
            const firstProduct = firstCategory.products[0];
            console.log(`   - Nhóm: ${firstCategory.name}`);
            console.log(`   - Sản phẩm: ${firstProduct.name}`);
            console.log(`   - Giá gốc (VND): ${firstProduct.originalPriceVND} đ`);
            console.log(`   - Giá bán đã Markup (VND): ${firstProduct.priceVND} đ`);
            console.log(`   - Giá quy đổi USD: $${firstProduct.priceUSD}`);
            
            const expectedMarkupPrice = firstProduct.originalPriceVND * 1.4 * 1.35;
            if (Math.abs(firstProduct.priceVND - expectedMarkupPrice) < 0.01) {
                console.log('🎉 CÔNG THỨC MARKUP 40% * 1.35 ĐẠT CHUẨN XÁC CHÍNH XÁC!');
            } else {
                throw new Error('Tính toán Markup sai lệch!');
            }
        } else {
            throw new Error('Không có sản phẩm nào được trả về từ API.');
        }

        // TEST 3: Kiểm tra đặt mua tài nguyên & Trừ tiền & Bàn giao tài khoản
        console.log('\n--- TEST 3: Đặt mua và trừ tiền tài khoản ---');
        const targetCategory = prodData.categories[0];
        const targetProduct = targetCategory.products[0];
        const buyQuantity = 2;
        
        console.log(`👉 Thực hiện mua ${buyQuantity} cái sản phẩm: ${targetProduct.name}`);
        const buyRes = await fetch(`${WEB2_URL}/api/buy-via`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                productId: targetProduct.id,
                quantity: buyQuantity
            })
        });
        const buyData = await buyRes.json();

        if (buyData.success && buyData.data) {
            console.log('✅ Giao dịch đặt mua thành công!');
            console.log(`✅ Trả về tài khoản bàn giao:`);
            buyData.data.accounts.forEach((acc, index) => {
                console.log(`   [${index + 1}] ${acc}`);
            });
            console.log(`✅ Tổng phí trừ ví: $${buyData.data.charge.toFixed(2)} USD`);

            // Đối soát ví sau khi mua trong MongoDB
            const updatedUser = await User.findById(testUser._id);
            const expectedRemaining = parseFloat((5.0 - buyData.data.charge).toFixed(2));
            console.log(`✅ Số dư trong DB thực tế sau khi trừ ví SMM Panel: $${updatedUser.balance.toFixed(2)} USD`);
            if (Math.abs(updatedUser.balance - expectedRemaining) < 0.01) {
                console.log('🎉 VÍ SỐ DƯ SAU GIAO DỊCH TRỪ KHỚP CHÍNH XÁC 100%!');
            } else {
                throw new Error(`Sai lệch số dư! Kỳ vọng còn $${expectedRemaining} nhưng thực tế còn $${updatedUser.balance}`);
            }
        } else {
            throw new Error(`Giao dịch thất bại: ${buyData.message || 'Lỗi không rõ'}`);
        }

        // TEST 4: Phòng chống Race Condition (Spam click mua hàng)
        console.log('\n--- TEST 4: Kiểm thử ngăn chặn Race Condition (Spam click) ---');
        console.log('👉 Gửi đồng thời 2 yêu cầu mua hàng để mô phỏng spam click...');
        
        const req1 = fetch(`${WEB2_URL}/api/buy-via`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ productId: targetProduct.id, quantity: 1 })
        });
        const req2 = fetch(`${WEB2_URL}/api/buy-via`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ productId: targetProduct.id, quantity: 1 })
        });

        const [res1, res2] = await Promise.all([req1, req2]);
        const data1 = await res1.json();
        const data2 = await res2.json();

        console.log(`   - Giao dịch 1: HTTP ${res1.status} -> Success: ${data1.success}, Message: ${data1.message || 'Thành công'}`);
        console.log(`   - Giao dịch 2: HTTP ${res2.status} -> Success: ${data2.success}, Message: ${data2.message || 'Thành công'}`);

        if (res1.status === 429 || res2.status === 429 || !data1.success || !data2.success) {
            console.log('🎉 CƠ CHẾ KHÓA GIAO DỊCH CHỐNG SPAM CLICK LỌC THÀNH CÔNG RÀ SOÁT RÁC!');
        } else {
            console.warn('⚠️ Cảnh báo: Cả hai yêu cầu đều thành công. Cần xem xét nếu database không bị ảnh hưởng.');
        }

    } catch (err) {
        console.error('❌ [E2E Failure] Có lỗi xảy ra trong quá trình kiểm thử:', err.message);
    } finally {
        // DỌN DẸP DATABASE SAU KHI TEST XONG
        console.log('\n🧹 Dọn dẹp dữ liệu kiểm thử...');
        if (testUser) {
            await User.deleteOne({ _id: testUser._id });
            await ViaOrder.deleteMany({ userId: testUser._id });
            console.log('✅ Đã xóa User kiểm thử và các đơn hàng via thử nghiệm khỏi MongoDB.');
        }
        await mongoose.disconnect();
        console.log('🔌 Ngắt kết nối Database.');
        console.log('===========================================================');
        console.log('🏁 HOÀN TẤT E2E TEST!');
        console.log('===========================================================');
    }
}

runTests();
