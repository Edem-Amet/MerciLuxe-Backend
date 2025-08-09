const Order = require('../models/OrderModel');


// Create new order
exports.createOrder = async (req, res) => {
    try {
        console.log('=== ORDER CREATION REQUEST ===');
        console.log('Request body:', req.body);

        // Validate required fields (removed paymentReference from required fields)
        const requiredFields = [
            'customer.name',
            'customer.email',
            'customer.phone',
            'customer.address',
            'deliveryDate',
            'items',
            'totalAmount',
            'paymentMethod'
        ];

        for (const field of requiredFields) {
            const keys = field.split('.');
            let value = req.body;

            for (const key of keys) {
                value = value?.[key];
            }

            if (!value) {
                console.error(`Missing required field: ${field}`);
                return res.status(400).json({
                    success: false,
                    message: `Missing required field: ${field}`
                });
            }
        }

        // Validate items array
        if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
            console.error('Invalid items array:', req.body.items);
            return res.status(400).json({
                success: false,
                message: 'Order must contain at least one item'
            });
        }

        // Create the order (paymentReference will be added later during payment initiation)
        const order = new Order({
            customer: {
                name: req.body.customer.name.trim(),
                email: req.body.customer.email.toLowerCase().trim(),
                phone: req.body.customer.phone.trim(),
                address: req.body.customer.address.trim()
            },
            deliveryDate: new Date(req.body.deliveryDate),
            items: req.body.items.map(item => ({
                productId: item.productId,
                title: item.title,
                price: parseFloat(item.price),
                quantity: parseInt(item.quantity),
                image: item.image
            })),
            totalAmount: parseFloat(req.body.totalAmount),
            paymentMethod: req.body.paymentMethod,
            paymentStatus: 'pending'
            // paymentReference will be set during payment initiation
        });


        const savedOrder = await order.save();
        console.log('Order created successfully:', savedOrder._id);

        res.status(201).json({
            success: true,
            _id: savedOrder._id,
            customer: savedOrder.customer,
            items: savedOrder.items,
            totalAmount: savedOrder.totalAmount,
            paymentMethod: savedOrder.paymentMethod,
            paymentStatus: savedOrder.paymentStatus,
            deliveryDate: savedOrder.deliveryDate,
            createdAt: savedOrder.createdAt
        });

    } catch (error) {
        console.error('=== ORDER CREATION ERROR ===');
        console.error('Error details:', error);

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const errorMessages = Object.values(error.errors).map(err => err.message);
            console.error('Validation errors:', errorMessages);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errorMessages
            });
        }

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
        const orders = await Order.find()
            .sort({ createdAt: -1 })
            .select('customer.name customer.email paymentStatus totalAmount createdAt deliveryDate items');

        res.status(200).json({
            success: true,
            data: orders,
            count: orders.length
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
};

// Get single order by ID
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

        // Handle invalid ObjectId
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID format'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to fetch order',
            error: error.message
        });
    }
};

// Delete order (optional - for future admin use)
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
            message: 'Order deleted successfully',
            data: {
                id: order._id,
                customerName: order.customer.name
            }
        });
    } catch (error) {
        console.error('Error deleting order:', error);

        // Handle invalid ObjectId
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID format'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to delete order',
            error: error.message
        });
    }
};