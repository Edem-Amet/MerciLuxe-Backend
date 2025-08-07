const Order = require('../models/OrderModel');
const _ = require('lodash');

// Create new order
exports.createOrder = async (req, res) => {
    try {
        // Validate required fields
        const requiredFields = [
            'customer.name',
            'customer.email',
            'customer.phone',
            'customer.address',
            'deliveryDate',
            'items',
            'totalAmount',
            'paymentMethod',
            'paymentStatus',
            'paymentReference'
        ];

        for (const field of requiredFields) {
            if (!_.get(req.body, field)) {
                return res.status(400).json({
                    success: false,
                    message: `Missing required field: ${field}`
                });
            }
        }

        // Validate items array
        if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Order must contain at least one item'
            });
        }

        // Create the order
        const order = new Order({
            customer: {
                name: req.body.customer.name,
                email: req.body.customer.email,
                phone: req.body.customer.phone,
                address: req.body.customer.address
            },
            deliveryDate: new Date(req.body.deliveryDate),
            items: req.body.items.map(item => ({
                productId: item.productId,
                title: item.title,
                price: item.price,
                quantity: item.quantity,
                image: item.image
            })),
            totalAmount: req.body.totalAmount,
            paymentMethod: req.body.paymentMethod,
            paymentStatus: req.body.paymentStatus,
            paymentReference: req.body.paymentReference
        });

        // Save the order
        const savedOrder = await order.save();

        res.status(201).json({
            success: true,
            data: savedOrder,
            message: 'Order created successfully'
        });
    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order',
            error: error.message
        });
    }
};

// Get all orders
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
};

// Get single order
exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        res.status(200).json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order'
        });
    }
};

// Delete order
exports.deleteOrder = async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }
        res.status(200).json({
            success: true,
            message: 'Order deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete order'
        });
    }
};