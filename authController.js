/**
 * authController.js
 * Controller xử lý đăng ký, đăng nhập và phân cấp người dùng qua Email / Số điện thoại.
 * Dự án SMM Panel: Bitpawnetwork
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('./models');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('[Security] Thiếu biến môi trường JWT_SECRET. Không thể khởi động module xác thực.');
}

/**
 * ============================================================================
 * 1. ĐĂNG KÝ TÀI KHOẢN MỚI
 * POST /api/auth/register
 * ============================================================================
 */
async function register(req, res) {
    try {
        const { 
            emailOrPhone, username, password, email: reqEmail, phone: reqPhone, fullName, confirmPassword,
            salonName, salonLocation, salonScale, customerTraffic, hasWebsite, existingPlatforms, marketingGoal
        } = req.body;

        // Chống NoSQL Injection & Type Confusion: đảm bảo dữ liệu là chuỗi hợp lệ
        if (reqEmail !== undefined && typeof reqEmail !== 'string') {
            return res.status(400).json({ success: false, message: 'Định dạng Email không hợp lệ.' });
        }
        if (reqPhone !== undefined && typeof reqPhone !== 'string') {
            return res.status(400).json({ success: false, message: 'Định dạng Số điện thoại không hợp lệ.' });
        }
        if (username !== undefined && typeof username !== 'string') {
            return res.status(400).json({ success: false, message: 'Tên đăng nhập không hợp lệ.' });
        }
        if (typeof password !== 'string') {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mật khẩu dạng chuỗi.' });
        }
        if (fullName !== undefined && typeof fullName !== 'string') {
            return res.status(400).json({ success: false, message: 'Họ và tên không hợp lệ.' });
        }

        let email = reqEmail ? reqEmail.trim().toLowerCase() : null;
        let phone = reqPhone ? reqPhone.trim() : null;

        if (!email && !phone) {
            // Fallback to emailOrPhone
            if (!emailOrPhone || typeof emailOrPhone !== 'string') {
                return res.status(400).json({ success: false, message: 'Vui lòng cung cấp Email hoặc Số điện thoại.' });
            }
            const isEmail = emailOrPhone.includes('@');
            const cleanIdentifier = emailOrPhone.trim().toLowerCase();
            if (isEmail) {
                email = cleanIdentifier;
            } else {
                phone = cleanIdentifier;
            }
        }

        if (!password) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mật khẩu.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Mật khẩu phải chứa ít nhất 6 ký tự.' });
        }

        if (password.length > 72) {
            return res.status(400).json({ success: false, message: 'Mật khẩu không được vượt quá 72 ký tự.' });
        }

        if (confirmPassword && password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Mật khẩu nhập lại không khớp.' });
        }

        // Validate email format if provided
        if (email) {
            if (email.length > 100) return res.status(400).json({ success: false, message: 'Email quá dài.' });
            const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            if (!isEmailValid) {
                return res.status(400).json({ success: false, message: 'Định dạng Email không hợp lệ.' });
            }
        }

        // Validate phone format if provided (Hỗ trợ định dạng số Mỹ/VN có khoảng trắng, dấu ngoặc, gạch nối)
        if (phone) {
            const cleanPhone = phone.replace(/[\s\(\)\-\.]/g, '');
            const isPhoneValid = /^\+?[0-9]{9,15}$/.test(cleanPhone);
            if (!isPhoneValid) {
                return res.status(400).json({ success: false, message: 'Định dạng Số điện thoại không hợp lệ (9 - 15 số).' });
            }
            phone = cleanPhone;
        }

        // Tạo username mặc định nếu không cung cấp
        let finalUsername = username ? username.trim().toLowerCase() : '';
        if (!finalUsername) {
            if (email) {
                finalUsername = email.split('@')[0];
            } else if (phone) {
                finalUsername = 'user_' + phone.slice(-4);
            } else {
                finalUsername = 'user_' + Date.now().toString().slice(-6);
            }
        }

        if (finalUsername.length < 3) {
            return res.status(400).json({ success: false, message: 'Tên đăng nhập phải chứa ít nhất 3 ký tự.' });
        }

        // Kiểm tra xem trùng lặp thông tin không
        const queryOr = [];
        queryOr.push({ username: finalUsername });
        if (email) queryOr.push({ email: email });
        if (phone) queryOr.push({ phone: phone });

        const existingUser = await User.findOne({ $or: queryOr });
        if (existingUser) {
            if (existingUser.username === finalUsername) {
                return res.status(409).json({ success: false, message: 'Tên đăng nhập đã được sử dụng.' });
            }
            if (email && existingUser.email === email) {
                return res.status(409).json({ success: false, message: 'Địa chỉ Email này đã được đăng ký.' });
            }
            if (phone && existingUser.phone === phone) {
                return res.status(409).json({ success: false, message: 'Số điện thoại này đã được đăng ký.' });
            }
        }

        // Tạo người dùng mới
        const userObj = {
            username: finalUsername,
            password: password,
            balance: 0.0, // Số dư khởi tạo ban đầu mặc định là 0.0
            role: 'user'
        };
        if (email) userObj.email = email;
        if (phone) userObj.phone = phone;
        if (fullName) userObj.fullName = fullName;

        // Lưu thông tin khảo sát tiệm Nails
        if (salonName && typeof salonName === 'string') userObj.salonName = salonName.trim().slice(0, 100);
        if (salonLocation && typeof salonLocation === 'string') userObj.salonLocation = salonLocation.trim().slice(0, 100);
        if (salonScale && typeof salonScale === 'string') userObj.salonScale = salonScale.trim().slice(0, 50);
        if (customerTraffic && typeof customerTraffic === 'string') userObj.customerTraffic = customerTraffic.trim().slice(0, 100);
        if (hasWebsite && typeof hasWebsite === 'string') userObj.hasWebsite = hasWebsite.trim().slice(0, 100);
        if (marketingGoal && typeof marketingGoal === 'string') userObj.marketingGoal = marketingGoal.trim().slice(0, 150);
        if (Array.isArray(existingPlatforms)) {
            userObj.existingPlatforms = existingPlatforms.filter(p => typeof p === 'string').map(p => p.trim().slice(0, 50));
        }
        if (salonName || salonLocation || salonScale || customerTraffic || hasWebsite || marketingGoal) {
            userObj.surveyCompleted = true;
        }

        const newUser = new User(userObj);
        await newUser.save();

        // Tạo JWT Token phiên làm việc
        const token = jwt.sign({ id: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: '1d' });

        return res.status(201).json({
            success: true,
            message: 'Đăng ký tài khoản và hoàn tất hồ sơ tiệm Nails thành công!',
            token,
            user: {
                id: newUser._id,
                username: newUser.username,
                fullName: newUser.fullName,
                email: newUser.email,
                phone: newUser.phone,
                balance: newUser.balance,
                role: newUser.role,
                salonName: newUser.salonName,
                salonLocation: newUser.salonLocation,
                salonScale: newUser.salonScale,
                customerTraffic: newUser.customerTraffic,
                hasWebsite: newUser.hasWebsite,
                existingPlatforms: newUser.existingPlatforms,
                marketingGoal: newUser.marketingGoal,
                surveyCompleted: newUser.surveyCompleted
            }
        });

    } catch (error) {
        if (error.code === 11000) {
            console.warn('[Register Duplicate] Đăng ký trùng lặp đồng thời:', error.message);
            return res.status(409).json({ success: false, message: 'Tên đăng nhập, Email hoặc Số điện thoại này đã được đăng ký.' });
        }
        console.error('[Register Error] Lỗi đăng ký:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng ký tài khoản.', error: error.message });
    }
}

/**
 * ============================================================================
 * 2. ĐĂNG NHẬP HỆ THỐNG
 * POST /api/auth/login
 * ============================================================================
 */
async function login(req, res) {
    try {
        const { emailOrPhone, password } = req.body;

        if (!emailOrPhone || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền Email/Số điện thoại và Mật khẩu.' });
        }

        // Chống NoSQL Injection: đảm bảo emailOrPhone và password là chuỗi
        if (typeof emailOrPhone !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ success: false, message: 'Thông tin tài khoản hoặc mật khẩu không hợp lệ.' });
        }

        if (password.length > 72 || emailOrPhone.length > 100) {
            return res.status(400).json({ success: false, message: 'Thông tin tài khoản hoặc mật khẩu không chính xác.' });
        }

        const cleanIdentifier = emailOrPhone.trim();
        const strippedPhone = cleanIdentifier.replace(/[\s\(\)\-\.]/g, '');

        // Tìm người dùng theo Username, Email hoặc Số điện thoại (kể cả số đã chuẩn hóa)
        const user = await User.findOne({
            $or: [
                { username: cleanIdentifier.toLowerCase() },
                { email: cleanIdentifier.toLowerCase() },
                { phone: cleanIdentifier },
                { phone: strippedPhone }
            ]
        });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Thông tin tài khoản hoặc mật khẩu không chính xác.' });
        }

        // Đối chiếu mật khẩu
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Thông tin tài khoản hoặc mật khẩu không chính xác.' });
        }

        // Tạo JWT Token
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

        return res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công!',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                balance: user.balance,
                role: user.role
            }
        });

    } catch (error) {
        console.error('[Login Error] Lỗi đăng nhập:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập.', error: error.message });
    }
}

/**
 * ============================================================================
 * 3. LẤY THÔNG TIN CÁ NHÂN CẬP NHẬT
 * GET /api/auth/me
 * ============================================================================
 */
async function getProfile(req, res) {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
        }
        return res.status(200).json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                balance: user.balance,
                role: user.role
            }
        });
    } catch (error) {
        console.error('[GetProfile Error] Lỗi lấy thông tin cá nhân:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy thông tin cá nhân.', error: error.message });
    }
}

module.exports = {
    register,
    login,
    getProfile
};
