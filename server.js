const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

// Initialize Express app
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Initialize WhatsApp Client with LocalAuth so session is saved
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

let isClientReady = false;

// Event: Browser started and WhatsApp Web is loading
client.on('loading_screen', (percent, message) => {
    console.log(`\n⏳ جاري تحميل واتساب ويب... ${percent}%`);
    console.log(`📝 رسالة النظام: ${message}`);
});

// Generate QR Code in Terminal for scanning
client.on('qr', (qr) => {
    console.log('\n==================================================');
    console.log('📌 يرجى فتح الواتساب في جوالك ومسح هذا الباركود (QR Code):');
    console.log('==================================================\n');
    qrcode.generate(qr, { small: true });
});

// Event: Client successfully authenticated and ready
client.on('ready', () => {
    isClientReady = true;
    console.log('\n✅ اكتمل الربط! الواتساب جاهز الآن لاستقبال وإرسال الرسائل عبر الـ API الخاص بنا.');
    console.log(`🌐 يمكنك إرسال الطلبات إلى: http://localhost:${PORT}/send-message\n`);
});

client.on('authenticated', () => {
    console.log('✅ تمت المصادقة بنجاح مع سيرفرات واتساب!');
});

// Event: Authentication failed
client.on('auth_failure', msg => {
    console.error('❌ فشل في المصادقة مع الواتساب:', msg);
});

// API Endpoint to get all groups the bot is a part of
app.get('/groups', async (req, res) => {
    if (!isClientReady) {
        return res.status(503).json({ success: false, message: 'خدمة الواتساب غير جاهزة.' });
    }
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup).map(group => ({
            id: group.id._serialized,
            name: group.name
        }));
        res.json({ success: true, groups });
    } catch (error) {
        res.status(500).json({ success: false, message: 'حدث خطأ.', error: error.toString() });
    }
});

// API Endpoint to send messages
app.post('/send-message', async (req, res) => {
    if (!isClientReady) {
        return res.status(503).json({ success: false, message: 'خدمة الواتساب قيد التشغيل أو لم يتم ربط الجوال بعد. يرجى مسح الباركود أولاً.' });
    }

    const { number, message, isGroup } = req.body;

    if (!number || !message) {
        return res.status(400).json({ success: false, message: 'يرجى إرسال رقم الجوال والنص (number, message).' });
    }

    try {
        let chatId = '';

        if (isGroup || number.endsWith('@g.us')) {
            // It's a group
            chatId = number.includes('@g.us') ? number : `${number}@g.us`;
        } else {
            // It's a personal number
            let cleanNumber = number.replace(/[^0-9]/g, '');
            // If it starts with 05, replace with 9665
            if (cleanNumber.startsWith('05')) {
                cleanNumber = '966' + cleanNumber.substring(1);
            }
            chatId = `${cleanNumber}@c.us`;

            // Check if the number is registered on WhatsApp to prevent "Evaluation failed: t" error
            const isRegistered = await client.isRegisteredUser(chatId);
            if (!isRegistered) {
                return res.status(404).json({ success: false, message: 'الرقم غير مسجل في واتساب أو صيغة الرقم غير صحيحة.' });
            }
        }

        // Send the message
        const response = await client.sendMessage(chatId, message);
        res.json({ success: true, message: 'تم الإرسال بنجاح!', responseId: response.id.id });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء الإرسال.', error: error.toString() });
    }
});

// Start listening for Express server
app.listen(PORT, () => {
    console.log(`🚀 خادم الـ API يعمل على المنفذ ${PORT}`);
    console.log('⏳ جاري تهيئة متصفح الواتساب في الخلفية... الرجاء الانتظار...');
});

// Initialize the WhatsApp Client
client.initialize();
