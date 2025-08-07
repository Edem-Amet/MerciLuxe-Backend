const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    customer: {
        name: {
            type: String,
            required: [true, 'Customer name is required']
        },
        email: {
            type: String,
            required: [true, 'Customer email is required'],
            match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
        },
        phone: {
            type: String,
            required: [true, 'Phone number is required'],
            match: [/^0\d{9}$/, 'Please enter a valid Ghanaian phone number']
        },
        address: {
            type: String,
            required: [true, 'Delivery address is required']
        }
    },
    deliveryDate: {
        type: Date,
        required: [true, 'Expected delivery date is required']
    },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Jewelry',
            required: true
        },
        title: String,
        price: Number,
        quantity: Number,
        image: String
    }],
    totalAmount: {
        type: Number,
        required: true,
        min: [0, 'Total amount must be positive']
    },
    paymentMethod: {
        type: String,
        enum: ['momo', 'card', 'bank'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed'],
        default: 'pending'
    },
    paymentReference: {
        type: String,
        default: null
    },
    isDelivered: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);