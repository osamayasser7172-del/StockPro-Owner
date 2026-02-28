#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 StockPro Admin يشتغل على http://localhost:8080/admin.html"
echo "📱 StockPro Client:  http://localhost:8080/stockpro.html"
echo ""
echo "اضغط Ctrl+C لإيقاف السيرفر"
echo ""
open "http://localhost:8080/admin.html"
python3 -m http.server 8080
