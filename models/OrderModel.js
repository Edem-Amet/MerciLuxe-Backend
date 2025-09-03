const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    customer: {
        name: {
            type: String,
            required: [true, 'Customer name is required']
        },
        email: {
            type: String,
            match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address'],
            default: ''
        },
        phone: {
            type: String,
            match: [/^0\d{9}$/, 'Please enter a valid Ghanaian phone number'],
            default: ''
        },
        address: {
            type: String,
            default: ''
        },
        additionalMessage: {
            type: String,
            default: '',
            maxlength: [500, 'Additional message cannot exceed 500 characters']
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
        sparse: true, // This allows multiple null values but ensures unique non-null values
        default: undefined // Use undefined instead of null to avoid the duplicate key issue
    },
    isDelivered: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Create a sparse index on paymentReference to allow multiple null/undefined values
OrderSchema.index({ paymentReference: 1 }, { sparse: true, unique: true });

module.exports = mongoose.model('Order', OrderSchema);