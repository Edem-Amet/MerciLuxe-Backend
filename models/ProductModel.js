const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Product name is required'],
            trim: true,
        },
        description: {
            type: String,
            default: '',
        },
        price: {
            type: Number,
            required: [true, 'Price is required'],
            min: [0, 'Price cannot be negative'],
        },
        originalPrice: {
            type: Number,
            default: null,
            min: [0, 'Original price cannot be negative'],
        },
        category: {
            type: String,
            required: [true, 'Category is required'],
            enum: ['Gents', 'Haven', 'Cooperate', 'Souvenirs', 'Beads', 'Jewelry', 'Special'],
            default: 'Special',
        },
        images: [
            {
                imageUrl: {
                    type: String,
                    default: '',
                },
                altText: {
                    type: String,
                    default: '',
                },
            },
        ],
        videos: [
            {
                videoUrl: {
                    type: String,
                    default: '',
                },
                title: {
                    type: String,
                    default: '',
                },
            },
        ],
        inStock: {
            type: Boolean,
            default: true,
        },
        stockQuantity: {
            type: Number,
            default: 0,
            min: [0, 'Stock quantity cannot be negative'],
        },
        lowStockThreshold: {
            type: Number,
            default: 10,
            min: [0, 'Low stock threshold cannot be negative'],
        },
        isOnSale: {
            type: Boolean,
            default: false,
        },
        discountPercentage: {
            type: Number,
            default: 0,
            min: [0, 'Discount percentage cannot be negative'],
            max: [100, 'Discount percentage cannot exceed 100'],
        },
        discountAmount: {
            type: Number,
            default: 0,
            min: [0, 'Discount amount cannot be negative'],
        },
        discountStartDate: {
            type: Date,
            default: null,
        },
        discountEndDate: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual: Calculate sale price
ProductSchema.virtual('salePrice').get(function () {
    if (this.isOnSale && this.discountPercentage > 0) {
        const discount = this.price * (this.discountPercentage / 100);
        return Math.max(0, this.price - discount);
    }
    if (this.isOnSale && this.discountAmount > 0) {
        return Math.max(0, this.price - this.discountAmount);
    }
    return this.price;
});

// Virtual: Calculate savings
ProductSchema.virtual('savings').get(function () {
    if (this.isOnSale && this.discountPercentage > 0) {
        return this.price * (this.discountPercentage / 100);
    }
    if (this.isOnSale && this.discountAmount > 0) {
        return this.discountAmount;
    }
    return 0;
});

// Virtual: Check if discount is currently active
ProductSchema.virtual('isDiscountActive').get(function () {
    if (!this.isOnSale) return false;
    const now = new Date();
    if (this.discountStartDate && now < this.discountStartDate) return false;
    if (this.discountEndDate && now > this.discountEndDate) return false;
    return true;
});

// Middleware: Update stock status before saving
ProductSchema.pre('save', function (next) {
    // Update stock status based on quantity
    if (this.stockQuantity <= 0) {
        this.inStock = false;
    } else {
        this.inStock = true;
    }
    next();
});

// Static Method: Find products by category
ProductSchema.statics.findByCategory = function (category) {
    return this.find({
        category: category,
        inStock: true,
    }).sort({ createdAt: -1 });
};

// Static Method: Find products on sale
ProductSchema.statics.findOnSale = function (limit = 10) {
    const now = new Date();
    return this.find({
        isOnSale: true,
        inStock: true,
        $or: [
            { discountStartDate: { $lte: now }, discountEndDate: { $gte: now } },
            { discountStartDate: null, discountEndDate: null },
        ],
    })
        .sort({ discountPercentage: -1, createdAt: -1 })
        .limit(limit);
};

// Static Method: Find low stock products
ProductSchema.statics.findLowStock = function () {
    return this.find({
        inStock: true,
        $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
        stockQuantity: { $gt: 0 },
    }).sort({ stockQuantity: 1 });
};

// Static Method: Find all in-stock products
ProductSchema.statics.findInStock = function () {
    return this.find({ inStock: true }).sort({ createdAt: -1 });
};

// Instance Method: Check if product is low on stock
ProductSchema.methods.isLowStock = function () {
    return this.stockQuantity > 0 && this.stockQuantity <= this.lowStockThreshold;
};

// Instance Method: Update stock quantity
ProductSchema.methods.updateStock = function (quantity, operation = 'set') {
    if (operation === 'add') {
        this.stockQuantity += quantity;
    } else if (operation === 'subtract') {
        this.stockQuantity = Math.max(0, this.stockQuantity - quantity);
    } else {
        this.stockQuantity = Math.max(0, quantity);
    }

    this.inStock = this.stockQuantity > 0;
    return this.save();
};

// Instance Method: Reduce stock after purchase
ProductSchema.methods.reduceStock = function (quantity = 1) {
    this.stockQuantity = Math.max(0, this.stockQuantity - quantity);
    if (this.stockQuantity === 0) {
        this.inStock = false;
    }
    return this.save();
};

// Create and export the model
const Product = mongoose.model('Product', ProductSchema);

module.exports = Product;