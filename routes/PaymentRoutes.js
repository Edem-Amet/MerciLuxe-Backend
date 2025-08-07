const express = require('express');
const router = express.Router();
const { initiatePayment, verifyPayment } = require('../controllers/PaymentController');

router.post('/initiate', initiatePayment);

router.get('/verify/:reference', verifyPayment);

module.exports = router;
