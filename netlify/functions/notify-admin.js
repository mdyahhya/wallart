const webpush = require('web-push');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { orderId, userName, phone, totalAmount, items } = body;

        const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
        const VAPID_EMAIL   = 'mailto:walltoneofficial@gmail.com';

        // Supabase config to fetch all admin subscriptions
        const SUPABASE_URL  = 'https://sujqcavxkoxkoxwvlzci.supabase.co';
        const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1anFjYXZ4a294a294d3ZsemNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MDY2MjgsImV4cCI6MjA4ODE4MjYyOH0.ZBMF7adIuR_QR4pOME2UPRHUdnjPbljkt629vK7mJgY';
        const apiKey        = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;

        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            console.log('VAPID keys missing — skipping notification');
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, message: 'Order saved, VAPID not configured' })
            };
        }

        webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

        // Fetch ALL admin push subscriptions from Supabase
        let subscriptions = [];
        const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?select=id,subscription`, {
            headers: {
                'apikey': apiKey,
                'Authorization': `Bearer ${apiKey}`
            }
        });
        const rows = await res.json();
        if (Array.isArray(rows)) {
            subscriptions = rows;
        }

        if (subscriptions.length === 0) {
            console.log('No admin subscriptions — skipping push');
            return { statusCode: 200, body: JSON.stringify({ success: true, message: 'No subscribers' }) };
        }

        // Build notification payload based on order status and type
        const isTest = body.isTestOrder || Number(totalAmount) === 1 || (items && items.some(i => i.id === 'test-product-1inr' || (i.name && i.name.toLowerCase().includes('test'))));
        const isPending = body.status === 'pending' || body.type === 'started_order';

        let notifTitle = '';
        let notifBody = '';

        if (isTest) {
            if (isPending) {
                notifTitle = '🧪 ₹1 Test Order Started (Payment Pending)';
                notifBody = `👤 ${userName || 'Customer'} (${phone || 'No phone'})\nStarted ₹1 Test Payment • Payment Pending`;
            } else {
                notifTitle = '🎉 ₹1 Test Payment Received!';
                notifBody = `👤 ${userName || 'Customer'} (${phone || 'No phone'})\n₹1 Instant Verification Successful!`;
            }
        } else {
            const firstItem = items && items[0];
            const itemsText = items && items.length > 1
                ? `${firstItem?.name} + ${items.length - 1} more`
                : (firstItem?.name || 'Walltone Metal Art');

            if (isPending) {
                notifTitle = `⏳ Started Order (Payment Pending) — ₹${Number(totalAmount).toLocaleString('en-IN')}`;
                notifBody = `👤 ${userName || 'Customer'} (${phone || 'No phone'})\n${itemsText} • Payment Pending`;
            } else {
                notifTitle = `🛍️ New Order Paid — ₹${Number(totalAmount).toLocaleString('en-IN')}`;
                notifBody = `👤 ${userName || 'Customer'} (${phone || 'No phone'})\n${itemsText} • Order Placed`;
            }
        }

        const firstItem = items && items[0];
        const payload = JSON.stringify({
            title: notifTitle,
            body: notifBody,
            image: firstItem?.image_url || 'https://walltone.in/walltone.png',
            orderId: orderId,
            url: '/'
        });

        // Send to every admin device
        const results = await Promise.allSettled(
            subscriptions.map(row => webpush.sendNotification(
                typeof row.subscription === 'string'
                    ? JSON.parse(row.subscription)
                    : row.subscription,
                payload
            ))
        );

        // Clean up expired/invalid subscriptions
        const expiredIds = [];
        results.forEach((result, i) => {
            if (result.status === 'rejected' && result.reason?.statusCode === 410) {
                expiredIds.push(subscriptions[i].id);
            }
        });
        if (expiredIds.length > 0 && apiKey) {
            await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?id=in.(${expiredIds.join(',')})`, {
                method: 'DELETE',
                headers: {
                    'apikey': apiKey,
                    'Authorization': `Bearer ${apiKey}`
                }
            });
        }

        const sent = results.filter(r => r.status === 'fulfilled').length;
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, sent, total: subscriptions.length })
        };

    } catch (err) {
        console.error('notify-admin error:', err);
        return {
            statusCode: 200,
            body: JSON.stringify({ success: false, error: err.message })
        };
    }
};
