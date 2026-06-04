const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

// Initialize Express app
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;
// =============================================
// ⚙️ إعدادات الرد التلقائي
// =============================================

// رابط PHP API لنظام تِقان (عبر نفق SSH: ssh -R 8080:localhost:80 root@92.113.31.147)
const PHP_API_URL = process.env.PHP_API_URL || 'http://localhost:8080/etganplus';

// مفتاح API للتحقق - يجب أن يتطابق مع الموجود في ملف PHP
const API_KEY = process.env.API_KEY || 'tiqan_wa_bot_2026_secure_key';

// تفعيل/تعطيل ميزة الرد التلقائي
let autoReplyEnabled = true;

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
    console.log(`🌐 يمكنك إرسال الطلبات إلى: http://localhost:${PORT}/send-message`);
    console.log(`🤖 الرد التلقائي: ${autoReplyEnabled ? 'مفعّل ✅' : 'معطّل ❌'}`);
    console.log(`🔗 PHP API URL: ${PHP_API_URL}\n`);
});

client.on('authenticated', () => {
    console.log('✅ تمت المصادقة بنجاح مع سيرفرات واتساب!');
});

// Event: Authentication failed
client.on('auth_failure', msg => {
    console.error('❌ فشل في المصادقة مع الواتساب:', msg);
});

// =============================================
// 💬 الرد التلقائي على استعلام أمر العمل
// =============================================
client.on('message', async (msg) => {
    // تجاهل إذا كانت الميزة معطلة
    if (!autoReplyEnabled) return;

    // تجاهل الرسائل المرسلة من نفس الحساب
    if (msg.fromMe) return;

    // تجاهل رسائل المجموعات
    const chat = await msg.getChat();
    if (chat.isGroup) return;

    const text = msg.body.trim();

    // فحص إذا كان النص رقم أمر عمل (7 إلى 12 رقم)
    const workOrderPattern = /^\d{7,12}$/;
    if (!workOrderPattern.test(text)) return;

    console.log(`\n📩 استعلام وارد من ${msg.from}: أمر عمل ${text}`);

    try {
        // إرسال رسالة "جاري البحث..."
        await msg.reply('🔍 جاري البحث عن بيانات أمر العمل...');

        // استدعاء PHP API
        const apiUrl = `${PHP_API_URL}/api/whatsapp/material-analysis.php?wo=${encodeURIComponent(text)}&key=${encodeURIComponent(API_KEY)}`;

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            console.error(`❌ PHP API Error (HTTP ${response.status})`);
            await msg.reply('❌ حدث خطأ أثناء البحث. يرجى المحاولة لاحقاً.');
            return;
        }

        const data = await response.json();

        if (data.success) {
            await msg.reply(data.formatted_message);
            console.log(`✅ تم إرسال تحليل المواد لأمر العمل ${text} إلى ${msg.from}`);
        } else {
            await msg.reply(`❌ ${data.message || 'لم يتم العثور على أمر العمل'}\n\nتأكد من صحة رقم أمر العمل وحاول مرة أخرى.`);
            console.log(`⚠️ أمر العمل ${text} غير موجود - استعلام من ${msg.from}`);
        }
    } catch (error) {
        console.error('❌ خطأ في الرد التلقائي:', error.message);
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            await msg.reply('⏰ انتهت مهلة الاتصال بالخادم. يرجى المحاولة لاحقاً.');
        } else {
            await msg.reply('❌ حدث خطأ أثناء جلب البيانات. يرجى المحاولة لاحقاً.');
        }
    }
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

// =============================================
// 🎛️ تحكم بالرد التلقائي
// =============================================

app.get('/status', (req, res) => {
    res.json({ success: true, whatsapp_ready: isClientReady, auto_reply: autoReplyEnabled, php_api_url: PHP_API_URL });
});

app.post('/auto-reply/enable', (req, res) => {
    autoReplyEnabled = true;
    console.log('🤖 تم تفعيل الرد التلقائي');
    res.json({ success: true, message: 'تم تفعيل الرد التلقائي', auto_reply: true });
});

app.post('/auto-reply/disable', (req, res) => {
    autoReplyEnabled = false;
    console.log('🤖 تم تعطيل الرد التلقائي');
    res.json({ success: true, message: 'تم تعطيل الرد التلقائي', auto_reply: false });
});

// Start listening for Express server
app.listen(PORT, () => {
    console.log(`🚀 خادم الـ API يعمل على المنفذ ${PORT}`);
    console.log('⏳ جاري تهيئة متصفح الواتساب في الخلفية... الرجاء الانتظار...');
    console.log(`\n📋 الأوامر المتاحة:`);
    console.log(`   GET  /status             - حالة الخادم`);
    console.log(`   POST /send-message       - إرسال رسالة`);
    console.log(`   GET  /groups             - قائمة المجموعات`);
    console.log(`   POST /auto-reply/enable  - تفعيل الرد التلقائي`);
    console.log(`   POST /auto-reply/disable - تعطيل الرد التلقائي\n`);
});

// Initialize the WhatsApp Client
client.initialize();
