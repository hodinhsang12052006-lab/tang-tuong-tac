/**
 * test_security_audit.js
 * Dedicated Security Audit & Hardening Verification Suite for Bitpawnetwork
 */

const axios = require('axios');
const BASE_URL = 'http://localhost:3005';

let passCount = 0;
let failCount = 0;

function report(name, passed, details = '') {
    if (passed) {
        passCount++;
        console.log(`🛡️ ✅ [PASS] ${name} ${details ? '-> ' + details : ''}`);
    } else {
        failCount++;
        console.log(`🚨 ❌ [FAIL] ${name} ${details ? '-> ' + details : ''}`);
    }
}

async function runSecurityAudit() {
    console.log('===========================================================');
    console.log('🔒 BẮT ĐẦU KIỂM THỬ BẢO MẬT CHUYÊN SÂU (SECURITY AUDIT)');
    console.log(`🔗 Target Server: ${BASE_URL}`);
    console.log('===========================================================\n');

    // 1. Kiểm tra HTTP Security Headers
    try {
        const headRes = await axios.get(`${BASE_URL}/api/health`);
        const headers = headRes.headers;
        const hasNosniff = headers['x-content-type-options'] === 'nosniff';
        const hasFrameOptions = headers['x-frame-options'] === 'SAMEORIGIN';
        const hasXssProtection = headers['x-xss-protection']?.includes('1');
        report('1. HTTP Security Headers (nosniff, SAMEORIGIN, xss-protection)', hasNosniff && hasFrameOptions && hasXssProtection, 'Đã cấu hình chặn Clickjacking & MIME-sniffing');
    } catch (e) {
        report('1. HTTP Security Headers', false, e.message);
    }

    // 2. Chống NoSQL Injection trên Login
    try {
        let nosqlBlocked = false;
        try {
            await axios.post(`${BASE_URL}/api/auth/login`, {
                emailOrPhone: { $ne: null },
                password: { $gt: "" }
            });
        } catch (err) {
            if (err.response && err.response.status === 400) {
                nosqlBlocked = true;
            }
        }
        report('2. Chống NoSQL Injection trên Đăng nhập (Object Query Payload)', nosqlBlocked, 'Server chặn payload dạng Object với mã 400');
    } catch (e) {
        report('2. Chống NoSQL Injection trên Đăng nhập', false, e.message);
    }

    // 3. Chống CPU Exhaustion DoS qua mật khẩu cực dài (>72 chars)
    try {
        let dosBlocked = false;
        try {
            await axios.post(`${BASE_URL}/api/auth/login`, {
                emailOrPhone: 'admin',
                password: 'A'.repeat(5000)
            });
        } catch (err) {
            if (err.response && err.response.status === 400) {
                dosBlocked = true;
            }
        }
        report('3. Chống DoS / CPU Exhaustion (Mật khẩu > 72 ký tự)', dosBlocked, 'Server từ chối mật khẩu quá dài trước khi tính bcrypt');
    } catch (e) {
        report('3. Chống DoS / CPU Exhaustion', false, e.message);
    }

    // 4. Chống nạp tiền âm / số tiền dị thường / tràn số
    const testTimestamp = Date.now();
    let userToken = null;
    try {
        const regRes = await axios.post(`${BASE_URL}/api/auth/register`, {
            username: `secuser_${testTimestamp.toString().slice(-6)}`,
            email: `sec_${testTimestamp}@test.com`,
            phone: '09' + Math.floor(10000000 + Math.random() * 90000000),
            password: 'StrongPassword123@'
        });
        userToken = regRes.data.token;
    } catch (e) {
        console.error('Không tạo được user test bảo mật:', e.message);
    }

    if (userToken) {
        // 4.1 Thử nạp tiền âm (-50 USD)
        try {
            let negBlocked = false;
            try {
                await axios.post(`${BASE_URL}/api/payments/request`, {
                    amount: -50.0,
                    transactionId: `TX_NEG_${testTimestamp}`
                }, { headers: { Authorization: `Bearer ${userToken}` } });
            } catch (err) {
                if (err.response && err.response.status === 400) negBlocked = true;
            }
            report('4.1 Chống nạp tiền âm (Negative Deposit Attack: -$50)', negBlocked, 'Server chặn tiền âm');
        } catch (e) {
            report('4.1 Chống nạp tiền âm', false, e.message);
        }

        // 4.2 Thử nạp số tiền khổng lồ vượt ngưỡng ($999,999,999)
        try {
            let overflowBlocked = false;
            try {
                await axios.post(`${BASE_URL}/api/payments/request`, {
                    amount: 999999999.0,
                    transactionId: `TX_OVERFLOW_${testTimestamp}`
                }, { headers: { Authorization: `Bearer ${userToken}` } });
            } catch (err) {
                if (err.response && err.response.status === 400) overflowBlocked = true;
            }
            report('4.2 Chống tràn số tiền nạp (> $50,000 USD)', overflowBlocked, 'Server giới hạn tối đa $50,000/lần');
        } catch (e) {
            report('4.2 Chống tràn số tiền nạp', false, e.message);
        }

        // 4.3 Thử chèn link chứa XSS Protocol (javascript:alert(1)) khi đặt đơn
        try {
            let xssLinkBlocked = false;
            try {
                await axios.post(`${BASE_URL}/api/orders`, {
                    serviceId: '6a44d85834f8924b17e4bb01', // Dummy ID
                    link: 'javascript:alert(document.cookie)',
                    quantity: 100
                }, { headers: { Authorization: `Bearer ${userToken}` } });
            } catch (err) {
                if (err.response && err.response.status === 400) xssLinkBlocked = true;
            }
            report('5. Chống chèn XSS Protocol vào Link đơn hàng (javascript:)', xssLinkBlocked, 'Server bắt buộc link phải bắt đầu bằng http:// hoặc https://');
        } catch (e) {
            report('5. Chống chèn XSS Protocol vào Link đơn hàng', false, e.message);
        }
    }

    // 6. Đăng nhập Admin và kiểm tra Chống CastError Crash trên Malformed ObjectId
    try {
        const adminLogin = await axios.post(`${BASE_URL}/api/auth/login`, {
            emailOrPhone: 'hodinhsang30052003@gmail.com',
            password: '123456Az@'
        });
        const adminToken = adminLogin.data.token;

        let castErrorHandled = false;
        try {
            await axios.post(`${BASE_URL}/api/payments/approve/null`, {}, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
        } catch (err) {
            // Phải trả về 400 (Bad Request), không được để sập 500 CastError
            if (err.response && err.response.status === 400) {
                castErrorHandled = true;
            }
        }
        report('6. Xử lý an toàn Malformed ObjectId (Không sinh lỗi 500 CastError)', castErrorHandled, 'Server kiểm tra isValid ObjectId và trả về 400 sạch');
    } catch (e) {
        report('6. Xử lý an toàn Malformed ObjectId', false, e.message);
    }

    // 7. Chống sửa cấu hình Admin bằng Injection Key
    try {
        const adminLogin = await axios.post(`${BASE_URL}/api/auth/login`, {
            emailOrPhone: 'hodinhsang30052003@gmail.com',
            password: '123456Az@'
        });
        const adminToken = adminLogin.data.token;

        let injectionKeyBlocked = false;
        try {
            await axios.post(`${BASE_URL}/api/admin/settings`, {
                key: { $regex: ".*" },
                value: 50
            }, { headers: { Authorization: `Bearer ${adminToken}` } });
        } catch (err) {
            if (err.response && err.response.status === 400) injectionKeyBlocked = true;
        }
        report('7. Chống NoSQL Injection trên Cấu hình hệ thống Admin', injectionKeyBlocked, 'Khóa cấu hình bắt buộc là chuỗi hợp lệ');
    } catch (e) {
        report('7. Chống NoSQL Injection trên Cấu hình hệ thống Admin', false, e.message);
    }

    console.log('\n===========================================================');
    console.log(`🏁 TỔNG KẾT KIỂM THỬ BẢO MẬT:`);
    console.log(`Kết quả: ${passCount}/${passCount + failCount} bài test ĐẠT YÊU CẦU (${Math.round(passCount / (passCount + failCount) * 100)}%)`);
    console.log('===========================================================');
}

runSecurityAudit();
