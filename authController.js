/**
 * authController.js
 * Controller xử lý đăng ký, đăng nhập và phân cấp người dùng qua Email / Số điện thoại.
 * Dự án SMM Panel: Bitpawnetwork
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('./models');

const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_KEY_BITPAW_NETWORK';

/**
 * ============================================================================
 * 1. ĐĂNG KÝ TÀI KHOẢN MỚI
 * POST /api/auth/register
 * ============================================================================
 */
async function register(req, res) {
    try {
        const { emailOrPhone, username, password, email: reqEmail, phone: reqPhone, fullName, confirmPassword } = req.body;



        let email = reqEmail ? reqEmail.trim().toLowerCase() : null;
        let phone = reqPhone ? reqPhone.trim() : null;

        if (!email && !phone) {
            // Fallback to emailOrPhone
            if (!emailOrPhone) {
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

        if (confirmPassword && password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Mật khẩu nhập lại không khớp.' });
        }

        // Validate email format if provided
        if (email) {
            const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            if (!isEmailValid) {
                return res.status(400).json({ success: false, message: 'Định dạng Email không hợp lệ.' });
            }
        }

        // Validate phone format if provided
        if (phone) {
            const isPhoneValid = /^[0-9+]{9,15}$/.test(phone);
            if (!isPhoneValid) {
                return res.status(400).json({ success: false, message: 'Định dạng Số điện thoại không hợp lệ.' });
            }
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

        const newUser = new User(userObj);
        await newUser.save();

        // Tạo JWT Token phiên làm việc
        const token = jwt.sign({ id: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: '1d' });

        return res.status(201).json({
            success: true,
            message: 'Đăng ký tài khoản thành công!',
            token,
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                phone: newUser.phone,
                balance: newUser.balance,
                role: newUser.role
            }
        });

    } catch (error) {
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

        const cleanIdentifier = emailOrPhone.trim();



        // Tìm người dùng theo Username, Email hoặc Số điện thoại
        const user = await User.findOne({
            $or: [
                { username: cleanIdentifier.toLowerCase() },
                { email: cleanIdentifier.toLowerCase() },
                { phone: cleanIdentifier }
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
