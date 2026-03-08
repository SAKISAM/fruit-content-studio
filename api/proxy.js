// Vercel Serverless Function - API 代理
// 代理图像生成和聊天请求到 Kie.ai 和云雾 API

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // 增加请求体大小限制到 10MB
    },
  },
};

const YUNWU_API_BASE = "https://yunwu.ai/v1";
const KIE_API_BASE = "https://api.kie.ai";

export default async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url.replace('/api/proxy', '');
  
  try {
    if (path === '/images/generations' || path === '/chat/completions') {
      // 云雾 API 代理
      const targetUrl = `${YUNWU_API_BASE}${path}`;
      const authHeader = req.headers.authorization || '';
      
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(req.body)
      });
      
      const data = await response.json();
      res.status(response.status).json(data);
      
    } else if (path === '/kie/images/generations') {
      // Kie.ai 图像生成代理
      const { model, prompt, image_input, resolution, aspect_ratio } = req.body;
      const authHeader = req.headers.authorization || '';
      
      const payload = {
        model: model || 'nano-banana-2',
        input: {
          prompt,
          resolution: resolution || '1K',
          aspect_ratio: aspect_ratio || 'auto',
          output_format: 'jpg',
          google_search: false
        }
      };
      
      if (image_input && image_input.length > 0) {
        payload.input.image_input = image_input;
      }
      
      const response = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      res.status(response.status).json(data);
      
    } else if (path === '/kie/record') {
      // Kie.ai 查询任务状态
      const { taskId } = req.query;
      const authHeader = req.headers.authorization || '';
      
      const response = await fetch(`${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
        headers: {
          'Authorization': authHeader
        }
      });
      
      const data = await response.json();
      res.status(response.status).json(data);
      
    } else if (path === '/kie/upload') {
      // Kie.ai 文件上传代理
      const { base64Data, fileName } = req.body;
      const authHeader = req.headers.authorization || '';
      
      const response = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          base64Data,
          uploadPath: 'references',
          fileName: fileName || `upload_${Date.now()}.jpg`
        })
      });
      
      const data = await response.json();
      res.status(response.status).json(data);
      
    } else if (path === '/xhs/publish') {
      // 小红书发布代理
      res.status(501).json({
        error: '小红书发布需要在服务器上运行 MCP 服务，请使用本地版本或联系管理员配置'
      });
      
    } else {
      res.status(404).json({ error: 'Unknown endpoint' });
    }
    
  } catch (error) {
    console.error('[Proxy Error]', error);
    res.status(500).json({ error: error.message });
  }
}
