const axios = require('axios');
const Order = require('../models/OrderModel');

const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

// INITIATE PAYMENT
exports.initiatePayment = async (req, res) => {
    try {
        const { orderId, amount, email, phone, method, callbackUrl } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const paystackPayload = {
            email,
            amount, // Paystack expects amount in **kobo**, already handled on frontend
            callback_url: callbackUrl,
            metadata: {
                custom_fields: [
                    {
                        display_name: "Order ID",
                        variable_name: "order_id",
                        value: orderId
                    },
                    {
                        display_name: "Phone",
                        variable_name: "phone",
                        value: phone
                    }
                ]
            }
        };

        if (method === 'momo') {
            paystackPayload.channels = ['mobile_money'];
            paystackPayload.mobile_money = { phone };
        }

        const response = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            paystackPayload,
            {
                headers: {
                    Authorization: `Bearer ${paystackSecretKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            authorization_url: response.data.data.authorization_url,
            access_code: response.data.data.access_code,
            reference: response.data.data.reference
        });

    } catch (error) {
        console.error('Payment Init Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Payment initialization failed', error: error.response?.data || error.message });
    }
};

// VERIFY PAYMENT
exports.verifyPayment = async (req, res) => {
    try {
        const { reference } = req.params;

        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${paystackSecretKey}`
            }
        });

        const data = response.data.data;

        if (data.status === 'success') {
            const orderId = data.metadata?.custom_fields?.find(field => field.variable_name === 'order_id')?.value;

            if (!orderId) {
                return res.status(400).json({ message: 'Order ID not found in metadata' });
            }

            const order = await Order.findByIdAndUpdate(
                orderId,
                {
                    paymentStatus: 'paid',
                    isPaid: true,
                    paidAt: new Date()
                },
                { new: true }
            );

            return res.json({
                status: 'success',
                message: 'Payment verified successfully',
                order
            });
        }

        res.status(400).json({
            status: 'failed',
            message: 'Payment not successful'
        });

    } catch (error) {
        console.error('Verification Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Payment verification failed', error: error.response?.data || error.message });
    }
};
