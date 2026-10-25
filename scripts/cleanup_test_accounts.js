/**
 * Liệt kê (và chỉ khi được yêu cầu rõ ràng mới xoá) các tài khoản do bộ test tự động tạo ra.
 *
 * Các bộ test (test_full_system_e2e.js, test_mobile_devices.js, test_tay.js...) chạy với server local
 * nhưng server local dùng MONGO_URI trong .env = database thật, nên mỗi lần chạy test lại sinh thêm tài khoản.
 *
 *   node scripts/cleanup_test_accounts.js            -> CHỈ LIỆT KÊ, không thay đổi gì
 *   node scripts/cleanup_test_accounts.js --delete   -> xoá các tài khoản test đã liệt kê + giao dịch / đơn hàng của chúng
 *
 * Chỉ nhận tài khoản có username bắt đầu bằng các tiền tố test bên dưới VÀ không phải admin.
 * Bảng bị xoá theo: User, Transaction, Order, ViaOrder (theo userId).
 * Xoá là vĩnh viễn: chạy bản liệt kê trước, đọc kỹ danh sách rồi mới chạy --delete.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { User, Transaction, Order, ViaOrder } = require('../models');

const TEST_PREFIXES = ['e2e_', 'testuser_', 'test_', 'stress_', 'mobile_test_', 'survey_test_'];
const DELETE = process.argv.includes('--delete');

(async () => {
    if (!process.env.MONGO_URI) {
        console.error('Thiếu MONGO_URI trong .env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    const pattern = new RegExp('^(' + TEST_PREFIXES.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');
    const users = await User.find({ username: pattern, role: { $ne: 'admin' } }, { username: 1, createdAt: 1, balance: 1 }).lean();
    const total = await User.countDocuments({});

    console.log(`Tổng số user: ${total} | tài khoản test khớp tiền tố (${TEST_PREFIXES.join(', ')}): ${users.length}`);
    const byPrefix = {};
    users.forEach(u => { const p = TEST_PREFIXES.find(x => u.username.startsWith(x)); byPrefix[p] = (byPrefix[p] || 0) + 1; });
    console.log('Theo tiền tố:', byPrefix);
    users.slice(0, 200).forEach(u => console.log(`  - ${u.username}  (tạo ${u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '?'}, số dư $${u.balance || 0})`));
    if (users.length > 200) console.log(`  ... và ${users.length - 200} tài khoản nữa`);

    if (!DELETE) {
        console.log('\nChưa xoá gì. Đọc kỹ danh sách trên; muốn xoá thì chạy lại với --delete');
        await mongoose.disconnect();
        return;
    }

    const ids = users.map(u => u._id);
    const tx = Transaction ? await Transaction.deleteMany({ userId: { $in: ids } }) : { deletedCount: 0 };
    const od = Order ? await Order.deleteMany({ userId: { $in: ids } }) : { deletedCount: 0 };
    const vo = ViaOrder ? await ViaOrder.deleteMany({ userId: { $in: ids } }) : { deletedCount: 0 };
    const us = await User.deleteMany({ _id: { $in: ids } });
    console.log(`\nĐã xoá: ${us.deletedCount} tài khoản test, ${tx.deletedCount} giao dịch, ${od.deletedCount} đơn hàng, ${vo.deletedCount} đơn Via.`);
    await mongoose.disconnect();
})().catch(err => {
    console.error('Lỗi:', err.message);
    process.exit(1);
});
