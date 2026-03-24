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
        const SUPABASE_URL         = 'https://sujqcavxkoxkoxwvlzci.supabase.co';
        const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
        if (SUPABASE_SERVICE_KEY) {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?select=id,subscription`, {
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
                }
            });
            const rows = await res.json();
            if (Array.isArray(rows)) {
                subscriptions = rows;
            }
        }

        if (subscriptions.length === 0) {
            console.log('No admin subscriptions — skipping push');
            return { statusCode: 200, body: JSON.stringify({ success: true, message: 'No subscribers' }) };
        }

        // Build notification payload
        const firstItem = items && items[0];
        const itemsText = items && items.length > 1
            ? `${firstItem?.name} + ${items.length - 1} more`
            : firstItem?.name || 'Products';

        const payload = JSON.stringify({
            title: `🛍️ New Order — ₹${Number(totalAmount).toLocaleString('en-IN')}`,
            body: `${userName} (${phone})\n${itemsText}`,
            image: firstItem?.image_url || undefined,
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
        if (expiredIds.length > 0 && SUPABASE_SERVICE_KEY) {
            await fetch(`${SUPABASE_URL}/rest/v1/admin_push_subscriptions?id=in.(${expiredIds.join(',')})`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
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
