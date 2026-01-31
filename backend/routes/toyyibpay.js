const express = require('express');
const axios = require('axios');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const counter = require('../services/purchase-counter');
const { generatePortfolio } = require('../services/portfolio-generator');
const { updateStatus } = require('../services/order-tracker');
const { sendSoldOutEmail, sendOrderConfirmedEmail } = require('../services/email-sender');

// ToyyibPay Configuration
const TOYYIBPAY_BASE_URL = process.env.TOYYIBPAY_SANDBOX === 'true' 
    ? 'https://dev.toyyibpay.com'
    : 'https://toyyibpay.com';

/**
 * Create a ToyyibPay bill for the customer
 * POST /api/toyyibpay/create-bill
 */
router.post('/create-bill', async (req, res) => {
    try {
        const { email, filename, photoFilename, amount } = req.body;

        if (!filename) {
            return res.status(400).json({ error: 'Filename required' });
        }
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email required' });
        }

        // Check sold out
        const soldOut = await counter.isSoldOut();
        if (soldOut) {
            return res.status(400).json({ error: 'SOLD_OUT', message: 'Sorry, all slots are sold out!' });
        }

        // Verify ToyyibPay credentials
        if (!process.env.TOYYIBPAY_SECRET_KEY || !process.env.TOYYIBPAY_CATEGORY_CODE) {
            console.error('ToyyibPay credentials not configured');
            return res.status(500).json({ error: 'Payment gateway not configured' });
        }

        const orderId = uuidv4();
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
        const billAmount = amount || process.env.TOYYIBPAY_AMOUNT || '2900'; // Amount in cents (RM29.00)

        // Create bill payload
        const billData = {
            userSecretKey: process.env.TOYYIBPAY_SECRET_KEY,
            categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE,
            billName: 'Resume to Portfolio Website',
            billDescription: 'Professional portfolio website generation from your resume',
            billPriceSetting: 1, // Fixed price
            billPayorInfo: 1, // Required
            billAmount: billAmount,
            billReturnUrl: `${frontendUrl}?status=success&orderId=${orderId}`,
            billCallbackUrl: `${backendUrl}/api/toyyibpay/callback`,
            billExternalReferenceNo: orderId,
            billTo: email,
            billEmail: email,
            billPhone: '0111111111', // Required by ToyyibPay
            billSplitPayment: 0,
            billSplitPaymentArgs: '',
            billPaymentChannel: 2, // 0=FPX, 1=Credit Card, 2=Both
            billContentEmail: 'Thank you for your purchase! We are generating your professional portfolio website.',
            billChargeToCustomer: 1, // Customer pays processing fee
            billExpiryDate: '', // No expiry
            billExpiryDays: 3 // 3 days to pay
        };

        // Store pending order data
        await updateStatus(orderId, 'pending_payment', {
            email,
            filename,
            photoFilename: photoFilename || null,
            billAmount,
            createdAt: new Date().toISOString()
        });

        // Create bill via ToyyibPay API
        console.log('📤 ToyyibPay request to:', `${TOYYIBPAY_BASE_URL}/index.php/api/createBill`);
        console.log('📤 Bill data:', JSON.stringify(billData, null, 2));
        
        const response = await axios.post(
            `${TOYYIBPAY_BASE_URL}/index.php/api/createBill`,
            new URLSearchParams(billData).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 30000
            }
        );

        console.log('📥 ToyyibPay response:', JSON.stringify(response.data));
        const result = response.data;
        
        if (!result || !result[0] || !result[0].BillCode) {
            console.error('❌ ToyyibPay bill creation failed:', JSON.stringify(result));
            const errorMsg = result?.[0]?.msg || result?.msg || JSON.stringify(result) || 'Failed to create payment bill';
            await updateStatus(orderId, 'failed', { error: errorMsg });
            return res.status(500).json({ error: errorMsg });
        }

        const billCode = result[0].BillCode;
        const paymentUrl = `${TOYYIBPAY_BASE_URL}/${billCode}`;

        // Update status with bill code
        await updateStatus(orderId, 'pending_payment', {
            billCode,
            paymentUrl
        });

        console.log(`💳 ToyyibPay bill created: ${billCode} for ${email}`);

        res.json({
            success: true,
            orderId,
            billCode,
            paymentUrl,
            message: 'Bill created successfully. Redirect to payment URL.'
        });

    } catch (error) {
        console.error('❌ ToyyibPay bill creation error:', error.message);
        if (error.response) {
            console.error('❌ Response status:', error.response.status);
            console.error('❌ Response data:', JSON.stringify(error.response.data));
        }
        res.status(500).json({ 
            error: 'Payment creation failed: ' + (error.response?.data?.msg || error.message || 'Unknown error')
        });
    }
});

/**
 * ToyyibPay callback endpoint (webhook)
 * POST /api/toyyibpay/callback
 */
router.post('/callback', async (req, res) => {
    try {
        console.log('🔔 ToyyibPay callback received');
        console.log('Callback data:', JSON.stringify(req.body, null, 2));

        const {
            refno,           // ToyyibPay reference number
            status,          // 1 = Success, 2 = Pending, 3 = Failed
            reason,          // Reason for status
            billcode,        // Bill code
            order_id,        // External reference (our orderId)
            amount,          // Amount paid
            transaction_time // Transaction time
        } = req.body;

        // Use order_id or try to find by billcode
        const orderId = order_id || req.body.billExternalReferenceNo;

        if (!orderId) {
            console.error('No order ID in callback');
            return res.status(400).send('Missing order ID');
        }

        // Parse status
        const paymentStatus = parseInt(status, 10);

        if (paymentStatus === 1) {
            // Payment successful
            console.log(`✅ Payment successful for order ${orderId}`);

            // Get stored order data
            const { getStatus } = require('../services/order-tracker');
            const orderData = await getStatus(orderId);

            if (!orderData || !orderData.email || !orderData.filename) {
                console.error('Order data not found:', orderId);
                return res.status(404).send('Order not found');
            }

            // Check sold out
            const soldOut = await counter.isSoldOut();
            if (soldOut) {
                await sendSoldOutEmail(orderData.email);
                await updateStatus(orderId, 'failed', { error: 'SOLD_OUT' });
                return res.status(200).send('SOLD_OUT');
            }

            // Increment counter
            let position;
            try {
                position = await counter.incrementCounter(orderData.email, orderId);
            } catch (err) {
                if (err && err.message === 'SOLD_OUT') {
                    await sendSoldOutEmail(orderData.email);
                    await updateStatus(orderId, 'failed', { error: 'SOLD_OUT' });
                    return res.status(200).send('SOLD_OUT');
                }
                throw err;
            }

            // Update status to queued
            const etaMinutes = 3;
            await updateStatus(orderId, 'queued', {
                position,
                etaMinutes,
                paymentRef: refno,
                paymentAmount: amount,
                paymentTime: transaction_time,
                steps: { queued: new Date().toISOString() }
            });

            // Send confirmation email
            try {
                const confirmation = await sendOrderConfirmedEmail({
                    email: orderData.email,
                    orderId,
                    etaMinutes,
                    amount: (parseFloat(amount) / 100).toFixed(2),
                    currency: 'MYR'
                });
                await updateStatus(orderId, 'queued', {
                    emails: {
                        confirmation: {
                            subject: confirmation.subject,
                            html: confirmation.html,
                            preview: confirmation.preview
                        }
                    }
                });
            } catch (emailError) {
                console.error('Confirmation email failed:', emailError);
            }

            // Start portfolio generation
            setImmediate(async () => {
                try {
                    await generatePortfolio(
                        orderData.email,
                        orderId,
                        position,
                        orderData.filename,
                        orderData.photoFilename
                    );
                } catch (error) {
                    console.error('Portfolio generation error:', error);
                    await updateStatus(orderId, 'failed', { error: error.message });
                }
            });

            console.log(`📦 Order #${position}/50 started for ${orderData.email}`);

        } else if (paymentStatus === 2) {
            // Payment pending
            console.log(`⏳ Payment pending for order ${orderId}`);
            await updateStatus(orderId, 'pending_payment', {
                paymentRef: refno,
                paymentReason: reason
            });

        } else {
            // Payment failed
            console.log(`❌ Payment failed for order ${orderId}: ${reason}`);
            await updateStatus(orderId, 'payment_failed', {
                paymentRef: refno,
                paymentReason: reason
            });
        }

        // ToyyibPay expects a simple OK response
        res.status(200).send('OK');

    } catch (error) {
        console.error('ToyyibPay callback error:', error);
        res.status(500).send('Callback processing error');
    }
});

/**
 * Check bill status
 * GET /api/toyyibpay/status/:billCode
 */
router.get('/status/:billCode', async (req, res) => {
    try {
        const { billCode } = req.params;

        if (!process.env.TOYYIBPAY_SECRET_KEY) {
            return res.status(500).json({ error: 'Payment gateway not configured' });
        }

        const response = await axios.post(
            `${TOYYIBPAY_BASE_URL}/index.php/api/getBillTransactions`,
            new URLSearchParams({
                billCode,
                billpaymentStatus: '1' // Get successful payments
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 20000
            }
        );

        res.json({
            success: true,
            transactions: response.data
        });

    } catch (error) {
        console.error('ToyyibPay status check error:', error);
        res.status(500).json({ error: 'Failed to check payment status' });
    }
});

module.exports = router;
