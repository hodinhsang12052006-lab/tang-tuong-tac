/**
 * paymentController.js
 * Controller xử lý luồng nạp tiền phê duyệt thủ công (Manual Deposit Approval) và đối soát tài chính.
 * Dự án SMM Panel: Bitpawnetwork
 */

const mongoose = require('mongoose');
const { User, Transaction } = require('./models');

/**
 * ============================================================================
 * 1. KHÁCH HÀNG GỬI YÊU CẦU XÁC NHẬN NẠP TIỀN
 * POST /api/payments/request
 * ============================================================================
 */
async function requestDeposit(req, res) {
    try {
        const { amount, transactionId, paymentMethod } = req.body;
        const userId = req.user._id; // Trích xuất từ verifyUser middleware

        if (!amount || !transactionId) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp Số tiền và Mã giao dịch.' });
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Số tiền chuyển khoản không hợp lệ.' });
        }

        const method = paymentMethod || 'Vikki Bank';

        // PHÒNG CHỐNG SPAM / TRÙNG LẶP MÃ GIAO DỊCH
        const existingTx = await Transaction.findOne({ transactionId: transactionId.trim() });
        if (existingTx) {
            return res.status(409).json({ 
                success: false, 
                message: 'Mã giao dịch này đã tồn tại trên hệ thống hoặc đang được duyệt.' 
            });
        }

        // Tạo yêu cầu nạp tiền mới với trạng thái mặc định: Pending
        const newTx = new Transaction({
            userId,
            transactionId: transactionId.trim(),
            amount: parsedAmount,
            paymentMethod: method,
            status: 'Pending'
        });

        await newTx.save();

        console.log(`[Payment Request] Khách hàng #${req.user.username} gửi yêu cầu nạp $${parsedAmount} (TxID: ${transactionId})`);

        return res.status(201).json({
            success: true,
            message: 'Gửi yêu cầu xác nhận nạp tiền thành công! Trạng thái đang chờ duyệt.',
            transaction: newTx
        });

    } catch (error) {
        console.error('[Payment Request Exception] Lỗi gửi yêu cầu:', error);
        return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi gửi yêu cầu nạp tiền.', error: error.message });
    }
}

/**
 * ============================================================================
 * 2. QUẢN TRỊ VIÊN DUYỆT CỘNG TIỀN (Approve)
 * POST /api/payments/approve/:txId
 * ============================================================================
 */
async function approveDeposit(req, res) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { txId } = req.params;

        // Tìm kiếm giao dịch trong DB
        const tx = await Transaction.findById(txId).session(session);
        if (!tx) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin giao dịch.' });
        }

        if (tx.status !== 'Pending') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: `Giao dịch này đã được xử lý trước đó (Trạng thái: ${tx.status}).` });
        }

        // Tìm người dùng liên kết
        const user = await User.findById(tx.userId).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng thụ hưởng.' });
        }

        // Cộng tiền và đổi trạng thái giao dịch thành Approved
        const oldBalance = user.balance;
        user.balance = parseFloat((parseFloat(user.balance) + parseFloat(tx.amount)).toFixed(4));
        await user.save({ session });

        tx.status = 'Approved';
        await tx.save({ session });

        await session.commitTransaction();
        session.endSession();

        console.log(`[Payment Approved] Admin duyệt thành công giao dịch #${tx._id} cho #${user.username}. +$${tx.amount}. Balance: $${oldBalance} -> $${user.balance}`);

        return res.status(200).json({
            success: true,
            message: `Phê duyệt thành công! Đã cộng $${tx.amount.toFixed(2)} vào tài khoản khách hàng.`,
            data: {
                username: user.username,
                addedAmount: tx.amount,
                newBalance: user.balance
            }
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('[Payment Approve Exception] Lỗi phê duyệt nạp tiền:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi duyệt giao dịch.', error: error.message });
    }
}

/**
 * ============================================================================
 * 3. QUẢN TRỊ VIÊN TỪ CHỐI GIAO DỊCH (Reject)
 * POST /api/payments/reject/:txId
 * ============================================================================
 */
async function rejectDeposit(req, res) {
    try {
        const { txId } = req.params;

        const tx = await Transaction.findById(txId);
        if (!tx) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin giao dịch.' });
        }

        if (tx.status !== 'Pending') {
            return res.status(400).json({ success: false, message: `Giao dịch này đã được xử lý trước đó (Trạng thái: ${tx.status}).` });
        }

        // Cập nhật trạng thái giao dịch sang Failed (Từ chối) và không cộng tiền
        tx.status = 'Failed';
        await tx.save();

        console.log(`[Payment Rejected] Admin từ chối giao dịch #${tx._id} (TxID: ${tx.transactionId})`);

        return res.status(200).json({
            success: true,
            message: 'Đã từ chối yêu cầu nạp tiền này thành công.'
        });

    } catch (error) {
        console.error('[Payment Reject Exception] Lỗi từ chối nạp tiền:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi từ chối giao dịch.', error: error.message });
    }
}

/**
 * ============================================================================
 * 4. TRUY VẤN LỊCH SỬ GIAO DỊCH CỦA MỘT NGƯỜI DÙNG (Cá nhân)
 * GET /api/payments/my-transactions
 * ============================================================================
 */
async function getUserTransactions(req, res) {
    try {
        const userId = req.user._id;
        const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 });
        
        return res.status(200).json({
            success: true,
            data: transactions
        });
    } catch (error) {
        console.error('[Get My Tx Error] Lỗi lấy lịch sử giao dịch:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy lịch sử giao dịch.' });
    }
}

/**
 * ============================================================================
 * 5. TRUY VẤN TOÀN BỘ CÁC GIAO DỊCH ĐANG CHỜ DUYỆT (Dành cho Admin)
 * GET /api/payments/pending
 * ============================================================================
 */
async function getAllPendingTransactions(req, res) {
    try {
        const pendingTxs = await Transaction.find({ status: 'Pending' })
            .populate('userId', 'username email') // Lấy kèm tên đăng nhập & email
            .sort({ createdAt: 1 }); // Xếp cũ nhất lên đầu để duyệt trước

        return res.status(200).json({
            success: true,
            data: pendingTxs
        });
    } catch (error) {
        console.error('[Get Pending Tx Error] Lỗi lấy các giao dịch chờ duyệt:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy giao dịch chờ duyệt.' });
    }
}

module.exports = {
    requestDeposit,
    approveDeposit,
    rejectDeposit,
    getUserTransactions,
    getAllPendingTransactions
};
