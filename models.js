/**
 * models.js
 * Định nghĩa cấu trúc cơ sở dữ liệu (Database Schemas) sử dụng Mongoose cho MongoDB.
 * Dự án SMM Panel: Bitpawnetwork
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ==========================================
// 1. USER SCHEMA (Người dùng & Số dư tài khoản)
// ==========================================
const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Vui lòng cung cấp tên đăng nhập'],
        unique: true,
        trim: true,
        lowercase: true,
        minlength: [3, 'Tên đăng nhập phải từ 3 ký tự trở lên']
    },
    email: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    password: {
        type: String,
        required: [true, 'Vui lòng cung cấp mật khẩu'],
        minlength: [6, 'Mật khẩu phải từ 6 ký tự trở lên']
    },
    balance: {
        type: Number,
        default: 0.0, // Số dư mặc định khi tạo tài khoản
        min: [0.0, 'Số dư không thể âm']
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware Mongoose: Tự động mã hóa mật khẩu trước khi lưu
UserSchema.pre('save', async function (next) {
    // Chỉ hash lại mật khẩu khi trường mật khẩu bị thay đổi
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Phương thức đối chiếu mật khẩu khi đăng nhập
UserSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};


// ==========================================
// 2. SERVICE SCHEMA (Thông tin gói dịch vụ)
// ==========================================
const ServiceSchema = new mongoose.Schema({
    serviceId: {
        type: String,
        required: [true, 'Mã ID dịch vụ gốc là bắt buộc'],
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: [true, 'Tên dịch vụ là bắt buộc'],
        trim: true
    },
    providerUrl: {
        type: String,
        required: [true, 'Đường dẫn API của nhà cung cấp gốc là bắt buộc'],
        trim: true
    },
    originalPrice: {
        type: Number,
        required: [true, 'Giá gốc của nhà cung cấp là bắt buộc'],
        min: [0, 'Giá gốc không thể âm']
    },
    markupPercent: {
        type: Number,
        default: 30, // Phần trăm tăng giá mặc định (ví dụ: 30%)
        min: [0, 'Tỉ lệ tăng giá không thể âm']
    },
    sellingPrice: {
        type: Number,
        required: [true, 'Giá bán ra cho khách hàng là bắt buộc'],
        min: [0, 'Giá bán ra không thể âm']
    },
    status: {
        type: Boolean,
        default: true // Bật/Tắt trạng thái hoạt động của dịch vụ
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware pre-save để tự động tính toán sellingPrice dựa vào originalPrice và markupPercent
ServiceSchema.pre('save', function (next) {
    // Giá bán ra = Giá gốc + (Giá gốc * % markup / 100)
    this.sellingPrice = parseFloat((this.originalPrice + (this.originalPrice * this.markupPercent / 100)).toFixed(4));
    this.updatedAt = Date.now();
    next();
});


// ==========================================
// 3. ORDER SCHEMA (Theo dõi đơn hàng tương tác)
// ==========================================
const OrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Mã định danh User là bắt buộc']
    },
    serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        required: [true, 'Mã định danh Dịch vụ là bắt buộc']
    },
    link: {
        type: String,
        required: [true, 'Đường dẫn đích (link) là bắt buộc'],
        trim: true
    },
    quantity: {
        type: Number,
        required: [true, 'Số lượng mua là bắt buộc'],
        min: [10, 'Số lượng đặt mua tối thiểu là 10']
    },
    charge: {
        type: Number,
        required: [true, 'Chi phí thu của khách là bắt buộc'],
        min: [0.0, 'Chi phí không thể âm']
    },
    providerOrderId: {
        type: String,
        default: null // Sẽ cập nhật sau khi gọi API đẩy đơn thành công sang Provider gốc
    },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Completed', 'Canceled'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Đánh index phức hợp để tăng tốc độ truy vấn đếm đơn hàng cho User
OrderSchema.index({ userId: 1, status: 1 });

// ==========================================
// 4. TRANSACTION SCHEMA (Lịch sử nạp tiền)
// ==========================================
const TransactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Mã định danh User là bắt buộc']
    },
    transactionId: {
        type: String,
        required: [true, 'Mã giao dịch là bắt buộc'],
        unique: true,
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Số tiền nạp là bắt buộc'],
        min: [0.01, 'Số tiền nạp tối thiểu là $0.01']
    },
    paymentMethod: {
        type: String,
        required: [true, 'Phương thức thanh toán là bắt buộc'],
        trim: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Success', 'Failed', 'Rejected'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// ==========================================
// 5. VIA PRODUCT SCHEMA (Thông tin tài nguyên Via/Clone từ nguồn)
// ==========================================
const ViaProductSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: [true, 'Mã sản phẩm Via là bắt buộc'],
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: [true, 'Tên sản phẩm là bắt buộc'],
        trim: true
    },
    category: {
        type: String,
        required: [true, 'Danh mục là bắt buộc'],
        trim: true
    },
    originalPrice: {
        type: Number,
        required: [true, 'Giá gốc của nguồn là bắt buộc'],
        min: [0, 'Giá không thể âm']
    },
    sellingPrice: {
        type: Number,
        required: [true, 'Giá bán ra cho khách hàng là bắt buộc'],
        min: [0, 'Giá không thể âm']
    },
    stock: {
        type: Number,
        default: 0
    },
    country: {
        type: String,
        default: 'Global'
    },
    flag: {
        type: String,
        default: '🌐'
    },
    friends: {
        type: String,
        default: '0 - 100'
    },
    status: {
        type: Boolean,
        default: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ==========================================
// 6. VIA ORDER SCHEMA (Theo dõi lịch sử mua Via của khách hàng)
// ==========================================
const ViaOrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Mã định danh User là bắt buộc']
    },
    productId: {
        type: String,
        required: [true, 'Mã sản phẩm Via là bắt buộc']
    },
    productName: {
        type: String,
        required: [true, 'Tên sản phẩm là bắt buộc']
    },
    quantity: {
        type: Number,
        required: [true, 'Số lượng mua là bắt buộc'],
        min: [1, 'Số lượng mua tối thiểu là 1']
    },
    charge: {
        type: Number,
        required: [true, 'Chi phí thanh toán là bắt buộc'],
        min: [0, 'Chi phí không thể âm']
    },
    accounts: {
        type: [String], // Lưu danh sách định dạng bàn giao: UID|Pass|2FA...
        default: []
    },
    status: {
        type: String,
        enum: ['Success', 'Failed'],
        default: 'Success'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Tạo các Model
const User = mongoose.model('User', UserSchema);
const Service = mongoose.model('Service', ServiceSchema);
const Order = mongoose.model('Order', OrderSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const ViaProduct = mongoose.model('ViaProduct', ViaProductSchema);
const ViaOrder = mongoose.model('ViaOrder', ViaOrderSchema);

const SystemConfigSchema = new mongoose.Schema({
    key: {
        type: String,
        required: [true, 'Khóa cấu hình là bắt buộc'],
        unique: true,
        trim: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: [true, 'Giá trị cấu hình là bắt buộc']
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

SystemConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);

// Xuất các thực thể models
module.exports = {
    User,
    Service,
    Order,
    Transaction,
    ViaProduct,
    ViaOrder,
    SystemConfig
};
