// Kie.ai API 客户端 - 支持图生图

const KIE_API_BASE = 'https://api.kie.ai';
const KIE_UPLOAD_BASE = 'https://kieai.redpandaai.co';

class KieAIClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    // 上传参考图片
    async uploadReferenceImage(base64Data, fileName = 'reference.jpg') {
        const response = await fetch(`${KIE_UPLOAD_BASE}/api/file-base64-upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                base64Data: base64Data,
                uploadPath: 'references',
                fileName: fileName
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`上传失败: ${error.msg || error.message}`);
        }

        const result = await response.json();
        return result.data.fileUrl; // 返回上传后的图片URL
    }

    // 提交图生图任务
    async submitImageGeneration(prompt, imageUrl = null, options = {}) {
        const payload = {
            model: options.model || 'gpt-image-1',
            prompt: prompt,
            instrumental: true,
            customMode: false,
            callBackUrl: options.callbackUrl || 'http://localhost:8080/webhook'
        };

        // 如果有参考图片，添加到 payload
        if (imageUrl) {
            payload.imageUrl = imageUrl;
            payload.mode = 'image-to-image';
        }

        const response = await fetch(`${KIE_API_BASE}/api/v1/generate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`提交失败: ${error.msg || error.message}`);
        }

        return await response.json();
    }

    // 查询任务状态
    async queryTask(taskId) {
        const response = await fetch(`${KIE_API_BASE}/api/v1/records/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`查询失败: ${error.msg || error.message}`);
        }

        return await response.json();
    }

    // 轮询等待任务完成
    async waitForCompletion(taskId, maxRetries = 60, interval = 5000) {
        for (let i = 0; i < maxRetries; i++) {
            const result = await this.queryTask(taskId);
            
            if (result.code === 200 && result.data) {
                const status = result.data.status;
                
                if (status === 'completed') {
                    return result.data;
                } else if (status === 'failed') {
                    throw new Error(`任务失败: ${result.data.error || '未知错误'}`);
                }
            }
            
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        
        throw new Error('任务超时');
    }

    // 完整的图生图流程
    async generateImageWithReference(prompt, referenceBase64, options = {}) {
        // 1. 上传参考图片
        console.log('📤 上传参考图片...');
        const imageUrl = await this.uploadReferenceImage(referenceBase64);
        console.log('✅ 参考图片已上传:', imageUrl);

        // 2. 提交生成任务
        console.log('🎨 提交生成任务...');
        const submitResult = await this.submitImageGeneration(prompt, imageUrl, options);
        
        if (submitResult.code !== 200) {
            throw new Error(`提交失败: ${submitResult.msg}`);
        }

        const taskId = submitResult.data.taskId;
        console.log('⏳ 任务已提交, ID:', taskId);

        // 3. 轮询等待结果
        console.log('🔄 等待生成完成...');
        const finalResult = await this.waitForCompletion(taskId);
        
        return {
            taskId: taskId,
            imageUrl: finalResult.output,
            status: finalResult.status
        };
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KieAIClient;
}
