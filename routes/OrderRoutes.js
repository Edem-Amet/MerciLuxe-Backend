const express = require('express');
const { initiatePayment, verifyPayment } = require('../controllers/PaymentController');
const { createOrder, getOrderById, getAllOrders, deleteOrder } = require('../controllers/OrderController');
const router = express.Router();

// IMPORTANT: Specific routes MUST come BEFORE parameterized routes
// Get all orders - must come BEFORE /:id
router.get('/all', getAllOrders);

// Payment routes
router.post('/payment/initiate', initiatePayment);
router.get('/payment/verify/:reference', verifyPayment);

// Create new order
router.post('/', createOrder);

// Get single order by ID - comes AFTER /all
router.get('/:id', getOrderById);

// Delete order
router.delete('/:id', deleteOrder);

module.exports = router;