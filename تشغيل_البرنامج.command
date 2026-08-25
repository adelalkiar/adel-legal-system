#!/bin/bash
# تشغيل نظام العادل للخدمات القانونية - برمجة عادل العراقي
cd "$(dirname "$0")"

echo "==================================================="
echo "   نظام العادل للخدمات القانونية"
echo "   برمجة: عادل العراقي"
echo "==================================================="
echo ""

# ---- التحقق من وجود Node.js ----
if ! command -v node >/dev/null 2>&1; then
    echo "[خطأ] لم يتم العثور على Node.js على هذا الجهاز."
    echo "الرجاء تحميل وتثبيت Node.js من الرابط التالي ثم إعادة تشغيل هذا الملف:"
    echo "https://nodejs.org"
    echo ""
    read -p "اضغط Enter للخروج..."
    exit 1
fi

# ---- تثبيت الحزم البرمجية عند أول تشغيل فقط ----
if [ ! -d "node_modules" ]; then
    echo "جاري تجهيز البرنامج لأول مرة... الرجاء الانتظار قليلاً."
    echo "هذا الإجراء يحدث مرة واحدة فقط."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "[خطأ] فشل تجهيز البرنامج. تأكد من اتصال الجهاز بالإنترنت وحاول مجدداً."
        read -p "اضغط Enter للخروج..."
        exit 1
    fi
    echo ""
    echo "تم التجهيز بنجاح."
    echo ""
fi

echo "جاري تشغيل الخادم..."
echo "لإيقاف البرنامج: عد إلى هذه النافذة واضغط Ctrl+C"
echo ""

# ---- تشغيل الخادم وفتح المتصفح تلقائياً ----
node server.js &
SERVER_PID=$!

sleep 3
if command -v open >/dev/null 2>&1; then
    open "http://localhost:3000"          # macOS
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3000"      # Linux
fi

echo "تم فتح البرنامج في متصفحك."
wait $SERVER_PID
