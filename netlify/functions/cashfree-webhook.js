const webpush = require('web-push');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        console.log('Cashfree Webhook Received:', body);

        // Verify event type
        const data = body.data || body;
        const eventType = body.type || data.event_type;
        const orderId = data.order?.order_id || data.order_id;
        const paymentStatus = data.payment?.payment_status || data.txStatus;
        const amount = data.order?.order_amount || data.orderAmount;
        const paymentId = data.payment?.cf_payment_id || data.referenceId;

        const SUPABASE_URL = 'https://sujqcavxkoxkoxwvlzci.supabase.co';
        const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

        if (paymentStatus === 'SUCCESS' || eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
            console.log(`Payment SUCCESS for Order ID: ${orderId}`);

            // 1. Update order status to 'paid' in Supabase
            if (SUPABASE_SERVICE_KEY && orderId) {
                await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        status: 'paid',
                        cashfree_payment_id: paymentId ? String(paymentId) : null
                    })
                });
            }

            // 2. Fetch order details to construct push notification
            let orderRecord = null;
            if (SUPABASE_SERVICE_KEY && orderId) {
                const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=*`, {
                    headers: {
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
                    }
                });
                const rows = await res.json();
                if (Array.isArray(rows) && rows.length > 0) orderRecord = rows[0];
            }

            // 3. Send "Payment Received" Push Notification to Admin
            const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
            const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
            const VAPID_EMAIL = 'mailto:walltoneofficial@gmail.com';

            if (VAPID_PUBLIC && VAPID_PRIVATE && SUPABASE_SERVICE_KEY) {
                webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

                // Fetch admin push subscriptions
                const subRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?select=id,subscription`, {
                    headers: {
                        'apikey': SUPABASE_SERVICE_KEY,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
                    }
                });
                const subscriptions = await subRes.json();

                if (Array.isArray(subscriptions) && subscriptions.length > 0) {
                    const clientName = orderRecord?.user_name || 'Customer';
                    const items = orderRecord?.items || [];
                    const firstItem = items[0] || {};
                    const productTitle = items.length > 1
                        ? `${firstItem.name || 'Product'} + ${items.length - 1} more`
                        : (firstItem.name || 'Walltone Product');

                    // Thumbnail image fallback (using small placeholder / image url)
                    const thumbnail = firstItem.image_url || 'https://walltone.in/walltone.png';

                    const payload = JSON.stringify({
                        title: `💳 Payment Received — ₹${Number(amount || orderRecord?.total_amount || 0).toLocaleString('en-IN')}`,
                        body: `Client: ${clientName}\nOrder #${orderId}\nProduct: ${productTitle}`,
                        image: thumbnail,
                        orderId: orderId,
                        url: '/my-orders.html'
                    });

                    await Promise.allSettled(
                        subscriptions.map(row => webpush.sendNotification(
                            typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription,
                            payload
                        ))
                    );
                }
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, message: 'Webhook processed' })
        };

    } catch (err) {
        console.error('cashfree-webhook error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: err.message })
        };
    }
};
