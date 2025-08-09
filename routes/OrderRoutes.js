const express = require('express');
const { initiatePayment, verifyPayment } = require('../controllers/PaymentController');
const { createOrder, getOrderById, getAllOrders, deleteOrder } = require('../controllers/OrderController');
const router = express.Router();

// Create new order
router.post('/', createOrder);

// Get single order by ID
router.get('/:id', getOrderById);

// Get all orders (optional - for admin if needed later)
router.get('/', getAllOrders);

// Delete order (optional - for admin if needed later)
router.delete('/:id', deleteOrder);

// Payment routes
router.post('/payment/initiate', initiatePayment);
router.get('/payment/verify/:reference', verifyPayment);

module.exports = router;