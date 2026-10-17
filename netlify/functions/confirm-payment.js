const webpush = require('web-push');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { orderId } = body;

        if (!orderId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, error: 'orderId is required' })
            };
        }

        const SUPABASE_URL  = 'https://sujqcavxkoxkoxwvlzci.supabase.co';
        const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1anFjYXZ4a294a294d3ZsemNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MDY2MjgsImV4cCI6MjA4ODE4MjYyOH0.ZBMF7adIuR_QR4pOME2UPRHUdnjPbljkt629vK7mJgY';
        const apiKey        = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;

        // 1. Update order in Supabase to 'paid' and is_placed: true
        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
            method: 'PATCH',
            headers: {
                'apikey': apiKey,
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                status: 'paid',
                is_placed: true
            })
        });

        const updatedOrders = await patchRes.json();
        const orderRecord = Array.isArray(updatedOrders) && updatedOrders.length > 0 ? updatedOrders[0] : null;

        // 2. Trigger Admin Push Notification
        const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
        const VAPID_EMAIL   = 'mailto:walltoneofficial@gmail.com';

        if (VAPID_PUBLIC && VAPID_PRIVATE) {
            try {
                webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

                const subRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?select=id,subscription`, {
                    headers: {
                        'apikey': apiKey,
                        'Authorization': `Bearer ${apiKey}`
                    }
                });
                const subscriptions = await subRes.json();

                if (Array.isArray(subscriptions) && subscriptions.length > 0) {
                    const clientName = orderRecord?.user_name || 'Customer';
                    const items = orderRecord?.items || [];
                    const firstItem = items[0] || {};
                    const productTitle = items.length > 1
                        ? `${firstItem.name || 'Product'} + ${items.length - 1} more`
                        : (firstItem.name || 'Walltone Metal Decor');

                    const thumbnail = firstItem.image_url || 'https://walltone.in/walltone.png';
                    const isTest = Number(totalAmt) === 1 || items.some(i => i.id === 'test-product-1inr' || (i.name && i.name.toLowerCase().includes('test')));

                    const payload = JSON.stringify({
                        title: isTest ? '🎉 ₹1 Test Payment Received!' : `💳 Order Placed — ₹${Number(totalAmt).toLocaleString('en-IN')}`,
                        body: isTest 
                            ? `Client: ${clientName} (${orderRecord?.phone || ''})\n₹1 Test Verification Successful!`
                            : `Client: ${clientName} (${orderRecord?.phone || ''})\nOrder #${orderId.slice(0, 8).toUpperCase()}\nProduct: ${productTitle}`,
                        image: thumbnail,
                        orderId: orderId,
                        url: '/'
                    });

                    await Promise.allSettled(
                        subscriptions.map(row => webpush.sendNotification(
                            typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription,
                            payload
                        ))
                    );
                }
            } catch(e) {
                console.error('Push notification send notice:', e);
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, order: orderRecord })
        };

    } catch (err) {
        console.error('confirm-payment error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: err.message })
        };
    }
};
