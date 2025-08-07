const express = require('express');
const { initiatePayment, verifyPayment } = require('../controllers/PaymentController');
const { createOrder, getOrderById } = require('../controllers/OrderController');
const Order = require('../models/OrderModel');
const router = express.Router();

// Create new order
router.post('/', async (req, res) => {
    try {
        // Validate required fields first
        const requiredFields = ['customer', 'items', 'totalAmount', 'paymentMethod', 'deliveryDate'];
        for (const field of requiredFields) {
            if (!req.body[field]) {
                return res.status(400).json({ message: `${field} is required` });
            }
        }

        const order = new Order({
            customer: {
                name: req.body.customer.name,
                email: req.body.customer.email,
                phone: req.body.customer.phone,
                address: req.body.customer.address
            },
            deliveryDate: req.body.deliveryDate,
            items: req.body.items,
            totalAmount: req.body.totalAmount,
            paymentMethod: req.body.paymentMethod,
            paymentStatus: 'pending'
        });

        await order.save();
        res.status(201).json(order);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Initiate payment
router.post('/payment', initiatePayment);


router.post('/', createOrder);


router.get('/:id', getOrderById);

module.exports = router;