// api/download.js - Vercel Serverless Function
const ytdl = require('ytdl-core');

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { url, videoId, quality, format, type } = req.query;
        
        if (!url && !videoId) {
            return res.status(400).json({ error: 'กรุณาใส่ URL หรือ Video ID' });
        }

        // สร้าง YouTube URL
        let youtubeUrl;
        if (videoId) {
            youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        } else {
            youtubeUrl = url;
        }

        // ตรวจสอบ URL
        if (!ytdl.validateURL(youtubeUrl)) {
            return res.status(400).json({ error: 'URL ไม่ถูกต้อง' });
        }

        console.log('Downloading:', youtubeUrl, 'Quality:', quality, 'Format:', format, 'Type:', type);

        // ดึงข้อมูลวิดีโอ
        const info = await ytdl.getInfo(youtubeUrl);
        const videoDetails = info.videoDetails;

        // สร้างชื่อไฟล์ (ลบอักขระพิเศษ)
        const cleanTitle = videoDetails.title
            .replace(/[^\w\s-]/gi, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);

        let filename, contentType, ytdlOptions;

        // กำหนดตัวเลือกตามประเภทที่เลือก
        if (type === 'audio' || quality === 'audio') {
            // ดาวน์โหลดเฉพาะเสียง
            const audioFormat = format || 'mp3';
            filename = `${cleanTitle}_audio.${audioFormat}`;
            contentType = getContentType(audioFormat);
            
            ytdlOptions = {
                filter: 'audioonly',
                quality: 'highestaudio',
                format: audioFormat === 'mp3' ? 'mp3' : 'm4a'
            };
        } else {
            // ดาวน์โหลดวิดีโอ
            const videoFormat = format || 'mp4';
            const qualityLabel = quality || 'highest';
            filename = `${cleanTitle}_${qualityLabel}.${videoFormat}`;
            contentType = getContentType(videoFormat);

            if (qualityLabel === 'highest' || qualityLabel === 'lowest') {
                ytdlOptions = {
                    quality: qualityLabel,
                    format: videoFormat
                };
            } else {
                // เลือกคุณภาพเฉพาะ (เช่น 720p, 1080p)
                ytdlOptions = {
                    filter: (format) => {
                        return format.container === videoFormat && 
                               format.qualityLabel && 
                               format.qualityLabel.includes(qualityLabel);
                    },
                    quality: 'highest'
                };
            }
        }

        // ตั้งค่า headers สำหรับดาวน์โหลด
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Transfer-Encoding', 'chunked');

        // สร้าง stream สำหรับดาวน์โหลด
        const stream = ytdl(youtubeUrl, ytdlOptions);

        // จัดการ error
        stream.on('error', (error) => {
            console.error('Stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: 'เกิดข้อผิดพลาดในการดาวน์โหลด',
                    details: error.message 
                });
            }
        });

        // ส่งข้อมูลไปยัง client
        stream.on('info', (info, format) => {
            console.log(`Downloading: ${info.videoDetails.title}`);
            console.log(`Format: ${format.qualityLabel || format.audioQuality} ${format.container}`);
            console.log(`Size: ${format.contentLength ? (format.contentLength / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);
        });

        // Pipe stream ไปยัง response
        stream.pipe(res);

        // จัดการเมื่อเสร็จสิ้น
        stream.on('end', () => {
            console.log('Download completed');
        });

    } catch (error) {
        console.error('Download error:', error);
        
        let errorMessage = 'ไม่สามารถดาวน์โหลดได้';
        
        if (error.message.includes('No such format found')) {
            errorMessage = 'ไม่พบรูปแบบที่เลือก กรุณาเลือกคุณภาพอื่น';
        } else if (error.message.includes('Video unavailable')) {
            errorMessage = 'วิดีโอไม่สามารถเข้าถึงได้';
        }

        if (!res.headersSent) {
            res.status(500).json({ 
                error: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

// Helper function: กำหนด Content-Type
function getContentType(format) {
    const types = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mkv': 'video/x-matroska',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'mp3': 'audio/mpeg',
        'm4a': 'audio/mp4',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'aac': 'audio/aac'
    };
    return types[format] || 'application/octet-stream';
}