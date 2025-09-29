const PackageRequest = require('../models/PackageRequestModel');
const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

exports.submitPackageRequest = async (req, res) => {
    try {
        const {
            name,
            email,
            location,
            whatsappNumber,
            packageOfInterest,
        } = req.body;

        // Validate required fields
        if (!name || !location || !whatsappNumber || !packageOfInterest) {
            return res.status(400).json({
                success: false,
                message: 'Name, location, WhatsApp number, and package of interest are required',
            });
        }

        // Create the package request data object
        const packageRequestData = {
            name,
            email: email || undefined,
            location,
            whatsappNumber,
            packageOfInterest,
            submittedAt: new Date(),
        };

        // Save to database
        const packageRequest = new PackageRequest(packageRequestData);
        await packageRequest.save();

        // Email to Admin (Merciluxe)
        const adminMailOptions = {
            from: process.env.EMAIL_USER,
            to: 'merciluxe99@gmail.com',
            subject: `New Package Request - ${name}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">New Package Request</h1>
                    </div>
                    
                    <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">You have received a new package request from a customer.</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <tr>
                                <td style="padding: 12px; background-color: #f8f9fa; border-bottom: 1px solid #dee2e6; font-weight: bold; color: #495057;">Customer Name:</td>
                                <td style="padding: 12px; border-bottom: 1px solid #dee2e6; color: #333;">${name}</td>
                            </tr>
                            ${email ? `
                            <tr>
                                <td style="padding: 12px; background-color: #f8f9fa; border-bottom: 1px solid #dee2e6; font-weight: bold; color: #495057;">Email:</td>
                                <td style="padding: 12px; border-bottom: 1px solid #dee2e6; color: #333;">${email}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td style="padding: 12px; background-color: #f8f9fa; border-bottom: 1px solid #dee2e6; font-weight: bold; color: #495057;">Location:</td>
                                <td style="padding: 12px; border-bottom: 1px solid #dee2e6; color: #333;">${location}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px; background-color: #f8f9fa; border-bottom: 1px solid #dee2e6; font-weight: bold; color: #495057;">WhatsApp Number:</td>
                                <td style="padding: 12px; border-bottom: 1px solid #dee2e6; color: #333;">${whatsappNumber}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px; background-color: #f8f9fa; border-bottom: 1px solid #dee2e6; font-weight: bold; color: #495057;">Package of Interest:</td>
                                <td style="padding: 12px; border-bottom: 1px solid #dee2e6; color: #333;">${packageOfInterest}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px; background-color: #f8f9fa; font-weight: bold; color: #495057;">Submitted At:</td>
                                <td style="padding: 12px; color: #333;">${new Date().toLocaleString()}</td>
                            </tr>
                        </table>
                        
                        ${req.file ? '<p style="color: #667eea; font-weight: bold; margin-top: 20px;">📎 Reference image attached</p>' : ''}
                        
                        <div style="margin-top: 30px; padding: 15px; background-color: #e7f3ff; border-left: 4px solid #667eea; border-radius: 4px;">
                            <p style="margin: 0; color: #333; font-size: 14px;"><strong>Action Required:</strong> Please contact the customer via WhatsApp within 24 hours.</p>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
                        <p>Merciluxe - Making luxury gifting accessible and stress-free</p>
                    </div>
                </div>
            `,
            attachments: []
        };

        // Add image attachment if file was uploaded
        if (req.file) {
            adminMailOptions.attachments.push({
                filename: req.file.originalname,
                content: req.file.buffer,
                contentType: req.file.mimetype
            });
        }

        // Send email to admin
        await transporter.sendMail(adminMailOptions);

        // Send confirmation email to customer if email was provided
        if (email) {
            const customerMailOptions = {
                from: 'MerciLuxe',
                to: email,
                subject: 'Request Received - Merciluxe',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Thank You, ${name}!</h1>
                        </div>
                        
                        <div style="background-color: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <p style="font-size: 16px; color: #333; line-height: 1.6;">We have received your package request and are excited to help you with your gifting needs.</p>
                            
                            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="margin-top: 0; color: #667eea; font-size: 18px;">Your Request Details:</h3>
                                <p style="margin: 8px 0; color: #333; font-size: 15px;"><strong>Package:</strong> ${packageOfInterest}</p>
                                <p style="margin: 8px 0; color: #333; font-size: 15px;"><strong>Location:</strong> ${location}</p>
                                <p style="margin: 8px 0; color: #333; font-size: 15px;"><strong>WhatsApp:</strong> ${whatsappNumber}</p>
                            </div>
                            
                            <div style="background-color: #e7f3ff; padding: 15px; border-left: 4px solid #667eea; border-radius: 4px; margin: 20px 0;">
                                <p style="margin: 0; color: #333; font-size: 15px;"><strong>What's Next?</strong></p>
                                <p style="margin: 10px 0 0 0; color: #333; font-size: 14px;">Our team will contact you via WhatsApp at <strong>${whatsappNumber}</strong> within 24 hours to discuss your package and provide personalized recommendations.</p>
                            </div>
                            
                            <div style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #dee2e6;">
                                <p style="color: #333; font-size: 14px; margin: 5px 0;"><strong>At Merciluxe, we offer:</strong></p>
                                <ul style="color: #666; font-size: 14px; line-height: 1.8; margin: 10px 0;">
                                    <li>Elegant, personalized, and high-quality gift products</li>
                                    <li>Swift and reliable delivery services</li>
                                    <li>Trusted partner for corporate branded souvenirs</li>
                                </ul>
                            </div>
                            
                            <p style="color: #666; font-size: 14px; margin-top: 30px; line-height: 1.6;">If you have any urgent questions, feel free to reach out to us at <a href="mailto:merciluxe99@gmail.com" style="color: #667eea; text-decoration: none;">merciluxe99@gmail.com</a></p>
                            
                            <p style="color: #333; font-size: 15px; margin-top: 30px;">Best regards,<br><strong style="color: #667eea;">Merciluxe Team</strong></p>
                        </div>
                        
                        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
                            <p>Making luxury gifting accessible and stress-free</p>
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(customerMailOptions);
        }

        res.status(200).json({
            success: true,
            message: 'Package request submitted successfully',
            data: packageRequest,
        });

    } catch (error) {
        console.error('Error submitting package request:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to process request. Please try again later.',
        });
    }
};