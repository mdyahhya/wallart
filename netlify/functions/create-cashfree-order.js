exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { orderId, amount, customerId, customerName, customerPhone, customerEmail, returnUrl } = body;

        const appId = process.env.CASHFREE_APP_ID;
        const secretKey = process.env.CASHFREE_SECRET_KEY;

        if (!appId || !secretKey) {
            console.log('Cashfree API credentials missing from environment variables');
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, error: 'Cashfree API credentials missing' })
            };
        }

        // Cashfree API endpoint (Production mode by default, falls back if specified)
        const isSandbox = process.env.CASHFREE_SANDBOX === 'true';
        const url = isSandbox
            ? 'https://sandbox.cashfree.com/pg/orders'
            : 'https://api.cashfree.com/pg/orders';

        const payload = {
            order_id: orderId,
            order_amount: Number(amount),
            order_currency: 'INR',
            customer_details: {
                customer_id: customerId || `cust_${Date.now()}`,
                customer_name: customerName || 'Valued Customer',
                customer_email: customerEmail || 'customer@example.com',
                customer_phone: customerPhone || '9999999999'
            },
            order_meta: {
                return_url: returnUrl || `https://walltone.in/order-confirmation.html?order_id=${orderId}`
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': appId,
                'x-client-secret': secretKey,
                'x-api-version': '2023-08-01'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Cashfree order creation error:', data);
            return {
                statusCode: response.status,
                body: JSON.stringify({ success: false, error: data.message || 'Cashfree Order Creation Failed' })
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                payment_session_id: data.payment_session_id,
                order_id: data.order_id
            })
        };

    } catch (err) {
        console.error('create-cashfree-order handler exception:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: err.message })
        };
    }
};
