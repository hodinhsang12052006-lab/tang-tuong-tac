/**
 * authMiddleware.js
 * Middleware xác thực người dùng (Authentication) & phân quyền quản trị (Authorization) bằng JWT.
 * Dự án SMM Panel: Bitpawnetwork
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('./models');

// Khóa bí mật dùng để ký và xác thực JWT
const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_KEY_BITPAW_NETWORK';

/**
 * ============================================================================
 * MIDDLEWARE 1: XÁC THỰC NGƯỜI DÙNG (verifyUser)
 * Bảo vệ các route yêu cầu khách hàng phải đăng nhập (đặt đơn, xem số dư,...)
 * ============================================================================
 */
async function verifyUser(req, res, next) {
    try {
        let token = null;

        // Trích xuất token từ header Authorization (Định dạng: Bearer <Token>)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        // Nếu không tìm thấy token trong Header
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Truy cập bị từ chối. Vui lòng cung cấp mã xác thực JWT token.' 
            });
        }

        // Giải mã và xác minh token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Tìm người dùng trong Database để đảm bảo tài khoản vẫn đang hoạt động
        const user = await User.findById(decoded.id).select('-password'); // Bỏ qua mật khẩu

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Token không hợp lệ hoặc người dùng không còn tồn tại.' 
            });
        }

        // Đính kèm thông tin user hợp lệ vào đối tượng Request
        req.user = user;
        next(); // Chuyển sang middleware/controller tiếp theo

    } catch (error) {
        console.error('[JWT Auth Error] Xác thực thất bại:', error.message);
        
        // Phản hồi chi tiết tùy theo loại lỗi của jwt
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Mã xác thực JWT token đã hết hạn.' });
        }
        return res.status(401).json({ success: false, message: 'Mã xác thực JWT không hợp lệ.' });
    }
}

/**
 * ============================================================================
 * MIDDLEWARE 2: XÁC THỰC QUẢN TRỊ VIÊN (verifyAdmin)
 * Chặn các route chỉ cho phép tài khoản Admin gọi (cấu hình giá, đồng bộ API,...)
 * Yêu cầu phải chạy verifyUser trước để trích xuất req.user
 * ============================================================================
 */
function verifyAdmin(req, res, next) {
    // Đảm bảo thông tin user đã được xác thực bởi verifyUser trước đó
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            message: 'Yêu cầu đăng nhập trước khi thực hiện hành động này.' 
        });
    }

    // Kiểm tra vai trò của người dùng
    if (req.user.role !== 'admin') {
        console.warn(`[Unauthorized Admin Attempt] Tài khoản #${req.user.username} cố gắng truy cập trái phép quyền Admin.`);
        return res.status(403).json({ 
            success: false, 
            message: 'Truy cập bị từ chối. Bạn không có quyền quản trị viên cho tính năng này.' 
        });
    }

    next(); // Hợp lệ, cho phép tiếp tục
}

module.exports = {
    verifyUser,
    verifyAdmin
};
