// api/info.js - Vercel Serverless Function
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
        const { url, videoId } = req.query;
        
        if (!url && !videoId) {
            return res.status(400).json({ 
                success: false, 
                error: 'กรุณาใส่ URL หรือ Video ID' 
            });
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
            return res.status(400).json({ 
                success: false, 
                error: 'URL ไม่ถูกต้อง' 
            });
        }

        console.log('Getting info for:', youtubeUrl);

        // ดึงข้อมูลวิดีโอ
        const info = await ytdl.getInfo(youtubeUrl);
        const videoDetails = info.videoDetails;

        // กรองรูปแบบที่มี
        const availableFormats = info.formats
            .filter(format => format.hasVideo || format.hasAudio)
            .map(format => ({
                itag: format.itag,
                quality: format.qualityLabel || format.audioQuality || 'unknown',
                container: format.container,
                hasVideo: format.hasVideo,
                hasAudio: format.hasAudio,
                filesize: format.contentLength ? parseInt(format.contentLength) : null,
                fps: format.fps,
                bitrate: format.bitrate,
                mimeType: format.mimeType
            }))
            .sort((a, b) => {
                // เรียงตามคุณภาพ
                const qualityOrder = {
                    '2160p': 4000, '1440p': 3000, '1080p': 2000, 
                    '720p': 1000, '480p': 500, '360p': 300, '240p': 200, '144p': 100
                };
                return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
            });

        // ข้อมูลที่ส่งกลับ
        const responseData = {
            success: true,
            data: {
                videoId: videoDetails.videoId,
                title: videoDetails.title,
                author: videoDetails.author.name,
                channelId: videoDetails.author.id,
                lengthSeconds: parseInt(videoDetails.lengthSeconds),
                viewCount: parseInt(videoDetails.viewCount),
                description: videoDetails.description,
                uploadDate: videoDetails.uploadDate,
                thumbnails: videoDetails.thumbnails,
                formats: availableFormats,
                // ข้อมูลเพิ่มเติม
                keywords: videoDetails.keywords,
                category: videoDetails.category,
                isLiveContent: videoDetails.isLiveContent,
                availableQualities: [...new Set(availableFormats
                    .filter(f => f.hasVideo && f.quality !== 'unknown')
                    .map(f => f.quality)
                )],
                availableAudioQualities: [...new Set(availableFormats
                    .filter(f => f.hasAudio && !f.hasVideo)
                    .map(f => f.quality)
                )]
            }
        };

        res.status(200).json(responseData);

    } catch (error) {
        console.error('Error getting video info:', error);
        
        // ส่ง error message ที่เข้าใจง่าย
        let errorMessage = 'ไม่สามารถดึงข้อมูลวิดีโอได้';
        
        if (error.message.includes('Video unavailable')) {
            errorMessage = 'วิดีโอไม่สามารถเข้าถึงได้ หรืออาจถูกลบแล้ว';
        } else if (error.message.includes('Private video')) {
            errorMessage = 'วิดีโอเป็นแบบส่วนตัว ไม่สามารถเข้าถึงได้';
        } else if (error.message.includes('Age-restricted')) {
            errorMessage = 'วิดีโอมีการจำกัดอายุ ไม่สามารถดาวน์โหลดได้';
        }

        res.status(500).json({ 
            success: false, 
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}