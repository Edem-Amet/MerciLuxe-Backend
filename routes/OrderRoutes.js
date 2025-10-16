const express = require('express');
const { initiatePayment, verifyPayment } = require('../controllers/PaymentController');
const { createOrder, getOrderById, getAllOrders, deleteOrder } = require('../controllers/OrderController');
const router = express.Router();

// Payment routes
router.post('/payment/initiate', initiatePayment);
router.get('/payment/verify/:reference', verifyPayment);

// Get all orders - use a more explicit path
router.get('/list/all', getAllOrders);

// Create new order
router.post('/', createOrder);

// Get single order by ID
router.get('/:id', getOrderById);

// Delete order
router.delete('/:id', deleteOrder);

module.exports = router;