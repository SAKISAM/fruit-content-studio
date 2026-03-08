#!/usr/bin/env python3
"""
云雾 API 代理服务器 - 解决浏览器跨域问题
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.request
import urllib.error
import ssl
import base64
import os
from datetime import datetime

# 禁用 SSL 验证（如果需要）
ssl._create_default_https_context = ssl._create_unverified_context

YUNWU_API_BASE = "https://yunwu.ai/v1"

# 创建上传目录
UPLOAD_DIR = os.path.expanduser("~/.openclaw/workspace/fruit-content-studio/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class APIProxyHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """处理预检请求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
    
    def do_GET(self):
        """处理 GET 请求，用于获取上传的图片"""
        if self.path.startswith('/uploads/'):
            filename = self.path.replace('/uploads/', '')
            filepath = os.path.join(UPLOAD_DIR, filename)
            
            if os.path.exists(filepath) and os.path.isfile(filepath):
                try:
                    with open(filepath, 'rb') as f:
                        content = f.read()
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'image/png')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception as e:
                    self.send_error(500, str(e))
                    return
            else:
                self.send_error(404, "File not found")
                return
        
        self.send_error(404, "Not found")
    
    def do_POST(self):
        """处理 POST 请求，代理到云雾 API"""
        path = self.path
        
        # 读取请求体
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        # 获取 Authorization header
        auth_header = self.headers.get('Authorization', '')
        
        try:
            # 解析请求体
            request_data = json.loads(body)
            
            # 处理图片上传（如果有 base64 图片数据）
            if 'image_base64' in request_data:
                image_url = upload_image_to_cloud(request_data['image_base64'], auth_header)
                if image_url:
                    # 根据模型类型构建不同的请求格式
                    model = request_data.get('model', '')
                    
                    if 'dall-e' in model or 'gpt-image' in model:
                        # DALL-E 3 / GPT-Image-1 格式
                        request_data['image'] = image_url
                    elif 'gemini' in model:
                        # Gemini 格式 - 使用 image_url 字段
                        request_data['image_url'] = image_url
                    
                    # 移除自定义字段
                    del request_data['image_base64']
                else:
                    del request_data['image_base64']
            
            # 重新编码请求体
            body = json.dumps(request_data).encode()
            
            # 构建目标 URL
            if path == '/proxy/images/generations':
                target_url = f"{YUNWU_API_BASE}/images/generations"
            elif path == '/proxy/chat/completions':
                target_url = f"{YUNWU_API_BASE}/chat/completions"
            elif path == '/proxy/xhs/publish':
                # 小红书 MCP 发布接口
                self.handle_xhs_publish(request_data)
                return
            else:
                self.send_error(404, "Unknown endpoint")
                return
            
            # 创建请求
            req = urllib.request.Request(
                target_url,
                data=body,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': auth_header
                },
                method='POST'
            )
            
            # 发送请求
            with urllib.request.urlopen(req, timeout=120) as response:
                response_body = response.read()
                
                # 返回响应
                self.send_response(response.status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(response_body)
                
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = json.dumps({"error": str(e)}).encode()
            self.wfile.write(error_response)
    
    def handle_xhs_publish(self, request_data):
        """处理小红书发布请求"""
        try:
            import subprocess
            import json
            
            title = request_data.get('title', '')
            content = request_data.get('content', '')
            image_url = request_data.get('imageUrl', '')
            
            # 构建命令调用 xhs_client.py
            cmd = [
                'python3',
                '/Users/qiguichuan/.openclaw/workspace/skills/xiaohongshu-mcp/scripts/xhs_client.py',
                'publish',
                title,
                content,
                image_url
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "Published"}).encode())
            else:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": result.stderr}).encode())
                
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode())

    def log_message(self, format, *args):
        """简化日志输出"""
        print(f"[API Proxy] {args[0]}")


def upload_image_to_cloud(base64_image, api_key):
    """
    将 base64 图片上传到云雾的临时存储，返回 URL
    使用云雾的 files API 或先存本地再提供 URL
    """
    try:
        # 解码 base64
        if ',' in base64_image:
            base64_image = base64_image.split(',')[1]
        
        image_data = base64.b64decode(base64_image)
        
        # 保存到本地并提供 URL
        filename = f"ref_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{os.urandom(4).hex()}.png"
        filepath = os.path.join(UPLOAD_DIR, filename)
        
        with open(filepath, 'wb') as f:
            f.write(image_data)
        
        # 返回本地可访问的 URL
        return f"http://localhost:8081/uploads/{filename}"
        
    except Exception as e:
        print(f"[Upload Error] {e}")
        return None

def run_server(port=8081):
    server_address = ('', port)
    httpd = HTTPServer(server_address, APIProxyHandler)
    print(f"API 代理服务器启动在 http://localhost:{port}")
    print("代理端点:")
    print(f"  - POST http://localhost:{port}/proxy/images/generations")
    print(f"  - POST http://localhost:{port}/proxy/chat/completions")
    httpd.serve_forever()


if __name__ == '__main__':
    run_server()
