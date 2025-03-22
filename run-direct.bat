@echo off
echo Running k6 directly against localhost...
k6 run script.js

echo If you see connection errors, make sure your application is running at http://localhost:8080/
