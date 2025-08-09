const axios = require('axios');
const Order = require('../models/OrderModel');
const nodemailer = require('nodemailer');

const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

// Email transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    }
});

// INITIATE PAYMENT
exports.initiatePayment = async (req, res) => {
    try {
        console.log('=== PAYMENT INITIATION REQUEST ===');
        console.log('Request body:', req.body);

        const { orderId, amount, email, phone, method, callbackUrl } = req.body;

        // Validate required fields
        if (!orderId || !amount || !email || !method) {
            console.error('Missing required fields:', { orderId: !!orderId, amount: !!amount, email: !!email, method: !!method });
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: orderId, amount, email, and method are required'
            });
        }

        console.log('Looking for order:', orderId);
        const order = await Order.findById(orderId);
        if (!order) {
            console.error('Order not found:', orderId);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        console.log('Order found:', order._id);
        console.log('Paystack secret key available:', !!paystackSecretKey);

        const paystackPayload = {
            email,
            amount, // Amount already in kobo from frontend
            callback_url: callbackUrl || `${process.env.FRONTEND_URL}/payment/callback`,
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
                        value: phone || 'N/A'
                    }
                ]
            }
        };

        // Set specific channels for mobile money
        if (method === 'momo') {
            paystackPayload.channels = ['mobile_money'];
            if (phone) {
                paystackPayload.mobile_money = { phone };
            }
        } else if (method === 'card') {
            paystackPayload.channels = ['card'];
        } else if (method === 'bank') {
            paystackPayload.channels = ['bank', 'bank_transfer'];
        }

        console.log('Paystack payload:', paystackPayload);

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

        console.log('Paystack response:', response.data);

        // Update order with payment reference
        await Order.findByIdAndUpdate(orderId, {
            paymentReference: response.data.data.reference
        });

        res.json({
            success: true,
            authorization_url: response.data.data.authorization_url,
            access_code: response.data.data.access_code,
            reference: response.data.data.reference
        });

    } catch (error) {
        console.error('=== PAYMENT INITIATION ERROR ===');
        console.error('Error details:', error.response?.data || error.message);
        console.error('Full error:', error);

        res.status(500).json({
            success: false,
            message: 'Payment initialization failed',
            error: error.response?.data || error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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
                return res.status(400).json({
                    success: false,
                    message: 'Order ID not found in payment metadata'
                });
            }

            // Update order status
            const order = await Order.findByIdAndUpdate(
                orderId,
                {
                    paymentStatus: 'paid',
                    paymentReference: reference,
                    updatedAt: new Date()
                },
                { new: true }
            );

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // Send confirmation email
            await sendOrderConfirmationEmail(order, data.amount / 100); // Convert from kobo

            return res.json({
                success: true,
                status: 'success',
                message: 'Payment verified successfully',
                order: {
                    id: order._id,
                    paymentStatus: order.paymentStatus,
                    totalAmount: order.totalAmount
                }
            });
        }

        res.status(400).json({
            success: false,
            status: 'failed',
            message: 'Payment verification failed'
        });

    } catch (error) {
        console.error('Verification Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed',
            error: error.response?.data || error.message
        });
    }
};

// Send order confirmation email
const sendOrderConfirmationEmail = async (order, paidAmount) => {
    try {
        const itemsList = order.items.map(item =>
            `<li style="margin-bottom: 10px;">
                <strong>${item.title}</strong> - Quantity: ${item.quantity} - GH₵${item.price.toFixed(2)} each
            </li>`
        ).join('');

        const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f9f9f9;
                }
                .header {
                    background-color: #4CAF50;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }
                .content {
                    background-color: white;
                    padding: 30px;
                    border-radius: 0 0 5px 5px;
                }
                .order-details {
                    background-color: #f0f0f0;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 5px;
                }
                .items-list {
                    margin: 15px 0;
                    padding-left: 20px;
                }
                .total {
                    font-size: 18px;
                    font-weight: bold;
                    color: #4CAF50;
                    margin-top: 15px;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    color: #666;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Order Confirmation</h1>
                    <p>Thank you for your purchase!</p>
                </div>
                
                <div class="content">
                    <p>Dear <strong>${order.customer.name}</strong>,</p>
                    
                    <p>We're excited to confirm that your order has been received and payment has been processed successfully!</p>
                    
                    <div class="order-details">
                        <h3>📋 Order Details:</h3>
                        <p><strong>Order ID:</strong> ${order._id}</p>
                        <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                        <p><strong>Expected Delivery:</strong> ${new Date(order.deliveryDate).toLocaleDateString()}</p>
                        <p><strong>Payment Method:</strong> ${order.paymentMethod.toUpperCase()}</p>
                        <p><strong>Payment Reference:</strong> ${order.paymentReference}</p>
                        
                        <h4>📦 Items Ordered:</h4>
                        <ul class="items-list">
                            ${itemsList}
                        </ul>
                        
                        <div class="total">
                            Total Amount Paid: GH₵${paidAmount.toFixed(2)}
                        </div>
                    </div>
                    
                    <div class="order-details">
                        <h3>📍 Delivery Information:</h3>
                        <p><strong>Name:</strong> ${order.customer.name}</p>
                        <p><strong>Phone:</strong> ${order.customer.phone}</p>
                        <p><strong>Email:</strong> ${order.customer.email}</p>
                        <p><strong>Address:</strong> ${order.customer.address}</p>
                    </div>
                    
                    <p>🚚 Your order will be delivered to the address provided on <strong>${new Date(order.deliveryDate).toLocaleDateString()}</strong>.</p>
                    
                    <p>💝 We haven't forgotten about you! Your beautiful jewelry pieces are being prepared with care and will be delivered right on time.</p>
                    
                    <p>If you have any questions about your order, please don't hesitate to contact us.</p>
                    
                    <p>Thank you for choosing us!</p>
                    
                    <div class="footer">
                        <p>Best regards,<br>
                        <strong>Your Jewelry Store Team</strong></p>
                        <p>This is an automated message. Please do not reply to this email.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;

        const mailOptions = {
            from: {
                name: 'Your Jewelry Store',
                address: process.env.EMAIL_USER
            },
            to: order.customer.email,
            subject: `Order Confirmation - Order #${order._id.toString().slice(-8)}`,
            html: emailHtml
        };

        await transporter.sendMail(mailOptions);
        console.log('Order confirmation email sent successfully to:', order.customer.email);

    } catch (error) {
        console.error('Email sending error:', error);
        // Don't throw error - we don't want to fail the payment verification if email fails
    }
};